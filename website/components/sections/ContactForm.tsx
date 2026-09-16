'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { Service } from '@/data/services';

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  service: string;
  message: string;
};

const initialState: FormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  service: '',
  message: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

function validate(values: FormState): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = 'Please enter your name.';
  if (!values.email.trim()) {
    errors.email = 'Please enter your email.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!values.message.trim()) errors.message = 'Please tell us a bit about what you need.';
  return errors;
}

export function ContactForm({ services }: { services: Service[] }) {
  const [values, setValues] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          company: values.company || undefined,
          email: values.email,
          phone: values.phone || undefined,
          serviceNeeded: values.service || undefined,
          message: values.message,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSubmitted(true);
      setValues(initialState);
    } catch {
      setSubmitError('Something went wrong sending your inquiry. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex h-full flex-col items-center justify-center border border-navy-900/10 bg-white p-10 text-center">
        <CheckCircle2 size={40} strokeWidth={1.5} className="text-gold-500" />
        <h3 className="mt-5 font-serif text-xl text-navy-950">Thank you for reaching out</h3>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-navy-600">
          Your inquiry has been received. We&rsquo;ll get back to you shortly.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 text-sm font-medium text-navy-900 underline underline-offset-4 hover:text-gold-600"
        >
          Send another inquiry
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="border border-navy-900/10 bg-white p-8 sm:p-10">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(e) => handleChange('name', e.target.value)}
            aria-invalid={!!errors.name}
            className={inputClass(!!errors.name)}
          />
        </Field>

        <Field label="Company" htmlFor="company" optional>
          <input
            id="company"
            type="text"
            autoComplete="organization"
            value={values.company}
            onChange={(e) => handleChange('company', e.target.value)}
            className={inputClass(false)}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => handleChange('email', e.target.value)}
            aria-invalid={!!errors.email}
            className={inputClass(!!errors.email)}
          />
        </Field>

        <Field label="Phone" htmlFor="phone" optional>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            className={inputClass(false)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Service Needed" htmlFor="service" optional>
            <select
              id="service"
              value={values.service}
              onChange={(e) => handleChange('service', e.target.value)}
              className={inputClass(false)}
            >
              <option value="">Select a service</option>
              {services.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Message" htmlFor="message" error={errors.message}>
            <textarea
              id="message"
              rows={5}
              value={values.message}
              onChange={(e) => handleChange('message', e.target.value)}
              aria-invalid={!!errors.message}
              className={inputClass(!!errors.message)}
            />
          </Field>
        </div>
      </div>

      {submitError && (
        <p className="mt-6 flex items-center gap-2 text-sm text-red-600" role="alert">
          <AlertCircle size={16} /> {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-8 inline-flex items-center gap-2 bg-navy-950 px-7 py-3.5 text-sm font-medium tracking-wide text-ivory transition-colors duration-300 hover:bg-gold-500 hover:text-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Sending…' : 'Send Inquiry →'}
      </button>
    </form>
  );
}

function inputClass(hasError: boolean) {
  return `w-full border bg-ivory/40 px-4 py-3 text-sm text-navy-950 outline-none transition-colors duration-200 focus:bg-white ${
    hasError ? 'border-red-400' : 'border-navy-900/15 focus:border-navy-900'
  }`;
}

function Field({
  label,
  htmlFor,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-xs font-medium uppercase tracking-wide text-navy-700">
        {label} {optional && <span className="normal-case text-navy-400">(optional)</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
