import { useRef, useState } from "react";
import { Cloud, ExternalLink, Plus, RotateCcw, Upload } from "lucide-react";
import { api, ensureCsrf } from "../api";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Table, inputCls, useAction, useLoad } from "../ui";

export default function WebsitesPage() {
  const sites = useLoad<any[]>(() => api("/api/websites"), [], 10000);
  const web = useLoad<any>(() => api("/api/websites/webserver"));
  const apps = useLoad<any[]>(() => api("/api/apps").catch(() => []));
  const { busy, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const zip = useRef<HTMLInputElement>(null);
  const [zipTarget, setZipTarget] = useState<string | null>(null);

  async function uploadZip(file: File) {
    const token = await ensureCsrf();
    const r = await fetch(`/api/websites/${zipTarget}/deploy-zip`, { method: "POST", body: file, headers: { "X-MPS-CSRF": token }, credentials: "same-origin" });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Upload failed");
  }

  return (
    <div className="grid gap-4">
      {web.data && !web.data.status.running && <div className="rounded-[10px] border border-line bg-warn-soft px-4 py-3 text-[13px] text-warn">Web server: {web.data.status.problem}</div>}
      <Card title="Websites" icon={<Cloud size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New website</Button>}
        footer={<span className="text-xs text-muted">Each site gets its own port on this server. A custom domain is optional. Through Remote Access the sites are reachable from anywhere.</span>}>
        {sites.error && <div className="p-4"><PageError error={sites.error} /></div>}
        {sites.data?.length === 0 ? <Empty icon={<Cloud size={40} />} title="No websites yet">Create a site, then deploy it from GitHub or upload a ZIP.</Empty> : (
          <Table head={["Site", "Type", "Address", "Release", "Status", ""]}>
            {sites.data?.map(({ site: s, processRunning, localUrls }: any) => (
              <tr key={s.name}>
                <td><b>{s.name}</b>{s.linkedApp && <small className="block text-xs text-muted">uses app {s.linkedApp}</small>}</td>
                <td><Pill tone="info">{s.kind}</Pill></td>
                <td className="text-xs">{[...s.hostnames.map((h: string) => "https://" + h), ...localUrls].slice(0, 2).map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-accent">{u}<ExternalLink size={12} /></a>)}</td>
                <td className="font-mono text-xs text-muted">{s.currentRelease ?? "not deployed"}</td>
                <td>{!s.enabled ? <Pill>Disabled</Pill> : s.kind === "Node" || s.kind === "DotNet" ? (processRunning ? <Pill tone="ok" dot>Running</Pill> : <Pill tone="warn" dot>Stopped</Pill>) : <Pill tone="ok" dot>Serving</Pill>}</td>
                <td className="whitespace-nowrap text-right">
                  {(s.kind === "Static" || s.kind === "Php" || s.kind === "Node") && <><Button size="sm" onClick={() => { setZipTarget(s.name); zip.current?.click(); }}><Upload size={14} /> ZIP</Button>{" "}</>}
                  {(s.kind === "Node" || s.kind === "DotNet") && <><Button size="sm" onClick={() => run(async () => { await api(`/api/websites/${s.name}/restart`, { method: "POST" }); sites.reload(); }, "Restarted")}>Restart</Button>{" "}
                    <Button size="sm" onClick={() => run(async () => setLogs((await api<string[]>(`/api/websites/${s.name}/logs`)).join("\n") || "No output yet."))}>Logs</Button>{" "}</>}
                  {s.releases.length > 1 && <><Button size="sm" title="Roll back to the previous release" onClick={() => run(async () => { await api(`/api/websites/${s.name}/rollback`, { method: "POST" }); sites.reload(); }, "Rolled back")}><RotateCcw size={14} /></Button>{" "}</>}
                  <Button size="sm" variant="danger" onClick={() => setDel(s.name)}>Delete</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <input ref={zip} type="file" accept=".zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(async () => { await uploadZip(f); sites.reload(); }, "Deployed"); }} />
      {web.data && <Card title="Web server configuration (Caddy)" pad={false}><pre className="m-0 max-h-72 overflow-auto bg-surface-2 p-4 font-mono text-[12px]">{web.data.caddyfile}</pre></Card>}
      {creating && <CreateSite apps={apps.data ?? []} busy={busy} onClose={() => setCreating(false)} onSave={(b) => run(async () => { await api("/api/websites", { body: b }); setCreating(false); sites.reload(); web.reload(); }, "Website created")} />}
      {logs !== null && <Modal title="App output" wide onClose={() => setLogs(null)}><pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-[12px]">{logs}</pre></Modal>}
      {del && <Confirm title={`Delete website ${del}?`} confirmLabel="Delete website" onClose={() => setDel(null)} message="The site stops being served. Its files are kept in the Websites folder."
        onConfirm={() => run(async () => { await api(`/api/websites/${del}`, { method: "DELETE" }); sites.reload(); web.reload(); }, "Website deleted")} />}
    </div>
  );
}

function CreateSite({ apps, onSave, onClose, busy }: { apps: any[]; onSave: (b: any) => void; onClose: () => void; busy: boolean }) {
  const [f, setF] = useState({ name: "", kind: "Static", start: "node server.js", hostnames: "", linkedApp: "" });
  const dynamic = f.kind === "Node" || f.kind === "DotNet";
  return (
    <Modal title="New website" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.name} onClick={() => onSave({
      name: f.name, kind: f.kind, startCommand: dynamic ? f.start.split(" ").filter(Boolean) : undefined,
      hostnames: f.hostnames.split(/[\s,]+/).filter(Boolean), linkedApp: f.linkedApp || undefined,
    })}>Create</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="company-site" autoFocus /></Field>
        <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, start: e.target.value === "DotNet" ? "dotnet App.dll" : "node server.js" })}>
          <option value="Static">Static / React site</option><option value="Node">Node.js app</option><option value="DotNet">ASP.NET app</option><option value="Php">PHP site</option><option value="Proxy">Existing app (proxy)</option></select></Field>
        {dynamic && <div className="sm:col-span-2"><Field label="Start command" hint="Runs in the release folder with PORT set."><input className={inputCls + " font-mono"} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field></div>}
        <Field label="Custom domain (optional)" hint="Not required. Leave empty to use the server's address."><input className={inputCls} value={f.hostnames} onChange={(e) => setF({ ...f, hostnames: e.target.value })} placeholder="www.example.com" /></Field>
        <Field label="Linked app (optional)" hint="Gives the site the app's DATABASE_URL and variables."><select className={inputCls} value={f.linkedApp} onChange={(e) => setF({ ...f, linkedApp: e.target.value })}><option value="">None</option>{apps.map((a) => <option key={a.slug}>{a.slug}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
