using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MyPrivateServer.Core;
using MyPrivateServer.Identity;

namespace MyPrivateServer.Server.Infrastructure;

/// <summary>
/// Session-cookie authentication backed by server-side sessions (revocable, idle timeout). The cookie is
/// HttpOnly and SameSite=Strict; state-changing requests also need the CSRF header (double-submit).
/// </summary>
public sealed class SessionAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, UserService users)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string Scheme = "MpsSession";
    public const string CookieName = "mps_session";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(CookieName, out var sid) || string.IsNullOrEmpty(sid) || sid.Length > 100)
            return Task.FromResult(AuthenticateResult.NoResult());
        var user = users.ValidateSession(sid);
        if (user is null) return Task.FromResult(AuthenticateResult.Fail("Session expired"));
        Context.Items["mps.user"] = user;
        Context.Items["mps.session"] = sid;
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Name, user.Username), new Claim(ClaimTypes.Role, user.Role.ToString()),
        ], Scheme);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 401;
        return Response.WriteAsJsonAsync(new { error = "Please sign in." });
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 403;
        return Response.WriteAsJsonAsync(new { error = "You do not have permission to do that." });
    }
}

public static class HttpContextUserExtensions
{
    public static User CurrentUser(this HttpContext ctx) => ctx.Items["mps.user"] as User ?? throw new UserFacingException("Please sign in.", 401);
    public static string SessionId(this HttpContext ctx) => ctx.Items["mps.session"] as string ?? "";
    public static string ClientIp(this HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    /// <summary>Requires a signed-in user with the given capability.</summary>
    public static TBuilder RequireCapability<TBuilder>(this TBuilder builder, Capability capability) where TBuilder : IEndpointConventionBuilder
    {
        builder.RequireAuthorization();
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var u = ctx.HttpContext.CurrentUser();
            if (!RoleCapabilities.Has(u.Role, capability))
                return Results.Json(new { error = "You do not have permission to do that." }, statusCode: 403);
            return await next(ctx);
        });
        return builder;
    }
}
