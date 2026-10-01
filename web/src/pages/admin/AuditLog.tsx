import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Card, Spinner, EmptyState, Input } from "../../components/ui/ui";
import { formatDateTime } from "../../lib/format";
import type { AuditLog as AuditLogRow } from "../../types";

const PAGE_SIZE = 40;

export default function AuditLog() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE);
      setRows((data as AuditLogRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || `${r.actor_name} ${r.action} ${r.module} ${r.target}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Audit Logs</h1>
      <Input placeholder="Search by user, action, module…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <Card className="overflow-x-auto">
        {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No audit log entries" /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th><th className="px-4 py-3">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.actor_name ?? "System"}</td>
                  <td className="px-4 py-3">{r.action}</td>
                  <td className="px-4 py-3 text-slate-500">{r.module}</td>
                  <td className="px-4 py-3 text-slate-500">{r.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
