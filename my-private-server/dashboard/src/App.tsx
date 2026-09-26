import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity, Boxes, Cloud, Database, FolderOpen, GitBranch, Globe, HardDrive, LayoutDashboard, LogOut, Menu, Moon, Palette,
  ScrollText, Settings as SettingsIcon, Shield, Sun, Users as UsersIcon, Archive, Code2,
} from "lucide-react";
import { api, ApiError } from "./api";
import { applyAppearance, isDark, loadAppearance, saveAppearance, type Appearance } from "./appearance";
import { Session, useSession, type Me } from "./session";
import { ToastProvider, cx } from "./ui";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import FilesPage from "./pages/Files";
import UsersPage from "./pages/Users";
import SharesPage from "./pages/Shares";
import StoragePage from "./pages/Storage";
import DatabasePage from "./pages/Database";
import AppsPage from "./pages/Apps";
import WebsitesPage from "./pages/Websites";
import GitHubPage from "./pages/GitHub";
import DockerPage from "./pages/Docker";
import BackupsPage from "./pages/Backups";
import RemotePage from "./pages/Remote";
import MonitoringPage from "./pages/Monitoring";
import LogsPage from "./pages/Logs";
import SettingsPage from "./pages/Settings";

export const NAV: { section: string; items: { to: string; label: string; icon: any; cap?: string }[] }[] = [
  { section: "Overview", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }] },
  { section: "Files", items: [
    { to: "/files", label: "File Manager", icon: FolderOpen, cap: "UseFiles" },
    { to: "/shares", label: "Shared Folders", icon: Shield, cap: "ManageShares" },
    { to: "/storage", label: "Storage", icon: HardDrive, cap: "ViewMonitoring" },
  ] },
  { section: "Access", items: [
    { to: "/users", label: "Users", icon: UsersIcon, cap: "ManageUsers" },
    { to: "/remote", label: "Remote Access", icon: Globe, cap: "ManageRemoteAccess" },
  ] },
  { section: "Develop", items: [
    { to: "/database", label: "Database", icon: Database, cap: "ManageDatabases" },
    { to: "/apps", label: "Apps & API", icon: Code2, cap: "UseApps" },
    { to: "/websites", label: "Websites", icon: Cloud, cap: "ManageWebsites" },
    { to: "/github", label: "GitHub & Deploy", icon: GitBranch, cap: "ManageDeployments" },
    { to: "/docker", label: "Docker", icon: Boxes, cap: "ManageContainers" },
  ] },
  { section: "System", items: [
    { to: "/backups", label: "Backups", icon: Archive, cap: "ManageBackups" },
    { to: "/monitoring", label: "Monitoring", icon: Activity, cap: "ViewMonitoring" },
    { to: "/logs", label: "Activity Logs", icon: ScrollText, cap: "ViewAuditLogs" },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ] },
];

const TITLES: Record<string, [string, string]> = {
  "/": ["Dashboard", "Server overview and live status"], "/files": ["File Manager", "Browse and manage files on this server"],
  "/shares": ["Shared Folders", "Choose who can open each folder"], "/storage": ["Storage", "Drives and the storage folder"],
  "/users": ["Users", "Accounts that can sign in"], "/remote": ["Remote Access", "Reach this server from anywhere, without port forwarding"],
  "/database": ["Database", "PostgreSQL on this server"], "/apps": ["Apps & API", "Self-hosted backend for your websites and mobile apps"],
  "/websites": ["Websites", "Sites and apps served by this server"], "/github": ["GitHub & Deploy", "Build and deploy from your repositories"],
  "/docker": ["Docker", "Containers running on this PC"], "/backups": ["Backups", "Local backups to another drive or network share"],
  "/monitoring": ["Monitoring", "Performance and service health"], "/logs": ["Activity Logs", "Everything that happened on this server"],
  "/settings": ["Settings", "Server, security and appearance"],
};

type Phase = { kind: "loading" } | { kind: "setup" } | { kind: "login" } | { kind: "app"; me: Me };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [server, setServer] = useState({ name: "My Private Server", id: "" });
  const [appearance, setAppearanceState] = useState<Appearance>(loadAppearance);

  const setAppearance = useCallback((a: Appearance) => { setAppearanceState(a); applyAppearance(a); saveAppearance(a); }, []);
  const refreshServer = useCallback(async () => {
    const s = await api("/api/setup/status");
    setServer({ name: s.serverName, id: s.serverId });
    return s;
  }, []);

  const boot = useCallback(async () => {
    try {
      const s = await refreshServer();
      if (!s.setupCompleted) return setPhase({ kind: "setup" });
      try { setPhase({ kind: "app", me: await api<Me>("/api/auth/me") }); }
      catch (e) { if (e instanceof ApiError && e.status === 401) setPhase({ kind: "login" }); else throw e; }
    } catch { setTimeout(boot, 3000); }
  }, [refreshServer]);

  useEffect(() => { boot(); }, [boot]);
  useEffect(() => {
    const out = () => setPhase((p) => (p.kind === "app" ? { kind: "login" } : p));
    const setup = () => setPhase({ kind: "setup" });
    window.addEventListener("mps:unauthorized", out); window.addEventListener("mps:setup-required", setup);
    const mq = matchMedia("(prefers-color-scheme: dark)"); const re = () => applyAppearance(loadAppearance());
    mq.addEventListener("change", re);
    return () => { window.removeEventListener("mps:unauthorized", out); window.removeEventListener("mps:setup-required", setup); mq.removeEventListener("change", re); };
  }, []);

  const logout = useCallback(async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ } setPhase({ kind: "login" }); }, []);

  return (
    <ToastProvider>
      {phase.kind === "loading" && <div className="grid h-full place-items-center text-muted">Connecting to the server…</div>}
      {phase.kind === "setup" && <Setup onDone={() => { refreshServer(); setPhase({ kind: "login" }); }} />}
      {phase.kind === "login" && <Login serverName={server.name} serverId={server.id} appearance={appearance} setAppearance={setAppearance} onLogin={(me) => setPhase({ kind: "app", me })} />}
      {phase.kind === "app" && (
        <Session.Provider value={{
          me: phase.me, serverName: server.name, serverId: server.id, logout, appearance, setAppearance,
          can: (c) => phase.me.capabilities.includes(c), refreshServer: () => { refreshServer(); },
        }}>
          <BrowserRouter><Shell /></BrowserRouter>
        </Session.Provider>
      )}
    </ToastProvider>
  );
}


function Shell() {
  const s = useSession();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const base = "/" + (loc.pathname.split("/")[1] ?? "");
  const [title, sub] = TITLES[base] ?? ["My Private Server", ""];
  const allowed = (cap?: string) => !cap || s.can(cap);

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-[272px] max-w-[86vw] flex-col border-r border-side-line bg-side text-side-ink transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0", open ? "translate-x-0 shadow-2xl" : "-translate-x-full")}>
        <div className="flex items-center gap-3 border-b border-side-line px-4.5 py-4">
          <div className="logo grid h-[34px] w-[34px] flex-none place-content-center gap-[3px] rounded-lg px-2">{[0, 1, 2].map((i) => <i key={i} className="block h-1 w-[18px] rounded-sm bg-white/90" />)}</div>
          <div className="min-w-0"><b className="block text-[13.5px] leading-tight text-white [overflow-wrap:anywhere]">{s.serverName}</b><span className="block text-[11.5px] text-side-muted">Server ID {s.serverId}</span></div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
          {NAV.map((sec) => {
            const items = sec.items.filter((i) => allowed(i.cap));
            if (!items.length) return null;
            return (
              <div key={sec.section}>
                <div className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] uppercase tracking-[.09em] text-side-muted">{sec.section}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === "/"}
                    className={({ isActive }) => cx("relative flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[13.5px] no-underline hover:bg-side-2 hover:text-white",
                      isActive ? "bg-side-3 text-white before:absolute before:-left-2.5 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-side-accent" : "text-side-ink")}>
                    <i.icon size={18} strokeWidth={1.8} className="opacity-85" />{i.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-side-line px-4 py-3 text-[11.5px] text-side-muted">My Private Server 0.2 · prototype</div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[60px] items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:px-7">
          <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-lg font-semibold">{title}</h1>
            <p className="m-0 hidden truncate text-[12.5px] text-muted sm:block">{sub}</p>
          </div>
          <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-2 px-3 py-1 text-[12.5px]"><span className="pulse h-2 w-2 rounded-full bg-ok" /><span className="hidden sm:inline">Online</span></span>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Switch theme"
            onClick={() => s.setAppearance({ ...s.appearance, mode: isDark() ? "light" : "dark" })}>{isDark() ? <Sun size={19} /> : <Moon size={19} />}</button>
          <NavLink to="/settings#appearance" className="hidden h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 sm:grid" aria-label="Appearance"><Palette size={19} /></NavLink>
          <div className="flex items-center gap-2 pl-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{s.me.displayName.slice(0, 2).toUpperCase()}</span>
            <span className="hidden text-[13px] md:inline">{s.me.username}</span>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" onClick={s.logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
          </div>
        </header>
        <main className="w-full max-w-[1480px] px-4 pb-14 pt-4 lg:px-7 lg:pt-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {allowed("UseFiles") && <Route path="/files" element={<FilesPage />} />}
            {allowed("ManageShares") && <Route path="/shares" element={<SharesPage />} />}
            {allowed("ViewMonitoring") && <Route path="/storage" element={<StoragePage />} />}
            {allowed("ManageUsers") && <Route path="/users" element={<UsersPage />} />}
            {allowed("ManageRemoteAccess") && <Route path="/remote" element={<RemotePage />} />}
            {allowed("ManageDatabases") && <Route path="/database" element={<DatabasePage />} />}
            {allowed("UseApps") && <Route path="/apps" element={<AppsPage />} />}
            {allowed("ManageWebsites") && <Route path="/websites" element={<WebsitesPage />} />}
            {allowed("ManageDeployments") && <Route path="/github" element={<GitHubPage />} />}
            {allowed("ManageContainers") && <Route path="/docker" element={<DockerPage />} />}
            {allowed("ManageBackups") && <Route path="/backups" element={<BackupsPage />} />}
            {allowed("ViewMonitoring") && <Route path="/monitoring" element={<MonitoringPage />} />}
            {allowed("ViewAuditLogs") && <Route path="/logs" element={<LogsPage />} />}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

