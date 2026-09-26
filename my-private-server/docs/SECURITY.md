# Security

| Area | What the prototype does |
|---|---|
| Passwords | PBKDF2-HMAC-SHA512 (ASP.NET Core Identity hasher), per-user salt, automatic rehash. Minimum length and character mix enforced. |
| Sign-in | Server-side sessions (only a SHA-256 of the session id is stored), idle timeout and absolute expiry, revoke from *Settings → Sessions*. Unknown usernames take the same hashing time as real ones. |
| Brute force | Per-account lockout (5 failures → 15 min, configurable) and per-IP rate limit on sign-in (10/min). Global and data-API rate limits. |
| Cookies | `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS. |
| CSRF | Double-submit token: every state-changing API call must echo the `mps_csrf` cookie in `X-MPS-CSRF`. |
| Authorization | Capability-based (`ManageUsers`, `WriteFiles`, `ManageDatabases`…) mapped from roles Administrator, Developer, User, Read only. Every endpoint declares its capability. |
| File access | Virtual paths only. Names validated (no `..`, reserved Windows names, ADS `:`), resolved paths proven inside the root, symlinks/junctions refused. Per-folder rules for people/roles, most specific wins, read-only role capped. |
| Previews | Only safe types inline; HTML/SVG/JS are always downloaded. Previews carry `Content-Security-Policy: sandbox`. |
| Headers | CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, HSTS on HTTPS. |
| Secrets | Database passwords, GitHub tokens, tunnel keys and app variables are encrypted with ASP.NET Data Protection; on Windows the keys are wrapped with machine DPAPI. Secrets are never sent back to the browser; reveals are audited. |
| Database | Identifiers validated and quoted, values always parameters. Each app runs as its own least-privilege role. App-user tokens enable PostgreSQL row-level security. Front-end builds only receive `VITE_`/`NEXT_PUBLIC_`/`REACT_APP_`/`PUBLIC_` variables. |
| Docker | Local socket/pipe only; no privileged containers, no host network, `no-new-privileges`, volumes limited to the server's Docker folder. Removal is admin-only. |
| Webhooks | GitHub `X-Hub-Signature-256` HMAC verified in constant time. |
| Setup | Allowed from this PC (loopback) or with a one-time setup code file, and only once. |
| Local HTTPS | Self-signed certificate generated on first run (browsers ask once to trust it). Remote methods add WireGuard or TLS. |
| Audit | Sign-ins, failures, lockouts, file changes, permission changes, credential reveals, deployments, backups and settings are logged. |

Verified by the test suite (`dotnet test`): CSRF enforcement, lockout, rate limiting, privilege
escalation attempts, folder-rule isolation, path traversal, symlink escape, secrets-at-rest, CSP, and
remote status honesty.

**Before production:** external penetration test, signed binaries, automatic updates, optional 2FA
(TOTP), and ACME certificates for custom domains.
