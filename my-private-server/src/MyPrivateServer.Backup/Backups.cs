using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Dapper;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;
using MyPrivateServer.Databases;
using MyPrivateServer.Storage;

namespace MyPrivateServer.Backup;

public enum BackupType { Files, Database, Configuration, Application, FullServer }
public enum BackupFrequency { Manual, Daily, Weekly }
public enum RunStatus { Running, Succeeded, Failed, CompletedWithWarnings }

public sealed class BackupJob
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public BackupType Type { get; set; }
    /// <summary>Files: folders relative to the storage root (e.g. "Shared", "Users/anna"). Database: database names, or empty for all.</summary>
    public List<string> Sources { get; set; } = [];
    /// <summary>Another local drive, an external HDD, or a network share (\\nas\backups).</summary>
    public string Destination { get; set; } = "";
    public BackupFrequency Frequency { get; set; } = BackupFrequency.Daily;
    public string Time { get; set; } = "02:00";
    public DayOfWeek Day { get; set; } = DayOfWeek.Sunday;
    public int KeepLast { get; set; } = 14;
    public bool Enabled { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class JobsFile { public List<BackupJob> Jobs { get; set; } = []; }

public sealed record BackupRun(string Id, string JobId, string JobName, DateTimeOffset StartedAt, DateTimeOffset? FinishedAt, RunStatus Status, long Bytes, int Items, string? Folder, string? Message, string Trigger);
public sealed record BackupArtifact(string File, string Kind, string Source, long Bytes, string Sha256);
public sealed record BackupManifest(string ServerId, string ServerName, string JobName, BackupType Type, DateTimeOffset CreatedAt, IReadOnlyList<BackupArtifact> Artifacts, IReadOnlyList<string> Warnings);

public sealed class BackupSchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS backup_runs (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL, job_name TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NULL,
          status TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, items INTEGER NOT NULL DEFAULT 0, folder TEXT NULL, message TEXT NULL, trigger TEXT NOT NULL);
        """;
}

/// <summary>
/// Local backups only: to another drive, an external disk, or a network share. Nothing is sent to any cloud.
/// Each run writes ZIP archives and PostgreSQL dumps plus a manifest with SHA-256 checksums.
/// </summary>
public sealed class BackupService : BackgroundService, IHealthProbe
{
    static readonly string[] FullServerFolders = ["Users", "Shared", "Websites", "Applications", "Docker"];
    readonly JsonFileStore<JobsFile> _store;
    readonly ServerPaths _paths;
    readonly SystemDb _db;
    readonly StorageService _storage;
    readonly SettingsStore _settings;
    readonly IDatabaseProvider _databases;
    readonly IAuditLog _audit;
    readonly ILogger<BackupService> _log;
    readonly SemaphoreSlim _running = new(1, 1);

    public BackupService(ServerPaths paths, SystemDb db, StorageService storage, SettingsStore settings, IDatabaseProvider databases, IAuditLog audit, ILogger<BackupService> log)
    {
        _store = new JsonFileStore<JobsFile>(Path.Combine(paths.ConfigDirectory, "backup-jobs.json"));
        _paths = paths; _db = db; _storage = storage; _settings = settings; _databases = databases; _audit = audit; _log = log;
    }

    public string Name => "Backups";
    public IReadOnlyList<BackupJob> Jobs() => _store.Get().Jobs;
    public BackupJob Job(string id) => Jobs().FirstOrDefault(j => j.Id == id) ?? throw new NotFoundException("Backup job not found.");

    public BackupJob Save(BackupJob job, string actor)
    {
        if (string.IsNullOrWhiteSpace(job.Name)) throw new UserFacingException("Give the backup a name.");
        if (!TimeOnly.TryParse(job.Time, out _)) throw new UserFacingException("Use a time like 02:00.");
        job.KeepLast = Math.Clamp(job.KeepLast, 1, 365);
        ValidateDestination(job);
        if (job.Type == BackupType.Files)
        {
            if (job.Sources.Count == 0) throw new UserFacingException("Choose at least one folder to back up.");
            foreach (var s in job.Sources) SourcePath(s);
        }
        var isNew = string.IsNullOrEmpty(job.Id);
        if (isNew) { job.Id = Guid.NewGuid().ToString("N")[..10]; job.CreatedAt = DateTimeOffset.UtcNow; }
        _store.Update(f => { f.Jobs.RemoveAll(j => j.Id == job.Id); f.Jobs.Add(job); });
        _audit.Write(actor, "backup", isNew ? "Backup job created" : "Backup job updated", job.Name, $"{job.Type} → {job.Destination}");
        return job;
    }

    public void Delete(string id, string actor)
    {
        var j = Job(id);
        _store.Update(f => f.Jobs.RemoveAll(x => x.Id == id));
        _audit.Write(actor, "backup", "Backup job deleted", j.Name, "Existing backup files were kept", AuditSeverity.Warning);
    }

    string SourcePath(string rel)
    {
        var root = Path.GetFullPath(_storage.Root);
        var full = Path.GetFullPath(Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar)));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || full.StartsWith(Path.Combine(root, "Backups"), StringComparison.OrdinalIgnoreCase))
            throw new UserFacingException($"“{rel}” is not a folder that can be backed up.");
        return full;
    }

    void ValidateDestination(BackupJob job)
    {
        if (string.IsNullOrWhiteSpace(job.Destination) || !Path.IsPathFullyQualified(job.Destination))
            throw new UserFacingException(@"Choose a destination folder, for example E:\Backups or \\nas\backups.");
        var dest = Path.GetFullPath(job.Destination);
        var root = _settings.Get().StorageRoot is { } r ? Path.GetFullPath(r) : null;
        if (root is not null && (dest + Path.DirectorySeparatorChar).StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            && !dest.StartsWith(Path.Combine(root, "Backups"), StringComparison.OrdinalIgnoreCase))
            throw new UserFacingException("The destination cannot be inside the folders being backed up. Use the Backups folder, another drive, or a network share.");
    }

    /// <summary>Warnings shown next to a destination (e.g. same physical drive as the data).</summary>
    public IReadOnlyList<string> DestinationWarnings(string destination)
    {
        var w = new List<string>();
        var root = _settings.Get().StorageRoot;
        if (root is not null && string.Equals(Path.GetPathRoot(root), Path.GetPathRoot(destination), StringComparison.OrdinalIgnoreCase))
            w.Add("This destination is on the same drive as your data. If that drive fails, the backup is lost too. Prefer another drive or a network share.");
        if (!Directory.Exists(Path.GetPathRoot(destination) ?? destination)) w.Add("This drive or network share is not connected right now.");
        return w;
    }

    // ---------- runs ----------
    public IReadOnlyList<BackupRun> Runs(string? jobId = null, int limit = 100)
    {
        using var c = _db.Open();
        return c.Query("SELECT * FROM backup_runs WHERE @jobId IS NULL OR job_id=@jobId ORDER BY started_at DESC LIMIT @limit", new { jobId, limit })
            .Select(r => new BackupRun((string)r.id, (string)r.job_id, (string)r.job_name, DateTimeOffset.Parse((string)r.started_at),
                r.finished_at is null ? null : DateTimeOffset.Parse((string)r.finished_at), Enum.Parse<RunStatus>((string)r.status), (long)r.bytes, (int)(long)r.items,
                (string?)r.folder, (string?)r.message, (string)r.trigger)).ToList();
    }

    public bool IsRunning => _running.CurrentCount == 0;

    public Task<BackupRun> RunNowAsync(string jobId, string actor, CancellationToken ct) => RunAsync(Job(jobId), "manual by " + actor, ct);

    async Task<BackupRun> RunAsync(BackupJob job, string trigger, CancellationToken ct)
    {
        if (!await _running.WaitAsync(0, ct)) throw new ConflictException("Another backup is running. Try again when it finishes.");
        var runId = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss");
        var started = DateTimeOffset.UtcNow;
        using (var c = _db.Open())
            c.Execute("INSERT INTO backup_runs(id,job_id,job_name,started_at,status,trigger) VALUES (@id,@jid,@jn,@t,'Running',@trigger)",
                new { id = runId + "-" + job.Id, jid = job.Id, jn = job.Name, t = started.ToString("O"), trigger });
        var id = runId + "-" + job.Id;
        string? folder = null; long bytes = 0; var artifacts = new List<BackupArtifact>(); var warnings = new List<string>();
        try
        {
            ValidateDestination(job);
            if (!Directory.Exists(Path.GetPathRoot(job.Destination)!)) throw new UserFacingException("The backup destination is not connected (drive unplugged or network share offline).");
            var s = _settings.Get();
            folder = Path.Combine(job.Destination, "MyPrivateServer-Backups", s.ServerId, Slug(job.Name), runId);
            Directory.CreateDirectory(folder);
            _audit.Write("system", "backup", "Backup started", job.Name, trigger);

            async Task Files(IEnumerable<string> rels)
            {
                foreach (var rel in rels)
                {
                    var src = SourcePath(rel);
                    if (!Directory.Exists(src)) { warnings.Add($"Folder {rel} not found; skipped."); continue; }
                    artifacts.Add(await ZipFolderAsync(src, Path.Combine(folder, "files-" + Slug(rel) + ".zip"), "files", rel, warnings, ct));
                }
            }
            async Task Databases(IEnumerable<string>? names)
            {
                IReadOnlyList<string> list;
                try { list = names?.ToList() is { Count: > 0 } n ? n : (await _databases.ListDatabasesAsync(ct)).Select(d => d.Name).ToList(); }
                catch (UserFacingException ex) { warnings.Add("Databases skipped: " + ex.Message); return; }
                foreach (var dbName in list)
                {
                    var file = Path.Combine(folder, "db-" + dbName + ".dump");
                    await _databases.BackupAsync(dbName, file, ct);
                    artifacts.Add(new BackupArtifact(Path.GetFileName(file), "database", dbName, new FileInfo(file).Length, await HashAsync(file, ct)));
                }
            }
            switch (job.Type)
            {
                case BackupType.Files: await Files(job.Sources); break;
                case BackupType.Database: await Databases(job.Sources); break;
                case BackupType.Configuration: artifacts.Add(await ConfigAsync(folder, warnings, ct)); break;
                case BackupType.Application:
                    await Files(["Websites", "Applications"]);
                    var appDbs = (await SafeListDatabases(ct)).Where(d => d.StartsWith("app_")).ToList();
                    if (appDbs.Count > 0) await Databases(appDbs);
                    break;
                case BackupType.FullServer:
                    artifacts.Add(await ConfigAsync(folder, warnings, ct));
                    await Files(FullServerFolders);
                    await Databases(null);
                    break;
            }
            bytes = artifacts.Sum(a => a.Bytes);
            var manifest = new BackupManifest(s.ServerId, s.ServerName, job.Name, job.Type, started, artifacts, warnings);
            await File.WriteAllTextAsync(Path.Combine(folder, "manifest.json"), JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }), ct);
            Prune(job);
            var status = warnings.Count > 0 ? RunStatus.CompletedWithWarnings : RunStatus.Succeeded;
            Finish(id, status, bytes, artifacts.Count, folder, warnings.Count > 0 ? string.Join(" ", warnings.Take(3)) : null);
            _audit.Write("system", "backup", "Backup completed", job.Name, $"{FormatBytes(bytes)}, {artifacts.Count} archive(s)", status == RunStatus.Succeeded ? AuditSeverity.Success : AuditSeverity.Warning);
        }
        catch (Exception ex)
        {
            var msg = ex is UserFacingException ? ex.Message : "Backup failed: " + ex.Message;
            Finish(id, RunStatus.Failed, bytes, artifacts.Count, folder, msg);
            _audit.Write("system", "backup", "Backup failed", job.Name, msg, AuditSeverity.Critical);
            _log.LogError(ex, "Backup {Job} failed", job.Name);
        }
        finally { _running.Release(); }
        return Runs(job.Id, 1)[0];
    }

    async Task<IReadOnlyList<string>> SafeListDatabases(CancellationToken ct)
    {
        try { return (await _databases.ListDatabasesAsync(ct)).Select(d => d.Name).ToList(); } catch { return []; }
    }

    void Finish(string id, RunStatus status, long bytes, int items, string? folder, string? message)
    {
        using var c = _db.Open();
        c.Execute("UPDATE backup_runs SET finished_at=@t, status=@s, bytes=@bytes, items=@items, folder=@folder, message=@message WHERE id=@id",
            new { t = DateTimeOffset.UtcNow.ToString("O"), s = status.ToString(), bytes, items, folder, message, id });
    }

    async Task<BackupArtifact> ConfigAsync(string folder, List<string> warnings, CancellationToken ct)
    {
        var staging = Path.Combine(_paths.TempDirectory, "config-backup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        try
        {
            CopyDir(_paths.ConfigDirectory, Path.Combine(staging, "config"));
            CopyDir(_paths.KeysDirectory, Path.Combine(staging, "keys"));
            using (var src = new SqliteConnection($"Data Source={_paths.SystemDatabase}"))
            using (var dst = new SqliteConnection($"Data Source={Path.Combine(staging, "system.db")};Pooling=False"))
            { src.Open(); dst.Open(); src.BackupDatabase(dst); }
            warnings.Add("The configuration backup contains encryption keys. Store it somewhere private.");
            return await ZipFolderAsync(staging, Path.Combine(folder, "configuration.zip"), "configuration", "server configuration", warnings, ct);
        }
        finally { try { Directory.Delete(staging, true); } catch { } }
    }

    static void CopyDir(string from, string to)
    {
        if (!Directory.Exists(from)) return;
        Directory.CreateDirectory(to);
        foreach (var f in Directory.EnumerateFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)), true);
        foreach (var d in Directory.EnumerateDirectories(from)) CopyDir(d, Path.Combine(to, Path.GetFileName(d)));
    }

    static async Task<BackupArtifact> ZipFolderAsync(string src, string zipPath, string kind, string label, List<string> warnings, CancellationToken ct)
    {
        await using (var fs = new FileStream(zipPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 16, useAsync: true))
        using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
        {
            var opts = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
            foreach (var file in Directory.EnumerateFiles(src, "*", opts))
            {
                ct.ThrowIfCancellationRequested();
                var rel = Path.GetRelativePath(src, file).Replace('\\', '/');
                try
                {
                    var entry = zip.CreateEntry(rel, CompressionLevel.Fastest);
                    entry.LastWriteTime = File.GetLastWriteTime(file);
                    await using var input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16, useAsync: true);
                    await using var output = await entry.OpenAsync(ct);
                    await input.CopyToAsync(output, ct);
                }
                catch (IOException ex) { warnings.Add($"Skipped {rel}: {ex.Message}"); }
            }
        }
        return new BackupArtifact(Path.GetFileName(zipPath), kind, label, new FileInfo(zipPath).Length, await HashAsync(zipPath, ct));
    }

    static async Task<string> HashAsync(string file, CancellationToken ct)
    {
        await using var fs = File.OpenRead(file);
        return Convert.ToHexString(await SHA256.HashDataAsync(fs, ct)).ToLowerInvariant();
    }

    void Prune(BackupJob job)
    {
        var dir = Path.Combine(job.Destination, "MyPrivateServer-Backups", _settings.Get().ServerId, Slug(job.Name));
        if (!Directory.Exists(dir)) return;
        var runs = Directory.GetDirectories(dir).Where(d => File.Exists(Path.Combine(d, "manifest.json"))).OrderByDescending(d => d).ToList();
        foreach (var old in runs.Skip(job.KeepLast)) try { Directory.Delete(old, true); } catch (Exception ex) { _log.LogWarning(ex, "Could not prune {Dir}", old); }
    }

    // ---------- restore ----------
    public async Task<BackupManifest> VerifyAsync(string runId, CancellationToken ct)
    {
        var (manifest, folder) = LoadRun(runId);
        foreach (var a in manifest.Artifacts)
        {
            var f = Path.Combine(folder, a.File);
            if (!File.Exists(f)) throw new UserFacingException($"{a.File} is missing from the backup.");
            if (await HashAsync(f, ct) != a.Sha256) throw new UserFacingException($"{a.File} is damaged (checksum mismatch).");
        }
        return manifest;
    }

    (BackupManifest, string) LoadRun(string runId)
    {
        var run = Runs(null, 1000).FirstOrDefault(r => r.Id == runId) ?? throw new NotFoundException("Backup not found.");
        if (run.Folder is null || !File.Exists(Path.Combine(run.Folder, "manifest.json"))) throw new UserFacingException("This backup's files are not available (destination disconnected or pruned).");
        return (JsonSerializer.Deserialize<BackupManifest>(File.ReadAllText(Path.Combine(run.Folder, "manifest.json")))!, run.Folder);
    }

    /// <summary>
    /// Restores file archives into a new folder under Shared (never overwriting by default), or database dumps
    /// into the named database. Configuration restores are manual on purpose.
    /// </summary>
    public async Task<string> RestoreAsync(string runId, string artifact, bool overwriteOriginal, string actor, CancellationToken ct)
    {
        var manifest = await VerifyAsync(runId, ct);
        var (_, folder) = LoadRun(runId);
        var a = manifest.Artifacts.FirstOrDefault(x => x.File == artifact) ?? throw new NotFoundException("Archive not found in this backup.");
        string result;
        switch (a.Kind)
        {
            case "files":
                var target = overwriteOriginal ? SourcePath(a.Source) : Path.Combine(_storage.PathFor("Shared"), $"Restored-{Slug(a.Source)}-{DateTime.Now:yyyyMMdd-HHmm}");
                Directory.CreateDirectory(target);
                var targetFull = Path.GetFullPath(target) + Path.DirectorySeparatorChar;
                using (var zip = ZipFile.OpenRead(Path.Combine(folder, a.File)))
                    foreach (var e in zip.Entries)
                    {
                        var dest = Path.GetFullPath(Path.Combine(target, e.FullName));
                        if (!dest.StartsWith(targetFull, StringComparison.OrdinalIgnoreCase)) continue;
                        if (e.FullName.EndsWith('/')) { Directory.CreateDirectory(dest); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                        e.ExtractToFile(dest, overwrite: overwriteOriginal);
                    }
                result = overwriteOriginal ? $"Restored into {a.Source}" : $"Restored into Shared/{Path.GetFileName(target)}";
                break;
            case "database":
                await _databases.RestoreAsync(a.Source, Path.Combine(folder, a.File), ct);
                result = $"Database {a.Source} restored";
                break;
            default:
                throw new UserFacingException("Configuration backups are restored manually: stop the service, then copy the archive's config, keys and system.db into the data folder.");
        }
        _audit.Write(actor, "backup", "Restore completed", a.Source, result, AuditSeverity.Warning);
        return result;
    }

    // ---------- scheduler ----------
    public static DateTimeOffset? NextRun(BackupJob j, DateTimeOffset? lastRun, DateTimeOffset now)
    {
        if (!j.Enabled || j.Frequency == BackupFrequency.Manual) return null;
        var t = TimeOnly.Parse(j.Time);
        var local = now.ToLocalTime();
        var candidate = new DateTimeOffset(local.Date + t.ToTimeSpan(), local.Offset);
        if (j.Frequency == BackupFrequency.Weekly) while (candidate.DayOfWeek != j.Day) candidate = candidate.AddDays(1);
        if (candidate <= (lastRun ?? DateTimeOffset.MinValue) || candidate < now.AddMinutes(-1)) candidate = candidate.AddDays(j.Frequency == BackupFrequency.Weekly ? 7 : 1);
        return candidate;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            if (!_settings.Get().SetupCompleted) continue;
            foreach (var job in Jobs())
            {
                var last = Runs(job.Id, 1).FirstOrDefault()?.StartedAt;
                var reference = last ?? job.CreatedAt;
                var due = NextRun(job, reference, reference);
                if (due is not null && due <= DateTimeOffset.Now && !IsRunning)
                    try { await RunAsync(job, "scheduled", ct); } catch (Exception ex) { _log.LogWarning(ex, "Scheduled backup {Job} failed", job.Name); }
            }
        }
    }

    public Task<HealthResult> CheckAsync(CancellationToken ct)
    {
        var jobs = Jobs().Where(j => j.Enabled).ToList();
        if (jobs.Count == 0) return Task.FromResult(new HealthResult(Name, HealthState.Degraded, "No backup configured"));
        var failed = jobs.Select(j => Runs(j.Id, 1).FirstOrDefault()).Count(r => r?.Status == RunStatus.Failed);
        return Task.FromResult(failed > 0 ? new HealthResult(Name, HealthState.Degraded, $"{failed} job(s) failed last run") : new HealthResult(Name, HealthState.Healthy, $"{jobs.Count} job(s) active"));
    }

    static string Slug(string s) => new string(s.ToLowerInvariant().Select(c => char.IsAsciiLetterOrDigit(c) ? c : '-').ToArray()).Trim('-') is { Length: > 0 } x ? x : "backup";
    static string FormatBytes(long b) { string[] u = ["B", "KB", "MB", "GB", "TB"]; double v = b; var i = 0; while (v >= 1000 && i < 4) { v /= 1000; i++; } return $"{Math.Round(v, 1)} {u[i]}"; }
}
