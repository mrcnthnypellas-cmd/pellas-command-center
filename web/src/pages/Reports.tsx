import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Card, Select, Input, Button, Spinner, EmptyState } from "../components/ui/ui";
import { todayInTZ } from "../lib/format";
import type { Department, WorkSchedule } from "../types";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri, 8:00–17:00 default coverage

interface SummaryRow {
  employee_id: string;
  name: string;
  employee_code: string | null;
  department: string;
  presentDays: number;
  lateDays: number;
  overtimeDays: number;
  undertimeDays: number;
  absentDays: number;
  totalHours: number;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  return r;
}
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
// Counts scheduled work days (per workDays) within [from, to], capped at `today`
// and not starting before the employee's date_hired.
function countScheduledWorkdays(from: string, to: string, workDays: number[], dateHired: string | null, today: string) {
  const end = to < today ? to : today;
  const start = dateHired && dateHired > from ? dateHired : from;
  if (start > end) return 0;
  let count = 0;
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    if (workDays.includes(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export default function Reports() {
  const [range, setRange] = useState<"daily" | "weekly" | "monthly" | "cutoff" | "custom">("weekly");
  const [dateFrom, setDateFrom] = useState(toISODate(startOfWeek(new Date())));
  const [dateTo, setDateTo] = useState(todayInTZ());
  const [cutoffMonth, setCutoffMonth] = useState(todayInTZ().slice(0, 7));
  const [cutoffHalf, setCutoffHalf] = useState<"1" | "2">("1");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter, setDeptFilter] = useState("all");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("departments").select("*").order("name").then(({ data }) => setDepartments((data as Department[]) ?? []));
  }, []);

  useEffect(() => {
    const today = new Date();
    if (range === "daily") {
      setDateFrom(todayInTZ());
      setDateTo(todayInTZ());
    } else if (range === "weekly") {
      setDateFrom(toISODate(startOfWeek(today)));
      setDateTo(todayInTZ());
    } else if (range === "monthly") {
      setDateFrom(toISODate(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(todayInTZ());
    }
  }, [range]);

  useEffect(() => {
    if (range !== "cutoff") return;
    const [y, m] = cutoffMonth.split("-").map(Number);
    if (cutoffHalf === "1") {
      setDateFrom(`${cutoffMonth}-01`);
      setDateTo(`${cutoffMonth}-15`);
    } else {
      setDateFrom(`${cutoffMonth}-16`);
      setDateTo(`${cutoffMonth}-${pad2(lastDayOfMonth(y, m - 1))}`);
    }
  }, [range, cutoffMonth, cutoffHalf]);

  async function generate() {
    setLoading(true);

    let profileQuery = supabase
      .from("profiles")
      .select("id, first_name, last_name, employee_code, department_id, date_hired, schedule_id, departments(name)")
      .in("employment_status", ["active", "on_leave"]);
    if (deptFilter !== "all") profileQuery = profileQuery.eq("department_id", deptFilter);

    const [{ data: profilesData, error: profilesError }, { data: schedulesData }, { data: attendanceData, error: attendanceError }] = await Promise.all([
      profileQuery,
      supabase.from("work_schedules").select("*"),
      supabase.from("attendance").select("employee_id, work_date, status, hours_worked").gte("work_date", dateFrom).lte("work_date", dateTo),
    ]);

    setLoading(false);
    if (profilesError || attendanceError || !profilesData) {
      setRows([]);
      return;
    }

    const scheduleMap = new Map<string, WorkSchedule>(((schedulesData as WorkSchedule[]) ?? []).map((s) => [s.id, s]));
    const attByEmployee = new Map<string, any[]>();
    for (const a of (attendanceData as any[]) ?? []) {
      if (!attByEmployee.has(a.employee_id)) attByEmployee.set(a.employee_id, []);
      attByEmployee.get(a.employee_id)!.push(a);
    }

    const today = todayInTZ();
    const result: SummaryRow[] = [];
    for (const p of profilesData as any[]) {
      const records = attByEmployee.get(p.id) ?? [];
      let presentDays = 0, lateDays = 0, overtimeDays = 0, undertimeDays = 0, totalHours = 0;
      for (const r of records) {
        if (r.status === "present") presentDays++;
        if (r.status === "late") { presentDays++; lateDays++; }
        if (r.status === "overtime") { presentDays++; overtimeDays++; }
        if (r.status === "undertime") { presentDays++; undertimeDays++; }
        totalHours += Number(r.hours_worked ?? 0);
      }
      const schedule = p.schedule_id ? scheduleMap.get(p.schedule_id) : undefined;
      const workDays = schedule?.work_days ?? DEFAULT_WORK_DAYS;
      const scheduledDays = countScheduledWorkdays(dateFrom, dateTo, workDays, p.date_hired, today);
      const absentDays = Math.max(0, scheduledDays - records.length);

      result.push({
        employee_id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_code: p.employee_code,
        department: p.departments?.name ?? "—",
        presentDays, lateDays, overtimeDays, undertimeDays, absentDays, totalHours,
      });
    }
    setRows(result.sort((a, b) => a.name.localeCompare(b.name)));
  }

  function exportCsv() {
    const header = ["Employee", "ID", "Department", "Present Days", "Late Days", "Absent Days", "Overtime Days", "Undertime Days", "Total Hours"];
    const lines = rows.map((r) => [r.name, r.employee_code ?? "", r.department, r.presentDays, r.lateDays, r.absentDays, r.overtimeDays, r.undertimeDays, r.totalHours.toFixed(2)]);
    const t = totals();
    lines.push(["TOTAL", "", "", t.presentDays, t.lateDays, t.absentDays, t.overtimeDays, t.undertimeDays, t.totalHours.toFixed(2)]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    const suffix = range === "cutoff" ? `${cutoffMonth}_cutoff${cutoffHalf}` : `${dateFrom}_to_${dateTo}`;
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_report_${suffix}.csv`;
    a.click();
  }

  function totals() {
    return rows.reduce(
      (acc, r) => ({
        presentDays: acc.presentDays + r.presentDays,
        lateDays: acc.lateDays + r.lateDays,
        absentDays: acc.absentDays + r.absentDays,
        overtimeDays: acc.overtimeDays + r.overtimeDays,
        undertimeDays: acc.undertimeDays + r.undertimeDays,
        totalHours: acc.totalHours + r.totalHours,
      }),
      { presentDays: 0, lateDays: 0, absentDays: 0, overtimeDays: 0, undertimeDays: 0, totalHours: 0 }
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Reports</h1>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Range" value={range} onChange={(e) => setRange(e.target.value as any)} className="w-36">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="cutoff">Cutoff</option>
            <option value="custom">Custom</option>
          </Select>
          {range === "cutoff" ? (
            <>
              <Input label="Month" type="month" value={cutoffMonth} onChange={(e) => setCutoffMonth(e.target.value)} className="w-40" />
              <Select label="Cutoff" value={cutoffHalf} onChange={(e) => setCutoffHalf(e.target.value as "1" | "2")} className="w-40">
                <option value="1">1st Half (1–15)</option>
                <option value="2">2nd Half (16–end)</option>
              </Select>
            </>
          ) : (
            <>
              <Input label="From" type="date" value={dateFrom} onChange={(e) => { setRange("custom"); setDateFrom(e.target.value); }} className="w-40" />
              <Input label="To" type="date" value={dateTo} onChange={(e) => { setRange("custom"); setDateTo(e.target.value); }} className="w-40" />
            </>
          )}
          <Select label="Department" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-48">
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button onClick={generate} loading={loading}><FileBarChart className="h-4 w-4" /> Generate</Button>
          {rows.length > 0 && <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="No report generated" description="Choose a range and click Generate." />
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Absent</th>
                <th className="px-4 py-3">Overtime</th><th className="px-4 py-3">Undertime</th><th className="px-4 py-3">Total Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.name}</td>
                  <td className="px-4 py-3 text-slate-500">{r.employee_code ?? "—"}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{r.presentDays}</td>
                  <td className="px-4 py-3">{r.lateDays}</td>
                  <td className="px-4 py-3">{r.absentDays}</td>
                  <td className="px-4 py-3">{r.overtimeDays}</td>
                  <td className="px-4 py-3">{r.undertimeDays}</td>
                  <td className="px-4 py-3">{r.totalHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 py-3" colSpan={3}>TOTAL</td>
                <td className="px-4 py-3">{totals().presentDays}</td>
                <td className="px-4 py-3">{totals().lateDays}</td>
                <td className="px-4 py-3">{totals().absentDays}</td>
                <td className="px-4 py-3">{totals().overtimeDays}</td>
                <td className="px-4 py-3">{totals().undertimeDays}</td>
                <td className="px-4 py-3">{totals().totalHours.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
    </div>
  );
}
