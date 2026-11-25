import { Bell, CalendarDays, FileText, FolderKanban, Inbox, MessagesSquare, UserPlus } from 'lucide-react';
import type { DB, NotificationType, User } from '../lib/types';
import { cx } from '../lib/utils';

export function NotificationIcon({ type, className }: { type: NotificationType; className?: string }) {
  const map = {
    inquiry: [Inbox, 'bg-gold-400/15 text-gold-200'],
    message: [MessagesSquare, 'bg-sky-400/15 text-sky-200'],
    appointment: [CalendarDays, 'bg-emerald-400/15 text-emerald-200'],
    quotation: [FileText, 'bg-violet-400/15 text-violet-200'],
    customer: [UserPlus, 'bg-cyan-400/15 text-cyan-200'],
    project: [FolderKanban, 'bg-orange-400/15 text-orange-200'],
    system: [Bell, 'bg-slate-400/15 text-slate-300'],
  } as const;
  const [I, c] = map[type];
  return (
    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', c, className)}>
      <I className="h-4 w-4" />
    </span>
  );
}

export const userName = (db: DB, id?: string) => (id ? db.users.find((u) => u.id === id)?.name ?? 'Unknown' : 'Unassigned');
export const customerOf = (db: DB, id?: string) => db.customers.find((c) => c.id === id);
export const staffOptions = (db: DB) => db.users.filter((u) => u.active);
export const isMgmt = (u: User | null) => !!u && (u.role === 'admin' || u.role === 'super_admin');
