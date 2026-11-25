import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, FilePlus2, FileText, FolderKanban, Inbox, Mail, MapPin, MessagesSquare, Pencil, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, CardHeader, Progress, StatusBadge, Tabs } from '../components/ui';
import { actorOf, audit, newQuotation, projectProgress } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { fmtDate, fmtDateTime, fmtTime, money, quoteTotals } from '../lib/utils';
import { CustomerFormModal } from './Customers';
import { ProjectFormModal } from './ProjectForm';

function Row({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
        {children}
      </Link>
    </li>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [tab, setTab] = useState<'inquiries' | 'quotations' | 'projects' | 'appointments' | 'comms'>('inquiries');
  const c = db.customers.find((x) => x.id === id);
  if (!c || !user) return <div className="py-24 text-center text-slate-400">Customer not found.</div>;
  const sym = db.settings.currencySymbol;
  const inqs = db.inquiries.filter((i) => i.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const quotes = db.quotations.filter((q) => q.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const projects = db.projects.filter((p) => p.customerId === c.id);
  const appts = db.appointments.filter((a) => a.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const convs = db.conversations.filter((x) => x.customerId === c.id);
  const comms = [...c.communications, ...inqs.flatMap((i) => i.communications)].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i).sort((a, b) => b.at.localeCompare(a.at));
  const revenue = projects.reduce((n, p) => n + p.recordedRevenue, 0);

  return (
    <>
      <Link to="/admin/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>
      <Card className="mb-6 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-4">
            <Avatar name={c.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold text-white">{c.name}</h1>
                <Badge tone="gold">{c.category}</Badge>
                {c.archived && <Badge tone="orange">Archived</Badge>}
              </div>
              <p className="text-sm text-slate-400">{c.company || 'Individual customer'}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-gold-200">
                  <Mail className="h-3.5 w-3.5" /> {c.email}
                </a>
                <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-gold-200">
                  <Phone className="h-3.5 w-3.5" /> {c.phone || '—'}
                </a>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {c.address || '—'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Inquiries', inqs.length],
              ['Projects', projects.length],
              ['Recorded revenue', money(revenue, sym, 0)],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <p className="font-display text-lg font-semibold text-white">{v}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
          <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            icon={<FilePlus2 className="h-3.5 w-3.5" />}
            onClick={() => {
              let qid = '';
              update((d) => {
                qid = newQuotation(d, { customerId: c.id, title: 'New quotation', serviceCategory: db.services[0]!.name, preparedBy: user.id }, actorOf(user)).id;
              });
              nav(`/admin/quotations/${qid}`);
            }}
          >
            New quotation
          </Button>
          <Button size="sm" icon={<FolderKanban className="h-3.5 w-3.5" />} onClick={() => setNewProject(true)}>
            New project
          </Button>
          <Button
            size="sm"
            variant={c.archived ? 'outline' : 'danger'}
            icon={c.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            onClick={() => {
              update((d) => {
                const x = d.customers.find((y) => y.id === c.id)!;
                x.archived = !x.archived;
                audit(d, actorOf(user), x.archived ? 'Archived customer' : 'Restored customer', x.name);
              });
              push({ tone: 'success', title: c.archived ? 'Customer restored' : 'Customer archived' });
            }}
          >
            {c.archived ? 'Restore' : 'Archive'}
          </Button>
          <span className="ml-auto self-center text-xs text-slate-500">
            Registered {fmtDate(c.registeredAt)} · via {c.source}
          </span>
        </div>
        {c.notes && <p className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-sm text-slate-300">{c.notes}</p>}
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'inquiries', label: 'Inquiries', count: inqs.length },
          { value: 'quotations', label: 'Quotations', count: quotes.length },
          { value: 'projects', label: 'Projects', count: projects.length },
          { value: 'appointments', label: 'Appointments', count: appts.length },
          { value: 'comms', label: 'Communication', count: comms.length + convs.length },
        ]}
      />
      <Card>
        {tab === 'inquiries' && (
          <ul className="divide-y divide-white/[0.05]">
            {inqs.map((i) => (
              <Row key={i.id} to={`/admin/inquiries/${i.id}`}>
                <Inbox className="h-4 w-4 text-gold-300" />
                <span className="flex-1 text-sm text-slate-200">
                  {i.title} <span className="text-xs text-slate-500">· {i.ref}</span>
                </span>
                <span className="text-xs text-slate-500">{fmtDate(i.createdAt)}</span>
                <StatusBadge status={i.status} />
              </Row>
            ))}
            {!inqs.length && <li className="p-8 text-center text-sm text-slate-500">No inquiries.</li>}
          </ul>
        )}
        {tab === 'quotations' && (
          <ul className="divide-y divide-white/[0.05]">
            {quotes.map((q) => (
              <Row key={q.id} to={`/admin/quotations/${q.id}`}>
                <FileText className="h-4 w-4 text-gold-300" />
                <span className="flex-1 text-sm text-slate-200">
                  {q.title} <span className="text-xs text-slate-500">· {q.number}</span>
                </span>
                <span className="text-sm tabular-nums text-slate-300">{money(quoteTotals(q).total, sym)}</span>
                <StatusBadge status={q.status} />
              </Row>
            ))}
            {!quotes.length && <li className="p-8 text-center text-sm text-slate-500">No quotations.</li>}
          </ul>
        )}
        {tab === 'projects' && (
          <ul className="divide-y divide-white/[0.05]">
            {projects.map((p) => (
              <Row key={p.id} to={`/admin/projects/${p.id}`}>
                <FolderKanban className="h-4 w-4 text-gold-300" />
                <span className="flex-1">
                  <span className="block text-sm text-slate-200">{p.name}</span>
                  <Progress value={projectProgress(p)} size="sm" className="mt-1.5 max-w-xs" />
                </span>
                <span className="font-mono text-xs text-slate-500">{p.trackingRef}</span>
                <StatusBadge status={p.status} />
              </Row>
            ))}
            {!projects.length && <li className="p-8 text-center text-sm text-slate-500">No projects.</li>}
          </ul>
        )}
        {tab === 'appointments' && (
          <ul className="divide-y divide-white/[0.05]">
            {appts.map((a) => (
              <Row key={a.id} to={`/admin/appointments?a=${a.id}`}>
                <CalendarDays className="h-4 w-4 text-gold-300" />
                <span className="flex-1 text-sm text-slate-200">{a.type}</span>
                <span className="text-xs text-slate-500">
                  {fmtDate(a.date)} · {fmtTime(a.time)}
                </span>
                <StatusBadge status={a.status} />
              </Row>
            ))}
            {!appts.length && <li className="p-8 text-center text-sm text-slate-500">No appointments.</li>}
          </ul>
        )}
        {tab === 'comms' && (
          <div>
            {convs.length > 0 && (
              <>
                <CardHeader title="Chat conversations" />
                <ul className="divide-y divide-white/[0.05]">
                  {convs.map((x) => (
                    <Row key={x.id} to={`/admin/chat?c=${x.id}`}>
                      <MessagesSquare className="h-4 w-4 text-gold-300" />
                      <span className="flex-1 text-sm text-slate-200">{x.topic}</span>
                      <span className="text-xs text-slate-500">{x.messages.length} messages</span>
                      <StatusBadge status={x.status} />
                    </Row>
                  ))}
                </ul>
              </>
            )}
            <CardHeader title="Communication history" />
            <ul className="divide-y divide-white/[0.05]">
              {comms.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <p className="text-sm text-slate-200">{m.summary}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.direction} · {m.channel} · {m.by} · {fmtDateTime(m.at)}
                  </p>
                </li>
              ))}
              {!comms.length && <li className="p-8 text-center text-sm text-slate-500">No communication logged. Log calls and emails from an inquiry.</li>}
            </ul>
          </div>
        )}
      </Card>
      {editing && <CustomerFormModal open onClose={() => setEditing(false)} customer={c} />}
      <ProjectFormModal open={newProject} onClose={() => setNewProject(false)} seed={{ customerId: c.id }} />
    </>
  );
}
