using System.Text.RegularExpressions;
using MyPrivateServer.Core;

namespace MyPrivateServer.RemoteAccess;

/// <summary>
/// HTTPS tunnel using the open-source cloudflared client. With no options it creates a free "quick tunnel"
/// (no account, no domain) at a random https://*.trycloudflare.com address. With a tunnel token it runs a
/// named tunnel on the owner's own Cloudflare account/domain. Optional third party: Cloudflare terminates TLS
/// at its edge, which is disclosed to the owner.
/// </summary>
public sealed partial class CloudflareQuickTunnelProvider(IProcessRunner runner, SettingsStore settings, IHttpClientFactory http) : IRemoteAccessProvider, IDisposable
{
    public string Id => "cloudflare-tunnel";
    const string Name = "Cloudflare Tunnel (HTTPS)";
    readonly ManagedProcess _proc = new("cloudflared");
    string? _url;

    [GeneratedRegex(@"https://[a-z0-9-]+\.trycloudflare\.com")] private static partial Regex QuickUrl();

    public ProviderInfo Describe(IReadOnlyDictionary<string, string> o)
    {
        var named = !string.IsNullOrWhiteSpace(o.GetValueOrDefault("tunnelToken"));
        var exe = runner.Find("cloudflared");
        return new ProviderInfo(Id, Name,
            "A public HTTPS address for the dashboard that works from any browser, with nothing installed on your phone.",
            named ? "Free (your Cloudflare account; a domain you own)" : "Free (no account, no domain)",
            "This PC opens an outbound connection to Cloudflare. Browsers connect to Cloudflare's HTTPS address and requests are forwarded through that connection. " +
            (named ? "" : "Quick-tunnel addresses change each time the tunnel restarts and have no uptime guarantee."),
            ["cloudflared client on this PC"],
            [
                new("tunnelToken", "Tunnel token", "For a permanent address on your own domain. Leave empty for a free quick tunnel.", Secret: true),
                new("publicHostname", "Public hostname (with token)", "The full hostname you routed to this tunnel in Cloudflare (subdomain + your domain).", Placeholder: "nas.example.com"),
            ],
            SupportsDirect: false, SupportsRelay: true, Encryption: "HTTPS (TLS to Cloudflare edge)",
            new ExternalServiceDisclosure("remote.cloudflare", "Cloudflare Tunnel", false,
                "All web traffic to the dashboard and files while you use the remote address. Cloudflare decrypts HTTPS at its edge.",
                "To give the server a public HTTPS address without port forwarding.",
                "Cloudflare edge network"),
            "cloudflared", exe is not null,
            exe is null ? "Download cloudflared for Windows (open source) into the tools folder. The production installer will bundle it." : null);
    }

    public Task<RemoteStatus> StartAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        var exe = runner.Find("cloudflared");
        if (exe is null) return Task.FromResult(RemoteStatus.Simple(RemoteState.Unavailable, Id, Name, "cloudflared is not installed on this PC, so this method is unavailable."));
        _url = null;
        var token = o.GetValueOrDefault("tunnelToken");
        var port = settings.Get().Network.HttpPort;
        _proc.Line -= OnLine; _proc.Line += OnLine;
        if (string.IsNullOrWhiteSpace(token))
            _proc.Start(exe, ["tunnel", "--no-autoupdate", "--url", $"http://127.0.0.1:{port}"]);
        else
        {
            _url = NormalizeHostname(o.GetValueOrDefault("publicHostname")) is { } h ? "https://" + h : null;
            _proc.Start(exe, ["tunnel", "--no-autoupdate", "run", "--token", token], redact: [token]);
        }
        return GetStatusAsync(o, ct);
    }

    void OnLine(string line)
    {
        var m = QuickUrl().Match(line);
        if (m.Success) _url = m.Value;
    }

    public Task StopAsync(CancellationToken ct) { _proc.Stop(); _url = null; return Task.CompletedTask; }

    public Task<RemoteStatus> GetStatusAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        if (!_proc.IsRunning)
            return Task.FromResult(RemoteStatus.Simple(_proc.LastExitCode is null ? RemoteState.Disabled : RemoteState.Error, Id, Name,
                _proc.LastExitCode is null ? "Tunnel is not running." : "The tunnel stopped: " + (_proc.Log(3).LastOrDefault(l => !l.Contains("[process exited")) ?? "unknown error")));
        var named = !string.IsNullOrWhiteSpace(o.GetValueOrDefault("tunnelToken"));
        if (named && NormalizeHostname(o.GetValueOrDefault("publicHostname")) is null)
            return Task.FromResult(RemoteStatus.Simple(RemoteState.NeedsSetup, Id, Name,
                "Enter the full public hostname you set up in Cloudflare, for example nas.example.com (not just the tunnel name)."));
        var connected = _proc.Log(300).Any(l => l.Contains("Registered tunnel connection", StringComparison.OrdinalIgnoreCase));
        if (!connected || _url is null)
            return Task.FromResult(RemoteStatus.Simple(RemoteState.Starting, Id, Name, "Connecting to Cloudflare…"));
        return Task.FromResult(new RemoteStatus(RemoteState.Connected, ConnectionMethod.Tunnel, "HTTPS (TLS to Cloudflare edge)", Id, Name, [_url], true,
            "All traffic enters through Cloudflare's edge. Direct peer-to-peer is not used by this method.", null, [], DateTimeOffset.UtcNow));
    }

    public async Task<IReadOnlyList<DiagnosticCheck>> TestAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        var st = await GetStatusAsync(o, ct);
        var checks = new List<DiagnosticCheck> { new("Tunnel process", st.State == RemoteState.Connected ? CheckOutcome.Pass : CheckOutcome.Fail, st.Reason ?? st.State.ToString()) };
        if (st.AccessAddresses.FirstOrDefault() is { } url)
        {
            try
            {
                var client = http.CreateClient("remote-test");
                var sw = System.Diagnostics.Stopwatch.StartNew();
                using var resp = await client.GetAsync(url.TrimEnd('/') + "/api/health", ct);
                checks.Add(new("Round trip through the Internet", resp.IsSuccessStatusCode ? CheckOutcome.Pass : CheckOutcome.Fail,
                    $"{(int)resp.StatusCode} in {sw.ElapsedMilliseconds} ms via {url}"));
            }
            catch (Exception ex) { checks.Add(new("Round trip through the Internet", CheckOutcome.Fail, ex.Message)); }
        }
        return checks;
    }

    /// <summary>"https://NAS.Example.com/" → "nas.example.com"; null unless it looks like a full host name.</summary>
    internal static string? NormalizeHostname(string? value)
    {
        var h = (value ?? "").Trim().ToLowerInvariant();
        if (h.StartsWith("https://")) h = h[8..]; else if (h.StartsWith("http://")) h = h[7..];
        h = h.TrimEnd('/');
        return h.Contains('.') && Uri.CheckHostName(h) == UriHostNameType.Dns ? h : null;
    }

    public void Dispose() => _proc.Dispose();
}
