import { useEffect, useMemo, useRef, useState } from "react";
import { LogIn, LogOut, CheckCircle2, Clock, ScanFace, CalendarDays } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Card, Badge } from "../../components/ui/ui";
import { formatDate, formatTime, todayInTZ } from "../../lib/format";
import { getPosition, friendlyClockError } from "../../lib/geo";
import { euclideanDistance, FACE_MATCH_THRESHOLD } from "../../lib/faceRecognition";
import FaceCapture from "../../components/face/FaceCapture";
import AttendanceCalendar from "../../components/employee/AttendanceCalendar";
import ContactDirectoryCard from "../../components/ContactDirectoryCard";
import { MyTasksCard } from "../../components/MyTasksCard";
import { DashboardCardLayout } from "../../components/DashboardCardLayout";
import type { Attendance } from "../../types";

export default function EmployeeDashboard() {
  const { profile, refreshProfile } = useAuth();
  const { push } = useToast();
  const [today, setToday] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastAction, setLastAction] = useState<"in" | "out" | null>(null);

  const [faceBusy, setFaceBusy] = useState(false);
  const [faceStatus, setFaceStatus] = useState<{ kind: "idle" | "success" | "error"; text?: string }>({ kind: "idle" });
  const [monthRecords, setMonthRecords] = useState<Attendance[]>([]);
  // "scanning": camera active. "success": done for this page load, camera
  // hidden. "cooldown": a clock attempt failed (e.g. outside the geofence,
  // dropped connection) — camera stays open but paused, showing the error,
  // then auto-resumes scanning after a few seconds.
  const [autoPhase, setAutoPhase] = useState<"scanning" | "success" | "cooldown">("scanning");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getPosition();
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
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

  useEffect(() => {
    async function loadMonth() {
      if (!profile) return;
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", profile.id)
        .gte("work_date", from)
        .lte("work_date", to);
      setMonthRecords((data as Attendance[]) ?? []);
    }
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function handleClock(kind: "in" | "out"): Promise<boolean> {
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
      return true;
    } catch (err) {
      push("error", friendlyClockError(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  // Synchronous gate against overlapping/duplicate auto-capture calls —
  // separate from autoPhase since state updates aren't applied in time to
  // block a capture that fires in the same tick.
  const busyRef = useRef(false);

  // Re-arms auto-scanning after a failed attempt (e.g. outside the
  // geofence, or a dropped connection) so the employee doesn't have to
  // reload the page just to try again.
  function reArmAfterFailure(text: string) {
    setFaceStatus({ kind: "error", text });
    setAutoPhase("cooldown");
    window.setTimeout(() => {
      busyRef.current = false;
      setAutoPhase("scanning");
      setFaceStatus({ kind: "idle" });
    }, 4000);
  }

  async function handleAutoFaceCapture(descriptor: Float32Array) {
    if (busyRef.current) return;
    const kind: "in" | "out" | null = canClockIn ? "in" : canClockOut ? "out" : null;
    if (!kind) return;

    if (!profile?.face_descriptor) {
      busyRef.current = true;
      setFaceBusy(true);
      try {
        const { error } = await supabase.rpc("enroll_face", { p_descriptor: Array.from(descriptor) });
        if (error) throw error;
        await refreshProfile();
        setFaceStatus({ kind: "success", text: `Na-set up ang Face ID! Nagta-time ${kind}...` });
        const ok = await handleClock(kind);
        if (ok) {
          setAutoPhase("success");
        } else {
          reArmAfterFailure(`Nakuha na ang Face ID, pero hindi na-time ${kind}. Susubukan ulit sa ilang segundo.`);
        }
      } catch (err) {
        busyRef.current = false;
        setFaceStatus({ kind: "error", text: (err as Error).message || "May problema sa pag-set up ng Face ID. Subukan ulit." });
      } finally {
        setFaceBusy(false);
      }
      return;
    }

    const distance = euclideanDistance(Array.from(descriptor), profile.face_descriptor);
    if (distance > FACE_MATCH_THRESHOLD) {
      setFaceStatus({ kind: "error", text: "Hindi nakilala ang mukha. Subukan ulit." });
      return;
    }
    busyRef.current = true;
    setFaceStatus({ kind: "success", text: `Nakilala! Nagta-time ${kind} ka na...` });
    const ok = await handleClock(kind);
    if (ok) {
      setAutoPhase("success");
    } else {
      reArmAfterFailure(`Nakilala ka, pero hindi na-time ${kind}. Susubukan ulit sa ilang segundo.`);
    }
  }

  const calendarMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now.getFullYear(), now.getMonth()]);

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

      <MyTasksCard />

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

      {loading ? null : profile.face_recognition_required === false ? (
        <>
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
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ScanFace className="h-3.5 w-3.5" />
            Face ID verification is turned off for your account.
          </p>
        </>
      ) : !canClockIn && !canClockOut ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <p className="mt-2 text-base font-bold text-emerald-700">Kumpleto ka na sa Time In at Time Out ngayong araw!</p>
        </div>
      ) : autoPhase === "success" ? null : (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-center gap-2 text-slate-700">
            <ScanFace className="h-5 w-5" />
            <p className="text-sm font-semibold">
              {canClockIn ? "Itapat ang mukha sa camera para mag Time In" : "Itapat ang mukha sa camera para mag Time Out"}
            </p>
          </div>
          <FaceCapture
            mode="auto"
            onCapture={handleAutoFaceCapture}
            busy={faceBusy || busy !== null || autoPhase === "cooldown"}
            statusText={faceStatus.text}
            statusKind={faceStatus.kind}
          />
        </Card>
      )}

      <DashboardCardLayout
        storageKey="employee_dashboard_layout"
        defaultOrder={["todayAttendance", "calendar", "contactDirectory"]}
        cards={{
          todayAttendance: {
            label: "Today's Attendance",
            node: (
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Clock className="h-4 w-4" /> Today's Attendance
                </h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : today ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    <Stat label="Time In" value={formatTime(today.time_in)} />
                    <Stat label="Time Out" value={formatTime(today.time_out)} />
                    <Stat label="Hours Worked" value={today.hours_worked != null ? String(today.hours_worked) : "—"} />
                    {today.overtime_hours > 0 && <Stat label="Overtime (Approved)" value={`+${today.overtime_hours}h`} />}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                      <Badge status={today.status} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">You haven't timed in yet today.</p>
                )}
              </Card>
            ),
          },
          calendar: {
            label: "Attendance Calendar",
            node: (
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarDays className="h-4 w-4" /> {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(calendarMonth)}
                </h2>
                <AttendanceCalendar month={calendarMonth} records={monthRecords} workDays={profile.work_schedules?.work_days ?? [1, 2, 3, 4, 5]} />
              </Card>
            ),
          },
          contactDirectory: { label: "Contact Directory", node: <ContactDirectoryCard /> },
        }}
      />
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
