import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { StatCard, Card, Spinner } from "../../components/ui/ui";
import { todayInTZ } from "../../lib/format";

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

export default function OverviewDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = todayInTZ();

      const [{ count: totalEmployees }, { data: attendanceToday }, { count: pendingCorrections }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "employee").eq("employment_status", "active"),
        supabase.from("attendance").select("employee_id, time_in, time_out, status").eq("work_date", today),
        supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{profile?.role === "admin" ? "Admin" : "HR"} Dashboard</h1>
        <p className="text-sm text-slate-500">Live overview — updates automatically as employees clock in/out.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Employees" value={stats.totalEmployees} accent="bg-brand-600" />
        <StatCard label="Present Today" value={stats.presentToday} accent="bg-emerald-600" />
        <StatCard label="Late Today" value={stats.lateToday} accent="bg-amber-500" />
        <StatCard label="Absent Today" value={stats.absentToday} accent="bg-red-600" />
        <StatCard label="Currently Working" value={stats.currentlyWorking} accent="bg-sky-600" />
        <StatCard label="Completed Shift" value={stats.completedShift} accent="bg-slate-600" />
        <StatCard label="Overtime" value={stats.overtime} accent="bg-violet-600" />
        <StatCard label="Pending Corrections" value={stats.pendingCorrections} accent="bg-orange-500" />
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
