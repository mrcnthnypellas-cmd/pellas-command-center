'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';

interface RowResult {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  raw: Record<string, unknown>;
}

export function ExcelImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ results: RowResult[]; validCount: number; invalidCount: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handlePreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setImportedCount(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/calendar/import/preview', { method: 'POST', body: formData });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not read this file.');
      setPreview(null);
      return;
    }

    setPreview(await res.json());
  }

  async function handleConfirm() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/calendar/import/commit', { method: 'POST', body: formData });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Import failed.');
      return;
    }

    const data = await res.json();
    setImportedCount(data.importedCount);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Import from Excel</h2>
      </div>
      <p className="text-xs text-slate-500">
        Expected columns: Date, Title, Description, Department, Start Time, End Time, Deadline, Location,
        Status. Every row is validated before anything is imported — invalid rows are shown and skipped, never
        silently imported.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm" />
        <button type="button" onClick={handlePreview} disabled={loading} className="btn-secondary">
          {loading ? 'Reading…' : 'Preview'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {importedCount != null && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Imported {importedCount} event(s).
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="text-sm text-slate-700">
            {preview.validCount} valid row(s), {preview.invalidCount} invalid row(s).
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Row</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.results.map((r) => (
                  <tr key={r.rowNumber} className={r.valid ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2">{r.rowNumber}</td>
                    <td className="px-3 py-2">{r.valid ? 'Valid' : 'Invalid'}</td>
                    <td className="px-3 py-2 text-red-700">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || preview.validCount === 0}
            className="btn-primary"
          >
            {loading ? 'Importing…' : `Confirm import of ${preview.validCount} row(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
