import { Database, Download, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from '../components/brand';
import { Button, Card, CardHeader, Field, ImageInput, Input, Modal, PageHeader, Select, SimBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { useSession, useStore, useToast } from '../lib/store';
import type { EmailEvent, Settings as S } from '../lib/types';
import { bytes } from '../lib/utils';

type Tab = 'profile' | 'contact' | 'quotation' | 'email' | 'data';
const EVENTS: [EmailEvent, string, string][] = [
  ['new_inquiry', 'New inquiry', 'Admin alert + customer confirmation with reference number'],
  ['new_message', 'New chat message', 'When a customer sends a live-chat message'],
  ['appointment_request', 'Appointment request', 'Admin alert + customer acknowledgement'],
  ['appointment_confirmation', 'Appointment confirmed / rescheduled / cancelled', 'Sent to the customer'],
  ['quotation_status', 'Quotation sent / approved / rejected', 'Customer receives quotation; admin is alerted on decisions'],
  ['project_update', 'Project update', 'Customer email when an update is marked visible'],
  ['new_customer', 'New customer registration', 'Admin alert when a new customer record is created'],
];

export default function Settings() {
  const { db, update, reset } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('profile');
  const [s, setS] = useState<S>(() => structuredClone(db.settings));
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  const set = <K extends keyof S>(k: K, v: S[K]) => setS({ ...s, [k]: v });
  const save = () => {
    update((d) => {
      d.settings = s;
      audit(d, actorOf(user), 'Updated business settings', tab);
    });
    push({ tone: 'success', title: 'Settings saved' });
  };
  const size = new Blob([localStorage.getItem('marpel.prototype.db') ?? '']).size;

  return (
    <>
      <PageHeader
        title="Business settings"
        subtitle="Business identity, contact details, quotation defaults and notifications."
        actions={
          tab !== 'data' && (
            <>
              <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={!dirty} onClick={() => setS(structuredClone(db.settings))}>
                Discard
              </Button>
              <Button variant="gold" icon={<Save className="h-4 w-4" />} disabled={!dirty} onClick={save}>
                Save settings
              </Button>
            </>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'profile', label: 'Business profile' },
          { value: 'contact', label: 'Contact & hours' },
          { value: 'quotation', label: 'Quotation defaults' },
          { value: 'email', label: 'Email notifications' },
          { value: 'data', label: 'Data & backup' },
        ]}
      />

      {tab === 'profile' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader title="Identity" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Business name" className="sm:col-span-2">
                <Input value={s.businessName} onChange={(e) => set('businessName', e.target.value)} />
              </Field>
              <Field label="Short name">
                <Input value={s.shortName} onChange={(e) => set('shortName', e.target.value)} />
              </Field>
              <Field label="Tagline">
                <Input value={s.tagline} onChange={(e) => set('tagline', e.target.value)} />
              </Field>
              <Field label="TIN / registration no.">
                <Input value={s.tin} onChange={(e) => set('tin', e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Logo" subtitle="Replace the logo concept with your final logo (PNG/SVG-like, transparent background works best)" />
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-navy-950 p-4">
                {s.logoImage ? <img src={s.logoImage} alt="" className="h-12 w-auto" /> : <LogoMark className="h-12 w-12" />}
                <span className="text-xs text-slate-500">{s.logoImage ? 'Custom logo' : 'Default logo concept'}</span>
              </div>
              <ImageInput value={s.logoImage} onChange={(v) => set('logoImage', v)} aspect="aspect-[3/1]" label="Upload logo" />
            </div>
          </Card>
        </div>
      )}

      {tab === 'contact' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Contact details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Business email">
                <Input value={s.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Support email">
                <Input value={s.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />
              </Field>
              <Field label="Business phone">
                <Input value={s.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Mobile number">
                <Input value={s.mobile} onChange={(e) => set('mobile', e.target.value)} />
              </Field>
              <Field label="Street address" className="sm:col-span-2">
                <Input value={s.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="City / province">
                <Input value={s.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Google Maps search query" hint="Used by the map on the Contact page">
                <Input value={s.mapQuery} onChange={(e) => set('mapQuery', e.target.value)} />
              </Field>
            </div>
            <CardHeader title="Social media links" className="border-t" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {(Object.keys(s.socials) as (keyof S['socials'])[]).map((k) => (
                <Field key={k} label={k}>
                  <Input value={s.socials[k]} onChange={(e) => set('socials', { ...s.socials, [k]: e.target.value })} placeholder="https://" />
                </Field>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Operating hours" />
            <ul className="divide-y divide-white/[0.05]">
              {s.hours.map((h, i) => (
                <li key={h.day} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-28 text-sm text-slate-200">{h.day}</span>
                  <div className="w-28">
                    <Toggle checked={!h.closed} onChange={(v) => set('hours', s.hours.map((x, j) => (j === i ? { ...x, closed: !v } : x)))} label={h.closed ? 'Closed' : 'Open'} />
                  </div>
                  {!h.closed && (
                    <>
                      <Input type="time" value={h.open} onChange={(e) => set('hours', s.hours.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className="w-32" aria-label={`${h.day} opens`} />
                      <span className="text-slate-500">–</span>
                      <Input type="time" value={h.close} onChange={(e) => set('hours', s.hours.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className="w-32" aria-label={`${h.day} closes`} />
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="px-5 pb-4 text-xs text-slate-500">Booking availability is configured separately in Appointments → Availability.</p>
          </Card>
        </div>
      )}

      {tab === 'quotation' && (
        <Card>
          <CardHeader title="Quotation defaults" subtitle="Applied to every new quotation (editable per quotation)" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Number prefix" hint={`e.g. ${s.quotationPrefix}-2026-0001`}>
              <Input value={s.quotationPrefix} onChange={(e) => set('quotationPrefix', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Validity (days)">
              <Input type="number" min={1} value={s.quotationValidityDays} onChange={(e) => set('quotationValidityDays', Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Currency">
              <Select value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value, currencySymbol: e.target.value === 'PHP' ? '₱' : e.target.value === 'USD' ? '$' : s.currencySymbol })}>
                <option>PHP</option>
                <option>USD</option>
              </Select>
            </Field>
            <Field label="Tax label">
              <Input value={s.taxLabel} onChange={(e) => set('taxLabel', e.target.value)} />
            </Field>
            <Field label="Default tax rate (%)">
              <Input type="number" min={0} value={s.defaultTaxRate} onChange={(e) => set('defaultTaxRate', Number(e.target.value))} />
            </Field>
            <div />
            <Field label="Default payment terms" className="md:col-span-3">
              <Textarea rows={2} value={s.defaultPaymentTerms} onChange={(e) => set('defaultPaymentTerms', e.target.value)} />
            </Field>
            <Field label="Default terms & conditions" hint="One per line" className="md:col-span-3">
              <Textarea rows={6} value={s.defaultQuotationTerms} onChange={(e) => set('defaultQuotationTerms', e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {tab === 'email' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader title="Email notification events" subtitle="Dashboard notifications are always on; these control emails" />
            <ul className="divide-y divide-white/[0.05]">
              {EVENTS.map(([k, label, desc]) => (
                <li key={k} className="px-5 py-3">
                  <Toggle checked={s.emailEvents[k]} onChange={(v) => set('emailEvents', { ...s.emailEvents, [k]: v })} label={label} description={desc} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Delivery" action={<SimBadge>Not connected</SimBadge>} />
            <div className="space-y-4 p-5">
              <Field label="Admin notification email">
                <Input value={s.adminNotificationEmail} onChange={(e) => set('adminNotificationEmail', e.target.value)} />
              </Field>
              <Field label="Email provider" hint="Selected during production setup">
                <Select value={s.emailProvider} onChange={(e) => set('emailProvider', e.target.value as S['emailProvider'])}>
                  {['Not connected', 'SMTP', 'Resend', 'SendGrid', 'Amazon SES'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
              <p className="rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-3 text-xs leading-relaxed text-slate-400">
                In this prototype every email is written to <strong className="text-slate-200">Notifications → Email log</strong> instead of being delivered. In production, emails are sent from a server-side function using the provider’s API key stored as a secret — never in the browser.
              </p>
            </div>
          </Card>
        </div>
      )}

      {tab === 'data' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Prototype data" subtitle="Stored in this browser's local storage" />
            <div className="space-y-4 p-5 text-sm">
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-4">
                <Database className="h-6 w-6 text-gold-300" />
                <div>
                  <p className="text-slate-200">
                    {db.customers.length} customers · {db.inquiries.length} inquiries · {db.projects.length} projects
                  </p>
                  <p className="text-xs text-slate-500">{bytes(size)} used of ~5 MB browser storage</p>
                </div>
              </div>
              <Button
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `marpel-prototype-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  update((d) => audit(d, actorOf(user), 'Exported data backup', 'JSON'));
                }}
              >
                Download JSON backup
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Reset" />
            <div className="space-y-3 p-5 text-sm text-slate-400">
              <p>Restore the original sample data. Useful after testing workflows.</p>
              <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} disabled={user?.role !== 'super_admin'} onClick={() => setConfirmReset(true)}>
                Reset all prototype data
              </Button>
              {user?.role !== 'super_admin' && <p className="text-xs">Only the Super Administrator can reset data.</p>}
            </div>
          </Card>
        </div>
      )}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all data?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmReset(false);
                setS(structuredClone(db.settings));
                push({ tone: 'success', title: 'Sample data restored' });
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">Every change made in this browser will be replaced by the original sample data. You will stay signed in.</p>
      </Modal>
    </>
  );
}
