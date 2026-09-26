<#
.SYNOPSIS
  Installs the MSI, checks the service, and (with -Test) runs a full self-test in a separate, temporary
  instance so your real setup wizard stays untouched.

  The self-test runs as a temporary Windows service under LocalSystem (exactly like the real service) with its own
  data folder and ports 18080/18443, then:
    setup → built-in PostgreSQL created and online → app + REST API → website served by Caddy →
    file upload/download → backup with pg_dump → instant remote address through Cloudflare, fetched over the Internet
  and removes itself afterwards. A report is written to installer\out\self-test-report.txt.
#>
param([Parameter(Mandatory)][string]$Msi, [switch]$Test, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Asking for administrator permission to install..."
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Msi", "`"$Msi`"")
    if ($Test) { $args += "-Test" }; if ($NoBrowser) { $args += "-NoBrowser" }
    Start-Process powershell -Verb RunAs -ArgumentList $args -Wait
    return
}

$log = Join-Path (Split-Path $Msi) "install.log"
Write-Host "Installing $Msi ..."
$p = Start-Process msiexec -ArgumentList "/i `"$Msi`" /qn /norestart /l*v `"$log`"" -Wait -PassThru
if ($p.ExitCode -notin 0, 3010) { throw "Install failed with code $($p.ExitCode). See $log" }

$svc = Get-Service MyPrivateServer
for ($i = 0; $i -lt 60 -and $svc.Status -ne "Running"; $i++) { Start-Sleep 1; $svc.Refresh() }
if ($svc.Status -ne "Running") { throw "The service did not start. See Event Viewer and C:\ProgramData\MyPrivateServer\logs" }
for ($i = 0; $i -lt 30; $i++) { try { if ((Invoke-RestMethod http://localhost:8080/api/health).status -eq "ok") { break } } catch { Start-Sleep 1 } }
$status = Invoke-RestMethod http://localhost:8080/api/setup/status
Write-Host "Service running. Server ID $($status.serverId). Bundled components:" -ForegroundColor Green
$status.components | Format-List | Out-String | Write-Host

if ($Test) { & "$PSScriptRoot\self-test.ps1" }
if (-not $NoBrowser -and -not $status.setupCompleted) { Start-Process "http://localhost:8080" }
