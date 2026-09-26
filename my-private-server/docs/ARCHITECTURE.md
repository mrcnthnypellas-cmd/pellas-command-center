# Architecture

```
Browser / phone / laptop
        │  HTTPS or WireGuard (remote)          LAN: http://PC-NAME:8080  https://PC-NAME:8443
        ▼
┌───────────────────────────── MyPrivateServer.Server (Windows service, ASP.NET Core) ──────────────────────────┐
│ Security middleware: headers · rate limits · setup gate · session auth · CSRF · capability checks · audit     │
│ React dashboard (wwwroot)                          REST API /api/*                                            │
├──────────────┬──────────┬───────┬───────────┬────────────┬─────────────┬────────────┬──────────┬─────────────┤
│ Identity     │ Storage  │ Files │ Databases │ WebHosting │ Deployments │ Containers │ Backup   │ RemoteAccess│
│ users,roles, │ drive    │ shares│ PostgreSQL│ Caddy,     │ GitHub, git,│ Docker API │ zip/dump │ providers,  │
│ sessions     │ detection│ ACLs, │ apps, data│ app procs, │ build,      │ (pipe /    │ schedule,│ supervisor, │
│              │ layout   │ upload│ API, auth │ releases   │ releases    │  socket)   │ restore  │ STUN        │
├──────────────┴──────────┴───────┴───────────┴────────────┴─────────────┴────────────┴──────────┴─────────────┤
│ Core: paths · settings (JSON) · system.db (SQLite) · audit · secrets (DPAPI) · process runner · health       │
│ Monitoring: CPU/RAM/network (Win32 / procfs) · health probes · OpenTelemetry meter · Serilog                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ child processes (argument lists, never a shell)
        ▼
  PostgreSQL · Caddy · Node/.NET apps · git/npm/dotnet · tailscale/cloudflared/frpc · Docker Engine
```

## Where data lives

| What | Where |
|---|---|
| Server settings, keys, system database, logs | `%ProgramData%\MyPrivateServer\` (`config\`, `keys\`, `system.db`, `logs\`) |
| Your data | The storage folder chosen in setup, e.g. `D:\MyPrivateServer\` → `Users`, `Shared`, `Backups`, `Databases`, `Websites`, `Applications`, `Docker`, `Deployments`, `System` |
| Backups | Any other drive, external disk or network share you choose |

Nothing is synced to a cloud. External services are optional and listed with what they receive
(*Monitoring → External services*).

## Offline first

Everything except remote access and GitHub deploys works with no Internet: files, users, databases,
websites, Docker and backups. Remote access reports `Unavailable` and reconnects when the Internet returns.

## Modules and replaceability

Each module is its own project with its own tables (`ISchemaContributor`) and health probe
(`IHealthProbe`). Remote access (`IRemoteAccessProvider`) and databases (`IDatabaseProvider`) are
interfaces with swappable implementations. Websites receive app variables through
`ISiteEnvironmentSource`.

## Deployment models

- **Fully self-hosted:** GitHub → this server (clone, build, test) → release folder → Caddy → website → PostgreSQL.
- **Hybrid with Vercel:** the frontend deploys to Vercel as usual; it calls this server's app API
  (`/api/data/{app}/…`) with a read-only API key. Add the Vercel URL under the app's *Allowed origins*.
  Data and files stay on your PC.
