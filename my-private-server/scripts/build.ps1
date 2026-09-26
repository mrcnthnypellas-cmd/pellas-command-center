<#
.SYNOPSIS
  Builds the dashboard and publishes My Private Server for Windows (x64, self-contained).
.EXAMPLE
  ./scripts/build.ps1            # output in ./publish/win-x64
#>
param([string]$Runtime = "win-x64", [string]$Output = "$PSScriptRoot/../publish/$Runtime")
$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot/../dashboard"
try { npm ci; npm run build } finally { Pop-Location }
dotnet publish "$PSScriptRoot/../src/MyPrivateServer.Server" -c Release -r $Runtime --self-contained true -o $Output
Write-Host "Published to $Output"
