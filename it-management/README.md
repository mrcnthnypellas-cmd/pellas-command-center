# IT Asset, Inventory & Network Management System

A local-first internal IT system for a small company. It answers one question:

> **What IT equipment do we have, where is it, who is using it, what IP does it use, what network is it on, and which ISP/network infrastructure is involved?**

`ASSET → EMPLOYEE → LOCATION → IP → NETWORK → NETWORK DEVICE → ISP`

Everything runs on your own computer: a Node.js server plus a local SQLite database file. There's no cloud, GitHub, Vercel or Netlify involved, and it works with no internet connection.

---

## 1. Requirements

- **Node.js 20 or newer** (22 LTS recommended). Check with `node -v`. Download from https://nodejs.org
- Windows, macOS or Linux.

## 2. Install

```bash
cd it-management
npm install
```

## 3. Start

```bash
npm start
```

Then open **http://localhost:4000** in your browser.

On the first start the database is created and loaded with sample data automatically.

For development with auto-restart when server files change: `npm run dev`.

## 4. Default development accounts

| Username  | Password     | Role | What it shows |
|-----------|--------------|------|---------------|
| `admin`   | `admin123`   | Admin | Full access |
| `itstaff` | `itstaff123` | IT Staff | Asset & network management, can reveal passwords |
| `jtech`   | `jtech123`   | IT Staff (restricted) | Can't reveal passwords, except a per-credential grant on the Access Point credential |
| `viewer`  | `viewer123`  | Viewer | Read-only, no access to passwords |

These are for local testing only. Change or disable them before any real use (Settings → Users).

## 5. Reset / reload sample data

```bash
npm run db:reset
```

This deletes `data/itms.db` and uploaded files, then loads fresh sample data. Stop the server first, then start it again afterwards.

## 6. Run the automated tests

```bash
npm test
```

The tests use a temporary throwaway database and cover add/edit/retire/delete, deploy/return/transfer, history, IP/network/ISP/device management, the credential vault and permissions, maintenance, warranty, audits, QR codes, search, reports and dashboard numbers.

## 7. Browser preview build (optional)

```bash
npm run build:demo   # → demo/dist/it-manager.html
```

This builds a single self-contained HTML file that runs the same frontend and the same route code entirely in the browser. SQLite is compiled to JavaScript, and data is kept in that browser's storage. It exists so people can try the system without installing anything. The preview frame blocks file downloads and printing, so CSV exports appear on screen to copy, and PDF and printing only work in the local version. For real use, run the local version.

---

## What's included

| Area | Where |
|------|-------|
| Dashboard: asset, employee, network and alert cards, 4 charts, ISP status, recent activity | Dashboard |
| Assets: table with filters, add/edit form, full profile (Overview / Assignment / History / Maintenance / Network / Documents), QR code, retire/delete | Assets → All Assets / Add Asset |
| Automatic asset tags (`LAP-0001`, `MON-0001`, `NET-0001` …) from category prefixes | Assets → Categories, Settings → Numbering |
| **Printable QR asset stickers**: QR + large asset number, sized for A4 label sheets (21 / 14 / 65 per page) or 50×25 / 62×29 mm roll printers; Print or exact-size PDF, copies, skip used labels | Assets → QR Labels, or “Print QR label” on any asset |
| Employees with profile, assigned assets, history, printable accountability form | Employees |
| Deploy, Return (with condition/photo/status), Transfer (history is never deleted) | Assignments |
| Inventory audits: generated checklist, Found / Missing / Damaged, completion updates statuses, PDF/CSV report | Assets → Audit |
| IP address management: static/DHCP/reserved, statuses, conflict detection, next-free IP, subnet address map | Network → IP Addresses / Networks |
| Network devices with uplink topology (ISP → router → switch → AP → clients) | Network → Network Devices / Topology |
| Multiple ISPs (primary/backup), contracts, manually updated status | Network → ISPs |
| Wi-Fi networks with protected passwords | Network → Wi-Fi |
| Credential vault: AES-256-GCM encryption, Show/Copy with permission checks, per-credential grants, access log | Credentials |
| Maintenance (an open repair sets the asset to *Under Repair*; completing it restores the status) and warranty tracking (30/60/90-day filters) | Care |
| 16 reports, each with Print, PDF and Excel/CSV export | Reports |
| Activity log, including security events | Activity Logs |
| Company profile/logo, departments, locations, categories, numbering, users, roles and per-user permissions | Settings |
| Global search by tag, serial, employee, IP, MAC, device, ISP, network or location | Top search bar |

## Security (local MVP)

- **Login passwords** are hashed with scrypt. Sessions use a random token in an httpOnly cookie, and only a hash of the token is stored.
- **Credential and Wi-Fi passwords** are encrypted with AES-256-GCM before they're stored. The key is auto-generated to `data/vault.key` on first run, or you can supply `ITMS_VAULT_KEY` (64 hex characters).
- Passwords are **never** returned by list/detail APIs, search, reports or the dashboard. They're only returned by `POST /api/vault/.../secret`, which:
  - checks the `credentials.reveal` / `credentials.copy` permissions (or a per-credential grant),
  - logs "Credential revealed / copied / denied" without the secret,
  - sends `Cache-Control: no-store`.
- The activity logger also strips any password-like field.
- Role-based permissions (Admin / IT Staff / Viewer) can be overridden per user, grant or deny.
- State-changing API calls require a custom header (CSRF mitigation). Uploads are restricted by file type and size and are only served to signed-in users.
- Login attempts are throttled.

**Before going online:** use HTTPS, keep the vault key in a secrets manager or KMS, change all default accounts, add MFA/SSO, move the login throttle to a shared store, and back up the database and key together. Without the key, stored passwords can't be decrypted.

## Project structure

```
it-management/
├── server/
│   ├── index.js            # local entry point (npm start)
│   ├── app.js              # Express app (routes, security headers, error handling)
│   ├── config.js           # all environment-specific settings
│   ├── db/
│   │   ├── schema.sql      # relational schema (25+ tables)
│   │   ├── connection.js   # SQLite adapter — swap this for a cloud DB later
│   │   ├── seed.js         # realistic sample data (fake credentials only)
│   │   └── reset.js        # npm run db:reset
│   ├── lib/                # auth, permissions, vault crypto, IP math, activity log, PDF
│   └── routes/             # one module per area (assets, assignments, network, vault …)
├── public/                 # browser app (no build step): index.html, css/, js/pages/*
├── tests/system.test.js    # end-to-end API tests
└── data/                   # created at runtime: itms.db, vault.key, uploads/ (git-ignored)
```

## Configuration (optional environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | HTTP port |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` to open it from phones on your LAN (e.g. to scan QR labels). Also set Settings → Numbering → **QR link address** to this PC's network address, e.g. `http://192.168.1.50:4000` |
| `ITMS_DATA_DIR` | `./data` | Where the database, key and uploads live |
| `ITMS_VAULT_KEY` | auto file | 64-hex-char encryption key for the vault |
| `ITMS_SESSION_HOURS` | `12` | Login session length |

## Prepared for later (not implemented yet)

The architecture already leaves room for these:

- **Cloud database:** replace `server/db/connection.js`. The SQL is kept portable.
- **Multi-company:** add a `company_id` column to the top-level tables.
- **Real-time ping/SNMP monitoring:** ISPs and devices already have `status_source`, `monitor_enabled`, `monitor_target` and `snmp_community_ref` fields. Today status is `manual`, and the UI says so.
- **Email notifications and reminders for warranty/contract expiry:** the alert queries already exist in `routes/dashboard.js`.
- **Topology map:** the relationship data is already served by `GET /api/network/topology`.
- **Also possible later:** QR scanner/mobile app and employee portal (every screen is backed by a JSON API), cloud document storage (the uploads live behind `lib/util.js`), SSO (it only needs to set the same session in `lib/auth.js`), approval workflow, and backup/restore.
