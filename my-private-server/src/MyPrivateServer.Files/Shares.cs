using Dapper;
using MyPrivateServer.Core;
using MyPrivateServer.Identity;
using MyPrivateServer.Storage;

namespace MyPrivateServer.Files;

public enum AccessLevel { None = 0, Read = 1, ReadWrite = 2, Full = 3 }
public enum PrincipalType { User, Role, Everyone }

/// <summary>
/// One access rule. SubPath "" applies to the whole share; "Payroll/2026" narrows it to a folder.
/// The most specific matching folder wins; for the same folder a user rule beats a role rule, which beats Everyone.
/// This lets an admin give a user access to only selected folders, or hide one folder from someone.
/// </summary>
public sealed record AclEntry(PrincipalType PrincipalType, string Principal, string SubPath, AccessLevel Level);

public sealed record ShareInfo(string Name, string? Description, DateTimeOffset CreatedAt, IReadOnlyList<AclEntry> Acl);

public sealed class FilesSchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS shares (name TEXT PRIMARY KEY COLLATE NOCASE, description TEXT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS share_acl (
          share TEXT NOT NULL COLLATE NOCASE REFERENCES shares(name) ON DELETE CASCADE,
          principal_type TEXT NOT NULL, principal TEXT NOT NULL, sub_path TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL,
          PRIMARY KEY (share, principal_type, principal, sub_path));
        CREATE TABLE IF NOT EXISTS uploads (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, virtual_dir TEXT NOT NULL, file_name TEXT NOT NULL,
          size INTEGER NOT NULL, received INTEGER NOT NULL, created_at TEXT NOT NULL);
        """;
}

public sealed class ShareService(SystemDb db, StorageService storage, IAuditLog audit)
{
    public IReadOnlyList<ShareInfo> List()
    {
        using var c = db.Open();
        var acl = c.Query<AclRow>("SELECT * FROM share_acl").ToLookup(r => r.share, r => r.ToEntry(), StringComparer.OrdinalIgnoreCase);
        return c.Query("SELECT * FROM shares ORDER BY name")
            .Select(r => new ShareInfo((string)r.name, (string?)r.description, DateTimeOffset.Parse((string)r.created_at), acl[(string)r.name].ToList()))
            .ToList();
    }

    public ShareInfo? Find(string name) => List().FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    public ShareInfo Create(string name, string? description, string actor, IEnumerable<AclEntry>? acl = null)
    {
        name = SafePath.ValidateName(name);
        if (Find(name) is not null) throw new ConflictException("A shared folder with that name already exists.");
        Directory.CreateDirectory(SafePath.Combine(storage.PathFor("Shared"), [name]));
        using (var c = db.Open())
            c.Execute("INSERT INTO shares(name, description, created_at) VALUES (@name, @description, @t)", new { name, description, t = DateTimeOffset.UtcNow.ToString("O") });
        if (acl is not null) SetAcl(name, acl, actor);
        audit.Write(actor, "files", "Shared folder created", name, null, AuditSeverity.Success);
        return Find(name)!;
    }

    /// <summary>Registers folders that already exist under Shared (e.g. copied in by hand) so they can be permissioned.</summary>
    public void ImportExisting()
    {
        var dir = storage.PathFor("Shared");
        if (!Directory.Exists(dir)) return;
        using var c = db.Open();
        foreach (var d in Directory.EnumerateDirectories(dir))
            c.Execute("INSERT OR IGNORE INTO shares(name, description, created_at) VALUES (@n, NULL, @t)", new { n = Path.GetFileName(d), t = DateTimeOffset.UtcNow.ToString("O") });
    }

    public void SetAcl(string share, IEnumerable<AclEntry> entries, string actor)
    {
        var s = Find(share) ?? throw new NotFoundException("Shared folder not found.");
        var list = entries.Select(e => e with { SubPath = NormalizeSub(e.SubPath) }).ToList();
        using var c = db.Open();
        using var tx = c.BeginTransaction();
        c.Execute("DELETE FROM share_acl WHERE share=@share", new { share = s.Name }, tx);
        foreach (var e in list)
            c.Execute("INSERT OR REPLACE INTO share_acl(share, principal_type, principal, sub_path, level) VALUES (@share,@pt,@p,@sp,@lv)",
                new { share = s.Name, pt = e.PrincipalType.ToString(), p = e.Principal, sp = e.SubPath, lv = (int)e.Level }, tx);
        tx.Commit();
        audit.Write(actor, "permissions", "Folder permissions changed", s.Name, $"{list.Count} rule(s)", AuditSeverity.Info);
    }

    public void Delete(string share, string actor)
    {
        var s = Find(share) ?? throw new NotFoundException("Shared folder not found.");
        var dir = SafePath.Combine(storage.PathFor("Shared"), [s.Name]);
        if (Directory.Exists(dir) && Directory.EnumerateFileSystemEntries(dir).Any())
            throw new UserFacingException("The shared folder is not empty. Move or delete its contents first.");
        if (Directory.Exists(dir)) Directory.Delete(dir);
        using var c = db.Open();
        c.Execute("DELETE FROM shares WHERE name=@n", new { n = s.Name });
        audit.Write(actor, "files", "Shared folder deleted", s.Name, null, AuditSeverity.Warning);
    }

    static string NormalizeSub(string? sub)
    {
        var segs = SafePath.Segments(sub);
        return string.Join('/', segs);
    }

    sealed class AclRow
    {
        public string share { get; set; } = ""; public string principal_type { get; set; } = ""; public string principal { get; set; } = "";
        public string sub_path { get; set; } = ""; public long level { get; set; }
        public AclEntry ToEntry() => new(Enum.Parse<PrincipalType>(principal_type), principal, sub_path, (AccessLevel)(int)level);
    }

    // ---------- evaluation ----------

    static bool Matches(AclEntry e, User u) => e.PrincipalType switch
    {
        PrincipalType.User => e.Principal == u.Id,
        PrincipalType.Role => e.Principal.Equals(u.Role.ToString(), StringComparison.OrdinalIgnoreCase),
        _ => true,
    };

    static bool IsPrefix(string prefix, string path) =>
        prefix.Length == 0 || path.Equals(prefix, StringComparison.OrdinalIgnoreCase) || path.StartsWith(prefix + "/", StringComparison.OrdinalIgnoreCase);

    public static AccessLevel Evaluate(IReadOnlyList<AclEntry> acl, User u, string relPath)
    {
        if (u.Role == Role.Administrator) return AccessLevel.Full;
        var best = acl.Where(e => Matches(e, u) && IsPrefix(e.SubPath, relPath))
            .OrderByDescending(e => e.SubPath.Length)
            .ThenBy(e => e.PrincipalType) // User < Role < Everyone
            .FirstOrDefault();
        return Cap(u, best?.Level ?? AccessLevel.None);
    }

    /// <summary>True if the user has access somewhere below relPath, so the folder must be shown to reach it.</summary>
    public static bool CanTraverse(IReadOnlyList<AclEntry> acl, User u, string relPath) =>
        u.Role == Role.Administrator || acl.Any(e => Matches(e, u) && e.Level > AccessLevel.None && IsPrefix(relPath, e.SubPath) && Evaluate(acl, u, e.SubPath) > AccessLevel.None);

    public static AccessLevel Cap(User u, AccessLevel level) =>
        !RoleCapabilities.Has(u.Role, Capability.WriteFiles) && level > AccessLevel.Read ? AccessLevel.Read : level;
}
