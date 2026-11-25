import type { DB, Role, User } from './types';

export type ModuleKey =
  | 'dashboard'
  | 'inquiries'
  | 'chat'
  | 'customers'
  | 'services'
  | 'portfolio'
  | 'blog'
  | 'quotations'
  | 'projects'
  | 'tracking'
  | 'appointments'
  | 'ai'
  | 'notifications'
  | 'reports'
  | 'users'
  | 'content'
  | 'settings'
  | 'guide';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  path: string;
  icon: string;
  group: 'Overview' | 'Customers & Sales' | 'Delivery' | 'Website' | 'System';
  roles: Role[];
}

const ALL: Role[] = ['super_admin', 'admin', 'staff'];
const MGMT: Role[] = ['super_admin', 'admin'];

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard', group: 'Overview', roles: ALL },
  { key: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: 'Bell', group: 'Overview', roles: ALL },
  { key: 'reports', label: 'Reports & Analytics', path: '/admin/reports', icon: 'BarChart3', group: 'Overview', roles: MGMT },
  { key: 'inquiries', label: 'Inquiries', path: '/admin/inquiries', icon: 'Inbox', group: 'Customers & Sales', roles: ALL },
  { key: 'chat', label: 'Live Chat', path: '/admin/chat', icon: 'MessagesSquare', group: 'Customers & Sales', roles: ALL },
  { key: 'customers', label: 'Customers', path: '/admin/customers', icon: 'Users', group: 'Customers & Sales', roles: MGMT },
  { key: 'quotations', label: 'Quotations', path: '/admin/quotations', icon: 'FileText', group: 'Customers & Sales', roles: MGMT },
  { key: 'appointments', label: 'Appointments', path: '/admin/appointments', icon: 'CalendarDays', group: 'Customers & Sales', roles: ALL },
  { key: 'projects', label: 'Projects', path: '/admin/projects', icon: 'FolderKanban', group: 'Delivery', roles: ALL },
  { key: 'tracking', label: 'Project Tracking', path: '/admin/tracking', icon: 'Radar', group: 'Delivery', roles: ALL },
  { key: 'content', label: 'Website Content', path: '/admin/content', icon: 'PanelsTopLeft', group: 'Website', roles: MGMT },
  { key: 'services', label: 'Services', path: '/admin/services', icon: 'Layers', group: 'Website', roles: MGMT },
  { key: 'portfolio', label: 'Portfolio', path: '/admin/portfolio', icon: 'Images', group: 'Website', roles: MGMT },
  { key: 'blog', label: 'Blog & News', path: '/admin/blog', icon: 'Newspaper', group: 'Website', roles: MGMT },
  { key: 'ai', label: 'AI Assistant', path: '/admin/ai', icon: 'Bot', group: 'Website', roles: MGMT },
  { key: 'users', label: 'Users & Roles', path: '/admin/users', icon: 'ShieldCheck', group: 'System', roles: ['super_admin'] },
  { key: 'settings', label: 'Business Settings', path: '/admin/settings', icon: 'Settings', group: 'System', roles: MGMT },
  { key: 'guide', label: 'Prototype Guide', path: '/admin/guide', icon: 'BookOpen', group: 'System', roles: ALL },
];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Administrator',
  admin: 'Administrator',
  staff: 'Staff',
};

export const can = (u: User | null, key: ModuleKey) => !!u && MODULES.find((m) => m.key === key)!.roles.includes(u.role);

/** Capability matrix displayed in Users & Roles (and enforced in UI). */
export const CAPABILITIES: { label: string; super_admin: boolean | string; admin: boolean | string; staff: boolean | string; customer: boolean | string }[] = [
  { label: 'View dashboard & KPIs', super_admin: true, admin: true, staff: 'Own work only', customer: false },
  { label: 'Inquiries', super_admin: true, admin: true, staff: 'Assigned only', customer: 'Submit only' },
  { label: 'Live chat', super_admin: true, admin: true, staff: 'Assigned + unassigned', customer: 'Own conversations' },
  { label: 'Customer database', super_admin: true, admin: true, staff: false, customer: false },
  { label: 'Quotations (create / send)', super_admin: true, admin: true, staff: false, customer: 'View & approve own' },
  { label: 'Projects', super_admin: true, admin: true, staff: 'Assigned only', customer: 'Track own (ref + PIN)' },
  { label: 'Appointments', super_admin: true, admin: true, staff: 'Assigned only', customer: 'Book only' },
  { label: 'Website content, services, portfolio, blog', super_admin: true, admin: true, staff: false, customer: false },
  { label: 'AI assistant configuration', super_admin: true, admin: true, staff: false, customer: false },
  { label: 'Reports & exports', super_admin: true, admin: true, staff: false, customer: false },
  { label: 'Business settings', super_admin: true, admin: true, staff: false, customer: false },
  { label: 'User management & roles', super_admin: true, admin: false, staff: false, customer: false },
  { label: 'Audit log', super_admin: true, admin: 'View', staff: false, customer: false },
  { label: 'Reset prototype data', super_admin: true, admin: false, staff: false, customer: false },
];

// ── Row-level scoping (mirrors planned Supabase RLS policies) ───────────────
export const scopeInquiries = (db: DB, u: User) => (u.role === 'staff' ? db.inquiries.filter((i) => i.assignedTo === u.id) : db.inquiries);
export const scopeProjects = (db: DB, u: User) => (u.role === 'staff' ? db.projects.filter((p) => p.managerId === u.id || p.staffIds.includes(u.id)) : db.projects);
export const scopeAppointments = (db: DB, u: User) => (u.role === 'staff' ? db.appointments.filter((a) => a.assignedTo === u.id) : db.appointments);
export const scopeConversations = (db: DB, u: User) => (u.role === 'staff' ? db.conversations.filter((c) => !c.assignedTo || c.assignedTo === u.id) : db.conversations);
