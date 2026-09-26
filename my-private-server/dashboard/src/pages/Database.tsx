import { useState } from "react";
import { Database as DbIcon, KeyRound, Plus, Save, Trash2, Users } from "lucide-react";
import { api, fmtBytes, fmtDate } from "../api";
import { Button, Card, Confirm, Field, KV, Modal, PageError, Pill, Secret, Table, inputCls, useAction, useLoad } from "../ui";

export default function DatabasePage() {
  const status = useLoad<any>(() => api("/api/database/status"), [], 15000);
  const conn = useLoad<any>(() => api("/api/database/connection"));
  const online = status.data?.online;
  const dbs = useLoad<any[]>(() => (online ? api("/api/database/databases") : Promise.resolve([])), [online]);
  const roles = useLoad<any[]>(() => (online ? api("/api/database/roles") : Promise.resolve([])), [online]);
  const backups = useLoad<any[]>(() => (online ? api("/api/database/backups") : Promise.resolve([])), [online]);
  const { busy, run } = useAction();
  const [modal, setModal] = useState<null | { kind: "db" } | { kind: "role" } | { kind: "grant"; role: string } | { kind: "secret"; title: string; name: string; password: string } | { kind: "drop"; name: string } | { kind: "dropRole"; name: string } | { kind: "restore"; file: string } | { kind: "connect" }>(null);
  const reloadAll = () => { status.reload(); dbs.reload(); roles.reload(); backups.reload(); };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="PostgreSQL" icon={<DbIcon size={15} />} actions={<Button size="sm" onClick={() => setModal({ kind: "connect" })}>Connection settings</Button>}>
          {status.data && <KV rows={[
            ["Status", status.data.online ? <Pill tone="ok" dot>Online</Pill> : status.data.configured ? <Pill tone="bad" dot>Offline</Pill> : <Pill>Not configured</Pill>],
            ["Version", status.data.version ?? "—"], ["Server", `${status.data.host}:${status.data.port}`],
            ["Running since", status.data.startedAt ? fmtDate(status.data.startedAt) : "—"], ["Active connections", status.data.connections],
          ]} />}
          {status.data?.problem && <p className="mb-0 mt-3 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">{status.data.problem}</p>}
        </Card>
        <Card title="How to connect" icon={<KeyRound size={15} />}>
          <p className="mt-0 text-[13px] text-ink-2">Server-side code (APIs, backend apps) connects with a database user and password. Never put database passwords in website or mobile-app code; use an app's <b>Apps &amp; API</b> key instead.</p>
          <p className="mb-0 break-all font-mono text-[12.5px] text-muted">postgresql://USER:PASSWORD@{conn.data?.publicHost || conn.data?.host || "server"}:{conn.data?.port ?? 5432}/DATABASE</p>
        </Card>
      </div>
      {online && <>
        <Card title="Databases" icon={<DbIcon size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setModal({ kind: "db" })}><Plus size={15} /> Create database</Button>}>
          {dbs.error && <div className="p-4"><PageError error={dbs.error} /></div>}
          <Table head={["Name", "Owner", "Size", "Connections", "Cache hit", ""]}>
            {dbs.data?.map((d) => <tr key={d.name}>
              <td><b className="font-mono">{d.name}</b></td><td className="text-muted">{d.owner}</td><td className="num">{fmtBytes(d.sizeBytes)}</td><td className="num">{d.connections}</td><td className="num">{d.cacheHitPercent}%</td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" disabled={busy} onClick={() => run(async () => { await api(`/api/database/databases/${d.name}/backup`, { method: "POST" }); backups.reload(); }, "Backup created")}><Save size={14} /> Backup</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => setModal({ kind: "drop", name: d.name })}><Trash2 size={14} /></Button>
              </td></tr>)}
          </Table>
        </Card>
        <Card title="Database users" icon={<Users size={15} />} pad={false} actions={<Button size="sm" onClick={() => setModal({ kind: "role" })}><Plus size={15} /> Create user</Button>}>
          <Table head={["User", "Can sign in", "Databases", ""]}>
            {roles.data?.map((r) => <tr key={r.name}>
              <td><b className="font-mono">{r.name}</b> {r.superuser && <Pill tone="warn">superuser</Pill>}</td><td>{r.canLogin ? "Yes" : "No"}</td>
              <td><div className="flex flex-wrap gap-1">{r.superuser ? <span className="text-muted">all</span> : r.databases.map((d: string) => <Pill key={d}>{d}</Pill>)}</div></td>
              <td className="whitespace-nowrap text-right">{!r.superuser && <>
                <Button size="sm" onClick={() => setModal({ kind: "grant", role: r.name })}>Permissions</Button>{" "}
                <Button size="sm" onClick={() => run(async () => { const x = await api(`/api/database/roles/${r.name}/password`, { method: "POST" }); setModal({ kind: "secret", title: "New password", name: r.name, password: x.password }); })}>Reset password</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => setModal({ kind: "dropRole", name: r.name })}><Trash2 size={14} /></Button></>}
              </td></tr>)}
          </Table>
        </Card>
        <Card title="Database backups" icon={<Save size={15} />} pad={false} footer={<span className="text-xs text-muted">Stored in Backups\Databases on the storage drive. Schedule automatic backups to another drive in Backups.</span>}>
          <Table head={["File", "Size", "Created", ""]} empty="No database backups yet.">
            {backups.data?.map((b) => <tr key={b.file}><td className="font-mono text-xs">{b.file}</td><td className="num">{fmtBytes(b.size)}</td><td className="text-muted">{fmtDate(b.created)}</td>
              <td className="text-right"><Button size="sm" onClick={() => setModal({ kind: "restore", file: b.file })}>Restore</Button></td></tr>)}
          </Table>
        </Card>
      </>}

      {modal?.kind === "connect" && <ConnectModal current={conn.data} busy={busy} onClose={() => setModal(null)} onSave={(b) => run(async () => { await api("/api/database/connection", { method: "PUT", body: b }); setModal(null); conn.reload(); reloadAll(); }, "Connected to PostgreSQL")} />}
      {modal?.kind === "db" && <SimpleCreate title="Create database" label="Database name" hint="Lowercase letters, numbers and underscores." extra={roles.data?.filter((r) => !r.superuser).map((r) => r.name)} busy={busy} onClose={() => setModal(null)}
        onSave={(name, owner) => run(async () => { await api("/api/database/databases", { body: { name, owner } }); setModal(null); dbs.reload(); }, "Database created")} />}
      {modal?.kind === "role" && <SimpleCreate title="Create database user" label="Username" hint="A strong password is generated for you." busy={busy} onClose={() => setModal(null)}
        onSave={(name) => run(async () => { const x = await api("/api/database/roles", { body: { name } }); roles.reload(); setModal({ kind: "secret", title: "Database user created", name, password: x.password }); })} />}
      {modal?.kind === "grant" && <GrantModal role={modal.role} dbs={dbs.data?.map((d) => d.name) ?? []} busy={busy} onClose={() => setModal(null)}
        onSave={(database, level) => run(async () => { await api("/api/database/grants", { body: { database, role: modal.role, level } }); setModal(null); roles.reload(); }, "Permission granted")} />}
      {modal?.kind === "secret" && <Modal title={modal.title} onClose={() => setModal(null)} footer={<Button variant="primary" onClick={() => setModal(null)}>I've saved it</Button>}>
        <div className="grid gap-3"><Secret label="Username" value={modal.name} /><Secret label="Password" value={modal.password} /><p className="m-0 text-xs text-warn">Copy the password now. It is not shown again.</p></div>
      </Modal>}
      {modal?.kind === "drop" && <Confirm title={`Delete database ${modal.name}?`} typeToConfirm={modal.name} confirmLabel="Delete database" onClose={() => setModal(null)}
        message="All tables and data in this database are permanently deleted. Consider a backup first."
        onConfirm={() => run(async () => { await api(`/api/database/databases/${modal.name}?confirm=${modal.name}`, { method: "DELETE" }); dbs.reload(); }, "Database deleted")} />}
      {modal?.kind === "dropRole" && <Confirm title={`Delete user ${modal.name}?`} confirmLabel="Delete" onClose={() => setModal(null)} message="Objects owned by this user are reassigned to the administrator."
        onConfirm={() => run(async () => { await api(`/api/database/roles/${modal.name}`, { method: "DELETE" }); roles.reload(); }, "Database user deleted")} />}
      {modal?.kind === "restore" && <RestoreModal file={modal.file} dbs={dbs.data?.map((d) => d.name) ?? []} onClose={() => setModal(null)}
        onSave={(database, confirm) => run(async () => { await api("/api/database/restore", { body: { database, file: modal.file, confirm } }); setModal(null); }, "Database restored")} />}
    </div>
  );
}

function ConnectModal({ current, onSave, onClose, busy }: { current: any; onSave: (b: any) => void; onClose: () => void; busy: boolean }) {
  const [f, setF] = useState({ host: current?.host ?? "127.0.0.1", port: current?.port ?? 5432, adminUser: current?.adminUser ?? "postgres", password: "", publicHost: current?.publicHost ?? "" });
  return (
    <Modal title="PostgreSQL connection" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => onSave({ ...f, port: Number(f.port) })}>Test and save</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Host"><input className={inputCls} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} /></Field>
        <Field label="Port"><input className={inputCls} value={f.port} onChange={(e) => setF({ ...f, port: e.target.value as any })} /></Field>
        <Field label="Administrator user"><input className={inputCls} value={f.adminUser} onChange={(e) => setF({ ...f, adminUser: e.target.value })} /></Field>
        <Field label="Password" hint={current?.hasPassword ? "Leave empty to keep the saved password." : "Stored encrypted on this PC."}><input className={inputCls} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Address shown to developers (optional)" hint="For example the server's LAN or remote-access address."><input className={inputCls} value={f.publicHost} onChange={(e) => setF({ ...f, publicHost: e.target.value })} /></Field></div>
      </div>
    </Modal>
  );
}

function SimpleCreate({ title, label, hint, extra, onSave, onClose, busy }: { title: string; label: string; hint: string; extra?: string[]; onSave: (n: string, owner?: string) => void; onClose: () => void; busy: boolean }) {
  const [n, setN] = useState(""); const [owner, setOwner] = useState("");
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !n} onClick={() => onSave(n, owner || undefined)}>Create</Button></>}>
      <div className="grid gap-3.5">
        <Field label={label} hint={hint}><input className={inputCls + " font-mono"} value={n} onChange={(e) => setN(e.target.value.toLowerCase())} autoFocus /></Field>
        {extra && <Field label="Owner (optional)"><select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Administrator</option>{extra.map((r) => <option key={r}>{r}</option>)}</select></Field>}
      </div>
    </Modal>
  );
}

function GrantModal({ role, dbs, onSave, onClose, busy }: { role: string; dbs: string[]; onSave: (d: string, l: string) => void; onClose: () => void; busy: boolean }) {
  const [db, setDb] = useState(dbs[0] ?? ""); const [level, setLevel] = useState("ReadWrite");
  return (
    <Modal title={`Permissions for ${role}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !db} onClick={() => onSave(db, level)}>Grant</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Database"><select className={inputCls} value={db} onChange={(e) => setDb(e.target.value)}>{dbs.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Access"><select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)}><option value="Connect">Connect only</option><option value="ReadOnly">Read only</option><option value="ReadWrite">Read and write</option><option value="Owner">Owner</option></select></Field>
      </div>
    </Modal>
  );
}

function RestoreModal({ file, dbs, onSave, onClose }: { file: string; dbs: string[]; onSave: (d: string, c: string) => void; onClose: () => void }) {
  const guess = dbs.find((d) => file.startsWith(d + "-")) ?? dbs[0] ?? "";
  const [db, setDb] = useState(guess); const [confirm, setConfirm] = useState("");
  return (
    <Modal title="Restore database" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" className="!bg-bad !text-white" disabled={confirm !== db} onClick={() => onSave(db, confirm)}>Restore</Button></>}>
      <div className="grid gap-3.5">
        <p className="m-0 text-[13px]">Restore <code className="font-mono">{file}</code>. The database's current contents are replaced.</p>
        <Field label="Into database"><select className={inputCls} value={db} onChange={(e) => setDb(e.target.value)}>{dbs.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label={`Type “${db}” to confirm`}><input className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
