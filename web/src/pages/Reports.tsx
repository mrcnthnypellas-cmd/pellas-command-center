import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Card, Select, Input, Button, Spinner, EmptyState } from "../components/ui/ui";
import { todayInTZ } from "../lib/format";
import type { Department } from "../types";

interface SummaryRow {
  employee_id: string;
  name: string;
  employee_code: string | null;
  department: string;
  presentDays: number;
  lateDays: number;
  overtimeDays: number;
  undertimeDays: number;
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

export default function Reports() {
  const [range, setRange] = useState<"daily" | "weekly" | "monthly" | "custom">("weekly");
  const [dateFrom, setDateFrom] = useState(toISODate(startOfWeek(new Date())));
  const [dateTo, setDateTo] = useState(todayInTZ());
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

  async function generate() {
    setLoading(true);
    let query = supabase
      .from("attendance")
      .select("employee_id, work_date, status, hours_worked, profiles!inner(first_name, last_name, employee_code, department_id, departments(name))")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo);
    if (deptFilter !== "all") query = query.eq("profiles.department_id", deptFilter);

    const { data, error } = await query;
    setLoading(false);
    if (error || !data) {
      setRows([]);
      return;
    }

    const map = new Map<string, SummaryRow>();
    for (const r of data as any[]) {
      const key = r.employee_id;
      if (!map.has(key)) {
        map.set(key, {
          employee_id: key,
          name: `${r.profiles.first_name} ${r.profiles.last_name}`,
          employee_code: r.profiles.employee_code,
          department: r.profiles.departments?.name ?? "—",
          presentDays: 0, lateDays: 0, overtimeDays: 0, undertimeDays: 0, totalHours: 0,
        });
      }
      const row = map.get(key)!;
      if (r.status === "present") row.presentDays++;
      if (r.status === "late") { row.presentDays++; row.lateDays++; }
      if (r.status === "overtime") { row.presentDays++; row.overtimeDays++; }
      if (r.status === "undertime") { row.presentDays++; row.undertimeDays++; }
      row.totalHours += Number(r.hours_worked ?? 0);
    }
    setRows(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }

  function exportCsv() {
    const header = ["Employee", "ID", "Department", "Present Days", "Late Days", "Overtime Days", "Undertime Days", "Total Hours"];
    const lines = rows.map((r) => [r.name, r.employee_code ?? "", r.department, r.presentDays, r.lateDays, r.overtimeDays, r.undertimeDays, r.totalHours.toFixed(2)]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_report_${dateFrom}_to_${dateTo}.csv`;
    a.click();
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
            <option value="custom">Custom</option>
          </Select>
          <Input label="From" type="date" value={dateFrom} onChange={(e) => { setRange("custom"); setDateFrom(e.target.value); }} className="w-40" />
          <Input label="To" type="date" value={dateTo} onChange={(e) => { setRange("custom"); setDateTo(e.target.value); }} className="w-40" />
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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Overtime</th>
                <th className="px-4 py-3">Undertime</th><th className="px-4 py-3">Total Hours</th>
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
                  <td className="px-4 py-3">{r.overtimeDays}</td>
                  <td className="px-4 py-3">{r.undertimeDays}</td>
                  <td className="px-4 py-3">{r.totalHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
