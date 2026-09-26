# From prototype to production

The Phase 2 prototype runs end to end. These items remain before a public release.

## Installer (WiX Toolset)
- MSI built with WiX v5: installs the self-contained server to `Program Files`, registers the
  `MyPrivateServer` service (automatic start, restart on failure), adds Private-profile firewall rules,
  and opens `http://localhost:8080` to start the setup wizard.
- Bundled, signed components, all free and open source: PostgreSQL (EDB binaries, `initdb` into
  `D:\MyPrivateServer\Databases`, runs as its own service), Caddy, Git, cloudflared, frpc, Tailscale client (optional).
- Upgrade keeps settings and data; uninstall never deletes the storage folder.
- Code signing and automatic updates.

## Features
- Setup wizard creates the PostgreSQL instance automatically (today you connect an existing one).
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
