import { Archive, Download, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pager, SearchInput, Select, Table, Td, Textarea, Th, Toggle, usePaged } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { CUSTOMER_CATEGORIES, type Customer } from '../lib/types';
import { clean, downloadCSV, fmtDate, isEmail, uid } from '../lib/utils';

export function CustomerFormModal({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: Customer }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const [f, setF] = useState(() => ({
    name: customer?.name ?? '',
    company: customer?.company ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    category: customer?.category ?? 'Small Business',
    notes: customer?.notes ?? '',
  }));
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (clean(f.name).length < 2) return setErr('Name is required');
    if (!isEmail(f.email)) return setErr('A valid email is required');
    if (db.customers.some((c) => c.email.toLowerCase() === f.email.trim().toLowerCase() && c.id !== customer?.id)) return setErr('Another customer already uses this email');
    let id = customer?.id ?? '';
    update((d) => {
      if (customer) {
        Object.assign(d.customers.find((c) => c.id === customer.id)!, { ...f, name: clean(f.name), email: f.email.trim() });
        audit(d, actorOf(user), 'Updated customer', f.name);
      } else {
        id = uid('c_');
        d.customers.push({ id, ...f, name: clean(f.name), email: f.email.trim(), category: f.category as Customer['category'], registeredAt: new Date().toISOString(), archived: false, source: 'Manual entry', communications: [] });
        audit(d, actorOf(user), 'Added customer', f.name);
      }
    });
    push({ tone: 'success', title: customer ? 'Customer updated' : 'Customer added' });
    onClose();
    if (!customer) nav(`/admin/customers/${id}`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'Edit customer' : 'Add customer'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={save}>
            Save customer
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" required>
          <Input value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Company">
          <Input value={f.company} onChange={set('company')} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={f.address} onChange={set('address')} />
        </Field>
        <Field label="Category">
          <Select value={f.category} onChange={set('category')}>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
      {err && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
    </Modal>
  );
}

export default function Customers() {
  const { db, update } = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const stats = useMemo(() => {
    const m = new Map<string, { inq: number; proj: number; value: number }>();
    for (const c of db.customers) m.set(c.id, { inq: 0, proj: 0, value: 0 });
    for (const i of db.inquiries) if (i.customerId && m.has(i.customerId)) m.get(i.customerId)!.inq++;
    for (const p of db.projects) {
      const s = m.get(p.customerId);
      if (s) {
        s.proj++;
        s.value += p.recordedRevenue;
      }
    }
    return m;
  }, [db.customers, db.inquiries, db.projects]);
  const rows = db.customers
    .filter((c) => c.archived === archived)
    .filter((c) => !cat || c.category === cat)
    .filter((c) => !q || `${c.name} ${c.company} ${c.email} ${c.phone} ${c.address}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const paged = usePaged(rows, 15);
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${db.customers.filter((c) => !c.archived).length} active customer records`}
        actions={
          <>
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                downloadCSV('customers.csv', [['Name', 'Company', 'Email', 'Phone', 'Address', 'Category', 'Registered', 'Inquiries', 'Projects', 'Recorded revenue'], ...rows.map((c) => [c.name, c.company, c.email, c.phone, c.address, c.category, fmtDate(c.registeredAt), stats.get(c.id)?.inq, stats.get(c.id)?.proj, stats.get(c.id)?.value])]);
                update((d) => audit(d, actorOf(user), 'Exported customers CSV', `${rows.length} rows`));
              }}
            >
              Export
            </Button>
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add customer
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 md:flex-row md:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Search customers…" className="md:w-80" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <div className="md:ml-auto">
            <Toggle checked={archived} onChange={setArchived} label="Show archived" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={archived ? <Archive className="h-6 w-6" /> : <Users className="h-6 w-6" />} title={archived ? 'No archived customers' : 'No customers found'} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Contact</Th>
                  <Th>Category</Th>
                  <Th>Registered</Th>
                  <Th className="text-right">Inquiries</Th>
                  <Th className="text-right">Projects</Th>
                  <Th className="text-right">Recorded revenue</Th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((c) => (
                  <tr key={c.id} onClick={() => nav(`/admin/customers/${c.id}`)} className="cursor-pointer hover:bg-white/[0.03]">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-slate-200">{c.name}</p>
                          <p className="truncate text-xs text-slate-500">{c.company || '—'}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <p className="text-xs">{c.email}</p>
                      <p className="text-xs text-slate-500">{c.phone}</p>
                    </Td>
                    <Td>
                      <Badge tone={c.category === 'Corporate' ? 'gold' : c.category === 'Government' ? 'blue' : c.category === 'Education' ? 'violet' : 'slate'}>{c.category}</Badge>
                    </Td>
                    <Td className="text-xs">{fmtDate(c.registeredAt)}</Td>
                    <Td className="text-right tabular-nums">{stats.get(c.id)?.inq}</Td>
                    <Td className="text-right tabular-nums">{stats.get(c.id)?.proj}</Td>
                    <Td className="text-right tabular-nums text-slate-200">{stats.get(c.id)?.value ? `${db.settings.currencySymbol}${stats.get(c.id)!.value.toLocaleString()}` : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
          </>
        )}
      </Card>
      {adding && <CustomerFormModal open onClose={() => setAdding(false)} />}
    </>
  );
}
