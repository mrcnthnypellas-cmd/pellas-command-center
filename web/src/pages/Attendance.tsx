import { useEffect, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card, Badge, Spinner, EmptyState, Select, Input, Button, Modal } from "../components/ui/ui";
import { formatDate, formatTime, todayInTZ } from "../lib/format";
import type { Attendance as AttendanceRow, Department } from "../types";

const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
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
      .lte("work_date", dateTo)
      .order("work_date", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (deptFilter !== "all") query = query.eq("profiles.department_id", deptFilter);

    const from = page * PAGE_SIZE;
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
    setRows((data as unknown as AttendanceRow[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    supabase.from("departments").select("*").order("name").then(({ data }) => setDepartments((data as Department[]) ?? []));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, status, deptFilter, page]);

  function exportCsv() {
    const header = ["Employee", "ID", "Date", "Time In", "Time Out", "Hours", "Status"];
    const lines = rows.map((r) => [
      `${r.profiles?.first_name} ${r.profiles?.last_name}`,
      r.profiles?.employee_code ?? "",
      r.work_date,
      formatTime(r.time_in),
      formatTime(r.time_out),
      r.hours_worked ?? "",
      r.status,
    ]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${dateFrom}_to_${dateTo}.csv`;
    a.click();
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
        <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
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
