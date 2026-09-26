using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Npgsql;
using MyPrivateServer.Core;

namespace MyPrivateServer.Databases;

public sealed record AppUserToken(string Token, DateTimeOffset ExpiresAt, string UserId, string Email);

/// <summary>
/// A small PostgREST-style REST API over an app's own tables. Requests run as the app's least-privilege role;
/// when an app-user token is supplied, its id is exposed to row-level security policies as
/// current_setting('request.jwt.claim.sub'). Table and column names are checked against the database catalog,
/// and all values are bound parameters.
/// </summary>
public sealed partial class DataApi(AppService apps)
{
    static readonly HashSet<string> Reserved = ["select", "order", "limit", "offset"];
    static readonly Dictionary<string, string> Ops = new() { ["eq"] = "=", ["neq"] = "<>", ["gt"] = ">", ["gte"] = ">=", ["lt"] = "<", ["lte"] = "<=", ["like"] = "LIKE", ["ilike"] = "ILIKE" };
    readonly ConcurrentDictionary<string, (DateTimeOffset At, Dictionary<string, string> Cols)> _schemaCache = new();

    [GeneratedRegex("^[a-z_][a-z0-9_]{0,62}$")] private static partial Regex Ident();
    [GeneratedRegex("^_?[a-z0-9_ ]+$")] private static partial Regex TypeName();

    public async Task<IReadOnlyList<object>> TablesAsync(AppInfo app, CancellationToken ct)
    {
        await using var conn = await apps.DataSource(app).OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand("""
            SELECT table_name, json_agg(json_build_object('name', column_name, 'type', udt_name, 'nullable', is_nullable = 'YES') ORDER BY ordinal_position)::text
            FROM information_schema.columns WHERE table_schema='public' AND table_name NOT LIKE 'mps\_%' GROUP BY table_name ORDER BY table_name
            """, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<object>();
        while (await r.ReadAsync(ct)) list.Add(new { table = r.GetString(0), columns = JsonDocument.Parse(r.GetString(1)).RootElement.Clone() });
        return list;
    }

    async Task<Dictionary<string, string>> ColumnsAsync(AppInfo app, string table, NpgsqlConnection conn, CancellationToken ct)
    {
        if (!Ident().IsMatch(table) || table.StartsWith("mps_")) throw new NotFoundException("Table not found.");
        var key = app.Id + ":" + table;
        if (_schemaCache.TryGetValue(key, out var hit) && hit.At > DateTimeOffset.UtcNow.AddSeconds(-30)) return hit.Cols;
        await using var cmd = new NpgsqlCommand("SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=@t", conn);
        cmd.Parameters.AddWithValue("t", table);
        var cols = new Dictionary<string, string>();
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) cols[r.GetString(0)] = r.GetString(1);
        if (cols.Count == 0) throw new NotFoundException("Table not found, or this app's role cannot access it.");
        _schemaCache[key] = (DateTimeOffset.UtcNow, cols);
        return cols;
    }

    static string Col(Dictionary<string, string> cols, string name)
    {
        name = name.Trim();
        if (!Ident().IsMatch(name) || !cols.ContainsKey(name)) throw new UserFacingException($"Unknown column “{name}”.");
        return "\"" + name + "\"";
    }

    static string Cast(Dictionary<string, string> cols, string name)
    {
        var t = cols[name.Trim()];
        if (!TypeName().IsMatch(t)) throw new UserFacingException("Unsupported column type.");
        return t;
    }

    (string Where, List<NpgsqlParameter> Params) Filters(Dictionary<string, string> cols, IEnumerable<KeyValuePair<string, string>> query)
    {
        var parts = new List<string>(); var ps = new List<NpgsqlParameter>();
        foreach (var (k, v) in query)
        {
            if (Reserved.Contains(k)) continue;
            var col = Col(cols, k);
            var dot = v.IndexOf('.');
            if (dot < 0) throw new UserFacingException($"Filter for “{k}” must look like eq.value");
            var op = v[..dot]; var val = v[(dot + 1)..];
            var p = "p" + ps.Count;
            if (op == "is")
            {
                parts.Add(val switch { "null" => $"{col} IS NULL", "notnull" => $"{col} IS NOT NULL", "true" => $"{col} IS TRUE", "false" => $"{col} IS FALSE", _ => throw new UserFacingException("Use is.null, is.notnull, is.true or is.false") });
            }
            else if (op == "in")
            {
                var items = val.Trim('(', ')').Split(',', StringSplitOptions.TrimEntries);
                parts.Add($"{col}::text = ANY(@{p})"); ps.Add(new NpgsqlParameter(p, items));
            }
            else if (Ops.TryGetValue(op, out var sqlOp))
            {
                var type = Cast(cols, k);
                parts.Add(op is "like" or "ilike" ? $"{col}::text {sqlOp} @{p}" : $"{col} {sqlOp} CAST(@{p} AS {type})");
                ps.Add(new NpgsqlParameter(p, val.Replace('*', '%')));
            }
            else throw new UserFacingException($"Unknown operator “{op}”.");
        }
        return (parts.Count == 0 ? "" : " WHERE " + string.Join(" AND ", parts), ps);
    }

    async Task<T> InTransaction<T>(AppInfo app, AppUserToken? user, Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> work, CancellationToken ct)
    {
        await using var conn = await apps.DataSource(app).OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using (var claims = new NpgsqlCommand("SELECT set_config('request.jwt.claim.sub', @sub, true), set_config('request.jwt.claim.email', @email, true)", conn, tx))
        {
            claims.Parameters.AddWithValue("sub", user?.UserId ?? "");
            claims.Parameters.AddWithValue("email", user?.Email ?? "");
            await claims.ExecuteNonQueryAsync(ct);
        }
        try { var result = await work(conn, tx); await tx.CommitAsync(ct); return result; }
        catch (PostgresException ex) { throw new UserFacingException($"Database error: {ex.MessageText}", ex.SqlState is "42501" ? 403 : 400); }
    }

    static async Task<string> JsonResult(NpgsqlCommand cmd, CancellationToken ct) => (string?)await cmd.ExecuteScalarAsync(ct) ?? "[]";

    public Task<string> SelectAsync(AppInfo app, string table, IReadOnlyList<KeyValuePair<string, string>> query, AppUserToken? user, CancellationToken ct) =>
        InTransaction(app, user, async (conn, tx) =>
        {
            var cols = await ColumnsAsync(app, table, conn, ct);
            var q = query.ToDictionary(x => x.Key, x => x.Value);
            var select = q.TryGetValue("select", out var s) && s != "*" ? string.Join(",", s.Split(',').Select(c => Col(cols, c))) : "*";
            var (where, ps) = Filters(cols, query);
            var order = "";
            if (q.TryGetValue("order", out var o))
                order = " ORDER BY " + string.Join(",", o.Split(',').Select(part => { var bits = part.Split('.'); return Col(cols, bits[0]) + (bits.Length > 1 && bits[1] == "desc" ? " DESC" : " ASC"); }));
            var limit = Math.Clamp(int.TryParse(q.GetValueOrDefault("limit"), out var l) ? l : 100, 1, 1000);
            var offset = Math.Max(0, int.TryParse(q.GetValueOrDefault("offset"), out var of) ? of : 0);
            await using var cmd = new NpgsqlCommand($"SELECT COALESCE(json_agg(t), '[]')::text FROM (SELECT {select} FROM \"{table}\"{where}{order} LIMIT {limit} OFFSET {offset}) t", conn, tx);
            cmd.Parameters.AddRange(ps.ToArray());
            return await JsonResult(cmd, ct);
        }, ct);

    public Task<string> InsertAsync(AppInfo app, string table, JsonElement body, AppUserToken? user, CancellationToken ct) =>
        InTransaction(app, user, async (conn, tx) =>
        {
            var cols = await ColumnsAsync(app, table, conn, ct);
            var rows = body.ValueKind == JsonValueKind.Array ? body.EnumerateArray().ToList() : [body];
            if (rows.Count == 0 || rows.Count > 1000 || rows.Any(r => r.ValueKind != JsonValueKind.Object)) throw new UserFacingException("Send a JSON object or an array of up to 1000 objects.");
            var names = rows.SelectMany(r => r.EnumerateObject().Select(p => p.Name)).Distinct().Select(n => Col(cols, n)).ToList();
            if (names.Count == 0) throw new UserFacingException("No columns to insert.");
            var list = string.Join(",", names);
            await using var cmd = new NpgsqlCommand(
                $"WITH ins AS (INSERT INTO \"{table}\" ({list}) SELECT {list} FROM json_populate_recordset(NULL::\"{table}\", @rows::json) RETURNING *) SELECT COALESCE(json_agg(ins), '[]')::text FROM ins", conn, tx);
            cmd.Parameters.AddWithValue("rows", JsonSerializer.Serialize(rows));
            return await JsonResult(cmd, ct);
        }, ct);

    public Task<string> UpdateAsync(AppInfo app, string table, IReadOnlyList<KeyValuePair<string, string>> query, JsonElement body, AppUserToken? user, CancellationToken ct) =>
        InTransaction(app, user, async (conn, tx) =>
        {
            var cols = await ColumnsAsync(app, table, conn, ct);
            var (where, ps) = Filters(cols, query);
            if (where.Length == 0) throw new UserFacingException("Updates need at least one filter, for example ?id=eq.5");
            if (body.ValueKind != JsonValueKind.Object) throw new UserFacingException("Send a JSON object with the columns to change.");
            var names = body.EnumerateObject().Select(p => Col(cols, p.Name)).ToList();
            if (names.Count == 0) throw new UserFacingException("No columns to update.");
            var list = string.Join(",", names);
            var set = names.Count == 1 ? $"{list} = (SELECT {list} FROM json_populate_record(NULL::\"{table}\", @row::json))" : $"({list}) = (SELECT {list} FROM json_populate_record(NULL::\"{table}\", @row::json))";
            await using var cmd = new NpgsqlCommand($"WITH up AS (UPDATE \"{table}\" SET {set}{where} RETURNING *) SELECT COALESCE(json_agg(up), '[]')::text FROM up", conn, tx);
            cmd.Parameters.AddRange(ps.ToArray());
            cmd.Parameters.AddWithValue("row", body.GetRawText());
            return await JsonResult(cmd, ct);
        }, ct);

    public Task<string> DeleteAsync(AppInfo app, string table, IReadOnlyList<KeyValuePair<string, string>> query, AppUserToken? user, CancellationToken ct) =>
        InTransaction(app, user, async (conn, tx) =>
        {
            var cols = await ColumnsAsync(app, table, conn, ct);
            var (where, ps) = Filters(cols, query);
            if (where.Length == 0) throw new UserFacingException("Deletes need at least one filter, for example ?id=eq.5");
            await using var cmd = new NpgsqlCommand($"WITH del AS (DELETE FROM \"{table}\"{where} RETURNING *) SELECT COALESCE(json_agg(del), '[]')::text FROM del", conn, tx);
            cmd.Parameters.AddRange(ps.ToArray());
            return await JsonResult(cmd, ct);
        }, ct);

    // ---------- app-user authentication (email + password, HS256 token) ----------
    static readonly PasswordHasher<object> Hasher = new();

    public async Task<AppUserToken> SignUpAsync(AppInfo app, string email, string password, CancellationToken ct)
    {
        email = (email ?? "").Trim().ToLowerInvariant();
        if (!email.Contains('@') || email.Length > 254) throw new UserFacingException("Enter a valid email address.");
        if ((password ?? "").Length < 8) throw new UserFacingException("Password must be at least 8 characters.");
        await using var conn = await apps.DataSource(app).OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand("INSERT INTO mps_auth_users(email, password_hash) VALUES (@e, @h) ON CONFLICT (email) DO NOTHING RETURNING id::text", conn);
        cmd.Parameters.AddWithValue("e", email); cmd.Parameters.AddWithValue("h", Hasher.HashPassword(new object(), password!));
        var id = (string?)await cmd.ExecuteScalarAsync(ct) ?? throw new ConflictException("An account with that email already exists.");
        return Issue(app, id, email);
    }

    public async Task<AppUserToken> SignInAsync(AppInfo app, string email, string password, CancellationToken ct)
    {
        email = (email ?? "").Trim().ToLowerInvariant();
        await using var conn = await apps.DataSource(app).OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand("SELECT id::text, password_hash FROM mps_auth_users WHERE email=@e", conn);
        cmd.Parameters.AddWithValue("e", email);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) { Hasher.HashPassword(new object(), password ?? ""); throw new UserFacingException("Wrong email or password.", 401); }
        var (id, hash) = (r.GetString(0), r.GetString(1));
        if (Hasher.VerifyHashedPassword(new object(), hash, password ?? "") == PasswordVerificationResult.Failed) throw new UserFacingException("Wrong email or password.", 401);
        return Issue(app, id, email);
    }

    static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    static byte[] UnB64(string s) { s = s.Replace('-', '+').Replace('_', '/'); return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=')); }

    AppUserToken Issue(AppInfo app, string userId, string email)
    {
        var exp = DateTimeOffset.UtcNow.AddHours(1);
        var header = B64("""{"alg":"HS256","typ":"JWT"}"""u8.ToArray());
        var payload = B64(JsonSerializer.SerializeToUtf8Bytes(new { sub = userId, email, app = app.Slug, iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(), exp = exp.ToUnixTimeSeconds() }));
        var sig = B64(HMACSHA256.HashData(apps.JwtSecret(app.Id), Encoding.ASCII.GetBytes(header + "." + payload)));
        return new AppUserToken($"{header}.{payload}.{sig}", exp, userId, email);
    }

    public AppUserToken? ValidateUserToken(AppInfo app, string? token)
    {
        if (string.IsNullOrEmpty(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) throw new UserFacingException("Invalid user token.", 401);
        var expected = HMACSHA256.HashData(apps.JwtSecret(app.Id), Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]));
        if (!CryptographicOperations.FixedTimeEquals(expected, UnB64(parts[2]))) throw new UserFacingException("Invalid user token.", 401);
        using var doc = JsonDocument.Parse(UnB64(parts[1]));
        var p = doc.RootElement;
        var exp = DateTimeOffset.FromUnixTimeSeconds(p.GetProperty("exp").GetInt64());
        if (exp < DateTimeOffset.UtcNow || p.GetProperty("app").GetString() != app.Slug) throw new UserFacingException("User token expired. Sign in again.", 401);
        return new AppUserToken(token, exp, p.GetProperty("sub").GetString()!, p.GetProperty("email").GetString()!);
    }
}
