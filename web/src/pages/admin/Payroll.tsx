import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Ban, CheckCircle, HandCoins, Banknote, ArrowLeft, Trash2, Clock, Users2, Receipt } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Button, Card, Modal, Input, Select, Spinner, EmptyState, IconStatCard } from "../../components/ui/ui";
import { formatDate, todayInTZ } from "../../lib/format";
import type { PayrollWorker, PayrollAdvance, PayrollOvertime, PayrollPayout } from "../../types";

const STANDARD_HOURS_PER_DAY = 8;

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Payroll() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [workers, setWorkers] = useState<PayrollWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [saving, setSaving] = useState(false);

  const [summary, setSummary] = useState({ outstandingAdvance: 0, outstandingOvertimePay: 0 });
  const [advancesByWorker, setAdvancesByWorker] = useState<{ workerId: string; name: string; amount: number; latestDate: string }[]>([]);

  const currentMonth = todayInTZ().slice(0, 7);
  const [periodFilter, setPeriodFilter] = useState(currentMonth);
  const [periodSummary, setPeriodSummary] = useState({
    daysWorked: 0, grossPay: 0, overtimeHours: 0, overtimePay: 0, advanceDeducted: 0, netPay: 0, payoutCount: 0,
  });

  const periodOptions: { value: string; label: string }[] = [{ value: "all", label: "All Time" }];
  {
    const [cy, cm] = currentMonth.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(cy, cm - 1 - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
      periodOptions.push({ value, label: i === 0 ? `${label} (this month)` : label });
    }
  }

  async function loadWorkers() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from("payroll_workers").select("*").eq("company_id", profile.company_id).order("name");
    setWorkers((data as PayrollWorker[]) ?? []);
    setLoading(false);
  }

  async function loadSummary() {
    if (!profile) return;
    const [{ data: advRows }, { data: otRows }] = await Promise.all([
      supabase
        .from("payroll_advances")
        .select("worker_id, amount, advance_date, payroll_workers(name)")
        .eq("company_id", profile.company_id)
        .eq("settled", false),
      supabase
        .from("payroll_overtime")
        .select("hours, payroll_workers(salary_per_day)")
        .eq("company_id", profile.company_id)
        .eq("settled", false),
    ]);
    const advances = (advRows ?? []) as unknown as { worker_id: string; amount: number; advance_date: string; payroll_workers: { name: string } | null }[];
    const outstandingAdvance = advances.reduce((sum, r) => sum + Number(r.amount), 0);
    const outstandingOvertimePay = (otRows ?? []).reduce((sum, r: unknown) => {
      const row = r as { hours: number; payroll_workers: { salary_per_day: number } | null };
      const hourlyRate = Number(row.payroll_workers?.salary_per_day ?? 0) / STANDARD_HOURS_PER_DAY;
      return sum + Number(row.hours) * hourlyRate;
    }, 0);
    setSummary({ outstandingAdvance, outstandingOvertimePay });

    const byWorker = new Map<string, { workerId: string; name: string; amount: number; latestDate: string }>();
    for (const a of advances) {
      const existing = byWorker.get(a.worker_id);
      const name = a.payroll_workers?.name ?? "—";
      if (existing) {
        existing.amount += Number(a.amount);
        if (a.advance_date > existing.latestDate) existing.latestDate = a.advance_date;
      } else {
        byWorker.set(a.worker_id, { workerId: a.worker_id, name, amount: Number(a.amount), latestDate: a.advance_date });
      }
    }
    setAdvancesByWorker(Array.from(byWorker.values()).sort((a, b) => b.amount - a.amount));
  }

  type SheetRow = {
    rowId: string; workerId: string; name: string; salaryPerDay: number; payDate: string;
    days: number; gross: number; otHours: number; otPay: number; advance: number; net: number; payoutId: string | null;
  };
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);

  async function loadPeriodSummary(period: string) {
    if (!profile) return;
    let query = supabase
      .from("payroll_payouts")
      .select("id, worker_id, days_worked, gross_pay, overtime_hours, overtime_pay, advance_deducted, net_pay, pay_date, payroll_workers(name, salary_per_day)")
      .eq("company_id", profile.company_id)
      .order("pay_date", { ascending: false });
    if (period !== "all") {
      const [y, m] = period.split("-").map(Number);
      const monthStart = `${period}-01`;
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      query = query.gte("pay_date", monthStart).lt("pay_date", nextMonth);
    }
    const { data } = await query;
    const rows = (data ?? []) as unknown as {
      id: string; worker_id: string; days_worked: number; gross_pay: number; overtime_hours: number; overtime_pay: number;
      advance_deducted: number; net_pay: number; pay_date: string; payroll_workers: { name: string; salary_per_day: number } | null;
    }[];

    const sheetList: SheetRow[] = rows.map((r) => ({
      rowId: r.id, workerId: r.worker_id, name: r.payroll_workers?.name ?? "—", salaryPerDay: Number(r.payroll_workers?.salary_per_day ?? 0),
      payDate: r.pay_date, days: Number(r.days_worked), gross: Number(r.gross_pay), otHours: Number(r.overtime_hours),
      otPay: Number(r.overtime_pay), advance: Number(r.advance_deducted), net: Number(r.net_pay), payoutId: r.id,
    }));
    // Include active workers with no payout this period, as an editable draft row.
    const workersWithPayout = new Set(rows.map((r) => r.worker_id));
    for (const w of workers) {
      if (w.is_active && !workersWithPayout.has(w.id)) {
        sheetList.push({
          rowId: `draft-${w.id}`, workerId: w.id, name: w.name, salaryPerDay: Number(w.salary_per_day), payDate: todayInTZ(),
          days: 0, gross: 0, otHours: 0, otPay: 0, advance: 0, net: 0, payoutId: null,
        });
      }
    }
    const sorted = sheetList.sort((a, b) => a.name.localeCompare(b.name) || b.payDate.localeCompare(a.payDate));
    setSheetRows(sorted);
    setPeriodSummary({
      daysWorked: sorted.reduce((sum, r) => sum + r.days, 0),
      grossPay: sorted.reduce((sum, r) => sum + r.gross, 0),
      overtimeHours: sorted.reduce((sum, r) => sum + r.otHours, 0),
      overtimePay: sorted.reduce((sum, r) => sum + r.otPay, 0),
      advanceDeducted: sorted.reduce((sum, r) => sum + r.advance, 0),
      netPay: sorted.reduce((sum, r) => sum + r.net, 0),
      payoutCount: rows.length,
    });
  }

  useEffect(() => {
    loadWorkers();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  useEffect(() => {
    loadPeriodSummary(periodFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, periodFilter, workers]);

  const activeWorkers = workers.filter((w) => w.is_active);
  const totalDailyPayroll = activeWorkers.reduce((sum, w) => sum + Number(w.salary_per_day), 0);

  async function addWorker() {
    if (!profile || !newName.trim() || !newRate) return;
    setSaving(true);
    const { error } = await supabase.from("payroll_workers").insert({
      company_id: profile.company_id,
      name: newName.trim(),
      salary_per_day: Number(newRate),
    });
    setSaving(false);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Worker Added", module: "Payroll", target: newName.trim(), details: { salary_per_day: Number(newRate) },
    });
    push("success", "Worker added.");
    setAddOpen(false);
    setNewName("");
    setNewRate("");
    loadWorkers();
  }

  async function toggleActive(w: PayrollWorker) {
    const { error } = await supabase.from("payroll_workers").update({ is_active: !w.is_active }).eq("id", w.id);
    if (error) return push("error", error.message);
    loadWorkers();
    loadSummary();
  }

  function selectWorker(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  type RowEdits = { days?: string; otHours?: string; advance?: string };
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdits>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  function fieldFor(row: SheetRow, field: keyof RowEdits, value: number) {
    const edit = rowEdits[row.rowId]?.[field];
    return edit ?? String(value || "");
  }

  function setField(rowId: string, field: keyof RowEdits, value: string) {
    setRowEdits((e) => ({ ...e, [rowId]: { ...e[rowId], [field]: value } }));
  }

  function clearEdits(rowId: string) {
    setRowEdits((e) => { const next = { ...e }; delete next[rowId]; return next; });
  }

  async function saveRow(row: SheetRow) {
    if (!profile) return;
    const edits = rowEdits[row.rowId];
    if (!edits) return;
    const days = edits.days !== undefined ? Number(edits.days) || 0 : row.days;

    setSavingRowId(row.rowId);

    if (row.payoutId) {
      const otHours = edits.otHours !== undefined ? Number(edits.otHours) || 0 : row.otHours;
      const advance = edits.advance !== undefined ? Number(edits.advance) || 0 : row.advance;
      if (days === row.days && otHours === row.otHours && advance === row.advance) {
        setSavingRowId(null);
        clearEdits(row.rowId);
        return;
      }
      const hourlyRate = row.salaryPerDay / STANDARD_HOURS_PER_DAY;
      const otPay = otHours * hourlyRate;
      const grossPay = days * row.salaryPerDay;
      const netPay = grossPay + otPay - advance;
      const { error } = await supabase
        .from("payroll_payouts")
        .update({ days_worked: days, gross_pay: grossPay, overtime_hours: otHours, overtime_pay: otPay, advance_deducted: advance, net_pay: netPay })
        .eq("id", row.payoutId);
      setSavingRowId(null);
      if (error) return push("error", error.message);
      push("success", `${row.name}: updated.`);
      clearEdits(row.rowId);
      loadPeriodSummary(periodFilter);
      return;
    }

    if (days <= 0) { setSavingRowId(null); return; }
    const worker = workers.find((w) => w.id === row.workerId);
    if (!worker) { setSavingRowId(null); return; }
    // Draft row (no payout yet): pull the worker's live unsettled advance/overtime so nothing is missed,
    // letting a manually typed OT Hours / Advance override that default.
    const [{ data: advRows }, { data: otRows }] = await Promise.all([
      supabase.from("payroll_advances").select("id, amount").eq("worker_id", row.workerId).eq("settled", false),
      supabase.from("payroll_overtime").select("id, hours").eq("worker_id", row.workerId).eq("settled", false),
    ]);
    const liveAdvance = (advRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
    const liveOtHours = (otRows ?? []).reduce((sum, r) => sum + Number(r.hours), 0);
    const otHours = edits.otHours !== undefined ? Number(edits.otHours) || 0 : liveOtHours;
    const advance = edits.advance !== undefined ? Number(edits.advance) || 0 : liveAdvance;
    const hourlyRate = Number(worker.salary_per_day) / STANDARD_HOURS_PER_DAY;
    const otPay = otHours * hourlyRate;
    const grossPay = days * Number(worker.salary_per_day);
    const netPay = grossPay + otPay - advance;
    const { data: payout, error } = await supabase
      .from("payroll_payouts")
      .insert({
        company_id: profile.company_id, worker_id: row.workerId, days_worked: days, salary_per_day: worker.salary_per_day,
        gross_pay: grossPay, advance_deducted: advance, overtime_hours: otHours, overtime_pay: otPay,
        net_pay: netPay, pay_date: todayInTZ(), created_by: profile.id,
      })
      .select()
      .single();
    if (error || !payout) {
      setSavingRowId(null);
      return push("error", error?.message ?? "Failed to record payout.");
    }
    // Only settle the live ledger rows actually used (i.e. the override wasn't lower than what's there) — settle all
    // unsettled rows regardless, since the payout above is this worker's record of the deduction either way.
    const advIds = (advRows ?? []).map((r) => r.id);
    if (advIds.length > 0) await supabase.from("payroll_advances").update({ settled: true, payout_id: payout.id }).in("id", advIds);
    const otIds = (otRows ?? []).map((r) => r.id);
    if (otIds.length > 0) await supabase.from("payroll_overtime").update({ settled: true, payout_id: payout.id }).in("id", otIds);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Payout Recorded", module: "Payroll", target: worker.name,
      details: { days_worked: days, gross_pay: grossPay, overtime_hours: otHours, overtime_pay: otPay, advance_deducted: advance, net_pay: netPay, pay_date: todayInTZ() },
    });
    setSavingRowId(null);
    push("success", `${worker.name}: payout recorded — ${peso(netPay)} net.`);
    clearEdits(row.rowId);
    loadSummary();
    loadPeriodSummary(periodFilter);
  }

  async function deleteRow(row: SheetRow) {
    if (!profile || !row.payoutId) return;
    if (!window.confirm(`Deleted ang payout na ito para kay ${row.name} (${peso(row.net)} net). Ibabalik ang anumang advance/overtime na na-deduct dito bilang "Pending" ulit. Sigurado ka ba?`)) return;
    setSavingRowId(row.rowId);
    await supabase.from("payroll_advances").update({ settled: false, payout_id: null }).eq("payout_id", row.payoutId);
    await supabase.from("payroll_overtime").update({ settled: false, payout_id: null }).eq("payout_id", row.payoutId);
    const { error } = await supabase.from("payroll_payouts").delete().eq("id", row.payoutId);
    setSavingRowId(null);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Payout Deleted", module: "Payroll", target: row.name, details: { net_pay: row.net, pay_date: row.payDate },
    });
    push("success", `${row.name}: payout deleted. Advance/overtime reverted to Pending.`);
    loadSummary();
    loadPeriodSummary(periodFilter);
  }

  const selectedWorker = workers.find((w) => w.id === selectedId) ?? null;

  if (loading || !profile) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Payroll</h1>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Worker</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IconStatCard label="Active Workers" value={activeWorkers.length} icon={Users2} tone="blue" />
        <IconStatCard label="Total Daily Payroll" value={peso(totalDailyPayroll)} icon={Wallet} tone="violet" />
        <IconStatCard label="Outstanding Advances" value={peso(summary.outstandingAdvance)} icon={HandCoins} tone="red" />
        <IconStatCard label="Outstanding Overtime Pay" value={peso(summary.outstandingOvertimePay)} icon={Clock} tone="amber" />
      </div>

      {advancesByWorker.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="flex items-center gap-2 font-semibold text-slate-700"><HandCoins className="h-4 w-4" /> Who Has Outstanding Advances</h3>
          <p className="text-sm text-slate-500">Kung kanino may hindi pa naibabawas na advance — mababawas ito awtomatiko sa susunod na payout.</p>
          <div className="flex flex-wrap gap-2">
            {advancesByWorker.map((a) => (
              <button
                key={a.workerId}
                onClick={() => selectWorker(a.workerId)}
                className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
                title={`Latest advance: ${formatDate(a.latestDate)}`}
              >
                <span className="font-medium">{a.name}</span>
                <span>— {peso(a.amount)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-semibold text-slate-700"><Receipt className="h-4 w-4" /> Payroll Sheet — All Workers</h3>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-400">
          Lahat editable — Days Worked (pwede half-day, hal. 4.5), OT Hours, at Advance. Awtomatikong kinakalkula ang Gross/Net Pay.
          May sariling row ang bawat payout, kaya kung may ilang payout na ang isang worker sa period na ito, makikita silang magkahiwalay — i-click ang 🗑 para i-delete ang isang payout (ibabalik sa "Pending" ang advance/overtime na kasama doon).
        </p>
        {sheetRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No workers or payouts for this period.</p>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Salary/Day</th>
                <th className="px-3 py-2">Days Worked</th>
                <th className="px-3 py-2">Gross Pay</th>
                <th className="px-3 py-2">OT Hours</th>
                <th className="px-3 py-2">OT Pay</th>
                <th className="px-3 py-2">Advance</th>
                <th className="px-3 py-2">Net Pay</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheetRows.map((r) => {
                const days = Number(fieldFor(r, "days", r.days)) || 0;
                const otHours = Number(fieldFor(r, "otHours", r.otHours)) || 0;
                const advance = Number(fieldFor(r, "advance", r.advance)) || 0;
                const hourlyRate = r.salaryPerDay / STANDARD_HOURS_PER_DAY;
                const liveOtPay = otHours * hourlyRate;
                const liveGross = days * r.salaryPerDay;
                const liveNet = liveGross + liveOtPay - advance;
                const busy = savingRowId === r.rowId;
                return (
                  <tr key={r.rowId} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button onClick={() => selectWorker(r.workerId)} className="font-medium text-brand-700 hover:underline">{r.name}</button>
                      {!r.payoutId && <span className="ml-1 text-[10px] text-slate-400">(wala pang payout)</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.payoutId ? formatDate(r.payDate) : "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{peso(r.salaryPerDay)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.5"
                        value={fieldFor(r, "days", r.days)}
                        onChange={(e) => setField(r.rowId, "days", e.target.value)}
                        onBlur={() => saveRow(r)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={busy}
                        placeholder="0"
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2">{peso(liveGross)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.5"
                        value={fieldFor(r, "otHours", r.otHours)}
                        onChange={(e) => setField(r.rowId, "otHours", e.target.value)}
                        onBlur={() => saveRow(r)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={busy}
                        placeholder="0"
                        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 text-emerald-600">+ {peso(liveOtPay)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.01"
                        value={fieldFor(r, "advance", r.advance)}
                        onChange={(e) => setField(r.rowId, "advance", e.target.value)}
                        onBlur={() => saveRow(r)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={busy}
                        placeholder="0"
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{peso(liveNet)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.payoutId && (
                        <button onClick={() => deleteRow(r)} disabled={busy} className="text-slate-400 hover:text-red-600 disabled:opacity-50" title="Delete this payout">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                <td className="px-3 py-2">{periodSummary.daysWorked}</td>
                <td className="px-3 py-2">{peso(periodSummary.grossPay)}</td>
                <td className="px-3 py-2">{periodSummary.overtimeHours}h</td>
                <td className="px-3 py-2 text-emerald-700">+ {peso(periodSummary.overtimePay)}</td>
                <td className="px-3 py-2 text-red-700">− {peso(periodSummary.advanceDeducted)}</td>
                <td className="px-3 py-2">{peso(periodSummary.netPay)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      <div className="flex gap-4">
        <div className={`${mobileView === "detail" ? "hidden" : "block"} w-full md:block md:w-72 md:shrink-0`}>
          <Card className="overflow-hidden">
            {workers.length === 0 ? (
              <EmptyState title="No workers yet" description="Click “Add Worker” to start tracking daily wage, advances, and payouts." />
            ) : (
              <div className="divide-y divide-slate-100">
                {workers.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => selectWorker(w.id)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === w.id ? "bg-brand-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${w.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>{w.name}</p>
                      <p className="truncate text-xs text-slate-400">{peso(w.salary_per_day)} / day</p>
                    </div>
                    {!w.is_active && <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">Inactive</span>}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={`${mobileView === "list" ? "hidden" : "block"} min-w-0 flex-1 md:block`}>
          {selectedWorker ? (
            <WorkerDetail
              worker={selectedWorker}
              onBack={() => setMobileView("list")}
              onToggleActive={() => toggleActive(selectedWorker)}
              onWorkerUpdated={loadWorkers}
              onLedgerChanged={() => { loadSummary(); loadPeriodSummary(periodFilter); }}
            />
          ) : (
            <Card className="p-10 text-center text-sm text-slate-400">Select a worker to view advances and compute payout.</Card>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Worker">
        <div className="space-y-3">
          <Input label="Worker Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
          <Input label="Salary per Day (₱)" type="number" min="0" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="e.g. 500" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={addWorker} loading={saving} disabled={!newName.trim() || !newRate}>Add Worker</Button>
        </div>
      </Modal>
    </div>
  );
}

function WorkerDetail({
  worker,
  onBack,
  onToggleActive,
  onWorkerUpdated,
  onLedgerChanged,
}: {
  worker: PayrollWorker;
  onBack: () => void;
  onToggleActive: () => void;
  onWorkerUpdated: () => void;
  onLedgerChanged: () => void;
}) {
  const { profile } = useAuth();
  const { push } = useToast();
  const [advances, setAdvances] = useState<PayrollAdvance[]>([]);
  const [overtime, setOvertime] = useState<PayrollOvertime[]>([]);
  const [payouts, setPayouts] = useState<PayrollPayout[]>([]);
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string; role: string }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [editRateOpen, setEditRateOpen] = useState(false);
  const [editRate, setEditRate] = useState(String(worker.salary_per_day));
  const [savingRate, setSavingRate] = useState(false);

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(todayInTZ());
  const [advanceNote, setAdvanceNote] = useState("");
  const [givenBy, setGivenBy] = useState(profile?.id ?? "");
  const [savingAdvance, setSavingAdvance] = useState(false);

  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [overtimeHours, setOvertimeHours] = useState("");
  const [overtimeDate, setOvertimeDate] = useState(todayInTZ());
  const [overtimeNote, setOvertimeNote] = useState("");
  const [savingOvertime, setSavingOvertime] = useState(false);

  const [daysWorked, setDaysWorked] = useState("");
  const [payDate, setPayDate] = useState(todayInTZ());
  const [payoutNote, setPayoutNote] = useState("");
  const [recordingPayout, setRecordingPayout] = useState(false);

  async function loadDetail() {
    setLoadingDetail(true);
    const [{ data: adv }, { data: ot }, { data: pay }, { data: directory }] = await Promise.all([
      supabase.from("payroll_advances").select("*").eq("worker_id", worker.id).order("advance_date", { ascending: false }),
      supabase.from("payroll_overtime").select("*").eq("worker_id", worker.id).order("overtime_date", { ascending: false }),
      supabase.from("payroll_payouts").select("*").eq("worker_id", worker.id).order("pay_date", { ascending: false }),
      supabase.rpc("company_directory"),
    ]);
    setAdvances((adv as PayrollAdvance[]) ?? []);
    setOvertime((ot as PayrollOvertime[]) ?? []);
    setPayouts((pay as PayrollPayout[]) ?? []);
    setStaff(
      ((directory as { id: string; first_name: string; last_name: string; role: string }[]) ?? []).filter(
        (p) => p.role === "admin" || p.role === "hr"
      )
    );
    setLoadingDetail(false);
  }

  useEffect(() => {
    loadDetail();
    setEditRate(String(worker.salary_per_day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker.id]);

  useEffect(() => {
    if (profile) setGivenBy(profile.id);
  }, [profile]);

  const outstandingAdvance = useMemo(
    () => advances.filter((a) => !a.settled).reduce((sum, a) => sum + Number(a.amount), 0),
    [advances]
  );

  const outstandingOvertimeHours = useMemo(
    () => overtime.filter((o) => !o.settled).reduce((sum, o) => sum + Number(o.hours), 0),
    [overtime]
  );

  const hourlyRate = Number(worker.salary_per_day) / STANDARD_HOURS_PER_DAY;
  const outstandingOvertimePay = outstandingOvertimeHours * hourlyRate;

  const days = Number(daysWorked) || 0;
  const grossPay = days * Number(worker.salary_per_day);
  const netPay = grossPay + outstandingOvertimePay - outstandingAdvance;

  async function saveRate() {
    if (!profile || !editRate) return;
    setSavingRate(true);
    const { error } = await supabase.from("payroll_workers").update({ salary_per_day: Number(editRate) }).eq("id", worker.id);
    setSavingRate(false);
    if (error) return push("error", error.message);
    push("success", "Salary per day updated.");
    setEditRateOpen(false);
    onWorkerUpdated();
  }

  async function addAdvance() {
    if (!profile || !advanceAmount) return;
    setSavingAdvance(true);
    const giver = staff.find((s) => s.id === givenBy);
    const { error } = await supabase.from("payroll_advances").insert({
      company_id: profile.company_id,
      worker_id: worker.id,
      amount: Number(advanceAmount),
      advance_date: advanceDate,
      note: advanceNote || null,
      given_by: givenBy || null,
    });
    setSavingAdvance(false);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Advance Recorded", module: "Payroll", target: worker.name,
      details: { amount: Number(advanceAmount), advance_date: advanceDate, given_by: giver ? `${giver.first_name} ${giver.last_name}` : null },
    });
    push("success", "Cash advance recorded.");
    setAdvanceOpen(false);
    setAdvanceAmount("");
    setAdvanceNote("");
    setAdvanceDate(todayInTZ());
    setGivenBy(profile.id);
    loadDetail();
    onLedgerChanged();
  }

  async function deleteAdvance(a: PayrollAdvance) {
    if (a.settled) return;
    const { error } = await supabase.from("payroll_advances").delete().eq("id", a.id);
    if (error) return push("error", error.message);
    push("success", "Advance removed.");
    loadDetail();
    onLedgerChanged();
  }

  async function addOvertime() {
    if (!profile || !overtimeHours) return;
    setSavingOvertime(true);
    const { error } = await supabase.from("payroll_overtime").insert({
      company_id: profile.company_id,
      worker_id: worker.id,
      hours: Number(overtimeHours),
      overtime_date: overtimeDate,
      note: overtimeNote || null,
    });
    setSavingOvertime(false);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Overtime Recorded", module: "Payroll", target: worker.name, details: { hours: Number(overtimeHours), overtime_date: overtimeDate },
    });
    push("success", "Overtime recorded.");
    setOvertimeOpen(false);
    setOvertimeHours("");
    setOvertimeNote("");
    setOvertimeDate(todayInTZ());
    loadDetail();
    onLedgerChanged();
  }

  async function deleteOvertime(o: PayrollOvertime) {
    if (o.settled) return;
    const { error } = await supabase.from("payroll_overtime").delete().eq("id", o.id);
    if (error) return push("error", error.message);
    push("success", "Overtime entry removed.");
    loadDetail();
    onLedgerChanged();
  }

  async function recordPayout() {
    if (!profile || !daysWorked || days <= 0) {
      push("error", "Enter the number of days worked.");
      return;
    }
    setRecordingPayout(true);
    const { data: payout, error } = await supabase
      .from("payroll_payouts")
      .insert({
        company_id: profile.company_id,
        worker_id: worker.id,
        days_worked: days,
        salary_per_day: worker.salary_per_day,
        gross_pay: grossPay,
        advance_deducted: outstandingAdvance,
        overtime_hours: outstandingOvertimeHours,
        overtime_pay: outstandingOvertimePay,
        net_pay: netPay,
        pay_date: payDate,
        note: payoutNote || null,
        created_by: profile.id,
      })
      .select()
      .single();
    if (error || !payout) {
      setRecordingPayout(false);
      return push("error", error?.message ?? "Failed to record payout.");
    }
    const unsettledAdvanceIds = advances.filter((a) => !a.settled).map((a) => a.id);
    if (unsettledAdvanceIds.length > 0) {
      await supabase.from("payroll_advances").update({ settled: true, payout_id: payout.id }).in("id", unsettledAdvanceIds);
    }
    const unsettledOvertimeIds = overtime.filter((o) => !o.settled).map((o) => o.id);
    if (unsettledOvertimeIds.length > 0) {
      await supabase.from("payroll_overtime").update({ settled: true, payout_id: payout.id }).in("id", unsettledOvertimeIds);
    }
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Payroll Payout Recorded", module: "Payroll", target: worker.name,
      details: { days_worked: days, gross_pay: grossPay, overtime_hours: outstandingOvertimeHours, overtime_pay: outstandingOvertimePay, advance_deducted: outstandingAdvance, net_pay: netPay, pay_date: payDate },
    });
    setRecordingPayout(false);
    push("success", `Payout recorded: ${peso(netPay)} net pay.`);
    setDaysWorked("");
    setPayoutNote("");
    setPayDate(todayInTZ());
    loadDetail();
    onLedgerChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className={`text-lg font-bold ${worker.is_active ? "text-slate-800" : "text-slate-400"}`}>{worker.name}</h2>
        {!worker.is_active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">Inactive</span>}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-slate-400">Salary per Day</p>
          <p className="text-lg font-semibold text-slate-800">{peso(worker.salary_per_day)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setEditRate(String(worker.salary_per_day)); setEditRateOpen(true); }}>Edit Rate</Button>
          <Button variant="ghost" onClick={onToggleActive}>
            {worker.is_active ? <><Ban className="h-4 w-4" /> Deactivate</> : <><CheckCircle className="h-4 w-4" /> Activate</>}
          </Button>
        </div>
      </Card>

      {loadingDetail ? <Spinner /> : (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-700"><Banknote className="h-4 w-4" /> Compute &amp; Record Payout</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input label="Days Worked" type="number" min="0" step="0.5" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} placeholder="e.g. 5" />
              <Input label="Pay Date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} max={todayInTZ()} />
              <Input label="Note (optional)" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="e.g. Week 3 payout" />
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <div className="flex justify-between"><span>{days || 0} day{days === 1 ? "" : "s"} × {peso(worker.salary_per_day)}</span><span>{peso(grossPay)}</span></div>
              <div className="flex justify-between text-emerald-600"><span>Plus: Overtime ({outstandingOvertimeHours}h × {peso(hourlyRate)}/hr)</span><span>+ {peso(outstandingOvertimePay)}</span></div>
              <div className="flex justify-between text-red-600"><span>Less: Outstanding Advance</span><span>− {peso(outstandingAdvance)}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800"><span>Net Pay</span><span>{peso(netPay)}</span></div>
            </div>
            <Button onClick={recordPayout} loading={recordingPayout} disabled={!daysWorked || days <= 0}>Record Payout</Button>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-700"><HandCoins className="h-4 w-4" /> Cash Advances</h3>
              <Button variant="secondary" onClick={() => setAdvanceOpen(true)}><Plus className="h-4 w-4" /> Add Advance</Button>
            </div>
            <p className="text-sm text-slate-500">Outstanding (unpaid) advance: <span className="font-semibold text-red-600">{peso(outstandingAdvance)}</span></p>
            {advances.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No cash advances recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr><th className="py-2">Date</th><th className="py-2">Amount</th><th className="py-2">Given By</th><th className="py-2">Note</th><th className="py-2">Status</th><th></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {advances.map((a) => {
                      const giver = staff.find((s) => s.id === a.given_by);
                      return (
                        <tr key={a.id}>
                          <td className="py-2">{formatDate(a.advance_date)}</td>
                          <td className="py-2">{peso(Number(a.amount))}</td>
                          <td className="py-2 text-slate-600">{giver ? `${giver.first_name} ${giver.last_name}` : "—"}</td>
                          <td className="py-2 max-w-[160px] truncate text-slate-500" title={a.note ?? ""}>{a.note || "—"}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.settled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {a.settled ? "Settled" : "Pending"}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {!a.settled && (
                              <button onClick={() => deleteAdvance(a)} className="text-slate-400 hover:text-red-600" title="Remove">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-slate-700"><Clock className="h-4 w-4" /> Overtime</h3>
              <Button variant="secondary" onClick={() => setOvertimeOpen(true)}><Plus className="h-4 w-4" /> Add Overtime</Button>
            </div>
            <p className="text-sm text-slate-500">Outstanding (unpaid) overtime: <span className="font-semibold text-emerald-600">{outstandingOvertimeHours}h ({peso(outstandingOvertimePay)})</span></p>
            {overtime.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No overtime recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr><th className="py-2">Date</th><th className="py-2">Hours</th><th className="py-2">Note</th><th className="py-2">Status</th><th></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overtime.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2">{formatDate(o.overtime_date)}</td>
                        <td className="py-2">{o.hours}h</td>
                        <td className="py-2 max-w-[160px] truncate text-slate-500" title={o.note ?? ""}>{o.note || "—"}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.settled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {o.settled ? "Settled" : "Pending"}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {!o.settled && (
                            <button onClick={() => deleteOvertime(o)} className="text-slate-400 hover:text-red-600" title="Remove">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="flex items-center gap-2 font-semibold text-slate-700"><Wallet className="h-4 w-4" /> Payout History</h3>
            {payouts.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No payouts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr><th className="py-2">Date</th><th className="py-2">Days</th><th className="py-2">Gross</th><th className="py-2">OT</th><th className="py-2">Advance</th><th className="py-2">Net Pay</th><th className="py-2">Note</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payouts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2">{formatDate(p.pay_date)}</td>
                        <td className="py-2">{p.days_worked}</td>
                        <td className="py-2">{peso(Number(p.gross_pay))}</td>
                        <td className="py-2 text-emerald-600">+ {peso(Number(p.overtime_pay))} ({p.overtime_hours}h)</td>
                        <td className="py-2 text-red-600">− {peso(Number(p.advance_deducted))}</td>
                        <td className="py-2 font-semibold text-slate-800">{peso(Number(p.net_pay))}</td>
                        <td className="py-2 max-w-[160px] truncate text-slate-500" title={p.note ?? ""}>{p.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal open={editRateOpen} onClose={() => setEditRateOpen(false)} title="Edit Salary per Day">
        <Input label="Salary per Day (₱)" type="number" min="0" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditRateOpen(false)}>Cancel</Button>
          <Button onClick={saveRate} loading={savingRate}>Save</Button>
        </div>
      </Modal>

      <Modal open={advanceOpen} onClose={() => setAdvanceOpen(false)} title="Add Cash Advance">
        <div className="space-y-3">
          <Input label="Amount (₱)" type="number" min="0" step="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="e.g. 1000" />
          <Input label="Date" type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} max={todayInTZ()} />
          <Select label="Given By" value={givenBy} onChange={(e) => setGivenBy(e.target.value)}>
            {staff.length === 0 && <option value="">—</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.role === "admin" ? "Admin" : "HR"})</option>
            ))}
          </Select>
          <Input label="Note (optional)" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="e.g. Emergency advance" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
          <Button onClick={addAdvance} loading={savingAdvance} disabled={!advanceAmount}>Add Advance</Button>
        </div>
      </Modal>

      <Modal open={overtimeOpen} onClose={() => setOvertimeOpen(false)} title="Add Overtime">
        <div className="space-y-3">
          <Input label="Date" type="date" value={overtimeDate} onChange={(e) => setOvertimeDate(e.target.value)} max={todayInTZ()} />
          <Input label="Hours" type="number" min="0" step="0.5" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} placeholder="e.g. 3" />
          <Input label="Note (optional)" value={overtimeNote} onChange={(e) => setOvertimeNote(e.target.value)} placeholder="e.g. Rush delivery" />
          <p className="text-xs text-slate-400">Kinakalkula sa hourly rate na {peso(hourlyRate)}/hr (salary per day ÷ {STANDARD_HOURS_PER_DAY} hours).</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOvertimeOpen(false)}>Cancel</Button>
          <Button onClick={addOvertime} loading={savingOvertime} disabled={!overtimeHours}>Add Overtime</Button>
        </div>
      </Modal>
    </div>
  );
}
