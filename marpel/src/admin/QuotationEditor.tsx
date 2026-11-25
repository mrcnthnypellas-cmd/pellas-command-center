import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy, Eye, FolderPlus, Mail, Pencil, Plus, Printer, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, ConfirmButton, Field, IconButton, Input, SimBadge, Select, StatusBadge, Textarea } from '../components/ui';
import { actorOf, audit, newQuotation, setQuotationStatus } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import type { LineKind, Quotation, QuoteItem } from '../lib/types';
import { fmtDateTime, money, quoteTotals, todayYMD, uid } from '../lib/utils';
import { ProjectFormModal } from './ProjectForm';
import { QuotationDoc } from './QuotationDoc';

const KINDS: LineKind[] = ['Service', 'Labor', 'Materials', 'Equipment'];

export default function QuotationEditor() {
  const { id } = useParams();
  return <Editor key={id} id={id ?? ''} />;
}

function Editor({ id }: { id: string }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const stored = db.quotations.find((q) => q.id === id);
  const [draft, setDraft] = useState<Quotation | null>(stored ? structuredClone(stored) : null);
  const [mode, setMode] = useState<'edit' | 'preview'>(stored && stored.status !== 'Draft' ? 'preview' : 'edit');
  const [convert, setConvert] = useState(false);
  if (!stored || !draft || !user) return <div className="py-24 text-center text-slate-400">Quotation not found.</div>;

  const actor = actorOf(user);
  const locked = stored.status !== 'Draft';
  const dirty = JSON.stringify({ ...draft, history: 0, status: 0, projectId: 0 }) !== JSON.stringify({ ...stored, history: 0, status: 0, projectId: 0 });
  const t = quoteTotals(draft);
  const sym = db.settings.currencySymbol;
  const customer = db.customers.find((c) => c.id === draft.customerId);
  const project = stored.projectId ? db.projects.find((p) => p.id === stored.projectId) : undefined;
  const svc = db.services.find((s) => s.name === draft.serviceCategory);

  const set = <K extends keyof Quotation>(k: K, v: Quotation[K]) => setDraft({ ...draft, [k]: v });
  const setItem = (iid: string, patch: Partial<QuoteItem>) => set('items', draft.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const items = [...draft.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
    set('items', items);
  };
  const save = () => {
    update((d) => {
      const i = d.quotations.findIndex((q) => q.id === draft.id);
      d.quotations[i] = { ...draft, status: d.quotations[i]!.status, history: [...d.quotations[i]!.history, { id: uid('h_'), at: new Date().toISOString(), by: user.name, text: 'Quotation edited' }] };
      audit(d, actor, 'Edited quotation', draft.number);
    });
    push({ tone: 'success', title: 'Quotation saved' });
  };
  const status = (s: Quotation['status']) => {
    if (dirty) save();
    update((d) => setQuotationStatus(d, stored.id, s, actor, t.total));
    push({ tone: 'success', title: `Marked as ${s}`, body: s === 'Sent' ? `Email to ${customer?.email} was simulated — see Notifications → Email log.` : undefined });
    if (s !== 'Draft') setMode('preview');
  };

  return (
    <>
      <div className="no-print">
        <Link to="/admin/quotations" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-gold-200">
          <ArrowLeft className="h-4 w-4" /> Quotations
        </Link>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-gold-200">{stored.number}</span>
              <StatusBadge status={stored.status} />
              {dirty && <Badge tone="amber">Unsaved changes</Badge>}
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-white">{draft.title}</h1>
            <p className="text-sm text-slate-400">
              {customer?.name}
              {customer?.company ? ` · ${customer.company}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-white/10 p-1">
              <button type="button" onClick={() => setMode('edit')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${mode === 'edit' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400'}`}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" onClick={() => setMode('preview')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${mode === 'preview' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400'}`}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => (setMode('preview'), setTimeout(() => window.print(), 150))}>
              Print / Save as PDF
            </Button>
            {!locked && (
              <Button variant="gold" icon={<Save className="h-4 w-4" />} onClick={save} disabled={!dirty}>
                Save
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {mode === 'preview' ? (
            <div className="overflow-x-auto rounded-2xl bg-slate-200/5 p-2 sm:p-6">
              <QuotationDoc db={db} q={draft} />
            </div>
          ) : (
            <div className="space-y-6">
              {locked && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
                  This quotation has been {stored.status.toLowerCase()} and is locked to protect what the customer received.
                  <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => status('Draft')}>
                    Revert to draft
                  </Button>
                </div>
              )}
              <Card>
                <CardHeader title="Quotation details" />
                <fieldset disabled={locked} className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Project title" className="sm:col-span-2">
                    <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
                  </Field>
                  <Field label="Customer">
                    <Select value={draft.customerId} onChange={(e) => set('customerId', e.target.value)}>
                      {db.customers
                        .filter((c) => !c.archived || c.id === draft.customerId)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.company ? ` — ${c.company}` : ''}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Service category">
                    <Select value={draft.serviceCategory} onChange={(e) => set('serviceCategory', e.target.value)}>
                      {db.services.map((s) => (
                        <option key={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Date issued">
                    <Input type="date" value={draft.issuedAt.slice(0, 10)} onChange={(e) => set('issuedAt', new Date(e.target.value + 'T09:00').toISOString())} />
                  </Field>
                  <Field label="Expiration date">
                    <Input type="date" min={todayYMD()} value={draft.expiresAt.slice(0, 10)} onChange={(e) => set('expiresAt', new Date(e.target.value + 'T23:59').toISOString())} />
                  </Field>
                  <Field label="Scope summary" className="sm:col-span-2">
                    <Textarea rows={2} value={draft.summary} onChange={(e) => set('summary', e.target.value)} />
                  </Field>
                </fieldset>
              </Card>

              <Card>
                <CardHeader
                  title="Itemised costs"
                  subtitle="Services, labor, materials and equipment"
                  action={
                    !locked &&
                    svc && (
                      <Select
                        value=""
                        onChange={(e) => {
                          const p = svc.packages.find((x) => x.id === e.target.value);
                          if (p) set('items', [...draft.items.filter((i) => i.description || i.unitPrice), { id: uid('qi_'), kind: 'Service', description: `${p.name} — ${p.features.join(', ')}`, qty: 1, unit: 'package', unitPrice: p.price ?? 0 }]);
                        }}
                        className="h-8 w-48 text-xs"
                        aria-label="Add from package"
                      >
                        <option value="">+ Add from package…</option>
                        {svc.packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2">Type</th>
                        <th className="px-2 py-2">Description</th>
                        <th className="w-20 px-2 py-2 text-right">Qty</th>
                        <th className="w-24 px-2 py-2">Unit</th>
                        <th className="w-32 px-2 py-2 text-right">Unit price</th>
                        <th className="w-32 px-2 py-2 text-right">Amount</th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((it, i) => (
                        <tr key={it.id} className="border-t border-white/[0.05]">
                          <td className="px-4 py-2">
                            <Select value={it.kind} disabled={locked} onChange={(e) => setItem(it.id, { kind: e.target.value as LineKind })} className="h-9 w-32 text-xs">
                              {KINDS.map((k) => (
                                <option key={k}>{k}</option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Input value={it.description} disabled={locked} onChange={(e) => setItem(it.id, { description: e.target.value })} className="h-9" placeholder="Item description" />
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" min={0} value={it.qty} disabled={locked} onChange={(e) => setItem(it.id, { qty: Math.max(0, Number(e.target.value)) })} className="h-9 text-right" />
                          </td>
                          <td className="px-2 py-2">
                            <Input value={it.unit} disabled={locked} onChange={(e) => setItem(it.id, { unit: e.target.value })} className="h-9" />
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" min={0} step="0.01" value={it.unitPrice} disabled={locked} onChange={(e) => setItem(it.id, { unitPrice: Math.max(0, Number(e.target.value)) })} className="h-9 text-right" />
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-100">{money(it.qty * it.unitPrice, sym)}</td>
                          <td className="px-2 py-2">
                            {!locked && (
                              <div className="flex">
                                <IconButton label="Move up" onClick={() => move(i, -1)} className="h-7 w-7">
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Move down" onClick={() => move(i, 1)} className="h-7 w-7">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Remove line" onClick={() => set('items', draft.items.filter((x) => x.id !== it.id))} className="h-7 w-7 hover:text-rose-300">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!locked && (
                  <div className="flex flex-wrap gap-2 border-t border-white/[0.05] p-4">
                    {KINDS.map((k) => (
                      <Button key={k} size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('items', [...draft.items, { id: uid('qi_'), kind: k, description: '', qty: 1, unit: k === 'Labor' ? 'lot' : k === 'Equipment' ? 'unit' : 'lot', unitPrice: 0 }])}>
                        {k}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="Pricing, terms & notes" />
                <fieldset disabled={locked} className="grid gap-4 p-5 sm:grid-cols-3">
                  <Field label="Discount type">
                    <Select value={draft.discountType} onChange={(e) => set('discountType', e.target.value as 'percent')}>
                      <option value="percent">Percent (%)</option>
                      <option value="amount">Fixed amount ({sym})</option>
                    </Select>
                  </Field>
                  <Field label="Discount">
                    <Input type="number" min={0} value={draft.discount} onChange={(e) => set('discount', Math.max(0, Number(e.target.value)))} />
                  </Field>
                  <Field label={`${db.settings.taxLabel} rate (%)`}>
                    <Input type="number" min={0} max={50} value={draft.taxRate} onChange={(e) => set('taxRate', Math.max(0, Number(e.target.value)))} />
                  </Field>
                  <Field label="Payment terms" className="sm:col-span-3">
                    <Textarea rows={2} value={draft.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
                  </Field>
                  <Field label="Terms and conditions" hint="One term per line" className="sm:col-span-3">
                    <Textarea rows={5} value={draft.terms} onChange={(e) => set('terms', e.target.value)} />
                  </Field>
                  <Field label="Notes to customer" className="sm:col-span-3">
                    <Textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                  </Field>
                </fieldset>
              </Card>
            </div>
          )}
        </div>

        <div className="no-print space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <div className="space-y-2 p-5 text-sm">
              {Object.entries(t.byKind).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-400">
                  <span>{k}</span>
                  <span className="tabular-nums">{money(v, sym)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-white/[0.06] pt-2 text-slate-300">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(t.subtotal, sym)}</span>
              </div>
              {t.discount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Discount</span>
                  <span className="tabular-nums">−{money(t.discount, sym)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>
                  {db.settings.taxLabel} ({draft.taxRate}%)
                </span>
                <span className="tabular-nums">{money(t.tax, sym)}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between rounded-xl bg-gold-400/10 px-3 py-3">
                <span className="font-medium text-gold-100">Total</span>
                <span className="font-display text-xl font-semibold tabular-nums text-gold-200">{money(t.total, sym)}</span>
              </div>
              <p className="text-[11px] text-slate-500">Projected amount — becomes recorded revenue only when payments are recorded on the project.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer approval" subtitle="Track where this quotation stands" action={<SimBadge>Email</SimBadge>} />
            <div className="grid gap-2 p-5">
              {stored.status === 'Draft' && (
                <Button variant="gold" icon={<Mail className="h-4 w-4" />} onClick={() => status('Sent')} disabled={!draft.items.some((i) => i.description && i.unitPrice > 0)}>
                  Send to customer
                </Button>
              )}
              {stored.status === 'Sent' && (
                <Button icon={<Eye className="h-4 w-4" />} onClick={() => status('Viewed')}>
                  Mark as viewed
                </Button>
              )}
              {['Sent', 'Viewed'].includes(stored.status) && (
                <>
                  <Button variant="gold" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => status('Approved')}>
                    Record approval
                  </Button>
                  <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => status('Rejected')}>
                    Record rejection
                  </Button>
                  <Button variant="ghost" onClick={() => status('Expired')}>
                    Mark expired
                  </Button>
                </>
              )}
              {stored.status === 'Approved' &&
                (project ? (
                  <Link to={`/admin/projects/${project.id}`}>
                    <Button className="w-full" icon={<FolderPlus className="h-4 w-4" />}>
                      Open project {project.code}
                    </Button>
                  </Link>
                ) : (
                  <Button variant="gold" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setConvert(true)}>
                    Convert to project
                  </Button>
                ))}
              {['Rejected', 'Expired'].includes(stored.status) && (
                <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => status('Draft')}>
                  Revise as draft
                </Button>
              )}
              <div className="mt-2 flex gap-2 border-t border-white/[0.06] pt-3">
                <Button
                  size="sm"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => {
                    let nid = '';
                    update((d) => {
                      const q = newQuotation(d, { customerId: draft.customerId, title: `${draft.title} (copy)`, serviceCategory: draft.serviceCategory, preparedBy: user.id }, actor);
                      Object.assign(q, { items: draft.items.map((i) => ({ ...i, id: uid('qi_') })), summary: draft.summary, discount: draft.discount, discountType: draft.discountType, taxRate: draft.taxRate, paymentTerms: draft.paymentTerms, terms: draft.terms, notes: draft.notes });
                      nid = q.id;
                    });
                    nav(`/admin/quotations/${nid}`);
                  }}
                >
                  Duplicate
                </Button>
                {stored.status === 'Draft' && (
                  <ConfirmButton
                    label="Delete quotation"
                    message="This draft quotation will be permanently removed."
                    onConfirm={() => {
                      update((d) => {
                        d.quotations = d.quotations.filter((q) => q.id !== stored.id);
                        d.inquiries.filter((i) => i.quotationId === stored.id).forEach((i) => (i.quotationId = undefined));
                        audit(d, actor, 'Deleted draft quotation', stored.number);
                      });
                      nav('/admin/quotations');
                    }}
                  >
                    Delete
                  </ConfirmButton>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <ol className="space-y-3 p-5">
              {[...stored.history].reverse().map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="text-slate-300">{h.text}</p>
                  <p className="text-[11px] text-slate-500">
                    {h.by} · {fmtDateTime(h.at)}
                  </p>
                </li>
              ))}
            </ol>
            {stored.inquiryId && (
              <div className="border-t border-white/[0.06] px-5 py-3 text-xs">
                <Link to={`/admin/inquiries/${stored.inquiryId}`} className="text-gold-200 hover:underline">
                  View source inquiry
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
      <ProjectFormModal open={convert} onClose={() => setConvert(false)} title="Convert approved quotation to project" seed={{ name: stored.title, customerId: stored.customerId, category: db.stageTemplates[stored.serviceCategory] ? stored.serviceCategory : Object.keys(db.stageTemplates)[0], description: stored.summary, budget: t.total, quotationId: stored.id, inquiryId: stored.inquiryId }} />
    </>
  );
}
