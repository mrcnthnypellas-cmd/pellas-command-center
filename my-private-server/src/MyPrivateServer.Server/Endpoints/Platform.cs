using System.Text.Json;
using MyPrivateServer.Backup;
using MyPrivateServer.Containers;
using MyPrivateServer.Core;
using MyPrivateServer.Deployments;
using MyPrivateServer.Identity;
using MyPrivateServer.Monitoring;
using MyPrivateServer.RemoteAccess;
using MyPrivateServer.Server.Infrastructure;
using MyPrivateServer.Storage;
using MyPrivateServer.WebHosting;

namespace MyPrivateServer.Server.Endpoints;

public sealed record CreateSiteRequest(string Name, SiteKind Kind, int? UpstreamPort, List<string>? StartCommand, List<string>? Hostnames, string? LinkedApp);
public sealed record UpdateSiteRequest(List<string>? Hostnames, List<string>? StartCommand, bool? SpaFallback, string? LinkedApp, bool? Enabled);
public sealed record ConnectRepoRequest(string Repository, string? Branch, string? Token, string Site, bool AutoDeploy, bool RunTests, List<string>? BuildCommand, string? OutputDirectory);
public sealed record UpdateRepoRequest(string? Branch, bool? AutoDeploy, bool? RunTests, List<string>? BuildCommand, string? OutputDirectory, string? Token);
public sealed record RemoteEnableRequest(string ProviderId, Dictionary<string, string>? Options);
public sealed record RemoteTestRequest(bool Stun);
public sealed record RestoreRequest(string Artifact, bool OverwriteOriginal);
public sealed record SettingsPatch(string? ServerName, SecuritySettings? Security, int? DeployPollMinutes, string? OtlpEndpoint, int? HttpPort, int? HttpsPort, bool? AllowLan);

public static class PlatformEndpoints
{
    public static void MapWebsiteEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/websites").RequireCapability(Capability.ManageWebsites);
        g.MapGet("/", (SiteService sites) => Results.Ok(sites.List().Select(s => sites.Status(s, StunClient.LocalIPv4()))));
        g.MapPost("/", async (CreateSiteRequest r, HttpContext ctx, SiteService sites, CancellationToken ct) =>
            Results.Ok(await sites.CreateAsync(r.Name, r.Kind, r.UpstreamPort, r.StartCommand, r.Hostnames, r.LinkedApp, ctx.CurrentUser().Username, ct)));
        g.MapPatch("/{name}", async (string name, UpdateSiteRequest r, HttpContext ctx, SiteService sites, CancellationToken ct) =>
            Results.Ok(await sites.UpdateAsync(name, r.Hostnames, r.StartCommand, r.SpaFallback, r.LinkedApp, r.Enabled, ctx.CurrentUser().Username, ct)));
        g.MapDelete("/{name}", async (string name, bool? deleteFiles, HttpContext ctx, SiteService sites, CancellationToken ct) =>
        { await sites.DeleteAsync(name, deleteFiles == true, ctx.CurrentUser().Username, ct); return Results.Ok(); });
        g.MapPost("/{name}/deploy-zip", async (string name, HttpContext ctx, SiteService sites, CancellationToken ct) =>
        {
            if (ctx.Request.ContentLength > 1024L * 1024 * 1024) throw new UserFacingException("ZIP is larger than 1 GB.", 413);
            await using var ms = new MemoryStream();
            await ctx.Request.Body.CopyToAsync(ms, ct);
            ms.Position = 0;
            return Results.Ok(new { release = await sites.DeployZipAsync(name, ms, ctx.CurrentUser().Username, ct) });
        });
        g.MapPost("/{name}/{action:regex(^(start|stop|restart|rollback)$)}", async (string name, string action, HttpContext ctx, SiteService sites, CancellationToken ct) =>
        {
            var who = ctx.CurrentUser().Username;
            switch (action)
            {
                case "start": await sites.StartAppAsync(name, who, ct); break;
                case "stop": sites.StopApp(name); break;
                case "restart": await sites.RestartAppAsync(name, who, ct); break;
                case "rollback": await sites.RollbackAsync(name, who, ct); break;
            }
            return Results.Ok();
        });
        g.MapGet("/{name}/logs", (string name, SiteService sites) => Results.Ok(sites.Logs(name)));
        g.MapGet("/webserver", async (SiteService sites, CaddyManager caddy, CancellationToken ct) =>
            Results.Ok(new { status = await caddy.StatusAsync(ct), caddyfile = CaddyManager.Render(sites.List(), s => s.CurrentRelease is null ? null : sites.ReleaseDir(s, s.CurrentRelease)), logs = caddy.Logs() }));
    }

    public static void MapDeploymentEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/github").RequireCapability(Capability.ManageDeployments);
        g.MapGet("/repos", (DeploymentService d) => Results.Ok(d.Repos()));
        g.MapPost("/repos", async (ConnectRepoRequest r, HttpContext ctx, DeploymentService d, CancellationToken ct) =>
        {
            var (repo, secret) = await d.ConnectAsync(r.Repository, r.Branch, r.Token, r.Site, r.AutoDeploy, r.RunTests, r.BuildCommand, r.OutputDirectory, ctx.CurrentUser().Username, ct);
            return Results.Ok(new { repo, webhookSecret = secret, note = "Auto-deploy checks GitHub for new commits every few minutes. A webhook is optional and only works when the server is reachable through remote access." });
        });
        g.MapPatch("/repos/{id}", (string id, UpdateRepoRequest r, HttpContext ctx, DeploymentService d) =>
            Results.Ok(d.Update(id, r.Branch, r.AutoDeploy, r.RunTests, r.BuildCommand, r.OutputDirectory, r.Token, ctx.CurrentUser().Username)));
        g.MapDelete("/repos/{id}", (string id, HttpContext ctx, DeploymentService d) => { d.Disconnect(id, ctx.CurrentUser().Username); return Results.Ok(); });
        g.MapGet("/repos/{id}/latest", async (string id, DeploymentService d, CancellationToken ct) => Results.Ok(await d.LatestCommitAsync(id, ct)));
        g.MapPost("/repos/{id}/deploy", (string id, HttpContext ctx, DeploymentService d) => Results.Ok(new { id = d.Enqueue(id, "manual", ctx.CurrentUser().Username) }));
        g.MapGet("/deployments", (string? repoId, DeploymentService d) => Results.Ok(d.History(repoId)));
        g.MapGet("/deployments/{id}/log", (string id, DeploymentService d) => Results.Text(d.ReadLog(id)));
        g.MapPost("/deployments/cancel", (DeploymentService d) => { d.CancelCurrent(); return Results.Ok(); });

        // Signed GitHub webhook (optional). Anonymous, verified by HMAC-SHA256.
        app.MapPost("/api/github/webhook/{id}", async (string id, HttpContext ctx, DeploymentService d, CancellationToken ct) =>
        {
            await using var ms = new MemoryStream();
            await ctx.Request.Body.CopyToAsync(ms, ct);
            var body = ms.ToArray();
            if (body.Length > 5 * 1024 * 1024 || !d.VerifyWebhook(id, body, ctx.Request.Headers["X-Hub-Signature-256"])) return Results.StatusCode(401);
            if (ctx.Request.Headers["X-GitHub-Event"] == "ping") return Results.Ok(new { ok = true });
            if (ctx.Request.Headers["X-GitHub-Event"] != "push") return Results.Ok(new { ignored = true });
            using var doc = JsonDocument.Parse(body);
            var branch = doc.RootElement.TryGetProperty("ref", out var r) ? r.GetString() : null;
            if (branch != "refs/heads/" + d.BranchFor(id)) return Results.Ok(new { ignored = "other branch" });
            try { return Results.Ok(new { deployment = d.Enqueue(id, "webhook", "github") }); }
            catch (ConflictException) { return Results.Ok(new { queued = "already" }); }
        }).RequireRateLimiting("login");
    }

    public static void MapDockerEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/docker").RequireCapability(Capability.ManageContainers);
        g.MapGet("/status", async (DockerService d, CancellationToken ct) => Results.Ok(await d.StatusAsync(ct)));
        g.MapGet("/containers", async (DockerService d, CancellationToken ct) => Results.Ok(await d.ListAsync(ct)));
        g.MapPost("/containers", async (CreateContainerRequest r, HttpContext ctx, DockerService d, CancellationToken ct) => Results.Ok(new { id = await d.CreateAsync(r, ctx.CurrentUser().Username, ct) }));
        g.MapPost("/containers/{id}/{action:regex(^(start|stop|restart)$)}", async (string id, string action, HttpContext ctx, DockerService d, CancellationToken ct) =>
        { await d.ActionAsync(id, action, ctx.CurrentUser().Username, ct); return Results.Ok(); });
        g.MapGet("/containers/{id}/logs", async (string id, int? tail, DockerService d, CancellationToken ct) => Results.Text(await d.LogsAsync(id, tail ?? 300, ct)));
        app.MapDelete("/api/docker/containers/{id}", async (string id, HttpContext ctx, DockerService d, CancellationToken ct) =>
        { await d.RemoveAsync(id, ctx.CurrentUser().Username, ct); return Results.Ok(); }).RequireCapability(Capability.RemoveContainers);
    }

    public static void MapBackupEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/backups").RequireCapability(Capability.ManageBackups);
        g.MapGet("/jobs", (BackupService b) => Results.Ok(b.Jobs().Select(j => new
        {
            job = j, next = BackupService.NextRun(j, b.Runs(j.Id, 1).FirstOrDefault()?.StartedAt ?? j.CreatedAt, DateTimeOffset.Now),
            last = b.Runs(j.Id, 1).FirstOrDefault(), warnings = b.DestinationWarnings(j.Destination),
        })));
        g.MapPost("/jobs", (BackupJob job, HttpContext ctx, BackupService b) => Results.Ok(b.Save(job, ctx.CurrentUser().Username)));
        g.MapDelete("/jobs/{id}", (string id, HttpContext ctx, BackupService b) => { b.Delete(id, ctx.CurrentUser().Username); return Results.Ok(); });
        g.MapPost("/jobs/{id}/run", (string id, HttpContext ctx, BackupService b) =>
        {
            b.Job(id);
            if (b.IsRunning) throw new ConflictException("Another backup is running. Try again when it finishes.");
            var who = ctx.CurrentUser().Username;
            _ = Task.Run(() => b.RunNowAsync(id, who, CancellationToken.None));
            return Results.Accepted();
        });
        g.MapGet("/runs", (string? jobId, BackupService b) => Results.Ok(b.Runs(jobId)));
        g.MapPost("/runs/{id}/verify", async (string id, BackupService b, CancellationToken ct) => Results.Ok(await b.VerifyAsync(id, ct)));
        g.MapPost("/runs/{id}/restore", async (string id, RestoreRequest r, HttpContext ctx, BackupService b, CancellationToken ct) =>
            Results.Ok(new { message = await b.RestoreAsync(id, r.Artifact, r.OverwriteOriginal, ctx.CurrentUser().Username, ct) }));
        g.MapGet("/destinations", async (IStorageDetector detector, SettingsStore settings, BackupService b, CancellationToken ct) =>
        {
            var root = settings.Get().StorageRoot;
            var drives = await detector.DetectAsync(ct);
            var list = drives.Where(d => d.IsReady).Select(d => new { d.Root, d.Label, d.Kind, d.FreeBytes, suggested = Path.Combine(d.Root, "Backups"), warnings = b.DestinationWarnings(Path.Combine(d.Root, "Backups")) }).ToList();
            if (root is not null) list.Insert(0, new { Root = Path.Combine(root, "Backups"), Label = "Backups folder (same drive)", Kind = DriveKind.Unknown, FreeBytes = 0L, suggested = Path.Combine(root, "Backups"), warnings = b.DestinationWarnings(Path.Combine(root, "Backups")) });
            return Results.Ok(list);
        });
    }

    public static void MapRemoteAccessEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/remote-access").RequireCapability(Capability.ManageRemoteAccess);
        g.MapGet("/", (RemoteAccessService r, SettingsStore s) => Results.Ok(new
        {
            serverId = s.Get().ServerId, enabled = s.Get().RemoteAccess.Enabled, providerId = s.Get().RemoteAccess.ProviderId,
            status = r.Status, providers = r.Providers(), options = r.MaskedOptions(), events = r.Events(),
            local = StunClient.LocalIPv4().Select(ip => $"http://{ip}:{s.Get().Network.HttpPort}"),
        }));
        g.MapPost("/enable", async (RemoteEnableRequest req, HttpContext ctx, RemoteAccessService r, CancellationToken ct) =>
            Results.Ok(await r.EnableAsync(req.ProviderId, req.Options, ctx.CurrentUser().Username, ct)));
        g.MapPost("/disable", async (HttpContext ctx, RemoteAccessService r, CancellationToken ct) => { await r.DisableAsync(ctx.CurrentUser().Username, ct); return Results.Ok(r.Status); });
        g.MapPost("/reconnect", async (HttpContext ctx, RemoteAccessService r, CancellationToken ct) => Results.Ok(await r.ReconnectAsync(ctx.CurrentUser().Username, ct)));
        g.MapPost("/test", async (RemoteTestRequest req, RemoteAccessService r, CancellationToken ct) => Results.Ok(await r.TestAsync(req.Stun, ct)));
    }

    public static void MapSystemEndpoints(this WebApplication app)
    {
        app.MapGet("/api/dashboard", async (HttpContext ctx, SettingsStore s, MetricsCollector m, StorageService storage, RemoteAccessService remote, HealthService health, CancellationToken ct) =>
        {
            var settings = s.Get();
            var cur = m.Latest;
            var st = storage.Status();
            var u = ctx.CurrentUser();
            return Results.Ok(new
            {
                server = new { name = settings.ServerName, id = settings.ServerId, online = true, uptime = m.ServerUptime.TotalSeconds, version = "0.2.0-prototype" },
                cpu = cur.CpuPercent, memory = new { used = cur.MemoryUsedBytes, total = cur.MemoryTotalBytes },
                storage = st,
                remote = new { remote.Status.State, remote.Status.Method, remote.Status.Reason },
                health = RoleCapabilities.Has(u.Role, Capability.ViewMonitoring) ? await health.CheckAllAsync(ct) : [],
                local = StunClient.LocalIPv4().Select(ip => $"http://{ip}:{settings.Network.HttpPort}"),
            });
        }).RequireAuthorization();

        var g = app.MapGroup("/api/system").RequireCapability(Capability.ViewMonitoring);
        g.MapGet("/", async (MetricsCollector m, StorageService storage, HealthService health, CancellationToken ct) =>
            Results.Ok(new { snapshot = m.Snapshot(), storage = storage.Status(), health = await health.CheckAllAsync(ct) }));
        g.MapGet("/metrics", (MetricsCollector m) => Results.Ok(m.History()));
        g.MapGet("/external-services", (IEnumerable<IExternalServiceSource> sources) => Results.Ok(sources.SelectMany(x => x.GetDisclosures())));

        var logs = app.MapGroup("/api/logs").RequireCapability(Capability.ViewAuditLogs);
        logs.MapGet("/audit", (string? category, string? q, int? limit, IAuditLog audit) => Results.Ok(audit.Query(category, q, limit ?? 200)));
        logs.MapGet("/server", (ServerPaths paths) =>
        {
            var latest = new DirectoryInfo(paths.LogsDirectory).GetFiles("server-*.log").OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
            if (latest is null) return Results.Text("");
            using var fs = new FileStream(latest.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs);
            var lines = sr.ReadToEnd().Split('\n');
            return Results.Text(string.Join('\n', lines.TakeLast(400)));
        });

        var cfg = app.MapGroup("/api/settings").RequireCapability(Capability.ManageSettings);
        cfg.MapGet("/", (SettingsStore s) =>
        {
            var x = s.Get();
            return Results.Ok(new { x.ServerName, x.ServerId, x.StorageRoot, x.Network, x.Security, deployPollMinutes = x.Deployments.PollMinutes, otlpEndpoint = x.Telemetry.OtlpEndpoint });
        });
        cfg.MapPatch("/", (SettingsPatch p, HttpContext ctx, SettingsStore s, IAuditLog audit) =>
        {
            if (p.ServerName is not null && (p.ServerName.Trim().Length is 0 or > 60)) throw new UserFacingException("Server name must be 1–60 characters.");
            if (p.Security is { } sec && (sec.MinPasswordLength is < 8 or > 128 || sec.MaxFailedLogins is < 3 or > 50 || sec.LockoutMinutes is < 1 or > 1440 || sec.SessionIdleMinutes is < 5 or > 1440))
                throw new UserFacingException("Security values are out of range.");
            if (p.OtlpEndpoint is { Length: > 0 } ep && !Uri.TryCreate(ep, UriKind.Absolute, out _)) throw new UserFacingException("Telemetry endpoint must be a URL.");
            foreach (var port in new[] { p.HttpPort, p.HttpsPort }) if (port is not null and (< 1024 or > 65535)) throw new UserFacingException("Ports must be 1024–65535.");
            s.Update(x =>
            {
                if (p.ServerName is not null) x.ServerName = p.ServerName.Trim();
                if (p.Security is not null) x.Security = p.Security;
                if (p.DeployPollMinutes is { } m) x.Deployments.PollMinutes = Math.Clamp(m, 1, 1440);
                if (p.OtlpEndpoint is not null) x.Telemetry.OtlpEndpoint = p.OtlpEndpoint.Length == 0 ? null : p.OtlpEndpoint;
                if (p.HttpPort is { } hp) x.Network.HttpPort = hp;
                if (p.HttpsPort is { } sp) x.Network.HttpsPort = sp;
                if (p.AllowLan is { } lan) x.Network.AllowLan = lan;
            });
            audit.Write(ctx.CurrentUser().Username, "settings", "Settings updated", null,
                p.HttpPort is not null || p.HttpsPort is not null || p.AllowLan is not null ? "Network changes apply after the service restarts." : null);
            return Results.Ok();
        });
    }
}
