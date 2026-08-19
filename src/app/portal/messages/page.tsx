import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { EmailCenter } from '@/components/email/EmailCenter';

export default async function PortalMessagesPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'CLIENT') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">Send a message directly to your company contact.</p>
      </div>
      <EmailCenter />
    </div>
  );
}
