'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';

interface Props {
  companyId: string;
  companyName: string;
  geofenceEnabled: boolean;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusMeters: number | null;
}

export function GeofenceForm({
  companyId,
  companyName,
  geofenceEnabled,
  geofenceLat,
  geofenceLng,
  geofenceRadiusMeters,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(geofenceEnabled);
  const [lat, setLat] = useState(geofenceLat?.toString() ?? '');
  const [lng, setLng] = useState(geofenceLng?.toString() ?? '');
  const [radius, setRadius] = useState(geofenceRadiusMeters?.toString() ?? '200');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toString());
        setLng(pos.coords.longitude.toString());
        setLocating(false);
      },
      () => {
        setError('Could not get your current location. Check browser location permissions.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geofenceEnabled: enabled,
        geofenceLat: enabled ? Number(lat) : lat ? Number(lat) : null,
        geofenceLng: enabled ? Number(lng) : lng ? Number(lng) : null,
        geofenceRadiusMeters: enabled ? Number(radius) : radius ? Number(radius) : null,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save geofence.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        <MapPin className="h-4 w-4" />
        {geofenceEnabled ? 'Edit Location' : 'Set Login Location'}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <p className="text-sm font-medium text-slate-900">Login location — {companyName}</p>
      <p className="text-xs text-slate-500">
        When enabled, Employee and HR Admin accounts in this company can only sign in from within
        the radius below. Other roles are unaffected.
      </p>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
        />
        Restrict login to this location
      </label>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Latitude</label>
          <input
            type="number"
            step="any"
            required={enabled}
            className="input"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input
            type="number"
            step="any"
            required={enabled}
            className="input"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Radius (meters)</label>
          <input
            type="number"
            min={10}
            max={50000}
            required={enabled}
            className="input"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>
      </div>

      <button type="button" onClick={useMyLocation} disabled={locating} className="btn-secondary">
        {locating ? 'Locating…' : 'Use my current location'}
      </button>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
