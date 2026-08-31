import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Card, Select, Spinner, EmptyState, Modal } from "../components/ui/ui";
import { formatDate } from "../lib/format";
import type { Profile, Department } from "../types";

export default function Employees() {
  const { profile: me } = useAuth();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selected, setSelected] = useState<Profile | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: e }, { data: d }] = await Promise.all([
        supabase.from("profiles").select("*, departments(name), work_schedules(name, start_time, end_time)").order("first_name"),
        supabase.from("departments").select("*").order("name"),
      ]);
      setEmployees((e as Profile[]) ?? []);
      setDepartments((d as Department[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = employees.filter((e) => {
    const matchesDept = deptFilter === "all" || e.department_id === deptFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || `${e.first_name} ${e.last_name} ${e.employee_code ?? ""} ${e.position ?? ""}`.toLowerCase().includes(q);
    return matchesDept && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Employees</h1>
        {me?.role === "admin" && <p className="text-xs text-slate-400">To edit, use the Users page.</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search name, ID, position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-52">
          <option value="all">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>

      <Card className="overflow-x-auto">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No employees found" />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3 text-slate-500">{e.employee_code ?? "—"}</td>
                  <td className="px-4 py-3">{e.departments?.name ?? "—"}</td>
                  <td className="px-4 py-3">{e.position ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{e.employment_status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Employee Details">
        {selected && (
          <div className="space-y-2 text-sm">
            <Row label="Name" value={`${selected.first_name} ${selected.middle_name ? selected.middle_name + " " : ""}${selected.last_name}`} />
            <Row label="Employee ID" value={selected.employee_code ?? "—"} />
            <Row label="Username" value={selected.username} />
            <Row label="Department" value={selected.departments?.name ?? "—"} />
            <Row label="Position" value={selected.position ?? "—"} />
            <Row label="Schedule" value={selected.work_schedules ? `${selected.work_schedules.name} (${selected.work_schedules.start_time}–${selected.work_schedules.end_time})` : "—"} />
            <Row label="Date Hired" value={formatDate(selected.date_hired)} />
            <Row label="Employment Status" value={selected.employment_status.replace("_", " ")} />
            <Row label="Email" value={selected.email ?? "—"} />
            <Row label="Phone" value={selected.phone ?? "—"} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
