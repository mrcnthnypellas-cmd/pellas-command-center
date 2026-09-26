using MyPrivateServer.Core;

namespace MyPrivateServer.Files;

/// <summary>
/// Turns user-supplied names and paths into absolute paths that are guaranteed to stay inside a root folder.
/// Rejects "..", Windows reserved device names, alternate data streams, and symlink/junction traversal.
/// </summary>
public static class SafePath
{
    static readonly char[] Invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0'];
    static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9",
    };

    public static string ValidateName(string? name)
    {
        name = (name ?? "").Trim();
        if (name.Length == 0) throw new UserFacingException("Enter a name.");
        if (name is "." or "..") throw new UserFacingException("That name is not allowed.");
        if (name.Length > 255) throw new UserFacingException("Names must be 255 characters or fewer.");
        if (name.IndexOfAny(Invalid) >= 0 || name.Any(char.IsControl)) throw new UserFacingException("Names cannot contain \\ / : * ? \" < > |");
        if (name.EndsWith('.') || name.EndsWith(' ')) throw new UserFacingException("Names cannot end with a dot or a space.");
        var stem = name.Split('.')[0];
        if (Reserved.Contains(stem)) throw new UserFacingException($"“{stem}” is reserved by Windows and cannot be used as a name.");
        return name;
    }

    /// <summary>Splits a virtual path like "/shared/Accounting/2026" into validated segments.</summary>
    public static string[] Segments(string? virtualPath)
    {
        var parts = (virtualPath ?? "").Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var p in parts) ValidateName(p);
        return parts;
    }

    public static string Join(IEnumerable<string> segments) => "/" + string.Join('/', segments);

    /// <summary>Combines a trusted root with validated segments and proves the result is inside the root.</summary>
    public static string Combine(string root, IEnumerable<string> segments)
    {
        var rootFull = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var current = rootFull.TrimEnd(Path.DirectorySeparatorChar);
        foreach (var s in segments)
        {
            ValidateName(s);
            current = Path.Combine(current, s);
            if (IsLink(current)) throw new ForbiddenException("Links and junctions cannot be followed.");
        }
        var full = Path.GetFullPath(current);
        if (!(full + Path.DirectorySeparatorChar).StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException("That location is outside the allowed folder.");
        return full;
    }

    static bool IsLink(string path)
    {
        try
        {
            if (!File.Exists(path) && !Directory.Exists(path)) return false;
            return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
        }
        catch (IOException) { return false; }
    }

    /// <summary>Returns "name (1).ext", "name (2).ext"... until the name is free in the folder.</summary>
    public static string FreeName(string directory, string name)
    {
        if (!File.Exists(Path.Combine(directory, name)) && !Directory.Exists(Path.Combine(directory, name))) return name;
        var ext = Path.GetExtension(name); var stem = Path.GetFileNameWithoutExtension(name);
        if (Directory.Exists(Path.Combine(directory, name))) { ext = ""; stem = name; }
        for (var i = 1; ; i++)
        {
            var candidate = $"{stem} ({i}){ext}";
            if (!File.Exists(Path.Combine(directory, candidate)) && !Directory.Exists(Path.Combine(directory, candidate))) return candidate;
        }
    }
}
