namespace MyPrivateServer.Core;

/// <summary>
/// Finds bundled helper programs. The installer puts them in "&lt;install folder&gt;\tools\&lt;component&gt;\..."
/// (pgsql\bin, caddy, git\cmd, node, cloudflared, frp). Those folders are searched first and are also put at
/// the front of PATH for child processes, so builds use the bundled git/node/npm.
/// </summary>
public static class ToolLocator
{
    static readonly Lock Gate = new();
    static string[] _dirs = [];
    static string[] _roots = [];

    public static void Configure(params string[] roots)
    {
        lock (Gate) { _roots = roots.Where(r => !string.IsNullOrEmpty(r)).Distinct().ToArray(); _dirs = Scan(); }
    }

    public static void Refresh() { lock (Gate) _dirs = Scan(); }

    public static IReadOnlyList<string> Directories { get { lock (Gate) return _dirs; } }

    static string[] Scan()
    {
        var list = new List<string>();
        void Add(string d) { if (Directory.Exists(d) && !list.Contains(d, StringComparer.OrdinalIgnoreCase)) list.Add(d); }
        foreach (var root in _roots)
        {
            Add(root);
            if (!Directory.Exists(root)) continue;
            foreach (var c in Directory.GetDirectories(root))
            {
                Add(c);
                foreach (var sub in new[] { "bin", "cmd", Path.Combine("mingw64", "bin") }) Add(Path.Combine(c, sub));
                foreach (var cc in Directory.GetDirectories(c)) Add(Path.Combine(cc, "bin")); // e.g. postgresql\pgsql\bin
            }
        }
        if (!OperatingSystem.IsWindows() && Directory.Exists("/usr/lib/postgresql"))
            foreach (var v in Directory.GetDirectories("/usr/lib/postgresql").OrderByDescending(x => x)) Add(Path.Combine(v, "bin"));
        return list.ToArray();
    }

    public static string? Find(string name)
    {
        var names = OperatingSystem.IsWindows() && Path.GetExtension(name).Length == 0 ? new[] { name + ".exe", name + ".cmd", name } : new[] { name };
        var dirs = Directories.Concat((Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries));
        foreach (var d in dirs)
            foreach (var n in names)
            {
                var candidate = Path.Combine(d, n);
                if (File.Exists(candidate)) return candidate;
            }
        return null;
    }

    /// <summary>PATH value with the bundled tool folders first.</summary>
    public static string PathWithTools() =>
        string.Join(Path.PathSeparator, Directories.Append(Environment.GetEnvironmentVariable("PATH") ?? ""));
}
