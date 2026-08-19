import { Megaphone } from 'lucide-react';

export function AnnouncementCard({ title, message }: { title: string; message: string | null }) {
  return (
    <div className="card flex items-start gap-3 border-brand-200 bg-gradient-to-r from-brand-600 to-brand-700 p-5 text-white shadow-card">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Megaphone className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-100">{title}</div>
        <div className="mt-0.5 text-sm text-white/90">{message ?? 'View Announcements for details.'}</div>
      </div>
    </div>
  );
}
