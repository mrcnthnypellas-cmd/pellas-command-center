using MyPrivateServer.Core;

namespace MyPrivateServer.Storage;

public sealed record StorageStatus(bool Configured, bool Online, string? Root, long TotalBytes, long FreeBytes, bool LowSpace, string? Problem);

/// <summary>Creates and checks the folder layout on the chosen drive. Never formats or erases anything.</summary>
public sealed class StorageService(SettingsStore settings)
{
    public static readonly string[] Folders = ["Users", "Shared", "Backups", "Databases", "Websites", "Applications", "Docker", "Deployments", "System"];

    public string Root => settings.Get().StorageRoot ?? throw new UserFacingException("Storage has not been set up yet.", 409);
    public string PathFor(string folder) => Path.Combine(Root, folder);
    public string SystemPath(params string[] parts) => Path.Combine([Root, "System", .. parts]);

    /// <summary>Validates a proposed storage root and creates the layout. Existing files are left untouched.</summary>
    public static string PrepareRoot(string proposed)
    {
        if (string.IsNullOrWhiteSpace(proposed) || !Path.IsPathFullyQualified(proposed))
            throw new UserFacingException("Choose a full folder path, for example D:\\MyPrivateServer.");
        var full = Path.GetFullPath(proposed.Trim());
        var forbidden = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.System),
        }.Where(p => !string.IsNullOrEmpty(p));
        foreach (var f in forbidden)
            if (full.StartsWith(f, StringComparison.OrdinalIgnoreCase))
                throw new UserFacingException("That folder belongs to Windows or installed programs. Choose a folder on a data drive.");
        if (Path.GetPathRoot(full) == full)
            throw new UserFacingException("Use a folder on the drive (for example D:\\MyPrivateServer), not the drive root itself.");
        var root = Path.GetPathRoot(full);
        if (root is null || !Directory.Exists(root)) throw new UserFacingException("That drive is not available.");

        Directory.CreateDirectory(full);
        foreach (var f in Folders) Directory.CreateDirectory(Path.Combine(full, f));
        foreach (var f in new[] { "RecycleBin", "Uploads", "Releases" }) Directory.CreateDirectory(Path.Combine(full, "System", f));
        var probe = Path.Combine(full, "System", ".write-test");
        try { File.WriteAllText(probe, "ok"); File.Delete(probe); }
        catch (Exception ex) { throw new UserFacingException($"The server cannot write to that folder: {ex.Message}"); }
        return full;
    }

    public StorageStatus Status()
    {
        var root = settings.Get().StorageRoot;
        if (root is null) return new(false, false, null, 0, 0, false, "Storage has not been set up.");
        if (!Directory.Exists(root)) return new(true, false, root, 0, 0, false, "The storage drive is not connected or the folder is missing. Files are unavailable until it is reconnected.");
        try
        {
            var d = new DriveInfo(Path.GetPathRoot(root)!);
            var low = d.TotalSize > 0 && (double)d.AvailableFreeSpace / d.TotalSize < 0.10;
            return new(true, true, root, d.TotalSize, d.AvailableFreeSpace, low, low ? "Less than 10% free space left on the storage drive." : null);
        }
        catch (Exception ex) { return new(true, false, root, 0, 0, false, ex.Message); }
    }
}
