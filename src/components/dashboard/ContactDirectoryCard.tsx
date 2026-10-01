'use client';

import { useEffect, useState } from 'react';
import {
  Phone,
  Users,
  Building2,
  Laptop,
  Wallet,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONTACT_ICON_KEYS, type CreateContactDirectoryEntryInput } from '@/lib/validation/contactDirectory';

interface ContactEntry {
  id: string;
  name: string;
  description: string | null;
  phone: string;
  extension: string | null;
  icon: string;
  isEmergency: boolean;
}

const CONTACT_ICON_MAP: Record<string, LucideIcon> = {
  hr: Users,
  admin: Building2,
  it: Laptop,
  accounting: Wallet,
  emergency: AlertTriangle,
  phone: Phone,
  building: Building2,
};

const ICON_LABELS: Record<(typeof CONTACT_ICON_KEYS)[number], string> = {
  hr: 'HR',
  admin: 'Admin',
  it: 'IT Support',
  accounting: 'Accounting',
  emergency: 'Emergency',
  phone: 'Phone',
  building: 'Building',
};

const EMPTY_FORM: CreateContactDirectoryEntryInput = {
  name: '',
  description: '',
  phone: '',
  extension: '',
  icon: 'phone',
  isEmergency: false,
};

export function ContactDirectoryCard({ canEdit }: { canEdit: boolean }) {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateContactDirectoryEntryInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(c: ContactEntry) {
    setShowAddForm(false);
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? '',
      phone: c.phone,
      extension: c.extension ?? '',
      icon: c.icon as (typeof CONTACT_ICON_KEYS)[number],
      isEmergency: c.isEmergency,
    });
  }

  function cancelForm() {
    setEditingId(null);
    setShowAddForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function submitForm() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/contacts/${editingId}` : '/api/contacts', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'Could not save this contact.');
        return;
      }
      cancelForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(id: string) {
    if (!confirm('Remove this contact from the directory?')) return;
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  const isFormOpen = showAddForm || editingId !== null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Contact Directory</h2>
        {canEdit && !isFormOpen && (
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowAddForm(true);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add Contact
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="mb-4 space-y-2.5 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2.5">
            <input
              className="input"
              placeholder="Name (e.g. HR Department)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="input"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value as (typeof CONTACT_ICON_KEYS)[number] }))}
            >
              {CONTACT_ICON_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ICON_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <input
            className="input"
            placeholder="Description (e.g. Recruitment, Benefits, Personnel)"
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              className="input"
              placeholder="Phone number"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Extension (optional)"
              value={form.extension ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, extension: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isEmergency}
              onChange={(e) => setForm((f) => ({ ...f, isEmergency: e.target.checked }))}
            />
            Emergency contact (highlighted in red, for urgent matters only)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving || !form.name || !form.phone} onClick={submitForm} className="btn-primary text-sm">
              {editingId ? 'Save Changes' : 'Add Contact'}
            </button>
            <button type="button" onClick={cancelForm} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No contacts yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {contacts.map((c) => {
            const Icon = CONTACT_ICON_MAP[c.icon] ?? Phone;
            return (
              <li
                key={c.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3',
                  c.isEmergency ? 'border-red-200 bg-red-50' : 'border-slate-100',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      c.isEmergency ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className={cn('truncate text-sm font-semibold', c.isEmergency ? 'text-red-700' : 'text-slate-900')}>
                      {c.name}
                    </div>
                    <div className="truncate text-xs text-slate-500">{c.description ?? (c.isEmergency ? 'For urgent matters only' : '')}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className={cn('flex items-center gap-1 text-sm font-semibold', c.isEmergency ? 'text-red-600' : 'text-blue-600')}>
                      <Phone className="h-3.5 w-3.5" /> {c.phone}
                    </div>
                    {c.extension && <div className="text-[11px] text-slate-400">Ext. {c.extension}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => startEdit(c)} aria-label="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeContact(c.id)} aria-label="Delete" className="rounded-md p-1.5 text-red-500 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
