<#
.SYNOPSIS
  Development helper: installs the published server as a Windows service that starts with Windows.
  The production WiX installer will replace this script. Run from an elevated PowerShell.
#>
param([string]$InstallDir = "$PSScriptRoot/../publish/win-x64", [int]$HttpPort = 8080, [int]$HttpsPort = 8443)
$ErrorActionPreference = "Stop"
$exe = (Resolve-Path "$InstallDir/MyPrivateServer.Server.exe").Path
if (Get-Service MyPrivateServer -ErrorAction SilentlyContinue) { Stop-Service MyPrivateServer; sc.exe delete MyPrivateServer | Out-Null; Start-Sleep 2 }
New-Service -Name MyPrivateServer -DisplayName "My Private Server" -Description "Private NAS, database and web server" -BinaryPathName "`"$exe`"" -StartupType Automatic | Out-Null
sc.exe failure MyPrivateServer reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
# Allow devices on the local network (Private profile only) to reach the dashboard.
New-NetFirewallRule -DisplayName "My Private Server (HTTP)" -Direction Inbound -Protocol TCP -LocalPort $HttpPort -Profile Private -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "My Private Server (HTTPS)" -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Profile Private -Action Allow -ErrorAction SilentlyContinue | Out-Null
Start-Service MyPrivateServer
Write-Host "Service installed and started. Open http://localhost:$HttpPort to finish setup."
Start-Process "http://localhost:$HttpPort"
