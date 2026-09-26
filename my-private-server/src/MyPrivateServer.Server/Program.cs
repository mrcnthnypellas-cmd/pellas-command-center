using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using MyPrivateServer.Backup;
using MyPrivateServer.Containers;
using MyPrivateServer.Core;
using MyPrivateServer.Databases;
using MyPrivateServer.Deployments;
using MyPrivateServer.Files;
using MyPrivateServer.Identity;
using MyPrivateServer.Monitoring;
using MyPrivateServer.RemoteAccess;
using MyPrivateServer.Server;
using MyPrivateServer.Server.Endpoints;
using MyPrivateServer.Server.Infrastructure;
using MyPrivateServer.Storage;
using MyPrivateServer.WebHosting;
using OpenTelemetry.Metrics;
using Serilog;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

// ---- Paths, settings, logging ----
var paths = new ServerPaths(builder.Configuration["DataDirectory"]);
var settingsStore = new SettingsStore(paths);
var settings = settingsStore.Get();
builder.Services.AddSingleton(paths);
builder.Services.AddSingleton(settingsStore);

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("System.Net.Http", Serilog.Events.LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File(Path.Combine(paths.LogsDirectory, "server-.log"), rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss} [{Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}")
    .CreateLogger();
builder.Host.UseSerilog();

// Runs as a Windows service when installed as one; as a console app otherwise.
builder.Host.UseWindowsService(o => o.ServiceName = "MyPrivateServer");

// ---- Network: HTTP on the LAN, HTTPS with a local self-signed certificate ----
builder.Services.AddDataProtection().SetApplicationName("MyPrivateServer").PersistKeysToFileSystem(new DirectoryInfo(paths.KeysDirectory))
    .AddKeyProtectionIfWindows();
builder.WebHost.ConfigureKestrel((ctx, k) =>
{
    k.AddServerHeader = false;
    k.Limits.MaxRequestBodySize = FileService.MaxChunkBytes + 1024 * 1024;
    var net = settings.Network;
    if (ctx.Configuration["Urls"] is { Length: > 0 } || ctx.Configuration["ASPNETCORE_URLS"] is { Length: > 0 }) return; // tests / custom
    if (net.AllowLan) k.ListenAnyIP(net.HttpPort); else k.ListenLocalhost(net.HttpPort);
    k.ListenAnyIP(net.HttpsPort, o =>
    {
        o.Protocols = HttpProtocols.Http1AndHttp2;
        o.UseHttps(LocalCertificate.LoadOrCreate(paths, new DataProtectionSecretProtector(k.ApplicationServices.GetRequiredService<IDataProtectionProvider>())));
    });
});

builder.Services.Configure<JsonOptions>(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("remote-test").ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddHttpClient("caddy").ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddHttpClient("github").ConfigureHttpClient(c => c.Timeout = TimeSpan.FromSeconds(20));

// ---- Core ----
builder.Services.AddSingleton<ISecretProtector, DataProtectionSecretProtector>();
builder.Services.AddSingleton<IProcessRunner, ProcessRunner>();
builder.Services.AddSingleton<ISchemaContributor, AuditSchema>();
builder.Services.AddSingleton<ISchemaContributor, IdentitySchema>();
builder.Services.AddSingleton<ISchemaContributor, FilesSchema>();
builder.Services.AddSingleton<ISchemaContributor, AppsSchema>();
builder.Services.AddSingleton<ISchemaContributor, DeploymentsSchema>();
builder.Services.AddSingleton<ISchemaContributor, BackupSchema>();
builder.Services.AddSingleton<SystemDb>();
builder.Services.AddSingleton<IAuditLog, SqliteAuditLog>();

// ---- Modules ----
builder.Services.AddSingleton<UserService>();
builder.Services.AddSingleton<StorageService>();
builder.Services.AddSingleton<IStorageDetector>(sp => Environment.GetEnvironmentVariable("MPS_SIMULATE_DRIVES") == "1"
    ? new SimulatedStorageDetector() : new SystemStorageDetector(sp.GetRequiredService<IProcessRunner>()));
builder.Services.AddSingleton<ShareService>();
builder.Services.AddSingleton<FileService>();

builder.Services.AddSingleton<PostgresProvider>();
builder.Services.AddSingleton<IDatabaseProvider>(sp => sp.GetRequiredService<PostgresProvider>());
builder.Services.AddSingleton<AppService>();
builder.Services.AddSingleton<DataApi>();

builder.Services.AddSingleton<CaddyManager>();
builder.Services.AddSingleton<ISiteEnvironmentSource, AppEnvironmentSource>();
builder.Services.AddSingleton<SiteService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SiteService>());
builder.Services.AddSingleton<GitHubClient>();
builder.Services.AddSingleton<DeploymentService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DeploymentService>());

builder.Services.AddSingleton(sp => new DockerService(sp.GetRequiredService<IAuditLog>(), () => sp.GetRequiredService<StorageService>().PathFor("Docker")));

builder.Services.AddSingleton<IRemoteAccessProvider, WireGuardMeshProvider>();
builder.Services.AddSingleton<IRemoteAccessProvider, CloudflareQuickTunnelProvider>();
builder.Services.AddSingleton<IRemoteAccessProvider, FrpRelayProvider>();
builder.Services.AddSingleton<RemoteAccessService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RemoteAccessService>());

builder.Services.AddSingleton<BackupService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<BackupService>());

builder.Services.AddSingleton<MetricsCollector>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<MetricsCollector>());
builder.Services.AddSingleton<HealthService>();
builder.Services.AddSingleton<IHealthProbe, StorageHealthProbe>();
builder.Services.AddSingleton<IHealthProbe>(sp => sp.GetRequiredService<PostgresProvider>());
builder.Services.AddSingleton<IHealthProbe>(sp => sp.GetRequiredService<SiteService>());
builder.Services.AddSingleton<IHealthProbe>(sp => sp.GetRequiredService<DockerService>());
builder.Services.AddSingleton<IHealthProbe>(sp => sp.GetRequiredService<RemoteAccessService>());
builder.Services.AddSingleton<IHealthProbe>(sp => sp.GetRequiredService<BackupService>());
builder.Services.AddSingleton<IExternalServiceSource>(sp => sp.GetRequiredService<RemoteAccessService>());
builder.Services.AddSingleton<IExternalServiceSource, PlatformDisclosures>();
builder.Services.AddHostedService<MaintenanceService>();

// OpenTelemetry metrics stay in-process unless an OTLP endpoint is configured by the owner.
var otel = builder.Services.AddOpenTelemetry().WithMetrics(m =>
{
    m.AddMeter(MetricsCollector.MeterName).AddAspNetCoreInstrumentation();
    if (settings.Telemetry.OtlpEndpoint is { Length: > 0 } ep) m.AddOtlpExporter(o => o.Endpoint = new Uri(ep));
});

// ---- Security ----
builder.Services.AddAuthentication(SessionAuthHandler.Scheme)
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, SessionAuthHandler>(SessionAuthHandler.Scheme, null);
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.OnRejected = async (ctx, ct) => await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "Too many requests. Wait a moment and try again." }, ct);
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.ClientIp(), _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("data", ctx => RateLimitPartition.GetTokenBucketLimiter(ctx.Request.Headers["apikey"].ToString() is { Length: > 0 } k ? k : ctx.ClientIp(),
        _ => new TokenBucketRateLimiterOptions { TokenLimit = 200, TokensPerPeriod = 20, ReplenishmentPeriod = TimeSpan.FromSeconds(1) }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetTokenBucketLimiter(ctx.ClientIp(),
        _ => new TokenBucketRateLimiterOptions { TokenLimit = 600, TokensPerPeriod = 60, ReplenishmentPeriod = TimeSpan.FromSeconds(1) }));
});

var app = builder.Build();

// ---- First-run initialisation ----
app.Services.GetRequiredService<SystemDb>();
if (!settingsStore.Get().SetupCompleted && !File.Exists(paths.SetupTokenFile))
    File.WriteAllText(paths.SetupTokenFile, ServerIdentity.RandomToken(12));
if (!settingsStore.Get().SetupCompleted)
    Log.Information("Setup required. Open http://localhost:{Port} on this PC, or use the setup token in {File} from another device.", settings.Network.HttpPort, paths.SetupTokenFile);

app.Use(SecurityHeaders.Middleware);
app.Use(ErrorHandling.Middleware);
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();
app.Use(SetupGate.Middleware);
app.UseAuthentication();
app.UseAuthorization();
app.Use(Csrf.Middleware);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapAuthEndpoints();
app.MapSetupEndpoints();
app.MapUserEndpoints();
app.MapStorageEndpoints();
app.MapFileEndpoints();
app.MapDatabaseEndpoints();
app.MapAppEndpoints();
app.MapDataApiEndpoints();
app.MapWebsiteEndpoints();
app.MapDeploymentEndpoints();
app.MapDockerEndpoints();
app.MapBackupEndpoints();
app.MapRemoteAccessEndpoints();
app.MapSystemEndpoints();

// Single-page dashboard: any non-API route serves index.html.
app.MapFallback(async ctx =>
{
    if (ctx.Request.Path.StartsWithSegments("/api")) { ctx.Response.StatusCode = 404; await ctx.Response.WriteAsJsonAsync(new { error = "Not found." }); return; }
    var index = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot"), "index.html");
    if (File.Exists(index)) { ctx.Response.ContentType = "text/html; charset=utf-8"; await ctx.Response.SendFileAsync(index); }
    else await ctx.Response.WriteAsync("My Private Server is running. The dashboard has not been built yet (run scripts/build).");
});

try
{
    Log.Information("My Private Server {Version} starting. Data folder: {Data}", typeof(Program).Assembly.GetName().Version, paths.DataDirectory);
    app.Run();
}
finally { Log.CloseAndFlush(); }

public partial class Program;

static class DataProtectionExtensions
{
    public static IDataProtectionBuilder AddKeyProtectionIfWindows(this IDataProtectionBuilder b) =>
        OperatingSystem.IsWindows() ? b.ProtectKeysWithDpapi(protectToLocalMachine: true) : b;
}
