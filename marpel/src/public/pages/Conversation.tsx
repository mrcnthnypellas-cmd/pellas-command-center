import { Lock, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChatThread, Composer } from '../../components/chat';
import { Button, StatusBadge } from '../../components/ui';
import { customerSend } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { fmtDate } from '../../lib/utils';
import { Section } from '../sections';

/** Secure customer conversation page — reachable only with the unguessable conversation token. */
export default function ConversationPage() {
  const { token } = useParams();
  const { db, update } = useStore();
  const conv = db.conversations.find((c) => c.token === token);
  useEffect(() => {
    document.title = 'Your conversation | Marpel Tech';
    if (conv && conv.customerUnread > 0)
      update((d) => {
        const c = d.conversations.find((x) => x.id === conv.id);
        if (c) c.customerUnread = 0;
      });
  }, [conv, update]);

  if (!conv)
    return (
      <Section className="max-w-xl text-center">
        <Lock className="mx-auto h-10 w-10 text-gold-300" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-white">Conversation not available</h1>
        <p className="mt-2 text-slate-400">This secure link is invalid or has expired. Start a new chat from any page.</p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="gold">Go to homepage</Button>
        </Link>
      </Section>
    );

  return (
    <Section className="max-w-3xl py-10">
      <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-navy-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div>
            <p className="font-display text-lg font-semibold text-white">{conv.topic}</p>
            <p className="text-xs text-slate-500">
              Started {fmtDate(conv.createdAt)} · {conv.customerName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={conv.status} />
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Private link
            </span>
          </div>
        </div>
        <div className="h-[55vh] overflow-y-auto px-6 py-5">
          <ChatThread messages={conv.messages} perspective="customer" />
        </div>
        <Composer onSend={(t, a) => update((d) => customerSend(d, conv.id, t, a))} />
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Bookmark this page to return to your conversation. Don’t share the link — anyone with it can read this chat.</p>
    </Section>
  );
}
