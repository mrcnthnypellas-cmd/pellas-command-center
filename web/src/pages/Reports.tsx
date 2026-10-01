import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/toast";
import { Card, Select, Input, Button, Spinner, EmptyState } from "../components/ui/ui";
import EmployeeMultiSelect, { type EmployeeOption } from "../components/ui/EmployeeMultiSelect";
import { formatTime, getLogDateTimeParts, todayInTZ } from "../lib/format";
import type { Department, WorkSchedule } from "../types";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri, 8:00–17:00 default coverage
const DEFAULT_START_TIME = "08:00:00";
const DEFAULT_END_TIME = "17:00:00";
const DEFAULT_BREAK_MINUTES = 60;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

// Local calendar-day key (Y-M-D), safe from the UTC shift toISOString() can
// introduce — the cursor Date objects here are always local midnight.
function localDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHM(totalMinutes: number) {
  const mins = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
// Excel stores durations as a fraction of a 24h day; this custom number
// format then renders that fraction back as "Xh YYm" (elapsed-time format,
// the [h] keeps hours from wrapping at 24 like a clock would).
const DURATION_FORMAT = '[h]"h "mm"m"';
const TOTAL_ROW_STYLE = { font: { bold: true, color: { rgb: "0000FF" } } };
const GRAND_TOTAL_STYLE = { font: { bold: true, color: { rgb: "FF0000" } } };
function minutesToDayFraction(totalMinutes: number) {
  return Math.max(0, totalMinutes) / 1440;
}

export default function Reports() {
  const { push } = useToast();
  const [range, setRange] = useState<"daily" | "weekly" | "monthly" | "cutoff" | "custom">("weekly");
  const [dateFrom, setDateFrom] = useState(toISODate(startOfWeek(new Date())));
  const [dateTo, setDateTo] = useState(todayInTZ());
  const [cutoffMonth, setCutoffMonth] = useState(todayInTZ().slice(0, 7));
  const [cutoffHalf, setCutoffHalf] = useState<"1" | "2">("1");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter, setDeptFilter] = useState("all");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingDetail, setExportingDetail] = useState(false);
  const [exportScope, setExportScope] = useState<"filtered" | "overall">("filtered");
  const [exportingOverall, setExportingOverall] = useState(false);

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
    if (employeeFilter.length > 0) profileQuery = profileQuery.in("id", employeeFilter);

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

  // Detailed Excel report: Sheet 1 is one row per employee per scheduled
  // workday (Mon–Fri per schedule, weekends skipped) showing Late,
  // Undertime, Absent and Overtime as real Excel durations (not text), so
  // every number is inspectable/recalculable in Excel. Sheet 2 rolls each
  // employee up to Late/Undertime/Overtime/Absent totals using a SUM
  // formula over that employee's own rows in Sheet 1 — click any total to
  // see exactly which Daily Detail rows it added up. Sheet 3 explains the
  // rules in words. Overtime only counts hours actually worked past shift
  // end AND covered by an admin-approved overtime request for that date —
  // unapproved late clock-outs (and early clock-ins before shift start)
  // are never counted.
  //
  // exportScope "filtered" respects the Department/Employee pickers above;
  // "overall" ignores them and includes every active/on-leave employee in
  // the company, still as this one workbook.
  async function exportDetailedExcel() {
    setExportingDetail(true);
    let profileQuery = supabase
      .from("profiles")
      .select("id, first_name, last_name, employee_code, department_id, date_hired, schedule_id")
      .in("employment_status", ["active", "on_leave"]);
    if (exportScope === "filtered") {
      if (deptFilter !== "all") profileQuery = profileQuery.eq("department_id", deptFilter);
      if (employeeFilter.length > 0) profileQuery = profileQuery.in("id", employeeFilter);
    }

    const [
      { data: profilesData, error: profilesError },
      { data: schedulesData },
      { data: attendanceData, error: attendanceError },
      { data: otData },
    ] = await Promise.all([
      profileQuery,
      supabase.from("work_schedules").select("*"),
      supabase.from("attendance").select("employee_id, work_date, time_in, time_out").gte("work_date", dateFrom).lte("work_date", dateTo),
      supabase.from("overtime_requests").select("employee_id, work_date, approved_hours").eq("status", "approved").gte("work_date", dateFrom).lte("work_date", dateTo),
    ]);
    setExportingDetail(false);
    if (profilesError || attendanceError || !profilesData) {
      push("error", profilesError?.message ?? attendanceError?.message ?? "Failed to load report data.");
      return;
    }

    const scheduleMap = new Map<string, WorkSchedule>(((schedulesData as WorkSchedule[]) ?? []).map((s) => [s.id, s]));
    const attByKey = new Map<string, { time_in: string | null; time_out: string | null }>();
    for (const a of (attendanceData as { employee_id: string; work_date: string; time_in: string | null; time_out: string | null }[]) ?? []) {
      attByKey.set(`${a.employee_id}|${a.work_date}`, { time_in: a.time_in, time_out: a.time_out });
    }
    const approvedOtByKey = new Map<string, number>();
    for (const o of (otData as { employee_id: string; work_date: string; approved_hours: number | null }[]) ?? []) {
      const key = `${o.employee_id}|${o.work_date}`;
      approvedOtByKey.set(key, (approvedOtByKey.get(key) ?? 0) + Number(o.approved_hours ?? 0));
    }

    const today = todayInTZ();
    const detailRows: (string | number)[][] = [];
    // Row range (1-based Excel row numbers, header is row 1) each
    // employee's Daily Detail rows occupy, so the Summary sheet's SUM
    // formulas can point straight at them.
    const summary = new Map<
      string,
      { name: string; code: string | null; firstRow: number | null; lastRow: number | null }
    >();

    for (const p of (profilesData as { id: string; first_name: string; last_name: string; employee_code: string | null; date_hired: string | null; schedule_id: string | null }[]) ?? []) {
      const schedule = p.schedule_id ? scheduleMap.get(p.schedule_id) : undefined;
      const workDays = schedule?.work_days ?? DEFAULT_WORK_DAYS;
      const shiftStartMin = toMinutes(schedule?.start_time ?? DEFAULT_START_TIME);
      const shiftEndMin = toMinutes(schedule?.end_time ?? DEFAULT_END_TIME);
      const breakMinutes = schedule?.break_minutes ?? DEFAULT_BREAK_MINUTES;
      const shiftMinutes = Math.max(0, shiftEndMin - shiftStartMin - breakMinutes);
      const name = `${p.first_name} ${p.last_name}`;

      summary.set(p.id, { name, code: p.employee_code, firstRow: null, lastRow: null });
      const empSummary = summary.get(p.id)!;

      const start = p.date_hired && p.date_hired > dateFrom ? p.date_hired : dateFrom;
      const end = dateTo < today ? dateTo : today;
      if (start > end) continue;

      const cursor = new Date(`${start}T00:00:00`);
      const endDate = new Date(`${end}T00:00:00`);
      while (cursor <= endDate) {
        const dow = cursor.getDay();
        if (!workDays.includes(dow)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        const dateKey = localDateKey(cursor);
        const rec = attByKey.get(`${p.id}|${dateKey}`);

        let lateMin = 0, undertimeMin = 0, overtimeMin = 0, absentMin = 0;
        let timeInLabel = "—", timeOutLabel = "—", statusLabel: string;

        if (!rec || !rec.time_in) {
          absentMin = shiftMinutes;
          statusLabel = "Absent";
        } else {
          timeInLabel = formatTime(rec.time_in);
          const inParts = getLogDateTimeParts(rec.time_in);
          lateMin = Math.max(0, inParts.hour * 60 + inParts.minute - shiftStartMin);

          if (rec.time_out) {
            timeOutLabel = formatTime(rec.time_out);
            const outParts = getLogDateTimeParts(rec.time_out);
            const outMin = outParts.hour * 60 + outParts.minute;
            undertimeMin = Math.max(0, shiftEndMin - outMin);
            const rawOvertimeMin = Math.max(0, outMin - shiftEndMin);
            const approvedMin = (approvedOtByKey.get(`${p.id}|${dateKey}`) ?? 0) * 60;
            overtimeMin = Math.min(rawOvertimeMin, approvedMin);
            statusLabel = lateMin > 0 && undertimeMin > 0 ? "Late & Undertime" : lateMin > 0 ? "Late" : undertimeMin > 0 ? "Undertime" : overtimeMin > 0 ? "Overtime" : "Present";
          } else {
            statusLabel = "Incomplete";
          }
        }

        detailRows.push([
          name, p.employee_code ?? "", dateKey, DAY_NAMES[dow],
          timeInLabel, timeOutLabel,
          minutesToDayFraction(lateMin), minutesToDayFraction(undertimeMin), minutesToDayFraction(absentMin), minutesToDayFraction(overtimeMin),
          statusLabel,
        ]);

        // Excel row = array index + 2 (1 for 1-based, 1 for the header row).
        const excelRow = detailRows.length + 1;
        if (empSummary.firstRow == null) empSummary.firstRow = excelRow;
        empSummary.lastRow = excelRow;

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const detailHeader = ["Employee", "ID", "Date", "Day", "Time In", "Time Out", "Late", "Undertime", "Absent", "Overtime", "Status"];
    const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
    detailSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    // Give the Late/Undertime/Absent/Overtime columns (G–J) the duration
    // display format so they read as "Xh YYm" while staying real numbers.
    for (let r = 2; r <= detailRows.length + 1; r++) {
      for (const col of ["G", "H", "I", "J"]) {
        const cell = detailSheet[`${col}${r}`];
        if (cell) cell.z = DURATION_FORMAT;
      }
    }

    const sortedEmployees = Array.from(summary.values()).sort((a, b) => a.name.localeCompare(b.name));
    const summaryHeader = ["Employee", "ID", "Total Late", "Total Undertime", "Total Overtime", "Total Absent"];
    const summaryAoa: (string | number)[][] = [summaryHeader, ...sortedEmployees.map((e) => [e.name, e.code ?? "", 0, 0, 0, 0])];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
    summarySheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];

    // Replace each employee's placeholder 0s with a live SUM formula over
    // that employee's own Daily Detail rows — click any total in Excel to
    // see exactly which rows (and dates) it added up.
    sortedEmployees.forEach((e, i) => {
      const excelRow = i + 2;
      const cols: Record<string, string> = { C: "G", D: "H", E: "I", F: "J" };
      for (const [summaryCol, detailCol] of Object.entries(cols)) {
        const cellRef = `${summaryCol}${excelRow}`;
        if (e.firstRow != null && e.lastRow != null) {
          summarySheet[cellRef] = { t: "n", f: `SUM('Daily Detail'!${detailCol}${e.firstRow}:${detailCol}${e.lastRow})`, z: DURATION_FORMAT };
        } else {
          summarySheet[cellRef] = { t: "n", v: 0, z: DURATION_FORMAT };
        }
      }
    });
    // Grand-total row, also a formula — sums the Summary sheet's own totals.
    const totalRow = sortedEmployees.length + 2;
    summarySheet[`A${totalRow}`] = { t: "s", v: "TOTAL" };
    summarySheet[`B${totalRow}`] = { t: "s", v: "" };
    for (const col of ["C", "D", "E", "F"]) {
      summarySheet[`${col}${totalRow}`] = { t: "n", f: `SUM(${col}2:${col}${totalRow - 1})`, z: DURATION_FORMAT };
    }
    summarySheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow - 1, c: 5 } });

    const notesAoa = [
      ["How each figure is computed"],
      [],
      ["Shift", "8:00 AM – 5:00 PM, Monday to Friday only (per the employee's assigned schedule, or this default if none is assigned)."],
      ["Late", "= Time In − 8:00 AM, only if positive. Clocking in earlier than 8:00 AM is not counted (0 late, and that early time is not paid or banked)."],
      ["Undertime", "= 5:00 PM − Time Out, only if positive. Leaving at or after 5:00 PM gives 0 undertime."],
      ["Absent", "= the full scheduled shift length (default 8h, after the 1h break) for any scheduled workday with no Time In recorded."],
      ["Overtime", "= MIN(actual time worked past 5:00 PM, hours approved on an Overtime Request for that date). Unapproved late clock-outs are never counted — see the Overtime page for the request/approval workflow."],
      [],
      ["Daily Detail sheet", "One row per employee per scheduled workday. Late/Undertime/Absent/Overtime are real Excel duration values (format [h]\"h \"mm\"m\"), not text, so they can be summed or recalculated directly."],
      ["Summary sheet", "Each employee's totals are =SUM(...) formulas over that employee's own row range in Daily Detail — click a total cell in Excel to see which rows and dates were added."],
    ];
    const notesSheet = XLSX.utils.aoa_to_sheet(notesAoa);
    notesSheet["!cols"] = [{ wch: 16 }, { wch: 100 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Daily Detail");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, notesSheet, "Formula Notes");
    const scopeSuffix = exportScope === "overall" ? "_overall" : "";
    const suffix = (range === "cutoff" ? `${cutoffMonth}_cutoff${cutoffHalf}` : `${dateFrom}_to_${dateTo}`) + scopeSuffix;
    XLSX.writeFile(workbook, `attendance_detailed_${suffix}.xlsx`);
  }

  // "Export Overall": a single workbook that combines what the Attendance
  // page's exports and this Reports page's exports each cover separately,
  // so there's one file with everything instead of juggling several. Does
  // not touch or replace any of the existing export buttons.
  //   1. Attendance Records   - every clock-in/out row in range (like
  //      Attendance's Export CSV, minus its per-employee block below).
  //   2. Late & Absent by Employee - per-employee Late/Absent count + hours
  //      (like Attendance's per-employee CSV block), rule-based.
  //   3. Report Summary       - Present/Late/Absent/Overtime/Undertime/
  //      Total Hours per employee (like this page's Export CSV).
  //   4. Daily Detail         - one row per employee per scheduled workday.
  //   5. Late/Undertime/Overtime/Absent Summary - per-employee totals as
  //      live =SUM(...) formulas over sheet 4's rows.
  //   6. Formula Notes        - how each figure is computed, in words.
  async function exportOverallExcel() {
    setExportingOverall(true);
    let profileQuery = supabase
      .from("profiles")
      .select("id, first_name, last_name, employee_code, department_id, date_hired, schedule_id, departments(name)")
      .in("employment_status", ["active", "on_leave"]);
    if (exportScope === "filtered") {
      if (deptFilter !== "all") profileQuery = profileQuery.eq("department_id", deptFilter);
      if (employeeFilter.length > 0) profileQuery = profileQuery.in("id", employeeFilter);
    }

    const [
      { data: profilesData, error: profilesError },
      { data: schedulesData },
      { data: attendanceData, error: attendanceError },
      { data: otData },
    ] = await Promise.all([
      profileQuery,
      supabase.from("work_schedules").select("*"),
      supabase.from("attendance").select("employee_id, work_date, time_in, time_out, status, hours_worked").gte("work_date", dateFrom).lte("work_date", dateTo),
      supabase.from("overtime_requests").select("employee_id, work_date, approved_hours").eq("status", "approved").gte("work_date", dateFrom).lte("work_date", dateTo),
    ]);
    setExportingOverall(false);
    if (profilesError || attendanceError || !profilesData) {
      push("error", profilesError?.message ?? attendanceError?.message ?? "Failed to load report data.");
      return;
    }

    type ProfileRow = { id: string; first_name: string; last_name: string; employee_code: string | null; date_hired: string | null; schedule_id: string | null; departments?: { name: string } | null };
    type AttRow = { employee_id: string; work_date: string; time_in: string | null; time_out: string | null; status: string; hours_worked: number | null };

    const profileById = new Map<string, ProfileRow>(((profilesData as unknown as ProfileRow[]) ?? []).map((p) => [p.id, p]));
    const scheduleMap = new Map<string, WorkSchedule>(((schedulesData as WorkSchedule[]) ?? []).map((s) => [s.id, s]));
    const attByKey = new Map<string, { time_in: string | null; time_out: string | null; hours_worked: number | null }>();
    const attByEmployee = new Map<string, AttRow[]>();
    for (const a of (attendanceData as AttRow[]) ?? []) {
      attByKey.set(`${a.employee_id}|${a.work_date}`, { time_in: a.time_in, time_out: a.time_out, hours_worked: a.hours_worked });
      if (!attByEmployee.has(a.employee_id)) attByEmployee.set(a.employee_id, []);
      attByEmployee.get(a.employee_id)!.push(a);
    }
    const approvedOtByKey = new Map<string, number>();
    for (const o of (otData as { employee_id: string; work_date: string; approved_hours: number | null }[]) ?? []) {
      const key = `${o.employee_id}|${o.work_date}`;
      approvedOtByKey.set(key, (approvedOtByKey.get(key) ?? 0) + Number(o.approved_hours ?? 0));
    }

    // --- Per-employee accumulators shared by sheets 1, 2, 3, 4 & 5 ---
    const today = todayInTZ();
    const detailRows: (string | number)[][] = [];
    const perEmployee = new Map<
      string,
      {
        name: string; code: string | null; department: string;
        firstDetailRow: number | null; lastDetailRow: number | null;
        lateDayCount: number; lateMin: number; absentDayCount: number; absentMin: number;
        ledger: (string | number)[][];
      }
    >();

    for (const p of (profilesData as unknown as ProfileRow[]) ?? []) {
      const schedule = p.schedule_id ? scheduleMap.get(p.schedule_id) : undefined;
      const workDays = schedule?.work_days ?? DEFAULT_WORK_DAYS;
      const shiftStartMin = toMinutes(schedule?.start_time ?? DEFAULT_START_TIME);
      const shiftEndMin = toMinutes(schedule?.end_time ?? DEFAULT_END_TIME);
      const breakMinutes = schedule?.break_minutes ?? DEFAULT_BREAK_MINUTES;
      const shiftMinutes = Math.max(0, shiftEndMin - shiftStartMin - breakMinutes);
      const name = `${p.first_name} ${p.last_name}`;

      perEmployee.set(p.id, {
        name, code: p.employee_code, department: p.departments?.name ?? "—",
        firstDetailRow: null, lastDetailRow: null,
        lateDayCount: 0, lateMin: 0, absentDayCount: 0, absentMin: 0,
        ledger: [],
      });
      const acc = perEmployee.get(p.id)!;

      const start = p.date_hired && p.date_hired > dateFrom ? p.date_hired : dateFrom;
      const end = dateTo < today ? dateTo : today;
      if (start > end) continue;

      const cursor = new Date(`${start}T00:00:00`);
      const endDate = new Date(`${end}T00:00:00`);
      while (cursor <= endDate) {
        const dow = cursor.getDay();
        if (!workDays.includes(dow)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        const dateKey = localDateKey(cursor);
        const rec = attByKey.get(`${p.id}|${dateKey}`);

        let lateMin = 0, undertimeMin = 0, overtimeMin = 0, absentMin = 0;
        let timeInLabel = "—", timeOutLabel = "—", statusLabel: string;

        if (!rec || !rec.time_in) {
          absentMin = shiftMinutes;
          statusLabel = "Absent";
        } else {
          timeInLabel = formatTime(rec.time_in);
          const inParts = getLogDateTimeParts(rec.time_in);
          lateMin = Math.max(0, inParts.hour * 60 + inParts.minute - shiftStartMin);

          if (rec.time_out) {
            timeOutLabel = formatTime(rec.time_out);
            const outParts = getLogDateTimeParts(rec.time_out);
            const outMin = outParts.hour * 60 + outParts.minute;
            undertimeMin = Math.max(0, shiftEndMin - outMin);
            const rawOvertimeMin = Math.max(0, outMin - shiftEndMin);
            const approvedMin = (approvedOtByKey.get(`${p.id}|${dateKey}`) ?? 0) * 60;
            overtimeMin = Math.min(rawOvertimeMin, approvedMin);
            statusLabel = lateMin > 0 && undertimeMin > 0 ? "Late & Undertime" : lateMin > 0 ? "Late" : undertimeMin > 0 ? "Undertime" : overtimeMin > 0 ? "Overtime" : "Present";
          } else {
            statusLabel = "Incomplete";
          }
        }

        detailRows.push([
          name, p.employee_code ?? "", dateKey, DAY_NAMES[dow],
          timeInLabel, timeOutLabel,
          minutesToDayFraction(lateMin), minutesToDayFraction(undertimeMin), minutesToDayFraction(absentMin), minutesToDayFraction(overtimeMin),
          statusLabel,
        ]);
        acc.ledger.push([
          name, p.employee_code ?? "", dateKey, timeInLabel, timeOutLabel,
          rec?.hours_worked ?? "", statusLabel,
          minutesToDayFraction(lateMin), minutesToDayFraction(undertimeMin), minutesToDayFraction(absentMin), minutesToDayFraction(overtimeMin),
        ]);

        const excelRow = detailRows.length + 1;
        if (acc.firstDetailRow == null) acc.firstDetailRow = excelRow;
        acc.lastDetailRow = excelRow;
        if (lateMin > 0) { acc.lateDayCount++; acc.lateMin += lateMin; }
        if (absentMin > 0) { acc.absentDayCount++; acc.absentMin += absentMin; }

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // --- Sheet 1: Attendance Records (one line per scheduled workday,
    // grouped by employee in date order — including days with no clock-in,
    // so Absent shows up as its own line — with a Late/Undertime/Absent/
    // Overtime SUBTOTAL row after each employee's lines, and one grand
    // TOTAL row at the very bottom summing those subtotals) ---
    const sortedForLedger = Array.from(perEmployee.values()).sort((a, b) => a.name.localeCompare(b.name));
    const attendanceHeader = ["Employee", "ID", "Date", "Time In", "Time Out", "Hours", "Status", "Late", "Undertime", "Absent", "Overtime"];
    const attendanceAoa: (string | number)[][] = [attendanceHeader];
    const employeeBlocks: { startRow: number; endRow: number; subtotalRow: number }[] = [];
    for (const e of sortedForLedger) {
      if (e.ledger.length === 0) continue;
      const startRow = attendanceAoa.length + 1;
      for (const row of e.ledger) attendanceAoa.push(row);
      const endRow = attendanceAoa.length;
      attendanceAoa.push([`Subtotal — ${e.name}`, e.code ?? "", "", "", "", 0, "", 0, 0, 0, 0]);
      employeeBlocks.push({ startRow, endRow, subtotalRow: attendanceAoa.length });
    }
    const attendanceSheet = XLSX.utils.aoa_to_sheet(attendanceAoa);
    attendanceSheet["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    for (let r = 2; r <= attendanceAoa.length; r++) {
      for (const col of ["H", "I", "J", "K"]) {
        const cell = attendanceSheet[`${col}${r}`];
        if (cell) cell.z = DURATION_FORMAT;
      }
    }
    // Per-employee subtotal — a live SUM over just that employee's own rows
    // above it, styled bold blue like the grand TOTAL row.
    for (const b of employeeBlocks) {
      if (attendanceSheet[`A${b.subtotalRow}`]) attendanceSheet[`A${b.subtotalRow}`].s = TOTAL_ROW_STYLE;
      if (attendanceSheet[`B${b.subtotalRow}`]) attendanceSheet[`B${b.subtotalRow}`].s = TOTAL_ROW_STYLE;
      attendanceSheet[`F${b.subtotalRow}`] = { t: "n", f: `SUM(F${b.startRow}:F${b.endRow})`, s: TOTAL_ROW_STYLE };
      for (const col of ["H", "I", "J", "K"]) {
        attendanceSheet[`${col}${b.subtotalRow}`] = { t: "n", f: `SUM(${col}${b.startRow}:${col}${b.endRow})`, z: DURATION_FORMAT, s: TOTAL_ROW_STYLE };
      }
    }
    // Grand TOTAL row — sums the per-employee subtotal rows, not the raw
    // data rows again, so nothing gets double-counted.
    const grandTotalRow = attendanceAoa.length + 1;
    attendanceSheet[`A${grandTotalRow}`] = { t: "s", v: "TOTAL", s: GRAND_TOTAL_STYLE };
    if (employeeBlocks.length > 0) {
      attendanceSheet[`F${grandTotalRow}`] = { t: "n", f: `SUM(${employeeBlocks.map((b) => `F${b.subtotalRow}`).join(",")})`, s: GRAND_TOTAL_STYLE };
      for (const col of ["H", "I", "J", "K"]) {
        attendanceSheet[`${col}${grandTotalRow}`] = { t: "n", f: `SUM(${employeeBlocks.map((b) => `${col}${b.subtotalRow}`).join(",")})`, z: DURATION_FORMAT, s: GRAND_TOTAL_STYLE };
      }
    } else {
      attendanceSheet[`F${grandTotalRow}`] = { t: "n", v: 0, s: GRAND_TOTAL_STYLE };
      for (const col of ["H", "I", "J", "K"]) attendanceSheet[`${col}${grandTotalRow}`] = { t: "n", v: 0, z: DURATION_FORMAT, s: GRAND_TOTAL_STYLE };
    }
    attendanceSheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: grandTotalRow - 1, c: 10 } });

    // --- Sheet 2: Late & Absent by Employee (Attendance-page style) ---
    const lateAbsentHeader = ["Employee", "ID", "Total Late", "Total Late Hours", "Total Absent", "Total Absent Hours"];
    const sortedForLateAbsent = Array.from(perEmployee.values()).sort((a, b) => a.name.localeCompare(b.name));
    const lateAbsentRows = sortedForLateAbsent.map((e) => [e.name, e.code ?? "", e.lateDayCount, minutesToHM(e.lateMin), e.absentDayCount, minutesToHM(e.absentMin)]);
    const lateAbsentTotal = sortedForLateAbsent.reduce(
      (acc, e) => ({ lateDayCount: acc.lateDayCount + e.lateDayCount, lateMin: acc.lateMin + e.lateMin, absentDayCount: acc.absentDayCount + e.absentDayCount, absentMin: acc.absentMin + e.absentMin }),
      { lateDayCount: 0, lateMin: 0, absentDayCount: 0, absentMin: 0 }
    );
    lateAbsentRows.push(["TOTAL", "", lateAbsentTotal.lateDayCount, minutesToHM(lateAbsentTotal.lateMin), lateAbsentTotal.absentDayCount, minutesToHM(lateAbsentTotal.absentMin)]);
    const lateAbsentSheet = XLSX.utils.aoa_to_sheet([lateAbsentHeader, ...lateAbsentRows]);
    lateAbsentSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 16 }];

    // --- Sheet 3: Report Summary (status/hours_worked-based, like this
    // page's own Export CSV) ---
    const reportHeader = ["Employee", "ID", "Department", "Present", "Late", "Absent", "Overtime", "Undertime", "Total Hours"];
    const reportRows: (string | number)[][] = [];
    for (const p of (profilesData as unknown as ProfileRow[]) ?? []) {
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
      reportRows.push([`${p.first_name} ${p.last_name}`, p.employee_code ?? "", p.departments?.name ?? "—", presentDays, lateDays, absentDays, overtimeDays, undertimeDays, Number(totalHours.toFixed(2))]);
    }
    reportRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const reportTotal = reportRows.reduce(
      (acc, r) => ({ present: acc.present + Number(r[3]), late: acc.late + Number(r[4]), absent: acc.absent + Number(r[5]), overtime: acc.overtime + Number(r[6]), undertime: acc.undertime + Number(r[7]), hours: acc.hours + Number(r[8]) }),
      { present: 0, late: 0, absent: 0, overtime: 0, undertime: 0, hours: 0 }
    );
    reportRows.push(["TOTAL", "", "", reportTotal.present, reportTotal.late, reportTotal.absent, reportTotal.overtime, reportTotal.undertime, Number(reportTotal.hours.toFixed(2))]);
    const reportSheet = XLSX.utils.aoa_to_sheet([reportHeader, ...reportRows]);
    reportSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 12 }];

    // --- Sheet 4: Daily Detail ---
    const detailHeader = ["Employee", "ID", "Date", "Day", "Time In", "Time Out", "Late", "Undertime", "Absent", "Overtime", "Status"];
    const detailSheet = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
    detailSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    for (let r = 2; r <= detailRows.length + 1; r++) {
      for (const col of ["G", "H", "I", "J"]) {
        const cell = detailSheet[`${col}${r}`];
        if (cell) cell.z = DURATION_FORMAT;
      }
    }

    // --- Sheet 5: Late/Undertime/Overtime/Absent Summary (formulas over sheet 4) ---
    const sortedForSummary = Array.from(perEmployee.values()).sort((a, b) => a.name.localeCompare(b.name));
    const summaryHeader = ["Employee", "ID", "Total Late", "Total Undertime", "Total Overtime", "Total Absent"];
    const summaryAoa: (string | number)[][] = [summaryHeader, ...sortedForSummary.map((e) => [e.name, e.code ?? "", 0, 0, 0, 0])];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
    summarySheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    sortedForSummary.forEach((e, i) => {
      const excelRow = i + 2;
      const cols: Record<string, string> = { C: "G", D: "H", E: "I", F: "J" };
      for (const [summaryCol, detailCol] of Object.entries(cols)) {
        const cellRef = `${summaryCol}${excelRow}`;
        if (e.firstDetailRow != null && e.lastDetailRow != null) {
          summarySheet[cellRef] = { t: "n", f: `SUM('Daily Detail'!${detailCol}${e.firstDetailRow}:${detailCol}${e.lastDetailRow})`, z: DURATION_FORMAT };
        } else {
          summarySheet[cellRef] = { t: "n", v: 0, z: DURATION_FORMAT };
        }
      }
    });
    const totalRow = sortedForSummary.length + 2;
    summarySheet[`A${totalRow}`] = { t: "s", v: "TOTAL" };
    summarySheet[`B${totalRow}`] = { t: "s", v: "" };
    for (const col of ["C", "D", "E", "F"]) {
      summarySheet[`${col}${totalRow}`] = { t: "n", f: `SUM(${col}2:${col}${totalRow - 1})`, z: DURATION_FORMAT };
    }
    summarySheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow - 1, c: 5 } });

    // --- Sheet 6: Formula Notes ---
    const notesAoa = [
      ["How each figure is computed"],
      [],
      ["Shift", "8:00 AM – 5:00 PM, Monday to Friday only (per the employee's assigned schedule, or this default if none is assigned)."],
      ["Late", "= Time In − 8:00 AM, only if positive. Clocking in earlier than 8:00 AM is not counted (0 late, and that early time is not paid or banked)."],
      ["Undertime", "= 5:00 PM − Time Out, only if positive. Leaving at or after 5:00 PM gives 0 undertime."],
      ["Absent", "= the full scheduled shift length (default 8h, after the 1h break) for any scheduled workday with no Time In recorded."],
      ["Overtime", "= MIN(actual time worked past 5:00 PM, hours approved on an Overtime Request for that date). Unapproved late clock-outs are never counted — see the Overtime page for the request/approval workflow."],
      [],
      ["Attendance Records", "One line per scheduled workday, grouped by employee in date order, including days with no clock-in (shown as Absent). Late/Undertime/Absent/Overtime are real Excel duration values per line, with a Subtotal row (as SUM formulas) after each employee and one grand TOTAL row at the bottom summing those subtotals."],
      ["Late & Absent by Employee", "Per-employee Total Late / Total Absent (count + hours), same figures as the Attendance page's stat cards and per-employee CSV block."],
      ["Report Summary", "Present/Late/Absent/Overtime/Undertime day counts and Total Hours per employee, same as this page's own Export CSV."],
      ["Daily Detail", "One row per employee per scheduled workday. Late/Undertime/Absent/Overtime are real Excel duration values (format [h]\"h \"mm\"m\"), not text, so they can be summed or recalculated directly."],
      ["Hours Summary", "Late/Undertime/Overtime/Absent totals per employee, as =SUM(...) formulas over that employee's own row range in Daily Detail — click a total cell in Excel to see which rows and dates were added."],
    ];
    const notesSheet = XLSX.utils.aoa_to_sheet(notesAoa);
    notesSheet["!cols"] = [{ wch: 22 }, { wch: 100 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, attendanceSheet, "Attendance Records");
    XLSX.utils.book_append_sheet(workbook, lateAbsentSheet, "Late & Absent by Employee");
    XLSX.utils.book_append_sheet(workbook, reportSheet, "Report Summary");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Daily Detail");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Hours Summary");
    XLSX.utils.book_append_sheet(workbook, notesSheet, "Formula Notes");
    const scopeSuffix = exportScope === "overall" ? "_overall" : "";
    const suffix = (range === "cutoff" ? `${cutoffMonth}_cutoff${cutoffHalf}` : `${dateFrom}_to_${dateTo}`) + scopeSuffix;
    XLSX.writeFile(workbook, `attendance_overall_${suffix}.xlsx`);
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
          <EmployeeMultiSelect options={employees} selected={employeeFilter} onChange={setEmployeeFilter} className="w-56" />
          <Button onClick={generate} loading={loading}><FileBarChart className="h-4 w-4" /> Generate</Button>
          {rows.length > 0 && <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
          <Select label="Export Scope" value={exportScope} onChange={(e) => setExportScope(e.target.value as "filtered" | "overall")} className="w-52">
            <option value="filtered">Selected Filters</option>
            <option value="overall">Overall (All Employees)</option>
          </Select>
          <Button variant="secondary" onClick={exportDetailedExcel} loading={exportingDetail}><Download className="h-4 w-4" /> Export Detailed Excel (Late/Undertime/Absent/OT)</Button>
          <Button onClick={exportOverallExcel} loading={exportingOverall}><Download className="h-4 w-4" /> Export Overall (Attendance + Reports, 1 file)</Button>
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
