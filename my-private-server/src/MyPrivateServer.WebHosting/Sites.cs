using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;
using MyPrivateServer.Storage;

namespace MyPrivateServer.WebHosting;

public enum SiteKind { Static, Node, DotNet, Php, Proxy }

public sealed class Site
{
    public string Name { get; set; } = "";
    public SiteKind Kind { get; set; }
    /// <summary>Port Caddy listens on for this site (reachable on the LAN and through remote access).</summary>
    public int Port { get; set; }
    /// <summary>Optional custom domains. Not required; without one the site is served on its port.</summary>
    public List<string> Hostnames { get; set; } = [];
    /// <summary>Internal port the app process listens on (Node/.NET/Proxy).</summary>
    public int UpstreamPort { get; set; }
    /// <summary>Executable and arguments to run the app, e.g. ["node", "server.js"]. Never run through a shell.</summary>
    public List<string> StartCommand { get; set; } = [];
    public bool SpaFallback { get; set; } = true;
    public string? LinkedApp { get; set; }
    public string? CurrentRelease { get; set; }
    public List<string> Releases { get; set; } = [];
    public bool Enabled { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class SitesFile { public List<Site> Sites { get; set; } = []; }

public sealed record SiteStatus(Site Site, bool ProcessRunning, int? Pid, string Url, IReadOnlyList<string> LocalUrls);

/// <summary>Supplies extra environment variables (e.g. an app's DATABASE_URL) when starting a site's process.</summary>
public interface ISiteEnvironmentSource { IReadOnlyDictionary<string, string> For(Site site); }

public sealed class SiteService : BackgroundService, IHealthProbe
{
    readonly JsonFileStore<SitesFile> _store;
    readonly StorageService _storage;
    readonly CaddyManager _caddy;
    readonly IAuditLog _audit;
    readonly IProcessRunner _runner;
    readonly ILogger<SiteService> _log;
    readonly IEnumerable<ISiteEnvironmentSource> _env;
    readonly Dictionary<string, ManagedProcess> _procs = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, (int Failures, DateTimeOffset Next)> _restart = new(StringComparer.OrdinalIgnoreCase);

    public SiteService(ServerPaths paths, StorageService storage, CaddyManager caddy, IAuditLog audit, IProcessRunner runner, ILogger<SiteService> log, IEnumerable<ISiteEnvironmentSource> env)
    {
        _store = new JsonFileStore<SitesFile>(Path.Combine(paths.ConfigDirectory, "sites.json"));
        _storage = storage; _caddy = caddy; _audit = audit; _runner = runner; _log = log; _env = env;
    }

    public string Name => "Websites";
    public IReadOnlyList<Site> List() => _store.Get().Sites;
    public Site Get(string name) => List().FirstOrDefault(s => s.Name == name) ?? throw new NotFoundException("Website not found.");

    public string SiteRoot(string name) => Path.Combine(_storage.PathFor("Websites"), Names.Slug(name, "Site name"));
    public string ReleaseDir(Site s, string release) => Path.Combine(SiteRoot(s.Name), "releases", release);
    string? CurrentDir(Site s) => s.CurrentRelease is null ? null : ReleaseDir(s, s.CurrentRelease);

    public SiteStatus Status(Site s, IEnumerable<string> lanAddresses)
    {
        _procs.TryGetValue(s.Name, out var p);
        return new SiteStatus(s, p?.IsRunning ?? false, p?.Pid, s.Hostnames.Count > 0 ? "https://" + s.Hostnames[0] : $"http://localhost:{s.Port}",
            lanAddresses.Select(a => $"http://{a}:{s.Port}").ToList());
    }

    public async Task<Site> CreateAsync(string name, SiteKind kind, int? upstreamPort, List<string>? startCommand, List<string>? hostnames, string? linkedApp, string actor, CancellationToken ct)
    {
        name = Names.Slug(name, "Site name");
        if (List().Any(s => s.Name == name)) throw new ConflictException("A website with that name already exists.");
        ValidateHostnames(hostnames);
        if (kind is SiteKind.Node or SiteKind.DotNet && (startCommand is null || startCommand.Count == 0))
            startCommand = kind == SiteKind.Node ? ["node", "server.js"] : ["dotnet", "App.dll"];
        var used = List().SelectMany(s => new[] { s.Port, s.UpstreamPort }).ToHashSet();
        var site = new Site
        {
            Name = name, Kind = kind, Port = Enumerable.Range(8100, 800).First(p => !used.Contains(p)),
            UpstreamPort = upstreamPort ?? (kind is SiteKind.Static ? 0 : Enumerable.Range(9100, 800).First(p => !used.Contains(p))),
            StartCommand = startCommand ?? [], Hostnames = hostnames ?? [], LinkedApp = linkedApp, CreatedAt = DateTimeOffset.UtcNow,
        };
        Directory.CreateDirectory(Path.Combine(SiteRoot(name), "releases"));
        if (kind is SiteKind.Static or SiteKind.Php)
        {
            var rel = NewReleaseId();
            Directory.CreateDirectory(ReleaseDir(site, rel));
            await File.WriteAllTextAsync(Path.Combine(ReleaseDir(site, rel), kind == SiteKind.Php ? "index.php" : "index.html"), Placeholder(name), ct);
            site.Releases.Add(rel); site.CurrentRelease = rel;
        }
        _store.Update(f => f.Sites.Add(site));
        await _caddy.ApplyAsync(List(), SiteRootFor, ct);
        _audit.Write(actor, "websites", "Website created", name, $"{kind} on port {site.Port}", AuditSeverity.Success);
        return site;
    }

    string? SiteRootFor(Site s) => CurrentDir(s);

    static string Placeholder(string name) =>
        $"<!doctype html><meta charset=utf-8><title>{System.Net.WebUtility.HtmlEncode(name)}</title><body style=\"font-family:system-ui;padding:40px\"><h1>{System.Net.WebUtility.HtmlEncode(name)}</h1><p>This website is hosted on My Private Server. Deploy from GitHub or upload a ZIP to replace this page.</p>";

    static void ValidateHostnames(List<string>? hosts)
    {
        foreach (var h in hosts ?? [])
            if (Uri.CheckHostName(h) != UriHostNameType.Dns || h.Contains(' ')) throw new UserFacingException($"“{h}” is not a valid domain name.");
    }

    public async Task<Site> UpdateAsync(string name, List<string>? hostnames, List<string>? startCommand, bool? spa, string? linkedApp, bool? enabled, string actor, CancellationToken ct)
    {
        ValidateHostnames(hostnames);
        var updated = _store.Update(f =>
        {
            var s = f.Sites.FirstOrDefault(x => x.Name == name) ?? throw new NotFoundException("Website not found.");
            if (hostnames is not null) s.Hostnames = hostnames;
            if (startCommand is { Count: > 0 }) s.StartCommand = startCommand;
            if (spa is not null) s.SpaFallback = spa.Value;
            if (linkedApp is not null) s.LinkedApp = linkedApp.Length == 0 ? null : linkedApp;
            if (enabled is not null) s.Enabled = enabled.Value;
        }).Sites.First(x => x.Name == name);
        await _caddy.ApplyAsync(List(), SiteRootFor, ct);
        if (updated.Kind is SiteKind.Node or SiteKind.DotNet && _procs.ContainsKey(name)) await RestartAppAsync(name, actor, ct);
        _audit.Write(actor, "websites", "Website updated", name);
        return updated;
    }

    public async Task DeleteAsync(string name, bool deleteFiles, string actor, CancellationToken ct)
    {
        var s = Get(name);
        StopApp(name);
        _store.Update(f => f.Sites.RemoveAll(x => x.Name == name));
        await _caddy.ApplyAsync(List(), SiteRootFor, ct);
        if (deleteFiles && Directory.Exists(SiteRoot(name))) Directory.Delete(SiteRoot(name), true);
        _audit.Write(actor, "websites", "Website deleted", name, deleteFiles ? "Files deleted" : "Files kept", AuditSeverity.Warning);
    }

    // ---------- releases ----------
    public static string NewReleaseId() => DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + ServerIdentity.RandomToken(3).ToLowerInvariant().Replace('_', 'x').Replace('-', 'y');

    /// <summary>Points the site at a prepared release folder, reloads Caddy, restarts the app, and prunes old releases.</summary>
    public async Task ActivateReleaseAsync(string name, string release, string actor, CancellationToken ct)
    {
        var s = Get(name);
        if (!Directory.Exists(ReleaseDir(s, release))) throw new NotFoundException("Release not found.");
        var updated = _store.Update(f =>
        {
            var x = f.Sites.First(y => y.Name == name);
            x.CurrentRelease = release;
            if (!x.Releases.Contains(release)) x.Releases.Add(release);
            while (x.Releases.Count > 5) { var old = x.Releases[0]; x.Releases.RemoveAt(0); try { Directory.Delete(ReleaseDir(x, old), true); } catch { } }
        }).Sites.First(y => y.Name == name);
        await _caddy.ApplyAsync(List(), SiteRootFor, ct);
        if (updated.Kind is SiteKind.Node or SiteKind.DotNet) await StartAppAsync(name, actor, ct);
        _audit.Write(actor, "websites", "Release activated", name, release, AuditSeverity.Success);
    }

    public async Task RollbackAsync(string name, string actor, CancellationToken ct)
    {
        var s = Get(name);
        var i = s.CurrentRelease is null ? -1 : s.Releases.IndexOf(s.CurrentRelease);
        if (i <= 0) throw new UserFacingException("There is no earlier release to roll back to.");
        await ActivateReleaseAsync(name, s.Releases[i - 1], actor, ct);
        _audit.Write(actor, "websites", "Rolled back", name, s.Releases[i - 1], AuditSeverity.Warning);
    }

    /// <summary>Deploys a static site from an uploaded ZIP (index.html at the root or in a single top folder).</summary>
    public async Task<string> DeployZipAsync(string name, Stream zip, string actor, CancellationToken ct)
    {
        var s = Get(name);
        var release = NewReleaseId();
        var dir = ReleaseDir(s, release);
        Directory.CreateDirectory(dir);
        using (var archive = new ZipArchive(zip, ZipArchiveMode.Read))
        {
            long total = 0;
            foreach (var e in archive.Entries)
            {
                total += e.Length;
                if (total > 2L * 1024 * 1024 * 1024) throw new UserFacingException("The ZIP expands to more than 2 GB.");
                var target = Path.GetFullPath(Path.Combine(dir, e.FullName));
                if (!target.StartsWith(dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new UserFacingException("The ZIP contains unsafe paths.");
                if (e.FullName.EndsWith('/')) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                await using var src = await e.OpenAsync(ct);
                await using var dst = File.Create(target);
                await src.CopyToAsync(dst, ct);
            }
        }
        var subdirs = Directory.GetDirectories(dir);
        if (!File.Exists(Path.Combine(dir, "index.html")) && subdirs.Length == 1 && Directory.GetFiles(dir).Length == 0)
        {
            var inner = subdirs[0];
            foreach (var f in Directory.GetFileSystemEntries(inner)) Directory.Move(f, Path.Combine(dir, Path.GetFileName(f)));
            Directory.Delete(inner);
        }
        await ActivateReleaseAsync(name, release, actor, ct);
        return release;
    }

    // ---------- app processes ----------
    public async Task StartAppAsync(string name, string actor, CancellationToken ct)
    {
        var s = Get(name);
        if (s.Kind is not (SiteKind.Node or SiteKind.DotNet)) return;
        var dir = CurrentDir(s) ?? throw new UserFacingException("Deploy the app before starting it.");
        if (s.StartCommand.Count == 0) throw new UserFacingException("Set a start command first.");
        var exe = _runner.Find(s.StartCommand[0]) ?? s.StartCommand[0];
        var env = new Dictionary<string, string?> { ["PORT"] = s.UpstreamPort.ToString(), ["ASPNETCORE_URLS"] = $"http://127.0.0.1:{s.UpstreamPort}", ["NODE_ENV"] = "production" };
        foreach (var src in _env) foreach (var (k, v) in src.For(s)) env[k] = v;
        if (!_procs.TryGetValue(name, out var p)) _procs[name] = p = new ManagedProcess(name);
        p.Start(exe, s.StartCommand.Skip(1), dir, env, env.Values.Where(v => v is { Length: > 12 }).Cast<string>().ToList());
        _restart.Remove(name);
        _audit.Write(actor, "websites", "App started", name);
        await Task.CompletedTask;
    }

    public void StopApp(string name) { if (_procs.Remove(name, out var p)) p.Dispose(); _restart.Remove(name); }

    public async Task RestartAppAsync(string name, string actor, CancellationToken ct) { StopApp(name); await StartAppAsync(name, actor, ct); }

    public IReadOnlyList<string> Logs(string name) => _procs.TryGetValue(name, out var p) ? p.Log(300) : [];

    /// <summary>Starts Caddy and enabled apps at boot, and restarts crashed apps with backoff.</summary>
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromSeconds(2), ct);
        try
        {
            if (_storage.Status().Online && List().Count > 0)
            {
                await _caddy.ApplyAsync(List(), SiteRootFor, ct);
                foreach (var s in List().Where(s => s.Enabled && s.Kind is SiteKind.Node or SiteKind.DotNet && s.CurrentRelease is not null))
                    try { await StartAppAsync(s.Name, "system", ct); } catch (Exception ex) { _log.LogWarning(ex, "Could not start {Site}", s.Name); }
            }
        }
        catch (Exception ex) { _log.LogWarning(ex, "Website startup failed"); }
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        while (await timer.WaitForNextTickAsync(ct))
        {
            foreach (var (name, p) in _procs.ToList())
            {
                if (p.IsRunning) continue;
                var (failures, next) = _restart.GetValueOrDefault(name);
                if (DateTimeOffset.UtcNow < next) continue;
                failures++;
                _restart[name] = (failures, DateTimeOffset.UtcNow.AddSeconds(Math.Min(300, 5 * Math.Pow(2, failures))));
                _log.LogWarning("App {Site} exited (code {Code}); restarting (attempt {N})", name, p.LastExitCode, failures);
                try { await StartAppAsync(name, "system", ct); _restart[name] = (failures, DateTimeOffset.UtcNow.AddSeconds(Math.Min(300, 5 * Math.Pow(2, failures)))); }
                catch (Exception ex) { _log.LogWarning(ex, "Restart of {Site} failed", name); }
            }
        }
    }

    public async Task<HealthResult> CheckAsync(CancellationToken ct)
    {
        var sites = List();
        if (sites.Count == 0) return new(Name, HealthState.Disabled, "No websites yet");
        var caddy = await _caddy.StatusAsync(ct);
        var appsDown = sites.Count(s => s.Enabled && s.Kind is SiteKind.Node or SiteKind.DotNet && s.CurrentRelease is not null && !(_procs.TryGetValue(s.Name, out var p) && p.IsRunning));
        if (!caddy.Running) return new(Name, HealthState.Unavailable, "Web server not running", caddy.Problem);
        return appsDown > 0 ? new(Name, HealthState.Degraded, $"{appsDown} app(s) not running") : new(Name, HealthState.Healthy, $"{sites.Count} website(s) online");
    }
}
