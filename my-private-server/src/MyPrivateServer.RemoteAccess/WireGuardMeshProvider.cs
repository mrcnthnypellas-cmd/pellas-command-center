using System.Text.Json;
using MyPrivateServer.Core;

namespace MyPrivateServer.RemoteAccess;

/// <summary>
/// WireGuard mesh VPN using the open-source Tailscale client. Coordination can be either:
///  • a self-hosted Headscale server (fully open source, no account, no fees), or
///  • Tailscale's free personal plan (optional third party).
/// Devices connect peer-to-peer after NAT traversal; if that is impossible (e.g. both sides behind strict CGNAT)
/// traffic falls back to an encrypted DERP relay that cannot read it. This PC only makes outbound connections.
/// </summary>
public sealed class WireGuardMeshProvider(IProcessRunner runner, SettingsStore settings) : IRemoteAccessProvider
{
    public string Id => "wireguard-mesh";
    const string Name = "WireGuard mesh (Tailscale client / Headscale)";

    public ProviderInfo Describe(IReadOnlyDictionary<string, string> o)
    {
        var selfHosted = !string.IsNullOrWhiteSpace(o.GetValueOrDefault("loginServer"));
        var exe = runner.Find("tailscale");
        return new ProviderInfo(Id, Name,
            "Private encrypted network between your devices and this server. Recommended.",
            selfHosted ? "Free (your own Headscale server)" : "Free (Tailscale personal plan, optional third party)",
            "This PC opens an outbound connection to the coordination server, which only exchanges public keys and addresses. " +
            "Your phone or laptop then connects straight to this PC using WireGuard, punching through NAT when possible, " +
            "or through an encrypted relay when both networks are too strict.",
            ["Tailscale client installed on this PC and on each device", selfHosted ? "A Headscale server reachable from the Internet" : "A free Tailscale account (or set a Headscale login server)"],
            [
                new("loginServer", "Coordination server (Headscale URL)", "Leave empty to use Tailscale's free service. Set to your Headscale URL for fully self-hosted coordination.", Placeholder: "https://headscale.example.net"),
                new("authKey", "Pre-auth key", "Optional. Joins without opening a browser.", Secret: true),
                new("hostname", "Device name on the private network", "Defaults to the server name.", Placeholder: "my-private-server"),
            ],
            SupportsDirect: true, SupportsRelay: true, Encryption: "WireGuard (end-to-end)",
            new ExternalServiceDisclosure("remote.wireguard", "WireGuard coordination", false,
                "Device public keys, device names, and the public IP/ports this PC is reachable at. When relayed, already-encrypted WireGuard packets.",
                "To let your devices find each other and set up direct encrypted connections.",
                selfHosted ? $"Your Headscale server ({o["loginServer"]})" : "Tailscale coordination and DERP relay servers"),
            "tailscale", exe is not null,
            exe is null ? "Install the Tailscale client for Windows (it runs the open-source WireGuard engine). The production installer will bundle it." : null);
    }

    public async Task<RemoteStatus> StartAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        if (runner.Find("tailscale") is null) return Missing();
        var args = new List<string> { "up", "--reset", "--accept-dns=false", "--timeout=25s", "--hostname=" + Hostname(o) };
        if (o.GetValueOrDefault("loginServer") is { Length: > 0 } ls) args.Add("--login-server=" + ls);
        var key = o.GetValueOrDefault("authKey");
        if (!string.IsNullOrEmpty(key)) args.Add("--authkey=" + key);
        var r = await runner.RunAsync("tailscale", args, new ProcessOptions { Timeout = TimeSpan.FromSeconds(40), Redact = key is null ? [] : [key] }, ct);
        var login = ExtractUrl(r.Output);
        if (login is not null)
            return RemoteStatus.Simple(RemoteState.NeedsSetup, Id, Name, "Approve this server on the coordination service to finish joining.") with { ActionUrl = login };
        return await GetStatusAsync(o, ct);
    }

    public async Task StopAsync(CancellationToken ct)
    {
        if (runner.Find("tailscale") is null) return;
        await runner.RunAsync("tailscale", ["down"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(20) }, ct);
    }

    public async Task<RemoteStatus> GetStatusAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        if (runner.Find("tailscale") is null) return Missing();
        var r = await runner.RunAsync("tailscale", ["status", "--json"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(10) }, ct);
        if (r.ExitCode != 0 && !r.Output.TrimStart().StartsWith('{'))
            return RemoteStatus.Simple(RemoteState.Error, Id, Name, "The Tailscale service is not running on this PC. " + r.Output.Trim().Split('\n')[0]);
        return ParseStatus(r.Output[r.Output.IndexOf('{')..], settings.Get().Network.HttpPort);
    }

    internal RemoteStatus ParseStatus(string json, int httpPort)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var backend = root.TryGetProperty("BackendState", out var b) ? b.GetString() : null;
        if (backend is "NeedsLogin" or "NeedsMachineAuth")
            return RemoteStatus.Simple(RemoteState.NeedsSetup, Id, Name, backend == "NeedsLogin" ? "Sign in to the coordination server to join." : "Approve this server in the coordination server's admin panel.")
                with { ActionUrl = root.TryGetProperty("AuthURL", out var au) && au.GetString() is { Length: > 0 } u ? u : null };
        if (backend != "Running")
            return RemoteStatus.Simple(backend == "Stopped" ? RemoteState.Disabled : RemoteState.Starting, Id, Name, $"WireGuard mesh state: {backend}.");

        var addresses = new List<string>();
        if (root.TryGetProperty("Self", out var self))
        {
            if (self.TryGetProperty("TailscaleIPs", out var ips))
                foreach (var ip in ips.EnumerateArray()) if (ip.GetString() is { } s && !s.Contains(':')) addresses.Add($"http://{s}:{httpPort}");
            if (self.TryGetProperty("DNSName", out var dn) && dn.GetString()?.TrimEnd('.') is { Length: > 0 } dns) addresses.Insert(0, $"http://{dns}:{httpPort}");
        }
        var peers = new List<RemotePeer>();
        if (root.TryGetProperty("Peer", out var peerMap) && peerMap.ValueKind == JsonValueKind.Object)
            foreach (var p in peerMap.EnumerateObject())
            {
                var v = p.Value;
                var online = v.TryGetProperty("Online", out var on) && on.ValueKind == JsonValueKind.True;
                var active = v.TryGetProperty("Active", out var ac) && ac.ValueKind == JsonValueKind.True;
                var cur = v.TryGetProperty("CurAddr", out var ca) ? ca.GetString() : null;
                var relay = v.TryGetProperty("Relay", out var rl) ? rl.GetString() : null;
                var method = !active ? ConnectionMethod.Pending
                    : !string.IsNullOrEmpty(cur) ? (StunClient.IsPrivateOrShared(cur) ? ConnectionMethod.Direct : ConnectionMethod.NatTraversal)
                    : ConnectionMethod.Relay;
                DateTimeOffset? seen = v.TryGetProperty("LastSeen", out var ls) && DateTimeOffset.TryParse(ls.GetString(), out var t) && t.Year > 2000 ? t : null;
                peers.Add(new RemotePeer(v.TryGetProperty("HostName", out var hn) ? hn.GetString() ?? p.Name : p.Name,
                    v.TryGetProperty("OS", out var os) ? os.GetString() : null, online, method,
                    method == ConnectionMethod.Relay ? $"relay {relay}" : cur, online ? DateTimeOffset.UtcNow : seen));
            }
        var activePeers = peers.Where(p => p.Method != ConnectionMethod.Pending).ToList();
        ConnectionMethod overall; bool? relayRequired; string reason;
        if (activePeers.Count == 0)
        { overall = ConnectionMethod.Pending; relayRequired = null; reason = "Ready. The connection path is chosen when a device connects."; }
        else if (activePeers.Any(p => p.Method is ConnectionMethod.Direct or ConnectionMethod.NatTraversal))
        {
            overall = activePeers.Any(p => p.Method == ConnectionMethod.NatTraversal) ? ConnectionMethod.NatTraversal : ConnectionMethod.Direct;
            relayRequired = activePeers.Any(p => p.Method == ConnectionMethod.Relay);
            reason = relayRequired == true ? "Some devices are using the encrypted relay because a direct path could not be made." : "Devices are connected peer-to-peer.";
        }
        else { overall = ConnectionMethod.Relay; relayRequired = true; reason = "Direct connection unavailable (strict NAT or firewall). Traffic is relayed, still end-to-end encrypted."; }
        return new RemoteStatus(RemoteState.Connected, overall, "WireGuard (end-to-end)", Id, Name, addresses, relayRequired, reason, null, peers, DateTimeOffset.UtcNow);
    }

    public async Task<IReadOnlyList<DiagnosticCheck>> TestAsync(IReadOnlyDictionary<string, string> o, CancellationToken ct)
    {
        var checks = new List<DiagnosticCheck>();
        if (runner.Find("tailscale") is null) { checks.Add(new("Tailscale client", CheckOutcome.Fail, "Not installed on this PC.")); return checks; }
        var st = await GetStatusAsync(o, ct);
        checks.Add(new("Mesh connection", st.State == RemoteState.Connected ? CheckOutcome.Pass : CheckOutcome.Fail, st.Reason ?? st.State.ToString()));
        var r = await runner.RunAsync("tailscale", ["netcheck", "--format=json"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(30) }, ct);
        try
        {
            using var doc = JsonDocument.Parse(r.Output[r.Output.IndexOf('{')..]);
            var n = doc.RootElement;
            var udp = n.TryGetProperty("UDP", out var u) && u.ValueKind == JsonValueKind.True;
            checks.Add(new("Outbound UDP", udp ? CheckOutcome.Pass : CheckOutcome.Warn, udp ? "Available: direct connections possible." : "Blocked: all traffic will use the encrypted relay."));
            if (n.TryGetProperty("MappingVariesByDestIP", out var mv) && mv.ValueKind == JsonValueKind.True)
                checks.Add(new("NAT type", CheckOutcome.Warn, "Strict (symmetric) NAT: direct connections may fail with some networks; relay fallback will be used."));
            else checks.Add(new("NAT type", CheckOutcome.Pass, "NAT traversal friendly."));
            if (n.TryGetProperty("PreferredDERP", out var pd)) checks.Add(new("Nearest relay", CheckOutcome.Info, $"Relay region {pd}"));
        }
        catch { checks.Add(new("Network check", CheckOutcome.Warn, "Could not run netcheck: " + r.Output.Trim().Split('\n')[0])); }
        return checks;
    }

    string Hostname(IReadOnlyDictionary<string, string> o)
    {
        var h = o.GetValueOrDefault("hostname");
        if (string.IsNullOrWhiteSpace(h)) h = settings.Get().ServerName;
        var clean = new string(h.ToLowerInvariant().Select(ch => char.IsAsciiLetterOrDigit(ch) ? ch : '-').ToArray()).Trim('-');
        return clean.Length == 0 ? "my-private-server" : clean[..Math.Min(clean.Length, 60)];
    }

    static string? ExtractUrl(string output) =>
        output.Split(['\n', ' ', '\t'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(s => s.StartsWith("https://") && (s.Contains("/a/") || s.Contains("register") || s.Contains("login")));

    RemoteStatus Missing() => RemoteStatus.Simple(RemoteState.Unavailable, Id, Name, "The Tailscale client is not installed on this PC, so this method is unavailable.");
}
