using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace MyPrivateServer.Tests;

/// <summary>Runs the real server in-process against a temporary data folder and storage drive.</summary>
public sealed class ServerFixture : IDisposable
{
    public string DataDir { get; } = Directory.CreateTempSubdirectory("mps-data-").FullName;
    public string StorageDir { get; } = Directory.CreateTempSubdirectory("mps-storage-").FullName;
    public WebApplicationFactory<Program> Factory { get; }

    public ServerFixture()
    {
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("DataDirectory", DataDir);
            b.UseSetting("Urls", "http://127.0.0.1:0");
            b.UseSetting("RateLimits:LoginPerMinute", "1000");
        });
        // Complete setup once through the API (the test server counts as this PC).
        var c = Client();
        c.Http.GetAsync("/api/health").Wait(); // starts the server, which writes the one-time setup token
        c.Http.DefaultRequestHeaders.Add("X-Setup-Token", File.ReadAllText(Path.Combine(DataDir, "setup-token.txt")));
        var r = c.PostJsonAsync("/api/setup/complete", new { serverName = "Test Server", storagePath = Path.Combine(StorageDir, "MyPrivateServer"), adminUsername = "admin", adminDisplayName = "Admin", adminPassword = "Admin-Passw0rd!" }).Result;
        if (!r.IsSuccessStatusCode) throw new Exception("Setup failed: " + r.Content.ReadAsStringAsync().Result);
    }

    /// <summary>A browser-like client: keeps cookies and sends the CSRF header.</summary>
    public CsrfClient Client() => new(Factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true, AllowAutoRedirect = false }));

    public async Task<CsrfClient> LoginAsync(string user, string password)
    {
        var c = Client();
        var r = await c.PostJsonAsync("/api/auth/login", new { username = user, password });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return c;
    }

    public void Dispose() { Factory.Dispose(); try { Directory.Delete(DataDir, true); Directory.Delete(StorageDir, true); } catch { } }
}

public sealed class CsrfClient(HttpClient http)
{
    public HttpClient Http => http;
    string? _token;

    async Task EnsureToken()
    {
        if (_token is not null) return;
        _token = (await http.GetFromJsonAsync<JsonElement>("/api/auth/csrf")).GetProperty("token").GetString();
        http.DefaultRequestHeaders.Add("X-MPS-CSRF", _token);
    }

    public async Task<HttpResponseMessage> PostJsonAsync(string url, object body) { await EnsureToken(); return await http.PostAsJsonAsync(url, body); }
    public async Task<HttpResponseMessage> PutJsonAsync(string url, object body) { await EnsureToken(); return await http.PutAsJsonAsync(url, body); }
    public async Task<HttpResponseMessage> GetAsync(string url) { await EnsureToken(); return await http.GetAsync(url); }
    public async Task<JsonElement> GetJsonAsync(string url) { var r = await GetAsync(url); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
}

[CollectionDefinition("server")] public class ServerCollection : ICollectionFixture<ServerFixture>;

[Collection("server")]
public class ApiTests(ServerFixture f)
{
    [Fact]
    public async Task Setup_cannot_be_run_twice()
    {
        var r = await f.Client().PostJsonAsync("/api/setup/complete", new { serverName = "x", storagePath = f.StorageDir, adminUsername = "evil", adminDisplayName = "", adminPassword = "Evil-Passw0rd!" });
        Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
    }

    [Fact]
    public async Task Api_requires_sign_in()
    {
        var r = await f.Factory.CreateClient().GetAsync("/api/users");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task State_changes_require_csrf_header()
    {
        var raw = f.Factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await raw.GetAsync("/api/auth/csrf");
        var r = await raw.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "Admin-Passw0rd!" });
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
    }

    [Fact]
    public async Task Account_locks_after_repeated_failures()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        Assert.True((await admin.PostJsonAsync("/api/users", new { username = "locky", role = "User", password = "Locky-Passw0rd1", quotaBytes = 0 })).IsSuccessStatusCode);
        var c = f.Client();
        for (var i = 0; i < 5; i++) await c.PostJsonAsync("/api/auth/login", new { username = "locky", password = "wrong-" + i });
        var r = await c.PostJsonAsync("/api/auth/login", new { username = "locky", password = "Locky-Passw0rd1" });
        Assert.Equal((HttpStatusCode)423, r.StatusCode);
    }

    [Fact]
    public async Task Regular_user_cannot_escalate()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        await admin.PostJsonAsync("/api/users", new { username = "bob", role = "User", password = "Bob-Passw0rd12", quotaBytes = 0 });
        var bob = await f.LoginAsync("bob", "Bob-Passw0rd12");
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.PostJsonAsync("/api/users", new { username = "bob2", role = "Administrator", password = "Bob-Passw0rd12", quotaBytes = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync("/api/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync("/api/database/status")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync("/api/docker/containers")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync("/api/files/list?path=/users")).StatusCode);
    }

    [Fact]
    public async Task Folder_permissions_limit_what_a_user_sees()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        var created = await (await admin.PostJsonAsync("/api/users", new { username = "carla", role = "User", password = "Carla-Passw0rd1", quotaBytes = 0 })).Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetString();
        await admin.PostJsonAsync("/api/shares", new { name = "Finance" });
        await admin.PostJsonAsync("/api/files/folder", new { path = "/shared/Finance", name = "Invoices" });
        await admin.PostJsonAsync("/api/files/folder", new { path = "/shared/Finance", name = "Payroll" });
        var acl = await admin.PutJsonAsync("/api/shares/Finance/acl", new { entries = new[] { new { principalType = "User", principal = id, subPath = "Invoices", level = "Read" } } });
        Assert.True(acl.IsSuccessStatusCode, await acl.Content.ReadAsStringAsync());

        var carla = await f.LoginAsync("carla", "Carla-Passw0rd1");
        var list = await carla.GetJsonAsync("/api/files/list?path=/shared/Finance");
        Assert.Equal(["Invoices"], list.GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("name").GetString()!).ToArray());
        Assert.Equal(HttpStatusCode.NotFound, (await carla.GetAsync("/api/files/list?path=/shared/Finance/Payroll")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await carla.PostJsonAsync("/api/files/folder", new { path = "/shared/Finance/Invoices", name = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await carla.GetAsync("/api/files/list?path=/shared/Finance/Invoices/../Payroll")).StatusCode);
    }

    [Fact]
    public async Task Resumable_upload_download_and_recycle_bin()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        var data = new byte[250_000]; Random.Shared.NextBytes(data);
        var s = await (await admin.PostJsonAsync("/api/files/uploads", new { path = "/home", fileName = "report.bin", size = data.Length })).Content.ReadFromJsonAsync<JsonElement>();
        var id = s.GetProperty("id").GetString();
        async Task<HttpResponseMessage> Chunk(int offset, int len)
        {
            var req = new HttpRequestMessage(HttpMethod.Patch, $"/api/files/uploads/{id}") { Content = new ByteArrayContent(data, offset, len) };
            req.Headers.Add("Upload-Offset", offset.ToString());
            return await admin.Http.SendAsync(req);
        }
        Assert.True((await Chunk(0, 100_000)).IsSuccessStatusCode);
        var mismatch = await Chunk(50, 10);
        Assert.Equal(HttpStatusCode.Conflict, mismatch.StatusCode);
        Assert.Equal("100000", mismatch.Headers.GetValues("Upload-Offset").First());
        var done = await (await Chunk(100_000, 150_000)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("/home/report.bin", done.GetProperty("completed").GetProperty("path").GetString());

        var bytes = await admin.Http.GetByteArrayAsync("/api/files/download?path=/home/report.bin");
        Assert.Equal(data, bytes);

        Assert.True((await admin.PostJsonAsync("/api/files/delete", new { paths = new[] { "/home/report.bin" } })).IsSuccessStatusCode);
        var bin = await admin.GetJsonAsync("/api/files/recycle");
        var item = bin.EnumerateArray().First(x => x.GetProperty("name").GetString() == "report.bin");
        Assert.True((await admin.PostJsonAsync($"/api/files/recycle/{item.GetProperty("id").GetString()}/restore", new { })).IsSuccessStatusCode);
        Assert.Equal(data, await admin.Http.GetByteArrayAsync("/api/files/download?path=/home/report.bin"));
    }

    [Fact]
    public async Task Html_files_are_never_previewed_inline()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        var dir = Path.Combine(f.StorageDir, "MyPrivateServer", "Users", "admin");
        Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(Path.Combine(dir, "x.html"), "<script>alert(1)</script>");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await admin.GetAsync("/api/files/preview?path=/home/x.html")).StatusCode);
    }

    [Fact]
    public async Task Remote_access_reports_unavailable_instead_of_pretending()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        var r = await admin.PostJsonAsync("/api/remote-access/enable", new { providerId = "cloudflare-tunnel", options = new { } });
        var st = await r.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual("Connected", st.GetProperty("state").GetString());
        Assert.False(string.IsNullOrEmpty(st.GetProperty("reason").GetString()));
        await admin.PostJsonAsync("/api/remote-access/disable", new { });
    }

    [Fact]
    public async Task Login_rate_limit_applies_per_client()
    {
        using var strict = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("DataDirectory", Directory.CreateTempSubdirectory().FullName);
            b.UseSetting("RateLimits:LoginPerMinute", "3");
        });
        var c = new CsrfClient(strict.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true }));
        HttpResponseMessage? last = null;
        for (var i = 0; i < 4; i++) last = await c.PostJsonAsync("/api/auth/login", new { username = "x", password = "y" });
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }

    [Fact]
    public async Task Security_headers_are_set()
    {
        var r = await f.Factory.CreateClient().GetAsync("/api/health");
        Assert.Equal("nosniff", r.Headers.GetValues("X-Content-Type-Options").First());
        Assert.Contains("frame-ancestors 'none'", r.Headers.GetValues("Content-Security-Policy").First());
    }

    [Fact]
    public async Task Secrets_are_not_stored_in_plain_text()
    {
        var admin = await f.LoginAsync("admin", "Admin-Passw0rd!");
        await admin.PostJsonAsync("/api/remote-access/enable", new { providerId = "self-hosted-relay", options = new { serverAddr = "relay.example", token = "SUPER-SECRET-TOKEN", remotePort = "18080" } });
        var cfg = await File.ReadAllTextAsync(Path.Combine(f.DataDir, "config", "server.json"));
        Assert.DoesNotContain("SUPER-SECRET-TOKEN", cfg);
        var view = await admin.GetJsonAsync("/api/remote-access");
        Assert.Equal("••••••••", view.GetProperty("options").GetProperty("token").GetString());
        await admin.PostJsonAsync("/api/remote-access/disable", new { });
    }
}
