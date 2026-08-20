'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <div className="print:hidden mb-4 flex justify-end">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Printer className="h-4 w-4" />
        Print
      </button>
    </div>
  );
}
