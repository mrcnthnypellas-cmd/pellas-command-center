<#
.SYNOPSIS
  Downloads the free, open-source programs bundled with My Private Server, verifies each SHA-256,
  and lays them out in installer\stage\tools\<name>\ for the MSI.
.NOTES
  PostgreSQL's hash is not pinned yet (its download site was unreachable when this was written). On the first
  download the hash is recorded in components.lock.json and every later build must match it
  (trust on first use). You can compare it with the hash EDB publishes.
#>
param([string]$Stage = "$PSScriptRoot\stage\tools", [string]$Cache = "$PSScriptRoot\.cache")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # much faster Invoke-WebRequest
$manifest = Get-Content "$PSScriptRoot\components.json" -Raw | ConvertFrom-Json
$lockFile = "$PSScriptRoot\components.lock.json"
$lock = @{}
if (Test-Path $lockFile) { (Get-Content $lockFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $lock[$_.Name] = $_.Value } }
New-Item -ItemType Directory -Force $Stage, $Cache | Out-Null
$notices = @("My Private Server bundles the following free and open-source programs.", "Each keeps its own license, included next to it in the tools folder.", "")

foreach ($c in $manifest.components) {
    $file = Join-Path $Cache ([IO.Path]::GetFileName(([uri]$c.url).AbsolutePath))
    if (-not (Test-Path $file)) {
        Write-Host "Downloading $($c.name) $($c.version)..."
        Invoke-WebRequest -Uri $c.url -OutFile "$file.part" -UseBasicParsing
        Move-Item "$file.part" $file -Force
    }
    $hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = if ($c.sha256) { $c.sha256 } else { $lock[$c.name] }
    if ($expected) {
        if ($hash -ne $expected.ToLowerInvariant()) { Remove-Item $file; throw "Checksum mismatch for $($c.name): got $hash, expected $expected. Download removed." }
    } else {
        Write-Warning "$($c.name): no pinned checksum; recording $hash in components.lock.json (trust on first use)."
        $lock[$c.name] = $hash
    }

    $dest = Join-Path $Stage $c.target
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Force $dest | Out-Null
    if ($file.EndsWith(".exe")) {
        Copy-Item $file (Join-Path $dest $c.rename)
    } else {
        $tmp = Join-Path $Cache ("x-" + $c.name)
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Expand-Archive $file $tmp
        $root = $tmp
        if ($c.stripTopFolder) { $root = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName }
        if ($c.licenseFile -and (Test-Path (Join-Path $root $c.licenseFile))) { Copy-Item (Join-Path $root $c.licenseFile) (Join-Path $dest ("LICENSE-" + $c.name + [IO.Path]::GetExtension($c.licenseFile))) }
        foreach ($k in $c.keep) {
            if ($k -eq "*") { Copy-Item (Join-Path $root "*") $dest -Recurse -Force; continue }
            $src = Join-Path $root $k
            $to = Join-Path $dest $k
            New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
            Copy-Item $src $to -Recurse -Force
        }
        Remove-Item $tmp -Recurse -Force
    }
    $notices += "$($c.name) $($c.version): $($c.license)  ($($c.url))  sha256 $hash"
}
$lock | ConvertTo-Json | Set-Content $lockFile
$notices | Set-Content (Join-Path (Split-Path $Stage) "THIRD-PARTY-NOTICES.txt")
Write-Host "Components ready in $Stage"
