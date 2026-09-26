<# Removes the development service and firewall rules. Your data folder and storage folder are NOT deleted. #>
$ErrorActionPreference = "SilentlyContinue"
Stop-Service MyPrivateServer; sc.exe delete MyPrivateServer | Out-Null
Remove-NetFirewallRule -DisplayName "My Private Server (HTTP)"; Remove-NetFirewallRule -DisplayName "My Private Server (HTTPS)"
Write-Host "Service removed. Data in $env:ProgramData\MyPrivateServer and your storage folder were kept."
