import { CalendarDays, CalendarX2, Check, Clock, List, MapPin, Plus, Settings2, StickyNote, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MonthGrid, slotsFor, slotState } from '../components/calendar';
import { AttachmentList, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea, Th } from '../components/ui';
import { actorOf, audit, setAppointmentStatus } from '../lib/actions';
import { scopeAppointments } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, type Appointment } from '../lib/types';
import { clean, cx, fmtDate, fmtDateTime, fmtTime, todayYMD, uid } from '../lib/utils';
import { isMgmt, userName } from './shared';

const DOT: Record<string, string> = { Pending: 'bg-amber-300', Confirmed: 'bg-emerald-400', Rescheduled: 'bg-orange-400', Completed: 'bg-sky-400', Cancelled: 'bg-slate-500' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Appointments() {
  const { db } = useStore();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'calendar' | 'list' | 'availability'>('calendar');
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState(todayYMD());
  const [statusF, setStatusF] = useState('All');
  if (!user) return null;
  const appts = scopeAppointments(db, user);
  const selected = appts.find((a) => a.id === params.get('a'));
  const dayAppts = appts.filter((a) => a.date === day).sort((a, b) => a.time.localeCompare(b.time));
  const listRows = appts.filter((a) => statusF === 'All' || a.status === statusF).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle={`${appts.filter((a) => a.status === 'Pending').length} pending approval · ${appts.filter((a) => a.date >= todayYMD() && a.status === 'Confirmed').length} confirmed upcoming`}
        actions={
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { value: 'calendar', label: <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Calendar</span> },
              { value: 'list', label: <span className="flex items-center gap-1.5"><List className="h-3.5 w-3.5" /> List</span> },
              ...(isMgmt(user) ? [{ value: 'availability' as const, label: <span className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Availability</span> }] : []),
            ]}
          />
        }
      />

      {view === 'calendar' && (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            <MonthGrid
              month={month}
              onMonth={setMonth}
              selected={day}
              onSelect={setDay}
              dayInfo={(ymd, d) => ({ tone: db.availability.blackoutDates.some((b) => b.date === ymd) || !db.availability.workingDays.includes(d.getDay()) ? 'blocked' : undefined })}
              renderDay={(ymd) => {
                const list = appts.filter((a) => a.date === ymd);
                if (!list.length) return null;
                return (
                  <span className="mt-1 flex w-full flex-col gap-0.5">
                    {list.slice(0, 2).map((a) => (
                      <span key={a.id} className="hidden truncate rounded bg-white/[0.06] px-1 text-left text-[9px] text-slate-300 sm:flex sm:items-center sm:gap-1">
                        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[a.status])} />
                        {a.time} {a.name.split(' ')[0]}
                      </span>
                    ))}
                    <span className="flex justify-center gap-0.5 sm:hidden">
                      {list.slice(0, 3).map((a) => (
                        <span key={a.id} className={cx('h-1.5 w-1.5 rounded-full', DOT[a.status])} />
                      ))}
                    </span>
                    {list.length > 2 && <span className="hidden text-[9px] text-slate-500 sm:block">+{list.length - 2} more</span>}
                  </span>
                );
              }}
            />
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-400">
              {APPOINTMENT_STATUSES.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cx('h-2 w-2 rounded-full', DOT[s])} /> {s}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.15)_2px,rgba(255,255,255,0.15)_4px)]" /> Closed / blackout
              </span>
            </div>
          </Card>
          <Card>
            <CardHeader title={fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })} subtitle={`${dayAppts.length} appointment${dayAppts.length === 1 ? '' : 's'}`} />
            {dayAppts.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Nothing scheduled" body={db.availability.blackoutDates.find((b) => b.date === day)?.reason ?? 'Pick another day on the calendar.'} />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {dayAppts.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setParams({ a: a.id })} className="flex w-full gap-3 px-5 py-4 text-left hover:bg-white/[0.03]">
                      <span className="w-16 shrink-0">
                        <span className="block text-sm font-semibold text-white">{fmtTime(a.time)}</span>
                        <span className="text-[11px] text-slate-500">{a.duration} min</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-200">{a.type}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {a.name} · {a.location}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">{userName(db, a.assignedTo)}</span>
                      </span>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {view === 'list' && (
        <Card>
          <div className="border-b border-white/[0.06] p-4">
            <Tabs value={statusF} onChange={setStatusF} tabs={[{ value: 'All', label: 'All', count: appts.length }, ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: s, count: appts.filter((a) => a.status === s).length }))]} />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Date & time</Th>
                <Th>Type</Th>
                <Th>Customer</Th>
                <Th>Assigned</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {listRows.slice(0, 60).map((a) => (
                <tr key={a.id} onClick={() => setParams({ a: a.id })} className="cursor-pointer hover:bg-white/[0.03]">
                  <Td className="font-mono text-xs text-gold-200">{a.ref}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {fmtDate(a.date)} · {fmtTime(a.time)}
                  </Td>
                  <Td>{a.type}</Td>
                  <Td>
                    <p className="text-slate-200">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.mobile}</p>
                  </Td>
                  <Td className="text-xs">{userName(db, a.assignedTo)}</Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {listRows.length > 60 && <p className="px-4 py-3 text-xs text-slate-500">Showing latest 60 of {listRows.length}.</p>}
        </Card>
      )}

      {view === 'availability' && isMgmt(user) && <AvailabilitySettings />}

      {selected && <AppointmentPanel key={selected.id} a={selected} onClose={() => setParams({})} />}
    </>
  );
}

function AppointmentPanel({ a, onClose }: { a: Appointment; onClose: () => void }) {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [resched, setResched] = useState(false);
  const [rd, setRd] = useState(a.date);
  const [rt, setRt] = useState('');
  const [note, setNote] = useState('');
  if (!user) return null;
  const actor = actorOf(user);
  const act = (s: Appointment['status'], extra?: { date: string; time: string }) => {
    update((d) => setAppointmentStatus(d, a.id, s, actor, extra));
    push({ tone: 'success', title: `Appointment ${s.toLowerCase()}`, body: ['Confirmed', 'Rescheduled', 'Cancelled'].includes(s) ? 'Customer notified by email (simulated).' : undefined });
  };
  const slots = slotsFor(db.availability, a.duration);
  return (
    <Modal
      open
      onClose={onClose}
      title={a.type}
      subtitle={`${a.ref} · booked ${fmtDateTime(a.createdAt)}`}
      size="lg"
      footer={
        <>
          {a.status === 'Pending' && (
            <>
              <Button variant="danger" icon={<X className="h-4 w-4" />} onClick={() => act('Cancelled')}>
                Reject
              </Button>
              <Button variant="gold" icon={<Check className="h-4 w-4" />} onClick={() => act('Confirmed')}>
                Approve & confirm
              </Button>
            </>
          )}
          {['Confirmed', 'Rescheduled'].includes(a.status) && (
            <>
              <Button variant="danger" onClick={() => act('Cancelled')}>
                Cancel appointment
              </Button>
              <Button variant="gold" icon={<Check className="h-4 w-4" />} onClick={() => act('Completed')}>
                Mark completed
              </Button>
            </>
          )}
          {['Pending', 'Confirmed', 'Rescheduled'].includes(a.status) && (
            <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => setResched(!resched)}>
              Reschedule
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            <Badge tone="slate">{a.mode}</Badge>
          </div>
          <p className="flex items-center gap-2 text-slate-200">
            <CalendarDays className="h-4 w-4 text-gold-300" /> {fmtDate(a.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="flex items-center gap-2 text-slate-200">
            <Clock className="h-4 w-4 text-gold-300" /> {fmtTime(a.time)} · {a.duration} min
          </p>
          <p className="flex items-start gap-2 text-slate-200">
            <MapPin className="mt-0.5 h-4 w-4 text-gold-300" /> {a.location}
          </p>
          {a.description && <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-slate-300">{a.description}</p>}
          <AttachmentList items={a.attachments} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3">
            <Avatar name={a.name} />
            <div className="text-sm">
              <p className="text-white">{a.name}</p>
              <p className="text-xs text-slate-500">
                {a.email} · {a.mobile}
              </p>
            </div>
          </div>
          <Field label="Assigned staff">
            <Select
              value={a.assignedTo ?? ''}
              disabled={!isMgmt(user)}
              onChange={(e) =>
                update((d) => {
                  const x = d.appointments.find((y) => y.id === a.id)!;
                  x.assignedTo = e.target.value || undefined;
                  x.history.push({ id: uid('h_'), at: new Date().toISOString(), by: user.name, text: `Assigned to ${userName(d, x.assignedTo)}` });
                  audit(d, actor, 'Assigned appointment', x.ref);
                })
              }
            >
              <option value="">Unassigned</option>
              {db.users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.title}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </div>

      {resched && (
        <div className="mt-6 rounded-2xl border border-gold-400/25 bg-gold-400/[0.04] p-4">
          <p className="mb-3 text-sm font-medium text-white">Choose a new slot</p>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Input type="date" min={todayYMD()} value={rd} onChange={(e) => (setRd(e.target.value), setRt(''))} />
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => {
                const st = slotState(db, rd, s, a.duration, a.id);
                return (
                  <button key={s} type="button" disabled={st !== 'open'} onClick={() => setRt(s)} className={cx('rounded-lg border px-2.5 py-1.5 text-xs', rt === s ? 'border-gold-400 bg-gold-400 text-navy-950' : st === 'open' ? 'border-white/10 text-slate-300 hover:border-gold-400/50' : 'border-white/5 text-slate-600 line-through')}>
                    {fmtTime(s)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="gold"
              size="sm"
              disabled={!rt}
              onClick={() => {
                act('Rescheduled', { date: rd, time: rt });
                setResched(false);
              }}
            >
              Confirm new schedule
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Taken slots are disabled to prevent double booking.</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Appointment notes</p>
          <div className="flex gap-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
            <IconButton
              label="Add note"
              className="h-auto w-12 border border-white/10"
              onClick={() => {
                if (!note.trim()) return;
                update((d) => d.appointments.find((x) => x.id === a.id)!.notes.unshift({ id: uid('n_'), at: new Date().toISOString(), by: user.name, text: clean(note, 2000) }));
                setNote('');
              }}
            >
              <StickyNote className="h-4 w-4" />
            </IconButton>
          </div>
          <ul className="mt-3 space-y-2">
            {a.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-white/[0.03] p-2 text-sm text-slate-300">
                {n.text}
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {n.by} · {fmtDateTime(n.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">History</p>
          <ul className="space-y-2 text-sm">
            {[...a.history].reverse().map((h) => (
              <li key={h.id}>
                <p className="text-slate-300">{h.text}</p>
                <p className="text-[10px] text-slate-500">
                  {h.by} · {fmtDateTime(h.at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function AvailabilitySettings() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const av = db.availability;
  const [bo, setBo] = useState({ date: '', reason: '' });
  const [addOpen, setAddOpen] = useState(false);
  const set = (fn: (a: typeof av) => void) =>
    update((d) => {
      fn(d.availability);
    });
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Working hours" subtitle="Bookable days and times shown on the public booking page" />
        <div className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Working days</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = av.workingDays.includes(i);
                return (
                  <button key={d} type="button" onClick={() => set((a) => (a.workingDays = on ? a.workingDays.filter((x) => x !== i) : [...a.workingDays, i].sort()))} className={cx('h-10 w-14 rounded-xl border text-sm', on ? 'border-gold-400/60 bg-gold-400/15 text-gold-100' : 'border-white/10 text-slate-500')}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens at">
              <Input type="time" value={av.start} onChange={(e) => set((a) => (a.start = e.target.value))} />
            </Field>
            <Field label="Closes at">
              <Input type="time" value={av.end} onChange={(e) => set((a) => (a.end = e.target.value))} />
            </Field>
            <Field label="Slot interval">
              <Select value={av.slotMinutes} onChange={(e) => set((a) => (a.slotMinutes = Number(e.target.value)))}>
                {[30, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    Every {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bookings per slot" hint="1 = no double booking">
              <Input type="number" min={1} max={5} value={av.maxPerSlot} onChange={(e) => set((a) => (a.maxPerSlot = Math.max(1, Number(e.target.value))))} />
            </Field>
            <Field label="Minimum notice (hours)">
              <Input type="number" min={0} value={av.leadTimeHours} onChange={(e) => set((a) => (a.leadTimeHours = Math.max(0, Number(e.target.value))))} />
            </Field>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Appointment durations" subtitle="Length of each appointment type" />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {APPOINTMENT_TYPES.map((t) => (
            <Field key={t} label={t}>
              <Select value={av.durations[t]} onChange={(e) => set((a) => (a.durations[t] = Number(e.target.value)))}>
                {[30, 60, 90, 120, 180, 240].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader
          title="Unavailable dates"
          subtitle="Holidays, company events and leave — blocked on the booking calendar"
          action={
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
              Add date
            </Button>
          }
        />
        <ul className="divide-y divide-white/[0.05]">
          {[...av.blackoutDates]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                <CalendarX2 className="h-4 w-4 text-rose-300" />
                <span className="w-40 text-sm text-slate-200">{fmtDate(b.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="flex-1 text-sm text-slate-400">{b.reason}</span>
                <IconButton label="Remove date" onClick={() => set((a) => (a.blackoutDates = a.blackoutDates.filter((x) => x.id !== b.id)))} className="hover:text-rose-300">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          {!av.blackoutDates.length && <li className="p-6 text-center text-sm text-slate-500">No blocked dates.</li>}
        </ul>
      </Card>
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Block a date"
        size="sm"
        footer={
          <Button
            variant="gold"
            disabled={!bo.date}
            onClick={() => {
              update((d) => {
                d.availability.blackoutDates.push({ id: uid('bo_'), date: bo.date, reason: clean(bo.reason, 120) || 'Unavailable' });
                audit(d, actorOf(user), 'Blocked booking date', bo.date);
              });
              setBo({ date: '', reason: '' });
              setAddOpen(false);
              push({ tone: 'success', title: 'Date blocked' });
            }}
          >
            Block date
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Date">
            <Input type="date" min={todayYMD()} value={bo.date} onChange={(e) => setBo({ ...bo, date: e.target.value })} />
          </Field>
          <Field label="Reason">
            <Input value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} placeholder="e.g. Company outing" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
