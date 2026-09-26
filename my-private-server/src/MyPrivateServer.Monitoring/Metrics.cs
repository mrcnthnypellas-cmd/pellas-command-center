using System.Diagnostics.Metrics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MyPrivateServer.Core;

namespace MyPrivateServer.Monitoring;

public sealed record MetricSample(DateTimeOffset At, double CpuPercent, long MemoryUsedBytes, long MemoryTotalBytes, double NetInBytesPerSec, double NetOutBytesPerSec);

public sealed record SystemSnapshot(
    string MachineName, string OperatingSystem, int ProcessorCount, TimeSpan SystemUptime, TimeSpan ServerUptime,
    MetricSample Current, IReadOnlyList<NetworkAdapter> Adapters, IReadOnlyList<string> LocalAddresses);

public sealed record NetworkAdapter(string Name, string Type, long SpeedBitsPerSec, string Status, IReadOnlyList<string> Addresses);

interface IPlatformCounters
{
    (ulong idle, ulong total) CpuTimes();
    (long used, long total) Memory();
}

sealed class WindowsCounters : IPlatformCounters
{
    [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint Low; public uint High; public ulong Value => ((ulong)High << 32) | Low; }
    [StructLayout(LayoutKind.Sequential)]
    struct MEMORYSTATUSEX
    {
        public uint dwLength, dwMemoryLoad; public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX m);

    public (ulong idle, ulong total) CpuTimes()
    {
        GetSystemTimes(out var idle, out var kernel, out var user);
        return (idle.Value, kernel.Value + user.Value); // kernel time includes idle time
    }

    public (long used, long total) Memory()
    {
        var m = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        GlobalMemoryStatusEx(ref m);
        return ((long)(m.ullTotalPhys - m.ullAvailPhys), (long)m.ullTotalPhys);
    }
}

sealed class LinuxCounters : IPlatformCounters
{
    public (ulong idle, ulong total) CpuTimes()
    {
        var parts = File.ReadLines("/proc/stat").First().Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1).Select(ulong.Parse).ToArray();
        var idle = parts[3] + (parts.Length > 4 ? parts[4] : 0);
        return (idle, parts.Aggregate(0UL, (a, b) => a + b));
    }

    public (long used, long total) Memory()
    {
        var d = File.ReadLines("/proc/meminfo").Select(l => l.Split(':')).Where(p => p.Length == 2)
            .ToDictionary(p => p[0], p => long.Parse(p[1].Trim().Split(' ')[0]) * 1024);
        var total = d.GetValueOrDefault("MemTotal");
        return (total - d.GetValueOrDefault("MemAvailable"), total);
    }
}

/// <summary>Samples CPU, memory and network every two seconds and keeps ten minutes of history.</summary>
public sealed class MetricsCollector : BackgroundService
{
    public const string MeterName = "MyPrivateServer";
    readonly IPlatformCounters _counters = OperatingSystem.IsWindows() ? new WindowsCounters() : new LinuxCounters();
    readonly LinkedList<MetricSample> _history = new();
    readonly Lock _gate = new();
    readonly ILogger<MetricsCollector> _log;
    readonly DateTimeOffset _started = DateTimeOffset.UtcNow;
    (ulong idle, ulong total) _lastCpu;
    (long rx, long tx, DateTimeOffset at) _lastNet;

    public MetricsCollector(ILogger<MetricsCollector> log, IMeterFactory meters)
    {
        _log = log;
        var meter = meters.Create(MeterName);
        meter.CreateObservableGauge("mps.cpu.percent", () => Latest.CpuPercent, "%");
        meter.CreateObservableGauge("mps.memory.used", () => Latest.MemoryUsedBytes, "By");
        meter.CreateObservableGauge("mps.network.in", () => Latest.NetInBytesPerSec, "By/s");
        meter.CreateObservableGauge("mps.network.out", () => Latest.NetOutBytesPerSec, "By/s");
        try { _lastCpu = _counters.CpuTimes(); } catch { }
        _lastNet = (0, 0, DateTimeOffset.UtcNow);
        var (rx, tx) = NetTotals(); _lastNet = (rx, tx, DateTimeOffset.UtcNow);
        Sample();
    }

    public MetricSample Latest { get { lock (_gate) return _history.Last?.Value ?? new(DateTimeOffset.UtcNow, 0, 0, 0, 0, 0); } }
    public IReadOnlyList<MetricSample> History() { lock (_gate) return _history.ToList(); }
    public TimeSpan ServerUptime => DateTimeOffset.UtcNow - _started;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        while (await timer.WaitForNextTickAsync(ct))
        {
            try { Sample(); }
            catch (Exception ex) { _log.LogDebug(ex, "Metric sample failed"); }
        }
    }

    void Sample()
    {
        double cpu = 0;
        try
        {
            var now = _counters.CpuTimes();
            var dTotal = now.total - _lastCpu.total; var dIdle = now.idle - _lastCpu.idle;
            cpu = dTotal == 0 ? 0 : Math.Clamp(100.0 * (dTotal - dIdle) / dTotal, 0, 100);
            _lastCpu = now;
        }
        catch { }
        (long used, long total) mem = (0, 0);
        try { mem = _counters.Memory(); } catch { }
        var (rx, tx) = NetTotals();
        var at = DateTimeOffset.UtcNow;
        var secs = Math.Max(0.5, (at - _lastNet.at).TotalSeconds);
        var sample = new MetricSample(at, Math.Round(cpu, 1), mem.used, mem.total, Math.Max(0, (rx - _lastNet.rx) / secs), Math.Max(0, (tx - _lastNet.tx) / secs));
        _lastNet = (rx, tx, at);
        lock (_gate)
        {
            _history.AddLast(sample);
            while (_history.Count > 300) _history.RemoveFirst();
        }
    }

    static (long rx, long tx) NetTotals()
    {
        long rx = 0, tx = 0;
        try
        {
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var s = n.GetIPStatistics(); rx += s.BytesReceived; tx += s.BytesSent;
            }
        }
        catch { }
        return (rx, tx);
    }

    public SystemSnapshot Snapshot()
    {
        var adapters = new List<NetworkAdapter>();
        var local = new List<string>();
        try
        {
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (n.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var addrs = n.GetIPProperties().UnicastAddresses
                    .Where(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork).Select(a => a.Address.ToString()).ToList();
                adapters.Add(new NetworkAdapter(n.Name, n.NetworkInterfaceType.ToString(), n.OperationalStatus == OperationalStatus.Up ? n.Speed : 0, n.OperationalStatus.ToString(), addrs));
                if (n.OperationalStatus == OperationalStatus.Up) local.AddRange(addrs);
            }
        }
        catch { }
        return new SystemSnapshot(Environment.MachineName, RuntimeInformation.OSDescription, Environment.ProcessorCount,
            TimeSpan.FromMilliseconds(Environment.TickCount64), ServerUptime, Latest, adapters, local.Distinct().ToList());
    }
}

/// <summary>Runs every module's health probe (storage, PostgreSQL, Caddy, Docker, remote access).</summary>
public sealed class HealthService(IEnumerable<IHealthProbe> probes, ILogger<HealthService> log)
{
    public async Task<IReadOnlyList<HealthResult>> CheckAllAsync(CancellationToken ct)
    {
        var tasks = probes.Select(async p =>
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(5));
                return await p.CheckAsync(cts.Token);
            }
            catch (Exception ex)
            {
                log.LogDebug(ex, "Health probe {Probe} failed", p.Name);
                return new HealthResult(p.Name, HealthState.Unavailable, "Check failed", ex.Message);
            }
        });
        return await Task.WhenAll(tasks);
    }
}
