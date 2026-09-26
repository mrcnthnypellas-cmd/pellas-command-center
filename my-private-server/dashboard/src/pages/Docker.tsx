import { useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { api, rel } from "../api";
import { useSession } from "../session";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Table, inputCls, useAction, useLoad } from "../ui";

export default function DockerPage() {
  const s = useSession();
  const status = useLoad<any>(() => api("/api/docker/status"));
  const list = useLoad<any[]>(() => (status.data?.available ? api("/api/docker/containers") : Promise.resolve([])), [status.data?.available], 10000);
  const { busy, run } = useAction();
  const [logs, setLogs] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [del, setDel] = useState<any>(null);
  const act = (id: string, a: string) => run(async () => { await api(`/api/docker/containers/${id}/${a}`, { method: "POST" }); list.reload(); }, `Container ${a}ed`);

  if (status.data && !status.data.available) return (
    <Card title="Docker" icon={<Boxes size={15} />}><Empty icon={<Boxes size={40} />} title="Docker is not available">{status.data.problem}<span className="text-xs">Everything else on the server works without Docker.</span></Empty></Card>
  );
  return (
    <div className="grid gap-4">
      <Card title={`Containers${status.data?.version ? ` · Docker ${status.data.version}` : ""}`} icon={<Boxes size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> Run container</Button>}
        footer={<span className="text-xs text-muted">For safety, containers created here cannot run privileged or on the host network, and can only store data inside the server's Docker folder.</span>}>
        {list.error && <div className="p-4"><PageError error={list.error} /></div>}
        <Table head={["Name", "Image", "State", "Ports", "Created", ""]} empty="No containers.">
          {list.data?.map((c) => <tr key={c.id}>
            <td><b>{c.name}</b>{c.managedByServer && <small className="block text-xs text-muted">created here</small>}</td><td className="font-mono text-xs">{c.image}</td>
            <td><Pill tone={c.state === "running" ? "ok" : "warn"} dot>{c.state === "running" ? "RUNNING" : c.state.toUpperCase()}</Pill><small className="block text-xs text-muted">{c.status}</small></td>
            <td className="font-mono text-xs">{c.ports.join(", ") || "—"}</td><td className="text-muted">{rel(c.created)}</td>
            <td className="whitespace-nowrap text-right">
              {c.state === "running" ? <><Button size="sm" onClick={() => act(c.id, "stop")}>Stop</Button> <Button size="sm" onClick={() => act(c.id, "restart")}>Restart</Button></> : <Button size="sm" onClick={() => act(c.id, "start")}>Start</Button>}{" "}
              <Button size="sm" onClick={() => run(async () => setLogs((await api<string>(`/api/docker/containers/${c.id}/logs?tail=300`, { text: true })) || "No output."))}>Logs</Button>{" "}
              {s.can("RemoveContainers") && <Button size="sm" variant="danger" onClick={() => setDel(c)}>Remove</Button>}
            </td>
          </tr>)}
        </Table>
      </Card>
      {logs !== null && <Modal wide title="Container logs" onClose={() => setLogs(null)}><pre className="m-0 max-h-[65vh] overflow-auto whitespace-pre-wrap font-mono text-[12px]">{logs}</pre></Modal>}
      {del && <Confirm title={`Remove ${del.name}?`} confirmLabel="Remove" onClose={() => setDel(null)} message="The container is removed. Its data folders are kept." onConfirm={() => run(async () => { await api(`/api/docker/containers/${del.id}`, { method: "DELETE" }); list.reload(); }, "Removed")} />}
      {create && <CreateContainer busy={busy} onClose={() => setCreate(false)} onSave={(b) => run(async () => { await api("/api/docker/containers", { body: b }); setCreate(false); list.reload(); }, "Container started")} />}
    </div>
  );
}

function CreateContainer({ onSave, onClose, busy }: { onSave: (b: any) => void; onClose: () => void; busy: boolean }) {
  const [f, setF] = useState({ name: "", image: "", ports: "", volumes: "", env: "" });
  const parse = () => ({
    name: f.name, image: f.image, autoRestart: true,
    ports: f.ports.split(/[\s,]+/).filter(Boolean).map((p) => { const [h, c] = p.split(":"); return { hostPort: Number(h), containerPort: Number(c ?? h), protocol: "tcp" }; }),
    volumes: f.volumes.split(/[\s,]+/).filter(Boolean).map((v) => { const [h, c] = v.split(":"); return { hostFolder: h, containerPath: c, readOnly: false }; }),
    environment: Object.fromEntries(f.env.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1)])),
  });
  return (
    <Modal title="Run a container" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.name || !f.image} onClick={() => onSave(parse())}>{busy ? "Pulling image…" : "Run"}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="redis" /></Field>
        <Field label="Image"><input className={inputCls + " font-mono"} value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} placeholder="redis:7" /></Field>
        <Field label="Ports" hint="host:container, e.g. 6379:6379"><input className={inputCls + " font-mono"} value={f.ports} onChange={(e) => setF({ ...f, ports: e.target.value })} /></Field>
        <Field label="Volumes" hint="folder:/path, stored under Docker\\ on the storage drive"><input className={inputCls + " font-mono"} value={f.volumes} onChange={(e) => setF({ ...f, volumes: e.target.value })} placeholder="redis-data:/data" /></Field>
        <div className="sm:col-span-2"><Field label="Environment variables" hint="One NAME=value per line"><textarea className={inputCls + " min-h-20 font-mono"} value={f.env} onChange={(e) => setF({ ...f, env: e.target.value })} /></Field></div>
      </div>
    </Modal>
  );
}
