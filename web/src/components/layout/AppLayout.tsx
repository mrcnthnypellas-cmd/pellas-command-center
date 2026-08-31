import { NavLink, Outlet, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserCog, ClipboardList, CalendarClock, FileBarChart,
  Building2, ScrollText, Settings, LogOut, Menu, X, FileWarning,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Role } from "../../types";

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "hr", "employee"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
  { to: "/employees", label: "Employees", icon: Users, roles: ["admin", "hr"] },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, roles: ["admin", "hr"] },
  { to: "/my-attendance", label: "My Attendance", icon: ClipboardList, roles: ["employee"] },
  { to: "/corrections", label: "Corrections", icon: FileWarning, roles: ["admin", "hr", "employee"] },
  { to: "/departments", label: "Departments", icon: Building2, roles: ["admin"] },
  { to: "/schedules", label: "Schedules", icon: CalendarClock, roles: ["admin"] },
  { to: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin", "hr"] },
  { to: "/audit-log", label: "Audit Logs", icon: ScrollText, roles: ["admin"] },
  { to: "/settings", label: "System Settings", icon: Settings, roles: ["admin"] },
];

export function ProtectedLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  if (!session || !profile) return <Navigate to="/login" replace />;

  const items = NAV.filter((i) => i.roles.includes(profile.role));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="lg:hidden flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-bold text-brand-700">Attendance System</span>
        <button onClick={() => setMobileOpen((o) => !o)}>{mobileOpen ? <X /> : <Menu />}</button>
      </div>

      <div className="lg:flex">
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block w-full lg:w-64 shrink-0 border-r border-slate-200 bg-white lg:min-h-screen`}>
          <div className="hidden lg:flex items-center gap-2 px-5 py-5 border-b border-slate-100">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">A</div>
            <span className="font-bold text-slate-800">Attendance System</span>
          </div>
          <nav className="p-3 space-y-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-9 w-9 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold">
                {profile.first_name[0]}
                {profile.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{profile.first_name} {profile.last_name}</p>
                <p className="truncate text-xs capitalize text-slate-500">{profile.role}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!roles.includes(profile.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-800">Access denied</h2>
        <p className="mt-1 text-sm text-slate-500">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
