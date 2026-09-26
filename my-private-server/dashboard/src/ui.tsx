import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- toasts ----------
type Toast = { id: number; msg: string; kind: "ok" | "bad" | "warn" | "info" };
const ToastCtx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[300] grid w-[calc(100%-32px)] max-w-md -translate-x-1/2 gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 rounded-lg bg-[#13232c] px-3.5 py-2.5 text-[13px] text-[#e8f0f3] shadow-2xl">
            {t.kind === "bad" ? <XCircle size={16} className="text-[#ff8b83]" /> : t.kind === "warn" ? <AlertTriangle size={16} className="text-[#f2c46b]" /> : t.kind === "info" ? <Info size={16} className="text-[#8fc0f5]" /> : <CheckCircle2 size={16} className="text-[#6fdca0]" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- data loading ----------
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(async () => {
    try { setData(await fnRef.current()); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    setLoading(true); reload();
    if (!pollMs) return;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

/** Wraps an async action with a busy flag and toast on error. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); return true; }
    catch (e: any) { toast(e.message, "bad"); return false; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

// ---------- layout primitives ----------
export function Card({ title, icon, actions, children, className, footer, pad = true }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("min-w-0 rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgb(15_30_40/.06),0_2px_8px_rgb(15_30_40/.04)]", className)}>
      {title !== undefined && (
        <div className="flex min-h-11 items-center gap-2.5 px-4 pt-3.5">
          <h2 className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-[.07em] text-ink-2">{icon}{title}</h2>
          <span className="flex-1" />
          {actions}
        </div>
      )}
      <div className={pad ? "px-4 pb-4 pt-3.5" : "pt-2"}>{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
    </section>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "ghost"; size?: "sm" | "md" };
export function Button({ variant = "default", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border font-medium disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "px-2.5 py-1 text-[12.5px]" : "px-3.5 py-[7px] text-[13px]",
        variant === "primary" && "border-accent bg-accent text-accent-ink hover:bg-accent-2",
        variant === "danger" && "border-line-2 bg-surface text-bad hover:bg-bad-soft",
        variant === "ghost" && "border-transparent bg-transparent text-ink hover:bg-surface-2",
        variant === "default" && "border-line-2 bg-surface text-ink hover:bg-surface-2",
        className,
      )}
    />
  );
}

export const inputCls = "w-full rounded-[7px] border border-line-2 bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-2 focus:outline-accent";

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? <span className="text-xs text-bad">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Pill({ tone = "none", children, dot, wrap }: { tone?: "ok" | "warn" | "bad" | "info" | "acc" | "vio" | "none"; children: ReactNode; dot?: boolean; wrap?: boolean }) {
  const t = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", info: "bg-info-soft text-info", acc: "bg-accent-soft text-accent", vio: "bg-vio-soft text-vio", none: "bg-surface-3 text-ink-2" }[tone];
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-5", wrap ? "max-w-full rounded-md py-0.5" : "whitespace-nowrap", t)}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>;
}

export function Dot({ tone, pulse }: { tone: "ok" | "warn" | "bad" | "none"; pulse?: boolean }) {
  const c = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", none: "bg-muted" }[tone];
  return <span className={cx("inline-block h-2 w-2 flex-none rounded-full", c, pulse && "pulse")} />;
}

export function Meter({ pct, tone }: { pct: number; tone?: "warn" | "bad" | "info" }) {
  const t = tone ?? (pct >= 90 ? "bad" : pct >= 75 ? "warn" : undefined);
  return (
    <div className="h-[7px] overflow-hidden rounded bg-surface-3">
      <i className={cx("block h-full rounded transition-[width] duration-500", t === "bad" ? "bg-bad" : t === "warn" ? "bg-warn" : t === "info" ? "bg-info" : "bg-accent")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cx("relative h-[22px] w-[38px] flex-none rounded-full transition-colors disabled:opacity-50", on ? "bg-accent" : "bg-line-2")}>
      <span className={cx("absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform", on && "translate-x-4")} />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[rgb(9_18_24/.55)] p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("flex max-h-[calc(100dvh-32px)] w-full flex-col rounded-xl bg-surface shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center gap-2.5 border-b border-line px-4.5 py-4">
          <h3 className="m-0 flex-1 text-base font-semibold">{title}</h3>
          <button className="rounded-md p-1 text-muted hover:bg-surface-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4.5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4.5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel, onConfirm, onClose, typeToConfirm }: { title: string; message: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<unknown>; onClose: () => void; typeToConfirm?: string }) {
  const [typed, setTyped] = useState("");
  const ok = !typeToConfirm || typed === typeToConfirm;
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" className="!bg-bad !text-white !border-bad" disabled={!ok} onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
      <div className="grid gap-3 text-[13.5px]">
        <div>{message}</div>
        {typeToConfirm && <Field label={`Type “${typeToConfirm}” to confirm`}><input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>}
      </div>
    </Modal>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : !!children;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead><tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted first:pl-4 last:pr-4">{h}</th>)}</tr></thead>
        <tbody className="[&>tr:hover>td]:bg-surface-2 [&>tr>td]:border-b [&>tr>td]:border-line [&>tr>td]:px-3 [&>tr>td]:py-2.5 [&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4 [&>tr:last-child>td]:border-b-0">
          {hasRows ? children : <tr><td colSpan={head.length} className="!py-10 text-center text-muted">{empty ?? "Nothing here yet."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2.5 text-[13px]">
      {rows.map(([k, v], i) => [<dt key={"k" + i} className="text-muted">{k}</dt>, <dd key={"v" + i} className="m-0 min-w-0 break-words text-right font-medium">{v}</dd>])}
    </dl>
  );
}

export function PageError({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bad-soft px-4 py-3 text-[13px] text-bad">
      <AlertTriangle size={18} /> <span className="flex-1">{error}</span>{retry && <Button size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Sparkline({ values, max, tone = "accent", height = 70 }: { values: number[]; max?: number; tone?: "accent" | "info" | "vio"; height?: number }) {
  const W = 300, H = height; const n = values.length;
  const m = max ?? Math.max(1, ...values) * 1.15;
  const pts = values.map((v, i) => [n <= 1 ? 0 : (i / (n - 1)) * W, H - 2 - (v / m) * (H - 6)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const color = `var(--${tone})`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }} aria-hidden>
      {[.25, .5, .75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" vectorEffect="non-scaling-stroke" />)}
      {n > 1 && <><path d={`${d} L${W} ${H} L0 ${H} Z`} fill={color} opacity=".13" /><path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
    </svg>
  );
}

export function Donut({ pct, size = 110, label }: { pct: number; size?: number; label: string }) {
  const stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center"><b className="num text-[22px] leading-none">{Math.round(pct)}%</b><small className="mt-0.5 text-[11px] text-muted">{label}</small></div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="grid justify-items-center gap-2 px-4 py-12 text-center text-muted"><div className="text-line-2">{icon}</div><b className="text-ink">{title}</b>{children}</div>;
}

export function Secret({ value, label }: { value: string; label?: string }) {
  const toast = useToast();
  return (
    <div className="grid gap-1">
      {label && <span className="text-xs font-semibold text-ink-2">{label}</span>}
      <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
        <code className="flex-1 break-all font-mono text-[12.5px]">{value}</code>
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(value).then(() => toast("Copied"), () => toast("Select the text to copy it", "info"))}>Copy</Button>
      </div>
    </div>
  );
}
