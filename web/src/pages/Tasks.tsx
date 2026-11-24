import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Modal, Input, Select, ConfirmDialog } from "../components/ui/ui";
import { formatDate } from "../lib/format";
import type { Task, TaskPriority, TaskStatus } from "../types";

interface EmployeeOption { id: string; name: string }

const emptyForm = { title: "", description: "", assigned_to: "", due_date: "", priority: "normal" as TaskPriority };

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-red-50 text-red-700",
};

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "pending", label: "To Do", accent: "border-t-slate-400" },
  { key: "in_progress", label: "In Progress", accent: "border-t-amber-400" },
  { key: "completed", label: "Completed", accent: "border-t-emerald-400" },
];

export default function Tasks() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isStaff = profile?.role === "admin" || profile?.role === "hr";
  const [rows, setRows] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*, assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setRows((data as unknown as Task[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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
    setForm(emptyForm);
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
    const assignedTo = form.assigned_to;
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
      const { data: created, error } = await supabase
        .from("tasks")
        .insert({
          company_id: profile.company_id,
          title: form.title,
          description: form.description || null,
          assigned_to: assignedTo,
          assigned_by: profile.id,
          due_date: form.due_date || null,
          priority: form.priority,
        })
        .select("id")
        .single();
      setSaving(false);
      if (error) return push("error", error.message);
      if (assignedTo !== profile.id) {
        await supabase.from("notifications").insert({
          user_id: assignedTo,
          title: "New Task Assigned",
          message: `${profile.first_name} ${profile.last_name} assigned you: "${form.title}"`,
          type: "info",
        });
        void callEdgeFunction("send-task-email", { task_id: created.id });
      }
      push("success", "Task added.");
    }
    setOpen(false);
    setForm(emptyForm);
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

  async function moveTask(taskId: string, status: TaskStatus) {
    const task = rows.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    setMovingId(taskId);
    // Optimistic update so the card jumps to its new column immediately.
    setRows((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const { error } = await supabase.rpc("set_task_status", { p_task_id: taskId, p_status: status });
    setMovingId(null);
    if (error) {
      push("error", error.message);
      load();
      return;
    }
    load();
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/task-id");
    if (taskId) moveTask(taskId, status);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Tasks</h1>
        {isStaff && <Button onClick={startAdd}><Plus className="h-4 w-4" /> Add Task</Button>}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colTasks = rows.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => handleDrop(e, col.key)}
                className={`flex flex-col gap-3 rounded-xl border-t-4 bg-slate-50 p-3 ${col.accent} ${dragOverCol === col.key ? "ring-2 ring-brand-400" : ""}`}
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-700">{col.label}</h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{colTasks.length}</span>
                </div>

                {colTasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">No tasks here</p>
                ) : (
                  colTasks.map((t) => (
                    <Card
                      key={t.id}
                      draggable
                      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData("text/task-id", t.id)}
                      className={`cursor-grab space-y-2 p-3 active:cursor-grabbing ${movingId === t.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <p className="text-sm font-medium text-slate-700">{t.title}</p>
                        </div>
                        {isStaff && (
                          <div className="flex shrink-0 gap-1">
                            <button onClick={() => startEdit(t)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(t)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                        {t.due_date && <span className="text-[11px] text-slate-400">Due {formatDate(t.due_date)}</span>}
                      </div>
                      {isStaff && (
                        <p className="text-[11px] text-slate-400">{t.assignee?.first_name} {t.assignee?.last_name}</p>
                      )}
                    </Card>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Task" : "Add Task"}>
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Prepare monthly attendance report" />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Description (optional)</span>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" rows={2}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <Select label="Assign To" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
            <option value="">Select employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
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
