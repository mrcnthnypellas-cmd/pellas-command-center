// Permission catalogue + default role grants. Seeded into the permissions tables;
// individual users can be granted/denied any of these on top of their role.
const PERMISSIONS = [
  ['dashboard.view', 'Dashboard', 'View dashboard'],
  ['assets.view', 'Assets', 'View assets'],
  ['assets.create', 'Assets', 'Create assets'],
  ['assets.edit', 'Assets', 'Edit assets'],
  ['assets.retire', 'Assets', 'Retire / delete assets'],
  ['assets.assign', 'Assets', 'Deploy, return and transfer assets'],
  ['employees.view', 'Employees', 'View employees'],
  ['employees.manage', 'Employees', 'Create / edit employees'],
  ['directory.view', 'Phone Directory', 'View and export the phone directory'],
  ['directory.manage', 'Phone Directory', 'Add, edit and delete phone directory contacts'],
  ['maintenance.view', 'Maintenance', 'View maintenance & warranty'],
  ['maintenance.manage', 'Maintenance', 'Manage maintenance & warranty'],
  ['audits.view', 'Audit', 'View inventory audits'],
  ['audits.manage', 'Audit', 'Run inventory audits'],
  ['network.view', 'Network', 'View IPs, networks, devices, ISPs'],
  ['network.manage', 'Network', 'Manage IPs, networks, devices, ISPs'],
  ['wifi.view', 'Wi-Fi', 'View Wi-Fi networks (password hidden)'],
  ['wifi.manage', 'Wi-Fi', 'Create / edit Wi-Fi networks'],
  ['credentials.view', 'Credentials', 'View credential entries (password hidden)'],
  ['credentials.reveal', 'Credentials', 'Reveal passwords (credentials & Wi-Fi)'],
  ['credentials.copy', 'Credentials', 'Copy passwords (credentials & Wi-Fi)'],
  ['credentials.create', 'Credentials', 'Create credentials'],
  ['credentials.edit', 'Credentials', 'Edit credentials'],
  ['credentials.delete', 'Credentials', 'Delete credentials'],
  ['reports.view', 'Reports', 'View reports'],
  ['reports.export', 'Reports', 'Export / print reports'],
  ['activity.view', 'Activity', 'View activity logs'],
  ['documents.upload', 'Documents', 'Upload / delete documents'],
  ['settings.manage', 'Settings', 'Manage company settings, departments, locations, categories'],
  ['users.manage', 'Users', 'Manage users, roles and permissions'],
];

const ALL = PERMISSIONS.map((p) => p[0]);

const ROLE_DEFAULTS = {
  Admin: ALL,
  'IT Staff': ALL.filter((k) => !['users.manage', 'settings.manage', 'credentials.delete'].includes(k)),
  Viewer: ALL.filter((k) => k.endsWith('.view') && !k.startsWith('credentials.')),
};

module.exports = { PERMISSIONS, ALL, ROLE_DEFAULTS };
