import { ArrowLeft, Banknote, CheckCircle2, Circle, Copy, ExternalLink, Eye, EyeOff, ImagePlus, KeyRound, Loader2, Mail, Plus, Send, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AttachmentList, AttachmentPicker, Avatar, Badge, Button, Card, CardHeader, Field, IconButton, Input, Modal, Progress, Select, StatusBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit, postProjectUpdate, projectProgress, sendEmail } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import { PROJECT_STATUSES, type Milestone, type Project } from '../lib/types';
import { clean, cx, fmtDate, fmtDateTime, imageToDataUrl, money, timeAgo, todayYMD, uid } from '../lib/utils';
import { isMgmt, userName } from './shared';

export default function ProjectDetail() {
  const { id } = useParams();
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<'updates' | 'details' | 'activity'>('updates');
  const [upd, setUpd] = useState({ title: '', body: '', visible: true, images: [] as string[] });
  const [pay, setPay] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [newMs, setNewMs] = useState('');
  const imgRef = useRef<HTMLInputElement>(null);
  const p = db.projects.find((x) => x.id === id);
  if (!p || !user || (user.role === 'staff' && !p.staffIds.includes(user.id) && p.managerId !== user.id)) return <div className="py-24 text-center text-slate-400">Project not found or not assigned to you.</div>;
  const actor = actorOf(user);
  const mgmt = isMgmt(user);
  const pct = projectProgress(p);
  const customer = db.customers.find((c) => c.id === p.customerId);
  const sym = db.settings.currencySymbol;
  const trackUrl = `${window.location.origin}${window.location.pathname}#/track`;

  const mutate = (fn: (x: Project) => void, log?: string) =>
    update((d) => {
      const x = d.projects.find((y) => y.id === p.id)!;
      fn(x);
      if (log) {
        x.activity.unshift({ id: uid('h_'), at: new Date().toISOString(), by: user.name, text: log });
        audit(d, actor, log, x.code);
      }
    });

  const setMilestone = (mid: string, status: Milestone['status']) =>
    mutate((x) => {
      const ms = x.milestones.find((m) => m.id === mid)!;
      ms.status = status;
      ms.completedAt = status === 'done' ? new Date().toISOString() : undefined;
      // auto-advance: next pending becomes active
      if (status === 'done') {
        const next = x.milestones.find((m) => m.status === 'pending');
        if (next && !x.milestones.some((m) => m.status === 'active')) next.status = 'active';
        if (x.status === 'Approved' || x.status === 'Planning') x.status = 'In Progress';
      }
      if (x.milestones.every((m) => m.status === 'done') && x.status !== 'Completed') {
        x.status = 'Completed';
        x.completedDate = todayYMD();
      }
    }, `Milestone "${p.milestones.find((m) => m.id === mid)?.name}" → ${status === 'done' ? 'completed' : status}`);

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      if (!f.type.startsWith('image/')) continue;
      out.push(await imageToDataUrl(f, 1000, 0.75));
    }
    setUpd((u) => ({ ...u, images: [...u.images, ...out].slice(0, 6) }));
  };

  return (
    <>
      <Link to="/admin/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-gold-200">{p.code}</span>
            <StatusBadge status={p.status} />
            <Badge tone="slate">{p.category}</Badge>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold text-white">{p.name}</h1>
          <p className="text-sm text-slate-400">
            {customer && mgmt ? (
              <Link to={`/admin/customers/${customer.id}`} className="hover:text-gold-200">
                {customer.name}
                {customer.company ? ` · ${customer.company}` : ''}
              </Link>
            ) : (
              customer?.name
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={p.status}
            onChange={(e) => {
              const s = e.target.value as Project['status'];
              mutate((x) => {
                x.status = s;
                if (s === 'Completed') {
                  x.completedDate = todayYMD();
                  x.milestones.forEach((m) => {
                    if (m.status !== 'done') {
                      m.status = 'done';
                      m.completedAt = new Date().toISOString();
                    }
                  });
                }
              }, `Status changed to ${s}`);
              push({ tone: 'success', title: `Project marked ${s}` });
            }}
            className="w-44"
            aria-label="Project status"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          {mgmt && (
            <Button icon={<Banknote className="h-4 w-4" />} onClick={() => setPay('')}>
              Record payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-6">
              <div className="min-w-[200px] flex-1">
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-500">Overall progress</span>
                  <span className="font-display text-2xl font-semibold text-white">{pct}%</span>
                </div>
                <Progress value={pct} />
                <div className="mt-3 flex items-center gap-4">
                  <Toggle checked={p.progressMode === 'manual'} onChange={(v) => mutate((x) => (x.progressMode = v ? 'manual' : 'auto'), v ? 'Switched to manual progress' : 'Switched to milestone-based progress')} label="Manual progress" />
                  {p.progressMode === 'manual' && <input type="range" min={0} max={100} value={p.manualProgress} onChange={(e) => mutate((x) => (x.manualProgress = Number(e.target.value)))} className="flex-1 accent-[#d8ae5a]" aria-label="Manual progress" />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <span className="text-slate-500">Start</span>
                <span className="text-slate-200">{fmtDate(p.startDate)}</span>
                <span className="text-slate-500">Target</span>
                <span className={cx(p.targetDate < todayYMD() && !['Completed', 'Cancelled'].includes(p.status) ? 'text-rose-300' : 'text-slate-200')}>{fmtDate(p.targetDate)}</span>
                {p.completedDate && (
                  <>
                    <span className="text-slate-500">Completed</span>
                    <span className="text-emerald-300">{fmtDate(p.completedDate)}</span>
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Milestones & timeline" subtitle="Click a stage to update it — customers see these in their tracking portal." />
            <div className="p-5">
              <div className="mb-6 flex gap-1 overflow-x-auto pb-2">
                {p.milestones.map((m) => (
                  <div key={m.id} className="min-w-[90px] flex-1">
                    <div className={cx('h-2 rounded-full', m.status === 'done' ? 'bg-gold-400' : m.status === 'active' ? 'bg-gradient-to-r from-gold-400 to-white/10' : 'bg-white/10')} />
                    <p className={cx('mt-1.5 truncate text-[11px]', m.status === 'pending' ? 'text-slate-600' : 'text-slate-300')}>{m.name}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {p.milestones.map((m, i) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <button type="button" onClick={() => setMilestone(m.id, m.status === 'done' ? 'active' : 'done')} title={m.status === 'done' ? 'Mark not done' : 'Mark done'} className={cx('flex h-7 w-7 items-center justify-center rounded-full', m.status === 'done' ? 'bg-gold-400 text-navy-950' : m.status === 'active' ? 'bg-gold-400/20 text-gold-200 ring-2 ring-gold-400/50' : 'bg-navy-800 text-slate-600 ring-1 ring-white/10')}>
                      {m.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : m.status === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin [animation-duration:2.5s]" /> : <Circle className="h-3 w-3" />}
                    </button>
                    <input
                      value={m.name}
                      onChange={(e) => mutate((x) => (x.milestones[i]!.name = e.target.value))}
                      className="min-w-[160px] flex-1 bg-transparent text-sm text-slate-100 outline-none"
                      aria-label="Milestone name"
                    />
                    <Select value={m.status} onChange={(e) => setMilestone(m.id, e.target.value as Milestone['status'])} className="h-8 w-32 text-xs" aria-label="Milestone status">
                      <option value="pending">Pending</option>
                      <option value="active">In progress</option>
                      <option value="done">Done</option>
                    </Select>
                    <input type="date" value={m.dueDate ?? ''} onChange={(e) => mutate((x) => (x.milestones[i]!.dueDate = e.target.value))} className="h-8 rounded-lg border border-white/10 bg-navy-900 px-2 text-xs text-slate-300" aria-label="Due date" />
                    <IconButton label="Remove milestone" onClick={() => mutate((x) => (x.milestones = x.milestones.filter((y) => y.id !== m.id)), `Removed milestone "${m.name}"`)} className="h-8 w-8 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Input value={newMs} onChange={(e) => setNewMs(e.target.value)} placeholder="Add a custom stage…" onKeyDown={(e) => e.key === 'Enter' && newMs.trim() && (mutate((x) => x.milestones.push({ id: uid('ms_'), name: clean(newMs, 80), status: 'pending' }), `Added milestone "${newMs}"`), setNewMs(''))} />
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  disabled={!newMs.trim()}
                  onClick={() => {
                    mutate((x) => x.milestones.push({ id: uid('ms_'), name: clean(newMs, 80), status: 'pending' }), `Added milestone "${newMs}"`);
                    setNewMs('');
                  }}
                >
                  Add stage
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-white/[0.06] p-4">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'updates', label: 'Updates', count: p.updates.length },
                  { value: 'details', label: 'Details & files' },
                  { value: 'activity', label: 'Activity history', count: p.activity.length },
                ]}
              />
            </div>
            <div className="p-5">
              {tab === 'updates' && (
                <div className="space-y-5">
                  <div className="space-y-3 rounded-2xl border border-gold-400/20 bg-gold-400/[0.03] p-4">
                    <Input value={upd.title} onChange={(e) => setUpd({ ...upd, title: e.target.value })} placeholder="Update title (e.g. Cameras installed at main branch)" />
                    <Textarea rows={3} value={upd.body} onChange={(e) => setUpd({ ...upd, body: e.target.value })} placeholder="What was done, what’s next…" />
                    {upd.images.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {upd.images.map((im, i) => (
                          <div key={i} className="relative">
                            <img src={im} alt="" className="h-16 w-24 rounded-lg object-cover" />
                            <button type="button" onClick={() => setUpd({ ...upd, images: upd.images.filter((_, j) => j !== i) })} className="absolute -right-1.5 -top-1.5 rounded-full bg-navy-950 p-0.5 text-slate-300" aria-label="Remove image">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addImages(e.target.files), (e.target.value = ''))} />
                      <Button size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => imgRef.current?.click()}>
                        Progress photos
                      </Button>
                      <div className="w-60">
                        <Toggle checked={upd.visible} onChange={(v) => setUpd({ ...upd, visible: v })} label="Visible to customer" description={upd.visible ? 'Shown in portal + email sent' : 'Internal only'} />
                      </div>
                      <Button
                        variant="gold"
                        size="sm"
                        className="ml-auto"
                        icon={<Send className="h-3.5 w-3.5" />}
                        disabled={!upd.title.trim() || !upd.body.trim()}
                        onClick={() => {
                          update((d) => postProjectUpdate(d, p.id, { title: clean(upd.title, 160), body: clean(upd.body, 4000), images: upd.images, visibleToCustomer: upd.visible }, actor));
                          setUpd({ title: '', body: '', visible: true, images: [] });
                          push({ tone: 'success', title: 'Update posted', body: upd.visible ? 'Customer notified by email (simulated).' : 'Saved as internal note.' });
                        }}
                      >
                        Post update
                      </Button>
                    </div>
                  </div>
                  {p.updates.map((u) => (
                    <div key={u.id} className="rounded-2xl border border-white/[0.06] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-white">{u.title}</p>
                        <span className="flex items-center gap-2">
                          {u.visibleToCustomer ? (
                            <Badge tone="green">
                              <Eye className="h-3 w-3" /> Customer
                            </Badge>
                          ) : (
                            <Badge tone="slate">
                              <EyeOff className="h-3 w-3" /> Internal
                            </Badge>
                          )}
                          <IconButton label="Delete update" className="h-7 w-7 hover:text-rose-300" onClick={() => mutate((x) => (x.updates = x.updates.filter((y) => y.id !== u.id)), `Deleted update "${u.title}"`)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm text-slate-400">{u.body}</p>
                      {u.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {u.images.map((im, i) => (
                            <img key={i} src={im} alt="" className="h-20 w-28 rounded-lg object-cover" />
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-slate-500">
                        {u.by} · {fmtDateTime(u.at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'details' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Project name" className="sm:col-span-2">
                    <Input value={p.name} onChange={(e) => mutate((x) => (x.name = e.target.value))} />
                  </Field>
                  <Field label="Start date">
                    <Input type="date" value={p.startDate} onChange={(e) => mutate((x) => (x.startDate = e.target.value))} />
                  </Field>
                  <Field label="Target completion">
                    <Input type="date" value={p.targetDate} onChange={(e) => mutate((x) => (x.targetDate = e.target.value), 'Changed target date')} />
                  </Field>
                  {mgmt && (
                    <Field label={`Budget (${db.settings.currency})`}>
                      <Input type="number" min={0} value={p.budget} onChange={(e) => mutate((x) => (x.budget = Number(e.target.value)))} />
                    </Field>
                  )}
                  <Field label="Category">
                    <Input value={p.category} disabled />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Textarea rows={3} value={p.description} onChange={(e) => mutate((x) => (x.description = e.target.value))} />
                  </Field>
                  <Field label="Internal project notes" className="sm:col-span-2">
                    <Textarea rows={3} value={p.notes} onChange={(e) => mutate((x) => (x.notes = e.target.value))} placeholder="Site access, contacts, risks…" />
                  </Field>
                  <Field label="Attachments" className="sm:col-span-2">
                    <AttachmentPicker value={p.attachments} onChange={(v) => mutate((x) => (x.attachments = v))} label="Upload contracts, plans, configs" />
                  </Field>
                </div>
              )}
              {tab === 'activity' && (
                <ol className="relative space-y-4 border-l border-white/10 pl-5">
                  {[...p.activity].sort((a, b) => b.at.localeCompare(a.at)).map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-navy-850 bg-gold-400" />
                      <p className="text-sm text-slate-200">{h.text}</p>
                      <p className="text-[11px] text-slate-500">
                        {h.by} · {timeAgo(h.at)}
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
            <CardHeader title="Customer tracking access" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Tracking reference</p>
                  <p className="font-mono text-gold-200">{p.trackingRef}</p>
                </div>
                <IconButton label="Copy reference" onClick={() => (navigator.clipboard?.writeText(p.trackingRef), push({ tone: 'info', title: 'Copied' }))}>
                  <Copy className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Access PIN</p>
                  <p className="font-mono text-slate-200">{showPin ? p.accessPin : '••••••'}</p>
                </div>
                <div className="flex">
                  <IconButton label={showPin ? 'Hide PIN' : 'Show PIN'} onClick={() => setShowPin(!showPin)}>
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </IconButton>
                  {mgmt && (
                    <IconButton label="Regenerate PIN" onClick={() => mutate((x) => (x.accessPin = String(100000 + Math.floor(Math.random() * 900000))), 'Regenerated customer access PIN')}>
                      <KeyRound className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  icon={<Mail className="h-3.5 w-3.5" />}
                  onClick={() => {
                    if (!customer) return;
                    update((d) => {
                      sendEmail(d, 'project_update', customer.email, `Track your project: ${p.name}`, `Hello ${customer.name.split(' ')[0]},\n\nYou can follow your project online at ${trackUrl}\n\nTracking reference: ${p.trackingRef}\nAccess PIN: ${p.accessPin}\n\n— ${d.settings.shortName}`);
                      audit(d, actor, 'Sent tracking details to customer', p.code);
                    });
                    push({ tone: 'success', title: 'Tracking details emailed', body: 'Simulated — see Email log.' });
                  }}
                >
                  Email details
                </Button>
                <a href="#/track" target="_blank" rel="noreferrer">
                  <Button size="sm" className="w-full" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                    Open portal
                  </Button>
                </a>
              </div>
              <p className="text-[11px] text-slate-500">Customers see milestones, progress and updates marked “visible to customer” only.</p>
            </div>
          </Card>

          {mgmt && (
            <Card>
              <CardHeader title="Financials" />
              <div className="space-y-2 p-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Budget / contract value</span>
                  <span className="tabular-nums text-slate-200">{money(p.budget, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recorded revenue</span>
                  <span className="tabular-nums text-emerald-300">{money(p.recordedRevenue, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Balance</span>
                  <span className="tabular-nums text-amber-200">{money(Math.max(0, p.budget - p.recordedRevenue), sym)}</span>
                </div>
                <Progress value={p.budget ? (p.recordedRevenue / p.budget) * 100 : 0} size="sm" className="mt-2" />
                {p.quotationId && (
                  <Link to={`/admin/quotations/${p.quotationId}`} className="block pt-2 text-xs text-gold-200 hover:underline">
                    View source quotation
                  </Link>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Team" />
            <div className="space-y-4 p-5">
              <Field label="Project manager">
                <Select value={p.managerId} disabled={!mgmt} onChange={(e) => mutate((x) => (x.managerId = e.target.value), `Project manager set to ${userName(db, e.target.value)}`)}>
                  {db.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Assigned staff</p>
                <div className="space-y-2">
                  {db.users
                    .filter((u) => u.active)
                    .map((u) => {
                      const on = p.staffIds.includes(u.id);
                      return (
                        <button key={u.id} type="button" disabled={!mgmt} onClick={() => mutate((x) => (x.staffIds = on ? x.staffIds.filter((s) => s !== u.id) : [...x.staffIds, u.id]), `${on ? 'Removed' : 'Assigned'} ${u.name}`)} className={cx('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition', on ? 'border-gold-400/40 bg-gold-400/[0.06]' : 'border-white/[0.06] opacity-60 hover:opacity-100')}>
                          <Avatar name={u.name} size="sm" />
                          <span className="flex-1">
                            <span className="block text-sm text-slate-200">{u.name}</span>
                            <span className="block text-[11px] text-slate-500">{u.title}</span>
                          </span>
                          {on && <CheckCircle2 className="h-4 w-4 text-gold-300" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </Card>
          {p.attachments.length > 0 && tab !== 'details' && (
            <Card>
              <CardHeader title="Files" />
              <div className="p-5">
                <AttachmentList items={p.attachments} />
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={pay !== null}
        onClose={() => setPay(null)}
        title="Record payment"
        subtitle="Adds to recorded revenue (actual money received)."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPay(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={!Number(pay)}
              onClick={() => {
                const amt = Math.abs(Number(pay));
                mutate((x) => (x.recordedRevenue += amt), `Payment of ${money(amt, sym)} recorded`);
                setPay(null);
                push({ tone: 'success', title: 'Payment recorded' });
              }}
            >
              Record
            </Button>
          </>
        }
      >
        <Field label={`Amount (${db.settings.currency})`} hint={`Outstanding balance: ${money(Math.max(0, p.budget - p.recordedRevenue), sym)}`}>
          <Input type="number" min={0} value={pay ?? ''} onChange={(e) => setPay(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}

