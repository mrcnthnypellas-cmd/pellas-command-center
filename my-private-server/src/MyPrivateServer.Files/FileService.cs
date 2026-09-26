using System.IO.Compression;
using System.Text.Json;
using Dapper;
using MyPrivateServer.Core;
using MyPrivateServer.Identity;
using MyPrivateServer.Storage;

namespace MyPrivateServer.Files;

public sealed record FileEntry(string Name, string Path, bool IsDirectory, long Size, DateTimeOffset Modified, AccessLevel Access, string? Owner = null);

public sealed record FolderListing(string Path, string Name, AccessLevel Access, IReadOnlyList<FileEntry> Entries, IReadOnlyList<Crumb> Breadcrumbs);
public sealed record Crumb(string Name, string Path);

public sealed record RecycleItem(string Id, string Name, bool IsDirectory, long Size, string OriginalPath, string DeletedBy, DateTimeOffset DeletedAt);

public sealed record UploadSession(string Id, string VirtualDir, string FileName, long Size, long Received, DateTimeOffset CreatedAt);

/// <summary>
/// Browser file manager over the storage drive. Every call resolves a virtual path for a specific user and checks
/// access before touching the disk:
///   /home/...                → the user's own folder (Users\name)
///   /shared/&lt;share&gt;/...    → a shared folder, governed by its access rules
///   /users/&lt;name&gt;/...      → any user's folder (administrators only)
/// </summary>
public sealed class FileService(StorageService storage, ShareService shares, UserService users, SystemDb db, IAuditLog audit)
{
    public const long MaxChunkBytes = 64L * 1024 * 1024;

    enum Area { Root, Home, SharedRoot, Share, UsersRoot, UserHome }

    sealed record Location(Area Area, string[] Segments, string? FullPath, AccessLevel Access, string? ShareName, string RelPath, IReadOnlyList<AclEntry>? Acl, string? HomeOwner)
    {
        public string Virtual => SafePath.Join(Segments);
    }

    Location Resolve(User u, string? virtualPath)
    {
        var seg = SafePath.Segments(virtualPath);
        var isAdmin = u.Role == Role.Administrator;
        var homeLevel = ShareService.Cap(u, AccessLevel.Full);
        if (seg.Length == 0) return new(Area.Root, seg, null, AccessLevel.Read, null, "", null, null);
        switch (seg[0].ToLowerInvariant())
        {
            case "home":
            {
                var home = EnsureHome(u.Username);
                return new(Area.Home, seg, SafePath.Combine(home, seg[1..]), homeLevel, null, string.Join('/', seg[1..]), null, u.Username);
            }
            case "shared":
            {
                if (seg.Length == 1) return new(Area.SharedRoot, seg, storage.PathFor("Shared"), AccessLevel.Read, null, "", null, null);
                var share = shares.Find(seg[1]) ?? throw new NotFoundException("Shared folder not found.");
                var rel = string.Join('/', seg[2..]);
                var level = ShareService.Evaluate(share.Acl, u, rel);
                if (level == AccessLevel.None && !ShareService.CanTraverse(share.Acl, u, rel)) throw new NotFoundException("Folder not found.");
                return new(Area.Share, seg, SafePath.Combine(storage.PathFor("Shared"), [share.Name, .. seg[2..]]), level, share.Name, rel, share.Acl, null);
            }
            case "users" when isAdmin:
            {
                if (seg.Length == 1) return new(Area.UsersRoot, seg, storage.PathFor("Users"), AccessLevel.Read, null, "", null, null);
                var owner = users.FindByUsername(seg[1]) ?? throw new NotFoundException("User not found.");
                return new(Area.UserHome, seg, SafePath.Combine(EnsureHome(owner.Username), seg[2..]), AccessLevel.Full, null, string.Join('/', seg[2..]), null, owner.Username);
            }
            default: throw new NotFoundException("Folder not found.");
        }
    }

    string EnsureHome(string username)
    {
        var p = SafePath.Combine(storage.PathFor("Users"), [username]);
        Directory.CreateDirectory(p);
        return p;
    }

    AccessLevel ChildAccess(User u, Location parent, string childName, out bool visible)
    {
        visible = true;
        if (parent.Area is Area.Share && parent.Acl is not null)
        {
            var rel = parent.RelPath.Length == 0 ? childName : parent.RelPath + "/" + childName;
            var lv = ShareService.Evaluate(parent.Acl, u, rel);
            visible = lv > AccessLevel.None || ShareService.CanTraverse(parent.Acl, u, rel);
            return lv;
        }
        return parent.Access;
    }

    static bool IsTopLevel(Location l) => l.Segments.Length <= (l.Area is Area.Share or Area.UserHome ? 2 : 1);

    static void Require(Location l, AccessLevel needed, string action)
    {
        if (l.FullPath is null || l.Area is Area.Root or Area.SharedRoot or Area.UsersRoot)
            throw new ForbiddenException($"You cannot {action} here. Open your home folder or a shared folder first.");
        if (l.Access < needed) throw new ForbiddenException($"You do not have permission to {action} in this folder.");
    }

    // ---------------- browsing ----------------

    public FolderListing List(User u, string? path)
    {
        var loc = Resolve(u, path);
        var entries = new List<FileEntry>();
        switch (loc.Area)
        {
            case Area.Root:
                entries.Add(Virtual("home", "/home", ShareService.Cap(u, AccessLevel.Full)));
                entries.Add(Virtual("shared", "/shared", AccessLevel.Read));
                if (u.Role == Role.Administrator) entries.Add(Virtual("users", "/users", AccessLevel.Full));
                break;
            case Area.SharedRoot:
                foreach (var s in shares.List())
                {
                    var lv = ShareService.Evaluate(s.Acl, u, "");
                    if (lv == AccessLevel.None && !ShareService.CanTraverse(s.Acl, u, "")) continue;
                    var dir = new DirectoryInfo(SafePath.Combine(storage.PathFor("Shared"), [s.Name]));
                    entries.Add(new FileEntry(s.Name, "/shared/" + s.Name, true, 0, dir.Exists ? dir.LastWriteTimeUtc : s.CreatedAt, lv));
                }
                break;
            case Area.UsersRoot:
                foreach (var x in users.List())
                    entries.Add(new FileEntry(x.Username, "/users/" + x.Username, true, 0, x.CreatedAt, AccessLevel.Full, x.Username));
                break;
            default:
                var dirInfo = new DirectoryInfo(loc.FullPath!);
                if (!dirInfo.Exists) throw new NotFoundException(File.Exists(loc.FullPath) ? "That is a file, not a folder." : "Folder not found.");
                foreach (var fsi in dirInfo.EnumerateFileSystemInfos("*", new EnumerationOptions { IgnoreInaccessible = true, AttributesToSkip = FileAttributes.System | FileAttributes.ReparsePoint }))
                {
                    var access = ChildAccess(u, loc, fsi.Name, out var visible);
                    if (!visible) continue;
                    var isDir = fsi is DirectoryInfo;
                    entries.Add(new FileEntry(fsi.Name, loc.Virtual.TrimEnd('/') + "/" + fsi.Name, isDir, isDir ? 0 : ((FileInfo)fsi).Length, fsi.LastWriteTimeUtc, access));
                }
                break;
        }
        var crumbs = new List<Crumb> { new("Home", "/") };
        for (var i = 0; i < loc.Segments.Length; i++) crumbs.Add(new Crumb(loc.Segments[i], SafePath.Join(loc.Segments[..(i + 1)])));
        return new FolderListing(loc.Virtual, loc.Segments.LastOrDefault() ?? "Home", loc.Access, entries, crumbs);
    }

    static FileEntry Virtual(string name, string path, AccessLevel lv) => new(name, path, true, 0, DateTimeOffset.UtcNow, lv);

    public IReadOnlyList<FileEntry> Search(User u, string? path, string query, int limit = 200)
    {
        query = (query ?? "").Trim();
        if (query.Length < 2) throw new UserFacingException("Type at least 2 characters to search.");
        var results = new List<FileEntry>();
        var queue = new Queue<string>();
        queue.Enqueue(string.IsNullOrEmpty(path) ? "/" : path);
        var visited = 0;
        while (queue.Count > 0 && results.Count < limit && visited < 20_000)
        {
            FolderListing listing;
            try { listing = List(u, queue.Dequeue()); } catch (UserFacingException) { continue; }
            foreach (var e in listing.Entries)
            {
                visited++;
                if (e.Name.Contains(query, StringComparison.OrdinalIgnoreCase) && e.Access > AccessLevel.None && listing.Path != "/") results.Add(e);
                if (e.IsDirectory) queue.Enqueue(e.Path);
                if (results.Count >= limit) break;
            }
        }
        return results;
    }

    // ---------------- changes ----------------

    public FileEntry CreateFolder(User u, string parentPath, string name)
    {
        var loc = Resolve(u, parentPath);
        Require(loc, AccessLevel.ReadWrite, "create folders");
        name = SafePath.ValidateName(name);
        var full = SafePath.Combine(loc.FullPath!, [name]);
        if (Directory.Exists(full) || File.Exists(full)) throw new ConflictException("Something with that name already exists here.");
        Directory.CreateDirectory(full);
        audit.Write(u.Username, "file", "Folder created", loc.Virtual.TrimEnd('/') + "/" + name, null, AuditSeverity.Success);
        return new FileEntry(name, loc.Virtual.TrimEnd('/') + "/" + name, true, 0, DateTimeOffset.UtcNow, loc.Access);
    }

    public void Rename(User u, string path, string newName)
    {
        var loc = Resolve(u, path);
        Require(loc, AccessLevel.ReadWrite, "rename items");
        if (IsTopLevel(loc)) throw new ForbiddenException("This folder cannot be renamed here.");
        newName = SafePath.ValidateName(newName);
        var parentDir = Path.GetDirectoryName(loc.FullPath!)!;
        var target = SafePath.Combine(parentDir, [newName]);
        if (string.Equals(target, loc.FullPath, StringComparison.Ordinal)) return;
        if ((File.Exists(target) || Directory.Exists(target)) && !string.Equals(target, loc.FullPath, StringComparison.OrdinalIgnoreCase))
            throw new ConflictException("Something with that name already exists here.");
        if (Directory.Exists(loc.FullPath)) Directory.Move(loc.FullPath!, target);
        else if (File.Exists(loc.FullPath)) File.Move(loc.FullPath!, target);
        else throw new NotFoundException("Item not found.");
        audit.Write(u.Username, "file", "Renamed", loc.Virtual, $"→ {newName}");
    }

    public void MoveOrCopy(User u, IEnumerable<string> sources, string destinationFolder, bool copy)
    {
        var dest = Resolve(u, destinationFolder);
        Require(dest, AccessLevel.ReadWrite, copy ? "copy items" : "move items");
        if (!Directory.Exists(dest.FullPath)) throw new NotFoundException("Destination folder not found.");
        foreach (var src in sources)
        {
            var loc = Resolve(u, src);
            Require(loc, copy ? AccessLevel.Read : AccessLevel.ReadWrite, copy ? "copy items" : "move items");
            if (IsTopLevel(loc)) throw new ForbiddenException("Top-level folders cannot be moved.");
            var isDir = Directory.Exists(loc.FullPath);
            if (!isDir && !File.Exists(loc.FullPath)) throw new NotFoundException($"“{loc.Segments[^1]}” no longer exists.");
            if (isDir && (dest.FullPath! + Path.DirectorySeparatorChar).StartsWith(loc.FullPath! + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new UserFacingException("A folder cannot be moved or copied into itself.");
            if (dest.HomeOwner is { } owner && loc.HomeOwner != owner) CheckQuota(owner, isDir ? DirSize(loc.FullPath!) : new FileInfo(loc.FullPath!).Length);
            var name = SafePath.FreeName(dest.FullPath!, Path.GetFileName(loc.FullPath!));
            var target = Path.Combine(dest.FullPath!, name);
            if (copy) { if (isDir) CopyDirectory(loc.FullPath!, target); else File.Copy(loc.FullPath!, target); }
            else { if (isDir) Directory.Move(loc.FullPath!, target); else File.Move(loc.FullPath!, target); }
            audit.Write(u.Username, "file", copy ? "Copied" : "Moved", loc.Virtual, $"→ {dest.Virtual}/{name}");
        }
    }

    static void CopyDirectory(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var f in Directory.EnumerateFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)));
        foreach (var d in Directory.EnumerateDirectories(from))
            if ((File.GetAttributes(d) & FileAttributes.ReparsePoint) == 0) CopyDirectory(d, Path.Combine(to, Path.GetFileName(d)));
    }

    // ---------------- recycle bin ----------------

    string RecycleRoot => storage.SystemPath("RecycleBin");

    public void Delete(User u, IEnumerable<string> paths)
    {
        foreach (var p in paths)
        {
            var loc = Resolve(u, p);
            Require(loc, AccessLevel.ReadWrite, "delete items");
            if (IsTopLevel(loc)) throw new ForbiddenException("Top-level folders cannot be deleted here.");
            var isDir = Directory.Exists(loc.FullPath);
            if (!isDir && !File.Exists(loc.FullPath)) continue;
            var id = Guid.NewGuid().ToString("N");
            var bin = Path.Combine(RecycleRoot, id);
            Directory.CreateDirectory(bin);
            var size = isDir ? DirSize(loc.FullPath!) : new FileInfo(loc.FullPath!).Length;
            var item = Path.Combine(bin, "item");
            if (isDir) Directory.Move(loc.FullPath!, item); else File.Move(loc.FullPath!, item);
            File.WriteAllText(Path.Combine(bin, "meta.json"), JsonSerializer.Serialize(new RecycleMeta(loc.Segments[^1], isDir, size, loc.Virtual, u.Username, DateTimeOffset.UtcNow)));
            audit.Write(u.Username, "file", isDir ? "Folder deleted" : "File deleted", loc.Virtual, "Moved to recycle bin", AuditSeverity.Warning);
        }
    }

    sealed record RecycleMeta(string Name, bool IsDirectory, long Size, string OriginalPath, string DeletedBy, DateTimeOffset DeletedAt);

    public IReadOnlyList<RecycleItem> RecycleBin(User u)
    {
        if (!Directory.Exists(RecycleRoot)) return [];
        var list = new List<RecycleItem>();
        foreach (var d in Directory.EnumerateDirectories(RecycleRoot))
        {
            var metaFile = Path.Combine(d, "meta.json");
            if (!File.Exists(metaFile)) continue;
            var m = JsonSerializer.Deserialize<RecycleMeta>(File.ReadAllText(metaFile))!;
            if (u.Role != Role.Administrator && m.DeletedBy != u.Username) continue;
            list.Add(new RecycleItem(Path.GetFileName(d), m.Name, m.IsDirectory, m.Size, m.OriginalPath, m.DeletedBy, m.DeletedAt));
        }
        return list.OrderByDescending(x => x.DeletedAt).ToList();
    }

    RecycleItem GetRecycled(User u, string id)
    {
        if (id.Length != 32 || !id.All(Uri.IsHexDigit)) throw new NotFoundException("Item not found.");
        return RecycleBin(u).FirstOrDefault(x => x.Id == id) ?? throw new NotFoundException("Item not found.");
    }

    public string Restore(User u, string id)
    {
        var item = GetRecycled(u, id);
        var parentPath = SafePath.Join(SafePath.Segments(item.OriginalPath)[..^1]);
        var parent = Resolve(u, parentPath);
        Require(parent, AccessLevel.ReadWrite, "restore items");
        Directory.CreateDirectory(parent.FullPath!);
        var name = SafePath.FreeName(parent.FullPath!, item.Name);
        var src = Path.Combine(RecycleRoot, id, "item");
        var target = Path.Combine(parent.FullPath!, name);
        if (item.IsDirectory) Directory.Move(src, target); else File.Move(src, target);
        Directory.Delete(Path.Combine(RecycleRoot, id), true);
        audit.Write(u.Username, "file", "Restored from recycle bin", parent.Virtual.TrimEnd('/') + "/" + name, null, AuditSeverity.Success);
        return parent.Virtual.TrimEnd('/') + "/" + name;
    }

    public void Purge(User u, string? id)
    {
        var items = id is null ? RecycleBin(u) : [GetRecycled(u, id)];
        foreach (var i in items) Directory.Delete(Path.Combine(RecycleRoot, i.Id), true);
        audit.Write(u.Username, "file", id is null ? "Recycle bin emptied" : "Permanently deleted", id is null ? $"{items.Count} item(s)" : items[0].OriginalPath, null, AuditSeverity.Warning);
    }

    /// <summary>Removes recycle bin items older than the retention period.</summary>
    public int PurgeOlderThan(TimeSpan age)
    {
        if (!Directory.Exists(RecycleRoot)) return 0;
        var n = 0;
        foreach (var d in Directory.EnumerateDirectories(RecycleRoot))
        {
            var metaFile = Path.Combine(d, "meta.json");
            if (File.Exists(metaFile) && JsonSerializer.Deserialize<RecycleMeta>(File.ReadAllText(metaFile))!.DeletedAt < DateTimeOffset.UtcNow - age)
            { Directory.Delete(d, true); n++; }
        }
        return n;
    }

    // ---------------- downloads ----------------

    public (string FullPath, string Name, long Size) OpenFile(User u, string path)
    {
        var loc = Resolve(u, path);
        Require(loc, AccessLevel.Read, "download files");
        if (!File.Exists(loc.FullPath)) throw new NotFoundException("File not found.");
        return (loc.FullPath!, loc.Segments[^1], new FileInfo(loc.FullPath!).Length);
    }

    /// <summary>Streams a folder as a ZIP. Only items the user can read are included.</summary>
    public async Task WriteZipAsync(User u, string path, Stream output, CancellationToken ct)
    {
        var root = List(u, path);
        if (root.Access < AccessLevel.Read) throw new ForbiddenException();
        using var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
        async Task Add(string virtualDir, string prefix)
        {
            foreach (var e in List(u, virtualDir).Entries)
            {
                ct.ThrowIfCancellationRequested();
                if (e.IsDirectory) { await Add(e.Path, prefix + e.Name + "/"); continue; }
                if (e.Access < AccessLevel.Read) continue;
                var (full, _, _) = OpenFile(u, e.Path);
                var entry = zip.CreateEntry(prefix + e.Name, CompressionLevel.Fastest);
                await using var es = await entry.OpenAsync(ct);
                await using var fs = File.OpenRead(full);
                await fs.CopyToAsync(es, ct);
            }
        }
        await Add(path, "");
        audit.Write(u.Username, "file", "Folder downloaded", path, "ZIP");
    }

    // ---------------- resumable uploads ----------------

    public UploadSession StartUpload(User u, string folder, string fileName, long size)
    {
        var loc = Resolve(u, folder);
        Require(loc, AccessLevel.ReadWrite, "upload files");
        fileName = SafePath.ValidateName(fileName);
        if (size < 0) throw new UserFacingException("Invalid file size.");
        if (loc.HomeOwner is { } owner) CheckQuota(owner, size);
        EnsureFreeSpace(size);
        var s = new UploadSession(Guid.NewGuid().ToString("N"), loc.Virtual, fileName, size, 0, DateTimeOffset.UtcNow);
        using var c = db.Open();
        c.Execute("INSERT INTO uploads(id,user_id,virtual_dir,file_name,size,received,created_at) VALUES (@Id,@uid,@VirtualDir,@FileName,@Size,0,@t)",
            new { s.Id, uid = u.Id, s.VirtualDir, s.FileName, s.Size, t = s.CreatedAt.ToString("O") });
        File.Create(PartPath(s.Id)).Dispose();
        return s;
    }

    string PartPath(string id) => Path.Combine(storage.SystemPath("Uploads"), id + ".part");

    public UploadSession GetUpload(User u, string id)
    {
        using var c = db.Open();
        var r = c.QuerySingleOrDefault("SELECT * FROM uploads WHERE id=@id AND user_id=@uid", new { id, uid = u.Id })
                ?? throw new NotFoundException("Upload not found or expired. Start the upload again.");
        return new UploadSession((string)r.id, (string)r.virtual_dir, (string)r.file_name, (long)r.size, (long)r.received, DateTimeOffset.Parse((string)r.created_at));
    }

    /// <summary>Appends a chunk at the given offset. A mismatched offset returns the server's offset so the client can resume.</summary>
    public async Task<(UploadSession Session, FileEntry? Completed)> AppendChunkAsync(User u, string id, long offset, Stream body, CancellationToken ct)
    {
        var s = GetUpload(u, id);
        if (offset != s.Received) throw new UploadOffsetMismatchException(s.Received);
        long written;
        await using (var fs = new FileStream(PartPath(id), FileMode.Open, FileAccess.Write, FileShare.None))
        {
            fs.Seek(offset, SeekOrigin.Begin);
            var buffer = new byte[81920];
            written = 0;
            int n;
            while ((n = await body.ReadAsync(buffer, ct)) > 0)
            {
                written += n;
                if (written > MaxChunkBytes || offset + written > s.Size) throw new UserFacingException("Chunk is larger than expected.", 413);
                await fs.WriteAsync(buffer.AsMemory(0, n), ct);
            }
        }
        var received = offset + written;
        using (var c = db.Open()) c.Execute("UPDATE uploads SET received=@received WHERE id=@id", new { received, id });
        s = s with { Received = received };
        return received == s.Size ? (s, Finish(u, s)) : (s, null);
    }

    FileEntry Finish(User u, UploadSession s)
    {
        var loc = Resolve(u, s.VirtualDir);
        Require(loc, AccessLevel.ReadWrite, "upload files");
        if (loc.HomeOwner is { } owner) CheckQuota(owner, s.Size);
        var name = SafePath.FreeName(loc.FullPath!, s.FileName);
        File.Move(PartPath(s.Id), Path.Combine(loc.FullPath!, name));
        using (var c = db.Open()) c.Execute("DELETE FROM uploads WHERE id=@id", new { s.Id });
        audit.Write(u.Username, "file", "File uploaded", loc.Virtual.TrimEnd('/') + "/" + name, FormatBytes(s.Size), AuditSeverity.Success);
        return new FileEntry(name, loc.Virtual.TrimEnd('/') + "/" + name, false, s.Size, DateTimeOffset.UtcNow, loc.Access);
    }

    public void CancelUpload(User u, string id)
    {
        GetUpload(u, id);
        File.Delete(PartPath(id));
        using var c = db.Open(); c.Execute("DELETE FROM uploads WHERE id=@id", new { id });
    }

    public int CleanupStaleUploads(TimeSpan age)
    {
        using var c = db.Open();
        var stale = c.Query<string>("SELECT id FROM uploads WHERE created_at < @cut", new { cut = (DateTimeOffset.UtcNow - age).ToString("O") }).ToList();
        foreach (var id in stale) { try { File.Delete(PartPath(id)); } catch { } c.Execute("DELETE FROM uploads WHERE id=@id", new { id }); }
        return stale.Count;
    }

    // ---------------- quota & space ----------------

    public long HomeUsage(string username)
    {
        var p = SafePath.Combine(storage.PathFor("Users"), [username]);
        return Directory.Exists(p) ? DirSize(p) : 0;
    }

    void CheckQuota(string username, long incoming)
    {
        var owner = users.FindByUsername(username);
        if (owner is null || owner.QuotaBytes <= 0) return;
        var used = HomeUsage(username);
        if (used + incoming > owner.QuotaBytes)
            throw new UserFacingException($"Storage quota exceeded: {FormatBytes(used)} of {FormatBytes(owner.QuotaBytes)} used.", 413);
    }

    void EnsureFreeSpace(long incoming)
    {
        var st = storage.Status();
        if (!st.Online) throw new UserFacingException(st.Problem ?? "Storage is offline.", 503);
        if (incoming > st.FreeBytes - 512L * 1024 * 1024) throw new UserFacingException("Not enough free space on the storage drive.", 507);
    }

    static long DirSize(string path) =>
        new DirectoryInfo(path).EnumerateFiles("*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }).Sum(f => f.Length);

    public static string FormatBytes(long b)
    {
        string[] u = ["B", "KB", "MB", "GB", "TB"]; double v = b; var i = 0;
        while (v >= 1000 && i < u.Length - 1) { v /= 1000; i++; }
        return $"{(i == 0 ? v : Math.Round(v, v >= 100 ? 0 : 1))} {u[i]}";
    }
}

public sealed class UploadOffsetMismatchException(long serverOffset) : UserFacingException($"Upload offset mismatch; resume from byte {serverOffset}.", 409)
{
    public long ServerOffset { get; } = serverOffset;
}
