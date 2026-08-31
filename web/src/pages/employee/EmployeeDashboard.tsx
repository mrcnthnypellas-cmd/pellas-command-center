import { useEffect, useState } from "react";
import { LogIn, LogOut, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Button, Card, Badge } from "../../components/ui/ui";
import { formatDate, formatTime, todayInTZ } from "../../lib/format";
import { getPosition, friendlyClockError } from "../../lib/geo";
import type { Attendance } from "../../types";

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [today, setToday] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastAction, setLastAction] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadToday() {
    setLoading(true);
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", profile!.id)
      .eq("work_date", todayInTZ())
      .maybeSingle();
    setToday((data as Attendance) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (profile) loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function handleClock(kind: "in" | "out") {
    setBusy(kind);
    try {
      const pos = await getPosition();
      const args = {
        p_lat: pos?.coords.latitude ?? null,
        p_lng: pos?.coords.longitude ?? null,
        p_accuracy: pos?.coords.accuracy ?? null,
        p_device: navigator.userAgent,
      };
      const { data, error } = await supabase.rpc(kind === "in" ? "clock_in" : "clock_out", args);
      if (error) throw error;
      setToday(data as Attendance);
      setLastAction(kind);
      push("success", kind === "in" ? "Time In successful!" : "Time Out successful!");
    } catch (err) {
      push("error", friendlyClockError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!profile) return null;

  const canClockIn = !today?.time_in;
  const canClockOut = !!today?.time_in && !today?.time_out;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Hi, {profile.first_name}!</h1>
            <p className="text-sm text-slate-500">
              {profile.employee_code} &middot; {profile.departments?.name ?? "No department"} &middot; {profile.position ?? "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-brand-700">
              {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" }).format(now)}
            </p>
            <p className="text-sm text-slate-500">
              {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(now)}
            </p>
          </div>
        </div>
      </Card>

      {!loading && lastAction && today && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-lg font-bold text-emerald-700">
            {lastAction === "in" ? "TIME IN SUCCESSFUL" : "TIME OUT SUCCESSFUL"}
          </p>
          <p className="text-sm text-emerald-700">
            Date: {formatDate(today.work_date)} &middot; Time: {formatTime(lastAction === "in" ? today.time_in : today.time_out)}
            {lastAction === "out" && today.hours_worked != null && <> &middot; Total Hours: {today.hours_worked}</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleClock("in")}
          disabled={!canClockIn || busy !== null}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-10 text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LogIn className="h-10 w-10" />
          <span className="text-lg font-bold tracking-wide">{busy === "in" ? "Processing…" : "TIME IN"}</span>
        </button>
        <button
          onClick={() => handleClock("out")}
          disabled={!canClockOut || busy !== null}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-red-600 py-10 text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LogOut className="h-10 w-10" />
          <span className="text-lg font-bold tracking-wide">{busy === "out" ? "Processing…" : "TIME OUT"}</span>
        </button>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="h-4 w-4" /> Today's Attendance
        </h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : today ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Time In" value={formatTime(today.time_in)} />
            <Stat label="Time Out" value={formatTime(today.time_out)} />
            <Stat label="Hours Worked" value={today.hours_worked != null ? String(today.hours_worked) : "—"} />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
              <Badge status={today.status} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">You haven't timed in yet today.</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}
