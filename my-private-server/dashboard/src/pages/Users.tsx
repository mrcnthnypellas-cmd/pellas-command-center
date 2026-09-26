import { useState } from "react";
import { KeyRound, Plus, UserCheck, UserX, Users as UsersIcon } from "lucide-react";
import { api, fmtBytes, rel } from "../api";
import { useSession } from "../session";
import { Button, Card, Confirm, Field, Meter, Modal, PageError, Pill, Table, inputCls, useAction, useLoad } from "../ui";

type U = { user: { id: string; username: string; displayName: string; role: string; disabled: boolean; quotaBytes: number; lastLoginAt?: string; locked: boolean }; homeUsageBytes: number };
const ROLES = [
  ["Administrator", "Full control of the server"], ["Developer", "Databases, websites, deployments and Docker"],
  ["User", "Files in their home folder and folders shared with them"], ["ReadOnly", "Can view and download, never change"],
];
const QUOTAS: [number, string][] = [[0, "No limit"], [10e9, "10 GB"], [50e9, "50 GB"], [100e9, "100 GB"], [250e9, "250 GB"], [500e9, "500 GB"], [1e12, "1 TB"]];
const roleTone = (r: string) => (r === "Administrator" ? "acc" : r === "Developer" ? "vio" : r === "ReadOnly" ? "warn" : "info") as any;

export default function UsersPage() {
  const s = useSession();
  const { data, error, reload } = useLoad<U[]>(() => api("/api/users"));
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<null | "new" | U["user"]>(null);
  const [pw, setPw] = useState<null | U["user"]>(null);
  const [del, setDel] = useState<null | U["user"]>(null);

  return (
    <Card title="User accounts" icon={<UsersIcon size={15} />} pad={false} actions={<Button size="sm" variant="primary" onClick={() => setEdit("new")}><Plus size={15} /> Add user</Button>}>
      {error && <div className="p-4"><PageError error={error} retry={reload} /></div>}
      <Table head={["User", "Role", "Status", "Last sign-in", "Home folder", ""]}>
        {data?.map(({ user: u, homeUsageBytes }) => (
          <tr key={u.id}>
            <td><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{u.displayName.slice(0, 2).toUpperCase()}</span><div><b className="block">{u.username}</b><small className="text-xs text-muted">{u.displayName}</small></div></div></td>
            <td><Pill tone={roleTone(u.role)}>{u.role === "ReadOnly" ? "Read only" : u.role}</Pill></td>
            <td>{u.disabled ? <Pill tone="warn" dot>Disabled</Pill> : u.locked ? <Pill tone="bad" dot>Locked</Pill> : <Pill tone="ok" dot>Active</Pill>}</td>
            <td className="text-muted">{rel(u.lastLoginAt)}</td>
            <td className="min-w-40">{u.quotaBytes ? <div className="grid gap-1"><span className="text-xs text-muted">{fmtBytes(homeUsageBytes)} / {fmtBytes(u.quotaBytes)}</span><Meter pct={(homeUsageBytes / u.quotaBytes) * 100} /></div> : <span className="text-xs text-muted">{fmtBytes(homeUsageBytes)} · no limit</span>}</td>
            <td className="whitespace-nowrap text-right">
              <Button size="sm" onClick={() => setEdit(u)}>Edit</Button>{" "}
              <Button size="sm" onClick={() => setPw(u)} title="Set password"><KeyRound size={14} /></Button>{" "}
              {u.id !== s.me.id && <>
                <Button size="sm" onClick={() => run(async () => { await api(`/api/users/${u.id}`, { method: "PATCH", body: { disabled: !u.disabled } }); reload(); }, u.disabled ? "User enabled" : "User disabled")}>{u.disabled ? <UserCheck size={14} /> : <UserX size={14} />}</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => setDel(u)}>Delete</Button>
              </>}
            </td>
          </tr>
        ))}
      </Table>
      {edit && <UserModal user={edit === "new" ? null : edit} busy={busy} onClose={() => setEdit(null)} onSave={(body) => run(async () => {
        if (edit === "new") await api("/api/users", { body }); else await api(`/api/users/${edit.id}`, { method: "PATCH", body });
        setEdit(null); reload();
      }, edit === "new" ? "User added" : "User saved")} />}
      {pw && <PasswordModal user={pw} onClose={() => setPw(null)} onSave={(password) => run(async () => { await api(`/api/users/${pw.id}/password`, { body: { password } }); setPw(null); }, "Password changed. The user was signed out everywhere.")} />}
      {del && <Confirm title={`Delete ${del.username}?`} confirmLabel="Delete user" onClose={() => setDel(null)}
        message={<>The account is removed and signed out. Files in <b>/users/{del.username}</b> stay on the drive.</>}
        onConfirm={() => run(async () => { await api(`/api/users/${del.id}`, { method: "DELETE" }); reload(); }, "User deleted")} />}
    </Card>
  );
}

function UserModal({ user, onSave, onClose, busy }: { user: U["user"] | null; onSave: (b: any) => void; onClose: () => void; busy: boolean }) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [role, setRole] = useState(user?.role ?? "User");
  const [quota, setQuota] = useState(user?.quotaBytes ?? 100e9);
  const [password, setPassword] = useState("");
  return (
    <Modal title={user ? `Edit ${user.username}` : "Add user"} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => onSave(user ? { displayName, role, quotaBytes: quota } : { username, displayName, role, password, quotaBytes: quota })}>{user ? "Save" : "Add user"}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Username"><input className={inputCls} value={username} disabled={!!user} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="off" /></Field>
        <Field label="Display name"><input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Role" hint={ROLES.find((r) => r[0] === role)?.[1]}><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([r]) => <option key={r} value={r}>{r === "ReadOnly" ? "Read only" : r}</option>)}</select></Field></div>
        <Field label="Home folder quota"><select className={inputCls} value={quota} onChange={(e) => setQuota(Number(e.target.value))}>{QUOTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {!user && <Field label="Password" hint="At least 10 characters."><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>}
      </div>
      <p className="mb-0 mt-3.5 text-xs text-muted">Choose which shared folders this user can open in <b>Shared Folders</b>.</p>
    </Modal>
  );
}

function PasswordModal({ user, onSave, onClose }: { user: U["user"]; onSave: (pw: string) => void; onClose: () => void }) {
  const [pw, setPw] = useState("");
  return (
    <Modal title={`Set password for ${user.username}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={pw.length < 10} onClick={() => onSave(pw)}>Set password</Button></>}>
      <Field label="New password" hint="At least 10 characters. The user will be signed out of all devices."><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" /></Field>
    </Modal>
  );
}
