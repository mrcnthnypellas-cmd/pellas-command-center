namespace MyPrivateServer.Core;

public enum HealthState { Healthy, Degraded, Unavailable, Disabled }

public sealed record HealthResult(string Name, HealthState State, string Summary, string? Detail = null);

/// <summary>Each module reports its own health (storage online, PostgreSQL reachable, Caddy running...).</summary>
public interface IHealthProbe
{
    string Name { get; }
    Task<HealthResult> CheckAsync(CancellationToken ct);
}
