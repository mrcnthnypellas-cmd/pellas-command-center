using MyPrivateServer.Core;
using MyPrivateServer.Databases;
using MyPrivateServer.Files;
using MyPrivateServer.Identity;
using MyPrivateServer.RemoteAccess;
using MyPrivateServer.Server.Infrastructure;
using MyPrivateServer.Storage;

namespace MyPrivateServer.Server.Endpoints;

public sealed record LoginRequest(string Username, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record SetupRequest(string ServerName, string StoragePath, string AdminUsername, string AdminDisplayName, string AdminPassword, string? RemoteProvider = null);
public sealed record CreateUserRequest(string Username, string? DisplayName, Role Role, string Password, long QuotaBytes);
public sealed record UpdateUserRequest(string? DisplayName, Role? Role, long? QuotaBytes, bool? Disabled);
public sealed record SetPasswordRequest(string Password);

public static class AuthSetupUserEndpoints
{
    static object Me(User u) => new
    {
        u.Id, u.Username, u.DisplayName, Role = u.Role.ToString(), Capabilities = RoleCapabilities.For(u.Role).Select(c => c.ToString()),
        u.QuotaBytes, u.LastLoginAt,
    };

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/auth");
        g.MapGet("/csrf", (HttpContext ctx) => Results.Ok(new { token = Csrf.Ensure(ctx) }));

        g.MapPost("/login", (LoginRequest req, HttpContext ctx, UserService users) =>
        {
            var r = users.VerifyLogin(req.Username ?? "", req.Password ?? "", ctx.ClientIp());
            switch (r.Outcome)
            {
                case LoginOutcome.LockedOut:
                    return Results.Json(new { error = $"Too many failed attempts. Try again after {r.LockedUntil?.ToLocalTime():t}." }, statusCode: 423);
                case LoginOutcome.Disabled:
                case LoginOutcome.InvalidCredentials:
                    return Results.Json(new { error = "Wrong username or password." }, statusCode: 401);
            }
            var sid = users.CreateSession(r.User!, ctx.ClientIp(), ctx.Request.Headers.UserAgent);
            ctx.Response.Cookies.Append(SessionAuthHandler.CookieName, sid, new CookieOptions
            {
                HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = ctx.Request.IsHttps, Path = "/", IsEssential = true,
            });
            Csrf.Ensure(ctx);
            return Results.Ok(Me(r.User!));
        }).RequireRateLimiting("login");

        g.MapPost("/logout", (HttpContext ctx, UserService users) =>
        {
            if (ctx.Request.Cookies.TryGetValue(SessionAuthHandler.CookieName, out var sid)) users.RevokeSession(sid);
            ctx.Response.Cookies.Delete(SessionAuthHandler.CookieName);
            return Results.Ok();
        });

        g.MapGet("/me", (HttpContext ctx) => Results.Ok(Me(ctx.CurrentUser()))).RequireAuthorization();

        g.MapPost("/password", (ChangePasswordRequest req, HttpContext ctx, UserService users) =>
        {
            users.ChangeOwnPassword(ctx.CurrentUser().Id, req.CurrentPassword, req.NewPassword, ctx.SessionId());
            return Results.Ok();
        }).RequireAuthorization();

        g.MapGet("/sessions", (HttpContext ctx, UserService users) =>
        {
            var me = ctx.CurrentUser();
            var all = users.ListSessions(ctx.SessionId());
            return Results.Ok(me.Role == Role.Administrator ? all : all.Where(s => s.UserId == me.Id));
        }).RequireAuthorization();

        g.MapDelete("/sessions/{handle}", (string handle, HttpContext ctx, UserService users) =>
        {
            var me = ctx.CurrentUser();
            var s = users.ListSessions().FirstOrDefault(x => x.Id.Split(':')[0] == handle.Split(':')[0]) ?? throw new NotFoundException("Session not found.");
            if (s.UserId != me.Id && me.Role != Role.Administrator) throw new ForbiddenException();
            users.RevokeSessionByHandle(handle, me.Username);
            return Results.Ok();
        }).RequireAuthorization();
    }

    public static void MapSetupEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/setup");
        g.MapGet("/status", (HttpContext ctx, SettingsStore settings, ServerPaths paths) =>
        {
            var s = settings.Get();
            return Results.Ok(new
            {
                s.SetupCompleted, s.ServerId, s.ServerName, allowedFromThisDevice = !s.SetupCompleted && SetupGate.Allowed(ctx, paths), tokenFile = paths.SetupTokenFile,
                components = s.SetupCompleted ? null : Components(),
            });
        });

        g.MapGet("/drives", async (HttpContext ctx, SettingsStore settings, ServerPaths paths, IStorageDetector detector, CancellationToken ct) =>
        {
            if (settings.Get().SetupCompleted || !SetupGate.Allowed(ctx, paths)) throw new ForbiddenException("Setup is only available from this PC or with the setup token.");
            var drives = await detector.DetectAsync(ct);
            return Results.Ok(drives.Select(d => new { drive = d, suggestedPath = Path.Combine(d.Root, "MyPrivateServer") }));
        });

        g.MapPost("/complete", async (SetupRequest req, HttpContext ctx, SettingsStore settings, ServerPaths paths, UserService users, IAuditLog audit,
            ManagedPostgres managedPg, RemoteAccessService remote, CancellationToken ct) =>
        {
            if (settings.Get().SetupCompleted) throw new ConflictException("Setup has already been completed.");
            if (!SetupGate.Allowed(ctx, paths)) throw new ForbiddenException("Setup is only available from this PC or with the setup token.");
            if (string.IsNullOrWhiteSpace(req.ServerName) || req.ServerName.Length > 60) throw new UserFacingException("Enter a server name (up to 60 characters).");
            users.ValidatePassword(req.AdminPassword);
            Names.Username(req.AdminUsername);
            var root = StorageService.PrepareRoot(req.StoragePath);
            if (!users.AnyUsers()) users.Create(req.AdminUsername, req.AdminDisplayName, Role.Administrator, req.AdminPassword, 0, "setup");
            settings.Update(s => { s.ServerName = req.ServerName.Trim(); s.StorageRoot = root; s.SetupCompleted = true; s.SetupCompletedAt = DateTimeOffset.UtcNow; });
            try { File.Delete(paths.SetupTokenFile); } catch { }
            audit.Write(req.AdminUsername, "system", "Setup completed", req.ServerName, $"Storage {root}", AuditSeverity.Success, ctx.ClientIp());

            // Plug and play: create the database server from the bundled PostgreSQL.
            ManagedPostgresResult? db = null;
            if (!settings.Get().Postgres.Enabled && managedPg.BinariesAvailable)
                db = await managedPg.InitializeAsync(root, ct);

            // Turn on the chosen remote access method in the background (it may take a moment to connect).
            if (!string.IsNullOrEmpty(req.RemoteProvider) && req.RemoteProvider != "none")
                _ = Task.Run(async () =>
                {
                    try { await remote.EnableAsync(req.RemoteProvider, null, req.AdminUsername, CancellationToken.None); }
                    catch (Exception ex) { audit.Write("system", "remote", "Remote access could not start", req.RemoteProvider, ex.Message, AuditSeverity.Warning); }
                });
            return Results.Ok(new { settings.Get().ServerId, storageRoot = root, database = db, remoteProvider = req.RemoteProvider });
        });
    }

    /// <summary>Which bundled helper programs this installation has.</summary>
    static object Components() => new
    {
        postgres = ToolLocator.Find("initdb") is not null, caddy = ToolLocator.Find("caddy") is not null, git = ToolLocator.Find("git") is not null,
        node = ToolLocator.Find("node") is not null, cloudflared = ToolLocator.Find("cloudflared") is not null, frpc = ToolLocator.Find("frpc") is not null,
        tailscale = ToolLocator.Find("tailscale") is not null,
    };

    public static void MapUserEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/users").RequireCapability(Capability.ManageUsers);
        g.MapGet("/", (UserService users, FileService files) => Results.Ok(users.List().Select(u => new { user = UserView.From(u), homeUsageBytes = SafeUsage(files, u.Username) })));
        g.MapPost("/", (CreateUserRequest r, HttpContext ctx, UserService users) =>
            Results.Ok(UserView.From(users.Create(r.Username, r.DisplayName ?? "", r.Role, r.Password, r.QuotaBytes, ctx.CurrentUser().Username))));
        g.MapPatch("/{id}", (string id, UpdateUserRequest r, HttpContext ctx, UserService users) =>
            Results.Ok(UserView.From(users.Update(id, r.DisplayName, r.Role, r.QuotaBytes, r.Disabled, ctx.CurrentUser().Username))));
        g.MapPost("/{id}/password", (string id, SetPasswordRequest r, HttpContext ctx, UserService users) =>
        { users.SetPassword(id, r.Password, ctx.CurrentUser().Username); return Results.Ok(); });
        g.MapDelete("/{id}", (string id, HttpContext ctx, UserService users) =>
        {
            if (id == ctx.CurrentUser().Id) throw new UserFacingException("You cannot delete your own account.");
            users.Delete(id, ctx.CurrentUser().Username); return Results.Ok();
        });
    }

    static long SafeUsage(FileService files, string username) { try { return files.HomeUsage(username); } catch { return 0; } }

    public static void MapStorageEndpoints(this WebApplication app)
    {
        app.MapGet("/api/storage", async (StorageService storage, IStorageDetector detector, CancellationToken ct) =>
        {
            var status = storage.Status();
            var drives = await detector.DetectAsync(ct);
            var folders = status.Online ? StorageService.Folders.Select(f => new { name = f, path = storage.PathFor(f) }) : [];
            return Results.Ok(new { status, drives, folders });
        }).RequireCapability(Capability.ViewMonitoring);
    }
}
