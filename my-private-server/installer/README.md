# Windows installer

Not built yet: rule 31 of the brief says to prototype first. The plan is in
[`../docs/ROADMAP.md`](../docs/ROADMAP.md#installer-wix-toolset).

Until then, on a Windows PC:

```powershell
./scripts/build.ps1              # builds the dashboard and a self-contained win-x64 server
./scripts/install-service.ps1    # elevated: registers the Windows service and firewall rules
```
