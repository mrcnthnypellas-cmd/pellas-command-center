'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface FolderOption {
  id: string;
  name: string;
}

export function DocumentUploadForm({ folders }: { folders: FolderOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState('');
  const [visibility, setVisibility] = useState('COMPANY_ALL');

  async function handleFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folderId', folderId);
    formData.append('visibility', visibility);

    const res = await fetch('/api/documents', { method: 'POST', body: formData });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Upload failed.');
      return;
    }

    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Folder</label>
          <select className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Root</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Visibility</label>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="COMPANY_ALL">Everyone in company</option>
            <option value="ROLE_RESTRICTED">Restricted roles</option>
            <option value="PRIVATE">Private (only me)</option>
          </select>
        </div>
        <div>
          <label className="label">File</label>
          <input ref={inputRef} type="file" onChange={handleFileChange} disabled={loading} className="text-sm" />
        </div>
      </div>
      {loading && <p className="text-xs text-slate-500">Uploading…</p>}
    </div>
  );
}
