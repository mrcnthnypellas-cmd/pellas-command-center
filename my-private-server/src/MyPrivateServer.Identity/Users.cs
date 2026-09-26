using System.Security.Cryptography;
using Dapper;
using Microsoft.AspNetCore.Identity;
using MyPrivateServer.Core;

namespace MyPrivateServer.Identity;

public sealed class User
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public Role Role { get; set; }
    public string PasswordHash { get; set; } = "";
    public bool Disabled { get; set; }
    public long QuotaBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
}

public sealed record UserView(string Id, string Username, string DisplayName, Role Role, bool Disabled, long QuotaBytes,
    DateTimeOffset CreatedAt, DateTimeOffset? LastLoginAt, bool Locked, IReadOnlyCollection<Capability> Capabilities)
{
    public static UserView From(User u) => new(u.Id, u.Username, u.DisplayName, u.Role, u.Disabled, u.QuotaBytes, u.CreatedAt, u.LastLoginAt,
        u.LockedUntil > DateTimeOffset.UtcNow, RoleCapabilities.For(u.Role));
}

public sealed record Session(string Id, string UserId, string Username, DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, DateTimeOffset ExpiresAt, string? Ip, string? UserAgent);

public sealed class IdentitySchema : ISchemaContributor
{
    public string Schema => """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL,
          password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, quota_bytes INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, last_login_at TEXT NULL, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT NULL, user_agent TEXT NULL);
        CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
        """;
}

public enum LoginOutcome { Success, InvalidCredentials, Disabled, LockedOut }
public sealed record LoginResult(LoginOutcome Outcome, User? User, DateTimeOffset? LockedUntil = null);

public sealed class UserService(SystemDb db, SettingsStore settings, IAuditLog audit)
{
    readonly PasswordHasher<User> _hasher = new();
    // Used to spend the same hashing time for unknown usernames (prevents username probing by timing).
    readonly Lazy<string> _dummyHash = new(() => new PasswordHasher<User>().HashPassword(new User(), ServerIdentity.RandomToken()));

    public bool AnyUsers() { using var c = db.Open(); return c.ExecuteScalar<long>("SELECT COUNT(*) FROM users") > 0; }

    public IReadOnlyList<User> List() { using var c = db.Open(); return c.Query<Row>("SELECT * FROM users ORDER BY username").Select(Map).ToList(); }
    public User? Find(string id) { using var c = db.Open(); var r = c.QuerySingleOrDefault<Row>("SELECT * FROM users WHERE id=@id", new { id }); return r is null ? null : Map(r); }
    public User? FindByUsername(string username) { using var c = db.Open(); var r = c.QuerySingleOrDefault<Row>("SELECT * FROM users WHERE username=@username", new { username = username.Trim().ToLowerInvariant() }); return r is null ? null : Map(r); }
    public User Get(string id) => Find(id) ?? throw new NotFoundException("User not found.");

    public void ValidatePassword(string? password)
    {
        var min = settings.Get().Security.MinPasswordLength;
        if (string.IsNullOrEmpty(password) || password.Length < min) throw new UserFacingException($"Password must be at least {min} characters.");
        if (password.Length > 256) throw new UserFacingException("Password is too long.");
        var classes = new[] { password.Any(char.IsLower), password.Any(char.IsUpper), password.Any(char.IsDigit), password.Any(ch => !char.IsLetterOrDigit(ch)) }.Count(b => b);
        if (classes < 2) throw new UserFacingException("Use a mix of letters, numbers or symbols in the password.");
    }

    public User Create(string username, string displayName, Role role, string password, long quotaBytes, string actor)
    {
        username = Names.Username(username);
        ValidatePassword(password);
        if (FindByUsername(username) is not null) throw new ConflictException("That username is already taken.");
        var u = new User
        {
            Id = Guid.NewGuid().ToString("N"), Username = username, DisplayName = string.IsNullOrWhiteSpace(displayName) ? username : displayName.Trim(),
            Role = role, QuotaBytes = Math.Max(0, quotaBytes), CreatedAt = DateTimeOffset.UtcNow,
        };
        u.PasswordHash = _hasher.HashPassword(u, password);
        using var c = db.Open();
        c.Execute("INSERT INTO users(id,username,display_name,role,password_hash,disabled,quota_bytes,created_at) VALUES (@Id,@Username,@DisplayName,@Role,@PasswordHash,0,@QuotaBytes,@CreatedAt)",
            new { u.Id, u.Username, u.DisplayName, Role = u.Role.ToString(), u.PasswordHash, u.QuotaBytes, CreatedAt = u.CreatedAt.ToString("O") });
        audit.Write(actor, "users", "User created", username, $"Role {role}", AuditSeverity.Success);
        return u;
    }

    public User Update(string id, string? displayName, Role? role, long? quotaBytes, bool? disabled, string actor)
    {
        var u = Get(id);
        if ((role is not null && role != Role.Administrator && u.Role == Role.Administrator) || (disabled == true && u.Role == Role.Administrator))
            EnsureAnotherAdmin(u.Id);
        if (displayName is not null) u.DisplayName = displayName.Trim().Length == 0 ? u.Username : displayName.Trim();
        if (role is not null) u.Role = role.Value;
        if (quotaBytes is not null) u.QuotaBytes = Math.Max(0, quotaBytes.Value);
        if (disabled is not null) u.Disabled = disabled.Value;
        using var c = db.Open();
        c.Execute("UPDATE users SET display_name=@DisplayName, role=@Role, quota_bytes=@QuotaBytes, disabled=@Disabled WHERE id=@Id",
            new { u.DisplayName, Role = u.Role.ToString(), u.QuotaBytes, Disabled = u.Disabled ? 1 : 0, u.Id });
        if (u.Disabled) c.Execute("DELETE FROM sessions WHERE user_id=@Id", new { u.Id });
        audit.Write(actor, "users", disabled == true ? "User disabled" : disabled == false ? "User enabled" : "User updated", u.Username,
            role is not null ? $"Role {u.Role}" : null, disabled == true ? AuditSeverity.Warning : AuditSeverity.Info);
        return u;
    }

    public void SetPassword(string id, string newPassword, string actor, bool revokeSessions = true)
    {
        ValidatePassword(newPassword);
        var u = Get(id);
        using var c = db.Open();
        c.Execute("UPDATE users SET password_hash=@h, failed_logins=0, locked_until=NULL WHERE id=@id", new { h = _hasher.HashPassword(u, newPassword), id });
        if (revokeSessions) c.Execute("DELETE FROM sessions WHERE user_id=@id", new { id });
        audit.Write(actor, "users", "Password changed", u.Username, null, AuditSeverity.Info);
    }

    public void ChangeOwnPassword(string id, string currentPassword, string newPassword, string keepSessionId)
    {
        var u = Get(id);
        if (_hasher.VerifyHashedPassword(u, u.PasswordHash, currentPassword) == PasswordVerificationResult.Failed)
            throw new UserFacingException("Current password is incorrect.");
        SetPassword(id, newPassword, u.Username, revokeSessions: false);
        using var c = db.Open();
        c.Execute("DELETE FROM sessions WHERE user_id=@id AND id_hash<>@keep", new { id, keep = HashSessionId(keepSessionId) });
    }

    public void Delete(string id, string actor)
    {
        var u = Get(id);
        if (u.Role == Role.Administrator) EnsureAnotherAdmin(u.Id);
        using var c = db.Open();
        c.Execute("DELETE FROM users WHERE id=@id", new { id });
        audit.Write(actor, "users", "User deleted", u.Username, null, AuditSeverity.Warning);
    }

    void EnsureAnotherAdmin(string exceptId)
    {
        using var c = db.Open();
        var n = c.ExecuteScalar<long>("SELECT COUNT(*) FROM users WHERE role='Administrator' AND disabled=0 AND id<>@exceptId", new { exceptId });
        if (n == 0) throw new UserFacingException("At least one active administrator is required.");
    }

    public LoginResult VerifyLogin(string username, string password, string? ip)
    {
        var sec = settings.Get().Security;
        var u = FindByUsername(username ?? "");
        if (u is null)
        {
            _hasher.VerifyHashedPassword(new User(), _dummyHash.Value, password ?? "");
            audit.Write(username ?? "?", "security", "Failed login attempt", username, "Unknown user", AuditSeverity.Warning, ip);
            return new(LoginOutcome.InvalidCredentials, null);
        }
        if (u.LockedUntil > DateTimeOffset.UtcNow)
        {
            audit.Write(u.Username, "security", "Login refused", u.Username, "Account temporarily locked", AuditSeverity.Warning, ip);
            return new(LoginOutcome.LockedOut, null, u.LockedUntil);
        }
        var result = _hasher.VerifyHashedPassword(u, u.PasswordHash, password ?? "");
        using var c = db.Open();
        if (result == PasswordVerificationResult.Failed)
        {
            var failed = u.FailedLogins + 1;
            DateTimeOffset? lockUntil = failed >= sec.MaxFailedLogins ? DateTimeOffset.UtcNow.AddMinutes(sec.LockoutMinutes) : null;
            c.Execute("UPDATE users SET failed_logins=@failed, locked_until=@lock WHERE id=@id", new { failed = lockUntil is null ? failed : 0, @lock = lockUntil?.ToString("O"), id = u.Id });
            audit.Write(u.Username, "security", lockUntil is null ? "Failed login attempt" : "Account locked", u.Username,
                lockUntil is null ? "Wrong password" : $"{sec.MaxFailedLogins} failed attempts; locked {sec.LockoutMinutes} min", AuditSeverity.Warning, ip);
            return lockUntil is null ? new(LoginOutcome.InvalidCredentials, null) : new(LoginOutcome.LockedOut, null, lockUntil);
        }
        if (u.Disabled)
        {
            audit.Write(u.Username, "security", "Login refused", u.Username, "Account disabled", AuditSeverity.Warning, ip);
            return new(LoginOutcome.Disabled, null);
        }
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
            c.Execute("UPDATE users SET password_hash=@h WHERE id=@id", new { h = _hasher.HashPassword(u, password!), id = u.Id });
        u.LastLoginAt = DateTimeOffset.UtcNow;
        c.Execute("UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=@t WHERE id=@id", new { t = u.LastLoginAt.Value.ToString("O"), id = u.Id });
        audit.Write(u.Username, "login", "User logged in", u.Username, null, AuditSeverity.Info, ip);
        return new(LoginOutcome.Success, u);
    }

    // ---------- sessions (server-side, revocable). Only a SHA-256 of the session id is stored. ----------
    static string HashSessionId(string id) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(id)));

    public string CreateSession(User u, string? ip, string? userAgent)
    {
        var sec = settings.Get().Security;
        var id = ServerIdentity.RandomToken(32);
        var now = DateTimeOffset.UtcNow;
        using var c = db.Open();
        c.Execute("INSERT INTO sessions(id_hash,user_id,created_at,last_seen_at,expires_at,ip,user_agent) VALUES (@h,@u,@n,@n,@e,@ip,@ua)",
            new { h = HashSessionId(id), u = u.Id, n = now.ToString("O"), e = now.AddHours(sec.SessionAbsoluteHours).ToString("O"), ip, ua = userAgent?[..Math.Min(userAgent.Length, 200)] });
        return id;
    }

    /// <summary>Returns the user if the session is valid; slides the idle window.</summary>
    public User? ValidateSession(string sessionId)
    {
        var sec = settings.Get().Security;
        using var c = db.Open();
        var h = HashSessionId(sessionId);
        var s = c.QuerySingleOrDefault<(string user_id, string last_seen_at, string expires_at)>("SELECT user_id, last_seen_at, expires_at FROM sessions WHERE id_hash=@h", new { h });
        if (s.user_id is null) return null;
        var now = DateTimeOffset.UtcNow;
        if (DateTimeOffset.Parse(s.expires_at) < now || DateTimeOffset.Parse(s.last_seen_at).AddMinutes(sec.SessionIdleMinutes) < now)
        {
            c.Execute("DELETE FROM sessions WHERE id_hash=@h", new { h });
            return null;
        }
        var u = Find(s.user_id);
        if (u is null || u.Disabled) return null;
        if (now - DateTimeOffset.Parse(s.last_seen_at) > TimeSpan.FromMinutes(1))
            c.Execute("UPDATE sessions SET last_seen_at=@n WHERE id_hash=@h", new { n = now.ToString("O"), h });
        return u;
    }

    public void RevokeSession(string sessionId) { using var c = db.Open(); c.Execute("DELETE FROM sessions WHERE id_hash=@h", new { h = HashSessionId(sessionId) }); }

    public IReadOnlyList<Session> ListSessions(string? currentSessionId = null)
    {
        using var c = db.Open();
        var cur = currentSessionId is null ? null : HashSessionId(currentSessionId);
        return c.Query("SELECT s.*, u.username FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen_at DESC")
            .Select(r => new Session(((string)r.id_hash)[..16] + (r.id_hash == cur ? ":current" : ""), r.user_id, r.username,
                DateTimeOffset.Parse(r.created_at), DateTimeOffset.Parse(r.last_seen_at), DateTimeOffset.Parse(r.expires_at), r.ip, r.user_agent))
            .ToList();
    }

    /// <summary>Revokes by the short public handle shown in the session list.</summary>
    public bool RevokeSessionByHandle(string handle, string actor)
    {
        handle = handle.Split(':')[0];
        if (handle.Length != 16 || !handle.All(Uri.IsHexDigit)) return false;
        using var c = db.Open();
        var n = c.Execute("DELETE FROM sessions WHERE substr(id_hash,1,16)=@handle", new { handle = handle.ToUpperInvariant() });
        if (n > 0) audit.Write(actor, "security", "Session ended", handle, null, AuditSeverity.Info);
        return n > 0;
    }

    sealed class Row
    {
        public string id { get; set; } = ""; public string username { get; set; } = ""; public string display_name { get; set; } = "";
        public string role { get; set; } = ""; public string password_hash { get; set; } = ""; public long disabled { get; set; }
        public long quota_bytes { get; set; } public string created_at { get; set; } = ""; public string? last_login_at { get; set; }
        public long failed_logins { get; set; } public string? locked_until { get; set; }
    }

    static User Map(Row r) => new()
    {
        Id = r.id, Username = r.username, DisplayName = r.display_name, Role = Enum.Parse<Role>(r.role), PasswordHash = r.password_hash,
        Disabled = r.disabled != 0, QuotaBytes = r.quota_bytes, CreatedAt = DateTimeOffset.Parse(r.created_at),
        LastLoginAt = r.last_login_at is null ? null : DateTimeOffset.Parse(r.last_login_at), FailedLogins = (int)r.failed_logins,
        LockedUntil = r.locked_until is null ? null : DateTimeOffset.Parse(r.locked_until),
    };
}
