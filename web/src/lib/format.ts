export const COMPANY_TIMEZONE = "Asia/Manila";

export function formatTime(iso: string | null, tz = COMPANY_TIMEZONE) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null, tz = COMPANY_TIMEZONE) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso));
}

// "YYYY-MM-DD HH:MM:SS" in the company timezone — matches the punch-log export format.
export function formatPunchTimestamp(iso: string, tz = COMPANY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// "DD/MM/YYYY" and "H:MM:SS" (no leading zero on the hour) — matches the
// other_biometric_logs sheet's Date/Time column style.
export function formatLogDate(iso: string, tz = COMPANY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}
export function formatLogTime(iso: string, tz = COMPANY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}

export function todayInTZ(tz = COMPANY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function statusColor(status: string) {
  switch (status) {
    case "present":
      return "bg-emerald-100 text-emerald-700 ring-emerald-600/20";
    case "late":
      return "bg-amber-100 text-amber-700 ring-amber-600/20";
    case "absent":
      return "bg-red-100 text-red-700 ring-red-600/20";
    case "on_leave":
      return "bg-sky-100 text-sky-700 ring-sky-600/20";
    case "undertime":
      return "bg-orange-100 text-orange-700 ring-orange-600/20";
    case "overtime":
      return "bg-violet-100 text-violet-700 ring-violet-600/20";
    case "pending":
      return "bg-amber-100 text-amber-700 ring-amber-600/20";
    case "approved":
      return "bg-emerald-100 text-emerald-700 ring-emerald-600/20";
    case "rejected":
      return "bg-red-100 text-red-700 ring-red-600/20";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-600/20";
  }
}

export function statusLabel(status: string) {
  return status
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
