import { Download, Inbox, Paperclip, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pager, SearchInput, Select, StatusBadge, Table, Tabs, Td, Textarea, Th, usePaged } from '../components/ui';
import { actorOf, audit, submitInquiry } from '../lib/actions';
import { scopeInquiries } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import { INQUIRY_STATUSES, type LeadSource } from '../lib/types';
import { clean, downloadCSV, fmtDate, isEmail, timeAgo } from '../lib/utils';
import { BUDGET_OPTIONS } from '../public/sections';
import { isMgmt, userName } from './shared';

export default function Inquiries() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'All';
  const [q, setQ] = useState('');
  const [service, setService] = useState('');
  const [assignee, setAssignee] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [adding, setAdding] = useState(false);

  const scoped = user ? scopeInquiries(db, user) : [];
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return scoped
      .filter((i) => status === 'All' || i.status === status)
      .filter((i) => !service || i.service === service)
      .filter((i) => !assignee || (assignee === 'none' ? !i.assignedTo : i.assignedTo === assignee))
      .filter((i) => !source || i.source === source)
      .filter((i) => !t || `${i.ref} ${i.name} ${i.company} ${i.email} ${i.title} ${i.mobile}`.toLowerCase().includes(t))
      .sort((a, b) => (sort === 'new' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  }, [scoped, status, service, assignee, source, q, sort]);
  const paged = usePaged(rows, 15);

  const exportCsv = () => {
    downloadCSV(`inquiries-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Reference', 'Date', 'Name', 'Company', 'Email', 'Mobile', 'Service', 'Title', 'Budget', 'Status', 'Assigned to', 'Source'],
      ...rows.map((i) => [i.ref, fmtDate(i.createdAt), i.name, i.company, i.email, i.mobile, i.service, i.title, i.budget, i.status, userName(db, i.assignedTo), i.source]),
    ]);
    update((d) => audit(d, actorOf(user), 'Exported inquiries CSV', `${rows.length} rows`));
  };

  return (
    <>
      <PageHeader
        title="Inquiry management"
        subtitle={user?.role === 'staff' ? 'Inquiries assigned to you' : 'Every inquiry from the website, chat, AI assistant and walk-ins.'}
        actions={
          <>
            {isMgmt(user) && (
              <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
                Export CSV
              </Button>
            )}
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              New inquiry
            </Button>
          </>
        }
      />
      <Tabs
        value={status}
        onChange={(v) => {
          setParams(v === 'All' ? {} : { status: v });
          paged.setPage(1);
        }}
        className="mb-4"
        tabs={[{ value: 'All', label: 'All', count: scoped.length }, ...INQUIRY_STATUSES.map((s) => ({ value: s, label: s, count: scoped.filter((i) => i.status === s).length }))]}
      />
      <Card>
        <div className="grid gap-3 border-b border-white/[0.06] p-4 md:grid-cols-2 xl:grid-cols-5">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ref, company, email…" className="xl:col-span-2" />
          <Select value={service} onChange={(e) => setService(e.target.value)} aria-label="Filter by service">
            <option value="">All services</option>
            {db.services.map((s) => (
              <option key={s.id}>{s.name}</option>
            ))}
          </Select>
          {isMgmt(user) ? (
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by assignee">
              <option value="">Anyone assigned</option>
              <option value="none">Unassigned</option>
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
              <option value="">All sources</option>
              {['Website Form', 'AI Assistant', 'Live Chat', 'Booking Form', 'Walk-in', 'Phone', 'Referral'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old')} aria-label="Sort">
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
            </Select>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="No inquiries match" body="Try another status or clear the filters." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Customer</Th>
                  <Th>Project</Th>
                  <Th>Service</Th>
                  <Th>Assigned</Th>
                  <Th>Received</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((i) => (
                  <tr key={i.id} onClick={() => nav(`/admin/inquiries/${i.id}`)} className="cursor-pointer transition hover:bg-white/[0.03]">
                    <Td className="font-mono text-xs text-gold-200">{i.ref}</Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={i.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-slate-200">{i.name}</p>
                          <p className="truncate text-xs text-slate-500">{i.company || i.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="max-w-[240px]">
                      <p className="truncate text-slate-200">
                        {i.title} {i.attachments.length > 0 && <Paperclip className="inline h-3 w-3 text-slate-500" />}
                      </p>
                      <p className="text-xs text-slate-500">
                        {i.source} · {i.budget}
                      </p>
                    </Td>
                    <Td className="text-xs">{i.service}</Td>
                    <Td className="text-xs">{userName(db, i.assignedTo)}</Td>
                    <Td className="whitespace-nowrap text-xs" title={fmtDate(i.createdAt)}>
                      {timeAgo(i.createdAt)}
                    </Td>
                    <Td>
                      <StatusBadge status={i.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
          </>
        )}
      </Card>
      <NewInquiryModal
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(input) => {
          let id = '';
          update((d) => {
            const inq = submitInquiry(d, input);
            if (user?.role === 'staff') inq.assignedTo = user.id;
            inq.history.push({ id: crypto.randomUUID(), at: new Date().toISOString(), by: user?.name ?? 'Admin', text: 'Recorded manually by staff' });
            id = inq.id;
          });
          push({ tone: 'success', title: 'Inquiry recorded' });
          setAdding(false);
          nav(`/admin/inquiries/${id}`);
        }}
      />
    </>
  );
}

function NewInquiryModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (i: Parameters<typeof submitInquiry>[1]) => void }) {
  const { db } = useStore();
  const [f, setF] = useState({ name: '', email: '', mobile: '', company: '', service: db.services[0]?.name ?? '', title: '', description: '', budget: 'Not sure yet', schedule: '', source: 'Phone' as LeadSource });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a new inquiry"
      subtitle="For phone calls, walk-ins and referrals."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              if (clean(f.name).length < 2 || !isEmail(f.email) || clean(f.title).length < 3) return setErr('Name, a valid email and a title are required.');
              onSave({ ...f, name: clean(f.name), title: clean(f.title), description: clean(f.description), schedule: f.schedule || 'To be discussed', attachments: [] });
            }}
          >
            Save inquiry
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
          <Input value={f.email} onChange={set('email')} type="email" />
        </Field>
        <Field label="Mobile">
          <Input value={f.mobile} onChange={set('mobile')} />
        </Field>
        <Field label="Service">
          <Select value={f.service} onChange={set('service')}>
            {db.services.map((s) => (
              <option key={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={f.source} onChange={set('source')}>
            {['Phone', 'Walk-in', 'Referral', 'Website Form', 'Live Chat'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Project title" required className="sm:col-span-2">
          <Input value={f.title} onChange={set('title')} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={f.description} onChange={set('description')} rows={3} />
        </Field>
        <Field label="Budget">
          <Select value={f.budget} onChange={set('budget')}>
            {BUDGET_OPTIONS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred schedule">
          <Input value={f.schedule} onChange={set('schedule')} placeholder="e.g. next week" />
        </Field>
      </div>
      {err && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
    </Modal>
  );
}
