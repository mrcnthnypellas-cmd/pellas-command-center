using MyPrivateServer.Core;
using MyPrivateServer.Databases;
using MyPrivateServer.Deployments;
using MyPrivateServer.Files;
using MyPrivateServer.Storage;
using MyPrivateServer.WebHosting;

namespace MyPrivateServer.Server;

/// <summary>Gives a website's process its linked app's environment variables (DATABASE_URL etc.).</summary>
public sealed class AppEnvironmentSource(IServiceProvider sp) : ISiteEnvironmentSource
{
    public IReadOnlyDictionary<string, string> For(Site site)
    {
        if (site.LinkedApp is null) return new Dictionary<string, string>();
        try { return sp.GetRequiredService<AppService>().EnvValues(site.LinkedApp); }
        catch (UserFacingException) { return new Dictionary<string, string>(); }
    }
}

public sealed class StorageHealthProbe(StorageService storage) : IHealthProbe
{
    public string Name => "Storage";
    public Task<HealthResult> CheckAsync(CancellationToken ct)
    {
        var s = storage.Status();
        return Task.FromResult(!s.Configured ? new HealthResult(Name, HealthState.Disabled, "Not set up")
            : !s.Online ? new HealthResult(Name, HealthState.Unavailable, "Offline", s.Problem)
            : s.LowSpace ? new HealthResult(Name, HealthState.Degraded, "Low free space", s.Problem)
            : new HealthResult(Name, HealthState.Healthy, $"{FileService.FormatBytes(s.FreeBytes)} free"));
    }
}

public sealed class PlatformDisclosures(DeploymentService deployments, SettingsStore settings) : IExternalServiceSource
{
    public IEnumerable<ExternalServiceDisclosure> GetDisclosures()
    {
        yield return new("github", "GitHub", deployments.Repos().Count > 0,
            "Repository names, branch names and (for private repositories) your access token. Source code is downloaded from GitHub.",
            "To fetch code and check for new commits for deployments.", "api.github.com and github.com");
        var otlp = settings.Get().Telemetry.OtlpEndpoint;
        yield return new("telemetry", "OpenTelemetry export", !string.IsNullOrEmpty(otlp),
            "CPU, memory, network and request metrics. No file contents.", "Monitoring in an external tool you choose.", otlp ?? "Not configured");
    }
}

/// <summary>Housekeeping: empties old recycle bin items and abandoned uploads.</summary>
public sealed class MaintenanceService(IServiceProvider sp, ILogger<MaintenanceService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), ct);
        try { if (sp.GetRequiredService<StorageService>().Status().Online) sp.GetRequiredService<ShareService>().ImportExisting(); } catch (Exception ex) { log.LogDebug(ex, "Share import skipped"); }
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                if (!sp.GetRequiredService<StorageService>().Status().Online) continue;
                var files = sp.GetRequiredService<FileService>();
                var purged = files.PurgeOlderThan(TimeSpan.FromDays(30));
                var stale = files.CleanupStaleUploads(TimeSpan.FromHours(24));
                if (purged + stale > 0) log.LogInformation("Maintenance: removed {Purged} old recycle bin items and {Stale} abandoned uploads", purged, stale);
            }
            catch (Exception ex) { log.LogWarning(ex, "Maintenance failed"); }
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
