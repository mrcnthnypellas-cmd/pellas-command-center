'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus } from 'lucide-react';
import type { Service } from '@/data/services';

const ICONS: Service['icon'][] = [
  'Calculator',
  'ShieldCheck',
  'Receipt',
  'LineChart',
  'Building2',
  'Cloud',
  'Users',
];

type ServiceRow = Service & { id: string };

export function ServicesEditor({ services }: { services: ServiceRow[] }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {services.map((service) => (
        <ServiceEditRow key={service.id} service={service} onSaved={() => router.refresh()} />
      ))}
      <NewServiceForm onCreated={() => router.refresh()} />
    </div>
  );
}

function ServiceEditRow({ service, onSaved }: { service: ServiceRow; onSaved: () => void }) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [icon, setIcon] = useState<Service['icon']>(service.icon);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, icon }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${service.name}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/services/${service.id}`, { method: 'DELETE' });
      onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border border-navy-900/10 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Service name"
          className="border border-navy-900/15 bg-ivory/40 px-3 py-2.5 text-sm focus:border-navy-900 focus:bg-white"
        />
        <select
          value={icon}
          onChange={(e) => setIcon(e.target.value as Service['icon'])}
          className="border border-navy-900/15 bg-ivory/40 px-3 py-2.5 text-sm focus:border-navy-900 focus:bg-white"
        >
          {ICONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center justify-center gap-1.5 border border-red-200 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description"
        className="mt-4 w-full border border-navy-900/15 bg-ivory/40 px-3 py-2.5 text-sm focus:border-navy-900 focus:bg-white"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-navy-950 px-5 py-2.5 text-sm font-medium text-ivory transition-colors hover:bg-gold-500 hover:text-navy-950 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function NewServiceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<Service['icon']>('Calculator');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !description.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, icon }),
      });
      if (res.ok) {
        setName('');
        setDescription('');
        setIcon('Calculator');
        onCreated();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border border-dashed border-navy-900/20 bg-navy-50/40 p-6">
      <p className="mb-4 text-sm font-medium text-navy-700">Add a new service</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Service name"
          className="border border-navy-900/15 bg-white px-3 py-2.5 text-sm focus:border-navy-900"
        />
        <select
          value={icon}
          onChange={(e) => setIcon(e.target.value as Service['icon'])}
          className="border border-navy-900/15 bg-white px-3 py-2.5 text-sm focus:border-navy-900"
        >
          {ICONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 bg-navy-950 px-5 py-2.5 text-sm font-medium text-ivory hover:bg-gold-500 hover:text-navy-950 disabled:opacity-60"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description"
        className="mt-4 w-full border border-navy-900/15 bg-white px-3 py-2.5 text-sm focus:border-navy-900"
      />
    </div>
  );
}
