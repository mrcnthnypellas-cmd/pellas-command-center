import { ArrowLeft, Bot, CheckCheck, ExternalLink, FlaskConical, Inbox, Lock, Mail, MessagesSquare, Phone, RotateCcw, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChatThread, Composer } from '../components/chat';
import { Avatar, Badge, Button, Card, EmptyState, Field, PageHeader, SearchInput, Select, SimBadge, StatusBadge, Tabs } from '../components/ui';
import { actorOf, adminSend, audit, customerSend, submitInquiry } from '../lib/actions';
import { scopeConversations } from '../lib/permissions';
import { useSession, useStore, useToast } from '../lib/store';
import type { ConversationStatus } from '../lib/types';
import { cx, timeAgo } from '../lib/utils';
import { isMgmt, userName } from './shared';

const QUICK = [
  'Thank you for reaching out! May I know the location of your site?',
  'We can schedule a free site inspection. What date and time works best for you?',
  'I’ll prepare a quotation and send it to your email within one business day.',
  'Could you send a photo of your current setup so we can assess it?',
];
const SIM_REPLIES = ['Thank you! Tomorrow afternoon works for me.', 'Sure, I’ll send photos later today.', 'How long will the installation take?', 'Okay noted. Please send the quotation to my email.'];

export default function Chat() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'active' | ConversationStatus | 'all'>('active');
  const [q, setQ] = useState('');
  const convs = useMemo(() => (user ? scopeConversations(db, user) : []), [db, user]);
  const list = convs
    .filter((c) => (filter === 'all' ? true : filter === 'active' ? c.status === 'Open' || c.status === 'Pending' : c.status === filter))
    .filter((c) => !q || `${c.customerName} ${c.topic} ${c.email} ${c.messages.map((m) => m.text).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selectedId = params.get('c');
  const conv = convs.find((c) => c.id === selectedId);

  useEffect(() => {
    if (conv && conv.adminUnread > 0)
      update((d) => {
        const c = d.conversations.find((x) => x.id === conv.id);
        if (c) c.adminUnread = 0;
        d.notifications.filter((n) => n.link.includes(conv.id) && !n.read).forEach((n) => (n.read = true));
      });
  }, [conv, update]);

  if (!user) return null;
  const actor = actorOf(user);
  const setStatus = (s: ConversationStatus) => {
    if (!conv) return;
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id)!;
      c.status = s;
      c.messages.push({ id: crypto.randomUUID(), from: 'system', authorName: 'System', text: `${user.name} marked this conversation as ${s.toLowerCase()}.`, at: new Date().toISOString(), attachments: [] });
      audit(d, actor, `Conversation ${s.toLowerCase()}`, c.customerName);
    });
    push({ tone: 'success', title: `Conversation ${s.toLowerCase()}` });
  };
  const totalUnread = convs.reduce((n, c) => n + c.adminUnread, 0);

  return (
    <>
      <PageHeader title="Live chat" subtitle={`${convs.filter((c) => c.status === 'Open').length} open conversations · ${totalUnread} unread`} actions={<SimBadge title="Messages sync between browser tabs. Production uses Supabase Realtime.">Realtime simulated</SimBadge>} />
      <Card className="grid h-[calc(100vh-210px)] min-h-[560px] overflow-hidden lg:grid-cols-[300px_1fr] xl:grid-cols-[290px_1fr_270px]">
        {/* list */}
        <div className={cx('flex min-h-0 flex-col border-r border-white/[0.06]', conv && 'hidden lg:flex')}>
          <div className="space-y-3 border-b border-white/[0.06] p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search conversations…" />
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: 'active', label: 'Active' },
                { value: 'Resolved', label: 'Resolved' },
                { value: 'Closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {list.map((c) => {
              const last = c.messages[c.messages.length - 1];
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setParams({ c: c.id })} className={cx('flex w-full gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition', c.id === selectedId ? 'bg-gold-400/[0.08]' : 'hover:bg-white/[0.03]')}>
                    <Avatar name={c.customerName} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cx('truncate text-sm', c.adminUnread ? 'font-semibold text-white' : 'text-slate-200')}>{c.customerName}</span>
                        <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(c.updatedAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-400">{c.topic}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-slate-500">
                          {last?.from === 'admin' && 'You: '}
                          {last?.text || 'Attachment'}
                        </span>
                        {c.adminUnread > 0 && <span className="rounded-full bg-gold-400 px-1.5 text-[10px] font-bold text-navy-950">{c.adminUnread}</span>}
                      </span>
                      <span className="mt-1 flex gap-1">
                        {c.source === 'AI Handoff' && (
                          <Badge tone="violet">
                            <Bot className="h-3 w-3" /> AI handoff
                          </Badge>
                        )}
                        {!c.assignedTo && <Badge tone="amber">Unassigned</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!list.length && <EmptyState icon={<Inbox className="h-6 w-6" />} title="No conversations" body="New chats from the website appear here instantly." />}
          </ul>
        </div>

        {/* thread */}
        {conv ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <button type="button" onClick={() => setParams({})} className="rounded-lg p-1.5 text-slate-400 lg:hidden" aria-label="Back to list">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <Avatar name={conv.customerName} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{conv.customerName}</p>
                <p className="truncate text-xs text-slate-500">
                  {conv.topic} · started {timeAgo(conv.createdAt)}
                </p>
              </div>
              <StatusBadge status={conv.status} />
              {conv.status === 'Open' || conv.status === 'Pending' ? (
                <Button size="sm" variant="subtle" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => setStatus('Resolved')}>
                  Resolve
                </Button>
              ) : (
                <Button size="sm" variant="subtle" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setStatus('Open')}>
                  Reopen
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ChatThread messages={conv.messages} perspective="admin" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3 pt-2 scrollbar-none">
              <Zap className="mt-1 h-3.5 w-3.5 shrink-0 text-gold-400" />
              {QUICK.map((t) => (
                <button key={t} type="button" onClick={() => update((d) => adminSend(d, conv.id, t, actor))} className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:border-gold-400/40 hover:text-gold-100">
                  {t.length > 42 ? t.slice(0, 42) + '…' : t}
                </button>
              ))}
            </div>
            <Composer
              onSend={(t, a) =>
                update((d) => {
                  adminSend(d, conv.id, t, actor, a);
                  const c = d.conversations.find((x) => x.id === conv.id)!;
                  if (!c.assignedTo) c.assignedTo = user.id;
                })
              }
              placeholder={`Reply to ${conv.customerName.split(' ')[0]}…`}
              disabled={conv.status === 'Closed'}
            />
          </div>
        ) : (
          <div className="hidden items-center justify-center lg:flex">
            <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Select a conversation" body="Open the website in another tab and start a chat — it will appear here." />
          </div>
        )}

        {/* customer panel */}
        {conv && (
          <div className="hidden min-h-0 overflow-y-auto border-l border-white/[0.06] p-5 xl:block">
            <div className="text-center">
              <Avatar name={conv.customerName} size="lg" className="mx-auto" />
              <p className="mt-2 font-medium text-white">{conv.customerName}</p>
              <p className="text-xs text-slate-500">Customer since {new Date(db.customers.find((c) => c.id === conv.customerId)?.registeredAt ?? conv.createdAt).getFullYear()}</p>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <a href={`mailto:${conv.email}`} className="flex items-center gap-2 text-slate-300 hover:text-gold-200">
                <Mail className="h-4 w-4 text-slate-500" /> <span className="truncate">{conv.email}</span>
              </a>
              <a href={`tel:${conv.phone}`} className="flex items-center gap-2 text-slate-300 hover:text-gold-200">
                <Phone className="h-4 w-4 text-slate-500" /> {conv.phone}
              </a>
            </div>
            <div className="mt-5 space-y-3">
              <Field label="Assigned to">
                <Select
                  value={conv.assignedTo ?? ''}
                  disabled={!isMgmt(user)}
                  onChange={(e) =>
                    update((d) => {
                      const c = d.conversations.find((x) => x.id === conv.id)!;
                      c.assignedTo = e.target.value || undefined;
                      audit(d, actor, `Assigned conversation to ${userName(d, c.assignedTo)}`, c.customerName);
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {db.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => setStatus('Pending')}>
                  Mark pending
                </Button>
                <Button size="sm" variant="danger" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setStatus('Closed')}>
                  Close
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  let id = '';
                  update((d) => {
                    const inq = submitInquiry(d, {
                      name: conv.customerName,
                      email: conv.email,
                      mobile: conv.phone,
                      company: '',
                      service: 'Not sure — please advise',
                      title: conv.topic,
                      description: conv.messages.filter((m) => m.from === 'customer').map((m) => m.text).join('\n'),
                      budget: 'Not sure yet',
                      schedule: 'To be discussed',
                      attachments: conv.messages.flatMap((m) => m.attachments),
                      source: 'Live Chat',
                    });
                    inq.assignedTo = conv.assignedTo ?? user.id;
                    id = inq.id;
                  });
                  nav(`/admin/inquiries/${id}`);
                }}
              >
                Create inquiry from chat
              </Button>
              <Link to={`/conversation/${conv.token}`} target="_blank" className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-gold-200">
                Customer’s secure view <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-6 rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200">
                <FlaskConical className="h-3 w-3" /> Test tools
              </p>
              <p className="mt-1 text-xs text-slate-400">Simulate the customer replying.</p>
              <Button size="sm" className="mt-2 w-full" onClick={() => update((d) => customerSend(d, conv.id, SIM_REPLIES[Math.floor(Math.random() * SIM_REPLIES.length)]!))}>
                Simulate customer reply
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
