using Dapper;

namespace MyPrivateServer.Core;

public enum AuditSeverity { Info, Success, Warning, Critical }

public sealed record AuditEntry(long Id, DateTimeOffset Timestamp, string Actor, string Category, string Action, string? Target, string? Detail, AuditSeverity Severity, string? Source);

public interface IAuditLog
{
    void Write(string actor, string category, string action, string? target = null, string? detail = null, AuditSeverity severity = AuditSeverity.Info, string? source = null);
    IReadOnlyList<AuditEntry> Query(string? category = null, string? search = null, int limit = 200, DateTimeOffset? since = null);
}

public sealed class AuditSchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          actor TEXT NOT NULL,
          category TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT NULL,
          detail TEXT NULL,
          severity TEXT NOT NULL,
          source TEXT NULL);
        CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts);
        """;
}

public sealed class SqliteAuditLog(SystemDb db) : IAuditLog
{
    public void Write(string actor, string category, string action, string? target = null, string? detail = null, AuditSeverity severity = AuditSeverity.Info, string? source = null)
    {
        using var c = db.Open();
        c.Execute("INSERT INTO audit_log(ts,actor,category,action,target,detail,severity,source) VALUES (@ts,@actor,@category,@action,@target,@detail,@severity,@source)",
            new { ts = DateTimeOffset.UtcNow.ToString("O"), actor, category, action, target, detail, severity = severity.ToString(), source });
    }

    public IReadOnlyList<AuditEntry> Query(string? category = null, string? search = null, int limit = 200, DateTimeOffset? since = null)
    {
        using var c = db.Open();
        var sql = "SELECT id, ts, actor, category, action, target, detail, severity, source FROM audit_log WHERE 1=1";
        if (!string.IsNullOrEmpty(category)) sql += " AND category = @category";
        if (!string.IsNullOrEmpty(search)) sql += " AND (action LIKE @q OR target LIKE @q OR detail LIKE @q OR actor LIKE @q)";
        if (since is not null) sql += " AND ts >= @since";
        sql += " ORDER BY id DESC LIMIT @limit";
        return c.Query(sql, new { category, q = $"%{search}%", since = since?.ToString("O"), limit = Math.Clamp(limit, 1, 1000) })
            .Select(r => new AuditEntry((long)r.id, DateTimeOffset.Parse((string)r.ts), r.actor, r.category, r.action, r.target, r.detail,
                Enum.Parse<AuditSeverity>((string)r.severity), r.source))
            .ToList();
    }
}
