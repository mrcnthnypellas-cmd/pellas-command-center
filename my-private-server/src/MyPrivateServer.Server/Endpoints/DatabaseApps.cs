using System.Text.Json;
using MyPrivateServer.Core;
using MyPrivateServer.Databases;
using MyPrivateServer.Files;
using MyPrivateServer.Identity;
using MyPrivateServer.Server.Infrastructure;
using MyPrivateServer.Storage;

namespace MyPrivateServer.Server.Endpoints;

public sealed record PgConnectionRequest(string Host, int Port, string AdminUser, string? Password, string? PublicHost);
public sealed record CreateDatabaseRequest(string Name, string? Owner);
public sealed record CreateRoleRequest(string Name);
public sealed record GrantRequest(string Database, string Role, GrantLevel Level);
public sealed record RestoreDatabaseRequest(string Database, string File, string Confirm);
public sealed record CreateAppRequest(string Name);
public sealed record CreateKeyRequest(string Name, ApiKeyScope Scope);
public sealed record EnvRequest(string Key, string? Value);
public sealed record OriginsRequest(List<string> Origins);
public sealed record AppAuthRequest(string Email, string Password);

public static class DatabaseEndpoints
{
    public static void MapDatabaseEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/database").RequireCapability(Capability.ManageDatabases);
        g.MapGet("/status", async (PostgresProvider pg, CancellationToken ct) => Results.Ok(await pg.StatusAsync(ct)));
        g.MapPut("/connection", async (PgConnectionRequest r, HttpContext ctx, PostgresProvider pg, CancellationToken ct) =>
        { await pg.ConfigureAsync(r.Host, r.Port, r.AdminUser, r.Password, r.PublicHost, ctx.CurrentUser().Username, ct); return Results.Ok(await pg.StatusAsync(ct)); });
        g.MapGet("/connection", (SettingsStore s) => { var p = s.Get().Postgres; return Results.Ok(new { p.Enabled, p.Host, p.Port, p.AdminUser, p.PublicHost, hasPassword = p.AdminPasswordProtected is not null }); });

        g.MapGet("/databases", async (IDatabaseProvider db, CancellationToken ct) => Results.Ok(await db.ListDatabasesAsync(ct)));
        g.MapPost("/databases", async (CreateDatabaseRequest r, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        {
            await db.CreateDatabaseAsync(r.Name, string.IsNullOrWhiteSpace(r.Owner) ? null : r.Owner, ct);
            audit.Write(ctx.CurrentUser().Username, "database", "Database created", r.Name, null, AuditSeverity.Success);
            return Results.Ok();
        });
        g.MapDelete("/databases/{name}", async (string name, string confirm, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        {
            if (confirm != name) throw new UserFacingException("Type the database name to confirm deletion.");
            await db.DropDatabaseAsync(name, ct);
            audit.Write(ctx.CurrentUser().Username, "database", "Database deleted", name, null, AuditSeverity.Critical);
            return Results.Ok();
        });

        g.MapGet("/roles", async (IDatabaseProvider db, CancellationToken ct) => Results.Ok(await db.ListRolesAsync(ct)));
        g.MapPost("/roles", async (CreateRoleRequest r, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        {
            var pw = await db.CreateRoleAsync(r.Name, ct);
            audit.Write(ctx.CurrentUser().Username, "database", "Database user created", r.Name, null, AuditSeverity.Success);
            return Results.Ok(new { name = r.Name, password = pw, note = "Copy this password now. It will not be shown again." });
        });
        g.MapPost("/roles/{name}/password", async (string name, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        {
            var pw = await db.ResetRolePasswordAsync(name, ct);
            audit.Write(ctx.CurrentUser().Username, "database", "Database password reset", name, null, AuditSeverity.Warning);
            return Results.Ok(new { name, password = pw });
        });
        g.MapDelete("/roles/{name}", async (string name, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        { await db.DropRoleAsync(name, ct); audit.Write(ctx.CurrentUser().Username, "database", "Database user deleted", name, null, AuditSeverity.Warning); return Results.Ok(); });
        g.MapPost("/grants", async (GrantRequest r, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        { await db.GrantAsync(r.Database, r.Role, r.Level, ct); audit.Write(ctx.CurrentUser().Username, "database", "Database permission granted", $"{r.Role} → {r.Database}", r.Level.ToString()); return Results.Ok(); });
        g.MapDelete("/grants", async (string database, string role, HttpContext ctx, IDatabaseProvider db, IAuditLog audit, CancellationToken ct) =>
        { await db.RevokeAllAsync(database, role, ct); audit.Write(ctx.CurrentUser().Username, "database", "Database permissions revoked", $"{role} → {database}", null, AuditSeverity.Warning); return Results.Ok(); });

        g.MapGet("/connection-info/{database}", (string database, string role, IDatabaseProvider db) => Results.Ok(db.Connection(database, role, null)));

        // One-click backup to Backups\Databases on the storage drive; restore from that folder.
        g.MapPost("/databases/{name}/backup", async (string name, HttpContext ctx, IDatabaseProvider db, StorageService storage, IAuditLog audit, CancellationToken ct) =>
        {
            var file = Path.Combine(storage.PathFor("Backups"), "Databases", $"{Names.SqlIdentifier(name)}-{DateTime.Now:yyyyMMdd-HHmmss}.dump");
            await db.BackupAsync(name, file, ct);
            audit.Write(ctx.CurrentUser().Username, "backup", "Database backup created", name, Path.GetFileName(file), AuditSeverity.Success);
            return Results.Ok(new { file = Path.GetFileName(file), size = new FileInfo(file).Length });
        });
        g.MapGet("/backups", (StorageService storage) =>
        {
            var dir = Path.Combine(storage.PathFor("Backups"), "Databases");
            return Results.Ok(Directory.Exists(dir)
                ? new DirectoryInfo(dir).GetFiles("*.dump").OrderByDescending(f => f.LastWriteTimeUtc).Select(f => new { file = f.Name, size = f.Length, created = f.LastWriteTimeUtc })
                : []);
        });
        g.MapPost("/restore", async (RestoreDatabaseRequest r, HttpContext ctx, IDatabaseProvider db, StorageService storage, IAuditLog audit, CancellationToken ct) =>
        {
            if (r.Confirm != r.Database) throw new UserFacingException("Type the database name to confirm. Restoring replaces its current contents.");
            var file = SafePath.Combine(Path.Combine(storage.PathFor("Backups"), "Databases"), [r.File]);
            await db.RestoreAsync(r.Database, file, ct);
            audit.Write(ctx.CurrentUser().Username, "backup", "Database restored", r.Database, r.File, AuditSeverity.Critical);
            return Results.Ok();
        });
    }

    // ---------------- apps (developer backend platform) ----------------

    static AppInfo OwnedApp(HttpContext ctx, AppService apps, string slug)
    {
        var app = apps.Get(slug);
        var u = ctx.CurrentUser();
        if (u.Role != Role.Administrator && app.OwnerUserId != u.Id) throw new NotFoundException("App not found.");
        return app;
    }

    public static void MapAppEndpoints(this WebApplication web)
    {
        var g = web.MapGroup("/api/apps").RequireCapability(Capability.UseApps);
        g.MapGet("/", (HttpContext ctx, AppService apps) => { var u = ctx.CurrentUser(); return Results.Ok(apps.List(u.Role == Role.Administrator ? null : u.Id)); });
        g.MapPost("/", async (CreateAppRequest r, HttpContext ctx, AppService apps, CancellationToken ct) =>
        {
            var created = await apps.CreateAsync(r.Name, ctx.CurrentUser().Id, ctx.CurrentUser().Username, ct);
            return Results.Ok(new { created.App, connection = created.Connection, note = "Copy the database password now. It is stored encrypted and only shown again through an audited reveal." });
        });
        g.MapDelete("/{slug}", async (string slug, string confirm, HttpContext ctx, AppService apps, CancellationToken ct) =>
        {
            OwnedApp(ctx, apps, slug);
            if (confirm != slug) throw new UserFacingException("Type the app name to confirm. Its database will be deleted.");
            await apps.DeleteAsync(slug, ctx.CurrentUser().Username, ct);
            return Results.Ok();
        });
        g.MapGet("/{slug}", async (string slug, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
        {
            var a = OwnedApp(ctx, apps, slug);
            object tables;
            try { tables = await data.TablesAsync(a, ct); } catch (Exception ex) { tables = new { error = ex.Message }; }
            return Results.Ok(new
            {
                app = a, keys = apps.Keys(slug), env = apps.EnvKeys(slug), tables,
                endpoints = new { rest = $"/api/data/{slug}/rest/{{table}}", auth = $"/api/data/{slug}/auth/login", storage = $"/api/data/{slug}/storage/{{path}}" },
            });
        });
        g.MapPost("/{slug}/connection/reveal", (string slug, HttpContext ctx, AppService apps) => { OwnedApp(ctx, apps, slug); return Results.Ok(apps.RevealConnection(slug, ctx.CurrentUser().Username)); });
        g.MapPost("/{slug}/keys", (string slug, CreateKeyRequest r, HttpContext ctx, AppService apps) =>
        {
            OwnedApp(ctx, apps, slug);
            var (info, key) = apps.CreateKey(slug, r.Name, r.Scope, ctx.CurrentUser().Username);
            return Results.Ok(new { info, key, note = "Copy this key now. Only a hash is stored." });
        });
        g.MapDelete("/{slug}/keys/{id}", (string slug, string id, HttpContext ctx, AppService apps) => { OwnedApp(ctx, apps, slug); apps.RevokeKey(slug, id, ctx.CurrentUser().Username); return Results.Ok(); });
        g.MapPut("/{slug}/env", (string slug, EnvRequest r, HttpContext ctx, AppService apps) => { OwnedApp(ctx, apps, slug); apps.SetEnv(slug, r.Key, r.Value, ctx.CurrentUser().Username); return Results.Ok(apps.EnvKeys(slug)); });
        g.MapPut("/{slug}/origins", (string slug, OriginsRequest r, HttpContext ctx, AppService apps) => { OwnedApp(ctx, apps, slug); apps.SetAllowedOrigins(slug, r.Origins, ctx.CurrentUser().Username); return Results.Ok(); });
    }

    // ---------------- public data API (API-key authenticated; used by websites and mobile apps) ----------------

    static (AppInfo App, ApiKeyScope Scope) Key(HttpContext ctx, AppService apps, string slug)
    {
        var header = ctx.Request.Headers["apikey"].ToString();
        if (string.IsNullOrEmpty(header) && ctx.Request.Headers.Authorization.ToString() is { } auth && auth.StartsWith("Bearer mps_")) header = auth[7..];
        var k = apps.Authenticate(header);
        if (k is null || k.Value.App.Slug != slug) throw new UserFacingException("A valid API key for this app is required (apikey header).", 401);
        return k.Value;
    }

    static void RequireWrite(ApiKeyScope s) { if (s != ApiKeyScope.Write) throw new ForbiddenException("This API key is read-only."); }

    static AppUserToken? UserToken(HttpContext ctx, DataApi data, AppInfo app) => data.ValidateUserToken(app, ctx.Request.Headers["X-App-User-Token"].ToString());

    static List<KeyValuePair<string, string>> Query(HttpContext ctx) => ctx.Request.Query.SelectMany(q => q.Value.Select(v => new KeyValuePair<string, string>(q.Key, v ?? ""))).ToList();

    static async Task<JsonElement> Body(HttpContext ctx, CancellationToken ct)
    {
        if (ctx.Request.ContentLength > 10 * 1024 * 1024) throw new UserFacingException("Request body is too large.", 413);
        try { return await JsonSerializer.DeserializeAsync<JsonElement>(ctx.Request.Body, cancellationToken: ct); }
        catch (JsonException) { throw new UserFacingException("Send a valid JSON body."); }
    }

    static IResult Json(string json) => Results.Content(json, "application/json");

    public static void MapDataApiEndpoints(this WebApplication web)
    {
        var g = web.MapGroup("/api/data/{app}").RequireRateLimiting("data");

        // CORS: only origins listed for the app (e.g. a frontend on Vercel) may call it from a browser.
        g.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var slug = http.Request.RouteValues["app"]?.ToString() ?? "";
            var origin = http.Request.Headers.Origin.ToString();
            if (!string.IsNullOrEmpty(origin))
            {
                var apps = http.RequestServices.GetRequiredService<AppService>();
                var allowed = apps.List().FirstOrDefault(a => a.Slug == slug)?.AllowedOrigins ?? [];
                if (allowed.Contains(origin.TrimEnd('/')))
                {
                    http.Response.Headers.AccessControlAllowOrigin = origin;
                    http.Response.Headers.Vary = "Origin";
                    http.Response.Headers.AccessControlAllowHeaders = "apikey, authorization, content-type, x-app-user-token";
                    http.Response.Headers.AccessControlAllowMethods = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
                    http.Response.Headers.AccessControlMaxAge = "600";
                }
                else if (HttpMethods.IsOptions(http.Request.Method)) return Results.StatusCode(403);
            }
            return HttpMethods.IsOptions(http.Request.Method) ? Results.NoContent() : await next(ctx);
        });
        g.MapMethods("/{**rest}", ["OPTIONS"], () => Results.NoContent());

        g.MapGet("/", async (string app, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) => Results.Ok(await data.TablesAsync(Key(ctx, apps, app).App, ct)));
        g.MapGet("/rest/{table}", async (string app, string table, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
        { var k = Key(ctx, apps, app); return Json(await data.SelectAsync(k.App, table, Query(ctx), UserToken(ctx, data, k.App), ct)); });
        g.MapPost("/rest/{table}", async (string app, string table, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
        { var k = Key(ctx, apps, app); RequireWrite(k.Scope); return Json(await data.InsertAsync(k.App, table, await Body(ctx, ct), UserToken(ctx, data, k.App), ct)); });
        g.MapPatch("/rest/{table}", async (string app, string table, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
        { var k = Key(ctx, apps, app); RequireWrite(k.Scope); return Json(await data.UpdateAsync(k.App, table, Query(ctx), await Body(ctx, ct), UserToken(ctx, data, k.App), ct)); });
        g.MapDelete("/rest/{table}", async (string app, string table, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
        { var k = Key(ctx, apps, app); RequireWrite(k.Scope); return Json(await data.DeleteAsync(k.App, table, Query(ctx), UserToken(ctx, data, k.App), ct)); });

        g.MapPost("/auth/signup", async (string app, AppAuthRequest r, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
            Results.Ok(await data.SignUpAsync(Key(ctx, apps, app).App, r.Email, r.Password, ct))).RequireRateLimiting("login");
        g.MapPost("/auth/login", async (string app, AppAuthRequest r, HttpContext ctx, AppService apps, DataApi data, CancellationToken ct) =>
            Results.Ok(await data.SignInAsync(Key(ctx, apps, app).App, r.Email, r.Password, ct))).RequireRateLimiting("login");

        // Per-app file storage under Applications\<app>\storage on the server's drive.
        string StoragePath(StorageService s, AppInfo a, string? path) =>
            SafePath.Combine(Path.Combine(s.PathFor("Applications"), a.Slug, "storage"), SafePath.Segments(path));
        g.MapGet("/storage/{**path}", (string app, string? path, HttpContext ctx, AppService apps, StorageService s) =>
        {
            var k = Key(ctx, apps, app);
            var full = StoragePath(s, k.App, path);
            if (Directory.Exists(full))
                return Results.Ok(new DirectoryInfo(full).EnumerateFileSystemInfos().Select(f => new { name = f.Name, isDirectory = f is DirectoryInfo, size = f is FileInfo fi ? fi.Length : 0, modified = f.LastWriteTimeUtc }));
            if (!File.Exists(full)) throw new NotFoundException("File not found.");
            return Results.File(full, "application/octet-stream", Path.GetFileName(full), enableRangeProcessing: true);
        });
        g.MapPut("/storage/{**path}", async (string app, string path, HttpContext ctx, AppService apps, StorageService s, CancellationToken ct) =>
        {
            var k = Key(ctx, apps, app); RequireWrite(k.Scope);
            var full = StoragePath(s, k.App, path);
            if (ctx.Request.ContentLength is null or > 100L * 1024 * 1024) throw new UserFacingException("Send a file up to 100 MB with a Content-Length header.", 413);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            await using (var fs = File.Create(full)) await ctx.Request.Body.CopyToAsync(fs, ct);
            return Results.Ok(new { path, size = new FileInfo(full).Length });
        });
        g.MapDelete("/storage/{**path}", (string app, string path, HttpContext ctx, AppService apps, StorageService s) =>
        {
            var k = Key(ctx, apps, app); RequireWrite(k.Scope);
            var full = StoragePath(s, k.App, path);
            if (File.Exists(full)) File.Delete(full); else throw new NotFoundException("File not found.");
            return Results.Ok();
        });
    }
}
