using MyPrivateServer.Core;

namespace MyPrivateServer.Databases;

public sealed record DbServerStatus(bool Configured, bool Online, string? Version, DateTimeOffset? StartedAt, int Connections, string Host, int Port, string? Problem);
public sealed record DatabaseInfo(string Name, string Owner, long SizeBytes, int Connections, long Commits, long Rollbacks, double CacheHitPercent);
public sealed record RoleInfo(string Name, bool CanLogin, bool Superuser, IReadOnlyList<string> Databases);
public sealed record ConnectionInfo(string Host, int Port, string Database, string Username, string? Password, string ConnectionString, string Uri);

public enum GrantLevel { Connect, ReadOnly, ReadWrite, Owner }

/// <summary>Database engine abstraction. PostgreSQL is the default implementation.</summary>
public interface IDatabaseProvider
{
    string Engine { get; }
    Task<DbServerStatus> StatusAsync(CancellationToken ct);
    Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(CancellationToken ct);
    Task CreateDatabaseAsync(string name, string? owner, CancellationToken ct);
    Task DropDatabaseAsync(string name, CancellationToken ct);
    Task<IReadOnlyList<RoleInfo>> ListRolesAsync(CancellationToken ct);
    /// <summary>Creates a login role with a generated password, returned once.</summary>
    Task<string> CreateRoleAsync(string name, CancellationToken ct);
    Task DropRoleAsync(string name, CancellationToken ct);
    Task<string> ResetRolePasswordAsync(string name, CancellationToken ct);
    Task GrantAsync(string database, string role, GrantLevel level, CancellationToken ct);
    Task RevokeAllAsync(string database, string role, CancellationToken ct);
    Task BackupAsync(string database, string file, CancellationToken ct);
    Task RestoreAsync(string database, string file, CancellationToken ct);
    ConnectionInfo Connection(string database, string username, string? password);
}
