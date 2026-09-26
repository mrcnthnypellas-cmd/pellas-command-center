using System.Text.Json;
using MyPrivateServer.Core;

namespace MyPrivateServer.Storage;

public enum DriveKind { Unknown, HDD, SSD, NVMe, Removable, Network }

public sealed record DetectedDrive(
    string Id, string Root, string Label, DriveKind Kind, string FileSystem, long TotalBytes, long FreeBytes,
    bool IsSystem, bool IsReady, string? Model, string? Health, bool Recommended, string? Note);

public interface IStorageDetector
{
    Task<IReadOnlyList<DetectedDrive>> DetectAsync(CancellationToken ct = default);
}

/// <summary>
/// Read-only detection of the drives attached to this PC. It never formats, partitions or writes to a disk.
/// Media type (HDD/SSD/NVMe) comes from Get-PhysicalDisk on Windows and lsblk on Linux.
/// </summary>
public sealed class SystemStorageDetector(IProcessRunner runner) : IStorageDetector
{
    public async Task<IReadOnlyList<DetectedDrive>> DetectAsync(CancellationToken ct = default)
    {
        var media = await ReadMediaInfoAsync(ct);
        var systemRoot = Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.Windows)) is { Length: > 0 } w && OperatingSystem.IsWindows() ? w : "/";
        var list = new List<DetectedDrive>();
        foreach (var d in DriveInfo.GetDrives())
        {
            if (d.DriveType is DriveType.Ram or DriveType.NoRootDirectory or DriveType.CDRom) continue;
            if (!OperatingSystem.IsWindows() && !IsInterestingUnixMount(d.RootDirectory.FullName)) continue;
            string fs = "", label = ""; long total = 0, free = 0; var ready = d.IsReady;
            if (ready)
            {
                try { fs = d.DriveFormat; label = OperatingSystem.IsWindows() ? d.VolumeLabel : ""; total = d.TotalSize; free = d.AvailableFreeSpace; }
                catch (Exception) { ready = false; }
            }
            if (!OperatingSystem.IsWindows() && (total == 0 || fs is "proc" or "sysfs" or "tmpfs" or "overlay" or "devtmpfs" or "squashfs")) continue;
            var root = d.RootDirectory.FullName;
            media.TryGetValue(NormalizeKey(root), out var m);
            var kind = d.DriveType switch
            {
                DriveType.Removable => DriveKind.Removable,
                DriveType.Network => DriveKind.Network,
                _ => m?.Kind ?? DriveKind.Unknown,
            };
            var isSystem = string.Equals(root, systemRoot, StringComparison.OrdinalIgnoreCase);
            list.Add(new DetectedDrive(root, root, string.IsNullOrWhiteSpace(label) ? (isSystem ? "System" : "Local Disk") : label, kind, fs, total, free,
                isSystem, ready, m?.Model, m?.Health, false, null));
        }
        return Recommend(list);
    }

    /// <summary>Largest ready non-system fixed drive is recommended; the system drive is allowed but flagged.</summary>
    internal static IReadOnlyList<DetectedDrive> Recommend(List<DetectedDrive> list)
    {
        var best = list.Where(d => d.IsReady && !d.IsSystem && d.Kind is not (DriveKind.Network or DriveKind.Removable) && d.FreeBytes > 0)
                       .OrderByDescending(d => d.FreeBytes).FirstOrDefault();
        return list.Select(d => d with
        {
            Recommended = best is not null && d.Id == best.Id,
            Note = !d.IsReady ? "Drive is not ready." :
                   d.IsSystem ? "System drive. Works, but a separate data drive is safer." :
                   d.Kind == DriveKind.Removable ? "Removable drive. Good for backups, not for primary storage." :
                   d.Kind == DriveKind.Network ? "Network drive. Use as a backup destination." :
                   d.Health is { } h && h != "Healthy" ? $"Drive health reports: {h}." : null,
        }).ToList();
    }

    static bool IsInterestingUnixMount(string mount) =>
        mount == "/" || mount.StartsWith("/mnt/") || mount.StartsWith("/media/") || mount.StartsWith("/srv") || mount.StartsWith("/data") || mount.StartsWith("/home");

    static string NormalizeKey(string root) => root.TrimEnd('\\', '/').ToUpperInvariant() is { Length: > 0 } k ? k : "/";

    sealed record Media(DriveKind Kind, string? Model, string? Health);

    async Task<Dictionary<string, Media>> ReadMediaInfoAsync(CancellationToken ct)
    {
        var map = new Dictionary<string, Media>();
        try
        {
            if (OperatingSystem.IsWindows())
            {
                const string script = "Get-Partition | Where-Object DriveLetter | ForEach-Object { $p = Get-PhysicalDisk | Where-Object DeviceId -eq $_.DiskNumber | Select-Object -First 1; " +
                    "[pscustomobject]@{ Letter = [string]$_.DriveLetter; MediaType = [string]$p.MediaType; BusType = [string]$p.BusType; Health = [string]$p.HealthStatus; Model = [string]$p.FriendlyName } } | ConvertTo-Json -Compress";
                var r = await runner.RunAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], new ProcessOptions { Timeout = TimeSpan.FromSeconds(20) }, ct);
                if (r.ExitCode != 0 || string.IsNullOrWhiteSpace(r.Output)) return map;
                using var doc = JsonDocument.Parse(r.Output.Trim());
                var items = doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement.EnumerateArray().ToList() : [doc.RootElement];
                foreach (var e in items)
                {
                    var letter = e.GetProperty("Letter").GetString();
                    var mt = e.GetProperty("MediaType").GetString();
                    var bus = e.GetProperty("BusType").GetString();
                    var kind = bus == "NVMe" ? DriveKind.NVMe : mt == "SSD" ? DriveKind.SSD : mt == "HDD" ? DriveKind.HDD : bus == "USB" ? DriveKind.Removable : DriveKind.Unknown;
                    map[$"{letter}:"] = new Media(kind, e.GetProperty("Model").GetString(), e.GetProperty("Health").GetString());
                }
            }
            else if (runner.Find("lsblk") is not null)
            {
                var r = await runner.RunAsync("lsblk", ["-J", "-o", "NAME,ROTA,TRAN,MOUNTPOINTS,MODEL"], new ProcessOptions { Timeout = TimeSpan.FromSeconds(10) }, ct);
                if (r.ExitCode != 0) return map;
                using var doc = JsonDocument.Parse(r.Output);
                void Walk(JsonElement dev, string? model, bool? rota, string? tran, string name)
                {
                    model = dev.TryGetProperty("model", out var mo) && mo.ValueKind == JsonValueKind.String ? mo.GetString() : model;
                    rota = dev.TryGetProperty("rota", out var ro) && ro.ValueKind is JsonValueKind.True or JsonValueKind.False ? ro.GetBoolean() : rota;
                    tran = dev.TryGetProperty("tran", out var tr) && tr.ValueKind == JsonValueKind.String ? tr.GetString() : tran;
                    var kind = tran == "nvme" || name.StartsWith("nvme") ? DriveKind.NVMe : tran == "usb" ? DriveKind.Removable : rota == true ? DriveKind.HDD : rota == false ? DriveKind.SSD : DriveKind.Unknown;
                    if (dev.TryGetProperty("mountpoints", out var mps) && mps.ValueKind == JsonValueKind.Array)
                        foreach (var mp in mps.EnumerateArray())
                            if (mp.GetString() is { } path) map[NormalizeKey(path)] = new Media(kind, model?.Trim(), null);
                    if (dev.TryGetProperty("children", out var ch))
                        foreach (var c in ch.EnumerateArray()) Walk(c, model, rota, tran, name);
                }
                foreach (var dev in doc.RootElement.GetProperty("blockdevices").EnumerateArray())
                    Walk(dev, null, null, null, dev.GetProperty("name").GetString() ?? "");
            }
        }
        catch (Exception) { /* Media type is a nice-to-have; detection still works without it. */ }
        return map;
    }
}

/// <summary>Fixed demo drives for trying the setup flow without touching real disks (MPS_SIMULATE_DRIVES=1).</summary>
public sealed class SimulatedStorageDetector : IStorageDetector
{
    const long GB = 1_000_000_000;
    public Task<IReadOnlyList<DetectedDrive>> DetectAsync(CancellationToken ct = default) =>
        Task.FromResult(SystemStorageDetector.Recommend(
        [
            new("C:\\", "C:\\", "System", DriveKind.NVMe, "NTFS", 476 * GB, 182 * GB, true, true, "Simulated NVMe SSD", "Healthy", false, null),
            new("D:\\", "D:\\", "DATA", DriveKind.HDD, "NTFS", 7_270 * GB, 6_800 * GB, false, true, "Simulated 8 TB HDD", "Healthy", false, null),
            new("E:\\", "E:\\", "BACKUP", DriveKind.SSD, "NTFS", 2_000 * GB, 1_250 * GB, false, true, "Simulated 2 TB SSD", "Healthy", false, null),
            new("F:\\", "F:\\", "USB", DriveKind.Removable, "exFAT", 1_000 * GB, 940 * GB, false, true, "Simulated USB drive", null, false, null),
        ]));
}
