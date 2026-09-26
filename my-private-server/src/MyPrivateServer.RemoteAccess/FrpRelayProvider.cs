using System.Net.Sockets;
using MyPrivateServer.Core;

namespace MyPrivateServer.RemoteAccess;

/// <summary>
/// Self-hosted relay using the open-source frp project (frpc on this PC, frps on any machine you control
/// that has a reachable address: a friend's server, an office PC with a public IP, or a free-tier VM).
/// Everything stays under the owner's control; no third party is involved.
/// </summary>
public sealed class FrpRelayProvider(IProcessRunner runner, SettingsStore settings, ServerPaths paths) : IRemoteAccessProvider, IDisposable
{
    public string Id => "self-hosted-relay";
    const string Name = "Self-hosted relay (frp)";
    readonly ManagedProcess _proc = new("frpc");

    public ProviderInfo Describe(IReadOnlyDictionary<string, string> o)
    {
        var exe = runner.Find("frpc");
        var server = o.GetValueOrDefault("serverAddr");
        return new ProviderInfo(Id, Name,
            "Your own relay on a machine you control. No third-party service involved.",
            "Free (open source; you provide the relay machine)",
            "This PC keeps an encrypted outbound connection to your relay (frps). Devices connect to the relay's address and traffic is forwarded through that connection.",
            ["frpc on this PC", "frps running on a machine with a public IP or reachable address"],
            [
                new("serverAddr", "Relay address", "Host name or IP of the machine running frps.", Required: true, Placeholder: "relay.example.net"),
                new("serverPort", "Relay port", "frps bind port.", Placeholder: "7000"),
                new("token", "Relay token", "Shared secret configured in frps.", Secret: true, Required: true),
                new("remotePort", "Public port on the relay", "Devices connect to relay-address:this-port.", Required: true, Placeholder: "18080"),
            ],
            SupportsDirect: false, SupportsRelay: true, Encryption: "TLS between this PC and the relay",
            new ExternalServiceDisclosure("remote.frp", "Self-hosted relay", false,
                "Dashboard and file traffic forwarded through your relay while remote access is used.",
                "To reach this server when it cannot accept incoming connections.",
                string.IsNullOrEmpty(server) ? "Your relay machine" : $"Your relay machine ({server})"),
            "frpc", exe is not null,
            exe is null ? "Put frpc.exe (github.com/fatedier/frp, open source) in the tools folder. The production installer will bundle it." : null);
    }

    string ConfigPath => Path.Combine(paths.ConfigDirectory, "frpc.toml");

    public Task<RemoteStatus> StartAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        var exe = runner.Find("frpc");
        if (exe is null) return Task.FromResult(RemoteStatus.Simple(RemoteState.Unavailable, Id, Name, "frpc is not installed on this PC, so this method is unavailable."));
        if (string.IsNullOrWhiteSpace(o.GetValueOrDefault("serverAddr")) || string.IsNullOrWhiteSpace(o.GetValueOrDefault("remotePort")) || string.IsNullOrWhiteSpace(o.GetValueOrDefault("token")))
            return Task.FromResult(RemoteStatus.Simple(RemoteState.NeedsSetup, Id, Name, "Enter your relay address, token and public port."));
        File.WriteAllText(ConfigPath, RenderConfig(o, settings.Get().Network.HttpPort, settings.Get().ServerId));
        _proc.Start(exe, ["-c", ConfigPath], redact: [o["token"]]);
        return GetStatusAsync(o, ct);
    }

    /// <summary>frpc TOML config. Values are validated so they cannot inject extra settings.</summary>
    public static string RenderConfig(IReadOnlyDictionary<string, string> o, int localPort, string serverId)
    {
        static string Q(string v) => "\"" + v.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "").Replace("\r", "") + "\"";
        var serverPort = int.TryParse(o.GetValueOrDefault("serverPort"), out var sp) && sp is > 0 and < 65536 ? sp : 7000;
        if (!int.TryParse(o.GetValueOrDefault("remotePort"), out var rp) || rp is <= 0 or >= 65536) throw new UserFacingException("Public port must be a number between 1 and 65535.");
        return $"""
            serverAddr = {Q(o["serverAddr"].Trim())}
            serverPort = {serverPort}
            auth.method = "token"
            auth.token = {Q(o["token"])}
            transport.tls.enable = true
            loginFailExit = false

            [[proxies]]
            name = {Q(serverId.ToLowerInvariant() + "-dashboard")}
            type = "tcp"
            localIP = "127.0.0.1"
            localPort = {localPort}
            remotePort = {rp}
            """;
    }

    public Task StopAsync(CancellationToken ct) { _proc.Stop(); return Task.CompletedTask; }

    public Task<RemoteStatus> GetStatusAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        if (!_proc.IsRunning)
            return Task.FromResult(RemoteStatus.Simple(_proc.LastExitCode is null ? RemoteState.Disabled : RemoteState.Error, Id, Name,
                _proc.LastExitCode is null ? "Relay client is not running." : "Relay client stopped: " + (_proc.Log(3).FirstOrDefault() ?? "")));
        var log = _proc.Log(200);
        var ok = log.Any(l => l.Contains("start proxy success", StringComparison.OrdinalIgnoreCase));
        var failed = log.LastOrDefault(l => l.Contains("login to server failed", StringComparison.OrdinalIgnoreCase) || l.Contains("start error", StringComparison.OrdinalIgnoreCase));
        if (!ok) return Task.FromResult(RemoteStatus.Simple(failed is null ? RemoteState.Starting : RemoteState.Error, Id, Name, failed ?? "Connecting to your relay…"));
        return Task.FromResult(new RemoteStatus(RemoteState.Connected, ConnectionMethod.Relay, "TLS between this PC and the relay", Id, Name,
            [$"http://{o["serverAddr"]}:{o["remotePort"]}"], true, "Traffic is forwarded by your own relay.", null, [], DateTimeOffset.UtcNow));
    }

    public async Task<IReadOnlyList<DiagnosticCheck>> TestAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        var checks = new List<DiagnosticCheck>();
        var st = await GetStatusAsync(o, ct);
        checks.Add(new("Relay client", st.State == RemoteState.Connected ? CheckOutcome.Pass : CheckOutcome.Fail, st.Reason ?? ""));
        if (o.GetValueOrDefault("serverAddr") is { Length: > 0 } host && int.TryParse(o.GetValueOrDefault("remotePort"), out var port))
        {
            try
            {
                using var tcp = new TcpClient();
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct); cts.CancelAfter(5000);
                await tcp.ConnectAsync(host, port, cts.Token);
                checks.Add(new("Public port on relay", CheckOutcome.Pass, $"{host}:{port} is reachable."));
            }
            catch (Exception ex) { checks.Add(new("Public port on relay", CheckOutcome.Fail, $"{host}:{port} not reachable: {ex.Message}")); }
        }
        return checks;
    }

    public void Dispose() => _proc.Dispose();
}
