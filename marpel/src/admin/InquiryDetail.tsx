import { ArrowLeft, Building2, Calendar, FilePlus2, FolderPlus, Mail, MessageSquarePlus, Phone, StickyNote, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AttachmentList, Avatar, Badge, Button, Card, CardHeader, Field, Select, StatusBadge, Tabs, Textarea } from '../components/ui';
import { actorOf, audit, newQuotation, setInquiryStatus } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { INQUIRY_STATUSES, type CommChannel, type Inquiry } from '../lib/types';
import { clean, fmtDateTime, money, quoteTotals, timeAgo, uid } from '../lib/utils';
import { ProjectFormModal } from './ProjectForm';
import { isMgmt, userName } from './shared';

const CHANNELS: CommChannel[] = ['Phone Call', 'Email', 'SMS', 'Viber/WhatsApp', 'Meeting', 'Live Chat'];

export default function InquiryDetail() {
  const { id } = useParams();
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState<'notes' | 'comms' | 'history'>('notes');
  const [note, setNote] = useState('');
  const [comm, setComm] = useState({ channel: 'Phone Call' as CommChannel, direction: 'Outbound' as 'Outbound' | 'Inbound', summary: '' });
  const [convert, setConvert] = useState(false);
  const inq = db.inquiries.find((i) => i.id === id);
  if (!inq || !user || (user.role === 'staff' && inq.assignedTo !== user.id))
    return (
      <div className="py-24 text-center text-slate-400">
        Inquiry not found or not assigned to you.{' '}
        <Link to="/admin/inquiries" className="text-gold-200 underline">
          Back to inquiries
        </Link>
      </div>
    );
  const actor = actorOf(user);
  const customer = db.customers.find((c) => c.id === inq.customerId);
  const quote = inq.quotationId ? db.quotations.find((q) => q.id === inq.quotationId) : undefined;
  const project = inq.projectId ? db.projects.find((p) => p.id === inq.projectId) : undefined;
  const otherInquiries = db.inquiries.filter((i) => i.customerId === inq.customerId && i.id !== inq.id);
  const convs = db.conversations.filter((c) => c.customerId && c.customerId === inq.customerId);

  const mutate = (fn: (i: Inquiry) => void) =>
    update((d) => {
      const x = d.inquiries.find((y) => y.id === inq.id);
      if (x) {
        fn(x);
        x.updatedAt = new Date().toISOString();
      }
    });

  return (
    <>
      <Link to="/admin/inquiries" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
        <ArrowLeft className="h-4 w-4" /> Inquiries
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-gold-200">{inq.ref}</span>
            <StatusBadge status={inq.status} />
            <Badge tone="slate">{inq.source}</Badge>
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold text-white">{inq.title}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {inq.service} · received {fmtDateTime(inq.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isMgmt(user) && !quote && (
            <Button
              icon={<FilePlus2 className="h-4 w-4" />}
              onClick={() => {
                let qid = '';
                update((d) => {
                  qid = newQuotation(d, { customerId: inq.customerId!, inquiryId: inq.id, title: inq.title, serviceCategory: inq.service, preparedBy: user.id }, actor).id;
                });
                nav(`/admin/quotations/${qid}`);
              }}
            >
              Create quotation
            </Button>
          )}
          {isMgmt(user) && !project && (
            <Button variant={inq.status === 'Approved' ? 'gold' : 'subtle'} icon={<FolderPlus className="h-4 w-4" />} onClick={() => setConvert(true)} title={inq.status !== 'Approved' ? 'Usually done once the inquiry is Approved' : undefined}>
              Convert to project
            </Button>
          )}
          <a href={`mailto:${inq.email}?subject=${encodeURIComponent(`Re: ${inq.title} (${inq.ref})`)}`}>
            <Button icon={<Mail className="h-4 w-4" />}>Email</Button>
          </a>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Request details" />
            <div className="grid gap-5 p-5 sm:grid-cols-3">
              {[
                { icon: Wallet, label: 'Estimated budget', value: inq.budget },
                { icon: Calendar, label: 'Preferred schedule', value: inq.schedule },
                { icon: Building2, label: 'Company', value: inq.company || '—' },
              ].map((x) => (
                <div key={x.label}>
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
                    <x.icon className="h-3.5 w-3.5" /> {x.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{x.value}</p>
                </div>
              ))}
              <div className="sm:col-span-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Project description</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">{inq.description || '—'}</p>
              </div>
              <div className="sm:col-span-3">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Attachments ({inq.attachments.length})</p>
                {inq.attachments.length ? <AttachmentList items={inq.attachments} /> : <p className="text-sm text-slate-500">No files attached.</p>}
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-white/[0.06] p-4">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'notes', label: 'Internal notes', count: inq.notes.length },
                  { value: 'comms', label: 'Communication log', count: inq.communications.length },
                  { value: 'history', label: 'History', count: inq.history.length },
                ]}
              />
            </div>
            <div className="p-5">
              {tab === 'notes' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note (not visible to the customer)…" />
                    <Button
                      variant="gold"
                      icon={<StickyNote className="h-4 w-4" />}
                      disabled={!note.trim()}
                      onClick={() => {
                        mutate((x) => x.notes.unshift({ id: uid('n_'), at: new Date().toISOString(), by: user.name, text: clean(note, 3000) }));
                        setNote('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {inq.notes.map((n) => (
                    <div key={n.id} className="rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3">
                      <p className="whitespace-pre-line text-sm text-slate-200">{n.text}</p>
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        {n.by} · {timeAgo(n.at)}
                      </p>
                    </div>
                  ))}
                  {!inq.notes.length && <p className="text-sm text-slate-500">No notes yet.</p>}
                </div>
              )}
              {tab === 'comms' && (
                <div className="space-y-4">
                  <div className="grid gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:grid-cols-[150px_120px_1fr_auto]">
                    <Select value={comm.channel} onChange={(e) => setComm({ ...comm, channel: e.target.value as CommChannel })} aria-label="Channel">
                      {CHANNELS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                    <Select value={comm.direction} onChange={(e) => setComm({ ...comm, direction: e.target.value as 'Outbound' })} aria-label="Direction">
                      <option>Outbound</option>
                      <option>Inbound</option>
                    </Select>
                    <input value={comm.summary} onChange={(e) => setComm({ ...comm, summary: e.target.value })} placeholder="Summary of the conversation…" className="h-10 rounded-xl border border-white/10 bg-navy-900/70 px-3 text-sm text-slate-100 outline-none focus:border-gold-400/60" />
                    <Button
                      variant="gold"
                      icon={<MessageSquarePlus className="h-4 w-4" />}
                      disabled={!comm.summary.trim()}
                      onClick={() => {
                        const entry = { id: uid('cm_'), at: new Date().toISOString(), by: user.name, channel: comm.channel, direction: comm.direction, summary: clean(comm.summary, 2000) };
                        update((d) => {
                          const x = d.inquiries.find((y) => y.id === inq.id)!;
                          x.communications.unshift(entry);
                          x.history.push({ id: uid('h_'), at: entry.at, by: user.name, text: `Logged ${comm.direction.toLowerCase()} ${comm.channel.toLowerCase()}` });
                          const c = d.customers.find((y) => y.id === inq.customerId);
                          if (c) c.communications.unshift(entry);
                          if (x.status === 'New' || x.status === 'Pending') setInquiryStatus(d, x.id, 'Contacted', actor);
                        });
                        setComm({ ...comm, summary: '' });
                      }}
                    >
                      Log
                    </Button>
                  </div>
                  {inq.communications.map((c) => (
                    <div key={c.id} className="flex gap-3 rounded-xl border border-white/[0.06] p-3">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                      <div>
                        <p className="text-sm text-slate-200">{c.summary}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {c.direction} · {c.channel} · {c.by} · {fmtDateTime(c.at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!inq.communications.length && <p className="text-sm text-slate-500">No communication recorded yet.</p>}
                </div>
              )}
              {tab === 'history' && (
                <ol className="relative space-y-4 border-l border-white/10 pl-5">
                  {[...inq.history].reverse().map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-navy-850 bg-gold-400" />
                      <p className="text-sm text-slate-200">{h.text}</p>
                      <p className="text-[11px] text-slate-500">
                        {h.by} · {fmtDateTime(h.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Workflow" />
            <div className="space-y-4 p-5">
              <Field label="Status">
                <Select
                  value={inq.status}
                  onChange={(e) => {
                    const s = e.target.value as Inquiry['status'];
                    update((d) => setInquiryStatus(d, inq.id, s, actor));
                    push({ tone: 'success', title: `Status updated to ${s}` });
                  }}
                >
                  {INQUIRY_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Assigned staff">
                <Select
                  value={inq.assignedTo ?? ''}
                  disabled={!isMgmt(user)}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    update((d) => {
                      const x = d.inquiries.find((y) => y.id === inq.id)!;
                      x.assignedTo = v;
                      x.history.push({ id: uid('h_'), at: new Date().toISOString(), by: user.name, text: `Assigned to ${userName(d, v)}` });
                      audit(d, actor, `Assigned inquiry to ${userName(d, v)}`, x.ref);
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {db.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.title}
                      </option>
                    ))}
                </Select>
              </Field>
              {quote && (
                <Link to={`/admin/quotations/${quote.id}`} className="block rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-gold-400/40">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Quotation</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">{quote.number}</span>
                    <StatusBadge status={quote.status} />
                  </div>
                  <p className="text-xs text-gold-200">{money(quoteTotals(quote).total, db.settings.currencySymbol)}</p>
                </Link>
              )}
              {project && (
                <Link to={`/admin/projects/${project.id}`} className="block rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-gold-400/40">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Project</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">{project.code}</span>
                    <StatusBadge status={project.status} />
                  </div>
                </Link>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Customer" action={customer && isMgmt(user) ? <Link to={`/admin/customers/${customer.id}`} className="text-xs text-gold-200 hover:underline">Profile</Link> : undefined} />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center gap-3">
                <Avatar name={inq.name} size="lg" />
                <div>
                  <p className="font-medium text-white">{inq.name}</p>
                  <p className="text-xs text-slate-500">{inq.company || customer?.category}</p>
                </div>
              </div>
              <a href={`mailto:${inq.email}`} className="flex items-center gap-2 text-slate-300 hover:text-gold-200">
                <Mail className="h-4 w-4 text-slate-500" /> {inq.email}
              </a>
              <a href={`tel:${inq.mobile.replace(/\s/g, '')}`} className="flex items-center gap-2 text-slate-300 hover:text-gold-200">
                <Phone className="h-4 w-4 text-slate-500" /> {inq.mobile}
              </a>
              {otherInquiries.length > 0 && (
                <div className="border-t border-white/[0.06] pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Other inquiries ({otherInquiries.length})</p>
                  {otherInquiries.slice(0, 4).map((o) => (
                    <Link key={o.id} to={`/admin/inquiries/${o.id}`} className="flex items-center justify-between gap-2 py-1 text-xs text-slate-300 hover:text-gold-200">
                      <span className="truncate">{o.title}</span>
                      <StatusBadge status={o.status} />
                    </Link>
                  ))}
                </div>
              )}
              {convs.length > 0 && (
                <div className="border-t border-white/[0.06] pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Chat conversations</p>
                  {convs.map((c) => (
                    <Link key={c.id} to={`/admin/chat?c=${c.id}`} className="flex items-center justify-between gap-2 py-1 text-xs text-slate-300 hover:text-gold-200">
                      <span className="truncate">{c.topic}</span>
                      <StatusBadge status={c.status} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
      <ProjectFormModal
        open={convert}
        onClose={() => setConvert(false)}
        title="Convert inquiry to project"
        seed={{ name: inq.title, customerId: inq.customerId, category: db.stageTemplates[inq.service] ? inq.service : Object.keys(db.stageTemplates)[0], description: inq.description, budget: quote ? quoteTotals(quote).total : 0, inquiryId: inq.id, quotationId: quote?.status === 'Approved' ? quote.id : undefined }}
      />
    </>
  );
}
