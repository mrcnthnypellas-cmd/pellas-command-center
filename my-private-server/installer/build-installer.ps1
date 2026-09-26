<#
.SYNOPSIS
  Builds the My Private Server MSI on this Windows PC, and optionally installs and tests it.

.EXAMPLE
  # From the my-private-server folder, in PowerShell:
  powershell -ExecutionPolicy Bypass -File .\installer\build-installer.ps1              # build the MSI
  powershell -ExecutionPolicy Bypass -File .\installer\build-installer.ps1 -Install     # build, install, open setup
  powershell -ExecutionPolicy Bypass -File .\installer\build-installer.ps1 -Install -Test   # also run the full self-test

.NOTES
  Needs .NET 10 SDK and Node.js. If they are missing and winget is available, they are installed for you.
  WiX Toolset is restored automatically as a NuGet package. Output: installer\out\MyPrivateServer-<version>-x64.msi
#>
param([string]$Version = "0.3.0", [switch]$Install, [switch]$Test, [switch]$SkipPrereqs)
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$out = "$PSScriptRoot\out"
$publish = "$PSScriptRoot\build\publish"
$stage = "$PSScriptRoot\stage"

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }

if (-not $SkipPrereqs) {
    Step "Checking prerequisites"
    $needDotnet = -not (Have dotnet) -or -not ((dotnet --list-sdks) -match "^10\.")
    $needNode = -not (Have node)
    if ($needDotnet -or $needNode) {
        if (-not (Have winget)) { throw "Install the .NET 10 SDK (https://dotnet.microsoft.com/download) and Node.js LTS (https://nodejs.org), then run this again." }
        if ($needDotnet) { winget install --id Microsoft.DotNet.SDK.10 -e --accept-source-agreements --accept-package-agreements }
        if ($needNode) { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements }
        Refresh-Path
    }
    Write-Host ("dotnet " + (dotnet --version) + ", node " + (node --version))
}

Step "Fetching bundled components (verified by SHA-256)"
& "$PSScriptRoot\fetch-components.ps1" -Stage "$stage\tools"

Step "Building the dashboard"
Push-Location "$root\dashboard"
try { npm ci --no-audit --no-fund; npm run build } finally { Pop-Location }

Step "Publishing the server (self-contained, win-x64)"
if (Test-Path $publish) { Remove-Item $publish -Recurse -Force }
dotnet publish "$root\src\MyPrivateServer.Server" -c Release -r win-x64 --self-contained true -p:Version=$Version -o $publish
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Step "Building the MSI with WiX"
dotnet build "$PSScriptRoot\MyPrivateServer.Installer\MyPrivateServer.Installer.wixproj" -c Release `
    -p:ProductVersion=$Version -p:PublishDir="$publish" -p:StageDir="$stage" -o $out
if ($LASTEXITCODE -ne 0) { throw "WiX build failed" }
$msi = Get-ChildItem $out -Filter "MyPrivateServer-$Version-x64.msi" | Select-Object -First 1
Write-Host "`nInstaller ready: $($msi.FullName) ($([math]::Round($msi.Length / 1MB)) MB)" -ForegroundColor Green

if ($Install) { & "$PSScriptRoot\install-and-test.ps1" -Msi $msi.FullName -Test:$Test }
