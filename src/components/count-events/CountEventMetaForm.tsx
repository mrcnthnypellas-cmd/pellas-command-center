'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EventMeta {
  id: string;
  siteName: string;
  agencyName: string;
  clientName: string;
  eventDate: string;
  timeScheduleStart: string;
  timeScheduleEnd: string;
}

export function CountEventMetaForm({ event }: { event: EventMeta }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(field: keyof EventMeta, value: string) {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/count-events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: field === 'eventDate' ? value : value }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Sheet Details</h2>
        <span className="text-xs text-slate-400">{saving ? 'Saving…' : saved ? 'Saved' : ''}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Site name</label>
          <input
            defaultValue={event.siteName}
            onBlur={(e) => save('siteName', e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Inventory count date</label>
          <input
            type="date"
            defaultValue={event.eventDate}
            onBlur={(e) => save('eventDate', e.target.value)}
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Schedule start</label>
            <input
              defaultValue={event.timeScheduleStart}
              onBlur={(e) => save('timeScheduleStart', e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Schedule end</label>
            <input
              defaultValue={event.timeScheduleEnd}
              onBlur={(e) => save('timeScheduleEnd', e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Agency name (letterhead)</label>
          <input
            defaultValue={event.agencyName}
            onBlur={(e) => save('agencyName', e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Client name</label>
          <input
            defaultValue={event.clientName}
            onBlur={(e) => save('clientName', e.target.value)}
            className="input"
          />
        </div>
      </div>
    </div>
  );
}
