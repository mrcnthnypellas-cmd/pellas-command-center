import { useEffect, useState } from "react";
import { GitBranch, Plus, Rocket } from "lucide-react";
import { api, fmtDate, rel } from "../api";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Secret, Table, Toggle, inputCls, useAction, useLoad } from "../ui";

const tone = (s: string) => (s === "Succeeded" ? "ok" : s === "Failed" ? "bad" : s === "Running" || s === "Queued" ? "info" : "none") as any;

export default function GitHubPage() {
  const repos = useLoad<any[]>(() => api("/api/github/repos"));
  const history = useLoad<any[]>(() => api("/api/github/deployments"), [], 4000);
  const sites = useLoad<any[]>(() => api("/api/websites"));
  const { busy, run } = useAction();
  const [connect, setConnect] = useState(false);
  const [secret, setSecret] = useState<any>(null);
  const [log, setLog] = useState<string | null>(null);
  const [latest, setLatest] = useState<Record<string, any>>({});
  const [del, setDel] = useState<any>(null);
  const repoName = (id: string) => { const r = repos.data?.find((x) => x.id === id); return r ? `${r.owner}/${r.repo}` : id; };

  return (
    <div className="grid gap-4">
      <Card title="Repositories" icon={<GitBranch size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setConnect(true)}><Plus size={15} /> Connect repository</Button>}
        footer={<span className="text-xs text-muted">Automatic deployment checks GitHub for new commits every few minutes, so it works behind any router with no webhook or port forwarding.</span>}>
        {repos.error && <div className="p-4"><PageError error={repos.error} /></div>}
        {repos.data?.length === 0 ? <Empty icon={<GitBranch size={40} />} title="No repositories connected">Connect a GitHub repository to build and deploy it to one of your websites.</Empty> : (
          <Table head={["Repository", "Branch", "Website", "Last deployed commit", "Auto", ""]}>
            {repos.data?.map((r) => <tr key={r.id}>
              <td><b>{r.owner}/{r.repo}</b>{r.hasToken && <small className="block text-xs text-muted">private (token saved)</small>}</td>
              <td><Pill>{r.branch}</Pill></td><td>{r.site}</td>
              <td className="font-mono text-xs">{r.lastDeployedCommit?.slice(0, 7) ?? "—"}{latest[r.id] && <small className="block font-sans text-muted">latest: {latest[r.id].sha.slice(0, 7)} {latest[r.id].sha === r.lastDeployedCommit ? "(deployed)" : "(new)"}</small>}</td>
              <td><Toggle on={r.autoDeploy} label="Automatic deploy" onChange={(v) => run(async () => { await api(`/api/github/repos/${r.id}`, { method: "PATCH", body: { autoDeploy: v } }); repos.reload(); })} /></td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => run(async () => { await api(`/api/github/repos/${r.id}/deploy`, { method: "POST" }); history.reload(); }, "Deployment started")}><Rocket size={14} /> Deploy</Button>{" "}
                <Button size="sm" onClick={() => run(async () => { const c = await api(`/api/github/repos/${r.id}/latest`); setLatest((l) => ({ ...l, [r.id]: c })); })}>Pull latest</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => setDel(r)}>Disconnect</Button>
              </td>
            </tr>)}
          </Table>
        )}
      </Card>
      <Card title="Deployment history" icon={<Rocket size={15} />} pad={false}>
        <Table head={["When", "Repository", "Commit", "Trigger", "Status", ""]} empty="No deployments yet.">
          {history.data?.map((d) => <tr key={d.id}>
            <td className="whitespace-nowrap text-muted" title={fmtDate(d.queuedAt)}>{rel(d.queuedAt)}</td><td>{repoName(d.repoId)}</td>
            <td><span className="font-mono text-xs">{d.commitSha?.slice(0, 7) ?? "—"}</span> <span className="text-muted">{d.commitMessage}</span></td>
            <td className="text-muted">{d.trigger}</td><td><Pill tone={tone(d.status)} dot>{d.status}</Pill>{d.error && <small className="block max-w-72 truncate text-xs text-bad" title={d.error}>{d.error}</small>}</td>
            <td className="text-right"><Button size="sm" onClick={() => setLog(d.id)}>View logs</Button></td>
          </tr>)}
        </Table>
      </Card>
      {connect && <ConnectRepo sites={sites.data?.map((s: any) => s.site.name) ?? []} busy={busy} onClose={() => setConnect(false)}
        onSave={(b) => run(async () => { const r = await api("/api/github/repos", { body: b }); setConnect(false); setSecret(r); repos.reload(); }, "Repository connected")} />}
      {secret && <Modal title="Repository connected" onClose={() => setSecret(null)} footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
        <div className="grid gap-3 text-[13px]">
          <p className="m-0">{secret.note}</p>
          <p className="m-0 text-muted">Optional GitHub webhook (only when the server is reachable from the Internet through Remote Access):</p>
          <Secret label="Payload URL" value={`${location.origin}${secret.repo.webhookPath}`} />
          <Secret label="Secret" value={secret.webhookSecret} />
        </div>
      </Modal>}
      {log && <LogModal id={log} onClose={() => setLog(null)} />}
      {del && <Confirm title={`Disconnect ${del.owner}/${del.repo}?`} confirmLabel="Disconnect" onClose={() => setDel(null)} message="The website keeps its current release."
        onConfirm={() => run(async () => { await api(`/api/github/repos/${del.id}`, { method: "DELETE" }); repos.reload(); }, "Disconnected")} />}
    </div>
  );
}

function LogModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [text, setText] = useState("Loading…");
  useEffect(() => {
    let alive = true;
    const load = () => api<string>(`/api/github/deployments/${id}/log`, { text: true }).then((t) => alive && setText(t || "Waiting to start…"));
    load(); const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  return <Modal wide title="Deployment log" onClose={onClose}><pre className="m-0 max-h-[65vh] overflow-auto whitespace-pre-wrap rounded bg-[#0f1b23] p-3 font-mono text-[12px] text-[#cfe1e6]">{text}</pre></Modal>;
}

function ConnectRepo({ sites, onSave, onClose, busy }: { sites: string[]; onSave: (b: any) => void; onClose: () => void; busy: boolean }) {
  const [f, setF] = useState({ repository: "", branch: "", token: "", site: sites[0] ?? "", autoDeploy: true, runTests: false, build: "", output: "" });
  return (
    <Modal title="Connect GitHub repository" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.repository || !f.site} onClick={() => onSave({
      repository: f.repository, branch: f.branch || null, token: f.token || null, site: f.site, autoDeploy: f.autoDeploy, runTests: f.runTests,
      buildCommand: f.build ? f.build.split(" ").filter(Boolean) : null, outputDirectory: f.output || null,
    })}>{busy ? "Checking…" : "Connect"}</Button></>}>
      {sites.length === 0 ? <p className="m-0 text-[13px] text-warn">Create a website first. Deployments are published to a website.</p> : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Repository" hint="owner/name or the GitHub URL"><input className={inputCls} value={f.repository} onChange={(e) => setF({ ...f, repository: e.target.value })} placeholder="my-company/website" autoFocus /></Field></div>
          <Field label="Branch" hint="Empty = default branch"><input className={inputCls} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="main" /></Field>
          <Field label="Deploy to website"><select className={inputCls} value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })}>{sites.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Access token (private repositories)" hint="A fine-grained token with read-only Contents access. Stored encrypted."><input className={inputCls} type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Field></div>
          <Field label="Build command (optional)" hint="Detected automatically (npm, dotnet)."><input className={inputCls + " font-mono"} value={f.build} onChange={(e) => setF({ ...f, build: e.target.value })} placeholder="npm run build" /></Field>
          <Field label="Output folder (optional)" hint="Detected automatically (dist, build, out)."><input className={inputCls + " font-mono"} value={f.output} onChange={(e) => setF({ ...f, output: e.target.value })} placeholder="dist" /></Field>
          <label className="flex items-center gap-2.5 text-[13px]"><Toggle on={f.autoDeploy} onChange={(v) => setF({ ...f, autoDeploy: v })} label="Automatic deploy" /> Deploy new commits automatically</label>
          <label className="flex items-center gap-2.5 text-[13px]"><Toggle on={f.runTests} onChange={(v) => setF({ ...f, runTests: v })} label="Run tests" /> Run tests before deploying</label>
        </div>
      )}
    </Modal>
  );
}
