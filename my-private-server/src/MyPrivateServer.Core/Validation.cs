using System.Text.RegularExpressions;

namespace MyPrivateServer.Core;

public static partial class Names
{
    [GeneratedRegex("^[a-z][a-z0-9._-]{2,31}$")] private static partial Regex UsernameRx();
    [GeneratedRegex("^[a-z_][a-z0-9_]{0,62}$")] private static partial Regex SqlIdentRx();
    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")] private static partial Regex SlugRx();

    public static string Username(string? v)
    {
        v = (v ?? "").Trim().ToLowerInvariant();
        if (!UsernameRx().IsMatch(v)) throw new UserFacingException("Usernames use 3–32 lowercase letters, numbers, dots, dashes or underscores and start with a letter.");
        return v;
    }

    /// <summary>PostgreSQL identifier: lowercase, safe to quote. Rejects anything that could escape quoting.</summary>
    public static string SqlIdentifier(string? v, string what = "Name")
    {
        v = (v ?? "").Trim();
        if (!SqlIdentRx().IsMatch(v)) throw new UserFacingException($"{what} must use lowercase letters, numbers and underscores (max 63), starting with a letter or underscore.");
        if (v.StartsWith("pg_")) throw new UserFacingException($"{what} cannot start with pg_.");
        return v;
    }

    public static string Slug(string? v, string what = "Name")
    {
        v = (v ?? "").Trim().ToLowerInvariant();
        if (!SlugRx().IsMatch(v)) throw new UserFacingException($"{what} must use 1–40 lowercase letters, numbers or dashes.");
        return v;
    }
}
