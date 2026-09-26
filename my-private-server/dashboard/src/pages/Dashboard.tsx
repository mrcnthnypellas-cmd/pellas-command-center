import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Archive, Boxes, Cloud, Code2, Database, FolderOpen, GitBranch, Globe, HardDrive, Settings, Users } from "lucide-react";
import { api, fmtBytes, fmtDuration } from "../api";
import { useSession } from "../session";
import { Card, Dot, Meter, PageError, Pill, Sparkline, cx, useLoad } from "../ui";

const APPS = [
  { to: "/files", label: "File Manager", icon: FolderOpen, cap: "UseFiles", tone: "bg-[#fbefd6] text-[#a2680f]" },
  { to: "/users", label: "Users", icon: Users, cap: "ManageUsers", tone: "bg-info-soft text-info" },
  { to: "/storage", label: "Storage", icon: HardDrive, cap: "ViewMonitoring", tone: "bg-accent-soft text-accent" },
  { to: "/database", label: "Database", icon: Database, cap: "ManageDatabases", tone: "bg-vio-soft text-vio" },
  { to: "/websites", label: "Websites", icon: Cloud, cap: "ManageWebsites", tone: "bg-info-soft text-info" },
  { to: "/github", label: "GitHub", icon: GitBranch, cap: "ManageDeployments", tone: "bg-surface-3 text-ink" },
  { to: "/apps", label: "Apps & API", icon: Code2, cap: "UseApps", tone: "bg-ok-soft text-ok" },
  { to: "/docker", label: "Docker", icon: Boxes, cap: "ManageContainers", tone: "bg-info-soft text-info" },
  { to: "/backups", label: "Backups", icon: Archive, cap: "ManageBackups", tone: "bg-ok-soft text-ok" },
  { to: "/remote", label: "Remote Access", icon: Globe, cap: "ManageRemoteAccess", tone: "bg-accent-soft text-accent" },
  { to: "/monitoring", label: "Monitoring", icon: Activity, cap: "ViewMonitoring", tone: "bg-warn-soft text-warn" },
  { to: "/settings", label: "Settings", icon: Settings, tone: "bg-surface-3 text-ink-2" },
];

function Clock() {
  const [now, setNow] = useState(new Date());
  const [h24, setH24] = useState(() => { try { return localStorage.getItem("mps-clock24") === "1"; } catch { return false; } });
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const s = useSession();
  const h = now.getHours();
  const hh = String(h24 ? h : h % 12 || 12).padStart(2, "0");
  const off = -now.getTimezoneOffset();
  const tz = `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")}:${String(Math.abs(off) % 60).padStart(2, "0")} · ${Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}`;
  const set = (v: boolean) => { setH24(v); try { localStorage.setItem("mps-clock24", v ? "1" : "0"); } catch { /* ignore */ } };
  return (
    <section className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[10px] border border-line bg-[linear-gradient(110deg,var(--accent-soft),var(--surface)_55%)] px-5.5 py-4.5">
      <div className="min-w-0 flex-[1_1_320px]">
        <div className="num flex flex-wrap items-baseline font-mono text-[clamp(40px,6vw,64px)] font-semibold leading-none tracking-tight" role="timer">
          {hh}<span className="blink text-accent">:</span>{String(now.getMinutes()).padStart(2, "0")}
          <span className="ml-1.5 text-[.45em] text-muted">{String(now.getSeconds()).padStart(2, "0")}</span>
          {!h24 && <span className="ml-2.5 self-center font-sans text-[.3em] font-bold tracking-[.08em] text-accent">{h < 12 ? "AM" : "PM"}</span>}
        </div>
        <div className="mt-2 text-[15px] font-medium text-ink-2">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
      </div>
      <div className="grid justify-items-start gap-2 md:justify-items-end md:text-right">
        <b className="text-base">{h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, {s.me.displayName}</b>
        <span className="text-[12.5px] text-muted">Server time · {tz}</span>
        <div className="inline-flex overflow-hidden rounded-[7px] border border-line-2 bg-surface text-[12.5px]">
          {[false, true].map((v) => <button key={String(v)} onClick={() => set(v)} className={cx("px-3 py-1.5", h24 === v ? "bg-accent-soft font-semibold text-accent" : "text-ink-2")}>{v ? "24-hour" : "12-hour"}</button>)}
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const s = useSession();
  const { data, error, reload } = useLoad(() => api("/api/dashboard"), [], 5000);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  useEffect(() => { if (data) setCpuHist((h) => [...h.slice(-59), data.cpu]); }, [data]);
  const mem = data ? (data.memory.total ? (data.memory.used / data.memory.total) * 100 : 0) : 0;
  const st = data?.storage;
  const used = st ? st.totalBytes - st.freeBytes : 0;
  const remote = data?.remote;
  const remoteTone = remote?.state === "Connected" ? "ok" : remote?.state === "Disabled" ? "none" : "warn";

  return (
    <>
      <Clock />
      {error && <div className="mb-4"><PageError error={error} retry={reload} /></div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="My Private Server" icon={<Activity size={15} />} actions={<Pill tone="acc" dot>Live</Pill>}>
          <div className="grid gap-3.5 font-mono text-[13.5px]">
            <Row label="Server Status"><span className="flex items-center gap-2 font-sans font-semibold text-ok"><Dot tone="ok" pulse /> ONLINE</span></Row>
            <Row label="Remote Access">
              <span className={cx("flex items-center gap-2 font-sans font-semibold", remoteTone === "ok" ? "text-ok" : remoteTone === "warn" ? "text-warn" : "text-muted")}>
                <Dot tone={remoteTone as any} pulse={remoteTone === "ok"} />{remote ? (remote.state === "Disabled" ? "OFF (local only)" : remote.state.toUpperCase()) : "…"}
                {remote?.state === "Connected" && <span className="font-normal text-muted">· {remote.method}</span>}
              </span>
            </Row>
            <Row label="Storage">{st?.online ? `${fmtBytes(used)} / ${fmtBytes(st.totalBytes)}` : st ? <span className="font-sans text-bad">Offline</span> : "…"}</Row>
            <Row label="CPU"><span className="num">{data ? `${Math.round(data.cpu)}%` : "…"}</span></Row>
            <Row label="RAM"><span className="num">{data ? `${Math.round(mem)}%` : "…"}</span> <span className="font-sans text-muted">{data && `${fmtBytes(data.memory.used)} of ${fmtBytes(data.memory.total)}`}</span></Row>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1 flex justify-between text-xs text-muted"><span>CPU</span><span>last 5 min</span></div><Sparkline values={cpuHist} max={100} /></div>
            <div className="grid content-start gap-2.5">
              <div className="grid gap-1"><div className="flex justify-between text-[12.5px]"><span className="text-ink-2">Memory</span><b className="num">{Math.round(mem)}%</b></div><Meter pct={mem} tone="info" /></div>
              <div className="grid gap-1"><div className="flex justify-between text-[12.5px]"><span className="text-ink-2">Storage</span><b className="num">{st?.totalBytes ? Math.round((used / st.totalBytes) * 100) : 0}%</b></div><Meter pct={st?.totalBytes ? (used / st.totalBytes) * 100 : 0} /></div>
              <div className="text-xs text-muted">Uptime {data ? fmtDuration(data.server.uptime) : "…"} · Server ID <span className="font-mono">{s.serverId}</span></div>
            </div>
          </div>
        </Card>

        <Card title="Services" icon={<Activity size={15} />} actions={s.can("ViewMonitoring") ? <Link className="text-[12.5px] text-accent" to="/monitoring">Details</Link> : undefined} pad={false}>
          <ul className="m-0 list-none p-0">
            {(data?.health ?? []).map((h: any) => (
              <li key={h.name} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                <Dot tone={h.state === "Healthy" ? "ok" : h.state === "Disabled" ? "none" : h.state === "Degraded" ? "warn" : "bad"} />
                <span className="flex-1 font-medium">{h.name}</span>
                <span className="text-right text-[12.5px] text-muted">{h.summary}</span>
              </li>
            ))}
            {data && data.health.length === 0 && <li className="px-4 py-3 text-muted">Signed in as {s.me.role}.</li>}
          </ul>
          {data?.local?.length > 0 && <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-muted">On your network: {data.local.map((u: string) => <code key={u} className="mr-2 font-mono text-ink">{u}</code>)}</div>}
        </Card>
      </div>

      <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-[.07em] text-ink-2">Applications</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {APPS.filter((a) => !a.cap || s.can(a.cap)).map((a) => (
          <Link key={a.to} to={a.to} className="group grid justify-items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-5 text-center text-ink no-underline transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
            <span className={cx("grid h-12 w-12 place-items-center rounded-xl", a.tone)}><a.icon size={24} strokeWidth={1.8} /></span>
            <span className="text-[13px] font-semibold">{a.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-dashed border-line pb-2.5 last:border-0 last:pb-0"><span className="font-sans text-muted">{label}:</span><span className="flex items-center gap-1.5">{children}</span></div>;
}
