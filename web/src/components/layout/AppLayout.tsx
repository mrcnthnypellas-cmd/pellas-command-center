import { NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserCog, ClipboardList, CalendarClock, FileBarChart,
  Building2, ScrollText, Settings, LogOut, Menu, X, FileWarning, Clock,
  Search, Bell, ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import LedBanner, { useBanner } from "./LedBanner";
import { formatDateTime } from "../../lib/format";
import type { Role } from "../../types";
import type { Notification } from "../../types";

interface NavItem { to: string; label: string; title: string; icon: typeof LayoutDashboard; roles: Role[]; group: "main" | "system" }

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", title: "Overview Dashboard", icon: LayoutDashboard, roles: ["admin", "hr", "employee"], group: "main" },
  { to: "/employees", label: "Employees", title: "Employee Directory", icon: Users, roles: ["admin", "hr"], group: "main" },
  { to: "/attendance", label: "Attendance", title: "Attendance Management", icon: ClipboardList, roles: ["admin", "hr"], group: "main" },
  { to: "/my-attendance", label: "My Attendance", title: "My Attendance", icon: ClipboardList, roles: ["employee"], group: "main" },
  { to: "/corrections", label: "Corrections", title: "Attendance Corrections", icon: FileWarning, roles: ["admin", "hr", "employee"], group: "main" },
  { to: "/overtime", label: "Overtime", title: "Overtime Requests", icon: Clock, roles: ["admin", "hr", "employee"], group: "main" },
  { to: "/reports", label: "Reports", title: "Reports & Analytics", icon: FileBarChart, roles: ["admin", "hr"], group: "main" },
  { to: "/users", label: "Users", title: "User Accounts", icon: UserCog, roles: ["admin"], group: "system" },
  { to: "/departments", label: "Departments", title: "Departments", icon: Building2, roles: ["admin"], group: "system" },
  { to: "/schedules", label: "Schedules", title: "Work Schedules", icon: CalendarClock, roles: ["admin"], group: "system" },
  { to: "/audit-log", label: "Audit Logs", title: "Audit Logs", icon: ScrollText, roles: ["admin"], group: "system" },
  { to: "/settings", label: "Settings", title: "System Settings", icon: Settings, roles: ["admin"], group: "system" },
];

export function ProtectedLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const banner = useBanner();

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  if (!session || !profile) return <Navigate to="/login" replace />;

  const items = NAV.filter((i) => i.roles.includes(profile.role));
  const mainItems = items.filter((i) => i.group === "main");
  const systemItems = items.filter((i) => i.group === "system");

  return (
    <div className="min-h-screen bg-slate-50">
      <LedBanner banner={banner} />
      <div className="lg:hidden flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
        <span className="font-bold text-white">Command Center</span>
        <button onClick={() => setMobileOpen((o) => !o)} className="text-white">{mobileOpen ? <X /> : <Menu />}</button>
      </div>

      <div className="lg:flex">
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block w-full lg:w-64 shrink-0 bg-slate-900 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto`}>
          <SidebarBrand />
          <nav className="p-3 space-y-1">
            <NavGroup label="Main" items={mainItems} onNavigate={() => setMobileOpen(false)} />
            {systemItems.length > 0 && (
              <div className="pt-3">
                <NavGroup label="System" items={systemItems} onNavigate={() => setMobileOpen(false)} />
              </div>
            )}
          </nav>
          <div className="border-t border-slate-800 p-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-9 w-9 shrink-0 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold">
                {profile.first_name[0]}
                {profile.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{profile.first_name} {profile.last_name}</p>
                <p className="truncate text-xs capitalize text-slate-400">{profile.role}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <TopBar profile={profile} onSignOut={signOut} />
          <main className="p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarBrand() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [name, setName] = useState("PELLAS");

  useEffect(() => {
    supabase.from("companies").select("name, logo_url").limit(1).maybeSingle().then(({ data }) => {
      if (data?.name) setName(data.name);
      if (data?.logo_url) setLogoUrl(data.logo_url);
    });
  }, []);

  return (
    <div className="hidden lg:flex items-center gap-3 px-5 py-5 border-b border-slate-800">
      {logoUrl ? (
        <img src={logoUrl} alt="Company logo" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">
          {name[0]}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white leading-tight">{name}</p>
        <p className="truncate text-xs text-slate-400 leading-tight">Command Center</p>
      </div>
    </div>
  );
}

function NavGroup({ label, items, onNavigate }: { label: string; items: NavItem[]; onNavigate: () => void }) {
  return (
    <div>
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function TopBar({ profile, onSignOut }: { profile: NonNullable<ReturnType<typeof useAuth>["profile"]>; onSignOut: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const current = NAV.find((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`));
  const title = current?.title ?? "Overview Dashboard";
  const breadcrumb = current && current.to !== "/dashboard" ? `Dashboard / ${current.label}` : "Dashboard";
  const canSearchEmployees = profile.role === "admin" || profile.role === "hr";

  async function loadNotifications() {
    const { data, count } = await supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(6);
    setNotifications((data as Notification[]) ?? []);
    setUnreadCount((data as Notification[] | null)?.filter((n) => !n.is_read).length ?? 0);
    void count;
  }

  useEffect(() => {
    loadNotifications();
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, () => loadNotifications())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  async function markAllRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", profile.id).eq("is_read", false);
    loadNotifications();
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearchEmployees || !search.trim()) return;
    navigate(`/employees?q=${encodeURIComponent(search.trim())}`);
    setSearch("");
  }

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-slate-800 lg:text-xl">{title}</h1>
          <p className="truncate text-xs text-slate-400">{breadcrumb}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {canSearchEmployees && (
            <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees…"
                className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </form>
          )}

          <div className="relative">
            <button
              onClick={() => { setNotifOpen((o) => !o); setAvatarOpen(false); }}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Notifications</p>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs font-medium text-brand-600 hover:underline">Mark all read</button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`border-b border-slate-50 px-4 py-3 ${n.is_read ? "" : "bg-brand-50/50"}`}>
                        <p className="text-sm font-medium text-slate-800">{n.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => { setAvatarOpen((o) => !o); setNotifOpen(false); }}
              className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
            >
              <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
                {profile.first_name[0]}{profile.last_name[0]}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-tight text-slate-800">{profile.first_name} {profile.last_name}</p>
                <p className="text-xs capitalize leading-tight text-slate-400">{profile.role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {avatarOpen && (
              <div className="absolute right-0 z-40 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
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
