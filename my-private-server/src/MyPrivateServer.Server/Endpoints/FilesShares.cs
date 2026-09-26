using Microsoft.AspNetCore.StaticFiles;
using MyPrivateServer.Core;
using MyPrivateServer.Files;
using MyPrivateServer.Identity;
using MyPrivateServer.Server.Infrastructure;

namespace MyPrivateServer.Server.Endpoints;

public sealed record CreateFolderRequest(string Path, string Name);
public sealed record RenameRequest(string Path, string NewName);
public sealed record MoveRequest(List<string> Sources, string Destination, bool Copy);
public sealed record DeleteRequest(List<string> Paths);
public sealed record StartUploadRequest(string Path, string FileName, long Size);
public sealed record CreateShareRequest(string Name, string? Description);
public sealed record AclRequest(List<AclEntry> Entries);

public static class FileEndpoints
{
    static readonly FileExtensionContentTypeProvider Types = new();
    // Types that can run script in a browser are never previewed inline.
    static readonly HashSet<string> SafeInline = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".txt", ".md", ".csv", ".log", ".json", ".mp4", ".webm", ".mp3", ".wav", ".ogg"];

    public static void MapFileEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/files").RequireCapability(Capability.UseFiles);
        g.MapGet("/list", (string? path, HttpContext ctx, FileService f) => Results.Ok(f.List(ctx.CurrentUser(), path)));
        g.MapGet("/search", (string? path, string q, HttpContext ctx, FileService f) => Results.Ok(f.Search(ctx.CurrentUser(), path, q)));
        g.MapPost("/folder", (CreateFolderRequest r, HttpContext ctx, FileService f) => Results.Ok(f.CreateFolder(ctx.CurrentUser(), r.Path, r.Name)));
        g.MapPost("/rename", (RenameRequest r, HttpContext ctx, FileService f) => { f.Rename(ctx.CurrentUser(), r.Path, r.NewName); return Results.Ok(); });
        g.MapPost("/move", (MoveRequest r, HttpContext ctx, FileService f) => { f.MoveOrCopy(ctx.CurrentUser(), r.Sources, r.Destination, r.Copy); return Results.Ok(); });
        g.MapPost("/delete", (DeleteRequest r, HttpContext ctx, FileService f) => { f.Delete(ctx.CurrentUser(), r.Paths); return Results.Ok(); });

        g.MapGet("/download", (string path, HttpContext ctx, FileService f, IAuditLog audit) =>
        {
            var (full, name, _) = f.OpenFile(ctx.CurrentUser(), path);
            if (!ctx.Request.Headers.Range.Any()) audit.Write(ctx.CurrentUser().Username, "file", "File downloaded", path);
            return Results.File(full, "application/octet-stream", name, enableRangeProcessing: true);
        });

        g.MapGet("/preview", (string path, HttpContext ctx, FileService f) =>
        {
            var (full, name, _) = f.OpenFile(ctx.CurrentUser(), path);
            var ext = Path.GetExtension(name).ToLowerInvariant();
            if (!SafeInline.Contains(ext)) return Results.Json(new { error = "Preview is not available for this file type. Download it instead." }, statusCode: 415);
            var type = ext is ".txt" or ".md" or ".csv" or ".log" or ".json" ? "text/plain; charset=utf-8" : Types.TryGetContentType(name, out var t) ? t : "application/octet-stream";
            ctx.Response.Headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
            return Results.File(full, type, enableRangeProcessing: true);
        });

        g.MapGet("/zip", async (string path, HttpContext ctx, FileService f, CancellationToken ct) =>
        {
            var name = SafePath.Segments(path).LastOrDefault() ?? "files";
            ctx.Response.ContentType = "application/zip";
            ctx.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { FileName = name + ".zip" }.ToString();
            await f.WriteZipAsync(ctx.CurrentUser(), path, ctx.Response.Body, ct);
        });

        // Resumable uploads: create a session, then send chunks with an Upload-Offset header.
        g.MapPost("/uploads", (StartUploadRequest r, HttpContext ctx, FileService f) => Results.Ok(f.StartUpload(ctx.CurrentUser(), r.Path, r.FileName, r.Size)));
        g.MapGet("/uploads/{id}", (string id, HttpContext ctx, FileService f) => Results.Ok(f.GetUpload(ctx.CurrentUser(), id)));
        g.MapDelete("/uploads/{id}", (string id, HttpContext ctx, FileService f) => { f.CancelUpload(ctx.CurrentUser(), id); return Results.Ok(); });
        g.MapPatch("/uploads/{id}", async (string id, HttpContext ctx, FileService f, CancellationToken ct) =>
        {
            if (!long.TryParse(ctx.Request.Headers["Upload-Offset"], out var offset)) throw new UserFacingException("Missing Upload-Offset header.");
            var (session, done) = await f.AppendChunkAsync(ctx.CurrentUser(), id, offset, ctx.Request.Body, ct);
            ctx.Response.Headers["Upload-Offset"] = session.Received.ToString();
            return Results.Ok(new { session, completed = done });
        });

        g.MapGet("/recycle", (HttpContext ctx, FileService f) => Results.Ok(f.RecycleBin(ctx.CurrentUser())));
        g.MapPost("/recycle/{id}/restore", (string id, HttpContext ctx, FileService f) => Results.Ok(new { path = f.Restore(ctx.CurrentUser(), id) }));
        g.MapDelete("/recycle/{id}", (string id, HttpContext ctx, FileService f) => { f.Purge(ctx.CurrentUser(), id); return Results.Ok(); });
        g.MapDelete("/recycle", (HttpContext ctx, FileService f) => { f.Purge(ctx.CurrentUser(), null); return Results.Ok(); });

        var s = app.MapGroup("/api/shares").RequireCapability(Capability.ManageShares);
        s.MapGet("/", (ShareService shares, UserService users) =>
        {
            var names = users.List().ToDictionary(u => u.Id, u => u.Username);
            return Results.Ok(shares.List().Select(x => new { x.Name, x.Description, x.CreatedAt, acl = x.Acl.Select(a => new { a.PrincipalType, a.Principal, a.SubPath, a.Level, displayName = a.PrincipalType == PrincipalType.User ? names.GetValueOrDefault(a.Principal, "(deleted user)") : a.Principal }) }));
        });
        s.MapPost("/", (CreateShareRequest r, HttpContext ctx, ShareService shares) => Results.Ok(shares.Create(r.Name, r.Description, ctx.CurrentUser().Username)));
        s.MapPut("/{name}/acl", (string name, AclRequest r, HttpContext ctx, ShareService shares, UserService users) =>
        {
            foreach (var e in r.Entries)
            {
                if (e.PrincipalType == PrincipalType.User && users.Find(e.Principal) is null) throw new UserFacingException("One of the users no longer exists.");
                if (e.PrincipalType == PrincipalType.Role && !Enum.TryParse<Role>(e.Principal, out _)) throw new UserFacingException("Unknown role.");
            }
            shares.SetAcl(name, r.Entries, ctx.CurrentUser().Username);
            return Results.Ok(shares.Find(name));
        });
        s.MapDelete("/{name}", (string name, HttpContext ctx, ShareService shares) => { shares.Delete(name, ctx.CurrentUser().Username); return Results.Ok(); });
        // Preview what a user will see: effective access for each folder rule.
        s.MapGet("/{name}/effective/{userId}", (string name, string userId, string? path, ShareService shares, UserService users) =>
        {
            var share = shares.Find(name) ?? throw new NotFoundException("Shared folder not found.");
            var u = users.Get(userId);
            var rel = string.Join('/', SafePath.Segments(path));
            return Results.Ok(new { level = ShareService.Evaluate(share.Acl, u, rel), canTraverse = ShareService.CanTraverse(share.Acl, u, rel) });
        });
    }
}
