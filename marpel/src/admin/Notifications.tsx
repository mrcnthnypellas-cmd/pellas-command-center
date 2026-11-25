import { BellPlus, CheckCheck, Mail, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, IconButton, Modal, PageHeader, Select, SimBadge, StatusBadge, Tabs, Toggle } from '../components/ui';
import { notify, sendEmail } from '../lib/actions';
import { useStore, useToast } from '../lib/store';
import type { EmailLog, NotificationType } from '../lib/types';
import { cx, fmtDateTime, timeAgo } from '../lib/utils';
import { NotificationIcon } from './shared';

const TYPES: NotificationType[] = ['inquiry', 'message', 'appointment', 'quotation', 'customer', 'project', 'system'];

export default function Notifications() {
  const { db, update } = useStore();
  const { push } = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState<'dashboard' | 'email'>('dashboard');
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [email, setEmail] = useState<EmailLog | null>(null);
  const list = db.notifications.filter((n) => (!type || n.type === type) && (!unreadOnly || !n.read));
  const unread = db.notifications.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread · dashboard alerts and email notification log`}
        actions={
          <>
            <Button
              icon={<BellPlus className="h-4 w-4" />}
              onClick={() => {
                update((d) => {
                  notify(d, 'system', 'Test notification', 'This is how alerts appear in real time.', '/admin/notifications');
                  sendEmail(d, 'new_inquiry', d.settings.adminNotificationEmail, '[Test] Marpel notification', 'This is a test email notification from the prototype.');
                });
                push({ tone: 'info', title: 'Test notification sent' });
              }}
            >
              Send test notification
            </Button>
            <Link to="/admin/settings">
              <Button variant="ghost" icon={<Settings className="h-4 w-4" />}>
                Email settings
              </Button>
            </Link>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { value: 'dashboard', label: 'Dashboard notifications', count: db.notifications.length },
          { value: 'email', label: 'Email log', count: db.emails.length },
        ]}
      />
      {tab === 'dashboard' ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] p-4">
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-48" aria-label="Type">
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
            <div className="w-44">
              <Toggle checked={unreadOnly} onChange={setUnreadOnly} label="Unread only" />
            </div>
            <Button size="sm" className="ml-auto" icon={<CheckCheck className="h-3.5 w-3.5" />} disabled={!unread} onClick={() => update((d) => d.notifications.forEach((n) => (n.read = true)))}>
              Mark all as read
            </Button>
          </div>
          {list.length === 0 ? (
            <EmptyState title="You’re all caught up" />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {list.map((n) => (
                <li key={n.id} className={cx('flex items-start gap-4 px-5 py-3.5', !n.read && 'bg-gold-400/[0.035]')}>
                  <NotificationIcon type={n.type} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      update((d) => {
                        const x = d.notifications.find((y) => y.id === n.id);
                        if (x) x.read = true;
                      });
                      nav(n.link);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cx('text-sm', n.read ? 'text-slate-300' : 'font-medium text-white')}>{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />}
                    </span>
                    <span className="block truncate text-sm text-slate-500">{n.body}</span>
                    <span className="text-[11px] text-slate-600" title={fmtDateTime(n.at)}>
                      {timeAgo(n.at)} · {fmtDateTime(n.at)}
                    </span>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => update((d) => (d.notifications.find((y) => y.id === n.id)!.read = !n.read))}>
                    Mark {n.read ? 'unread' : 'read'}
                  </Button>
                  <IconButton label="Delete" onClick={() => update((d) => (d.notifications = d.notifications.filter((y) => y.id !== n.id)))} className="hover:text-rose-300">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-3 border-b border-white/[0.06] p-4 text-sm text-slate-400">
            <SimBadge>Email delivery simulated</SimBadge> Provider: <span className="text-slate-200">{db.settings.emailProvider}</span>
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {db.emails.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setEmail(e)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.03]">
                  <Mail className="h-4 w-4 shrink-0 text-gold-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{e.subject}</span>
                    <span className="block truncate text-xs text-slate-500">To: {e.to}</span>
                  </span>
                  <Badge tone="slate" className="hidden sm:inline-flex">
                    {e.event.replace(/_/g, ' ')}
                  </Badge>
                  <StatusBadge status={e.status} />
                  <span className="w-20 text-right text-xs text-slate-500">{timeAgo(e.at)}</span>
                </button>
              </li>
            ))}
            {!db.emails.length && <li className="p-8 text-center text-sm text-slate-500">No emails yet.</li>}
          </ul>
        </Card>
      )}
      {email && (
        <Modal open onClose={() => setEmail(null)} title={email.subject} subtitle={`To ${email.to} · ${fmtDateTime(email.at)}`} size="lg">
          <div className="overflow-hidden rounded-xl bg-white text-slate-800">
            <div className="bg-[#08101f] px-6 py-4 font-display text-sm font-semibold tracking-[0.12em] text-[#e3c27a]">{db.settings.businessName.toUpperCase()}</div>
            <div className="whitespace-pre-line px-6 py-5 text-sm leading-relaxed">{email.body}</div>
            <div className="border-t border-slate-200 px-6 py-3 text-[11px] text-slate-500">
              {db.settings.address}, {db.settings.city} · {db.settings.phone}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Status: {email.status}. Production sends this via the configured email provider.</p>
        </Modal>
      )}
    </>
  );
}
