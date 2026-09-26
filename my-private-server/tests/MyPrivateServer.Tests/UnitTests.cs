using System.Net;
using System.Security.Cryptography;
using System.Text;
using MyPrivateServer.Backup;
using MyPrivateServer.Containers;
using MyPrivateServer.Core;
using MyPrivateServer.Deployments;
using MyPrivateServer.Files;
using MyPrivateServer.Identity;
using MyPrivateServer.RemoteAccess;
using MyPrivateServer.WebHosting;

namespace MyPrivateServer.Tests;

public class SafePathTests
{
    [Theory]
    [InlineData("..")]
    [InlineData("CON")]
    [InlineData("nul.txt")]
    [InlineData("a:b")]
    [InlineData("file.")]
    [InlineData("bad|name")]
    [InlineData("")]
    public void Rejects_unsafe_names(string name) => Assert.Throws<UserFacingException>(() => SafePath.ValidateName(name));

    [Fact]
    public void Rejects_traversal_segments() => Assert.Throws<UserFacingException>(() => SafePath.Segments("/shared/a/../../etc"));

    [Fact]
    public void Combine_stays_inside_root()
    {
        var root = Directory.CreateTempSubdirectory().FullName;
        Assert.StartsWith(root, SafePath.Combine(root, ["a", "b.txt"]));
    }

    [Fact]
    public void Refuses_to_follow_symlinks()
    {
        var root = Directory.CreateTempSubdirectory().FullName;
        var outside = Directory.CreateTempSubdirectory().FullName;
        Directory.CreateSymbolicLink(Path.Combine(root, "link"), outside);
        Assert.Throws<ForbiddenException>(() => SafePath.Combine(root, ["link", "secret.txt"]));
    }

    [Fact]
    public void FreeName_adds_counter()
    {
        var root = Directory.CreateTempSubdirectory().FullName;
        File.WriteAllText(Path.Combine(root, "a.txt"), "");
        File.WriteAllText(Path.Combine(root, "a (1).txt"), "");
        Assert.Equal("a (2).txt", SafePath.FreeName(root, "a.txt"));
    }
}

public class AclTests
{
    static User U(Role r, string id = "u1") => new() { Id = id, Username = "x", Role = r };

    [Fact]
    public void No_rule_means_no_access() => Assert.Equal(AccessLevel.None, ShareService.Evaluate([], U(Role.User), ""));

    [Fact]
    public void Admin_always_full() => Assert.Equal(AccessLevel.Full, ShareService.Evaluate([], U(Role.Administrator), "anything"));

    [Fact]
    public void Folder_grant_gives_access_only_to_that_folder_and_below()
    {
        var acl = new List<AclEntry> { new(PrincipalType.User, "u1", "Invoices", AccessLevel.ReadWrite) };
        var u = U(Role.User);
        Assert.Equal(AccessLevel.None, ShareService.Evaluate(acl, u, ""));
        Assert.True(ShareService.CanTraverse(acl, u, ""));
        Assert.Equal(AccessLevel.ReadWrite, ShareService.Evaluate(acl, u, "Invoices/2026"));
        Assert.Equal(AccessLevel.None, ShareService.Evaluate(acl, u, "Payroll"));
        Assert.False(ShareService.CanTraverse(acl, u, "Payroll"));
        Assert.Equal(AccessLevel.None, ShareService.Evaluate(acl, u, "InvoicesOld")); // prefix must match whole segment
    }

    [Fact]
    public void Deeper_rule_can_hide_a_folder_and_user_beats_role()
    {
        var acl = new List<AclEntry>
        {
            new(PrincipalType.Role, "User", "", AccessLevel.ReadWrite),
            new(PrincipalType.User, "u1", "Payroll", AccessLevel.None),
            new(PrincipalType.Role, "User", "Reports", AccessLevel.Read),
            new(PrincipalType.User, "u1", "Reports", AccessLevel.Full),
        };
        var u = U(Role.User);
        Assert.Equal(AccessLevel.ReadWrite, ShareService.Evaluate(acl, u, "Docs"));
        Assert.Equal(AccessLevel.None, ShareService.Evaluate(acl, u, "Payroll/2026"));
        Assert.Equal(AccessLevel.Full, ShareService.Evaluate(acl, u, "Reports"));
        Assert.Equal(AccessLevel.Read, ShareService.Evaluate(acl, U(Role.User, "other"), "Reports"));
    }

    [Fact]
    public void ReadOnly_role_is_capped_at_read()
    {
        var acl = new List<AclEntry> { new(PrincipalType.Everyone, "*", "", AccessLevel.Full) };
        Assert.Equal(AccessLevel.Read, ShareService.Evaluate(acl, U(Role.ReadOnly), "x"));
    }
}

public class RoleTests
{
    [Fact]
    public void Developer_cannot_manage_users_or_remove_containers()
    {
        Assert.False(RoleCapabilities.Has(Role.Developer, Capability.ManageUsers));
        Assert.False(RoleCapabilities.Has(Role.Developer, Capability.RemoveContainers));
        Assert.True(RoleCapabilities.Has(Role.Developer, Capability.ManageContainers));
    }

    [Fact]
    public void ReadOnly_cannot_write() => Assert.False(RoleCapabilities.Has(Role.ReadOnly, Capability.WriteFiles));
}

public class StunTests
{
    [Fact]
    public void Parses_xor_mapped_address()
    {
        // Binding success response with XOR-MAPPED-ADDRESS 203.0.113.7:54321
        var msg = new byte[32];
        msg[0] = 0x01; msg[1] = 0x01; msg[3] = 12;
        msg[4] = 0x21; msg[5] = 0x12; msg[6] = 0xA4; msg[7] = 0x42;
        msg[20] = 0x00; msg[21] = 0x20; msg[23] = 8; msg[25] = 0x01;
        var port = (ushort)(54321 ^ 0x2112);
        msg[26] = (byte)(port >> 8); msg[27] = (byte)port;
        byte[] ip = [203, 0, 113, 7]; byte[] cookie = [0x21, 0x12, 0xA4, 0x42];
        for (var i = 0; i < 4; i++) msg[28 + i] = (byte)(ip[i] ^ cookie[i]);
        var ep = StunClient.Parse(msg);
        Assert.Equal("203.0.113.7:54321", ep!.ToString());
    }

    [Fact]
    public void Classifies_nat_types()
    {
        var local = new[] { "192.168.1.20" };
        Assert.Equal(NatKind.UdpBlocked, StunClient.Classify(local, []).Kind);
        Assert.Equal(NatKind.EndpointIndependent, StunClient.Classify(local, [IPEndPoint.Parse("203.0.113.7:4000"), IPEndPoint.Parse("203.0.113.7:4000")]).Kind);
        Assert.Equal(NatKind.Symmetric, StunClient.Classify(local, [IPEndPoint.Parse("203.0.113.7:4000"), IPEndPoint.Parse("203.0.113.7:4999")]).Kind);
        Assert.Equal(NatKind.NoNat, StunClient.Classify(["203.0.113.7"], [IPEndPoint.Parse("203.0.113.7:4000")]).Kind);
    }
}

public class WireGuardStatusTests
{
    static WireGuardMeshProvider P() => new(new ProcessRunner(), new SettingsStore(new ServerPaths(Directory.CreateTempSubdirectory().FullName)));

    const string Base = """
        {"BackendState":"Running","Self":{"DNSName":"office.tailnet.ts.net.","TailscaleIPs":["100.101.1.2","fd7a::1"]},"Peer":{PEERS}}
        """;

    [Fact]
    public void Direct_on_lan_nat_traversal_on_internet_and_relay_fallback()
    {
        var s = P().ParseStatus(Base.Replace("PEERS", """
            "a":{"HostName":"phone","OS":"android","Online":true,"Active":true,"CurAddr":"203.0.113.9:41641","Relay":"sin"},
            "b":{"HostName":"laptop","OS":"windows","Online":true,"Active":true,"CurAddr":"192.168.1.30:41641","Relay":"sin"},
            "c":{"HostName":"tablet","OS":"ios","Online":true,"Active":true,"CurAddr":"","Relay":"sin"}
            """), 8080);
        Assert.Equal(RemoteState.Connected, s.State);
        Assert.Equal(ConnectionMethod.NatTraversal, s.Method);
        Assert.True(s.RelayRequired);
        Assert.Contains(s.Peers, p => p.Name == "laptop" && p.Method == ConnectionMethod.Direct);
        Assert.Contains(s.Peers, p => p.Name == "tablet" && p.Method == ConnectionMethod.Relay);
        Assert.Contains("http://office.tailnet.ts.net:8080", s.AccessAddresses);
    }

    [Fact]
    public void Relay_only_is_reported_honestly()
    {
        var s = P().ParseStatus(Base.Replace("PEERS", """ "c":{"HostName":"tablet","Online":true,"Active":true,"CurAddr":"","Relay":"sin"} """), 8080);
        Assert.Equal(ConnectionMethod.Relay, s.Method);
        Assert.Contains("Direct connection unavailable", s.Reason);
    }

    [Fact]
    public void Needs_login_surfaces_the_url()
    {
        var s = P().ParseStatus("""{"BackendState":"NeedsLogin","AuthURL":"https://login.example/a/123"}""", 8080);
        Assert.Equal(RemoteState.NeedsSetup, s.State);
        Assert.Equal("https://login.example/a/123", s.ActionUrl);
    }

    [Fact]
    public void No_active_peers_is_pending_not_connected_claim()
    {
        var s = P().ParseStatus(Base.Replace("PEERS", ""), 8080);
        Assert.Equal(ConnectionMethod.Pending, s.Method);
        Assert.Null(s.RelayRequired);
    }
}

public class FrpConfigTests
{
    [Fact]
    public void Values_cannot_inject_extra_settings()
    {
        var cfg = FrpRelayProvider.RenderConfig(new Dictionary<string, string>
        {
            ["serverAddr"] = "relay.example\"\nauth.token = \"evil", ["token"] = "t\"k", ["remotePort"] = "18080",
        }, 8080, "MPS-ABC123");
        Assert.DoesNotContain("\nauth.token = \"evil", cfg);
        Assert.Contains("remotePort = 18080", cfg);
        Assert.Contains("transport.tls.enable = true", cfg);
    }

    [Fact]
    public void Rejects_bad_port() => Assert.Throws<UserFacingException>(() =>
        FrpRelayProvider.RenderConfig(new Dictionary<string, string> { ["serverAddr"] = "x", ["token"] = "t", ["remotePort"] = "70000" }, 8080, "MPS-1"));
}

public class CaddyTests
{
    [Fact]
    public void Renders_static_spa_and_proxy_sites()
    {
        var text = CaddyManager.Render(
        [
            new Site { Name = "web", Kind = SiteKind.Static, Port = 8100, SpaFallback = true },
            new Site { Name = "api", Kind = SiteKind.Node, Port = 8101, UpstreamPort = 9100, Hostnames = ["api.example.com"] },
            new Site { Name = "off", Kind = SiteKind.Static, Port = 8102, Enabled = false },
        ], s => s.Name == "web" ? "/data/Websites/web/releases/1" : null);
        Assert.Contains("http://:8100 {", text);
        Assert.Contains("try_files {path} {path}/ /index.html", text);
        Assert.Contains("http://:8101, api.example.com {", text);
        Assert.Contains("reverse_proxy 127.0.0.1:9100", text);
        Assert.DoesNotContain(":8102", text);
    }

    [Fact]
    public void Rejects_unsafe_paths() => Assert.Throws<UserFacingException>(() =>
        CaddyManager.Render([new Site { Name = "x", Kind = SiteKind.Static, Port = 8100 }], _ => "/data/x\" {\nimport evil"));
}

public class WebhookTests
{
    [Fact]
    public void Verifies_github_signature()
    {
        var body = Encoding.UTF8.GetBytes("""{"ref":"refs/heads/main"}""");
        var sig = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes("secret"), body)).ToLowerInvariant();
        Assert.True(GitHubClient.VerifySignature("secret", body, sig));
        Assert.False(GitHubClient.VerifySignature("other", body, sig));
        Assert.False(GitHubClient.VerifySignature("secret", body, "sha256=zz"));
        Assert.False(GitHubClient.VerifySignature("secret", body, null));
    }
}

public class DockerTests
{
    [Fact]
    public void Demultiplexes_log_stream()
    {
        byte[] Frame(byte stream, string s) { var p = Encoding.UTF8.GetBytes(s); return [stream, 0, 0, 0, 0, 0, 0, (byte)p.Length, .. p]; }
        Assert.Equal("out\nerr\n", DockerService.Demux([.. Frame(1, "out\n"), .. Frame(2, "err\n")]));
    }

    [Theory]
    [InlineData("postgres:16", "postgres", "16")]
    [InlineData("redis", "redis", "latest")]
    [InlineData("registry:5000/team/app", "registry:5000/team/app", "latest")]
    [InlineData("ghcr.io/o/app:1.2", "ghcr.io/o/app", "1.2")]
    public void Splits_image_names(string image, string name, string tag) => Assert.Equal((name, tag), DockerService.SplitImage(image));
}

public class BackupScheduleTests
{
    [Fact]
    public void Daily_runs_next_day_after_last_run()
    {
        var job = new BackupJob { Frequency = BackupFrequency.Daily, Time = "02:00", Enabled = true };
        var last = new DateTimeOffset(DateTime.Today.AddHours(2).AddMinutes(1));
        var next = BackupService.NextRun(job, last, last)!.Value;
        Assert.Equal(DateTime.Today.AddDays(1).AddHours(2), next.LocalDateTime);
    }

    [Fact]
    public void Weekly_lands_on_the_chosen_day()
    {
        var job = new BackupJob { Frequency = BackupFrequency.Weekly, Day = DayOfWeek.Sunday, Time = "03:00", Enabled = true };
        var next = BackupService.NextRun(job, null, DateTimeOffset.Now)!.Value;
        Assert.Equal(DayOfWeek.Sunday, next.DayOfWeek);
        Assert.True(next > DateTimeOffset.Now.AddMinutes(-1));
    }

    [Fact]
    public void Manual_or_disabled_never_scheduled()
    {
        Assert.Null(BackupService.NextRun(new BackupJob { Frequency = BackupFrequency.Manual }, null, DateTimeOffset.Now));
        Assert.Null(BackupService.NextRun(new BackupJob { Frequency = BackupFrequency.Daily, Enabled = false }, null, DateTimeOffset.Now));
    }
}

public class ProcessRunnerTests
{
    [Fact]
    public async Task Returns_when_the_process_exits_even_if_a_child_keeps_its_output_open()
    {
        if (OperatingSystem.IsWindows()) return;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = await new ProcessRunner().RunAsync("sh", ["-c", "sleep 20 & echo started"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(15) });
        Assert.False(r.TimedOut);
        Assert.Equal(0, r.ExitCode);
        Assert.Contains("started", r.Output);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(10), $"took {sw.Elapsed}");
    }
}

public class CloudflareHostnameTests
{
    [Theory]
    [InlineData("nas.example.com", "nas.example.com")]
    [InlineData(" https://NAS.Example.com/ ", "nas.example.com")]
    [InlineData("qmarc-nas", null)]
    [InlineData("", null)]
    [InlineData("nas example.com", null)]
    public void Normalizes_public_hostname(string input, string? expected) =>
        Assert.Equal(expected, CloudflareQuickTunnelProvider.NormalizeHostname(input));
}
