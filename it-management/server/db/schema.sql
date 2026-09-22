-- IT Asset, Inventory & Network Management System — relational schema (SQLite).
-- Written in portable SQL where practical so it can be ported to Postgres/MySQL later.
-- Multi-company support later: add company_id to the top-level tables below.

PRAGMA foreign_keys = ON;

-- ───────────────────────── Security: users, roles, permissions ─────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,            -- Admin, IT Staff, Viewer
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,                 -- e.g. assets.create, credentials.reveal
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,          -- scrypt hash, never plain text
  role_id INTEGER NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'Active',-- Active / Disabled
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual overrides on top of the role: granted = 1 adds, granted = 0 removes.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256 of the cookie token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ───────────────────────── Organisation ─────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                   -- display name e.g. "Main Office - 2nd Floor"
  building TEXT,
  floor TEXT,
  room TEXT,
  address TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,   -- EMP-001
  full_name TEXT NOT NULL,
  position TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  email TEXT,
  contact_number TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Active',-- Active / On Leave / Inactive / Resigned
  photo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────────────────── Assets ─────────────────────────
CREATE TABLE IF NOT EXISTS asset_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,            -- Laptop, Monitor, Router ...
  prefix TEXT NOT NULL UNIQUE,          -- LAP, MON, NET ...
  type_group TEXT NOT NULL DEFAULT 'Other', -- Laptop/Desktop/Monitor/Printer/Network Device/Mobile/Server/Accessories/Other
  is_network INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES asset_categories(id),
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  service_tag TEXT,
  description TEXT,
  photo_path TEXT,
  supplier TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  po_number TEXT,
  invoice_number TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  current_location TEXT,                -- free-text detail ("Desk 14", "Rack A")
  mac_address TEXT,
  connected_device_id INTEGER REFERENCES network_devices(id) ON DELETE SET NULL, -- uplink switch / AP
  status TEXT NOT NULL DEFAULT 'Available', -- Available/Deployed/Under Repair/Damaged/Lost/Retired/Disposed
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);

CREATE TABLE IF NOT EXISTS warranty_records (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  provider TEXT,
  warranty_type TEXT DEFAULT 'Manufacturer', -- Manufacturer / Extended / Vendor
  start_date TEXT,
  end_date TEXT,
  reference_no TEXT,
  notes TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_warranty_asset ON warranty_records(asset_id);

-- Assignment rows are never deleted: status moves Active → Returned / Transferred.
CREATE TABLE IF NOT EXISTS asset_assignments (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  assigned_date TEXT NOT NULL,
  condition_on_assign TEXT,
  issued_by TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Active', -- Active / Returned / Transferred
  ended_date TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assign_asset ON asset_assignments(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_assign_employee ON asset_assignments(employee_id, status);

CREATE TABLE IF NOT EXISTS asset_returns (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES asset_assignments(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  return_date TEXT NOT NULL,
  condition_on_return TEXT,
  received_by TEXT,
  resulting_status TEXT NOT NULL DEFAULT 'Available',
  notes TEXT,
  photo_path TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_transfers (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_employee_id INTEGER NOT NULL REFERENCES employees(id),
  to_employee_id INTEGER NOT NULL REFERENCES employees(id),
  from_assignment_id INTEGER REFERENCES asset_assignments(id),
  to_assignment_id INTEGER REFERENCES asset_assignments(id),
  transfer_date TEXT NOT NULL,
  reason TEXT,
  approved_by TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_history (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- Purchased, Created, Assigned, Transferred, Returned, Maintenance, ...
  description TEXT NOT NULL,
  event_date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_asset ON asset_history(asset_id, event_date);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  reported_date TEXT NOT NULL,
  repair_start TEXT,
  repair_end TEXT,
  technician TEXT,
  vendor TEXT,
  repair_cost REAL,
  parts_replaced TEXT,
  status TEXT NOT NULL DEFAULT 'Reported', -- Reported/Diagnosis/Under Repair/Waiting for Parts/Completed/Unrepairable
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────────────────── Inventory audits ─────────────────────────
CREATE TABLE IF NOT EXISTS inventory_audits (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'In Progress', -- In Progress / Completed
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_items (
  id INTEGER PRIMARY KEY,
  audit_id INTEGER NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  expected_status TEXT,
  expected_location TEXT,
  expected_employee TEXT,
  result TEXT NOT NULL DEFAULT 'Pending', -- Pending / Found / Missing / Damaged
  notes TEXT,
  checked_by INTEGER REFERENCES users(id),
  checked_at TEXT,
  UNIQUE (audit_id, asset_id)
);

-- ───────────────────────── Network ─────────────────────────
CREATE TABLE IF NOT EXISTS isps (
  id INTEGER PRIMARY KEY,
  provider_name TEXT NOT NULL,          -- Converge, PLDT, Globe Business
  connection_name TEXT NOT NULL,
  connection_type TEXT,                 -- Fiber / DSL / LTE / Satellite / Leased Line
  plan TEXT,
  speed TEXT,
  public_ip TEXT,
  account_number TEXT,
  router_device_id INTEGER REFERENCES network_devices(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'Primary', -- Primary / Backup
  status TEXT NOT NULL DEFAULT 'Active',-- Active / Inactive / Down / Suspended
  status_source TEXT NOT NULL DEFAULT 'manual', -- manual now; 'monitor' when real-time checks exist
  status_updated_at TEXT,
  contract_start TEXT,
  contract_end TEXT,
  monthly_cost REAL,
  support_contact TEXT,
  support_number TEXT,
  support_email TEXT,
  notes TEXT,
  monitor_enabled INTEGER NOT NULL DEFAULT 0, -- reserved for future ping monitoring
  monitor_target TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS networks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cidr TEXT NOT NULL UNIQUE,            -- 192.168.1.0/24
  vlan_id INTEGER,
  gateway TEXT,
  dns_primary TEXT,
  dns_secondary TEXT,
  dhcp_start TEXT,
  dhcp_end TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  isp_id INTEGER REFERENCES isps(id) ON DELETE SET NULL,
  purpose TEXT,                         -- LAN / Servers / Guest / Management
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS network_devices (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                   -- "Main Router"
  device_type TEXT NOT NULL,            -- Router/Firewall/Switch/Managed Switch/Access Point/Modem/ONT/VPN Gateway/Wi-Fi Controller/Load Balancer
  asset_id INTEGER UNIQUE REFERENCES assets(id) ON DELETE SET NULL,
  network_id INTEGER REFERENCES networks(id) ON DELETE SET NULL,
  isp_id INTEGER REFERENCES isps(id) ON DELETE SET NULL,
  parent_device_id INTEGER REFERENCES network_devices(id) ON DELETE SET NULL, -- uplink (topology)
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  management_url TEXT,
  firmware_version TEXT,
  port_count INTEGER,
  status TEXT NOT NULL DEFAULT 'Active',-- Active / Inactive / Offline / Maintenance
  status_source TEXT NOT NULL DEFAULT 'manual',
  monitor_enabled INTEGER NOT NULL DEFAULT 0, -- reserved for ping/SNMP
  snmp_community_ref INTEGER,           -- reserved: would reference a credential id
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ip_addresses (
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL,
  address_num INTEGER NOT NULL,         -- numeric form for sorting / range checks
  network_id INTEGER NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  device_name TEXT,                     -- for things that are not tracked assets
  hostname TEXT,
  mac_address TEXT,
  ip_type TEXT NOT NULL DEFAULT 'Static', -- Static / DHCP / Reserved
  status TEXT NOT NULL DEFAULT 'Assigned', -- Available/Assigned/Active/Reserved/Offline/Conflict/Blocked
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (network_id, address)
);
CREATE INDEX IF NOT EXISTS idx_ip_asset ON ip_addresses(asset_id);

CREATE TABLE IF NOT EXISTS wifi_networks (
  id INTEGER PRIMARY KEY,
  ssid TEXT NOT NULL,
  password_enc TEXT,                    -- AES-256-GCM ciphertext, never plain text
  security TEXT DEFAULT 'WPA2/WPA3',
  band TEXT,                            -- 2.4 GHz / 5 GHz / Dual
  network_id INTEGER REFERENCES networks(id) ON DELETE SET NULL,
  access_point_id INTEGER REFERENCES network_devices(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  last_accessed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────────────────── Credential vault ─────────────────────────
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  credential_type TEXT NOT NULL,        -- Router/Switch/Firewall/Access Point/Server/ISP Account/Admin Account/Other
  device_id INTEGER REFERENCES network_devices(id) ON DELETE SET NULL,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  isp_id INTEGER REFERENCES isps(id) ON DELETE SET NULL,
  username TEXT,
  password_enc TEXT NOT NULL,           -- AES-256-GCM ciphertext
  management_url TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  last_accessed_at TEXT,
  last_accessed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-credential grants for users who do NOT hold the global credentials.* permission.
CREATE TABLE IF NOT EXISTS credential_permissions (
  credential_id INTEGER NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_view INTEGER NOT NULL DEFAULT 1,
  can_reveal INTEGER NOT NULL DEFAULT 0,
  can_copy INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (credential_id, user_id)
);

-- ───────────────────────── Documents & logs ─────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,            -- asset / employee / maintenance / isp ...
  entity_id INTEGER NOT NULL,
  doc_type TEXT,                        -- Receipt / Invoice / Warranty / Photo / Other
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_entity ON documents(entity_type, entity_id);

-- Never store secrets here — lib/activity.js strips password-like keys before insert.
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,                 -- "Asset created", "Credential revealed" ...
  entity_type TEXT,
  entity_id INTEGER,
  entity_label TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
