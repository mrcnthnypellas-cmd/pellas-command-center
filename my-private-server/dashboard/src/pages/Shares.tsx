import { useState } from "react";
import { Folder, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../api";
import { Button, Card, Confirm, Empty, Field, Modal, PageError, Pill, Table, inputCls, useAction, useLoad } from "../ui";

type Acl = { principalType: "User" | "Role" | "Everyone"; principal: string; subPath: string; level: "None" | "Read" | "ReadWrite" | "Full"; displayName?: string };
type Share = { name: string; description?: string; createdAt: string; acl: Acl[] };
const LEVELS: [Acl["level"], string, string][] = [["None", "No access", "none"], ["Read", "Read", "info"], ["ReadWrite", "Read / Write", "acc"], ["Full", "Full control", "ok"]];
const ROLES = ["Administrator", "Developer", "User", "ReadOnly"];

export default function SharesPage() {
  const shares = useLoad<Share[]>(() => api("/api/shares"));
  const users = useLoad<any[]>(() => api("/api/users"));
  const { busy, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Share | null>(null);
  const [del, setDel] = useState<Share | null>(null);

  return (
    <div className="grid gap-4">
      <Card title="Shared folders" icon={<ShieldCheck size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New shared folder</Button>}
        footer={<span className="text-xs text-muted">Each user also has a private home folder. Administrators can open every folder.</span>}>
        {shares.error && <div className="p-4"><PageError error={shares.error} retry={shares.reload} /></div>}
        {shares.data?.length === 0 ? <Empty icon={<Folder size={40} />} title="No shared folders yet">Create one, then choose exactly who can open it and which subfolders.</Empty> : (
          <Table head={["Folder", "Who has access", ""]}>
            {shares.data?.map((s) => (
              <tr key={s.name}>
                <td><span className="flex items-center gap-2.5"><Folder size={20} className="fill-folder text-folder" /><span><b className="block">{s.name}</b>{s.description && <small className="text-xs text-muted">{s.description}</small>}</span></span></td>
                <td><div className="flex flex-wrap gap-1.5">
                  {s.acl.length === 0 && <span className="text-muted">Only administrators</span>}
                  {s.acl.map((a, i) => { const lv = LEVELS.find((l) => l[0] === a.level)!; return <Pill key={i} tone={lv[2] as any}>{a.principalType === "Everyone" ? "Everyone" : a.displayName ?? a.principal}{a.subPath ? ` · ${a.subPath}` : ""}: {lv[1]}</Pill>; })}
                </div></td>
                <td className="whitespace-nowrap text-right"><Button size="sm" onClick={() => setEditing(s)}>Permissions</Button>{" "}<Button size="sm" variant="danger" onClick={() => setDel(s)}><Trash2 size={14} /></Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && <CreateModal busy={busy} onClose={() => setCreating(false)} onSave={(name, description) => run(async () => { await api("/api/shares", { body: { name, description } }); setCreating(false); shares.reload(); }, "Shared folder created")} />}
      {editing && <AclModal share={editing} users={users.data?.map((u) => u.user) ?? []} onClose={() => setEditing(null)} busy={busy}
        onSave={(entries) => run(async () => { await api(`/api/shares/${encodeURIComponent(editing.name)}/acl`, { method: "PUT", body: { entries } }); setEditing(null); shares.reload(); }, "Permissions saved")} />}
      {del && <Confirm title={`Delete “${del.name}”?`} confirmLabel="Delete" onClose={() => setDel(null)} message="Only empty shared folders can be deleted. Move or delete its contents first."
        onConfirm={() => run(async () => { await api(`/api/shares/${encodeURIComponent(del.name)}`, { method: "DELETE" }); shares.reload(); }, "Shared folder deleted")} />}
    </div>
  );
}

function CreateModal({ onSave, onClose, busy }: { onSave: (n: string, d: string) => void; onClose: () => void; busy: boolean }) {
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  return (
    <Modal title="New shared folder" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => onSave(name.trim(), desc)}>Create</Button></>}>
      <div className="grid gap-3.5">
        <Field label="Folder name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Accounting" /></Field>
        <Field label="Description (optional)"><input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AclModal({ share, users, onSave, onClose, busy }: { share: Share; users: any[]; onSave: (e: Acl[]) => void; onClose: () => void; busy: boolean }) {
  const [rows, setRows] = useState<Acl[]>(share.acl.map((a) => ({ principalType: a.principalType, principal: a.principal, subPath: a.subPath, level: a.level })));
  const upd = (i: number, patch: Partial<Acl>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Modal wide title={`Who can open “${share.name}”`} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => onSave(rows.filter((r) => r.principal))}>Save permissions</Button></>}>
      <p className="mt-0 text-[13px] text-muted">Add a rule for a person or a role. Leave <b>Subfolder</b> empty for the whole folder, or enter a subfolder (for example <code>Invoices</code>) to give access to only that part.
        The most specific rule wins, and a rule for a person overrides a rule for their role. Use <b>No access</b> to hide a subfolder from someone.</p>
      <div className="grid gap-2">
        {rows.map((r, i) => (
          <div key={i} className="grid items-end gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[130px_1fr_1fr_150px_auto]">
            <Field label="Applies to"><select className={inputCls} value={r.principalType} onChange={(e) => upd(i, { principalType: e.target.value as any, principal: e.target.value === "Everyone" ? "*" : "" })}>
              <option value="User">A person</option><option value="Role">A role</option><option value="Everyone">Everyone</option></select></Field>
            <Field label={r.principalType === "Role" ? "Role" : "Person"}>
              {r.principalType === "User" ? <select className={inputCls} value={r.principal} onChange={(e) => upd(i, { principal: e.target.value })}><option value="">Choose…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>)}</select>
                : r.principalType === "Role" ? <select className={inputCls} value={r.principal} onChange={(e) => upd(i, { principal: e.target.value })}><option value="">Choose…</option>{ROLES.map((x) => <option key={x}>{x}</option>)}</select>
                : <input className={inputCls} value="All signed-in users" disabled />}
            </Field>
            <Field label="Subfolder (optional)"><input className={inputCls} value={r.subPath} placeholder="whole folder" onChange={(e) => upd(i, { subPath: e.target.value })} /></Field>
            <Field label="Access"><select className={inputCls} value={r.level} onChange={(e) => upd(i, { level: e.target.value as any })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Button variant="ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove rule"><Trash2 size={16} /></Button>
          </div>
        ))}
        <Button onClick={() => setRows((r) => [...r, { principalType: "User", principal: "", subPath: "", level: "Read" }])}><Plus size={15} /> Add rule</Button>
      </div>
      <div className="mt-3 grid gap-1 rounded-lg bg-surface-2 p-3 text-xs text-muted">
        <span><Pill tone="info">Read</Pill> open and download · <Pill tone="acc">Read / Write</Pill> also upload, rename, delete · <Pill tone="ok">Full control</Pill> everything · <Pill>No access</Pill> hidden</span>
      </div>
    </Modal>
  );
}
