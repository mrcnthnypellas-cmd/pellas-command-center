import { DocHeader } from '../components/DocHeader';
import type { DB, Quotation } from '../lib/types';
import { fmtDate, money, quoteTotals } from '../lib/utils';

/** Branded, print-ready quotation (A4). Rendered on white for printing / PDF export. */
export function QuotationDoc({ db, q }: { db: DB; q: Quotation }) {
  const s = db.settings;
  const c = db.customers.find((x) => x.id === q.customerId);
  const prep = db.users.find((u) => u.id === q.preparedBy);
  const t = quoteTotals(q);
  const sym = s.currencySymbol;
  return (
    <div className="print-area mx-auto w-full max-w-[820px] bg-white text-[13px] text-slate-800 shadow-2xl">
      <DocHeader s={s} variant="dark" />
      <div className="flex items-end justify-between gap-6 px-10 pt-7">
        <p className="font-display text-[22px] font-semibold tracking-[0.24em] text-[#08101f]">QUOTATION</p>
        <p className="font-mono text-sm text-slate-600">{q.number}</p>
      </div>

      <div className="grid grid-cols-2 gap-8 px-10 pb-7 pt-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a97d2c]">Prepared for</p>
          <p className="mt-1.5 text-base font-semibold text-slate-900">{c?.name}</p>
          {c?.company && <p>{c.company}</p>}
          <p className="text-slate-600">{c?.address}</p>
          <p className="text-slate-600">
            {c?.email} · {c?.phone}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-right">
          <span className="text-slate-500">Date issued</span>
          <span className="font-medium">{fmtDate(q.issuedAt)}</span>
          <span className="text-slate-500">Valid until</span>
          <span className="font-medium">{fmtDate(q.expiresAt)}</span>
          <span className="text-slate-500">Prepared by</span>
          <span className="font-medium">{prep?.name}</span>
          <span className="text-slate-500">Service</span>
          <span className="font-medium">{q.serviceCategory}</span>
        </div>
      </div>

      <div className="px-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a97d2c]">Project</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{q.title}</p>
        {q.summary && <p className="mt-1 whitespace-pre-line text-slate-600">{q.summary}</p>}
      </div>

      <div className="px-10 py-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-200 align-top">
                <td className="py-2.5 pr-2 text-slate-400">{i + 1}</td>
                <td className="py-2.5 pr-2 text-slate-900">{it.description || <em className="text-slate-400">No description</em>}</td>
                <td className="py-2.5 pr-2 text-slate-500">{it.kind}</td>
                <td className="whitespace-nowrap py-2.5 pr-2 text-right tabular-nums">
                  {it.qty} {it.unit}
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{money(it.unitPrice, sym)}</td>
                <td className="py-2.5 text-right font-medium tabular-nums">{money(it.qty * it.unitPrice, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex justify-between gap-8">
          <div className="text-[11px] text-slate-500">
            <p className="font-semibold uppercase tracking-wider text-slate-600">Cost breakdown</p>
            {Object.entries(t.byKind)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <p key={k}>
                  {k}: {money(v, sym)}
                </p>
              ))}
          </div>
          <div className="w-72 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span className="tabular-nums">{money(t.subtotal, sym)}</span>
            </div>
            {t.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount{q.discountType === 'percent' ? ` (${q.discount}%)` : ''}</span>
                <span className="tabular-nums">−{money(t.discount, sym)}</span>
              </div>
            )}
            {q.taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {s.taxLabel} ({q.taxRate}%)
                </span>
                <span className="tabular-nums">{money(t.tax, sym)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between rounded bg-[#08101f] px-3 py-2.5 text-white">
              <span className="font-semibold">TOTAL</span>
              <span className="font-display text-base font-semibold tabular-nums text-[#e3c27a]">{money(t.total, sym)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 border-t border-slate-200 px-10 py-6 text-[11.5px]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a97d2c]">Payment terms</p>
          <p className="mt-1.5 whitespace-pre-line text-slate-600">{q.paymentTerms}</p>
          {q.notes && (
            <>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a97d2c]">Notes</p>
              <p className="mt-1.5 whitespace-pre-line text-slate-600">{q.notes}</p>
            </>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a97d2c]">Terms and conditions</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-600">
            {q.terms
              .split('\n')
              .filter(Boolean)
              .map((l, i) => (
                <li key={i}>{l}</li>
              ))}
          </ol>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-10 px-10 pb-10 pt-6 text-[11px]">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 font-medium text-slate-800">{prep?.name}</p>
          <p className="text-slate-500">
            {prep?.title}, {s.shortName}
          </p>
        </div>
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 font-medium text-slate-800">Conforme: {c?.name}</p>
          <p className="text-slate-500">Signature over printed name / date</p>
        </div>
      </div>
      <div className="bg-slate-100 px-10 py-3 text-center text-[10px] text-slate-500">Thank you for considering {s.businessName}. This quotation was generated electronically.</div>
    </div>
  );
}
