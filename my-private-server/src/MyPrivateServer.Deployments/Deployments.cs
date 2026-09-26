using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Dapper;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;
using MyPrivateServer.Storage;
using MyPrivateServer.WebHosting;

namespace MyPrivateServer.Deployments;

public sealed class RepoConnection
{
    public string Id { get; set; } = "";
    public string Owner { get; set; } = "";
    public string Repo { get; set; } = "";
    public string Branch { get; set; } = "main";
    public string? TokenProtected { get; set; }
    public string Site { get; set; } = "";
    /// <summary>Optional overrides. Empty = detect from the repository (package.json, *.csproj, index.html).</summary>
    public List<string> BuildCommand { get; set; } = [];
    public string? OutputDirectory { get; set; }
    public bool RunTests { get; set; }
    public bool AutoDeploy { get; set; }
    public string WebhookSecretProtected { get; set; } = "";
    public string? LastDeployedCommit { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ReposFile { public List<RepoConnection> Repos { get; set; } = []; }

public enum DeployStatus { Queued, Running, Succeeded, Failed, Cancelled }

public sealed record Deployment(string Id, string RepoId, string? CommitSha, string? CommitMessage, DeployStatus Status, string Trigger,
    DateTimeOffset QueuedAt, DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt, string? Release, string? Error, string RequestedBy);

public sealed record RepoView(string Id, string Owner, string Repo, string Branch, string Site, bool HasToken, bool AutoDeploy, bool RunTests,
    IReadOnlyList<string> BuildCommand, string? OutputDirectory, string? LastDeployedCommit, DateTimeOffset CreatedAt, string WebhookPath);

public sealed class DeploymentsSchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS deployments (
          id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, commit_sha TEXT NULL, commit_message TEXT NULL, status TEXT NOT NULL, trigger TEXT NOT NULL,
          queued_at TEXT NOT NULL, started_at TEXT NULL, finished_at TEXT NULL, release TEXT NULL, error TEXT NULL, requested_by TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_deployments_repo ON deployments(repo_id, queued_at);
        """;
}

/// <summary>
/// GitHub → pull → build → test → release → activate. Runs one deployment at a time. Auto-deploy polls GitHub
/// for new commits (works behind NAT/CGNAT with no inbound webhook); signed webhooks are also accepted when
/// the server is reachable through remote access.
/// </summary>
public sealed class DeploymentService : BackgroundService
{
    readonly JsonFileStore<ReposFile> _store;
    readonly SystemDb _db;
    readonly StorageService _storage;
    readonly SiteService _sites;
    readonly GitHubClient _github;
    readonly IProcessRunner _runner;
    readonly ISecretProtector _secrets;
    readonly SettingsStore _settings;
    readonly IAuditLog _audit;
    readonly ILogger<DeploymentService> _log;
    readonly IEnumerable<ISiteEnvironmentSource> _env;
    readonly Channel<string> _queue = Channel.CreateUnbounded<string>();
    CancellationTokenSource? _current;

    public DeploymentService(ServerPaths paths, SystemDb db, StorageService storage, SiteService sites, GitHubClient github, IProcessRunner runner,
        ISecretProtector secrets, SettingsStore settings, IAuditLog audit, ILogger<DeploymentService> log, IEnumerable<ISiteEnvironmentSource> env)
    {
        _store = new JsonFileStore<ReposFile>(Path.Combine(paths.ConfigDirectory, "repos.json"));
        _db = db; _storage = storage; _sites = sites; _github = github; _runner = runner; _secrets = secrets; _settings = settings; _audit = audit; _log = log; _env = env;
    }

    public IReadOnlyList<RepoView> Repos() => _store.Get().Repos.Select(View).ToList();
    RepoConnection GetRepo(string id) => _store.Get().Repos.FirstOrDefault(r => r.Id == id) ?? throw new NotFoundException("Repository connection not found.");
    static RepoView View(RepoConnection r) => new(r.Id, r.Owner, r.Repo, r.Branch, r.Site, r.TokenProtected is not null, r.AutoDeploy, r.RunTests, r.BuildCommand, r.OutputDirectory,
        r.LastDeployedCommit, r.CreatedAt, $"/api/github/webhook/{r.Id}");
    string? Token(RepoConnection r) => r.TokenProtected is null ? null : _secrets.Unprotect(r.TokenProtected);

    public async Task<(RepoView Repo, string WebhookSecret)> ConnectAsync(string ownerRepo, string? branch, string? token, string site, bool autoDeploy, bool runTests,
        List<string>? buildCommand, string? outputDir, string actor, CancellationToken ct)
    {
        var parts = ownerRepo.Trim().Replace("https://github.com/", "").TrimEnd('/').Replace(".git", "").Split('/');
        if (parts.Length != 2 || parts.Any(p => !System.Text.RegularExpressions.Regex.IsMatch(p, "^[A-Za-z0-9_.-]{1,100}$")))
            throw new UserFacingException("Enter the repository as owner/name, for example my-company/website.");
        _sites.Get(site);
        RepoInfo info;
        try { info = await _github.RepositoryAsync(parts[0], parts[1], string.IsNullOrWhiteSpace(token) ? null : token.Trim(), ct); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException || ex is UserFacingException { StatusCode: 429 })
        {
            // GitHub API unavailable or rate-limited: fall back to the git protocol.
            info = await GitRemoteInfoAsync(parts[0], parts[1], string.IsNullOrWhiteSpace(token) ? null : token.Trim(), ct);
        }
        var br = string.IsNullOrWhiteSpace(branch) ? info.DefaultBranch : branch.Trim();
        if (!info.Branches.Contains(br)) throw new UserFacingException($"Branch “{br}” does not exist. Available: {string.Join(", ", info.Branches.Take(10))}");
        if (outputDir is not null && (outputDir.Contains("..") || Path.IsPathRooted(outputDir))) throw new UserFacingException("Output folder must be relative to the repository.");
        var secret = ServerIdentity.RandomToken(24);
        var repo = new RepoConnection
        {
            Id = Guid.NewGuid().ToString("N")[..12], Owner = parts[0], Repo = parts[1], Branch = br, Site = site, AutoDeploy = autoDeploy, RunTests = runTests,
            TokenProtected = string.IsNullOrWhiteSpace(token) ? null : _secrets.Protect(token.Trim()), BuildCommand = buildCommand ?? [], OutputDirectory = outputDir,
            WebhookSecretProtected = _secrets.Protect(secret), CreatedAt = DateTimeOffset.UtcNow,
        };
        _store.Update(f => f.Repos.Add(repo));
        _audit.Write(actor, "github", "Repository connected", $"{repo.Owner}/{repo.Repo}@{br}", $"→ website {site}", AuditSeverity.Success);
        return (View(repo), secret);
    }

    public RepoView Update(string id, string? branch, bool? autoDeploy, bool? runTests, List<string>? buildCommand, string? outputDir, string? token, string actor)
    {
        var r = _store.Update(f =>
        {
            var x = f.Repos.FirstOrDefault(y => y.Id == id) ?? throw new NotFoundException("Repository connection not found.");
            if (!string.IsNullOrWhiteSpace(branch)) x.Branch = branch.Trim();
            if (autoDeploy is not null) x.AutoDeploy = autoDeploy.Value;
            if (runTests is not null) x.RunTests = runTests.Value;
            if (buildCommand is not null) x.BuildCommand = buildCommand;
            if (outputDir is not null) x.OutputDirectory = outputDir.Length == 0 ? null : outputDir;
            if (token is not null) x.TokenProtected = token.Length == 0 ? null : _secrets.Protect(token);
        }).Repos.First(y => y.Id == id);
        _audit.Write(actor, "github", "Repository settings changed", $"{r.Owner}/{r.Repo}");
        return View(r);
    }

    public void Disconnect(string id, string actor)
    {
        var r = GetRepo(id);
        _store.Update(f => f.Repos.RemoveAll(x => x.Id == id));
        var ws = Workspace(r);
        if (Directory.Exists(ws)) try { Directory.Delete(ws, true); } catch { }
        _audit.Write(actor, "github", "Repository disconnected", $"{r.Owner}/{r.Repo}", null, AuditSeverity.Warning);
    }

    public async Task<CommitInfo> LatestCommitAsync(string id, CancellationToken ct)
    {
        var r = GetRepo(id);
        try { return await _github.LatestCommitAsync(r.Owner, r.Repo, r.Branch, Token(r), ct); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException || ex is UserFacingException { StatusCode: 429 })
        {
            var sha = await GitHeadAsync(r, ct);
            return new CommitInfo(sha, "(details unavailable: GitHub API unreachable)", "", DateTimeOffset.UtcNow);
        }
    }

    List<string> AuthArgs(string? token) => token is null ? [] : ["-c", "http.extraHeader=AUTHORIZATION: basic " + Convert.ToBase64String(Encoding.ASCII.GetBytes("x-access-token:" + token))];

    async Task<string> LsRemoteAsync(string owner, string repo, string? token, IEnumerable<string> extra, CancellationToken ct)
    {
        var r = await _runner.RunAsync("git", [.. AuthArgs(token), "ls-remote", .. extra, $"https://github.com/{owner}/{repo}.git"],
            new ProcessOptions { Timeout = TimeSpan.FromSeconds(30), Environment = new Dictionary<string, string?> { ["GIT_TERMINAL_PROMPT"] = "0" }, Redact = token is null ? [] : [token] }, ct);
        if (r.ExitCode != 0) throw new UserFacingException("Could not reach the repository. Check the name, and add a token for private repositories.", 404);
        return r.Output;
    }

    async Task<RepoInfo> GitRemoteInfoAsync(string owner, string repo, string? token, CancellationToken ct)
    {
        var heads = await LsRemoteAsync(owner, repo, token, ["--heads", "--symref"], ct);
        var head = await LsRemoteAsync(owner, repo, token, ["--symref"], ct);
        var def = head.Split('\n').FirstOrDefault(l => l.StartsWith("ref: refs/heads/"))?.Split('\t')[0]["ref: refs/heads/".Length..] ?? "main";
        var branches = heads.Split('\n').Where(l => l.Contains("refs/heads/")).Select(l => l[(l.IndexOf("refs/heads/") + 11)..].Trim()).Distinct().ToList();
        return new RepoInfo($"{owner}/{repo}", def, token is not null, null, branches);
    }

    async Task<string> GitHeadAsync(RepoConnection r, CancellationToken ct)
    {
        var o = await LsRemoteAsync(r.Owner, r.Repo, Token(r), ["--heads"], ct);
        return o.Split('\n').FirstOrDefault(l => l.EndsWith("refs/heads/" + r.Branch))?.Split('\t')[0] ?? throw new UserFacingException("Branch not found.");
    }

    public bool VerifyWebhook(string id, byte[] body, string? signature)
    {
        var r = _store.Get().Repos.FirstOrDefault(x => x.Id == id);
        return r is not null && GitHubClient.VerifySignature(_secrets.Unprotect(r.WebhookSecretProtected), body, signature);
    }

    public string? BranchFor(string id) => _store.Get().Repos.FirstOrDefault(x => x.Id == id)?.Branch;

    // ---------- history ----------
    public IReadOnlyList<Deployment> History(string? repoId = null, int limit = 50)
    {
        using var c = _db.Open();
        return c.Query("SELECT * FROM deployments WHERE @repoId IS NULL OR repo_id=@repoId ORDER BY queued_at DESC LIMIT @limit", new { repoId, limit })
            .Select(r => new Deployment((string)r.id, (string)r.repo_id, (string?)r.commit_sha, (string?)r.commit_message, Enum.Parse<DeployStatus>((string)r.status), (string)r.trigger,
                DateTimeOffset.Parse((string)r.queued_at), r.started_at is null ? null : DateTimeOffset.Parse((string)r.started_at),
                r.finished_at is null ? null : DateTimeOffset.Parse((string)r.finished_at), (string?)r.release, (string?)r.error, (string)r.requested_by)).ToList();
    }

    string LogPath(string repoId, string deployId) => Path.Combine(_storage.PathFor("Deployments"), repoId, "logs", deployId + ".log");

    public string ReadLog(string deployId)
    {
        var d = History(null, 500).FirstOrDefault(x => x.Id == deployId) ?? throw new NotFoundException("Deployment not found.");
        var p = LogPath(d.RepoId, d.Id);
        return File.Exists(p) ? File.ReadAllText(p) : "";
    }

    public string Enqueue(string repoId, string trigger, string requestedBy)
    {
        GetRepo(repoId);
        using var c = _db.Open();
        if (c.ExecuteScalar<long>("SELECT COUNT(*) FROM deployments WHERE repo_id=@repoId AND status IN ('Queued','Running')", new { repoId }) > 0)
            throw new ConflictException("A deployment for this repository is already queued or running.");
        var id = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss") + "-" + ServerIdentity.RandomToken(3).Replace('_', 'x').Replace('-', 'y');
        c.Execute("INSERT INTO deployments(id,repo_id,status,trigger,queued_at,requested_by) VALUES (@id,@repoId,'Queued',@trigger,@t,@requestedBy)",
            new { id, repoId, trigger, t = DateTimeOffset.UtcNow.ToString("O"), requestedBy });
        _queue.Writer.TryWrite(id);
        _audit.Write(requestedBy, "github", "Deployment queued", repoId, trigger);
        return id;
    }

    public void CancelCurrent() => _current?.Cancel();

    void SetStatus(string id, DeployStatus s, string? error = null, string? release = null, string? sha = null, string? msg = null)
    {
        using var c = _db.Open();
        c.Execute("""
            UPDATE deployments SET status=@s, error=COALESCE(@error,error), release=COALESCE(@release,release), commit_sha=COALESCE(@sha,commit_sha),
              commit_message=COALESCE(@msg,commit_message),
              started_at=CASE WHEN @s='Running' THEN @t ELSE started_at END,
              finished_at=CASE WHEN @s IN ('Succeeded','Failed','Cancelled') THEN @t ELSE finished_at END WHERE id=@id
            """, new { s = s.ToString(), error, release, sha, msg, t = DateTimeOffset.UtcNow.ToString("O"), id });
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Anything left Running from a previous crash is marked failed; queued items are resumed.
        using (var c = _db.Open())
        {
            c.Execute("UPDATE deployments SET status='Failed', error='Server restarted during deployment' WHERE status='Running'");
            foreach (var id in c.Query<string>("SELECT id FROM deployments WHERE status='Queued' ORDER BY queued_at")) _queue.Writer.TryWrite(id);
        }
        _ = PollLoopAsync(ct);
        await foreach (var id in _queue.Reader.ReadAllAsync(ct))
        {
            _current = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _current.CancelAfter(TimeSpan.FromMinutes(30));
            try { await RunAsync(id, _current.Token); }
            catch (Exception ex) { _log.LogError(ex, "Deployment {Id} crashed", id); SetStatus(id, DeployStatus.Failed, ex.Message); }
            finally { _current.Dispose(); _current = null; }
        }
    }

    async Task PollLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(Math.Max(1, _settings.Get().Deployments.PollMinutes)), ct).ContinueWith(_ => { });
            foreach (var r in _store.Get().Repos.Where(r => r.AutoDeploy))
            {
                try
                {
                    var head = await LatestCommitAsync(r.Id, ct);
                    if (head.Sha != r.LastDeployedCommit && History(r.Id, 1).FirstOrDefault()?.Status is not (DeployStatus.Queued or DeployStatus.Running))
                        Enqueue(r.Id, "auto (new commit)", "system");
                }
                catch (Exception ex) when (!ct.IsCancellationRequested) { _log.LogDebug(ex, "Poll of {Repo} failed", r.Repo); }
            }
        }
    }

    string Workspace(RepoConnection r) => Path.Combine(_storage.PathFor("Deployments"), r.Id, "src");

    async Task RunAsync(string id, CancellationToken ct)
    {
        var dep = History(null, 500).First(d => d.Id == id);
        if (dep.Status != DeployStatus.Queued) return;
        var repo = GetRepo(dep.RepoId);
        var site = _sites.Get(repo.Site);
        var token = Token(repo);
        var logFile = LogPath(repo.Id, id);
        Directory.CreateDirectory(Path.GetDirectoryName(logFile)!);
        await using var log = new StreamWriter(logFile, append: false, Encoding.UTF8) { AutoFlush = true };
        var redact = new List<string>();
        if (token is not null) { redact.Add(token); redact.Add(Convert.ToBase64String(Encoding.ASCII.GetBytes("x-access-token:" + token))); }
        void Line(string l) { lock (log) log.WriteLine($"{DateTime.Now:HH:mm:ss}  {l}"); }
        SetStatus(id, DeployStatus.Running);
        Line($"Deploying {repo.Owner}/{repo.Repo}@{repo.Branch} to website “{site.Name}” ({site.Kind})");

        async Task Step(string title, string exe, IEnumerable<string> args, string? cwd = null, IDictionary<string, string?>? env = null, TimeSpan? timeout = null)
        {
            Line("▶ " + title);
            if (_runner.Find(exe) is null) throw new UserFacingException($"{exe} is not installed on this server, which this project needs.");
            var r = await _runner.RunAsync(exe, args, new ProcessOptions { WorkingDirectory = cwd, Environment = env ?? new Dictionary<string, string?>(), Redact = redact, OnLine = l => Line("  " + l), Timeout = timeout ?? TimeSpan.FromMinutes(15) }, ct);
            if (r.TimedOut) throw new UserFacingException($"{title} timed out.");
            if (r.ExitCode != 0) throw new UserFacingException($"{title} failed (exit code {r.ExitCode}).");
        }

        try
        {
            var ws = Workspace(repo);
            var url = $"https://github.com/{repo.Owner}/{repo.Repo}.git";
            var auth = AuthArgs(token);
            var gitEnv = new Dictionary<string, string?> { ["GIT_TERMINAL_PROMPT"] = "0" };
            if (!Directory.Exists(Path.Combine(ws, ".git")))
            {
                if (Directory.Exists(ws)) Directory.Delete(ws, true);
                Directory.CreateDirectory(Path.GetDirectoryName(ws)!);
                await Step("Clone repository", "git", [.. auth, "clone", "--depth", "1", "--branch", repo.Branch, "--single-branch", url, ws], env: gitEnv);
            }
            else
            {
                await Step("Fetch latest code", "git", [.. auth, "-C", ws, "fetch", "--depth", "1", "origin", repo.Branch], env: gitEnv);
                await Step("Check out", "git", ["-C", ws, "reset", "--hard", "FETCH_HEAD"]);
            }
            var sha = (await _runner.RunAsync("git", ["-C", ws, "rev-parse", "HEAD"], ct: ct)).Output.Trim();
            var msg = (await _runner.RunAsync("git", ["-C", ws, "log", "-1", "--pretty=%s"], ct: ct)).Output.Trim();
            SetStatus(id, DeployStatus.Running, sha: sha, msg: msg);
            Line($"Commit {sha[..Math.Min(7, sha.Length)]}: {msg}");

            var release = SiteService.NewReleaseId();
            var releaseDir = _sites.ReleaseDir(site, release);
            var buildEnv = BuildEnvironment(site);
            var hasPackage = File.Exists(Path.Combine(ws, "package.json"));
            var csproj = Directory.EnumerateFiles(ws, "*.csproj", SearchOption.AllDirectories).FirstOrDefault(f => !f.Contains(Path.DirectorySeparatorChar + "test", StringComparison.OrdinalIgnoreCase));

            if (repo.BuildCommand.Count > 0)
                await Step("Build (custom command)", repo.BuildCommand[0], repo.BuildCommand.Skip(1), ws, buildEnv);
            else if (hasPackage)
            {
                var pkg = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(ws, "package.json"), ct)).RootElement;
                var scripts = pkg.TryGetProperty("scripts", out var s) ? s : default;
                await Step("Install dependencies", "npm", File.Exists(Path.Combine(ws, "package-lock.json")) ? ["ci", "--no-audit", "--no-fund"] : ["install", "--no-audit", "--no-fund"], ws, buildEnv);
                if (scripts.ValueKind == JsonValueKind.Object && scripts.TryGetProperty("build", out _)) await Step("Build", "npm", ["run", "build"], ws, buildEnv);
                if (repo.RunTests && scripts.ValueKind == JsonValueKind.Object && scripts.TryGetProperty("test", out _)) await Step("Test", "npm", ["test"], ws, buildEnv);
            }
            else if (csproj is not null && site.Kind == SiteKind.DotNet)
            {
                if (repo.RunTests) await Step("Test", "dotnet", ["test"], ws, buildEnv, TimeSpan.FromMinutes(20));
                await Step("Publish", "dotnet", ["publish", csproj, "-c", "Release", "-o", releaseDir], ws, buildEnv, TimeSpan.FromMinutes(20));
            }
            else Line("No build step detected; deploying files as they are.");

            if (!Directory.Exists(releaseDir))
            {
                var source = site.Kind == SiteKind.Static
                    ? Path.Combine(ws, repo.OutputDirectory ?? new[] { "dist", "build", "out", "public" }.FirstOrDefault(d => Directory.Exists(Path.Combine(ws, d)) && hasPackage) ?? "")
                    : ws;
                source = Path.GetFullPath(source);
                if (!source.StartsWith(Path.GetFullPath(ws))) throw new UserFacingException("Output folder is outside the repository.");
                if (!Directory.Exists(source)) throw new UserFacingException($"Build output folder not found: {Path.GetRelativePath(ws, source)}");
                Line($"▶ Copy {(source == Path.GetFullPath(ws) ? "project" : Path.GetRelativePath(ws, source))} → release {release}");
                CopyTree(source, releaseDir);
            }
            Line("▶ Activate release");
            await _sites.ActivateReleaseAsync(site.Name, release, dep.RequestedBy, ct);
            _store.Update(f => f.Repos.First(x => x.Id == repo.Id).LastDeployedCommit = sha);
            SetStatus(id, DeployStatus.Succeeded, release: release);
            Line("✓ Deployment succeeded");
            _audit.Write(dep.RequestedBy, "github", "Deployment succeeded", $"{repo.Owner}/{repo.Repo}", $"{sha[..Math.Min(7, sha.Length)]} → {site.Name}", AuditSeverity.Success);
        }
        catch (OperationCanceledException)
        {
            Line("✗ Deployment cancelled or timed out");
            SetStatus(id, DeployStatus.Cancelled, "Cancelled or timed out");
        }
        catch (Exception ex)
        {
            Line("✗ " + ex.Message);
            SetStatus(id, DeployStatus.Failed, ex.Message);
            _audit.Write(dep.RequestedBy, "github", "Deployment failed", $"{repo.Owner}/{repo.Repo}", ex.Message, AuditSeverity.Warning);
        }
    }

    /// <summary>
    /// Front-end builds only receive variables meant to be public (VITE_, NEXT_PUBLIC_, REACT_APP_, PUBLIC_),
    /// so secrets such as DATABASE_URL are never baked into a website's JavaScript.
    /// </summary>
    Dictionary<string, string?> BuildEnvironment(Site site)
    {
        var env = new Dictionary<string, string?> { ["CI"] = "true", ["NODE_ENV"] = "production" };
        string[] publicPrefixes = ["VITE_", "NEXT_PUBLIC_", "REACT_APP_", "PUBLIC_"];
        foreach (var src in _env)
            foreach (var (k, v) in src.For(site))
                if (site.Kind != SiteKind.Static || publicPrefixes.Any(p => k.StartsWith(p))) env[k] = v;
        return env;
    }

    static void CopyTree(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var f in Directory.EnumerateFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)), true);
        foreach (var d in Directory.EnumerateDirectories(from))
        {
            var name = Path.GetFileName(d);
            if (name == ".git" || (File.GetAttributes(d) & FileAttributes.ReparsePoint) != 0) continue;
            CopyTree(d, Path.Combine(to, name));
        }
    }
}
