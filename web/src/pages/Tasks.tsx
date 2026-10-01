import { useEffect, useState } from "react";
import { Plus, Check, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Modal, Input, Select, Badge, Spinner, EmptyState, ConfirmDialog } from "../components/ui/ui";
import { formatDate } from "../lib/format";
import type { Task, TaskPriority } from "../types";

interface EmployeeOption { id: string; name: string }

const emptyForm = { title: "", description: "", assigned_to: "", due_date: "", priority: "normal" as TaskPriority };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-red-50 text-red-700",
};

export default function Tasks() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isStaff = profile?.role === "admin" || profile?.role === "hr";
  const [rows, setRows] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    let query = supabase
      .from("tasks")
      .select("*, assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data } = await query;
    setRows((data as unknown as Task[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, statusFilter]);

  useEffect(() => {
    if (!isStaff) return;
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("employment_status", ["active", "on_leave"])
      .order("first_name")
      .then(({ data }) => setEmployees(((data as { id: string; first_name: string; last_name: string }[]) ?? []).map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }))));
  }, [isStaff]);

  function startAdd() {
    setEditing(null);
    setForm({ ...emptyForm, assigned_to: isStaff ? "" : profile!.id });
    setOpen(true);
  }

  function startEdit(t: Task) {
    setEditing(t);
    setForm({ title: t.title, description: t.description ?? "", assigned_to: t.assigned_to, due_date: t.due_date ?? "", priority: t.priority });
    setOpen(true);
  }

  async function submit() {
    if (!profile || !form.title.trim()) {
      push("error", "Please enter a task title.");
      return;
    }
    const assignedTo = isStaff ? form.assigned_to : profile.id;
    if (!assignedTo) {
      push("error", "Please select who this task is for.");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: form.title,
          description: form.description || null,
          assigned_to: assignedTo,
          due_date: form.due_date || null,
          priority: form.priority,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id);
      setSaving(false);
      if (error) return push("error", error.message);
      push("success", "Task updated.");
    } else {
      const { error } = await supabase.from("tasks").insert({
        company_id: profile.company_id,
        title: form.title,
        description: form.description || null,
        assigned_to: assignedTo,
        assigned_by: profile.id,
        due_date: form.due_date || null,
        priority: form.priority,
      });
      setSaving(false);
      if (error) return push("error", error.message);
      if (assignedTo !== profile.id) {
        await supabase.from("notifications").insert({
          user_id: assignedTo,
          title: "New Task Assigned",
          message: `${profile.first_name} ${profile.last_name} assigned you: "${form.title}"`,
          type: "info",
        });
      }
      push("success", "Task added.");
    }
    setOpen(false);
    setForm(emptyForm);
    load();
  }

  async function markDone(t: Task) {
    const { error } = await supabase.rpc("mark_task_done", { p_task_id: t.id });
    if (error) return push("error", error.message);
    push("success", "Task marked as done.");
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("tasks").delete().eq("id", deleteTarget.id);
    if (error) push("error", error.message);
    else {
      push("success", "Task deleted.");
      load();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Tasks</h1>
        <Button onClick={startAdd}><Plus className="h-4 w-4" /> Add Task</Button>
      </div>

      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </Select>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No tasks yet" /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Task</th>
                {isStaff && <th className="px-4 py-3">Assigned To</th>}
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => {
                const isMine = t.assigned_to === profile?.id;
                const canEditDelete = isStaff;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${t.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.title}</p>
                      {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                    </td>
                    {isStaff && (
                      <td className="px-4 py-3 text-slate-600">{t.assignee?.first_name} {t.assignee?.last_name}</td>
                    )}
                    <td className="px-4 py-3">{t.due_date ? formatDate(t.due_date) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-3"><Badge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {isMine && t.status !== "completed" && (
                          <button onClick={() => markDone(t)} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" title="Mark as Done">
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        {canEditDelete && (
                          <>
                            <button onClick={() => startEdit(t)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(t)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Task" : "Add Task"}>
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Prepare monthly attendance report" />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Description (optional)</span>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" rows={2}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          {isStaff && (
            <Select label="Assign To" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? "Save Changes" : "Add Task"}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete task"
        message={`Delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
