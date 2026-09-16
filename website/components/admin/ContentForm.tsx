'use client';

import { useState, type FormEvent } from 'react';

type Values = {
  companyName: string;
  legalName: string;
  shortName: string;
  designation: string;
  tagline: string;
  taglineEyebrow: string;
  heroDescription: string;
  aboutHeadline: string;
  aboutStory: string;
  addressLine1: string;
  addressLine2: string;
  addressCountry: string;
  phone1: string;
  phone2: string;
  email: string;
  hoursWeekday: string;
  hoursWeekend: string;
  facebookUrl: string;
};

export function ContentForm({ initialValues }: { initialValues: Values }) {
  const [values, setValues] = useState<Values>(initialValues);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      setStatus(res.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <Section title="Company">
        <Row>
          <Field label="Company name" value={values.companyName} onChange={(v) => set('companyName', v)} />
          <Field label="Legal name" value={values.legalName} onChange={(v) => set('legalName', v)} />
        </Row>
        <Row>
          <Field label="Short name (navbar/footer)" value={values.shortName} onChange={(v) => set('shortName', v)} />
          <Field label="Designation" value={values.designation} onChange={(v) => set('designation', v)} />
        </Row>
        <Field label="Eyebrow tag (hero, e.g. ACCOUNTING • AUDIT • TAX)" value={values.taglineEyebrow} onChange={(v) => set('taglineEyebrow', v)} />
        <Field label="Tagline (hero headline)" value={values.tagline} onChange={(v) => set('tagline', v)} textarea />
        <Field label="Hero description" value={values.heroDescription} onChange={(v) => set('heroDescription', v)} textarea />
      </Section>

      <Section title="About Section">
        <Field
          label={'About headline (use a line break for the two lines, e.g. "More Than Numbers.\\nWe Build Stronger Businesses.")'}
          value={values.aboutHeadline}
          onChange={(v) => set('aboutHeadline', v)}
          textarea
        />
        <Field
          label="About story (separate paragraphs with a blank line)"
          value={values.aboutStory}
          onChange={(v) => set('aboutStory', v)}
          textarea
          rows={8}
        />
      </Section>

      <Section title="Contact Info">
        <Row>
          <Field label="Address line 1" value={values.addressLine1} onChange={(v) => set('addressLine1', v)} />
          <Field label="Address line 2" value={values.addressLine2} onChange={(v) => set('addressLine2', v)} />
        </Row>
        <Field label="Country" value={values.addressCountry} onChange={(v) => set('addressCountry', v)} />
        <Row>
          <Field label="Phone 1" value={values.phone1} onChange={(v) => set('phone1', v)} />
          <Field label="Phone 2 (optional)" value={values.phone2} onChange={(v) => set('phone2', v)} />
        </Row>
        <Field label="Email" value={values.email} onChange={(v) => set('email', v)} type="email" />
        <Row>
          <Field label="Weekday hours" value={values.hoursWeekday} onChange={(v) => set('hoursWeekday', v)} />
          <Field label="Weekend hours" value={values.hoursWeekend} onChange={(v) => set('hoursWeekend', v)} />
        </Row>
        <Field label="Facebook URL" value={values.facebookUrl} onChange={(v) => set('facebookUrl', v)} />
      </Section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy-950 px-6 py-3 text-sm font-medium text-ivory transition-colors hover:bg-gold-500 hover:text-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {status === 'saved' && <span className="text-sm text-green-700">Saved. Refresh the site to see it live.</span>}
        {status === 'error' && <span className="text-sm text-red-600">Something went wrong. Please try again.</span>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-navy-900/10 bg-white p-6">
      <legend className="px-2 font-serif text-lg text-navy-950">{title}</legend>
      <div className="mt-4 space-y-5">{children}</div>
    </fieldset>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  textarea,
  rows = 3,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  rows?: number;
  type?: string;
}) {
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-navy-500">
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-navy-900/15 bg-ivory/40 px-3 py-2.5 text-sm text-navy-950 outline-none focus:border-navy-900 focus:bg-white"
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-navy-900/15 bg-ivory/40 px-3 py-2.5 text-sm text-navy-950 outline-none focus:border-navy-900 focus:bg-white"
        />
      )}
    </div>
  );
}
