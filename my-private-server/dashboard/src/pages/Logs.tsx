import { useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { api, fmtDate } from "../api";
import { Button, Card, PageError, Pill, Table, inputCls, useLoad } from "../ui";

const CATS = [["", "All"], ["file", "Files"], ["login", "Sign-ins"], ["security", "Security"], ["users", "Users"], ["permissions", "Permissions"], ["database", "Database"], ["websites", "Websites"], ["github", "GitHub"], ["docker", "Docker"], ["backup", "Backup"], ["remote", "Remote"], ["settings", "Settings"], ["system", "System"]];
const tone = (s: string) => (s === "Success" ? "ok" : s === "Warning" ? "warn" : s === "Critical" ? "bad" : "info") as any;

export default function LogsPage() {
  const [cat, setCat] = useState(""); const [q, setQ] = useState(""); const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"audit" | "server">("audit");
  const audit = useLoad<any[]>(() => api(`/api/logs/audit?limit=300&category=${cat}&q=${encodeURIComponent(search)}`), [cat, search], 10000);
  const server = useLoad<string>(() => (tab === "server" ? api("/api/logs/server", { text: true }) : Promise.resolve("")), [tab]);
  return (
    <div className="grid gap-4">
      <div className="flex gap-1.5">{(["audit", "server"] as const).map((t) => <Button key={t} size="sm" variant={tab === t ? "primary" : "default"} onClick={() => setTab(t)}>{t === "audit" ? "Activity" : "Server log"}</Button>)}</div>
      {tab === "audit" ? (
        <Card title="Activity" icon={<ScrollText size={15} />} pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-3">
            <form className="relative min-w-52 flex-1 sm:max-w-80" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input className={inputCls + " !pl-8"} placeholder="Search activity…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <div className="flex flex-wrap gap-1.5">{CATS.map(([v, l]) => <Button key={v} size="sm" variant={cat === v ? "primary" : "default"} onClick={() => setCat(v)}>{l}</Button>)}</div>
          </div>
          {audit.error && <div className="p-4"><PageError error={audit.error} /></div>}
          <Table head={["Time", "Event", "Details", "User", "Source", "Level"]} empty="No activity matches.">
            {audit.data?.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-muted">{fmtDate(e.timestamp)}</td><td><b>{e.action}</b></td><td className="text-ink-2">{[e.target, e.detail].filter(Boolean).join(" · ")}</td><td><Pill>{e.actor}</Pill></td><td className="text-xs text-muted">{e.source ?? ""}</td><td><Pill tone={tone(e.severity)}>{e.severity}</Pill></td></tr>)}
          </Table>
        </Card>
      ) : (
        <Card title="Server log (latest)" pad={false}><pre className="m-0 max-h-[70vh] overflow-auto whitespace-pre-wrap bg-[#0f1b23] p-4 font-mono text-[12px] text-[#cfe1e6]">{server.data || "Loading…"}</pre></Card>
      )}
    </div>
  );
}
