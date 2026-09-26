using System.Diagnostics;

namespace MyPrivateServer.Core;

/// <summary>
/// A long-running child process (tunnel client, Caddy, a Node/ASP.NET app) with a rolling log buffer.
/// Started with an argument list, never through a shell.
/// </summary>
public sealed class ManagedProcess : IDisposable
{
    readonly LinkedList<string> _log = new();
    readonly Lock _gate = new();
    readonly int _maxLines;
    Process? _p;

    public ManagedProcess(string name, int maxLogLines = 500) { Name = name; _maxLines = maxLogLines; }

    public string Name { get; }
    public bool IsRunning { get { try { return _p is { HasExited: false }; } catch { return false; } } }
    public int? Pid => IsRunning ? _p!.Id : null;
    public DateTimeOffset? StartedAt { get; private set; }
    public int? LastExitCode { get; private set; }
    public event Action<string>? Line;
    public event Action<int>? Exited;

    public IReadOnlyList<string> Log(int last = 200) { lock (_gate) return _log.Skip(Math.Max(0, _log.Count - last)).ToList(); }

    public void Start(string fileName, IEnumerable<string> args, string? workingDirectory = null, IDictionary<string, string?>? env = null, IReadOnlyCollection<string>? redact = null)
    {
        Stop();
        var psi = new ProcessStartInfo(ToolLocator.Find(fileName) ?? fileName)
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
            WorkingDirectory = workingDirectory ?? "",
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        psi.Environment[OperatingSystem.IsWindows() ? "Path" : "PATH"] = ToolLocator.PathWithTools();
        if (env is not null) foreach (var (k, v) in env) psi.Environment[k] = v;
        var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        void OnData(string? l)
        {
            if (l is null) return;
            if (redact is not null) foreach (var r in redact) if (!string.IsNullOrEmpty(r)) l = l.Replace(r, "***");
            lock (_gate) { _log.AddLast($"{DateTime.Now:HH:mm:ss} {l}"); while (_log.Count > _maxLines) _log.RemoveFirst(); }
            Line?.Invoke(l);
        }
        p.OutputDataReceived += (_, e) => OnData(e.Data);
        p.ErrorDataReceived += (_, e) => OnData(e.Data);
        p.Exited += (_, _) =>
        {
            try { LastExitCode = p.ExitCode; } catch { }
            OnData($"[process exited with code {LastExitCode}]");
            Exited?.Invoke(LastExitCode ?? -1);
        };
        try { p.Start(); }
        catch (System.ComponentModel.Win32Exception ex) { throw new UserFacingException($"Could not start {Name}: {ex.Message}", 503); }
        p.BeginOutputReadLine(); p.BeginErrorReadLine();
        _p = p; StartedAt = DateTimeOffset.UtcNow; LastExitCode = null;
    }

    public void Stop()
    {
        if (_p is null) return;
        try { if (!_p.HasExited) { _p.Kill(entireProcessTree: true); _p.WaitForExit(5000); } } catch { }
        _p.Dispose(); _p = null;
    }

    public void Dispose() => Stop();
}
