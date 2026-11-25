import { Check, KeyRound, Minus, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader, SearchInput, Select, Table, Tabs, Td, Th, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { CAPABILITIES, ROLE_LABEL } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import type { Role, User } from '../lib/types';
import { clean, fmtDateTime, isEmail, timeAgo, uid } from '../lib/utils';

const ROLE_TONE: Record<Role, 'gold' | 'blue' | 'slate'> = { super_admin: 'gold', admin: 'blue', staff: 'slate' };

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-emerald-300" />;
  if (v === false) return <Minus className="mx-auto h-4 w-4 text-slate-600" />;
  return <span className="text-xs text-amber-200">{v}</span>;
}

export default function Users() {
  const { db, update } = useStore();
  const { user, expiresAt } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<'users' | 'roles' | 'audit'>('users');
  const [edit, setEdit] = useState<User | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const isNew = edit ? !db.users.some((u) => u.id === edit.id) : false;
  const audits = db.audit.filter((a) => !q || `${a.user} ${a.action} ${a.target}`.toLowerCase().includes(q.toLowerCase()));

  const save = () => {
    if (!edit) return;
    if (clean(edit.name).length < 2) return setErr('Name is required');
    if (!isEmail(edit.email)) return setErr('Valid email required');
    if (!/^[a-z0-9._-]{3,}$/.test(edit.username)) return setErr('Username: 3+ lowercase letters, numbers, . _ -');
    if (db.users.some((u) => u.username === edit.username && u.id !== edit.id)) return setErr('Username already taken');
    if (edit.password.length < 8) return setErr('Password must be at least 8 characters');
    const supers = db.users.filter((u) => u.role === 'super_admin' && u.active && u.id !== edit.id).length;
    if ((edit.role !== 'super_admin' || !edit.active) && db.users.find((u) => u.id === edit.id)?.role === 'super_admin' && supers === 0) return setErr('At least one active Super Administrator is required');
    if (edit.id === user?.id && !edit.active) return setErr('You cannot deactivate your own account');
    update((d) => {
      const i = d.users.findIndex((u) => u.id === edit.id);
      if (i >= 0) d.users[i] = edit;
      else d.users.push(edit);
      audit(d, actorOf(user), isNew ? `Created user (${ROLE_LABEL[edit.role]})` : 'Updated user', edit.name);
    });
    push({ tone: 'success', title: isNew ? 'User created' : 'User updated' });
    setEdit(null);
  };

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Staff accounts, role-based permissions and the audit log."
        actions={
          <Button
            variant="gold"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setErr('');
              setEdit({ id: uid('u_'), name: '', username: '', email: '', password: '', role: 'staff', title: '', phone: '', active: true, createdAt: new Date().toISOString() });
            }}
          >
            Add user
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'users', label: 'Users', count: db.users.length },
          { value: 'roles', label: 'Roles & permissions' },
          { value: 'audit', label: 'Audit log', count: db.audit.length },
        ]}
      />
      {tab === 'users' && (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Username</Th>
                <Th>Role</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.03]">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <div>
                        <p className="text-slate-100">
                          {u.name} {u.id === user?.id && <span className="text-xs text-gold-300">(you)</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {u.title} · {u.email}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{u.username}</Td>
                  <Td>
                    <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  </Td>
                  <Td className="text-xs">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</Td>
                  <Td>{u.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="slate" dot>Deactivated</Badge>}</Td>
                  <Td>
                    <Button
                      size="sm"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setErr('');
                        setEdit(structuredClone(u));
                      }}
                    >
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center gap-2 border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-gold-400" /> Your session expires {expiresAt ? fmtDateTime(new Date(expiresAt).toISOString()) : '—'} (8-hour timeout). Failed sign-ins are rate-limited.
          </div>
        </Card>
      )}
      {tab === 'roles' && (
        <Card>
          <CardHeader title="Permission matrix" subtitle="Enforced in navigation, routes and data scoping. Production enforces the same rules in the database (row-level security)." />
          <Table>
            <thead>
              <tr>
                <Th>Capability</Th>
                <Th className="text-center">Super Administrator</Th>
                <Th className="text-center">Administrator</Th>
                <Th className="text-center">Staff</Th>
                <Th className="text-center">Customer</Th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label}>
                  <Td className="text-slate-200">{c.label}</Td>
                  <Td className="text-center">
                    <Cell v={c.super_admin} />
                  </Td>
                  <Td className="text-center">
                    <Cell v={c.admin} />
                  </Td>
                  <Td className="text-center">
                    <Cell v={c.staff} />
                  </Td>
                  <Td className="text-center">
                    <Cell v={c.customer} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === 'audit' && (
        <Card>
          <div className="border-b border-white/[0.06] p-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search by user, action or record…" className="md:w-96" />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Action</Th>
                <Th>Record</Th>
              </tr>
            </thead>
            <tbody>
              {audits.slice(0, 100).map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.at)}</Td>
                  <Td className="text-slate-200">{a.user}</Td>
                  <Td>
                    <Badge tone={a.role === 'customer' || a.role === 'public' ? 'violet' : ROLE_TONE[a.role as Role] ?? 'slate'}>{a.role in ROLE_LABEL ? ROLE_LABEL[a.role as Role] : a.role}</Badge>
                  </Td>
                  <Td>{a.action}</Td>
                  <Td className="text-xs text-slate-400">{a.target}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={isNew ? 'Add user' : `Edit ${edit.name}`}
          size="lg"
          footer={
            <>
              {err && <span className="mr-auto self-center text-sm text-rose-300">{err}</span>}
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={save}>
                Save user
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Username" required>
              <Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Role">
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={isNew ? 'Password' : 'Reset password'} hint="Minimum 8 characters. Production: hashed by the auth provider; users reset via email.">
              <div className="flex gap-2">
                <Input type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                <Button icon={<KeyRound className="h-4 w-4" />} onClick={() => setEdit({ ...edit, password: Math.random().toString(36).slice(2, 8) + 'A!' + Math.floor(Math.random() * 90 + 10) })} title="Generate password" />
              </div>
            </Field>
            <div className="self-end pb-2">
              <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Account active" description="Deactivated users cannot sign in" />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
