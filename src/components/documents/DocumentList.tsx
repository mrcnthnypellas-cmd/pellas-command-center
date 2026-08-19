'use client';

import { useState } from 'react';
import { FileText, Download, Archive, Pencil } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  currentVersion: number;
  uploadedBy: string;
  createdAt: string;
}

export function DocumentList({ documents, canManage }: { documents: DocumentRow[]; canManage: boolean }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(documents);

  const filtered = items.filter((d) => d.filename.toLowerCase().includes(search.toLowerCase()));

  async function rename(id: string) {
    const filename = prompt('New filename:');
    if (!filename) return;
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    if (res.ok) setItems((prev) => prev.map((d) => (d.id === id ? { ...d, filename } : d)));
  }

  async function archive(id: string) {
    if (!confirm('Archive this document?')) return;
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    });
    if (res.ok) setItems((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-3">
      <input
        placeholder="Search documents…"
        className="input max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No documents found.</p>
        ) : (
          filtered.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{d.filename}</div>
                  <div className="text-xs text-slate-500">
                    v{d.currentVersion} · {d.uploadedBy} · {formatDate(d.createdAt)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/documents/${d.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => rename(d.id)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      aria-label="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => archive(d.id)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      aria-label="Archive"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
