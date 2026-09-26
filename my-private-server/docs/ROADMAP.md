# From prototype to production

The Phase 2 prototype runs end to end. These items remain before a public release.

## Installer (WiX Toolset)
- Done: MSI built with WiX v5 (`installer/`): self-contained server in `Program Files`, `MyPrivateServer`
  service (automatic delayed start, restart on failure), Private-profile firewall rules, Start-menu link,
  bundled PostgreSQL, Caddy, MinGit, Node.js, cloudflared and frpc with pinned checksums, and a setup wizard that
  creates the database server itself. Upgrades keep settings and data; uninstall never deletes the storage folder.
- Done: one-command build + install + end-to-end self-test on a Windows PC (`installer/build-installer.ps1 -Install -Test`).
- Pending: first verified run on real Windows 10/11 hardware (the MSI cannot be built on Linux).
- Pending: code signing (a certificate costs money, so it stays optional) and automatic updates.
- Optional: the Tailscale client is not bundled (it has its own installer); install it separately to use the mesh provider.

## Features
- Two-factor authentication (TOTP) and passkeys.
- ACME/Let's Encrypt certificates for optional custom domains; `tailscale cert` for mesh names.
- SMB/Windows network share of selected folders; WebDAV for phone apps.
- File versioning, thumbnails, sharing links with expiry.
- Docker Compose projects in the dashboard.
- Built-in relay option (a small open-source relay you can run anywhere) as another provider.
- Notifications (desktop, email via your own SMTP).
- Windows tray app showing status and the setup code.

## Hardening
- External security review / penetration test.
- Fuzzing of path handling and the data API.
- Long-running soak tests on Windows 10/11 with HDD, SSD, USB disks, and unplug scenarios.
