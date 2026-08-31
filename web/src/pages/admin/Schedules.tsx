import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Button, Card, Modal, Input, Spinner, EmptyState } from "../../components/ui/ui";
import type { WorkSchedule } from "../../types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const emptyForm = { name: "", start_time: "08:00", end_time: "17:00", break_minutes: 60, work_days: [1, 2, 3, 4, 5] };

export default function Schedules() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("work_schedules").select("*").order("name");
    setRows((data as WorkSchedule[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDay(d: number) {
    setForm((f) => ({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort() }));
  }

  async function handleCreate() {
    if (!form.name.trim() || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("work_schedules").insert({ ...form, company_id: profile.company_id });
    setSaving(false);
    if (error) return push("error", error.message);
    push("success", "Schedule created.");
    setOpen(false);
    setForm(emptyForm);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Work Schedules</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Schedule</Button>
      </div>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No schedules yet" /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Break</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
                  <td className="px-4 py-3">{s.work_days.map((d) => DAYS[d]).join(", ")}</td>
                  <td className="px-4 py-3">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</td>
                  <td className="px-4 py-3">{s.break_minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Work Schedule">
        <div className="space-y-3">
          <Input label="Schedule Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="End Time" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <Input label="Break (minutes)" type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })} />
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Work Days</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${form.work_days.includes(i) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={saving}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
