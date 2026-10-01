import { useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Modal, Input, Select, Badge, Spinner, EmptyState } from "../components/ui/ui";
import { formatDate, formatDateTime, todayInTZ } from "../lib/format";
import type { AttendanceCorrection } from "../types";

const emptyForm = { work_date: todayInTZ(), requested_time_in: "", requested_time_out: "", reason: "", notes: "" };

export default function Corrections() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isStaff = profile?.role === "admin" || profile?.role === "hr";
  const [rows, setRows] = useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ row: AttendanceCorrection; decision: "approved" | "rejected" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  async function load() {
    if (!profile) return;
    setLoading(true);
    let query = supabase
      .from("attendance_corrections")
      .select("*, profiles!attendance_corrections_employee_id_fkey(first_name, last_name, employee_code)")
      .order("created_at", { ascending: false });
    if (!isStaff) query = query.eq("employee_id", profile.id);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data } = await query;
    setRows((data as unknown as AttendanceCorrection[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, statusFilter]);

  async function submit() {
    if (!profile || !form.reason.trim()) {
      push("error", "Please provide a reason for this correction request.");
      return;
    }
    if (!form.requested_time_in && !form.requested_time_out) {
      push("error", "Enter at least a corrected Time In or Time Out.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("attendance_corrections").insert({
      employee_id: profile.id,
      work_date: form.work_date,
      requested_time_in: form.requested_time_in || null,
      requested_time_out: form.requested_time_out || null,
      reason: form.reason,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) return push("error", error.message);
    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "Correction Submitted", module: "Attendance Correction", target: form.work_date, details: form,
    });
    push("success", "Correction request submitted.");
    setOpen(false);
    setForm(emptyForm);
    load();
  }

  async function handleReview() {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("review_correction", {
        p_correction_id: reviewTarget.row.id,
        p_decision: reviewTarget.decision,
        p_review_notes: reviewNotes || null,
      });
      if (error) throw error;
      push("success", `Correction ${reviewTarget.decision}.`);
      setReviewTarget(null);
      setReviewNotes("");
      load();
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Attendance Corrections</h1>
        {!isStaff && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Submit Correction</Button>}
      </div>

      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="all">All</option>
      </Select>

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No correction requests" /> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {isStaff && <th className="px-4 py-3">Employee</th>}
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th>
                {isStaff && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  {isStaff && <td className="px-4 py-3 font-medium text-slate-700">{r.profiles?.first_name} {r.profiles?.last_name}</td>}
                  <td className="px-4 py-3">{formatDate(r.work_date)}</td>
                  <td className="px-4 py-3">
                    {r.requested_time_in && <>In: {r.requested_time_in.slice(0, 5)} </>}
                    {r.requested_time_out && <>Out: {r.requested_time_out.slice(0, 5)}</>}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  {isStaff && (
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setReviewTarget({ row: r, decision: "approved" })} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" title="Approve"><Check className="h-4 w-4" /></button>
                          <button onClick={() => setReviewTarget({ row: r, decision: "rejected" })} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" title="Reject"><X className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Submit Attendance Correction">
        <div className="space-y-3">
          <Input label="Date" type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} max={todayInTZ()} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Corrected Time In" type="time" value={form.requested_time_in} onChange={(e) => setForm({ ...form, requested_time_in: e.target.value })} />
            <Input label="Corrected Time Out" type="time" value={form.requested_time_out} onChange={(e) => setForm({ ...form, requested_time_out: e.target.value })} />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Reason</span>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" rows={2}
              value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Forgot to time out" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Notes (optional)</span>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" rows={2}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Submit Request</Button>
        </div>
      </Modal>

      <Modal open={!!reviewTarget} onClose={() => setReviewTarget(null)} title={reviewTarget?.decision === "approved" ? "Approve Correction" : "Reject Correction"}>
        {reviewTarget && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {reviewTarget.row.profiles?.first_name} {reviewTarget.row.profiles?.last_name} — {formatDate(reviewTarget.row.work_date)}
            </p>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{reviewTarget.row.reason}</p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Review notes (optional)</span>
              <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button variant={reviewTarget.decision === "rejected" ? "danger" : "primary"} onClick={handleReview} loading={saving}>
                {reviewTarget.decision === "approved" ? "Approve" : "Reject"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
