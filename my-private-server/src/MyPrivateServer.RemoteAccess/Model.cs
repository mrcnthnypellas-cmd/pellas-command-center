using MyPrivateServer.Core;

namespace MyPrivateServer.RemoteAccess;

public enum RemoteState { Disabled, Starting, Connected, NeedsSetup, Unavailable, Error }

/// <summary>How traffic from a remote device reaches this server.</summary>
public enum ConnectionMethod
{
    None,
    /// <summary>Peer-to-peer on the same local network.</summary>
    Direct,
    /// <summary>Peer-to-peer across the Internet after UDP hole punching.</summary>
    NatTraversal,
    /// <summary>Encrypted packets forwarded by a relay because a direct path could not be made.</summary>
    Relay,
    /// <summary>HTTPS reverse tunnel: all traffic enters through the tunnel provider's edge.</summary>
    Tunnel,
    /// <summary>Connected and ready; the path is chosen when a device connects.</summary>
    Pending,
}

public sealed record RemotePeer(string Name, string? Os, bool Online, ConnectionMethod Method, string? Via, DateTimeOffset? LastSeen);

public sealed record RemoteStatus(
    RemoteState State,
    ConnectionMethod Method,
    string Encryption,
    string ProviderId,
    string ProviderName,
    IReadOnlyList<string> AccessAddresses,
    bool? RelayRequired,
    string? Reason,
    string? ActionUrl,
    IReadOnlyList<RemotePeer> Peers,
    DateTimeOffset CheckedAt,
    DateTimeOffset? LastConnectedAt = null)
{
    public static RemoteStatus Simple(RemoteState state, string providerId, string providerName, string? reason, string encryption = "—") =>
        new(state, ConnectionMethod.None, encryption, providerId, providerName, [], null, reason, null, [], DateTimeOffset.UtcNow);
}

public sealed record ProviderOption(string Key, string Label, string Help, bool Secret = false, bool Required = false, string? Placeholder = null);

public sealed record ProviderInfo(
    string Id, string Name, string Summary, string Cost, string HowItWorks,
    IReadOnlyList<string> Needs, IReadOnlyList<ProviderOption> Options,
    bool SupportsDirect, bool SupportsRelay, string Encryption,
    ExternalServiceDisclosure Disclosure, string? ExecutableName, bool ExecutableFound, string? InstallHelp);

/// <summary>
/// A pluggable way of reaching this server from outside the local network. Every provider makes
/// only outbound connections from this PC, so no port forwarding, static IP or router changes are needed.
/// </summary>
public interface IRemoteAccessProvider
{
    string Id { get; }
    ProviderInfo Describe(IReadOnlyDictionary<string, string> options);
    Task<RemoteStatus> StartAsync(IReadOnlyDictionary<string, string> options, CancellationToken ct);
    Task StopAsync(CancellationToken ct);
    Task<RemoteStatus> GetStatusAsync(IReadOnlyDictionary<string, string> options, CancellationToken ct);
    /// <summary>Provider-specific end-to-end checks. Each line is shown to the user.</summary>
    Task<IReadOnlyList<DiagnosticCheck>> TestAsync(IReadOnlyDictionary<string, string> options, CancellationToken ct);
}

public enum CheckOutcome { Pass, Warn, Fail, Info }
public sealed record DiagnosticCheck(string Name, CheckOutcome Outcome, string Detail);
