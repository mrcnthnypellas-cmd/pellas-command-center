import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card, Badge } from "./ui/ui";
import { formatDate, todayInTZ } from "../lib/format";
import type { Task, TaskStatus } from "../types";

const TABS: { key: "all" | TaskStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

export function MyTasksCard() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | TaskStatus>("all");

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", profile.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const filtered = tab === "all" ? tasks : tasks.filter((t) => t.status === tab);
  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  async function markDone(t: Task) {
    const { error } = await supabase.rpc("mark_task_done", { p_task_id: t.id });
    if (error) return push("error", error.message);
    load();
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800">My Tasks</h2>
        <p className="text-xs text-slate-400">{counts.pending} pending &middot; {counts.completed} completed</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${tab === t.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading tasks…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">No tasks here.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.slice(0, 6).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${t.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.due_date ? `Due ${formatDate(t.due_date)}` : "No due date"}
                  {t.due_date && t.due_date < todayInTZ() && t.status !== "completed" && <span className="ml-1.5 text-red-500">(overdue)</span>}
                </p>
              </div>
              <Badge status={t.status} />
              {t.status !== "completed" && (
                <button onClick={() => markDone(t)} className="shrink-0 rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" title="Mark as Done">
                  <Check className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link to="/tasks" className="mt-3 block text-center text-xs font-medium text-brand-600 hover:underline">
        View all tasks
      </Link>
    </Card>
  );
}
