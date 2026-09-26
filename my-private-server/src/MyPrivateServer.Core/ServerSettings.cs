using System.Text.Json;
using System.Text.Json.Serialization;

namespace MyPrivateServer.Core;

public sealed class ServerSettings
{
    public string ServerId { get; set; } = "";
    public string ServerName { get; set; } = "My Private Server";
    public bool SetupCompleted { get; set; }
    public DateTimeOffset? SetupCompletedAt { get; set; }
    /// <summary>Root folder on the chosen HDD/SSD, e.g. D:\MyPrivateServer.</summary>
    public string? StorageRoot { get; set; }
    public NetworkSettings Network { get; set; } = new();
    public SecuritySettings Security { get; set; } = new();
    public PostgresSettings Postgres { get; set; } = new();
    public RemoteAccessSettings RemoteAccess { get; set; } = new();
    public DeploymentSettings Deployments { get; set; } = new();
    public TelemetrySettings Telemetry { get; set; } = new();
}

public sealed class NetworkSettings
{
    public int HttpPort { get; set; } = 8080;
    public int HttpsPort { get; set; } = 8443;
    /// <summary>Listen on all interfaces so other devices on the LAN can reach the dashboard.</summary>
    public bool AllowLan { get; set; } = true;
}

public sealed class SecuritySettings
{
    public int MinPasswordLength { get; set; } = 10;
    public int MaxFailedLogins { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int SessionIdleMinutes { get; set; } = 60;
    public int SessionAbsoluteHours { get; set; } = 24 * 7;
}

public sealed class PostgresSettings
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 5432;
    public string AdminUser { get; set; } = "postgres";
    /// <summary>Encrypted with the machine-bound Data Protection key; never returned to the browser.</summary>
    public string? AdminPasswordProtected { get; set; }
    /// <summary>Host name/IP shown to developers in connection info.</summary>
    public string? PublicHost { get; set; }
    /// <summary>True when the server created and runs its own PostgreSQL (bundled binaries).</summary>
    public bool Managed { get; set; }
    public string? DataDirectory { get; set; }
}

public sealed class RemoteAccessSettings
{
    public bool Enabled { get; set; }
    public string ProviderId { get; set; } = "wireguard-mesh";
    /// <summary>Provider-specific options (login server URL, relay address...). Secrets are stored protected.</summary>
    public Dictionary<string, string> Options { get; set; } = new();
    public DateTimeOffset? LastConnectedAt { get; set; }
}

public sealed class DeploymentSettings
{
    /// <summary>How often connected repositories are checked for new commits (works behind CGNAT; no inbound webhook needed).</summary>
    public int PollMinutes { get; set; } = 5;
}

public sealed class TelemetrySettings
{
    /// <summary>Optional OTLP endpoint. Empty = no telemetry leaves the machine.</summary>
    public string? OtlpEndpoint { get; set; }
}

/// <summary>Thread-safe JSON-file store with atomic writes.</summary>
public sealed class JsonFileStore<T> where T : class, new()
{
    static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    readonly string _path;
    readonly Lock _gate = new();
    T _value;

    public JsonFileStore(string path)
    {
        _path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        _value = File.Exists(path) ? JsonSerializer.Deserialize<T>(File.ReadAllText(path), Options) ?? new T() : new T();
    }

    public T Get() { lock (_gate) return Clone(_value); }

    public T Update(Action<T> mutate)
    {
        lock (_gate)
        {
            var copy = Clone(_value);
            mutate(copy);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(copy, Options));
            File.Move(tmp, _path, overwrite: true);
            _value = copy;
            return Clone(copy);
        }
    }

    static T Clone(T v) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, Options), Options)!;
}

public sealed class SettingsStore
{
    readonly JsonFileStore<ServerSettings> _store;
    public event Action<ServerSettings>? Changed;

    public SettingsStore(ServerPaths paths)
    {
        _store = new JsonFileStore<ServerSettings>(Path.Combine(paths.ConfigDirectory, "server.json"));
        if (string.IsNullOrEmpty(_store.Get().ServerId))
            _store.Update(s => s.ServerId = ServerIdentity.NewServerId());
    }

    public ServerSettings Get() => _store.Get();

    public ServerSettings Update(Action<ServerSettings> mutate)
    {
        var s = _store.Update(mutate);
        Changed?.Invoke(s);
        return s;
    }
}
