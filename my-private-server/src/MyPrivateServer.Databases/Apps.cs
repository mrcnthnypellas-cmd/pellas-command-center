using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Npgsql;
using MyPrivateServer.Core;

namespace MyPrivateServer.Databases;

public enum ApiKeyScope { Read, Write }

public sealed record AppInfo(string Id, string Slug, string Database, string Role, string OwnerUserId, DateTimeOffset CreatedAt, IReadOnlyList<string> AllowedOrigins);
public sealed record ApiKeyInfo(string Id, string AppId, string Name, string Prefix, ApiKeyScope Scope, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt);
public sealed record CreatedApp(AppInfo App, ConnectionInfo Connection);

public sealed class AppsSchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS apps (
          id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, db_name TEXT NOT NULL, role_name TEXT NOT NULL,
          role_password TEXT NOT NULL, jwt_secret TEXT NOT NULL, owner_user_id TEXT NOT NULL, allowed_origins TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS app_keys (
          id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE, name TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT NULL);
        CREATE TABLE IF NOT EXISTS app_env (
          app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (app_id, key));
        """;
}

/// <summary>
/// Self-hosted backend "apps": each app gets its own PostgreSQL database and least-privilege role,
/// API keys (only a SHA-256 hash is stored), encrypted environment variables, app-user sign-in and file storage.
/// </summary>
public sealed class AppService(SystemDb db, PostgresProvider pg, ISecretProtector secrets, IAuditLog audit)
{
    readonly ConcurrentDictionary<string, NpgsqlDataSource> _sources = new();

    public IReadOnlyList<AppInfo> List(string? ownerUserId = null)
    {
        using var c = db.Open();
        return c.Query("SELECT * FROM apps WHERE @o IS NULL OR owner_user_id=@o ORDER BY slug", new { o = ownerUserId }).Select(Map).ToList();
    }

    public AppInfo Get(string slug) =>
        List().FirstOrDefault(a => a.Slug == slug) ?? throw new NotFoundException("App not found.");

    static AppInfo Map(dynamic r) => new((string)r.id, (string)r.slug, (string)r.db_name, (string)r.role_name, (string)r.owner_user_id,
        DateTimeOffset.Parse((string)r.created_at), ((string)r.allowed_origins).Split(',', StringSplitOptions.RemoveEmptyEntries));

    public async Task<CreatedApp> CreateAsync(string slug, string ownerUserId, string actor, CancellationToken ct)
    {
        slug = Names.Slug(slug, "App name");
        if (List().Any(a => a.Slug == slug)) throw new ConflictException("An app with that name already exists.");
        var dbName = Names.SqlIdentifier("app_" + slug.Replace('-', '_'), "App name");
        var password = await pg.CreateRoleAsync(dbName, ct);
        try
        {
            await pg.CreateDatabaseAsync(dbName, dbName, ct);
            await using (var conn = pg.OpenAdmin(dbName))
            {
                const string bootstrap = """
                    CREATE TABLE IF NOT EXISTS mps_auth_users (
                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                      email text NOT NULL UNIQUE,
                      password_hash text NOT NULL,
                      created_at timestamptz NOT NULL DEFAULT now());
                    """;
                await using var cmd = new NpgsqlCommand(bootstrap, conn);
                await cmd.ExecuteNonQueryAsync(ct);
                await using var own = new NpgsqlCommand($"ALTER TABLE mps_auth_users OWNER TO \"{dbName}\"; GRANT ALL ON SCHEMA public TO \"{dbName}\"", conn);
                await own.ExecuteNonQueryAsync(ct);
            }
        }
        catch
        {
            try { await pg.DropDatabaseAsync(dbName, ct); await pg.DropRoleAsync(dbName, ct); } catch { }
            throw;
        }
        var app = new AppInfo(Guid.NewGuid().ToString("N"), slug, dbName, dbName, ownerUserId, DateTimeOffset.UtcNow, []);
        using (var c = db.Open())
            c.Execute("INSERT INTO apps(id,slug,db_name,role_name,role_password,jwt_secret,owner_user_id,created_at) VALUES (@Id,@Slug,@Database,@Role,@pw,@jwt,@OwnerUserId,@t)",
                new { app.Id, app.Slug, app.Database, app.Role, pw = secrets.Protect(password), jwt = secrets.Protect(ServerIdentity.RandomToken(48)), app.OwnerUserId, t = app.CreatedAt.ToString("O") });
        audit.Write(actor, "database", "App created", slug, $"Database {dbName}", AuditSeverity.Success);
        return new CreatedApp(app, pg.Connection(dbName, dbName, password));
    }

    public async Task DeleteAsync(string slug, string actor, CancellationToken ct)
    {
        var app = Get(slug);
        if (_sources.TryRemove(app.Id, out var ds)) await ds.DisposeAsync();
        await pg.DropDatabaseAsync(app.Database, ct);
        await pg.DropRoleAsync(app.Role, ct);
        using (var c = db.Open()) c.Execute("DELETE FROM apps WHERE id=@Id", new { app.Id });
        audit.Write(actor, "database", "App deleted", slug, null, AuditSeverity.Warning);
    }

    /// <summary>Full connection details for server-side code. Every reveal is audited.</summary>
    public ConnectionInfo RevealConnection(string slug, string actor)
    {
        var app = Get(slug);
        audit.Write(actor, "security", "Database credentials revealed", slug, null, AuditSeverity.Warning);
        return pg.Connection(app.Database, app.Role, RolePassword(app.Id));
    }

    string RolePassword(string appId) { using var c = db.Open(); return secrets.Unprotect(c.ExecuteScalar<string>("SELECT role_password FROM apps WHERE id=@appId", new { appId })!); }
    internal byte[] JwtSecret(string appId) { using var c = db.Open(); return Encoding.UTF8.GetBytes(secrets.Unprotect(c.ExecuteScalar<string>("SELECT jwt_secret FROM apps WHERE id=@appId", new { appId })!)); }

    public void SetAllowedOrigins(string slug, IEnumerable<string> origins, string actor)
    {
        var list = origins.Select(o => o.Trim().TrimEnd('/')).Where(o => o.Length > 0).ToList();
        foreach (var o in list)
            if (!Uri.TryCreate(o, UriKind.Absolute, out var u) || u.Scheme is not ("https" or "http") || u.AbsolutePath != "/")
                throw new UserFacingException($"“{o}” is not a valid origin. Use a form like https://myapp.vercel.app");
        var app = Get(slug);
        using var c = db.Open();
        c.Execute("UPDATE apps SET allowed_origins=@o WHERE id=@Id", new { o = string.Join(',', list), app.Id });
        audit.Write(actor, "database", "Allowed origins changed", slug, string.Join(", ", list));
    }

    /// <summary>A pooled data source that connects as the app's own role (never as the admin).</summary>
    public NpgsqlDataSource DataSource(AppInfo app) => _sources.GetOrAdd(app.Id, _ =>
    {
        var local = new NpgsqlConnectionStringBuilder(pg.LocalConnectionString(app.Database, app.Role, RolePassword(app.Id)))
            { MaxPoolSize = 20, CommandTimeout = 30, ApplicationName = "mps-data-api" };
        return NpgsqlDataSource.Create(local.ToString());
    });

    // ---------- API keys ----------
    static string Hash(string key) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    public (ApiKeyInfo Info, string Key) CreateKey(string slug, string name, ApiKeyScope scope, string actor)
    {
        var app = Get(slug);
        var key = "mps_" + ServerIdentity.RandomToken(30);
        var info = new ApiKeyInfo(Guid.NewGuid().ToString("N"), app.Id, string.IsNullOrWhiteSpace(name) ? "API key" : name.Trim(), key[..10], scope, DateTimeOffset.UtcNow, null);
        using var c = db.Open();
        c.Execute("INSERT INTO app_keys(id,app_id,name,key_hash,prefix,scope,created_at) VALUES (@Id,@AppId,@Name,@h,@Prefix,@s,@t)",
            new { info.Id, info.AppId, info.Name, h = Hash(key), info.Prefix, s = scope.ToString(), t = info.CreatedAt.ToString("O") });
        audit.Write(actor, "database", "API key created", slug, $"{info.Name} ({scope})", AuditSeverity.Info);
        return (info, key);
    }

    public IReadOnlyList<ApiKeyInfo> Keys(string slug)
    {
        var app = Get(slug);
        using var c = db.Open();
        return c.Query("SELECT * FROM app_keys WHERE app_id=@Id ORDER BY created_at", new { app.Id })
            .Select(r => new ApiKeyInfo((string)r.id, (string)r.app_id, (string)r.name, (string)r.prefix, Enum.Parse<ApiKeyScope>((string)r.scope),
                DateTimeOffset.Parse((string)r.created_at), r.last_used_at is null ? null : DateTimeOffset.Parse((string)r.last_used_at))).ToList();
    }

    public void RevokeKey(string slug, string keyId, string actor)
    {
        var app = Get(slug);
        using var c = db.Open();
        if (c.Execute("DELETE FROM app_keys WHERE id=@keyId AND app_id=@Id", new { keyId, app.Id }) == 0) throw new NotFoundException("Key not found.");
        audit.Write(actor, "database", "API key revoked", slug, keyId, AuditSeverity.Warning);
    }

    public (AppInfo App, ApiKeyScope Scope)? Authenticate(string? key)
    {
        if (string.IsNullOrEmpty(key) || !key.StartsWith("mps_") || key.Length > 100) return null;
        using var c = db.Open();
        var r = c.QuerySingleOrDefault("SELECT k.id AS key_id, k.scope, k.last_used_at, a.* FROM app_keys k JOIN apps a ON a.id=k.app_id WHERE k.key_hash=@h", new { h = Hash(key) });
        if (r is null) return null;
        if (r.last_used_at is null || DateTimeOffset.Parse((string)r.last_used_at) < DateTimeOffset.UtcNow.AddMinutes(-5))
            c.Execute("UPDATE app_keys SET last_used_at=@t WHERE id=@id", new { t = DateTimeOffset.UtcNow.ToString("O"), id = (string)r.key_id });
        return (Map(r), Enum.Parse<ApiKeyScope>((string)r.scope));
    }

    // ---------- environment variables (encrypted; values never listed) ----------
    public IReadOnlyList<string> EnvKeys(string slug) { var app = Get(slug); using var c = db.Open(); return c.Query<string>("SELECT key FROM app_env WHERE app_id=@Id ORDER BY key", new { app.Id }).ToList(); }

    public void SetEnv(string slug, string key, string? value, string actor)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(key ?? "", "^[A-Z_][A-Z0-9_]{0,63}$")) throw new UserFacingException("Variable names use UPPER_CASE letters, digits and underscores.");
        var app = Get(slug);
        using var c = db.Open();
        if (value is null) c.Execute("DELETE FROM app_env WHERE app_id=@Id AND key=@key", new { app.Id, key });
        else c.Execute("INSERT OR REPLACE INTO app_env(app_id,key,value) VALUES (@Id,@key,@v)", new { app.Id, key, v = secrets.Protect(value) });
        audit.Write(actor, "database", value is null ? "Environment variable removed" : "Environment variable set", slug, key);
    }

    /// <summary>Decrypted variables for injecting into a deployed app's process. Never returned to the browser.</summary>
    public IReadOnlyDictionary<string, string> EnvValues(string slug)
    {
        var app = Get(slug);
        using var c = db.Open();
        var d = c.Query("SELECT key, value FROM app_env WHERE app_id=@Id", new { app.Id }).ToDictionary(r => (string)r.key, r => secrets.Unprotect((string)r.value));
        var conn = pg.Connection(app.Database, app.Role, RolePassword(app.Id));
        d.TryAdd("DATABASE_URL", conn.Uri);
        return d;
    }
}
