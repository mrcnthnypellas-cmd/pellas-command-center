namespace MyPrivateServer.Core;

/// <summary>
/// Locations of the server's own data (configuration, keys, system database, logs).
/// User data (files, databases, websites) lives under the storage root chosen during setup.
/// </summary>
public sealed class ServerPaths
{
    public ServerPaths(string? dataDirectory = null)
    {
        DataDirectory = Path.GetFullPath(dataDirectory
            ?? Environment.GetEnvironmentVariable("MPS_DATA_DIR")
            ?? DefaultDataDirectory());
        Directory.CreateDirectory(DataDirectory);
        foreach (var d in new[] { ConfigDirectory, KeysDirectory, LogsDirectory, ToolsDirectory, TempDirectory })
            Directory.CreateDirectory(d);
        ToolLocator.Configure(ToolsDirectory, Path.Combine(AppContext.BaseDirectory, "tools"));
    }

    public string DataDirectory { get; }
    public string ConfigDirectory => Path.Combine(DataDirectory, "config");
    public string KeysDirectory => Path.Combine(DataDirectory, "keys");
    public string LogsDirectory => Path.Combine(DataDirectory, "logs");
    /// <summary>Bundled helper binaries (caddy, cloudflared, frpc, ...) are looked up here first.</summary>
    public string ToolsDirectory => Path.Combine(DataDirectory, "tools");
    public string TempDirectory => Path.Combine(DataDirectory, "temp");
    public string SystemDatabase => Path.Combine(DataDirectory, "system.db");
    public string SetupTokenFile => Path.Combine(DataDirectory, "setup-token.txt");

    static string DefaultDataDirectory() => OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MyPrivateServer")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "my-private-server");
}
