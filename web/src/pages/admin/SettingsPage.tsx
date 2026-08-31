import { useEffect, useState } from "react";
import { MapPin, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { Card, Input, Button } from "../../components/ui/ui";
import { getPosition } from "../../lib/geo";
import type { CompanySettings } from "../../types";

export default function SettingsPage() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", profile.company_id).single(),
        supabase.from("company_settings").select("*").eq("company_id", profile.company_id).single(),
      ]);
      if (c) setCompanyName(c.name);
      if (s) setSettings(s as CompanySettings);
    }
    load();
  }, [profile]);

  async function save() {
    if (!profile || !settings) return;
    setSaving(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("companies").update({ name: companyName }).eq("id", profile.company_id),
      supabase.from("company_settings").update({
        workplace_lat: settings.workplace_lat,
        workplace_lng: settings.workplace_lng,
        geofence_radius_m: settings.geofence_radius_m,
        geofence_enabled: settings.geofence_enabled,
        late_threshold_minutes: settings.late_threshold_minutes,
        overtime_after_minutes: settings.overtime_after_minutes,
        updated_at: new Date().toISOString(),
      }).eq("company_id", profile.company_id),
    ]);
    setSaving(false);
    if (e1 || e2) return push("error", (e1 || e2)!.message);

    await supabase.from("audit_logs").insert({
      company_id: profile.company_id, actor_id: profile.id, actor_name: `${profile.first_name} ${profile.last_name}`,
      action: "System Settings Updated", module: "Settings", target: companyName, details: settings,
    });
    push("success", "Settings saved.");
  }

  async function useCurrentLocation() {
    setLocating(true);
    const pos = await getPosition();
    setLocating(false);
    if (!pos || !settings) return push("error", "Could not get your current location.");
    setSettings({ ...settings, workplace_lat: pos.coords.latitude, workplace_lng: pos.coords.longitude });
  }

  if (!settings) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-800">System Settings</h1>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-slate-700">Company</h2>
        <Input label="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-700"><MapPin className="h-4 w-4" /> Workplace Location & Geofence</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={settings.geofence_enabled} onChange={(e) => setSettings({ ...settings, geofence_enabled: e.target.checked })} className="rounded border-slate-300" />
          Require employees to be within the workplace radius to Time In
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" type="number" step="any" value={settings.workplace_lat ?? ""} onChange={(e) => setSettings({ ...settings, workplace_lat: e.target.value ? Number(e.target.value) : null })} />
          <Input label="Longitude" type="number" step="any" value={settings.workplace_lng ?? ""} onChange={(e) => setSettings({ ...settings, workplace_lng: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <Button variant="secondary" onClick={useCurrentLocation} loading={locating} type="button">Use My Current Location</Button>
        <Input label="Allowed Radius (meters)" type="number" value={settings.geofence_radius_m} onChange={(e) => setSettings({ ...settings, geofence_radius_m: Number(e.target.value) })} />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-slate-700">Attendance Rules</h2>
        <Input label="Late Threshold (minutes after schedule start)" type="number" value={settings.late_threshold_minutes} onChange={(e) => setSettings({ ...settings, late_threshold_minutes: Number(e.target.value) })} />
        <Input label="Overtime After (minutes worked)" type="number" value={settings.overtime_after_minutes} onChange={(e) => setSettings({ ...settings, overtime_after_minutes: Number(e.target.value) })} />
      </Card>

      <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save Settings</Button>
    </div>
  );
}
