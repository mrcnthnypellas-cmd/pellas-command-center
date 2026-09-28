using System.Text.RegularExpressions;
using MyPrivateServer.Core;
using MyPrivateServer.Identity;
using MyPrivateServer.Server.Infrastructure;

namespace MyPrivateServer.Server.Endpoints;

/// <summary>The sign-in screen's look, shared by every device. Only administrators can change it, after signing in.</summary>
public sealed class LoginBranding
{
    public string Kind { get; set; } = "preset";
    public string Preset { get; set; } = "aurora";
    public string C1 { get; set; } = "#1d3b6a";
    public string C2 { get; set; } = "#0a1020";
    public int Dim { get; set; } = 35;
    public string Message { get; set; } = "Sign in to manage your server.";
    public long? ImageVersion { get; set; }
}

/// <summary>Image: a data: URL to replace the picture, or null to keep the current one.</summary>
public sealed record LoginBrandingRequest(string Kind, string? Preset, string? C1, string? C2, int? Dim, string? Message, string? Image, bool RemoveImage);

public static partial class BrandingEndpoints
{
    const int MaxImageBytes = 5 * 1024 * 1024;
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")] private static partial Regex HexColor();
    [GeneratedRegex("^[a-z0-9-]{1,32}$")] private static partial Regex PresetName();

    public static void MapBrandingEndpoints(this WebApplication app)
    {
        var paths = app.Services.GetRequiredService<ServerPaths>();
        var store = new JsonFileStore<LoginBranding>(Path.Combine(paths.ConfigDirectory, "login-appearance.json"));
        var imageFile = Path.Combine(paths.ConfigDirectory, "login-background.img");

        object View(LoginBranding b) => new
        {
            b.Kind, b.Preset, b.C1, b.C2, b.Dim, b.Message,
            image = b.ImageVersion is { } v && File.Exists(imageFile) ? $"/api/branding/login-background?v={v}" : "",
        };

        var g = app.MapGroup("/api/branding");
        g.MapGet("/login", () => Results.Ok(View(store.Get())));
        g.MapGet("/login-background", () =>
        {
            if (!File.Exists(imageFile)) return Results.NotFound();
            var bytes = File.ReadAllBytes(imageFile);
            return Results.File(bytes, ImageType(bytes) ?? "application/octet-stream");
        });
        g.MapPut("/login", (LoginBrandingRequest r, HttpContext ctx, IAuditLog audit) =>
        {
            if (r.Kind is not ("preset" or "color" or "image")) throw new UserFacingException("Choose a preset, custom colors or a picture.");
            if (r.Preset is not null && !PresetName().IsMatch(r.Preset)) throw new UserFacingException("Unknown background preset.");
            if ((r.C1 is not null && !HexColor().IsMatch(r.C1)) || (r.C2 is not null && !HexColor().IsMatch(r.C2))) throw new UserFacingException("Colors must look like #1d3b6a.");
            if (r.Message is { Length: > 120 }) throw new UserFacingException("The welcome message can be up to 120 characters.");

            byte[]? picture = null;
            if (!string.IsNullOrEmpty(r.Image))
            {
                var m = Regex.Match(r.Image, @"^data:image/(jpeg|png|webp);base64,(.+)$", RegexOptions.Singleline);
                if (!m.Success) throw new UserFacingException("Upload a JPG, PNG or WebP picture.");
                try { picture = Convert.FromBase64String(m.Groups[2].Value); }
                catch (FormatException) { throw new UserFacingException("That picture could not be read."); }
                if (picture.Length > MaxImageBytes) throw new UserFacingException("That picture is over 5 MB.");
                if (ImageType(picture) is null) throw new UserFacingException("Upload a JPG, PNG or WebP picture.");
            }

            if (picture is not null) File.WriteAllBytes(imageFile, picture);
            else if (r.RemoveImage && File.Exists(imageFile)) File.Delete(imageFile);
            var saved = store.Update(b =>
            {
                if (picture is not null) b.ImageVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                else if (r.RemoveImage) b.ImageVersion = null;
                b.Kind = r.Kind == "image" && b.ImageVersion is null ? "preset" : r.Kind;
                if (r.Preset is not null) b.Preset = r.Preset;
                if (r.C1 is not null) b.C1 = r.C1;
                if (r.C2 is not null) b.C2 = r.C2;
                if (r.Dim is { } d) b.Dim = Math.Clamp(d, 0, 90);
                if (r.Message is not null) b.Message = r.Message.Trim();
            });
            audit.Write(ctx.CurrentUser().Username, "settings", "Sign-in screen updated", saved.Kind, null, AuditSeverity.Info, ctx.ClientIp());
            return Results.Ok(View(saved));
        }).RequireCapability(Capability.ManageSettings);
    }

    /// <summary>Only real pictures are served back, identified by their first bytes.</summary>
    internal static string? ImageType(byte[] b) =>
        b.Length > 12 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF ? "image/jpeg"
        : b.Length > 12 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 ? "image/png"
        : b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P' ? "image/webp"
        : null;
}
