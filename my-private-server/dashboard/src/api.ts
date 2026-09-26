// Thin fetch wrapper: sends cookies, adds the CSRF header to state-changing requests,
// and turns server errors into readable messages.

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) { super(message); this.status = status; this.data = data; }
}

let csrf: string | null = null;

function readCookie(name: string) {
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1] ?? null;
}

export async function ensureCsrf() {
  csrf = readCookie("mps_csrf");
  if (!csrf) {
    const r = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    csrf = (await r.json()).token;
  }
  return csrf!;
}

type Opts = { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string>; text?: boolean };

export async function api<T = any>(url: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (method !== "GET") headers["X-MPS-CSRF"] = await ensureCsrf();
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method, headers, credentials: "same-origin",
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (!res.ok) {
    let data: any = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && !url.startsWith("/api/auth/login")) window.dispatchEvent(new CustomEvent("mps:unauthorized"));
    if (res.status === 409 && data?.setupRequired) window.dispatchEvent(new CustomEvent("mps:setup-required"));
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  }
  if (opts.text) return (await res.text()) as T;
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 202 || res.status === 204 || !type.includes("json")) return undefined as T;
  return res.json();
}

export const fmtBytes = (b: number | null | undefined) => {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = b;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${i === 0 ? v : parseFloat(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2))} ${u[i]}`;
};

export const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export const rel = (v?: string | null) => {
  if (!v) return "never";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  const d = Math.round(s / 86400); return d === 1 ? "yesterday" : `${d} days ago`;
};

export const fmtDuration = (secs: number) => {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return `${d}d ${h}h ${String(m).padStart(2, "0")}m`;
};
