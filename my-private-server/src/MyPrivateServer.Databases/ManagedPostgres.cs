using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;

namespace MyPrivateServer.Databases;

public sealed record ManagedPostgresResult(bool Ok, string Message, int? Port = null);

/// <summary>
/// Runs PostgreSQL for the owner using the binaries bundled with the installer, so no separate database
/// install is needed. The cluster lives on the storage drive (Databases\postgresql), listens on localhost only,
/// uses scram-sha-256 authentication with a generated password (stored encrypted), and is started, checked
/// every 30 seconds and stopped together with the server.
/// </summary>
public sealed class ManagedPostgres(SettingsStore settings, ISecretProtector secrets, IProcessRunner runner, ServerPaths paths, IAuditLog audit, ILogger<ManagedPostgres> log) : BackgroundService
{
    readonly SemaphoreSlim _gate = new(1, 1);

    public bool BinariesAvailable => runner.Find("initdb") is not null && runner.Find("pg_ctl") is not null;

    string LogFile(string dataDir) => Path.Combine(Path.GetDirectoryName(dataDir)!, "postgresql.log");

    /// <summary>Creates (or re-uses) the cluster under the storage folder and starts it. Safe to call again.</summary>
    public async Task<ManagedPostgresResult> InitializeAsync(string storageRoot, CancellationToken ct)
    {
        if (!BinariesAvailable) return new(false, "Bundled PostgreSQL was not found. Connect an existing PostgreSQL in Database settings.");
        await _gate.WaitAsync(ct);
        try
        {
            var dataDir = Path.Combine(storageRoot, "Databases", "postgresql");
            var existing = File.Exists(Path.Combine(dataDir, "PG_VERSION"));
            var cfg = settings.Get().Postgres;
            string password;
            int port;
            if (existing && cfg.Managed && cfg.DataDirectory == dataDir && cfg.AdminPasswordProtected is not null)
            {
                password = secrets.Unprotect(cfg.AdminPasswordProtected);
                port = cfg.Port;
            }
            else if (existing)
            {
                return new(false, $"A PostgreSQL data folder already exists at {dataDir} but its password is unknown. Connect it in Database settings, or move that folder away.");
            }
            else
            {
                password = PostgresProvider.NewPassword();
                port = FreePort(5432);
                Directory.CreateDirectory(dataDir);
                var pwFile = Path.Combine(paths.TempDirectory, "pg-" + Guid.NewGuid().ToString("N") + ".txt");
                await File.WriteAllTextAsync(pwFile, password, ct);
                try
                {
                    var r = await runner.RunAsync("initdb", ["-D", dataDir, "-U", "postgres", "--pwfile", pwFile, "-A", "scram-sha-256", "-E", "UTF8", "--no-locale"],
                        new ProcessOptions { Timeout = TimeSpan.FromMinutes(5) }, ct);
                    if (r.ExitCode != 0) return new(false, "Could not create the database: " + LastLines(r.Output));
                }
                finally { try { File.Delete(pwFile); } catch { } }
                audit.Write("system", "database", "PostgreSQL created", dataDir, $"Port {port}", AuditSeverity.Success);
            }
            settings.Update(s => s.Postgres = new PostgresSettings
            {
                Enabled = true, Managed = true, Host = "127.0.0.1", Port = port, AdminUser = "postgres",
                AdminPasswordProtected = secrets.Protect(password), DataDirectory = dataDir, PublicHost = s.Postgres.PublicHost,
            });
            var started = await StartAsync(dataDir, ct);
            return started ? new(true, $"PostgreSQL is running on port {port}.", port) : new(false, "PostgreSQL was created but did not start. See Databases\\postgresql.log on the storage drive.");
        }
        finally { _gate.Release(); }
    }

    static string LastLines(string s) => string.Join(" ", s.Trim().Split('\n').TakeLast(3)).Trim();

    static int FreePort(int start)
    {
        for (var p = start; p < start + 20; p++)
        {
            try { using var l = new TcpListener(IPAddress.Loopback, p); l.Start(); l.Stop(); return p; }
            catch (SocketException) { }
        }
        return start;
    }

    async Task<bool> IsRunningAsync(string dataDir, CancellationToken ct) =>
        (await runner.RunAsync("pg_ctl", ["status", "-D", dataDir], new ProcessOptions { Timeout = TimeSpan.FromSeconds(15) }, ct)).ExitCode == 0;

    /// <summary>Our settings live in mps.conf (rewritten before every start) so upgrades can change them safely.</summary>
    static async Task EnsureConfigAsync(string dataDir, int port, CancellationToken ct)
    {
        await File.WriteAllTextAsync(Path.Combine(dataDir, "mps.conf"),
            $"# Managed by My Private Server. Changes are overwritten.\nport = {port}\nlisten_addresses = 'localhost'\nunix_socket_directories = ''\nmax_connections = 100\n", ct);
        var main = Path.Combine(dataDir, "postgresql.conf");
        var text = await File.ReadAllTextAsync(main, ct);
        if (!text.Contains("include_if_exists = 'mps.conf'"))
            await File.AppendAllTextAsync(main, "\ninclude_if_exists = 'mps.conf'\n", ct);
    }

    async Task<bool> StartAsync(string dataDir, CancellationToken ct)
    {
        if (await IsRunningAsync(dataDir, ct)) return true;
        await EnsureConfigAsync(dataDir, settings.Get().Postgres.Port, ct);
        // pg_ctl drops administrator rights on Windows before starting the database, as PostgreSQL requires.
        var r = await runner.RunAsync("pg_ctl", ["start", "-D", dataDir, "-l", LogFile(dataDir), "-w", "-t", "60"],
            new ProcessOptions { Timeout = TimeSpan.FromSeconds(90) }, ct);
        if (r.ExitCode != 0) log.LogWarning("PostgreSQL did not start: {Output}", LastLines(r.Output));
        else { log.LogInformation("PostgreSQL started"); Npgsql.NpgsqlConnection.ClearAllPools(); } // drop connections to the previous instance
        return r.ExitCode == 0;
    }

    public async Task StopAsyncCore(CancellationToken ct)
    {
        var cfg = settings.Get().Postgres;
        if (!cfg.Managed || cfg.DataDirectory is null || !Directory.Exists(cfg.DataDirectory) || !BinariesAvailable) return;
        await runner.RunAsync("pg_ctl", ["stop", "-D", cfg.DataDirectory, "-m", "fast", "-w", "-t", "30"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(40) }, ct);
        log.LogInformation("PostgreSQL stopped");
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Yield();
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var cfg = settings.Get().Postgres;
                if (cfg.Managed && cfg.DataDirectory is { } dir && Directory.Exists(dir) && BinariesAvailable && !await IsRunningAsync(dir, ct))
                {
                    log.LogWarning("PostgreSQL is not running; starting it");
                    await _gate.WaitAsync(ct);
                    try { await StartAsync(dir, ct); } finally { _gate.Release(); }
                }
            }
            catch (Exception ex) when (!ct.IsCancellationRequested) { log.LogWarning(ex, "PostgreSQL check failed"); }
            try { await Task.Delay(TimeSpan.FromSeconds(30), ct); } catch (OperationCanceledException) { break; }
        }
    }

    public override async Task StopAsync(CancellationToken ct)
    {
        await base.StopAsync(ct);
        try { await StopAsyncCore(CancellationToken.None); } catch (Exception ex) { log.LogWarning(ex, "Could not stop PostgreSQL"); }
    }
}
