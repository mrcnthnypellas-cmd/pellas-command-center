import { useEffect, useState } from "react";
import {
  Users, UserCheck, Clock, UserX, Activity, CheckCircle2, TrendingUp, FileWarning,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { IconStatCard, Card, Spinner, EmptyState, Badge } from "../../components/ui/ui";
import { todayInTZ, formatTime, formatDate } from "../../lib/format";

interface Stats {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  currentlyWorking: number;
  completedShift: number;
  overtime: number;
  pendingCorrections: number;
}

interface DayTrend {
  date: string;
  present: number;
  late: number;
}

interface ActivityRow {
  id: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  status: string;
  updated_at: string;
  profiles?: { first_name: string; last_name: string; employee_code: string | null } | null;
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function OverviewDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<DayTrend[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = todayInTZ();
      const weekStart = isoDaysAgo(6);

      const [
        { count: totalEmployees },
        { data: attendanceToday },
        { count: pendingCorrections },
        { data: weekRows },
        { data: activityRows },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "employee").eq("employment_status", "active"),
        supabase.from("attendance").select("employee_id, time_in, time_out, status").eq("work_date", today),
        supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("attendance").select("work_date, status, time_in").gte("work_date", weekStart).lte("work_date", today),
        supabase
          .from("attendance")
          .select("id, work_date, time_in, time_out, status, updated_at, profiles(first_name, last_name, employee_code)")
          .eq("work_date", today)
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);

      const rows = attendanceToday ?? [];
      const presentToday = rows.filter((r) => r.time_in).length;
      const lateToday = rows.filter((r) => r.status === "late").length;
      const currentlyWorking = rows.filter((r) => r.time_in && !r.time_out).length;
      const completedShift = rows.filter((r) => r.time_in && r.time_out).length;
      const overtime = rows.filter((r) => r.status === "overtime").length;
      const absentToday = Math.max((totalEmployees ?? 0) - presentToday, 0);

      setStats({
        totalEmployees: totalEmployees ?? 0,
        presentToday,
        lateToday,
        absentToday,
        currentlyWorking,
        completedShift,
        overtime,
        pendingCorrections: pendingCorrections ?? 0,
      });

      const byDay = new Map<string, { present: number; late: number }>();
      for (let i = 6; i >= 0; i--) {
        byDay.set(isoDaysAgo(i), { present: 0, late: 0 });
      }
      for (const r of weekRows ?? []) {
        const bucket = byDay.get(r.work_date);
        if (!bucket) continue;
        if (r.time_in) bucket.present += 1;
        if (r.status === "late") bucket.late += 1;
      }
      setTrend(Array.from(byDay.entries()).map(([date, v]) => ({ date, ...v })));

      setActivity((activityRows as unknown as ActivityRow[]) ?? []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("dashboard-attendance")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading || !stats) return <Spinner />;

  const maxPresent = Math.max(...trend.map((t) => t.present), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{profile?.role === "admin" ? "Admin" : "HR"} Dashboard</h1>
        <p className="text-sm text-slate-500">Live overview — updates automatically as employees clock in/out.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <IconStatCard label="Total Employees" value={stats.totalEmployees} icon={Users} tone="blue" />
        <IconStatCard label="Present Today" value={stats.presentToday} icon={UserCheck} tone="green" />
        <IconStatCard label="Late Today" value={stats.lateToday} icon={Clock} tone="amber" />
        <IconStatCard label="Absent Today" value={stats.absentToday} icon={UserX} tone="red" />
        <IconStatCard label="Currently Working" value={stats.currentlyWorking} icon={Activity} tone="sky" />
        <IconStatCard label="Completed Shift" value={stats.completedShift} icon={CheckCircle2} tone="slate" />
        <IconStatCard label="Overtime" value={stats.overtime} icon={TrendingUp} tone="violet" />
        <IconStatCard label="Pending Corrections" value={stats.pendingCorrections} icon={FileWarning} tone="orange" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Weekly Attendance Trend</h2>
              <p className="text-xs text-slate-400">Employees present per day, last 7 days</p>
            </div>
          </div>
          <div className="flex h-40 items-end justify-between gap-2">
            {trend.map((t) => (
              <div key={t.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t-md bg-brand-600 sm:w-4"
                    style={{ height: `${Math.max((t.present / maxPresent) * 100, 4)}%` }}
                    title={`${t.present} present`}
                  />
                  {t.late > 0 && (
                    <div
                      className="w-3 rounded-t-md bg-amber-400 sm:w-4"
                      style={{ height: `${Math.max((t.late / maxPresent) * 100, 4)}%` }}
                      title={`${t.late} late`}
                    />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  {new Date(`${t.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Present</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Late</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Recent Activity</h2>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet today" />
          ) : (
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {a.profiles?.first_name} {a.profiles?.last_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {a.time_out ? `Timed out ${formatTime(a.time_out)}` : a.time_in ? `Timed in ${formatTime(a.time_in)}` : formatDate(a.work_date)}
                    </p>
                  </div>
                  <Badge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm text-slate-500">
          Use the sidebar to manage {profile?.role === "admin" ? "users, employees, departments, schedules, " : ""}
          attendance, corrections, and reports.
        </p>
      </Card>
    </div>
  );
}
