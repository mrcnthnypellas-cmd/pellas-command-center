import { Activity, Cpu, Network, ShieldAlert } from "lucide-react";
import { api, fmtBytes, fmtDuration } from "../api";
import { Card, Dot, KV, PageError, Pill, Sparkline, Table, useLoad } from "../ui";

export default function MonitoringPage() {
  const sys = useLoad<any>(() => api("/api/system"), [], 10000);
  const hist = useLoad<any[]>(() => api("/api/system/metrics"), [], 2000);
  const ext = useLoad<any[]>(() => api("/api/system/external-services"));
  const h = hist.data ?? [];
  const cur = h[h.length - 1];
  const snap = sys.data?.snapshot;
  return (
    <div className="grid gap-4">
      {sys.error && <PageError error={sys.error} retry={sys.reload} />}
      <Card title="Performance" icon={<Activity size={15} />} actions={<Pill tone="acc" dot>Live · last 10 min</Pill>} pad={false}>
        <div className="grid md:grid-cols-3">
          {[
            ["CPU", cur ? `${Math.round(cur.cpuPercent)}%` : "…", h.map((x) => x.cpuPercent), 100, "accent"],
            ["Memory", cur ? `${Math.round((cur.memoryUsedBytes / cur.memoryTotalBytes) * 100)}%` : "…", h.map((x) => (x.memoryUsedBytes / Math.max(1, x.memoryTotalBytes)) * 100), 100, "info"],
            ["Network in", cur ? `${fmtBytes(cur.netInBytesPerSec)}/s` : "…", h.map((x) => x.netInBytesPerSec), undefined, "vio"],
          ].map(([label, value, series, max, tone]: any) => (
            <div key={label} className="border-t border-line px-4 py-3 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
              <div className="mb-1.5 flex items-baseline justify-between"><span className="text-xs font-semibold uppercase tracking-[.06em] text-muted">{label}</span><b className="num text-xl">{value}</b></div>
              <Sparkline values={series} max={max} tone={tone} />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Services" icon={<Activity size={15} />} pad={false}>
          <Table head={["Service", "Status", "Detail"]}>
            {sys.data?.health.map((x: any) => <tr key={x.name}><td><span className="flex items-center gap-2"><Dot tone={x.state === "Healthy" ? "ok" : x.state === "Disabled" ? "none" : x.state === "Degraded" ? "warn" : "bad"} /><b>{x.name}</b></span></td><td>{x.summary}</td><td className="text-xs text-muted">{x.detail ?? ""}</td></tr>)}
          </Table>
        </Card>
        <Card title="This PC" icon={<Cpu size={15} />}>
          {snap && <KV rows={[["Computer", snap.machineName], ["Operating system", snap.operatingSystem], ["Processors", snap.processorCount], ["Memory", cur ? fmtBytes(cur.memoryTotalBytes) : "…"],
            ["PC uptime", fmtDuration(parseDur(snap.systemUptime))], ["Server uptime", fmtDuration(parseDur(snap.serverUptime))], ["Local addresses", snap.localAddresses.join(", ")]]} />}
        </Card>
      </div>
      <Card title="Network adapters" icon={<Network size={15} />} pad={false}>
        <Table head={["Adapter", "Type", "Status", "Speed", "Addresses"]}>
          {snap?.adapters.map((a: any) => <tr key={a.name}><td><b>{a.name}</b></td><td>{a.type}</td><td>{a.status === "Up" ? <Pill tone="ok">Up</Pill> : <Pill>{a.status}</Pill>}</td><td className="num">{a.speedBitsPerSec ? `${(a.speedBitsPerSec / 1e6).toFixed(0)} Mbps` : "—"}</td><td className="font-mono text-xs">{a.addresses.join(", ")}</td></tr>)}
        </Table>
      </Card>
      <Card title="External services" icon={<ShieldAlert size={15} />} pad={false} footer={<span className="text-xs text-muted">Your data stays on this PC by default. This list shows every optional service the server can talk to, and whether it is in use.</span>}>
        <Table head={["Service", "In use", "Data sent", "Why", "Where"]}>
          {ext.data?.map((e: any) => <tr key={e.id}><td><b>{e.name}</b></td><td>{e.enabled ? <Pill tone="warn">Enabled</Pill> : <Pill>Off</Pill>}</td><td className="text-xs">{e.dataTransmitted}</td><td className="text-xs text-muted">{e.purpose}</td><td className="text-xs">{e.destination}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}

function parseDur(v: string) { // "d.hh:mm:ss.fffffff" or "hh:mm:ss"
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(v); if (!m) return 0;
  return (Number(m[1] ?? 0) * 86400) + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}
