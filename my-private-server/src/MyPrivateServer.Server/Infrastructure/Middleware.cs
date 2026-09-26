using System.Net;
using System.Security.Cryptography;
using MyPrivateServer.Core;

namespace MyPrivateServer.Server.Infrastructure;

public static class Csrf
{
    public const string CookieName = "mps_csrf";
    public const string HeaderName = "X-MPS-CSRF";

    public static string Ensure(HttpContext ctx)
    {
        if (ctx.Request.Cookies.TryGetValue(CookieName, out var v) && v.Length is > 20 and < 100) return v;
        v = ServerIdentity.RandomToken(24);
        ctx.Response.Cookies.Append(CookieName, v, new CookieOptions { HttpOnly = false, SameSite = SameSiteMode.Strict, Secure = ctx.Request.IsHttps, Path = "/" });
        return v;
    }

    /// <summary>
    /// Cookie-authenticated, state-changing API requests must echo the CSRF cookie in a header.
    /// Exempt: the app data API (API keys, no cookies) and signed GitHub webhooks.
    /// </summary>
    public static async Task Middleware(HttpContext ctx, Func<Task> next)
    {
        var p = ctx.Request.Path;
        var unsafeMethod = !(HttpMethods.IsGet(ctx.Request.Method) || HttpMethods.IsHead(ctx.Request.Method) || HttpMethods.IsOptions(ctx.Request.Method));
        if (unsafeMethod && p.StartsWithSegments("/api") && !p.StartsWithSegments("/api/data") && !p.StartsWithSegments("/api/github/webhook"))
        {
            var cookie = ctx.Request.Cookies[CookieName];
            var header = ctx.Request.Headers[HeaderName].ToString();
            if (string.IsNullOrEmpty(cookie) || !CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(cookie), System.Text.Encoding.UTF8.GetBytes(header)))
            {
                ctx.Response.StatusCode = 403;
                await ctx.Response.WriteAsJsonAsync(new { error = "Security check failed. Reload the page and try again." });
                return;
            }
        }
        await next();
    }
}

public static class SecurityHeaders
{
    public static async Task Middleware(HttpContext ctx, Func<Task> next)
    {
        var h = ctx.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["Referrer-Policy"] = "strict-origin-when-cross-origin";
        h["X-Frame-Options"] = "DENY";
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        h["Cross-Origin-Opener-Policy"] = "same-origin";
        if (!ctx.Request.Path.StartsWithSegments("/api/data"))
            h["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
        if (ctx.Request.IsHttps) h["Strict-Transport-Security"] = "max-age=31536000";
        await next();
    }
}

public static class ErrorHandling
{
    public static async Task Middleware(HttpContext ctx, Func<Task> next)
    {
        try { await next(); }
        catch (MyPrivateServer.Files.UploadOffsetMismatchException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = 409;
            ctx.Response.Headers["Upload-Offset"] = ex.ServerOffset.ToString();
            await ctx.Response.WriteAsJsonAsync(new { error = ex.Message, offset = ex.ServerOffset });
        }
        catch (UserFacingException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = ex.StatusCode;
            await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
        }
        catch (Npgsql.PostgresException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = ex.SqlState is "42501" ? 403 : 400;
            await ctx.Response.WriteAsJsonAsync(new { error = "Database error: " + ex.MessageText });
        }
        catch (BadHttpRequestException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = ex.StatusCode;
            await ctx.Response.WriteAsJsonAsync(new { error = "The request was not valid." });
        }
        catch (Exception ex) when (!ctx.Response.HasStarted && ex is not OperationCanceledException)
        {
            ctx.RequestServices.GetRequiredService<ILogger<Program>>().LogError(ex, "Unhandled error on {Path}", ctx.Request.Path);
            ctx.Response.StatusCode = 500;
            await ctx.Response.WriteAsJsonAsync(new { error = "Something went wrong on the server. Details are in the server log." });
        }
    }
}

/// <summary>Until setup is complete, only setup, health and static dashboard files are served.</summary>
public static class SetupGate
{
    public static async Task Middleware(HttpContext ctx, Func<Task> next)
    {
        var settings = ctx.RequestServices.GetRequiredService<SettingsStore>().Get();
        var p = ctx.Request.Path;
        if (!settings.SetupCompleted && p.StartsWithSegments("/api") &&
            !(p.StartsWithSegments("/api/setup") || p.StartsWithSegments("/api/health") || p.StartsWithSegments("/api/auth/csrf")))
        {
            ctx.Response.StatusCode = 409;
            await ctx.Response.WriteAsJsonAsync(new { error = "Finish setting up the server first.", setupRequired = true });
            return;
        }
        await next();
    }

    /// <summary>Setup can be done from this PC, or from another device using the one-time setup token.</summary>
    public static bool Allowed(HttpContext ctx, ServerPaths paths)
    {
        var ip = ctx.Connection.RemoteIpAddress;
        if (ip is not null && IPAddress.IsLoopback(ip)) return true;
        var token = ctx.Request.Headers["X-Setup-Token"].ToString();
        if (string.IsNullOrEmpty(token) || !File.Exists(paths.SetupTokenFile)) return false;
        var expected = File.ReadAllText(paths.SetupTokenFile).Trim();
        return CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(expected), System.Text.Encoding.UTF8.GetBytes(token.Trim()));
    }
}
