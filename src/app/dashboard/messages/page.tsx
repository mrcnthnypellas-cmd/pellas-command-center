import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { ChatInbox } from '@/components/chat/ChatInbox';

const ALLOWED_ROLES = ['EMPLOYEE', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN'] as const;

export default async function MessagesPage() {
  const ctx = await requireCtx();
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">Pick anyone from your contacts to start a conversation.</p>
      </div>

      <ChatInbox currentUserId={ctx.userId} />
    </div>
  );
}
