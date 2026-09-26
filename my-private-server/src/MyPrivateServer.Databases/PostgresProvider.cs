using System.Security.Cryptography;
using Npgsql;
using MyPrivateServer.Core;

namespace MyPrivateServer.Databases;

/// <summary>
/// PostgreSQL management through an administrator connection. All identifiers are validated
/// (lowercase letters, digits, underscore) and double-quoted; values are always parameters.
/// </summary>
public sealed class PostgresProvider(SettingsStore settings, ISecretProtector secrets, IProcessRunner runner, IAuditLog audit) : IDatabaseProvider, IHealthProbe
{
    public string Engine => "PostgreSQL";
    public string Name => "PostgreSQL";

    PostgresSettings Cfg => settings.Get().Postgres;

    string AdminPassword() => Cfg.AdminPasswordProtected is { } p ? secrets.Unprotect(p) : "";

    public NpgsqlConnection OpenAdmin(string database = "postgres")
    {
        var c = Cfg;
        if (!c.Enabled) throw new UserFacingException("PostgreSQL is not configured yet. Add the connection in Databases → Settings.", 409);
        var cs = new NpgsqlConnectionStringBuilder
        {
            Host = c.Host, Port = c.Port, Username = c.AdminUser, Password = AdminPassword(), Database = database,
            Timeout = 5, CommandTimeout = 60, ApplicationName = "MyPrivateServer", Pooling = true, MaxPoolSize = 10,
        };
        var conn = new NpgsqlConnection(cs.ToString());
        try { conn.Open(); }
        catch (Exception ex) when (ex is NpgsqlException or System.Net.Sockets.SocketException or TimeoutException)
        {
            conn.Dispose();
            throw new UserFacingException($"Cannot connect to PostgreSQL at {c.Host}:{c.Port}: {ex.Message}", 503);
        }
        return conn;
    }

    static string Q(string ident) => "\"" + Names.SqlIdentifier(ident) + "\"";

    public static string NewPassword() =>
        new(RandomNumberGenerator.GetItems<char>("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", 32));

    public async Task<DbServerStatus> StatusAsync(CancellationToken ct)
    {
        var c = Cfg;
        if (!c.Enabled) return new(false, false, null, null, 0, c.Host, c.Port, "Not configured.");
        try
        {
            await using var conn = OpenAdmin();
            await using var cmd = new NpgsqlCommand("SELECT current_setting('server_version'), pg_postmaster_start_time(), (SELECT count(*) FROM pg_stat_activity)::int", conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            await r.ReadAsync(ct);
            return new(true, true, "PostgreSQL " + r.GetString(0), r.GetFieldValue<DateTime>(1), r.GetInt32(2), c.Host, c.Port, null);
        }
        catch (UserFacingException ex) { return new(true, false, null, null, 0, c.Host, c.Port, ex.Message); }
    }

    public async Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(CancellationToken ct)
    {
        await using var conn = OpenAdmin();
        const string sql = """
            SELECT d.datname, pg_get_userbyid(d.datdba), pg_database_size(d.datname),
                   COALESCE(s.numbackends,0), COALESCE(s.xact_commit,0), COALESCE(s.xact_rollback,0),
                   CASE WHEN COALESCE(s.blks_hit,0)+COALESCE(s.blks_read,0)=0 THEN 100 ELSE round(100.0*s.blks_hit/(s.blks_hit+s.blks_read),1) END
            FROM pg_database d LEFT JOIN pg_stat_database s ON s.datname=d.datname
            WHERE NOT d.datistemplate AND d.datname <> 'postgres' ORDER BY d.datname
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<DatabaseInfo>();
        while (await r.ReadAsync(ct))
            list.Add(new(r.GetString(0), r.GetString(1), r.GetInt64(2), r.GetInt32(3), r.GetInt64(4), r.GetInt64(5), (double)r.GetDecimal(6)));
        return list;
    }

    async Task ExecAsync(NpgsqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task CreateDatabaseAsync(string name, string? owner, CancellationToken ct)
    {
        Names.SqlIdentifier(name, "Database name");
        await using var conn = OpenAdmin();
        await using (var exists = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname=@n", conn))
        {
            exists.Parameters.AddWithValue("n", name);
            if (await exists.ExecuteScalarAsync(ct) is not null) throw new ConflictException("A database with that name already exists.");
        }
        await ExecAsync(conn, $"CREATE DATABASE {Q(name)}" + (string.IsNullOrEmpty(owner) ? "" : $" OWNER {Q(owner)}"), ct);
        await ExecAsync(conn, $"REVOKE ALL ON DATABASE {Q(name)} FROM PUBLIC", ct);
    }

    public async Task DropDatabaseAsync(string name, CancellationToken ct)
    {
        Names.SqlIdentifier(name, "Database name");
        await using var conn = OpenAdmin();
        await ExecAsync(conn, $"DROP DATABASE IF EXISTS {Q(name)} WITH (FORCE)", ct);
    }

    public async Task<IReadOnlyList<RoleInfo>> ListRolesAsync(CancellationToken ct)
    {
        await using var conn = OpenAdmin();
        const string sql = """
            SELECT r.rolname, r.rolcanlogin, r.rolsuper,
                   COALESCE(array_agg(d.datname ORDER BY d.datname) FILTER (WHERE d.datname IS NOT NULL), '{}')
            FROM pg_roles r
            LEFT JOIN pg_database d ON NOT d.datistemplate AND d.datname <> 'postgres'
                 AND (d.datdba = r.oid OR EXISTS (SELECT 1 FROM aclexplode(d.datacl) a WHERE a.grantee = r.oid AND a.privilege_type = 'CONNECT'))
            WHERE r.rolname !~ '^pg_' GROUP BY r.rolname, r.rolcanlogin, r.rolsuper ORDER BY r.rolname
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<RoleInfo>();
        while (await r.ReadAsync(ct)) list.Add(new(r.GetString(0), r.GetBoolean(1), r.GetBoolean(2), r.GetFieldValue<string[]>(3)));
        return list;
    }

    public async Task<string> CreateRoleAsync(string name, CancellationToken ct)
    {
        Names.SqlIdentifier(name, "Username");
        var pw = NewPassword();
        await using var conn = OpenAdmin();
        await using (var exists = new NpgsqlCommand("SELECT 1 FROM pg_roles WHERE rolname=@n", conn))
        {
            exists.Parameters.AddWithValue("n", name);
            if (await exists.ExecuteScalarAsync(ct) is not null) throw new ConflictException("A database user with that name already exists.");
        }
        // Password is generated from a fixed alphabet (no quotes), so the literal is safe.
        await ExecAsync(conn, $"CREATE ROLE {Q(name)} LOGIN PASSWORD '{pw}' NOSUPERUSER NOCREATEDB NOCREATEROLE", ct);
        return pw;
    }

    public async Task DropRoleAsync(string name, CancellationToken ct)
    {
        Names.SqlIdentifier(name, "Username");
        if (name == Cfg.AdminUser) throw new UserFacingException("The administrator database user cannot be deleted.");
        await using var conn = OpenAdmin();
        foreach (var db in (await ListDatabasesAsync(ct)).Select(d => d.Name))
        {
            await using var dbc = OpenAdmin(db);
            await ExecAsync(dbc, $"REASSIGN OWNED BY {Q(name)} TO {Q(Cfg.AdminUser)}; DROP OWNED BY {Q(name)}", ct);
        }
        await ExecAsync(conn, $"DROP ROLE IF EXISTS {Q(name)}", ct);
    }

    public async Task<string> ResetRolePasswordAsync(string name, CancellationToken ct)
    {
        Names.SqlIdentifier(name, "Username");
        var pw = NewPassword();
        await using var conn = OpenAdmin();
        await ExecAsync(conn, $"ALTER ROLE {Q(name)} PASSWORD '{pw}'", ct);
        return pw;
    }

    public async Task GrantAsync(string database, string role, GrantLevel level, CancellationToken ct)
    {
        await using var conn = OpenAdmin();
        await ExecAsync(conn, $"GRANT CONNECT ON DATABASE {Q(database)} TO {Q(role)}", ct);
        if (level == GrantLevel.Owner) { await ExecAsync(conn, $"ALTER DATABASE {Q(database)} OWNER TO {Q(role)}", ct); }
        if (level is GrantLevel.Connect) return;
        await using var dbc = OpenAdmin(database);
        var privs = level == GrantLevel.ReadOnly ? "SELECT" : "SELECT, INSERT, UPDATE, DELETE";
        await ExecAsync(dbc, $"GRANT USAGE ON SCHEMA public TO {Q(role)}", ct);
        await ExecAsync(dbc, $"GRANT {privs} ON ALL TABLES IN SCHEMA public TO {Q(role)}", ct);
        await ExecAsync(dbc, $"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT {privs} ON TABLES TO {Q(role)}", ct);
        if (level != GrantLevel.ReadOnly)
        {
            await ExecAsync(dbc, $"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {Q(role)}", ct);
            await ExecAsync(dbc, $"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {Q(role)}", ct);
        }
        if (level == GrantLevel.Owner) await ExecAsync(dbc, $"GRANT ALL ON SCHEMA public TO {Q(role)}", ct);
    }

    public async Task RevokeAllAsync(string database, string role, CancellationToken ct)
    {
        await using var dbc = OpenAdmin(database);
        await ExecAsync(dbc, $"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {Q(role)}; REVOKE ALL ON SCHEMA public FROM {Q(role)}", ct);
        await using var conn = OpenAdmin();
        await ExecAsync(conn, $"REVOKE ALL ON DATABASE {Q(database)} FROM {Q(role)}", ct);
    }

    string Tool(string name)
    {
        if (runner.Find(name) is { } p) return p;
        if (OperatingSystem.IsWindows())
        {
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "PostgreSQL");
            if (Directory.Exists(root))
                foreach (var v in Directory.GetDirectories(root).OrderByDescending(d => d))
                    if (File.Exists(Path.Combine(v, "bin", name + ".exe"))) return Path.Combine(v, "bin", name + ".exe");
        }
        throw new UserFacingException($"{name} was not found. Install the PostgreSQL client tools.", 503);
    }

    Dictionary<string, string?> PgEnv() => new() { ["PGPASSWORD"] = AdminPassword(), ["PGCONNECT_TIMEOUT"] = "10" };

    public async Task BackupAsync(string database, string file, CancellationToken ct)
    {
        Names.SqlIdentifier(database, "Database name");
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var c = Cfg;
        var r = await runner.RunAsync(Tool("pg_dump"), ["-h", c.Host, "-p", c.Port.ToString(), "-U", c.AdminUser, "-Fc", "--no-password", "-f", file, database],
            new ProcessOptions { Environment = PgEnv(), Timeout = TimeSpan.FromHours(6), Redact = [AdminPassword()] }, ct);
        if (r.ExitCode != 0) { try { File.Delete(file); } catch { } throw new UserFacingException("Database backup failed: " + r.Output.Trim(), 500); }
    }

    public async Task RestoreAsync(string database, string file, CancellationToken ct)
    {
        Names.SqlIdentifier(database, "Database name");
        if (!File.Exists(file)) throw new NotFoundException("Backup file not found.");
        var c = Cfg;
        var r = await runner.RunAsync(Tool("pg_restore"), ["-h", c.Host, "-p", c.Port.ToString(), "-U", c.AdminUser, "--no-password", "--clean", "--if-exists", "--no-owner", "-d", database, file],
            new ProcessOptions { Environment = PgEnv(), Timeout = TimeSpan.FromHours(6), Redact = [AdminPassword()] }, ct);
        if (r.ExitCode != 0) throw new UserFacingException("Restore finished with errors: " + string.Join('\n', r.Output.Trim().Split('\n').TakeLast(5)), 500);
    }

    /// <summary>Connection string for use by the server itself (uses the local host, not the public one).</summary>
    public string LocalConnectionString(string database, string username, string password) =>
        new NpgsqlConnectionStringBuilder { Host = Cfg.Host, Port = Cfg.Port, Database = database, Username = username, Password = password, Timeout = 5 }.ToString();

    public ConnectionInfo Connection(string database, string username, string? password)
    {
        var c = Cfg;
        var host = string.IsNullOrWhiteSpace(c.PublicHost) ? c.Host : c.PublicHost;
        var pw = password ?? "<password>";
        return new(host, c.Port, database, username, password,
            $"Host={host};Port={c.Port};Database={database};Username={username};Password={pw}",
            $"postgresql://{username}:{Uri.EscapeDataString(pw)}@{host}:{c.Port}/{database}");
    }

    public async Task<HealthResult> CheckAsync(CancellationToken ct)
    {
        var s = await StatusAsync(ct);
        return !s.Configured ? new(Name, HealthState.Disabled, "Not configured")
            : s.Online ? new(Name, HealthState.Healthy, s.Version ?? "Online") : new(Name, HealthState.Unavailable, "Offline", s.Problem);
    }

    /// <summary>Validates and saves the administrator connection. The password is encrypted at rest.</summary>
    public async Task ConfigureAsync(string host, int port, string adminUser, string? password, string? publicHost, string actor, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(host) || port is <= 0 or > 65535) throw new UserFacingException("Enter a valid host and port.");
        var prev = settings.Get().Postgres;
        var protectedPw = string.IsNullOrEmpty(password) ? prev.AdminPasswordProtected : secrets.Protect(password);
        var test = new NpgsqlConnectionStringBuilder { Host = host.Trim(), Port = port, Username = adminUser.Trim(), Password = protectedPw is null ? "" : secrets.Unprotect(protectedPw), Database = "postgres", Timeout = 5 };
        try { await using var c = new NpgsqlConnection(test.ToString()); await c.OpenAsync(ct); }
        catch (Exception ex) when (ex is NpgsqlException or System.Net.Sockets.SocketException or TimeoutException)
        { throw new UserFacingException($"Could not connect: {ex.Message}"); }
        settings.Update(s => s.Postgres = new PostgresSettings { Enabled = true, Host = host.Trim(), Port = port, AdminUser = adminUser.Trim(), AdminPasswordProtected = protectedPw, PublicHost = publicHost?.Trim() });
        audit.Write(actor, "database", "PostgreSQL connection configured", $"{host}:{port}", null, AuditSeverity.Success);
    }
}
