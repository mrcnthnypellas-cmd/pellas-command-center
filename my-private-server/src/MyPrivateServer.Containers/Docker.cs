using System.IO.Pipes;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MyPrivateServer.Core;

namespace MyPrivateServer.Containers;

public sealed record ContainerInfo(string Id, string Name, string Image, string State, string Status, IReadOnlyList<string> Ports, DateTimeOffset Created, bool ManagedByServer);
public sealed record DockerStatus(bool Available, string? Version, string? Problem);
public sealed record PortMapping(int HostPort, int ContainerPort, string Protocol = "tcp");
public sealed record VolumeMapping(string HostFolder, string ContainerPath, bool ReadOnly = false);
public sealed record CreateContainerRequest(string Name, string Image, IReadOnlyList<PortMapping>? Ports, IReadOnlyList<VolumeMapping>? Volumes, IDictionary<string, string>? Environment, bool AutoRestart = true);

/// <summary>
/// Talks to Docker Engine's local API (named pipe on Windows, Unix socket elsewhere). No network exposure.
/// Guardrails: containers cannot be privileged, cannot use the host network, and can only mount folders
/// inside the server's Docker storage folder.
/// </summary>
public sealed partial class DockerService(IAuditLog audit, Func<string> dockerStorageRoot) : IHealthProbe
{
    const string Label = "io.myprivateserver.managed";
    public string Name => "Docker";

    [GeneratedRegex("^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$")] private static partial Regex NameRx();
    [GeneratedRegex(@"^[a-z0-9]+([._/-][a-z0-9]+)*(:[A-Za-z0-9_.-]{1,128})?(@sha256:[a-f0-9]{64})?$")] private static partial Regex ImageRx();

    static HttpClient CreateClient()
    {
        var handler = new SocketsHttpHandler
        {
            ConnectCallback = async (_, ct) =>
            {
                if (OperatingSystem.IsWindows())
                {
                    var pipe = new NamedPipeClientStream(".", "docker_engine", PipeDirection.InOut, PipeOptions.Asynchronous);
                    await pipe.ConnectAsync(2000, ct);
                    return pipe;
                }
                var path = Environment.GetEnvironmentVariable("DOCKER_HOST") is { } h && h.StartsWith("unix://") ? h[7..] : "/var/run/docker.sock";
                var s = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
                await s.ConnectAsync(new UnixDomainSocketEndPoint(path), ct);
                return new NetworkStream(s, ownsSocket: true);
            },
        };
        return new HttpClient(handler) { BaseAddress = new Uri("http://docker/v1.43/"), Timeout = TimeSpan.FromMinutes(10) };
    }

    static readonly Lazy<HttpClient> Client = new(CreateClient);

    static async Task<HttpResponseMessage> Send(HttpMethod m, string path, object? body, CancellationToken ct)
    {
        try
        {
            var req = new HttpRequestMessage(m, path);
            if (body is not null) req.Content = JsonContent.Create(body);
            var resp = await Client.Value.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode && resp.StatusCode != System.Net.HttpStatusCode.NotModified)
            {
                var text = await resp.Content.ReadAsStringAsync(ct);
                var msg = text.Contains("\"message\"") ? JsonDocument.Parse(text).RootElement.GetProperty("message").GetString() : text;
                throw new UserFacingException("Docker: " + msg, (int)resp.StatusCode is 404 or 409 ? (int)resp.StatusCode : 500);
            }
            return resp;
        }
        catch (Exception ex) when (ex is HttpRequestException or SocketException or TimeoutException or IOException)
        {
            throw new UserFacingException("Docker is not running on this PC. Install Docker Desktop (free for personal and small-business use) or Docker Engine and start it.", 503);
        }
    }

    public async Task<DockerStatus> StatusAsync(CancellationToken ct)
    {
        try
        {
            using var resp = await Send(HttpMethod.Get, "version", null, ct);
            var v = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
            return new(true, v.GetProperty("Version").GetString(), null);
        }
        catch (UserFacingException ex) { return new(false, null, ex.Message); }
    }

    public async Task<IReadOnlyList<ContainerInfo>> ListAsync(CancellationToken ct)
    {
        using var resp = await Send(HttpMethod.Get, "containers/json?all=1", null, ct);
        var arr = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
        return arr.EnumerateArray().Select(c => new ContainerInfo(
            c.GetProperty("Id").GetString()![..12],
            c.GetProperty("Names").EnumerateArray().First().GetString()!.TrimStart('/'),
            c.GetProperty("Image").GetString()!,
            c.GetProperty("State").GetString()!,
            c.GetProperty("Status").GetString()!,
            c.GetProperty("Ports").EnumerateArray().Where(p => p.TryGetProperty("PublicPort", out _))
                .Select(p => $"{p.GetProperty("PublicPort").GetInt32()}→{p.GetProperty("PrivatePort").GetInt32()}/{p.GetProperty("Type").GetString()}").Distinct().ToList(),
            DateTimeOffset.FromUnixTimeSeconds(c.GetProperty("Created").GetInt64()),
            c.TryGetProperty("Labels", out var l) && l.ValueKind == JsonValueKind.Object && l.TryGetProperty(Label, out _))).ToList();
    }

    static string Id(string id) => NameRx().IsMatch(id) ? id : throw new UserFacingException("Invalid container id.");

    public async Task ActionAsync(string id, string action, string actor, CancellationToken ct)
    {
        if (action is not ("start" or "stop" or "restart")) throw new UserFacingException("Unknown action.");
        using var _ = await Send(HttpMethod.Post, $"containers/{Id(id)}/{action}?t=20", null, ct);
        audit.Write(actor, "docker", $"Container {action}", id);
    }

    public async Task RemoveAsync(string id, string actor, CancellationToken ct)
    {
        using var _ = await Send(HttpMethod.Delete, $"containers/{Id(id)}?force=true&v=false", null, ct);
        audit.Write(actor, "docker", "Container removed", id, "Volumes kept", AuditSeverity.Warning);
    }

    /// <summary>Returns recent log lines, demultiplexing Docker's 8-byte stream headers.</summary>
    public async Task<string> LogsAsync(string id, int tail, CancellationToken ct)
    {
        using var resp = await Send(HttpMethod.Get, $"containers/{Id(id)}/logs?stdout=1&stderr=1&timestamps=1&tail={Math.Clamp(tail, 1, 2000)}", null, ct);
        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
        return Demux(bytes);
    }

    public static string Demux(byte[] bytes)
    {
        var sb = new StringBuilder();
        var i = 0;
        var multiplexed = bytes.Length >= 8 && bytes[0] is 0 or 1 or 2 && bytes[1] == 0 && bytes[2] == 0 && bytes[3] == 0;
        if (!multiplexed) return Encoding.UTF8.GetString(bytes);
        while (i + 8 <= bytes.Length)
        {
            var len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
            if (len < 0 || i + 8 + len > bytes.Length) break;
            sb.Append(Encoding.UTF8.GetString(bytes, i + 8, len));
            i += 8 + len;
        }
        return sb.ToString();
    }

    public async Task<string> CreateAsync(CreateContainerRequest r, string actor, CancellationToken ct)
    {
        if (!NameRx().IsMatch(r.Name)) throw new UserFacingException("Container names use letters, numbers, dots, dashes and underscores.");
        if (!ImageRx().IsMatch(r.Image)) throw new UserFacingException("Enter an image like postgres:16 or ghcr.io/owner/app:latest.");
        var root = Path.GetFullPath(dockerStorageRoot());
        var binds = new List<string>();
        foreach (var v in r.Volumes ?? [])
        {
            var host = Path.GetFullPath(Path.Combine(root, v.HostFolder.TrimStart('/', '\\')));
            if (!host.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new ForbiddenException("Volumes must be folders inside the server's Docker storage folder.");
            if (!v.ContainerPath.StartsWith('/') || v.ContainerPath.Contains(':')) throw new UserFacingException("Container paths must be absolute, like /data.");
            Directory.CreateDirectory(host);
            binds.Add($"{host}:{v.ContainerPath}{(v.ReadOnly ? ":ro" : "")}");
        }
        var exposed = new Dictionary<string, object>();
        var portBindings = new Dictionary<string, object[]>();
        foreach (var p in r.Ports ?? [])
        {
            if (p.HostPort is < 1024 or > 65535 || p.ContainerPort is < 1 or > 65535 || p.Protocol is not ("tcp" or "udp"))
                throw new UserFacingException("Host ports must be 1024–65535.");
            var key = $"{p.ContainerPort}/{p.Protocol}";
            exposed[key] = new { };
            portBindings[key] = [new { HostIp = "0.0.0.0", HostPort = p.HostPort.ToString() }];
        }
        // Pull the image (streams progress; we only wait for completion).
        var (img, tag) = SplitImage(r.Image);
        using (var pull = await Send(HttpMethod.Post, $"images/create?fromImage={Uri.EscapeDataString(img)}" + (tag is null ? "" : $"&tag={Uri.EscapeDataString(tag)}"), null, ct))
            await pull.Content.ReadAsStringAsync(ct);
        var body = new
        {
            Image = r.Image,
            Env = (r.Environment ?? new Dictionary<string, string>()).Select(kv => $"{kv.Key}={kv.Value}").ToArray(),
            ExposedPorts = exposed,
            Labels = new Dictionary<string, string> { [Label] = "true" },
            HostConfig = new
            {
                Binds = binds, PortBindings = portBindings, Privileged = false, NetworkMode = "bridge",
                RestartPolicy = new { Name = r.AutoRestart ? "unless-stopped" : "no" },
                SecurityOpt = new[] { "no-new-privileges:true" },
            },
        };
        using var resp = await Send(HttpMethod.Post, $"containers/create?name={Uri.EscapeDataString(r.Name)}", body, ct);
        var id = (await resp.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("Id").GetString()!;
        using (await Send(HttpMethod.Post, $"containers/{id}/start", null, ct)) { }
        audit.Write(actor, "docker", "Container created", r.Name, r.Image, AuditSeverity.Success);
        return id[..12];
    }

    /// <summary>"ghcr.io:443/org/app:1.2" → ("ghcr.io:443/org/app", "1.2"); digests are pulled as-is.</summary>
    public static (string Image, string? Tag) SplitImage(string image)
    {
        if (image.Contains('@')) return (image, null);
        var colon = image.LastIndexOf(':');
        return colon > image.LastIndexOf('/') ? (image[..colon], image[(colon + 1)..]) : (image, "latest");
    }

    public async Task<HealthResult> CheckAsync(CancellationToken ct)
    {
        var s = await StatusAsync(ct);
        if (!s.Available) return new(Name, HealthState.Disabled, "Not installed or not running", s.Problem);
        var list = await ListAsync(ct);
        var stopped = list.Count(c => c.ManagedByServer && c.State != "running");
        return new(Name, stopped > 0 ? HealthState.Degraded : HealthState.Healthy, $"{list.Count(c => c.State == "running")} running" + (stopped > 0 ? $", {stopped} stopped" : ""));
    }
}
