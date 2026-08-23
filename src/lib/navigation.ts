import type { Role } from '@prisma/client';
import {
  LayoutDashboard,
  Users,
  Clock,
  Wallet,
  Laptop,
  FolderOpen,
  Calendar,
  Building2,
  Receipt,
  Bell,
  ExternalLink,
  Mail,
  BarChart3,
  Building,
  Settings,
  Megaphone,
  ClipboardList,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Sidebar visibility is cosmetic only — every href behind it is still protected by
// requireAbility()/withCompanyScope() server-side. Hiding a link never substitutes
// for an access check (spec §5.2).
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Companies', href: '/dashboard/companies', icon: Building },
    { label: 'Users', href: '/dashboard/users', icon: Users },
    { label: 'Announcements', href: '/dashboard/announcements', icon: Megaphone },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Audit Log', href: '/dashboard/audit-log', icon: FolderOpen },
    { label: 'Mondelez Attendance', href: '/dashboard/mondelez-attendance', icon: ClipboardList },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    { label: 'Platform Settings', href: '/dashboard/settings', icon: Settings },
  ],
  COMPANY_ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', href: '/dashboard/employees', icon: Users },
    { label: 'Announcements', href: '/dashboard/announcements', icon: Megaphone },
    { label: 'Attendance', href: '/dashboard/attendance', icon: Clock },
    { label: 'Mondelez Attendance', href: '/dashboard/mondelez-attendance', icon: ClipboardList },
    { label: 'Payroll', href: '/dashboard/payroll', icon: Wallet },
    { label: 'IT Assets', href: '/dashboard/it-assets', icon: Laptop },
    { label: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
    { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { label: 'Clients', href: '/dashboard/clients', icon: Building2 },
    { label: 'Transactions', href: '/dashboard/transactions', icon: Receipt },
    { label: 'Email', href: '/dashboard/email', icon: Mail },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Gov Services', href: '/dashboard/gov-services', icon: ExternalLink },
  ],
  HR_ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', href: '/dashboard/employees', icon: Users },
    { label: 'Attendance', href: '/dashboard/attendance', icon: Clock },
    { label: 'Mondelez Attendance', href: '/dashboard/mondelez-attendance', icon: ClipboardList },
    { label: 'Payroll', href: '/dashboard/payroll', icon: Wallet },
    { label: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
    { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Gov Services', href: '/dashboard/gov-services', icon: ExternalLink },
    { label: 'Dashboard Banner', href: '/dashboard/settings', icon: Settings },
  ],
  IT_ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'IT Assets', href: '/dashboard/it-assets', icon: Laptop },
    { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Gov Services', href: '/dashboard/gov-services', icon: ExternalLink },
    { label: 'Dashboard Banner', href: '/dashboard/settings', icon: Settings },
  ],
  EMPLOYEE: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'My Attendance', href: '/dashboard/my-attendance', icon: Clock },
    { label: 'My Payslip', href: '/dashboard/my-payslip', icon: Wallet },
    { label: 'My Assets', href: '/dashboard/my-assets', icon: Laptop },
    { label: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
    { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    { label: 'Gov Services', href: '/dashboard/gov-services', icon: ExternalLink },
  ],
  CLIENT: [
    { label: 'Dashboard', href: '/portal', icon: LayoutDashboard },
    { label: 'Transactions', href: '/portal/transactions', icon: Receipt },
    { label: 'Documents', href: '/portal/documents', icon: FolderOpen },
    { label: 'Messages', href: '/portal/messages', icon: Mail },
  ],
};

export function navForRole(role: Role): NavItem[] {
  return NAV_BY_ROLE[role];
}

export { Bell };
