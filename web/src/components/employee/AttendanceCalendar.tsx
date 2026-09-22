import { useMemo } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, format } from "date-fns";
import type { Attendance } from "../../types";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CLASS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  undertime: "bg-orange-100 text-orange-700",
  overtime: "bg-violet-100 text-violet-700",
  on_leave: "bg-sky-100 text-sky-700",
};

interface Props {
  month: Date;
  records: Attendance[];
  workDays: number[];
}

export default function AttendanceCalendar({ month, records, workDays }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const byDate = useMemo(() => {
    const m = new Map<string, Attendance>();
    for (const r of records) m.set(r.work_date, r);
    return m;
  }, [records]);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dateStr = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, month);
          const rec = byDate.get(dateStr);
          const isWorkDay = workDays.includes(d.getDay());
          const isPast = dateStr < todayStr;
          const isTodayCell = dateStr === todayStr;

          let cls = "bg-transparent text-slate-300";
          if (inMonth) {
            if (rec) cls = STATUS_CLASS[rec.status] ?? "bg-emerald-100 text-emerald-700";
            else if (isWorkDay && isPast) cls = "bg-red-100 text-red-700";
            else if (isWorkDay) cls = "bg-slate-100 text-slate-500";
            else cls = "bg-slate-50 text-slate-300";
          }

          return (
            <div
              key={dateStr}
              title={rec ? `${dateStr}: ${rec.status}` : undefined}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${cls} ${
                isTodayCell ? "ring-2 ring-brand-500" : ""
              } ${!inMonth ? "opacity-40" : ""}`}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <Legend color="bg-emerald-100" label="Present" />
        <Legend color="bg-amber-100" label="Late" />
        <Legend color="bg-orange-100" label="Undertime" />
        <Legend color="bg-violet-100" label="Overtime" />
        <Legend color="bg-red-100" label="Absent" />
        <Legend color="bg-slate-100" label="Upcoming" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
