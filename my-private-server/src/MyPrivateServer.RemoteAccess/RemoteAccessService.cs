using System.Net.NetworkInformation;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;

namespace MyPrivateServer.RemoteAccess;

public sealed record RemoteEvent(DateTimeOffset At, string Level, string Message);

/// <summary>
/// Owns the active remote-access provider: starts it, checks its health every 15 seconds, reconnects with
/// exponential backoff, and reports honestly when a method is unavailable. Local access never depends on it.
/// </summary>
public sealed class RemoteAccessService : BackgroundService, IHealthProbe, IExternalServiceSource
{
    const string SecretPrefix = "enc:";
    readonly Dictionary<string, IRemoteAccessProvider> _providers;
    readonly SettingsStore _settings;
    readonly ISecretProtector _secrets;
    readonly IAuditLog _audit;
    readonly ILogger<RemoteAccessService> _log;
    readonly SemaphoreSlim _gate = new(1, 1);
    readonly LinkedList<RemoteEvent> _events = new();
    readonly SemaphoreSlim _wake = new(0);
    RemoteStatus _status;
    int _failures;
    DateTimeOffset _nextRetry = DateTimeOffset.MinValue;
    bool _started;

    public RemoteAccessService(IEnumerable<IRemoteAccessProvider> providers, SettingsStore settings, ISecretProtector secrets, IAuditLog audit, ILogger<RemoteAccessService> log)
    {
        _providers = providers.ToDictionary(p => p.Id);
        _settings = settings; _secrets = secrets; _audit = audit; _log = log;
        _status = RemoteStatus.Simple(RemoteState.Disabled, "none", "Remote access", "Remote access is turned off. The server is reachable on your local network only.");
        NetworkChange.NetworkAddressChanged += (_, _) => { AddEvent("info", "Network change detected; re-checking remote access."); _nextRetry = DateTimeOffset.MinValue; _wake.Release(); };
    }

    public string Name => "Remote access";
    public RemoteStatus Status => _status;
    public IReadOnlyList<RemoteEvent> Events() { lock (_events) return _events.Reverse().ToList(); }

    public IReadOnlyList<ProviderInfo> Providers()
    {
        var s = _settings.Get().RemoteAccess;
        return _providers.Values.Select(p => p.Describe(p.Id == s.ProviderId ? Decrypt(s.Options) : new Dictionary<string, string>())).ToList();
    }

    /// <summary>Options with secrets replaced by a placeholder, safe to send to the dashboard.</summary>
    public IReadOnlyDictionary<string, string> MaskedOptions() =>
        _settings.Get().RemoteAccess.Options.ToDictionary(kv => kv.Key, kv => kv.Value.StartsWith(SecretPrefix) ? "••••••••" : kv.Value);

    IReadOnlyDictionary<string, string> Decrypt(Dictionary<string, string> o) =>
        o.ToDictionary(kv => kv.Key, kv => kv.Value.StartsWith(SecretPrefix) ? SafeUnprotect(kv.Value[SecretPrefix.Length..]) : kv.Value);

    string SafeUnprotect(string v) { try { return _secrets.Unprotect(v); } catch { return ""; } }

    public async Task<RemoteStatus> EnableAsync(string providerId, IDictionary<string, string>? options, string actor, CancellationToken ct)
    {
        if (!_providers.TryGetValue(providerId, out var provider)) throw new UserFacingException("Unknown remote access method.");
        var info = provider.Describe(new Dictionary<string, string>());
        var secretKeys = info.Options.Where(o => o.Secret).Select(o => o.Key).ToHashSet();
        await _gate.WaitAsync(ct);
        try
        {
            var current = _settings.Get().RemoteAccess;
            if (current.Enabled && current.ProviderId != providerId && _providers.TryGetValue(current.ProviderId, out var old)) await old.StopAsync(ct);
            _settings.Update(s =>
            {
                var merged = s.RemoteAccess.ProviderId == providerId ? new Dictionary<string, string>(s.RemoteAccess.Options) : new Dictionary<string, string>();
                foreach (var (k, v) in options ?? new Dictionary<string, string>())
                {
                    if (!info.Options.Any(o => o.Key == k)) continue;
                    if (v == "••••••••") continue; // unchanged secret
                    if (string.IsNullOrWhiteSpace(v)) { merged.Remove(k); continue; }
                    merged[k] = secretKeys.Contains(k) ? SecretPrefix + _secrets.Protect(v.Trim()) : v.Trim();
                }
                s.RemoteAccess.ProviderId = providerId; s.RemoteAccess.Options = merged; s.RemoteAccess.Enabled = true;
            });
            _failures = 0;
            _audit.Write(actor, "remote", "Remote access enabled", info.Name, null, AuditSeverity.Info);
            AddEvent("info", $"Starting {info.Name}…");
            return await StartCurrentAsync(ct);
        }
        finally { _gate.Release(); }
    }

    public async Task DisableAsync(string actor, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var s = _settings.Get().RemoteAccess;
            if (_providers.TryGetValue(s.ProviderId, out var p)) await p.StopAsync(ct);
            _settings.Update(x => x.RemoteAccess.Enabled = false);
            _status = RemoteStatus.Simple(RemoteState.Disabled, s.ProviderId, "Remote access", "Remote access is turned off. The server is reachable on your local network only.");
            _audit.Write(actor, "remote", "Remote access disabled", null, null, AuditSeverity.Warning);
            AddEvent("warn", "Remote access turned off.");
        }
        finally { _gate.Release(); }
    }

    public async Task<RemoteStatus> ReconnectAsync(string actor, CancellationToken ct)
    {
        var s = _settings.Get().RemoteAccess;
        if (!s.Enabled) throw new UserFacingException("Remote access is turned off.");
        await _gate.WaitAsync(ct);
        try
        {
            if (_providers.TryGetValue(s.ProviderId, out var p)) await p.StopAsync(ct);
            _audit.Write(actor, "remote", "Remote access reconnect requested");
            AddEvent("info", "Reconnecting…");
            return await StartCurrentAsync(ct);
        }
        finally { _gate.Release(); }
    }

    public async Task<IReadOnlyList<DiagnosticCheck>> TestAsync(bool includeStun, CancellationToken ct)
    {
        var checks = new List<DiagnosticCheck>();
        var up = NetworkInterface.GetIsNetworkAvailable();
        checks.Add(new("Network adapter", up ? CheckOutcome.Pass : CheckOutcome.Fail, up ? "Connected to a network." : "No network connection."));
        checks.Add(new("Local access", CheckOutcome.Pass, "The dashboard is available on your local network: " +
            string.Join(", ", StunClient.LocalIPv4().Select(ip => $"http://{ip}:{_settings.Get().Network.HttpPort}"))));
        if (includeStun)
        {
            var nat = await StunClient.ProbeAsync(ct: ct);
            checks.Add(new("Internet path (STUN)", nat.Kind == NatKind.UdpBlocked ? CheckOutcome.Warn : CheckOutcome.Pass,
                (nat.PublicAddress is null ? "" : $"Public address {nat.PublicAddress}. ") + nat.Explanation));
        }
        var s = _settings.Get().RemoteAccess;
        if (s.Enabled && _providers.TryGetValue(s.ProviderId, out var p)) checks.AddRange(await p.TestAsync(Decrypt(s.Options), ct));
        else checks.Add(new("Remote access", CheckOutcome.Info, "Remote access is off."));
        return checks;
    }

    async Task<RemoteStatus> StartCurrentAsync(CancellationToken ct)
    {
        var s = _settings.Get().RemoteAccess;
        var p = _providers[s.ProviderId];
        RemoteStatus st;
        try { st = await p.StartAsync(Decrypt(s.Options), ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        { st = RemoteStatus.Simple(RemoteState.Error, p.Id, p.Describe(new Dictionary<string, string>()).Name, ex.Message); }
        return Record(st);
    }

    RemoteStatus Record(RemoteStatus st)
    {
        var prev = _status;
        if (st.State == RemoteState.Connected)
        {
            _failures = 0;
            _settings.Update(x => x.RemoteAccess.LastConnectedAt = DateTimeOffset.UtcNow);
            if (prev.State != RemoteState.Connected) { AddEvent("ok", $"Connected via {st.Method}."); _audit.Write("system", "remote", "Remote access connected", st.ProviderName, st.Method.ToString(), AuditSeverity.Success); }
            else if (prev.Method != st.Method) AddEvent("info", $"Connection method changed: {prev.Method} → {st.Method}.");
        }
        else if (prev.State == RemoteState.Connected && st.State is RemoteState.Error or RemoteState.Unavailable)
        {
            AddEvent("warn", "Remote access lost: " + st.Reason);
            _audit.Write("system", "remote", "Remote access disconnected", st.ProviderName, st.Reason, AuditSeverity.Warning);
        }
        _status = st with { LastConnectedAt = _settings.Get().RemoteAccess.LastConnectedAt };
        return _status;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Yield();
        while (!ct.IsCancellationRequested)
        {
            try { await TickAsync(ct); }
            catch (Exception ex) when (!ct.IsCancellationRequested) { _log.LogWarning(ex, "Remote access check failed"); }
            await _wake.WaitAsync(TimeSpan.FromSeconds(15), ct).ContinueWith(_ => { }, TaskScheduler.Default);
        }
    }

    async Task TickAsync(CancellationToken ct)
    {
        var s = _settings.Get().RemoteAccess;
        if (!s.Enabled || !_providers.TryGetValue(s.ProviderId, out var p)) return;
        await _gate.WaitAsync(ct);
        try
        {
            if (!NetworkInterface.GetIsNetworkAvailable())
            {
                Record(RemoteStatus.Simple(RemoteState.Unavailable, p.Id, p.Describe(new Dictionary<string, string>()).Name,
                    "No Internet connection. Remote access will reconnect automatically; local access keeps working."));
                return;
            }
            if (!_started) { _started = true; await StartCurrentAsync(ct); return; }
            var st = Record(await p.GetStatusAsync(Decrypt(s.Options), ct));
            if (st.State is RemoteState.Error or RemoteState.Disabled && DateTimeOffset.UtcNow >= _nextRetry)
            {
                _failures++;
                var delay = TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, Math.Min(_failures, 6))));
                _nextRetry = DateTimeOffset.UtcNow + delay;
                AddEvent("warn", $"Reconnecting (attempt {_failures}); next retry in {delay.TotalSeconds:0}s if this fails.");
                await StartCurrentAsync(ct);
            }
        }
        finally { _gate.Release(); }
    }

    void AddEvent(string level, string msg)
    {
        lock (_events) { _events.AddLast(new RemoteEvent(DateTimeOffset.UtcNow, level, msg)); while (_events.Count > 100) _events.RemoveFirst(); }
        _log.LogInformation("Remote access: {Message}", msg);
    }

    public Task<HealthResult> CheckAsync(CancellationToken ct) => Task.FromResult(_status.State switch
    {
        RemoteState.Connected => new HealthResult(Name, HealthState.Healthy, $"Connected ({_status.Method})"),
        RemoteState.Disabled => new HealthResult(Name, HealthState.Disabled, "Off (local network only)"),
        RemoteState.Starting => new HealthResult(Name, HealthState.Degraded, "Connecting…"),
        RemoteState.NeedsSetup => new HealthResult(Name, HealthState.Degraded, "Needs setup", _status.Reason),
        _ => new HealthResult(Name, HealthState.Unavailable, _status.State.ToString(), _status.Reason),
    });

    public IEnumerable<ExternalServiceDisclosure> GetDisclosures()
    {
        var s = _settings.Get().RemoteAccess;
        foreach (var p in _providers.Values)
        {
            var d = p.Describe(p.Id == s.ProviderId ? Decrypt(s.Options) : new Dictionary<string, string>()).Disclosure;
            yield return d with { Enabled = s.Enabled && s.ProviderId == p.Id };
        }
        yield return new ExternalServiceDisclosure("remote.stun", "STUN network test", false,
            "A 20-byte request; the STUN server sees only this PC's public IP address.",
            "To detect NAT/CGNAT when you run a connection test.", string.Join(", ", StunClient.DefaultServers));
    }
}
