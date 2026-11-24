import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, Send } from "lucide-react";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Modal, Input, Select, ConfirmDialog, Avatar } from "../components/ui/ui";
import { formatDate, formatDateTime } from "../lib/format";
import type { Task, TaskPriority, TaskStatus } from "../types";

interface EmployeeOption { id: string; first_name: string; last_name: string; photo_url: string | null }

interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  message: string;
  created_at: string;
}

interface TaskView {
  user_id: string;
  viewed_at: string;
}

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
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [seenBy, setSeenBy] = useState<TaskView[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

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
    supabase
      .rpc("company_directory")
      .then(({ data }) =>
        setEmployees(
          ((data as EmployeeOption[]) ?? []).sort((a, b) => a.first_name.localeCompare(b.first_name))
        )
      );
  }, []);

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

  async function openDetail(t: Task) {
    setViewingTask(t);
    setLoadingDetail(true);
    if (profile) {
      await supabase
        .from("task_views")
        .upsert({ task_id: t.id, company_id: profile.company_id, user_id: profile.id, viewed_at: new Date().toISOString() }, { onConflict: "task_id,user_id" });
    }
    const [{ data: commentRows }, { data: viewRows }] = await Promise.all([
      supabase.from("task_comments").select("*").eq("task_id", t.id).order("created_at", { ascending: true }),
      supabase.from("task_views").select("user_id, viewed_at").eq("task_id", t.id),
    ]);
    setComments((commentRows as TaskComment[]) ?? []);
    setSeenBy((viewRows as TaskView[]) ?? []);
    setLoadingDetail(false);
  }

  function closeDetail() {
    setViewingTask(null);
    setComments([]);
    setSeenBy([]);
    setNewComment("");
  }

  async function addComment() {
    if (!profile || !viewingTask || !newComment.trim()) return;
    setPostingComment(true);
    const { error } = await supabase.from("task_comments").insert({
      task_id: viewingTask.id,
      company_id: profile.company_id,
      author_id: profile.id,
      message: newComment.trim(),
    });
    setPostingComment(false);
    if (error) return push("error", error.message);
    setNewComment("");
    const { data } = await supabase.from("task_comments").select("*").eq("task_id", viewingTask.id).order("created_at", { ascending: true });
    setComments((data as TaskComment[]) ?? []);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Tasks</h1>
        <Button onClick={startAdd}><Plus className="h-4 w-4" /> Add Task</Button>
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
                      onClick={() => openDetail(t)}
                      className={`cursor-grab space-y-2 p-3 active:cursor-grabbing ${movingId === t.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <p className="text-sm font-medium text-slate-700">{t.title}</p>
                        </div>
                        {(isStaff || t.assigned_by === profile?.id) && (
                          <div className="flex shrink-0 gap-1">
                            <button onClick={(e) => { e.stopPropagation(); startEdit(t); }} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
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
                      <div className="flex items-center gap-1.5">
                        <Avatar url={employeeMap.get(t.assigned_to)?.photo_url} firstName={t.assignee?.first_name} lastName={t.assignee?.last_name} size="sm" />
                        <p className="text-[11px] text-slate-400">{t.assignee?.first_name} {t.assignee?.last_name}</p>
                      </div>
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
            {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
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

      <Modal open={!!viewingTask} onClose={closeDetail} title={viewingTask?.title ?? "Task"} wide>
        {viewingTask && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_COLOR[viewingTask.priority]}`}>{viewingTask.priority}</span>
              {viewingTask.due_date && <span className="text-xs text-slate-400">Due {formatDate(viewingTask.due_date)}</span>}
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Avatar url={employeeMap.get(viewingTask.assigned_to)?.photo_url} firstName={viewingTask.assignee?.first_name} lastName={viewingTask.assignee?.last_name} size="sm" />
                {viewingTask.assignee?.first_name} {viewingTask.assignee?.last_name}
              </span>
            </div>

            {viewingTask.description && <p className="text-sm text-slate-600">{viewingTask.description}</p>}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Seen by</p>
              {seenBy.length === 0 ? (
                <p className="text-xs text-slate-400">No one has viewed this yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {seenBy.map((v) => {
                    const p = employeeMap.get(v.user_id);
                    return (
                      <div key={v.user_id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2.5" title={formatDateTime(v.viewed_at)}>
                        <Avatar url={p?.photo_url} firstName={p?.first_name} lastName={p?.last_name} size="sm" />
                        <span className="text-xs text-slate-600">{p?.first_name ?? "Unknown"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Comments</p>
              {loadingDetail ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-slate-400">No comments yet. Be the first to say something.</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                  {comments.map((c) => {
                    const author = employeeMap.get(c.author_id);
                    return (
                      <div key={c.id} className="flex items-start gap-2">
                        <Avatar url={author?.photo_url} firstName={author?.first_name} lastName={author?.last_name} size="sm" />
                        <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-700">{author?.first_name} {author?.last_name}</p>
                            <p className="shrink-0 text-[10px] text-slate-400">{formatDateTime(c.created_at)}</p>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{c.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                  placeholder="Write a comment…"
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button type="button" onClick={addComment} loading={postingComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
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
