using System.Diagnostics;
using System.Text;

namespace MyPrivateServer.Core;

public sealed record ProcessResult(int ExitCode, string Output, bool TimedOut);

public sealed class ProcessOptions
{
    public string? WorkingDirectory { get; init; }
    public IDictionary<string, string?> Environment { get; init; } = new Dictionary<string, string?>();
    public TimeSpan Timeout { get; init; } = TimeSpan.FromMinutes(10);
    /// <summary>Strings replaced with *** in captured output (tokens, passwords).</summary>
    public IReadOnlyCollection<string> Redact { get; init; } = [];
    public Action<string>? OnLine { get; init; }
    public string? StandardInput { get; init; }
}

public interface IProcessRunner
{
    Task<ProcessResult> RunAsync(string fileName, IEnumerable<string> arguments, ProcessOptions? options = null, CancellationToken ct = default);
    /// <summary>Finds an executable in the tools directory or PATH.</summary>
    string? Find(string name);
}

/// <summary>Runs external tools with an argument list (never through a shell) so input cannot inject commands.</summary>
public sealed class ProcessRunner : IProcessRunner
{
    public string? Find(string name) => ToolLocator.Find(name);

    public async Task<ProcessResult> RunAsync(string fileName, IEnumerable<string> arguments, ProcessOptions? options = null, CancellationToken ct = default)
    {
        options ??= new ProcessOptions();
        var psi = new ProcessStartInfo(Find(fileName) ?? fileName)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = options.StandardInput is not null,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = options.WorkingDirectory ?? "",
        };
        foreach (var a in arguments) psi.ArgumentList.Add(a);
        psi.Environment[OperatingSystem.IsWindows() ? "Path" : "PATH"] = ToolLocator.PathWithTools();
        foreach (var (k, v) in options.Environment) psi.Environment[k] = v;

        var output = new StringBuilder();
        var gate = new Lock();
        void OnData(string? line)
        {
            if (line is null) return;
            foreach (var secret in options.Redact) if (!string.IsNullOrEmpty(secret)) line = line.Replace(secret, "***");
            lock (gate) output.AppendLine(line);
            options.OnLine?.Invoke(line);
        }

        using var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var exited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        p.Exited += (_, _) => exited.TrySetResult();
        p.OutputDataReceived += (_, e) => OnData(e.Data);
        p.ErrorDataReceived += (_, e) => OnData(e.Data);
        try { p.Start(); }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new UserFacingException($"Could not start '{fileName}'. Is it installed? ({ex.Message})", 503);
        }
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        if (options.StandardInput is not null) { await p.StandardInput.WriteAsync(options.StandardInput); p.StandardInput.Close(); }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(options.Timeout);
        var timedOut = false;
        // Wait for the process itself, not for its output pipes: a program it leaves running (pg_ctl starting
        // postgres) inherits the pipes and would otherwise keep us waiting until the timeout.
        try { await exited.Task.WaitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            timedOut = !ct.IsCancellationRequested;
            try { p.Kill(entireProcessTree: true); } catch { }
            if (!timedOut) throw;
        }
        using (var drain = new CancellationTokenSource(TimeSpan.FromSeconds(3)))
            try { await p.WaitForExitAsync(drain.Token); } catch (OperationCanceledException) { }
        lock (gate) return new ProcessResult(timedOut ? -1 : p.ExitCode, output.ToString(), timedOut);
    }
}
