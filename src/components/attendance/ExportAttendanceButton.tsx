'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export function ExportAttendanceButton() {
  const { start: defaultStart, end: defaultEnd } = defaultRange();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary">
        <Download className="h-4 w-4" />
        Export Excel
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label">From</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
            </div>
          </div>
          <a
            href={`/api/attendance/export?start=${start}&end=${end}`}
            className="btn-primary w-full"
            onClick={() => setOpen(false)}
          >
            Download Summary (.xlsx)
          </a>
        </div>
      )}
    </div>
  );
}
