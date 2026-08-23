import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { ChatBox } from '@/components/chat/ChatBox';
import { AdminChatInbox } from '@/components/chat/AdminChatInbox';

const ALLOWED_ROLES = ['EMPLOYEE', 'COMPANY_ADMIN', 'HR_ADMIN'] as const;

export default async function MessagesPage() {
  const ctx = await requireCtx();
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">
          {ctx.role === 'EMPLOYEE' ? 'Chat directly with your company admin.' : 'Chat with your employees.'}
        </p>
      </div>

      {ctx.role === 'EMPLOYEE' ? (
        <ChatBox currentUserId={ctx.userId} title="Message Admin" />
      ) : (
        <AdminChatInbox currentUserId={ctx.userId} />
      )}
    </div>
  );
}
