<#
.SYNOPSIS
  End-to-end self-test of an installed My Private Server, run in a separate temporary instance.

  - Registers a temporary Windows service "MyPrivateServerTest" that runs the installed program under LocalSystem
    (exactly like the real service) with its own data folder and ports 18080/18443.
  - The real service is paused during the test (both would use the web server's local admin port) and started again.
  - Nothing outside C:\ProgramData\MyPrivateServer-SelfTest is written, and that folder is removed afterwards
    (use -Keep to leave it for inspection). No disk is formatted or erased.
  - Writes installer\out\self-test-report.txt.
#>
param(
    [string]$InstallDir = "$env:ProgramFiles\My Private Server",
    [switch]$SkipRemote,
    [switch]$Keep
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$exe = Join-Path $InstallDir "MyPrivateServer.Server.exe"
if (-not (Test-Path $exe)) { throw "Not installed: $exe" }
$root = Join-Path $env:ProgramData "MyPrivateServer-SelfTest"
$dataDir = Join-Path $root "data"
$storage = Join-Path $root "storage"
$backupDest = Join-Path $root "backups"
$svcName = "MyPrivateServerTest"
$base = "http://localhost:18080"
$outDir = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Force $outDir | Out-Null
$reportFile = Join-Path $outDir "self-test-report.txt"
$results = [System.Collections.Generic.List[object]]::new()

function Step([string]$name, [scriptblock]$body) {
    Write-Host ("  {0,-48}" -f $name) -NoNewline
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $detail = & $body
        Write-Host "PASS" -ForegroundColor Green -NoNewline; Write-Host "  $detail"
        $results.Add([pscustomobject]@{ Step = $name; Result = "PASS"; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1); Detail = "$detail" })
        return $true
    } catch {
        $msg = $_.Exception.Message
        if ($_.ErrorDetails.Message) { $msg += " | " + $_.ErrorDetails.Message }
        Write-Host "FAIL" -ForegroundColor Red -NoNewline; Write-Host "  $msg"
        $results.Add([pscustomobject]@{ Step = $name; Result = "FAIL"; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1); Detail = $msg })
        return $false
    }
}

$session = $null
function Csrf { ($session.Cookies.GetCookies($base) | Where-Object Name -eq "mps_csrf").Value }
function Api([string]$method, [string]$path, $body = $null, [hashtable]$headers = @{}) {
    $h = @{ "X-MPS-CSRF" = (Csrf) } + $headers
    $p = @{ Method = $method; Uri = "$base$path"; WebSession = $session; Headers = $h; TimeoutSec = 120 }
    if ($null -ne $body) { $p.Body = ($body | ConvertTo-Json -Depth 8 -Compress); $p.ContentType = "application/json" }
    Invoke-RestMethod @p
}

function Cleanup {
    Write-Host "Cleaning up the temporary instance..."
    if (Get-Service $svcName -ErrorAction SilentlyContinue) {
        Stop-Service $svcName -Force -ErrorAction SilentlyContinue
        & sc.exe delete $svcName | Out-Null
    }
    # The service stops its own PostgreSQL and web server on shutdown; make sure nothing is left behind.
    $pgCtl = Get-ChildItem (Join-Path $InstallDir "tools") -Recurse -Filter pg_ctl.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    $pgData = Join-Path $storage "Databases\postgresql"
    if ($pgCtl -and (Test-Path $pgData)) { & $pgCtl.FullName stop -D $pgData -m fast -w 2>$null | Out-Null }
    Get-CimInstance Win32_Process -Filter "Name='caddy.exe' OR Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*MyPrivateServer-SelfTest*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    if (-not $Keep -and (Test-Path $root)) {
        Start-Sleep 2
        Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($script:realWasRunning) { Start-Service MyPrivateServer -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "My Private Server self-test (temporary instance on port 18080)" -ForegroundColor Cyan
$script:realWasRunning = (Get-Service MyPrivateServer -ErrorAction SilentlyContinue).Status -eq "Running"

try {
    if ($script:realWasRunning) { Stop-Service MyPrivateServer -Force }
    if (Get-Service $svcName -ErrorAction SilentlyContinue) { Stop-Service $svcName -Force -ErrorAction SilentlyContinue; & sc.exe delete $svcName | Out-Null; Start-Sleep 1 }
    if (Test-Path $root) { Remove-Item $root -Recurse -Force }
    New-Item -ItemType Directory -Force (Join-Path $dataDir "config"), $backupDest | Out-Null
    # Separate ports so the test never collides with the real server.
    '{ "network": { "httpPort": 18080, "httpsPort": 18443, "allowLan": false } }' | Set-Content (Join-Path $dataDir "config\server.json") -Encoding ascii

    $ok = Step "Register and start test service (LocalSystem)" {
        $bin = "`"$exe`" --DataDirectory=`"$dataDir`""
        $r = & sc.exe create $svcName binPath= $bin start= demand obj= LocalSystem DisplayName= "My Private Server (self-test)"
        if ($LASTEXITCODE -ne 0) { throw "sc.exe create failed: $r" }
        Start-Service $svcName
        for ($i = 0; $i -lt 60; $i++) {
            try { if ((Invoke-RestMethod "$base/api/health" -TimeoutSec 3).status) { return "health endpoint answering" } } catch { Start-Sleep 1 }
        }
        throw "The test service did not answer on $base within 60 seconds. Logs: $dataDir\logs"
    }
    if (-not $ok) { throw "stop" }

    Step "Bundled components detected" {
        $s = Invoke-RestMethod "$base/api/setup/status"
        $c = $s.components
        $missing = @("postgres", "caddy", "git", "cloudflared") | Where-Object { -not $c.$_ }
        if ($missing) { throw "Missing: $($missing -join ', ')" }
        "postgres, caddy, git, node=$($c.node), cloudflared, frpc=$($c.frpc)"
    } | Out-Null

    $script:session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Invoke-RestMethod "$base/api/auth/csrf" -WebSession $session | Out-Null
    $password = "SelfTest-" + [guid]::NewGuid().ToString("N").Substring(0, 12)

    $ok = Step "Setup wizard + built-in PostgreSQL created" {
        $token = (Get-Content (Join-Path $dataDir "setup-token.txt") -Raw).Trim()
        $body = @{ serverName = "Self Test"; storagePath = $storage; adminUsername = "admin"; adminDisplayName = "Admin"; adminPassword = $password
                   remoteProvider = $(if ($SkipRemote) { "none" } else { "cloudflare-tunnel" }) }
        $r = Api POST "/api/setup/complete" $body @{ "X-Setup-Token" = $token }
        if (-not $r.database) { throw "No database result (bundled PostgreSQL not found?)" }
        if (-not $r.database.ok) { throw "PostgreSQL: $($r.database.message)" }
        "storage $($r.storageRoot)"
    }
    if (-not $ok) { throw "stop" }

    Step "Administrator login" {
        $r = Api POST "/api/auth/login" @{ username = "admin"; password = $password }
        "signed in as $($r.user.username)$($r.username)"
    } | Out-Null

    Step "Database server online" {
        $s = Api GET "/api/database/status"
        if (-not $s.online) { throw ($s | ConvertTo-Json -Compress) }
        "PostgreSQL $($s.version)"
    } | Out-Null

    Step "App backend: database, role and API key" {
        $app = Api POST "/api/apps" @{ name = "selftest" }
        $slug = $app.app.slug
        $key = (Api POST "/api/apps/$slug/keys" @{ name = "test"; scope = "Write" }).key
        $detail = Api GET "/api/apps/$slug"
        if ($detail.tables.error) { throw "App database not reachable: $($detail.tables.error)" }
        try { Invoke-RestMethod "$base/api/data/$slug/rest/anything" -Headers @{ apikey = "wrong" } | Out-Null; throw "A wrong API key was accepted" }
        catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
        try { Invoke-RestMethod "$base/api/data/$slug/rest/no_such_table" -Headers @{ apikey = $key } | Out-Null }
        catch { if ($_.Exception.Response.StatusCode.value__ -in 401, 403, 500, 503) { throw } }
        "app '$slug' database $($app.app.database); key accepted, wrong key rejected"
    } | Out-Null

    Step "Website served by the web server (Caddy)" {
        $site = Api POST "/api/websites" @{ name = "selftest"; kind = "Static" }
        $port = $site.port; if (-not $port) { $port = $site.site.port }
        if (-not $port) { $port = ((Api GET "/api/websites") | ForEach-Object { $_.site; $_ } | Where-Object { $_.name -eq "selftest" -and $_.port } | Select-Object -First 1).port }
        for ($i = 0; $i -lt 20; $i++) {
            try { $page = Invoke-WebRequest "http://localhost:$port/" -UseBasicParsing -TimeoutSec 5; if ($page.StatusCode -eq 200) { return "http://localhost:$port answered 200" } } catch { Start-Sleep 1 }
        }
        throw "Nothing answered on port $port"
    } | Out-Null

    Step "File upload and download" {
        $bytes = [byte[]]::new(3MB); (New-Object Random 42).NextBytes($bytes)
        $u = Api POST "/api/files/uploads" @{ path = "/home"; fileName = "selftest.bin"; size = $bytes.Length }
        $chunk = 1MB
        for ($off = 0; $off -lt $bytes.Length; $off += $chunk) {
            $len = [math]::Min($chunk, $bytes.Length - $off)
            $part = [byte[]]::new($len); [Array]::Copy($bytes, $off, $part, 0, $len)
            Invoke-RestMethod -Method Patch "$base/api/files/uploads/$($u.id)" -WebSession $session -Body $part -ContentType "application/octet-stream" `
                -Headers @{ "X-MPS-CSRF" = (Csrf); "Upload-Offset" = "$off" } | Out-Null
        }
        $tmp = Join-Path $root "download.bin"
        Invoke-WebRequest "$base/api/files/download?path=/home/selftest.bin" -WebSession $session -OutFile $tmp -UseBasicParsing
        $sha = [Security.Cryptography.SHA256]::Create()
        if ([Convert]::ToBase64String($sha.ComputeHash($bytes)) -ne [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($tmp)))) { throw "Downloaded file differs" }
        "3 MB in 1 MB chunks, checksum matches"
    } | Out-Null

    Step "Backup of files + databases (pg_dump)" {
        $job = Api POST "/api/backups/jobs" @{ name = "selftest"; type = "FullServer"; sources = @(); destination = $backupDest; frequency = "Daily"; enabled = $false }
        Api POST "/api/backups/jobs/$($job.id)/run" | Out-Null
        for ($i = 0; $i -lt 120; $i++) {
            Start-Sleep 1
            $run = @(Api GET "/api/backups/runs?jobId=$($job.id)") | Select-Object -First 1
            if ($run -and $run.status -ne "Running") {
                if ($run.status -eq "Succeeded") { return "$($run.items) archive(s), $($run.bytes) bytes" }
                throw "$($run.status): $($run.message)"
            }
        }
        throw "Backup did not finish within 2 minutes"
    } | Out-Null

    if (-not $SkipRemote) {
        Step "Remote access over the Internet (Cloudflare quick tunnel)" {
            for ($i = 0; $i -lt 90; $i++) {
                $st = (Api GET "/api/remote-access").status
                $addr = @($st.accessAddresses) | Where-Object { $_ -like "https://*" } | Select-Object -First 1
                if ($st.state -eq "Connected" -and $addr) {
                    for ($j = 0; $j -lt 30; $j++) {
                        try { $h = Invoke-RestMethod "$addr/api/health" -TimeoutSec 10; if ($h.status) { return "$addr reachable from the Internet" } } catch { Start-Sleep 2 }
                    }
                    throw "Tunnel says connected ($addr) but it did not answer from the Internet yet"
                }
                if ($st.state -in "Error", "Unavailable") { throw "$($st.state): $($st.reason)" }
                Start-Sleep 1
            }
            throw "Not connected after 90 seconds (state $($st.state))"
        } | Out-Null
    }
} catch {
    if ($_.Exception.Message -ne "stop") { $results.Add([pscustomobject]@{ Step = "Unexpected error"; Result = "FAIL"; Seconds = 0; Detail = $_.Exception.Message }) }
} finally {
    $logTail = Get-ChildItem (Join-Path $dataDir "logs") -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1 |
        ForEach-Object { Get-Content $_.FullName -Tail 60 }
    Cleanup
}

$failed = @($results | Where-Object Result -eq "FAIL").Count
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$ver = (Get-Item $exe).VersionInfo.ProductVersion
$report = @(
    "My Private Server self-test report"
    "Date:     $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    "Windows:  $os"
    "Version:  $ver"
    "Result:   $(if ($failed) { "$failed step(s) FAILED" } else { 'ALL PASSED' })"
    ""
    ($results | Format-Table Result, Seconds, Step, Detail -AutoSize -Wrap | Out-String -Width 220)
)
if ($failed -and $logTail) { $report += @("Last lines of the test server log:", $logTail) }
$report | Set-Content $reportFile -Encoding utf8

Write-Host ""
if ($failed) { Write-Host "$failed step(s) failed. Report: $reportFile" -ForegroundColor Red }
else { Write-Host "All self-test steps passed. Report: $reportFile" -ForegroundColor Green }
if ($script:realWasRunning) { Write-Host "Your real server has been started again on http://localhost:8080" }
