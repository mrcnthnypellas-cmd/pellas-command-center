import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { Card, Badge, Spinner, EmptyState, Button } from "../../components/ui/ui";
import { formatDate, formatTime } from "../../lib/format";
import type { Attendance } from "../../types";

const PAGE_SIZE = 15;

export default function MyAttendance() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  async function load(p: number) {
    if (!profile) return;
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", profile.id)
      .order("work_date", { ascending: false })
      .range(from, to);
    const list = (data as Attendance[]) ?? [];
    setRows((prev) => (p === 0 ? list : [...prev, ...list]));
    setHasMore(list.length === PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">My Attendance History</h1>
      <Card className="overflow-x-auto">
        {loading && rows.length === 0 ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No attendance records yet" description="Your Time In/Out history will appear here." />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time In</th>
                <th className="px-4 py-3">Time Out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatDate(r.work_date)}</td>
                  <td className="px-4 py-3">{formatTime(r.time_in)}</td>
                  <td className="px-4 py-3">{formatTime(r.time_out)}</td>
                  <td className="px-4 py-3">{r.hours_worked ?? "—"}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {hasMore && rows.length > 0 && (
        <div className="text-center">
          <Button variant="secondary" loading={loading} onClick={() => { const next = page + 1; setPage(next); load(next); }}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
