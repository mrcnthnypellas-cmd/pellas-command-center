import { ArrowLeft, ArrowRight, Building2, CalendarCheck, CheckCircle2, Clock, Globe2, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMeta } from '../../components/brand';
import { dayAvailability, MonthGrid, slotsFor, slotState } from '../../components/calendar';
import { AttachmentPicker, Button, Field, Input, Textarea } from '../../components/ui';
import { bookAppointment } from '../../lib/actions';
import { useStore, useToast } from '../../lib/store';
import { APPOINTMENT_TYPES, type Appointment, type AppointmentType, type Attachment } from '../../lib/types';
import { clean, cx, fmtDate, fmtTime, isEmail, isPhone } from '../../lib/utils';
import { PageHero, Section } from '../sections';

const FROM_SLUG: Record<string, AppointmentType> = {
  'website-development': 'Website Consultation',
  'software-development': 'Software Consultation',
  'cctv-security-systems': 'CCTV Site Inspection',
  'mikrotik-network-solutions': 'Network Site Survey',
  'it-infrastructure-technical-services': 'Technical Support',
  'it-consultation': 'IT Consultation',
};
const DESC: Record<AppointmentType, string> = {
  'IT Consultation': 'Plan your IT setup, upgrades or budget with an engineer.',
  'Website Consultation': 'Discuss your website goals, features and timeline.',
  'Software Consultation': 'Map your process and scope a custom system.',
  'CCTV Site Inspection': 'On-site camera placement and coverage assessment.',
  'Network Site Survey': 'Assess ISP lines, cabling routes and Wi-Fi coverage.',
  'Technical Support': 'On-site or remote troubleshooting of computers and networks.',
  'Other Services': 'Something else? Tell us what you need.',
};

export default function Book() {
  const { db, update } = useStore();
  const { push } = useToast();
  useMeta('book');
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<AppointmentType | ''>(FROM_SLUG[params.get('service') ?? ''] ?? '');
  const [month, setMonth] = useState(() => new Date());
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [f, setF] = useState({ name: '', email: '', mobile: '', location: '', mode: 'On-site' as Appointment['mode'], description: '' });
  const [files, setFiles] = useState<Attachment[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Appointment | null>(null);

  const duration = type ? db.availability.durations[type] : 60;
  const slots = useMemo(() => slotsFor(db.availability, duration), [db.availability, duration]);
  const onSite = type === 'CCTV Site Inspection' || type === 'Network Site Survey';

  const submit = () => {
    const x: Record<string, string> = {};
    if (clean(f.name).length < 2) x.name = 'Enter your name';
    if (!isEmail(f.email)) x.email = 'Enter a valid email';
    if (!isPhone(f.mobile)) x.mobile = 'Enter a valid mobile number';
    if ((onSite || f.mode === 'On-site') && clean(f.location).length < 4) x.location = 'Enter the site address';
    setErr(x);
    if (Object.keys(x).length) return;
    let result: Appointment | string = '';
    update((d) => {
      result = bookAppointment(d, {
        name: clean(f.name, 120),
        email: f.email.trim().toLowerCase(),
        mobile: f.mobile.trim(),
        type: type as AppointmentType,
        date,
        time,
        duration,
        location: f.mode === 'Online' ? 'Online (link to follow)' : f.mode === 'Office' ? 'Marpel Tech office' : clean(f.location, 300),
        mode: onSite ? 'On-site' : f.mode,
        description: clean(f.description, 3000),
        attachments: files,
      });
    });
    if (typeof result === 'string') {
      push({ tone: 'error', title: 'Slot unavailable', body: result });
      setTime('');
      setStep(2);
      return;
    }
    setDone(result);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (done)
    return (
      <>
        <PageHero eyebrow="Booking received" title="You’re on our calendar." />
        <Section>
          <div className="mx-auto max-w-xl animate-fade-up rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.04] p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" />
            <h2 className="mt-4 font-display text-2xl font-semibold text-white">{done.type}</h2>
            <p className="mt-2 text-slate-300">
              {fmtDate(done.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {fmtTime(done.time)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{done.location}</p>
            <p className="mt-6 text-xs uppercase tracking-wider text-slate-500">Booking reference</p>
            <p className="font-display text-2xl font-semibold tracking-wider text-gold-200">{done.ref}</p>
            <p className="mx-auto mt-5 max-w-sm text-sm text-slate-400">Status: <strong className="text-amber-200">Pending confirmation</strong>. We’ll email {done.email} once your schedule is confirmed.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/">
                <Button variant="gold">Back to home</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => {
                  setDone(null);
                  setStep(1);
                  setDate('');
                  setTime('');
                }}
              >
                Book another
              </Button>
            </div>
          </div>
        </Section>
      </>
    );

  const steps = ['Service', 'Date & time', 'Your details'];
  return (
    <>
      <PageHero eyebrow="Book a consultation" title="Schedule a consultation or site visit." body="Choose a service, pick an available slot and tell us about your needs. We’ll confirm by email." />
      <Section>
        <ol className="mx-auto mb-10 flex max-w-2xl items-center justify-between">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-3 last:flex-none">
              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1', step > i + 1 ? 'bg-gold-400 text-navy-950 ring-gold-400' : step === i + 1 ? 'bg-gold-400/15 text-gold-100 ring-gold-400/60' : 'text-slate-500 ring-white/15')}>{step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</span>
              <span className={cx('hidden text-sm sm:block', step === i + 1 ? 'text-white' : 'text-slate-500')}>{s}</span>
              {i < steps.length - 1 && <span className="mx-3 h-px flex-1 bg-white/10" />}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {APPOINTMENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  setTime('');
                  setStep(2);
                }}
                className={cx('rounded-2xl border p-6 text-left transition hover:-translate-y-0.5', type === t ? 'border-gold-400/60 bg-gold-400/10' : 'border-white/[0.07] bg-navy-900/60 hover:border-gold-400/40')}
              >
                <CalendarCheck className="h-6 w-6 text-gold-300" />
                <p className="mt-4 font-display font-semibold text-white">{t}</p>
                <p className="mt-1 text-sm text-slate-400">{DESC[t]}</p>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> {db.availability.durations[t]} minutes
                </p>
              </button>
            ))}
          </div>
        )}

        {step === 2 && type && (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <MonthGrid
                month={month}
                onMonth={setMonth}
                minMonth={new Date()}
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setTime('');
                }}
                dayInfo={(ymd, d) => {
                  const a = dayAvailability(db, ymd, d);
                  return { disabled: !a.bookable, tone: a.blackout ? 'blocked' : undefined };
                }}
                renderDay={(ymd, d) => {
                  const a = dayAvailability(db, ymd, d);
                  if (!a.bookable) return a.blackout ? <span className="text-[8px] text-rose-300/70">Closed</span> : null;
                  const free = slots.filter((s) => slotState(db, ymd, s, duration) === 'open').length;
                  return <span className={cx('mt-0.5 h-1 w-1 rounded-full', free === 0 ? 'bg-rose-400' : free < 3 ? 'bg-amber-300' : 'bg-emerald-400')} />;
                }}
              />
              <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Available</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Few slots left</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Fully booked</span>
              </div>
            </div>
            <div className="rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6">
              <p className="text-xs uppercase tracking-wider text-slate-500">{type} · {duration} min</p>
              <h3 className="mt-1 font-display text-lg font-semibold text-white">{date ? fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}</h3>
              {date ? (
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {slots.map((s) => {
                    const st = slotState(db, date, s, duration);
                    return (
                      <button key={s} type="button" disabled={st !== 'open'} onClick={() => setTime(s)} className={cx('rounded-xl border py-2.5 text-sm transition', time === s ? 'border-gold-400 bg-gold-400 font-semibold text-navy-950' : st === 'open' ? 'border-white/10 text-slate-200 hover:border-gold-400/50' : 'cursor-not-allowed border-white/5 text-slate-600 line-through')}>
                        {fmtTime(s)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">Available dates are shown on the calendar. Sundays, holidays and fully booked days are unavailable.</p>
              )}
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button variant="gold" disabled={!date || !time} onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4 rounded-3xl border border-white/[0.07] bg-navy-900/60 p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={err.name}>
                  <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
                </Field>
                <Field label="Email" required error={err.email}>
                  <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
                </Field>
                <Field label="Mobile number" required error={err.mobile}>
                  <Input type="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} autoComplete="tel" />
                </Field>
                {!onSite && (
                  <Field label="Meeting type">
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-navy-900/70 p-1">
                      {(
                        [
                          ['On-site', MapPin],
                          ['Office', Building2],
                          ['Online', Globe2],
                        ] as const
                      ).map(([m, I]) => (
                        <button key={m} type="button" onClick={() => setF({ ...f, mode: m })} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs', f.mode === m ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400')}>
                          <I className="h-3.5 w-3.5" /> {m}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
              </div>
              {(onSite || f.mode === 'On-site') && (
                <Field label="Site location / address" required error={err.location}>
                  <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Building, street, city" />
                </Field>
              )}
              <Field label="Description" hint="What would you like to discuss or have inspected?">
                <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              </Field>
              <Field label="Attachments (optional)">
                <AttachmentPicker value={files} onChange={setFiles} />
              </Field>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button variant="gold" size="lg" onClick={submit}>
                  Confirm booking
                </Button>
              </div>
            </div>
            <aside className="h-fit rounded-3xl border border-gold-400/25 bg-gradient-to-br from-gold-400/10 to-transparent p-6">
              <p className="text-xs uppercase tracking-wider text-gold-300">Your booking</p>
              <p className="mt-2 font-display text-xl font-semibold text-white">{type}</p>
              <p className="mt-3 flex items-center gap-2 text-slate-300">
                <CalendarCheck className="h-4 w-4 text-gold-300" /> {fmtDate(date, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="mt-1 flex items-center gap-2 text-slate-300">
                <Clock className="h-4 w-4 text-gold-300" /> {time && fmtTime(time)} · {duration} min
              </p>
              <button type="button" onClick={() => setStep(2)} className="mt-4 text-xs text-gold-200 hover:underline">
                Change date or time
              </button>
            </aside>
          </div>
        )}
      </Section>
    </>
  );
}
