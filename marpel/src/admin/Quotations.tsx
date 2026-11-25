import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, Field, Modal, PageHeader, Pager, SearchInput, Select, StatusBadge, Table, Tabs, Td, Th, usePaged, Input } from '../components/ui';
import { actorOf, newQuotation } from '../lib/actions';
import { quotationPipeline } from '../lib/metrics';
import { useSession, useStore } from '../lib/store';
import { QUOTATION_STATUSES } from '../lib/types';
import { compactMoney, fmtDate, money, quoteTotals } from '../lib/utils';
import { customerOf } from './shared';

export default function Quotations() {
  const { db, update } = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'All';
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ customerId: '', title: '', service: db.services[0]?.name ?? '' });
  const sym = db.settings.currencySymbol;
  const rows = db.quotations
    .filter((x) => status === 'All' || x.status === status)
    .filter((x) => !q || `${x.number} ${x.title} ${customerOf(db, x.customerId)?.name} ${customerOf(db, x.customerId)?.company}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = usePaged(rows, 15);
  const pipe = quotationPipeline(db);
  const decided = db.quotations.filter((x) => x.status === 'Approved' || x.status === 'Rejected' || x.status === 'Expired');
  const winRate = decided.length ? Math.round((db.quotations.filter((x) => x.status === 'Approved').length / decided.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="Create, send and track itemised quotations."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New quotation
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Awaiting customer', compactMoney(pipe.open, sym), 'Sent + viewed — projected, not revenue'],
          ['Drafts', compactMoney(pipe.draft, sym), `${db.quotations.filter((x) => x.status === 'Draft').length} quotations`],
          ['Approved value', compactMoney(pipe.approved, sym), `${db.quotations.filter((x) => x.status === 'Approved').length} quotations`],
          ['Win rate', `${winRate}%`, 'Approved ÷ decided quotations'],
        ].map(([l, v, s]) => (
          <Card key={l} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{l}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">{v}</p>
            <p className="mt-1 text-xs text-slate-500">{s}</p>
          </Card>
        ))}
      </div>
      <Tabs value={status} onChange={(v) => setParams(v === 'All' ? {} : { status: v })} className="mb-4" tabs={[{ value: 'All', label: 'All', count: db.quotations.length }, ...QUOTATION_STATUSES.map((s) => ({ value: s, label: s, count: db.quotations.filter((x) => x.status === s).length }))]} />
      <Card>
        <div className="border-b border-white/[0.06] p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search number, title, customer…" className="md:w-96" />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No quotations" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Customer</Th>
                  <Th>Title</Th>
                  <Th>Issued</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((x) => {
                  const c = customerOf(db, x.customerId);
                  const expiring = ['Sent', 'Viewed'].includes(x.status) && new Date(x.expiresAt).getTime() - Date.now() < 5 * 864e5;
                  return (
                    <tr key={x.id} onClick={() => nav(`/admin/quotations/${x.id}`)} className="cursor-pointer hover:bg-white/[0.03]">
                      <Td className="font-mono text-xs text-gold-200">{x.number}</Td>
                      <Td>
                        <p className="text-slate-200">{c?.name}</p>
                        <p className="text-xs text-slate-500">{c?.company}</p>
                      </Td>
                      <Td className="max-w-[260px] truncate">{x.title}</Td>
                      <Td className="text-xs">{fmtDate(x.issuedAt)}</Td>
                      <Td className={`text-xs ${expiring ? 'text-amber-300' : ''}`}>{fmtDate(x.expiresAt)}</Td>
                      <Td className="text-right tabular-nums text-slate-100">{money(quoteTotals(x).total, sym)}</Td>
                      <Td>
                        <StatusBadge status={x.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
          </>
        )}
      </Card>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New quotation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={!nf.customerId || !nf.title.trim()}
              onClick={() => {
                let id = '';
                update((d) => {
                  id = newQuotation(d, { customerId: nf.customerId, title: nf.title.trim(), serviceCategory: nf.service, preparedBy: user!.id }, actorOf(user)).id;
                });
                nav(`/admin/quotations/${id}`);
              }}
            >
              Create & edit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Customer" required>
            <Select value={nf.customerId} onChange={(e) => setNf({ ...nf, customerId: e.target.value })}>
              <option value="">Select customer…</option>
              {db.customers
                .filter((c) => !c.archived)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Project title" required>
            <Input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} />
          </Field>
          <Field label="Service category">
            <Select value={nf.service} onChange={(e) => setNf({ ...nf, service: e.target.value })}>
              {db.services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
