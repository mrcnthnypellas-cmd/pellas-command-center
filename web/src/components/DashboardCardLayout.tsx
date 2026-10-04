import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, GripVertical, Columns2, Rows2, LayoutGrid, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button } from "./ui/ui";

type CardWidth = "full" | "half";

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

interface Layout {
  order: string[];
  widths: Record<string, CardWidth>;
}

// Admin-editable card ordering for a dashboard's secondary/widget cards — the
// header and stat grid stay fixed in place above this; only these
// self-contained cards are reorderable. Saved layout is shared company-wide
// (company_settings, admin-only write via the existing RLS policy — see
// migrations add_dashboard_layout_columns / dashboard_layout_as_grid) so
// every viewer of that dashboard sees the same admin-chosen layout.
//
// Cards sit on a 2-column CSS grid (1 column on small screens). Each card is
// "full" (spans both columns) or "half" (shares a row with a neighboring
// half-width card, i.e. "sa gilid") — toggle with the resize button. Moving
// a card is drag-and-drop by its grip handle (pointer events, so it works
// the same with mouse or touch): the card follows your finger/cursor and
// hit-testing is 2D, so dragging sideways into another column reorders it
// there too. Up/Down buttons stay alongside as a precise fallback.
export function DashboardCardLayout({ storageKey, defaultOrder, cards }: DashboardCardLayoutProps) {
  const { profile } = useAuth();
  const { push } = useToast();
  const canEdit = profile?.role === "admin";
  const cardKeys = Object.keys(cards);

  function defaultLayout(): Layout {
    return {
      order: defaultOrder.filter((k) => cardKeys.includes(k)),
      widths: Object.fromEntries(cardKeys.map((k) => [k, "full" as CardWidth])),
    };
  }

  const [layout, setLayout] = useState<Layout>(defaultLayout());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Layout>(defaultLayout());
  const [saving, setSaving] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const dragKeyRef = useRef<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Accepts either the new {order, widths} shape or the old plain string[]
  // saved by an earlier version of this component, and reconciles with
  // whatever cards actually exist today (new cards appended, removed ones dropped).
  function normalize(saved: unknown): Layout {
    const fallback = defaultLayout();
    let savedOrder: string[] | undefined;
    let savedWidths: Record<string, CardWidth> | undefined;
    if (Array.isArray(saved)) {
      savedOrder = saved as string[];
    } else if (saved && typeof saved === "object") {
      const obj = saved as Partial<Layout>;
      if (Array.isArray(obj.order)) savedOrder = obj.order;
      if (obj.widths && typeof obj.widths === "object") savedWidths = obj.widths as Record<string, CardWidth>;
    }
    const base = (savedOrder ?? fallback.order).filter((k) => cardKeys.includes(k));
    const missing = cardKeys.filter((k) => !base.includes(k));
    const order = [...base, ...missing];
    const widths: Record<string, CardWidth> = {};
    for (const k of order) widths[k] = savedWidths?.[k] === "half" ? "half" : "full";
    return { order, widths };
  }

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("company_settings")
      .select(storageKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const saved = (data as Record<string, unknown> | null)?.[storageKey];
        setLayout(normalize(saved));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function startEdit() {
    setDraft(layout);
    setEditing(true);
  }

  function move(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      const nextOrder = [...prev.order];
      const target = index + dir;
      if (target < 0 || target >= nextOrder.length) return prev;
      [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
      return { ...prev, order: nextOrder };
    });
  }

  function toggleWidth(key: string) {
    setDraft((prev) => ({
      ...prev,
      widths: { ...prev.widths, [key]: prev.widths[key] === "half" ? "full" : "half" },
    }));
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
    const { clientX: x, clientY: y } = e;
    setDraft((prev) => {
      const currentIndex = prev.order.indexOf(dk);
      let targetIndex = currentIndex;
      for (let i = 0; i < prev.order.length; i++) {
        const k = prev.order[i];
        if (k === dk) continue;
        const el = itemRefs.current[k];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === currentIndex) return prev;
      const nextOrder = [...prev.order];
      nextOrder.splice(currentIndex, 1);
      nextOrder.splice(targetIndex, 0, dk);
      return { ...prev, order: nextOrder };
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
    setLayout(draft);
    setEditing(false);
    push("success", "Dashboard layout saved.");
  }

  if (loading) return null;

  const active = editing ? draft : layout;

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
        <p className="text-xs text-slate-400">
          Hawakan ang <GripVertical className="inline h-3 w-3" /> para i-drag ang card kung saan mo gusto i-puwesto (kahit sa gilid ng isa pa), o
          gamitin ang up/down buttons. Gamitin ang <Columns2 className="inline h-3 w-3" />/<Rows2 className="inline h-3 w-3" /> para gawing
          kalahati ang lapad ng card (para magkatabi) o buong lapad.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [grid-auto-flow:row_dense]">
        {active.order.map((key, i) => {
          const card = cards[key];
          if (!card) return null;
          const width = active.widths[key] ?? "full";
          return (
            <div
              key={key}
              ref={(el) => {
                itemRefs.current[key] = el;
              }}
              className={`${width === "full" ? "sm:col-span-2" : ""} ${
                editing
                  ? `rounded-xl border-2 border-dashed p-2 transition ${
                      dragKey === key ? "border-brand-400 bg-brand-50/50 opacity-80 shadow-lg" : "border-brand-200"
                    }`
                  : ""
              }`}
            >
              {editing && (
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
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
                      onClick={() => toggleWidth(key)}
                      className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                      aria-label={width === "half" ? `Make ${card.label} full width` : `Make ${card.label} half width (side by side)`}
                      title={width === "half" ? "Full width" : "Half width (side by side)"}
                    >
                      {width === "half" ? <Rows2 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
                    </button>
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
                      disabled={i === active.order.length - 1}
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
    </div>
  );
}
