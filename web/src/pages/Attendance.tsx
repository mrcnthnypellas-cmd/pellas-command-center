import { useEffect, useState } from "react";
import { Download, Pencil } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card, Badge, Spinner, EmptyState, Select, Input, Button, Modal, StatCard } from "../components/ui/ui";
import EmployeeMultiSelect, { type EmployeeOption } from "../components/ui/EmployeeMultiSelect";
import { formatDate, formatTime, getLogDateTimeParts, todayInTZ } from "../lib/format";
import type { Attendance as AttendanceRow, Department, WorkSchedule } from "../types";

const PAGE_SIZE = 25;
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri, 8:00–17:00 default coverage
const DEFAULT_START_TIME = "08:00:00";
const DEFAULT_END_TIME = "17:00:00";
const DEFAULT_BREAK_MINUTES = 60;

interface EmployeeLateAbsent {
  employee_id: string;
  name: string;
  employee_code: string | null;
  lateCount: number;
  lateHours: number;
  absentDays: number;
  absentHours: number;
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

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Paid hours in one scheduled workday (shift span minus unpaid break).
function shiftHours(schedule?: WorkSchedule) {
  const start = schedule?.start_time ?? DEFAULT_START_TIME;
  const end = schedule?.end_time ?? DEFAULT_END_TIME;
  const breakMinutes = schedule?.break_minutes ?? DEFAULT_BREAK_MINUTES;
  return Math.max(0, (toMinutes(end) - toMinutes(start) - breakMinutes) / 60);
}

// How many hours late a single time-in was, vs. the scheduled start time.
function lateHoursForRow(timeIn: string, scheduleStartTime: string) {
  const { hour, minute } = getLogDateTimeParts(timeIn);
  const actualMinutes = hour * 60 + minute;
  return Math.max(0, (actualMinutes - toMinutes(scheduleStartTime)) / 60);
}

export default function Attendance() {
  const { profile: me } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(todayInTZ());
  const [dateTo, setDateTo] = useState(todayInTZ());
  const [status, setStatus] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [lateCount, setLateCount] = useState(0);
  const [absentCount, setAbsentCount] = useState(0);
  const [lateHours, setLateHours] = useState(0);
  const [absentHours, setAbsentHours] = useState(0);
  const [editRow, setEditRow] = useState<AttendanceRow | null>(null);
  const [editTimeIn, setEditTimeIn] = useState("");
  const [editTimeOut, setEditTimeOut] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("attendance")
      .select("*, profiles!inner(first_name, last_name, employee_code, department_id)", { count: "exact" })
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo);

    if (sortBy === "name") {
      query = query.order("first_name", { foreignTable: "profiles", ascending: true }).order("last_name", { foreignTable: "profiles", ascending: true });
    } else {
      query = query.order("work_date", { ascending: false });
    }

    if (status !== "all") query = query.eq("status", status);
    if (deptFilter !== "all") query = query.eq("profiles.department_id", deptFilter);
    if (employeeFilter.length > 0) query = query.in("employee_id", employeeFilter);

    const from = page * PAGE_SIZE;
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
    setRows((data as unknown as AttendanceRow[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  // Late/Absent totals for the current date range + department + employee
  // filters, broken down per employee (used by the stat cards and by the
  // per-employee rows in the CSV export, so both always agree).
  async function getLateAbsentByEmployee(): Promise<EmployeeLateAbsent[]> {
    let lateQuery = supabase
      .from("attendance")
      .select("employee_id, time_in, profiles!inner(department_id, employment_status)")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .eq("status", "late")
      .in("profiles.employment_status", ["active", "on_leave"]);
    if (deptFilter !== "all") lateQuery = lateQuery.eq("profiles.department_id", deptFilter);
    if (employeeFilter.length > 0) lateQuery = lateQuery.in("employee_id", employeeFilter);

    let profileQuery = supabase
      .from("profiles")
      .select("id, first_name, last_name, employee_code, date_hired, schedule_id")
      .in("employment_status", ["active", "on_leave"]);
    if (deptFilter !== "all") profileQuery = profileQuery.eq("department_id", deptFilter);
    if (employeeFilter.length > 0) profileQuery = profileQuery.in("id", employeeFilter);

    const [{ data: lateRows }, { data: profilesData }, { data: schedulesData }, { data: attendanceData }] = await Promise.all([
      lateQuery,
      profileQuery,
      supabase.from("work_schedules").select("*"),
      supabase.from("attendance").select("employee_id, work_date").gte("work_date", dateFrom).lte("work_date", dateTo),
    ]);

    const scheduleMap = new Map<string, WorkSchedule>(((schedulesData as WorkSchedule[]) ?? []).map((s) => [s.id, s]));
    const employeeScheduleId = new Map<string, string | null>(
      ((profilesData as { id: string; schedule_id: string | null }[]) ?? []).map((p) => [p.id, p.schedule_id])
    );

    const lateByEmployee = new Map<string, { count: number; hours: number }>();
    for (const r of (lateRows as { employee_id: string; time_in: string | null }[]) ?? []) {
      if (!r.time_in) continue;
      const schedule = scheduleMap.get(employeeScheduleId.get(r.employee_id) ?? "");
      const hrs = lateHoursForRow(r.time_in, schedule?.start_time ?? DEFAULT_START_TIME);
      const cur = lateByEmployee.get(r.employee_id) ?? { count: 0, hours: 0 };
      cur.count += 1;
      cur.hours += hrs;
      lateByEmployee.set(r.employee_id, cur);
    }

    const attCountByEmployee = new Map<string, number>();
    for (const a of (attendanceData as { employee_id: string }[]) ?? []) {
      attCountByEmployee.set(a.employee_id, (attCountByEmployee.get(a.employee_id) ?? 0) + 1);
    }

    const today = todayInTZ();
    const result: EmployeeLateAbsent[] = [];
    for (const p of (profilesData as any[]) ?? []) {
      const schedule = p.schedule_id ? scheduleMap.get(p.schedule_id) : undefined;
      const workDays = schedule?.work_days ?? DEFAULT_WORK_DAYS;
      const scheduledDays = countScheduledWorkdays(dateFrom, dateTo, workDays, p.date_hired, today);
      const present = attCountByEmployee.get(p.id) ?? 0;
      const absentDays = Math.max(0, scheduledDays - present);
      const late = lateByEmployee.get(p.id) ?? { count: 0, hours: 0 };
      result.push({
        employee_id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_code: p.employee_code ?? null,
        lateCount: late.count,
        lateHours: late.hours,
        absentDays,
        absentHours: absentDays * shiftHours(schedule),
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadSummary() {
    const breakdown = await getLateAbsentByEmployee();
    const totals = breakdown.reduce(
      (acc, e) => ({
        lateCount: acc.lateCount + e.lateCount,
        lateHours: acc.lateHours + e.lateHours,
        absentCount: acc.absentCount + e.absentDays,
        absentHours: acc.absentHours + e.absentHours,
      }),
      { lateCount: 0, lateHours: 0, absentCount: 0, absentHours: 0 }
    );
    setLateCount(totals.lateCount);
    setLateHours(totals.lateHours);
    setAbsentCount(totals.absentCount);
    setAbsentHours(totals.absentHours);
  }

  useEffect(() => {
    supabase.from("departments").select("*").order("name").then(({ data }) => setDepartments((data as Department[]) ?? []));
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("employment_status", ["active", "on_leave"])
      .order("first_name")
      .then(({ data }) => setEmployees(((data as { id: string; first_name: string; last_name: string }[]) ?? []).map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }))));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, status, deptFilter, employeeFilter, sortBy, page]);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, deptFilter, employeeFilter]);

  const [exportingCsv, setExportingCsv] = useState(false);

  // Exports ALL rows matching the current filters (not just the current
  // page shown on screen), so "Export CSV" always reflects the selected
  // employees/date range/status/department in full.
  async function exportCsv() {
    setExportingCsv(true);
    let query = supabase
      .from("attendance")
      .select("*, profiles!inner(first_name, last_name, employee_code, department_id)")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo);

    if (sortBy === "name") {
      query = query.order("first_name", { foreignTable: "profiles", ascending: true }).order("last_name", { foreignTable: "profiles", ascending: true });
    } else {
      query = query.order("work_date", { ascending: false });
    }
    if (status !== "all") query = query.eq("status", status);
    if (deptFilter !== "all") query = query.eq("profiles.department_id", deptFilter);
    if (employeeFilter.length > 0) query = query.in("employee_id", employeeFilter);

    const { data, error } = await query;
    if (error) {
      setExportingCsv(false);
      return push("error", error.message);
    }
    const breakdown = await getLateAbsentByEmployee();
    setExportingCsv(false);

    const list = (data as unknown as AttendanceRow[]) ?? [];
    const header = ["Employee", "ID", "Date", "Time In", "Time Out", "Hours", "Status"];
    const lines = list.map((r) => [
      `${r.profiles?.first_name} ${r.profiles?.last_name}`,
      r.profiles?.employee_code ?? "",
      r.work_date,
      formatTime(r.time_in),
      formatTime(r.time_out),
      r.hours_worked ?? "",
      r.status,
    ]);

    const perEmployeeHeader = ["Employee", "ID", "Total Late", "Total Late Hours", "Total Absent", "Total Absent Hours"];
    const perEmployeeLines = breakdown.map((e) => [
      e.name,
      e.employee_code ?? "",
      e.lateCount,
      e.lateHours.toFixed(1),
      e.absentDays,
      e.absentHours.toFixed(1),
    ]);
    const grandTotal = breakdown.reduce(
      (acc, e) => ({
        lateCount: acc.lateCount + e.lateCount,
        lateHours: acc.lateHours + e.lateHours,
        absentDays: acc.absentDays + e.absentDays,
        absentHours: acc.absentHours + e.absentHours,
      }),
      { lateCount: 0, lateHours: 0, absentDays: 0, absentHours: 0 }
    );
    const summaryRows = [
      [],
      ["Per-Employee Late & Absent (selected filters)"],
      perEmployeeHeader,
      ...perEmployeeLines,
      [],
      ["TOTAL", "", grandTotal.lateCount, grandTotal.lateHours.toFixed(1), grandTotal.absentDays, grandTotal.absentHours.toFixed(1)],
    ];
    const csv = [header, ...lines, ...summaryRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${dateFrom}_to_${dateTo}.csv`;
    a.click();
  }

  const [exportingLog, setExportingLog] = useState(false);

  // Punch log workbook: one row per Time In / Time Out event, columns
  // Log No. / Employee Code / Employee Name / Date / Time / Direction —
  // matching the layout the user asked for. Date and Time are real
  // spreadsheet cells (not text) so they sort/filter like in Excel.
  async function exportPunchLog() {
    setExportingLog(true);
    let punchQuery = supabase
      .from("attendance")
      .select("time_in, time_out, profiles!inner(employee_code, first_name, last_name)")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: true });
    if (employeeFilter.length > 0) punchQuery = punchQuery.in("employee_id", employeeFilter);
    const { data, error } = await punchQuery;
    setExportingLog(false);
    if (error) return push("error", error.message);

    type PunchRow = {
      time_in: string | null; time_out: string | null;
      profiles: { employee_code: string | null; first_name: string; last_name: string } | null;
    };
    const punches: { emp_code: string; name: string; time: string; direction: string }[] = [];
    for (const r of (data ?? []) as unknown as PunchRow[]) {
      const empCode = r.profiles?.employee_code ?? "";
      const name = r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "";
      if (r.time_in) punches.push({ emp_code: empCode, name, time: r.time_in, direction: "Time In" });
      if (r.time_out) punches.push({ emp_code: empCode, name, time: r.time_out, direction: "Time Out" });
    }
    punches.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const header = ["Log No.", "Employee Code", "Employee Name", "Date", "Time", "Direction"];
    const sheet = XLSX.utils.aoa_to_sheet([header]);
    punches.forEach((p, i) => {
      const rowIdx = i + 1; // 0 = header
      const { year, month, day, hour, minute, second } = getLogDateTimeParts(p.time);
      const empCodeNumeric = Number(p.emp_code);
      const dayFraction = (hour * 3600 + minute * 60 + second) / 86400;

      const setCell = (col: number, cell: XLSX.CellObject) => {
        sheet[XLSX.utils.encode_cell({ r: rowIdx, c: col })] = cell;
      };
      setCell(0, { t: "n", v: i + 1 });
      setCell(1, Number.isFinite(empCodeNumeric) && p.emp_code !== "" ? { t: "n", v: empCodeNumeric } : { t: "s", v: p.emp_code });
      setCell(2, { t: "s", v: p.name });
      setCell(3, { t: "d", v: new Date(year, month - 1, day), z: "yyyy-mm-dd" });
      setCell(4, { t: "n", v: dayFraction, z: "hh:mm:ss" });
      setCell(5, { t: "s", v: p.direction });
    });
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: punches.length, c: header.length - 1 } });
    sheet["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Punch Log");
    XLSX.writeFile(workbook, `punch_log_${dateFrom}_to_${dateTo}.xlsx`);
  }

  function openEdit(r: AttendanceRow) {
    setEditRow(r);
    setEditTimeIn(r.time_in ? toLocalInput(r.time_in) : "");
    setEditTimeOut(r.time_out ? toLocalInput(r.time_out) : "");
  }

  async function saveEdit() {
    if (!editRow) return;
    setSaving(true);
    const time_in = editTimeIn ? new Date(editTimeIn).toISOString() : null;
    const time_out = editTimeOut ? new Date(editTimeOut).toISOString() : null;
    const hours_worked = time_in && time_out ? Math.round(((new Date(time_out).getTime() - new Date(time_in).getTime()) / 3600000) * 100) / 100 : null;
    const { error } = await supabase.from("attendance").update({ time_in, time_out, hours_worked }).eq("id", editRow.id);
    setSaving(false);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: me!.company_id, actor_id: me!.id, actor_name: `${me!.first_name} ${me!.last_name}`,
      action: "Attendance Modified", module: "Attendance", target: editRow.profiles?.employee_code ?? editRow.employee_id,
      details: { time_in, time_out },
    });
    push("success", "Attendance updated.");
    setEditRow(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Attendance</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv} loading={exportingCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button variant="secondary" onClick={exportPunchLog} loading={exportingLog}><Download className="h-4 w-4" /> Export Punch Log</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Late" value={lateCount} accent="bg-amber-500" />
        <StatCard label="Total Late (Hours)" value={`${lateHours.toFixed(1)}h`} accent="bg-amber-600" />
        <StatCard label="Total Absent" value={absentCount} accent="bg-red-500" />
        <StatCard label="Total Absent (Hours)" value={`${absentHours.toFixed(1)}h`} accent="bg-red-600" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-40" />
        <Input label="To" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-40" />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="w-40">
          <option value="all">All</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="undertime">Undertime</option>
          <option value="overtime">Overtime</option>
          <option value="incomplete">Incomplete</option>
        </Select>
        <Select label="Department" value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(0); }} className="w-48">
          <option value="all">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <EmployeeMultiSelect options={employees} selected={employeeFilter} onChange={(ids) => { setEmployeeFilter(ids); setPage(0); }} className="w-56" />
        <Select label="Sort By" value={sortBy} onChange={(e) => { setSortBy(e.target.value as "date" | "name"); setPage(0); }} className="w-44">
          <option value="date">Date (Newest First)</option>
          <option value="name">Employee Name (A–Z)</option>
        </Select>
      </div>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No attendance records for this filter" /> : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time In</th><th className="px-4 py-3">Time Out</th><th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                {me?.role === "admin" && <th className="px-4 py-3 text-right">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.profiles?.first_name} {r.profiles?.last_name}</td>
                  <td className="px-4 py-3 text-slate-500">{r.profiles?.employee_code ?? "—"}</td>
                  <td className="px-4 py-3">{formatDate(r.work_date)}</td>
                  <td className="px-4 py-3">{formatTime(r.time_in)}</td>
                  <td className="px-4 py-3">{formatTime(r.time_out)}</td>
                  <td className="px-4 py-3">{r.hours_worked ?? "—"}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  {me?.role === "admin" && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(r)} className="text-slate-500 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit Attendance">
        {editRow && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{editRow.profiles?.first_name} {editRow.profiles?.last_name} — {formatDate(editRow.work_date)}</p>
            <Input label="Time In" type="datetime-local" value={editTimeIn} onChange={(e) => setEditTimeIn(e.target.value)} />
            <Input label="Time Out" type="datetime-local" value={editTimeOut} onChange={(e) => setEditTimeOut(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={saveEdit} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
