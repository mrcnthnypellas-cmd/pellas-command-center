# Windows installer (MSI)

Builds `MyPrivateServer-<version>-x64.msi`. The MSI contains everything a fresh Windows 10/11 PC needs:
the self-contained server (no .NET install needed), the dashboard, and these free, open-source helpers,
downloaded from their official releases and checked against pinned SHA-256 hashes (`components.json`):

| Component | Used for |
|---|---|
| PostgreSQL 17 (EDB binaries) | built-in database server, created by the setup wizard on your storage drive |
| Caddy | hosts your websites |
| MinGit | GitHub deployments |
| Node.js LTS | building and running Node websites |
| cloudflared | instant remote address (Cloudflare quick tunnel, free, no account) |
| frpc | your own relay, if you have one |

Licences are collected into `THIRD-PARTY-NOTICES.txt`, installed next to the program.

## One command: build, install and test (on your Windows PC)

Open **PowerShell** in the `my-private-server` folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\build-installer.ps1 -Install -Test
```

It will:

1. Install the .NET 10 SDK and Node.js LTS with `winget` if they are missing (build tools only; the installed
   server does not need them).
2. Download and verify the bundled components (`fetch-components.ps1`, cached in `installer\.cache`).
3. Build the dashboard and publish the server for win-x64.
4. Build the MSI with WiX v5 into `installer\out\`.
5. `-Install`: ask for administrator permission, install the MSI silently (log: `installer\out\install.log`),
   and wait for the `MyPrivateServer` service to answer on http://localhost:8080.
6. `-Test`: run `self-test.ps1` in a **separate temporary instance** (its own data folder and port 18080,
   running as LocalSystem like the real service) so your real setup is untouched. It checks: setup wizard,
   built-in PostgreSQL created and online, app database + API key, a website served by Caddy, a 3 MB
   upload/download, a full backup with `pg_dump`, and a remote address through Cloudflare reached from the
   Internet. The temporary instance is removed afterwards and a report is written to
   `installer\out\self-test-report.txt`. Add `-SkipRemote` to `self-test.ps1` to skip the Internet test.
7. Open http://localhost:8080 so you can run the real setup wizard.

Only build the MSI: `.\installer\build-installer.ps1` (output in `installer\out\`).
Test an already installed server again: `.\installer\self-test.ps1` (as administrator).

## What the MSI does

- Installs to `C:\Program Files\My Private Server`; data lives in `C:\ProgramData\MyPrivateServer`
  (restricted to SYSTEM and Administrators) and on the storage folder you choose in the wizard.
- Registers the `MyPrivateServer` Windows service: automatic (delayed) start, restarts on failure.
- Adds firewall rules for the **Private** network profile, local subnet only: 8080, 8443 and 8100–8899 (websites).
- Upgrades (a newer MSI) replace program files only. Uninstall removes the program and service; your settings,
  databases and files are **never** deleted.
- No disk is formatted or erased, ever.

## Files

| File | Purpose |
|---|---|
| `build-installer.ps1` | the one command above |
| `fetch-components.ps1`, `components.json` | download + verify bundled tools into `stage\` |
| `MyPrivateServer.Installer\` | WiX v5 project (`Package.wxs`, licence, icon) |
| `install-and-test.ps1` | silent install + health check (+ self-test) |
| `self-test.ps1` | end-to-end test in a temporary instance |

The PostgreSQL download has no published SHA-256, so its hash is recorded on first download in
`components.lock.json` (trust on first use) and checked on every later build; commit that file.

The MSI is not code-signed (a signing certificate is a paid product), so Windows SmartScreen may show
"Windows protected your PC" → **More info** → **Run anyway** when you run it by double-click.
