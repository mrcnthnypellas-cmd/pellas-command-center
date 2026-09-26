using System.Buffers.Binary;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;

namespace MyPrivateServer.RemoteAccess;

public enum NatKind { Unknown, NoNat, EndpointIndependent, Symmetric, UdpBlocked }

public sealed record NatReport(
    NatKind Kind, string? PublicAddress, IReadOnlyList<string> LocalAddresses, IReadOnlyList<string> MappedEndpoints,
    bool LikelyCgnatOrDoubleNat, string Explanation);

/// <summary>
/// Minimal RFC 5389 STUN client used to learn how this network translates UDP traffic.
/// Only a 20-byte binding request is sent; the STUN server sees nothing but this PC's public IP address.
/// Two servers are queried from the same socket: if they see different public ports, the NAT is symmetric
/// and direct peer-to-peer connections usually need a relay.
/// </summary>
public static class StunClient
{
    public static readonly string[] DefaultServers = ["stun.l.google.com:19302", "stun.cloudflare.com:3478"];

    public static async Task<NatReport> ProbeAsync(IEnumerable<string>? servers = null, CancellationToken ct = default)
    {
        var local = LocalIPv4();
        using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socket.Bind(new IPEndPoint(IPAddress.Any, 0));
        var mapped = new List<IPEndPoint>();
        foreach (var s in servers ?? DefaultServers)
        {
            try
            {
                var ep = await ResolveAsync(s, ct);
                var m = await BindingAsync(socket, ep, ct);
                if (m is not null) mapped.Add(m);
            }
            catch (Exception) when (!ct.IsCancellationRequested) { }
        }
        return Classify(local, mapped);
    }

    internal static NatReport Classify(IReadOnlyList<string> local, IReadOnlyList<IPEndPoint> mapped)
    {
        var endpoints = mapped.Select(m => m.ToString()).ToList();
        if (mapped.Count == 0)
            return new(NatKind.UdpBlocked, null, local, endpoints, false,
                "No STUN server answered. Outgoing UDP may be blocked (or there is no Internet). Direct peer-to-peer will not work; a relay or HTTPS tunnel is required.");
        var pub = mapped[0].Address.ToString();
        if (local.Contains(pub))
            return new(NatKind.NoNat, pub, local, endpoints, false, "This PC has a public IP address. Direct connections are possible.");
        var privateLocal = local.Any(IsPrivateOrShared);
        var symmetric = mapped.Select(m => m.Port).Distinct().Count() > 1 || mapped.Select(m => m.Address.ToString()).Distinct().Count() > 1;
        if (symmetric)
            return new(NatKind.Symmetric, pub, local, endpoints, privateLocal,
                "Your network uses a strict (symmetric) NAT, common with carrier-grade NAT (CGNAT) and mobile networks. " +
                "Direct peer-to-peer may fail when the other device is also behind a strict NAT, so an encrypted relay will be used.");
        return new(NatKind.EndpointIndependent, pub, local, endpoints, false,
            "Your network uses a standard NAT. NAT traversal (UDP hole punching) should allow direct peer-to-peer connections in most cases. " +
            "If your router's WAN address differs from the public address shown here, your ISP uses CGNAT; this still works without port forwarding.");
    }

    static async Task<IPEndPoint> ResolveAsync(string hostPort, CancellationToken ct)
    {
        var i = hostPort.LastIndexOf(':');
        var host = hostPort[..i]; var port = int.Parse(hostPort[(i + 1)..]);
        var addrs = await Dns.GetHostAddressesAsync(host, AddressFamily.InterNetwork, ct);
        return new IPEndPoint(addrs[0], port);
    }

    static async Task<IPEndPoint?> BindingAsync(Socket socket, IPEndPoint server, CancellationToken ct)
    {
        var tx = RandomNumberGenerator.GetBytes(12);
        var req = new byte[20];
        BinaryPrimitives.WriteUInt16BigEndian(req.AsSpan(0), 0x0001);
        BinaryPrimitives.WriteUInt16BigEndian(req.AsSpan(2), 0);
        BinaryPrimitives.WriteUInt32BigEndian(req.AsSpan(4), 0x2112A442);
        tx.CopyTo(req, 8);
        var buf = new byte[1024];
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await socket.SendToAsync(req, SocketFlags.None, server, ct);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromMilliseconds(1200));
            try
            {
                while (true)
                {
                    var r = await socket.ReceiveFromAsync(buf, SocketFlags.None, new IPEndPoint(IPAddress.Any, 0), cts.Token);
                    var resp = buf.AsSpan(0, r.ReceivedBytes);
                    if (resp.Length >= 20 && resp.Slice(8, 12).SequenceEqual(tx)) return Parse(resp);
                }
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
        }
        return null;
    }

    internal static IPEndPoint? Parse(ReadOnlySpan<byte> msg)
    {
        if (BinaryPrimitives.ReadUInt16BigEndian(msg) != 0x0101) return null; // Binding Success Response
        var len = BinaryPrimitives.ReadUInt16BigEndian(msg[2..]);
        var pos = 20; IPEndPoint? mapped = null;
        while (pos + 4 <= 20 + len && pos + 4 <= msg.Length)
        {
            var type = BinaryPrimitives.ReadUInt16BigEndian(msg[pos..]);
            var alen = BinaryPrimitives.ReadUInt16BigEndian(msg[(pos + 2)..]);
            var v = msg.Slice(pos + 4, Math.Min(alen, msg.Length - pos - 4));
            if ((type == 0x0020 || type == 0x0001) && v.Length >= 8 && v[1] == 0x01)
            {
                var port = BinaryPrimitives.ReadUInt16BigEndian(v[2..]);
                var ip = v.Slice(4, 4).ToArray();
                if (type == 0x0020)
                {
                    port ^= 0x2112;
                    ip[0] ^= 0x21; ip[1] ^= 0x12; ip[2] ^= 0xA4; ip[3] ^= 0x42;
                    return new IPEndPoint(new IPAddress(ip), port);
                }
                mapped = new IPEndPoint(new IPAddress(ip), port);
            }
            pos += 4 + ((alen + 3) & ~3);
        }
        return mapped;
    }

    public static IReadOnlyList<string> LocalIPv4()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .SelectMany(n => n.GetIPProperties().UnicastAddresses)
                .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork).Select(a => a.Address.ToString()).Distinct().ToList();
        }
        catch { return []; }
    }

    public static bool IsPrivateOrShared(string ip)
    {
        if (!IPAddress.TryParse(ip.Split(':')[0], out var a) || a.AddressFamily != AddressFamily.InterNetwork) return false;
        var b = a.GetAddressBytes();
        return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168)
            || (b[0] == 100 && b[1] >= 64 && b[1] <= 127) || (b[0] == 169 && b[1] == 254);
    }
}
