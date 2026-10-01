import { useEffect, useState } from "react";
import { Phone, Users, Building2, Laptop, Wallet, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card, Button, Modal, Input, Select, ConfirmDialog } from "./ui/ui";
import type { Contact } from "../types";

const ICON_OPTIONS = ["hr", "admin", "it", "accounting", "emergency", "phone", "building"] as const;

const ICON_MAP: Record<string, LucideIcon> = {
  hr: Users,
  admin: Building2,
  it: Laptop,
  accounting: Wallet,
  emergency: AlertTriangle,
  phone: Phone,
  building: Building2,
};

const EMPTY_FORM = {
  name: "",
  description: "",
  phone: "",
  extension: "",
  icon: "phone" as (typeof ICON_OPTIONS)[number],
  is_emergency: false,
};

export default function ContactDirectoryCard() {
  const { profile } = useAuth();
  const { push } = useToast();
  const canEdit = profile?.role === "admin";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*").order("sort_order");
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(c: Contact) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      phone: c.phone,
      extension: c.extension ?? "",
      icon: c.icon as (typeof ICON_OPTIONS)[number],
      is_emergency: c.is_emergency,
    });
    setShowForm(true);
  }

  async function submitForm() {
    if (!profile || !form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      phone: form.phone.trim(),
      extension: form.extension.trim() || null,
      icon: form.icon,
      is_emergency: form.is_emergency,
    };
    const { error } = editing
      ? await supabase.from("contacts").update(payload).eq("id", editing.id)
      : await supabase.from("contacts").insert({ ...payload, company_id: profile.company_id, sort_order: contacts.length });
    setSaving(false);
    if (error) {
      push("error", error.message);
      return;
    }
    push("success", editing ? "Contact updated." : "Contact added.");
    setShowForm(false);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("contacts").delete().eq("id", deleteTarget.id);
    if (error) {
      push("error", error.message);
    } else {
      push("success", "Contact removed.");
      load();
    }
    setDeleteTarget(null);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Contact Directory</h2>
        {canEdit && (
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" /> Add Contact
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-slate-400">No contacts yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {contacts.map((c) => {
            const Icon = ICON_MAP[c.icon] ?? Phone;
            return (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                  c.is_emergency ? "border-red-200 bg-red-50" : "border-slate-100"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      c.is_emergency ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className={`truncate text-sm font-semibold ${c.is_emergency ? "text-red-700" : "text-slate-800"}`}>
                      {c.name}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {c.description ?? (c.is_emergency ? "For urgent matters only" : "")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className={`flex items-center gap-1 text-sm font-semibold ${c.is_emergency ? "text-red-600" : "text-blue-600"}`}>
                      <Phone className="h-3.5 w-3.5" /> {c.phone}
                    </div>
                    {c.extension && <div className="text-[11px] text-slate-400">Ext. {c.extension}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(c)} aria-label="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(c)} aria-label="Delete" className="rounded-md p-1.5 text-red-500 hover:bg-red-50">
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit Contact" : "Add Contact"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" placeholder="e.g. HR Department" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Select label="Icon" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value as (typeof ICON_OPTIONS)[number] }))}>
              {ICON_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Description"
            placeholder="e.g. Recruitment, Benefits, Personnel"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input label="Extension (optional)" value={form.extension} onChange={(e) => setForm((f) => ({ ...f, extension: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.is_emergency}
              onChange={(e) => setForm((f) => ({ ...f, is_emergency: e.target.checked }))}
            />
            Emergency contact (highlighted in red, for urgent matters only)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
          <Button onClick={submitForm} loading={saving}>
            {editing ? "Save Changes" : "Add Contact"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove contact"
        message={`Remove "${deleteTarget?.name}" from the directory?`}
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
