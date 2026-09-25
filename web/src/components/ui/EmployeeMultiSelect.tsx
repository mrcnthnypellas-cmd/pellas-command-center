import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface EmployeeOption {
  id: string;
  name: string;
}

interface Props {
  label?: string;
  options: EmployeeOption[];
  selected: string[]; // employee ids; empty array means "all"
  onChange: (ids: string[]) => void;
  className?: string;
}

export default function EmployeeMultiSelect({ label = "Employees", options, selected, onChange, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === 0;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const summary = allSelected
    ? "All Employees"
    : selected.length === 1
    ? options.find((o) => o.id === selected[0])?.name ?? "1 selected"
    : `${selected.length} selected`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name…"
                className="w-full rounded-md border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={allSelected} onChange={() => onChange([])} className="rounded border-slate-300" />
              <span className="font-medium">All Employees</span>
            </label>
            <div className="my-1 border-t border-slate-100" />
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-400">No matches.</p>
            ) : (
              filtered.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} className="rounded border-slate-300" />
                  <span className="truncate">{o.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
