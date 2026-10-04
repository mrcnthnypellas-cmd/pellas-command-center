import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, GripVertical, LayoutGrid, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button } from "./ui/ui";

interface CardDef {
  label: string;
  node: ReactNode;
}

interface DashboardCardLayoutProps {
  /** Which company_settings column stores this dashboard's saved order. */
  storageKey: "admin_dashboard_layout" | "employee_dashboard_layout";
  /** Order to use the first time (or for any card key missing from the saved order). */
  defaultOrder: string[];
  cards: Record<string, CardDef>;
}

// Admin-editable card ordering for a dashboard's secondary/widget cards — the
// header, stat grid, and (for employees) the Time In/Out flow stay fixed in
// place above this; only these self-contained cards are reorderable. Saved
// order is shared company-wide (company_settings, admin-only write via the
// existing RLS policy — see migration add_dashboard_layout_columns) so every
// viewer of that dashboard sees the same admin-chosen layout.
//
// Reordering is drag-and-drop by the grip handle (pointer events, so it
// works the same with mouse or touch) — the card you're holding follows
// your finger/cursor and the rest of the list reshuffles live as you cross
// over them. The Up/Down buttons stay alongside as a precise fallback.
export function DashboardCardLayout({ storageKey, defaultOrder, cards }: DashboardCardLayoutProps) {
  const { profile } = useAuth();
  const { push } = useToast();
  const canEdit = profile?.role === "admin";
  const cardKeys = Object.keys(cards);

  const [order, setOrder] = useState<string[]>(defaultOrder.filter((k) => cardKeys.includes(k)));
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const dragKeyRef = useRef<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function normalize(saved: string[] | null | undefined): string[] {
    const base = (saved ?? defaultOrder).filter((k) => cardKeys.includes(k));
    const missing = cardKeys.filter((k) => !base.includes(k));
    return [...base, ...missing];
  }

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("company_settings")
      .select(storageKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const saved = (data as Record<string, string[] | null> | null)?.[storageKey];
        setOrder(normalize(saved));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function startEdit() {
    setDraft(order);
    setEditing(true);
  }

  function move(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handlePointerDown(e: React.PointerEvent, key: string) {
    e.preventDefault();
    dragKeyRef.current = key;
    setDragKey(key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const dk = dragKeyRef.current;
    if (!dk) return;
    const y = e.clientY;
    setDraft((prev) => {
      const currentIndex = prev.indexOf(dk);
      let targetIndex = currentIndex;
      for (let i = 0; i < prev.length; i++) {
        const k = prev[i];
        if (k === dk) continue;
        const el = itemRefs.current[k];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === currentIndex) return prev;
      const next = [...prev];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, dk);
      return next;
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragKeyRef.current = null;
    setDragKey(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op — pointer capture may already be released
    }
  }

  async function saveLayout() {
    setSaving(true);
    const { error } = await supabase.from("company_settings").update({ [storageKey]: draft }).eq("company_id", profile!.company_id);
    setSaving(false);
    if (error) {
      push("error", error.message);
      return;
    }
    setOrder(draft);
    setEditing(false);
    push("success", "Dashboard layout saved.");
  }

  if (loading) return null;

  const activeOrder = editing ? draft : order;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button className="!px-3 !py-1.5 text-xs" onClick={saveLayout} loading={saving}>
                <Check className="h-3.5 w-3.5" /> Save Layout
              </Button>
            </>
          ) : (
            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={startEdit}>
              <LayoutGrid className="h-3.5 w-3.5" /> Customize Layout
            </Button>
          )}
        </div>
      )}

      {editing && (
        <p className="text-xs text-slate-400">Hawakan ang <GripVertical className="inline h-3 w-3" /> para i-drag ang card kung saan mo gusto i-puwesto, o gamitin ang up/down buttons.</p>
      )}

      {activeOrder.map((key, i) => {
        const card = cards[key];
        if (!card) return null;
        return (
          <div
            key={key}
            ref={(el) => {
              itemRefs.current[key] = el;
            }}
            className={
              editing
                ? `rounded-xl border-2 border-dashed p-2 transition ${
                    dragKey === key ? "border-brand-400 bg-brand-50/50 opacity-80 shadow-lg" : "border-brand-200"
                  }`
                : undefined
            }
          >
            {editing && (
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => handlePointerDown(e, key)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="touch-none cursor-grab rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 active:cursor-grabbing"
                    aria-label={`Drag ${card.label} to reposition`}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    aria-label={`Move ${card.label} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === activeOrder.length - 1}
                    className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    aria-label={`Move ${card.label} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            {card.node}
          </div>
        );
      })}
    </div>
  );
}
