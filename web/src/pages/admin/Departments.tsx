import { useEffect, useState } from "react";
import { Plus, Ban, CheckCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Button, Card, Modal, Input, Spinner, EmptyState } from "../../components/ui/ui";
import type { Department } from "../../types";

export default function Departments() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("departments").select("*").order("name");
    setRows((data as Department[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!name.trim() || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("departments").insert({ name: name.trim(), company_id: profile.company_id });
    setSaving(false);
    if (error) {
      push("error", error.message.includes("duplicate") ? "A department with this name already exists." : error.message);
      return;
    }
    push("success", "Department added.");
    setOpen(false);
    setName("");
    load();
  }

  async function toggleActive(d: Department) {
    const { error } = await supabase.from("departments").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) return push("error", error.message);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Departments</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Department</Button>
      </div>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No departments yet" /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{d.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(d)} className="text-slate-500 hover:text-slate-700" title={d.is_active ? "Deactivate" : "Activate"}>
                      {d.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Department">
        <Input label="Department Name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={saving}>Add</Button>
        </div>
      </Modal>
    </div>
  );
}
