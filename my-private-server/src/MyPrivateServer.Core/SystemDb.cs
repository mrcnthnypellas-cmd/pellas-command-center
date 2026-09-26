using Microsoft.Data.Sqlite;

namespace MyPrivateServer.Core;

/// <summary>A module that owns tables in the embedded system database (users, audit, jobs...).</summary>
public interface ISchemaContributor
{
    /// <summary>Idempotent DDL (CREATE TABLE IF NOT EXISTS ...).</summary>
    string Schema { get; }
}

/// <summary>
/// Embedded SQLite database for the server's own state. It needs no installation and keeps working
/// offline. User-facing databases are PostgreSQL (see the Databases module).
/// </summary>
public sealed class SystemDb
{
    readonly string _connectionString;

    public SystemDb(ServerPaths paths, IEnumerable<ISchemaContributor> contributors)
    {
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = paths.SystemDatabase,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            Pooling = true,
        }.ToString();
        using var c = Open();
        using (var pragma = c.CreateCommand()) { pragma.CommandText = "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"; pragma.ExecuteNonQuery(); }
        foreach (var contributor in contributors)
        {
            using var cmd = c.CreateCommand();
            cmd.CommandText = contributor.Schema;
            cmd.ExecuteNonQuery();
        }
    }

    public SqliteConnection Open()
    {
        var c = new SqliteConnection(_connectionString);
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;";
        cmd.ExecuteNonQuery();
        return c;
    }
}
