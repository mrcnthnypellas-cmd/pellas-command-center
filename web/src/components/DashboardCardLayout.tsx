import { useEffect, useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, LayoutGrid, Check, X } from "lucide-react";
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

      {activeOrder.map((key, i) => {
        const card = cards[key];
        if (!card) return null;
        return (
          <div key={key} className={editing ? "rounded-xl border-2 border-dashed border-brand-200 p-2" : undefined}>
            {editing && (
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</span>
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
