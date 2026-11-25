import { AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, ImagePlus, Info, Paperclip, Plus, Search, Star, Trash2, Upload, X, XCircle } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../lib/store';
import type { Attachment } from '../lib/types';
import { bytes, cx, filesToAttachments, imageToDataUrl, initials } from '../lib/utils';

// ── Buttons ─────────────────────────────────────────────────────────────────

type BtnVariant = 'gold' | 'outline' | 'ghost' | 'subtle' | 'danger' | 'white';
type BtnSize = 'sm' | 'md' | 'lg';
const BTN_V: Record<BtnVariant, string> = {
  gold: 'bg-gold-sheen text-navy-950 font-semibold shadow-gold hover:brightness-110 [background-size:150%_150%] hover:[background-position:100%_0]',
  outline: 'border border-gold-400/50 text-gold-200 hover:bg-gold-400/10 hover:border-gold-300',
  ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
  subtle: 'bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10',
  danger: 'bg-red-500/10 text-red-300 border border-red-400/30 hover:bg-red-500/20',
  white: 'bg-white text-navy-900 font-semibold hover:bg-gold-50',
};
const BTN_S: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; icon?: ReactNode }>(
  ({ variant = 'subtle', size = 'md', icon, className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60',
        BTN_V[variant],
        BTN_S[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300/60', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Form controls ───────────────────────────────────────────────────────────

const FIELD = 'w-full rounded-xl border border-white/10 bg-navy-900/70 px-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-gold-400/60 focus:ring-2 focus:ring-gold-400/15 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input ref={ref} className={cx(FIELD, 'h-10', className)} {...rest} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 4, ...rest }, ref) => (
  <textarea ref={ref} rows={rows} className={cx(FIELD, 'py-2.5 leading-relaxed', className)} {...rest} />
));
Textarea.displayName = 'Textarea';

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(FIELD, 'h-10 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

export function Field({ label, hint, error, required, children, className }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-gold-400">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-white" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="group flex w-full items-start gap-3 text-left">
      <span className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-gold-400' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm text-slate-200">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
    </button>
  );
}

/** Editable list of strings (features, offerings, keywords…). */
export function ListEditor({ value, onChange, placeholder = 'Add item and press Enter' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {value.map((item, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5">
            <input
              value={item}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1 bg-transparent text-sm text-slate-200 outline-none"
              aria-label={`Item ${i + 1}`}
            />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-300" aria-label="Remove item">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button onClick={add} icon={<Plus className="h-4 w-4" />} aria-label="Add item" />
      </div>
    </div>
  );
}

// ── Display ────────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-white/[0.07] bg-navy-850/80 shadow-card backdrop-blur-sm', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-[15px] font-semibold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export type Tone = 'gold' | 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan' | 'orange';
const TONES: Record<Tone, string> = {
  gold: 'bg-gold-400/10 text-gold-200 ring-gold-400/30',
  blue: 'bg-sky-400/10 text-sky-200 ring-sky-400/30',
  green: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30',
  amber: 'bg-amber-400/10 text-amber-200 ring-amber-400/30',
  red: 'bg-rose-400/10 text-rose-200 ring-rose-400/30',
  slate: 'bg-slate-400/10 text-slate-300 ring-slate-400/25',
  violet: 'bg-violet-400/10 text-violet-200 ring-violet-400/30',
  cyan: 'bg-cyan-400/10 text-cyan-200 ring-cyan-400/30',
  orange: 'bg-orange-400/10 text-orange-200 ring-orange-400/30',
};

export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex h-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  New: 'gold',
  Pending: 'amber',
  Contacted: 'blue',
  'For Assessment': 'violet',
  'Quotation Sent': 'cyan',
  Approved: 'green',
  Rejected: 'red',
  'In Progress': 'blue',
  Completed: 'green',
  Cancelled: 'slate',
  Draft: 'slate',
  Sent: 'blue',
  Viewed: 'violet',
  Expired: 'orange',
  Planning: 'violet',
  'On Hold': 'amber',
  Confirmed: 'green',
  Rescheduled: 'orange',
  Open: 'gold',
  Resolved: 'green',
  Closed: 'slate',
  published: 'green',
  draft: 'slate',
  archived: 'orange',
  Simulated: 'violet',
  'Skipped (disabled)': 'slate',
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'slate'} dot className={className}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

/** Marks a feature that is simulated in the prototype and needs a production backend. */
export function SimBadge({ children = 'Simulated in prototype', title }: { children?: ReactNode; title?: string }) {
  return (
    <span title={title ?? 'This works inside the prototype but is connected to a real service during production development.'} className="inline-flex items-center gap-1 rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200 ring-1 ring-inset ring-violet-400/30">
      <FlaskConical className="h-3 w-3" />
      {children}
    </span>
  );
}

const AVATAR_BG = ['from-gold-300 to-gold-600', 'from-sky-400 to-indigo-600', 'from-emerald-400 to-teal-600', 'from-rose-400 to-fuchsia-600', 'from-amber-300 to-orange-600', 'from-violet-400 to-purple-700'];
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const h = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  const s = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs';
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-navy-950', AVATAR_BG[h % AVATAR_BG.length], s, className)}>{initials(name) || '?'}</span>;
}

export function Progress({ value, className, size = 'md' }: { value: number; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-white/[0.07]', size === 'sm' ? 'h-1.5' : 'h-2', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-200 transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i)} className="disabled:cursor-default" aria-label={`${i} star`}>
          <Star className={cx('h-4 w-4', i <= value ? 'fill-gold-300 text-gold-300' : 'text-slate-600')} />
        </button>
      ))}
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-2xl bg-white/5 p-3 text-gold-300">{icon}</div>}
      <p className="font-display text-sm font-semibold text-white">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-navy-900/60 p-1 scrollbar-none', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition', value === t.value ? 'bg-gold-400/15 text-gold-100 ring-1 ring-gold-400/30' : 'text-slate-400 hover:text-white')}
        >
          {t.label}
          {t.count !== undefined && <span className={cx('rounded-full px-1.5 text-[10px]', value === t.value ? 'bg-gold-400/25' : 'bg-white/10')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Overlays ────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('relative flex max-h-[92vh] w-full animate-fade-up flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-navy-850 shadow-2xl sm:rounded-2xl', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] bg-navy-900/50 px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmButton({ onConfirm, label = 'Delete', message = 'This cannot be undone.', children, variant = 'danger', size = 'sm', icon }: { onConfirm: () => void; label?: string; message?: string; children?: ReactNode; variant?: BtnVariant; size?: BtnSize; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} icon={icon ?? <Trash2 className="h-3.5 w-3.5" />}>
        {children ?? label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${label}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {label}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">{message}</p>
      </Modal>
    </>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const icon = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle };
  const color = { success: 'text-emerald-300', info: 'text-sky-300', warning: 'text-amber-300', error: 'text-rose-300' };
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
      {toasts.map((t) => {
        const I = icon[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border border-white/10 bg-navy-800/95 p-3.5 shadow-2xl backdrop-blur">
            <I className={cx('mt-0.5 h-5 w-5 shrink-0', color[t.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-slate-400">{t.body}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Files ───────────────────────────────────────────────────────────────────

export function AttachmentPicker({ value, onChange, label = 'Attach files', compact }: { value: Attachment[]; onChange: (v: Attachment[]) => void; label?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const { ok, rejected } = await filesToAttachments(files);
    setBusy(false);
    if (rejected.length) push({ tone: 'warning', title: 'Some files were not added', body: rejected.join(' · ') });
    onChange([...value, ...ok].slice(0, 8));
  };
  return (
    <div>
      <input ref={ref} type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      {compact ? (
        <IconButton label={label} onClick={() => ref.current?.click()}>
          <Paperclip className="h-4 w-4" />
        </IconButton>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handle(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center transition hover:border-gold-400/50 hover:bg-gold-400/5"
        >
          <Upload className="h-5 w-5 text-gold-300" />
          <span className="text-sm text-slate-200">{busy ? 'Processing…' : label}</span>
          <span className="text-xs text-slate-500">Images, PDF, Word, Excel · max 10 MB each · up to 8 files</span>
        </button>
      )}
      {!compact && value.length > 0 && <AttachmentList items={value} onRemove={(id) => onChange(value.filter((a) => a.id !== id))} className="mt-3" />}
    </div>
  );
}

export function AttachmentList({ items, onRemove, className }: { items: Attachment[]; onRemove?: (id: string) => void; className?: string }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!items.length) return null;
  return (
    <>
      <ul className={cx('flex flex-wrap gap-2', className)}>
        {items.map((a) => (
          <li key={a.id} className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2">
            <button type="button" onClick={() => setPreview(a)} className="flex items-center gap-2 text-left">
              {a.dataUrl ? <img src={a.dataUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-[9px] font-semibold uppercase text-slate-400">{a.name.split('.').pop()}</span>}
              <span className="max-w-[140px]">
                <span className="block truncate text-xs text-slate-200">{a.name}</span>
                <span className="block text-[10px] text-slate-500">{bytes(a.size)}</span>
              </span>
            </button>
            {onRemove && (
              <button type="button" onClick={() => onRemove(a.id)} className="text-slate-500 hover:text-rose-300" aria-label={`Remove ${a.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} subtitle={preview ? `${preview.type} · ${bytes(preview.size)}` : ''} size="lg">
        {preview?.dataUrl ? (
          <img src={preview.dataUrl} alt={preview.name} className="mx-auto max-h-[65vh] rounded-lg" />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
            <SimBadge>File storage</SimBadge>
            <p className="mt-3">The prototype stores this file’s name and size only. In production, files are uploaded to secure cloud storage (Supabase Storage) and opened with time-limited signed links.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

export function ImageInput({ value, onChange, label = 'Upload image', aspect = 'aspect-video', className }: { value?: string; onChange: (v: string | undefined) => void; label?: string; aspect?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { push } = useToast();
  return (
    <div className={className}>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (!f.type.startsWith('image/')) return push({ tone: 'error', title: 'Please choose an image file' });
          if (f.size > 8 * 1024 * 1024) return push({ tone: 'error', title: 'Image is larger than 8 MB' });
          try {
            onChange(await imageToDataUrl(f, 1400, 0.8));
          } catch {
            push({ tone: 'error', title: 'Could not read that image' });
          }
        }}
      />
      {value ? (
        <div className={cx('group relative overflow-hidden rounded-xl border border-white/10', aspect)}>
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
            <Button size="sm" onClick={() => ref.current?.click()}>
              Replace
            </Button>
            <Button size="sm" variant="danger" onClick={() => onChange(undefined)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} className={cx('flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-slate-400 transition hover:border-gold-400/50 hover:text-gold-200', aspect)}>
          <ImagePlus className="h-6 w-6" />
          <span className="text-xs">{label}</span>
        </button>
      )}
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th className={cx('whitespace-nowrap border-b border-white/[0.07] px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500', className)}>{children}</th>;
export const Td = ({ children, className, ...rest }: { children?: ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cx('border-b border-white/[0.05] px-4 py-3 align-middle text-slate-300', className)} {...rest}>
    {children}
  </td>
);

export function Pager({ page, pages, onPage, total }: { page: number; pages: number; onPage: (p: number) => void; total: number }) {
  if (pages <= 1) return <div className="px-4 py-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</div>;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
      <span>
        {total} records · page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function usePaged<T>(rows: T[], size = 12) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages, setPage, total: rows.length };
}
