# My Private Server: Phase 2 technical prototype

Turns an ordinary Windows PC and its HDD/SSD into a private **NAS, file server, database server,
website host, GitHub deployment server, backup server and remote-access server**. No subscription,
no VPS, no domain required.

> Status: **technical prototype approved; production installer added.** Everything below runs for real.
> The MSI installer bundles PostgreSQL, Caddy, Git, Node.js, cloudflared and frpc, so a fresh PC needs nothing
> else. Build, install and self-test it on Windows with one command, see [installer/README.md](installer/README.md).

## What works

| Area | Prototype |
|---|---|
| Windows server core | .NET 10 / ASP.NET Core, runs as a Windows service (`UseWindowsService`), Serilog logs, OpenTelemetry metrics, self-signed local HTTPS |
| Setup | First-run wizard: server name, **real drive detection** (never formats), storage folder, administrator. Only from this PC or with a one-time setup code |
| Users | Administrator / Developer / User / Read only, quotas, disable, reset password, lockout, sessions, audit log |
| Files | Browser file manager: upload (**resumable**, 8 MB chunks, drag and drop), download (range requests), folder ZIP, preview, rename, move, copy, search, sort, recycle bin. **Per-person and per-subfolder permissions** on shared folders |
| Database | PostgreSQL: databases, users, permissions, status, one-click backup and restore (`pg_dump`/`pg_restore`) |
| Supabase-like apps | Per-app database and least-privilege role, API keys, REST data API (`/api/data/{app}/rest/{table}` with filters), app-user sign-up/sign-in with **row-level security**, file storage, encrypted environment variables, CORS for Vercel frontends |
| Websites | Caddy config generated and hot-reloaded; static/React (SPA), Node.js, ASP.NET, PHP, proxy; ZIP deploy; releases with **rollback**; app processes restarted if they crash |
| GitHub | Connect public/private repos, branch, clone → build (npm/dotnet auto-detect) → test → release → activate, live logs, history, automatic deploy by **polling** (works behind CGNAT), optional signed webhooks |
| Docker | Containers list, start/stop/restart/logs/remove/run, with guardrails (no privileged or host-network containers, volumes confined) |
| Backups | Files / databases / apps / configuration / full server to another drive, external disk or network share; schedules, retention, SHA-256 manifests, verify, restore to a new folder |
| Remote access | Provider abstraction, outbound-only: **WireGuard mesh** (Tailscale client + self-hosted Headscale or free Tailscale), **Cloudflare quick tunnel** (no account, no domain), **self-hosted frp relay**. Shows Direct / NAT traversal / Relay / Tunnel, reconnects automatically, and reports honestly when unavailable. STUN NAT/CGNAT test |
| Monitoring | Live CPU/RAM/network, service health, adapters, external-services disclosure |
| Dashboard | React + TypeScript + Vite + Tailwind: all of the above, plus the Phase 1 look, clock, and appearance settings (theme, accent, sidebar, sign-in background) |

## Try it on Windows

Requirements: Windows 10/11 x64, [.NET 10 SDK](https://dotnet.microsoft.com/download), Node.js 20+.
Optional (for those features): PostgreSQL, Caddy, Git, Docker Desktop, Tailscale or cloudflared.

```powershell
git clone <this repo>; cd pellas-command-center/my-private-server
./scripts/build.ps1                 # dashboard + self-contained server → publish/win-x64
./scripts/install-service.ps1       # elevated PowerShell: Windows service + LAN firewall rule
# or, without installing a service:
./publish/win-x64/MyPrivateServer.Server.exe
```

Open **http://localhost:8080** on that PC to run setup. Other devices on your network use
`http://<PC name or IP>:8080`. For access from anywhere, open **Remote Access** in the dashboard.

Development (any OS): `./scripts/dev.sh`, or `cd dashboard && npm run dev` (proxies `/api` to the server).

## Tests

```bash
dotnet test          # 49 unit + integration tests (auth, CSRF, lockout, rate limits, ACLs, uploads, secrets, parsers)
```

End-to-end runs performed during development (Linux dev container): setup through the UI, file
permissions, resumable upload, PostgreSQL app platform with row-level security and injection attempts,
Caddy hosting with rollback, a real GitHub deploy (`octocat/Spoon-Knife`), backups to an "external"
folder with checksum verification and restore, a Windows x64 publish, and the dashboard on desktop and
phone widths.

**Not verified in that environment:** running on actual Windows hardware (service, named-pipe Docker,
`Get-PhysicalDisk` media detection, DPAPI), a live tunnel connection (no Tailscale/cloudflared binaries,
and outbound UDP was blocked, so STUN correctly reported "UDP blocked"), and Docker (no daemon). Those
code paths compile and are covered by parser/unit tests, and should be exercised on a Windows PC next.

## Docs
- [Architecture](docs/ARCHITECTURE.md)
- [Remote access: methods, costs, NAT/CGNAT](docs/REMOTE-ACCESS.md)
- [Security](docs/SECURITY.md)
- [Roadmap to production (WiX installer, bundling)](docs/ROADMAP.md)

## Zero mandatory cost
The software, and every component it uses (.NET, PostgreSQL, Caddy, Git, WireGuard/Tailscale client,
Headscale, cloudflared, frp), is free. Remote access has fully self-hostable paths and a free no-account
option. Nothing requires a VPS, paid plan or domain. No AI service is used by the software.
