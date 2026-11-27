import { Bot, ExternalLink, MessageCircle, MessagesSquare, Minus, ShieldCheck, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AIBubble, ChatThread, Composer } from '../components/chat';
import { LogoMark } from '../components/brand';
import { Button, Field, Input, SimBadge, Textarea } from '../components/ui';
import { useCustomerConversation, usePublicApi } from '../lib/api';
import { greet, initialAIState, respond, type AIReply, type AIState } from '../lib/ai';
import { useStore, useToast } from '../lib/store';
import { LIVE } from '../lib/supabase';
import type { AIConversation } from '../lib/types';
import { clean, cx, isEmail, isPhone, nowISO, uid } from '../lib/utils';

const TOKEN_KEY = 'marpel.chat.token';
type Tab = 'ai' | 'live';

interface AIMsg {
  id: string;
  from: 'ai' | 'user';
  text: string;
  reply?: AIReply;
}

export function useChatToken() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const save = (t: string | null) => {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    setToken(t);
  };
  return [token, save] as const;
}

export default function ChatWidget() {
  const { db } = useStore();
  const api = usePublicApi();
  const { push } = useToast();
  const nav = useNavigate();
  const aiOn = db.ai.enabled;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(aiOn ? 'ai' : 'live');
  const [token, setToken] = useChatToken();

  // Allow other pages to open the widget (e.g. "Chat with us" buttons).
  useEffect(() => {
    const h = (e: Event) => {
      setOpen(true);
      const t = (e as CustomEvent<Tab | undefined>).detail;
      if (t) setTab(t);
    };
    window.addEventListener('marpel:open-chat', h);
    return () => window.removeEventListener('marpel:open-chat', h);
  }, []);
  useEffect(() => {
    if (!aiOn) setTab('live');
  }, [aiOn]);

  // ── AI state ──
  const [aiState, setAIState] = useState<AIState>(initialAIState);
  const [aiMsgs, setAIMsgs] = useState<AIMsg[]>([]);
  const [thinking, setThinking] = useState(false);
  const aiLogId = useRef<string>(uid('ai_'));
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && tab === 'ai' && aiMsgs.length === 0) {
      const g = greet(db);
      setAIMsgs([{ id: uid(), from: 'ai', text: g.text, reply: g }]);
    }
  }, [open, tab, aiMsgs.length, db]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [aiMsgs.length, thinking]);

  const aiStarted = useRef<string>(nowISO());
  const aiVisitor = useRef<string>(`Visitor #${Math.floor(1000 + Math.random() * 9000)}`);
  const aiOutcome = useRef<AIConversation['outcome']>('Answered');
  const aiSuggested = useRef<string | undefined>(undefined);
  const logAI = (msgs: AIMsg[], outcome: AIConversation['outcome'], suggested?: string, visitor?: string) => {
    if (aiOutcome.current !== 'Lead captured' && aiOutcome.current !== 'Handed off') aiOutcome.current = outcome;
    if (suggested) aiSuggested.current = suggested;
    if (visitor) aiVisitor.current = visitor;
    api.logAI({
      id: aiLogId.current,
      visitor: aiVisitor.current,
      startedAt: aiStarted.current,
      messages: msgs.map((m) => ({ from: m.from, text: m.text, at: nowISO() })),
      outcome: aiOutcome.current,
      suggestedService: aiSuggested.current,
    });
  };

  const [handoffPrefill, setHandoffPrefill] = useState<string | null>(null);

  const finishAI = (base: AIMsg[], reply: AIReply, state: AIState, replyText: string, outcome: AIConversation['outcome']) => {
    const aiMsg: AIMsg = { id: uid(), from: 'ai', text: replyText, reply };
    const all = [...base, aiMsg];
    setAIMsgs(all);
    setAIState(state);
    logAI(all, outcome, state.suggested, state.lead.name);
    if (reply.action?.type === 'handoff') {
      const transcript = `Conversation transferred from ${db.ai.name} (AI). Visitor said: “${base.filter((m) => m.from === 'user').slice(-3).map((m) => m.text).join(' / ')}”${state.suggested ? ` · Suggested service: ${state.suggested}` : ''}`;
      setHandoffPrefill(transcript);
      setTimeout(() => setTab('live'), 700);
    }
  };

  const sendAI = (text: string) => {
    const t = clean(text, 1000);
    if (!t) return;
    const userMsg: AIMsg = { id: uid(), from: 'user', text: t };
    const base = [...aiMsgs, userMsg];
    setAIMsgs(base);
    setThinking(true);
    const { reply, state } = respond(db, aiState, t);
    setTimeout(() => {
      if (reply.action?.type === 'submit_lead') {
        const l = state.lead;
        api
          .submitInquiry({
            name: l.name!,
            email: l.email!,
            mobile: l.mobile!,
            company: '',
            service: l.service ?? 'Not sure',
            title: `${l.service ?? 'Project'} inquiry via AI assistant`,
            description: l.description ?? '',
            budget: l.budget ?? 'Not sure yet',
            schedule: 'To be discussed',
            attachments: [],
            source: 'AI Assistant',
          })
          .then(
            ({ ref }) => {
              reply.chips = ['Book a consultation', 'Talk to a person'];
              push({ tone: 'success', title: 'Quotation request submitted', body: ref });
              finishAI(base, reply, state, `Done! Your request was submitted. Your reference number is ${ref}. Our team will review it and contact you within one business day. You can also book a consultation if you’d like to talk sooner.`, 'Lead captured');
            },
            (e: Error) => {
              reply.chips = ['Request a quotation', 'Talk to a person'];
              finishAI(base, reply, { ...state, mode: 'confirm' }, `Sorry, I couldn’t submit your request just now (${e.message}). Please try again, use the quotation form, or talk to a person.`, 'Answered');
            },
          )
          .finally(() => setThinking(false));
        return;
      }
      setThinking(false);
      finishAI(base, reply, state, reply.text, reply.action?.type === 'handoff' ? 'Handed off' : 'Answered');
    }, 450 + Math.min(900, t.length * 12));
  };

  const onChip = (c: string) => {
    if (c === 'Book a consultation') return nav('/book');
    if (c === 'Request a quotation' && !db.ai.collectLeads) return nav('/quote');
    sendAI(c);
  };

  // Live chat: in production the conversation is fetched securely and refreshed
  // every few seconds while the panel is open; viewing it marks replies as read.
  const viewing = open && tab === 'live';
  const { conv, setConv, missing } = useCustomerConversation(token, viewing);
  useEffect(() => {
    if (missing && token) setToken(null);
  }, [missing, token, setToken]);
  useEffect(() => {
    if (!LIVE && viewing && conv && conv.customerUnread > 0) void api.getConversation(conv.token);
  }, [viewing, conv, api]);
  const [startBusy, setStartBusy] = useState(false);

  const unread = conv?.customerUnread ?? 0;

  return (
    <div className="no-print">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-gold-sheen py-3 pl-4 pr-5 font-semibold text-navy-950 shadow-gold transition hover:scale-[1.03] sm:bottom-6 sm:right-6"
          aria-label="Open chat"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="hidden text-sm sm:inline">Chat with us</span>
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[70] flex animate-fade-up flex-col overflow-hidden border-white/10 bg-navy-900 shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[640px] sm:max-h-[calc(100vh-48px)] sm:w-[400px] sm:rounded-2xl sm:border">
          <div className="relative border-b border-white/[0.07] bg-gradient-to-br from-navy-800 to-navy-900 px-4 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <LogoMark className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-white">{db.settings.shortName}</p>
                <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Typically replies within a few hours
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Minimise chat">
                <Minus className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white sm:hidden" aria-label="Close chat">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-navy-950/50 p-1">
              {aiOn && (
                <button type="button" onClick={() => setTab('ai')} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium', tab === 'ai' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400')}>
                  <Bot className="h-3.5 w-3.5" /> {db.ai.name}
                </button>
              )}
              <button type="button" onClick={() => setTab('live')} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium', !aiOn && 'col-span-2', tab === 'live' ? 'bg-gold-400/15 text-gold-100' : 'text-slate-400')}>
                <UserRound className="h-3.5 w-3.5" /> Chat with our team
                {unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{unread}</span>}
              </button>
            </div>
          </div>

          {tab === 'ai' && aiOn ? (
            <>
              <div className="flex items-center justify-center gap-2 border-b border-white/[0.05] bg-violet-500/[0.06] px-3 py-1.5 text-[10px] text-violet-200">
                {LIVE ? 'Automated assistant · ask for a person anytime' : <><SimBadge>Demo AI</SimBadge> Answers come from business info managed in the admin.</>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {aiMsgs.map((m, i) => (
                  <div key={m.id}>
                    <AIBubble from={m.from} text={m.text}>
                      {m.reply?.links?.map((l) => (
                        <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-gold-200 hover:underline">
                          {l.label} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ))}
                    </AIBubble>
                    {m.from === 'ai' && i === aiMsgs.length - 1 && m.reply?.chips && !thinking && (
                      <div className="ml-9 mt-2 flex flex-wrap gap-1.5">
                        {m.reply.chips.map((c) => (
                          <button key={c} type="button" onClick={() => onChip(c)} className="rounded-full border border-gold-400/30 bg-gold-400/5 px-3 py-1 text-xs text-gold-100 transition hover:bg-gold-400/15">
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="ml-9 flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gold-300" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <Composer onSend={(t) => sendAI(t)} allowAttachments={false} placeholder={aiState.mode === 'lead' ? 'Type your answer…' : 'Ask about our services…'} disabled={thinking} />
            </>
          ) : conv ? (
            <>
              <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure conversation · {conv.status}
                </span>
                <Link to={`/conversation/${conv.token}`} onClick={() => setOpen(false)} className="flex items-center gap-1 text-gold-200 hover:underline">
                  Full page <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <ChatThread messages={conv.messages} perspective="customer" />
              </div>
              <Composer
                onSend={(t, a) =>
                  api.sendMessage(conv.token, t, a).then(
                    (c) => c && setConv(c),
                    (e: Error) => push({ tone: 'error', title: 'Message not sent', body: e.message }),
                  )
                }
                placeholder="Message our team…"
              />
              <button type="button" onClick={() => setToken(null)} className="border-t border-white/[0.05] py-2 text-[11px] text-slate-500 hover:text-slate-300">
                Start a new conversation
              </button>
            </>
          ) : (
            <StartChatForm
              transcript={handoffPrefill}
              busy={startBusy}
              onStart={(p) => {
                setStartBusy(true);
                api
                  .startConversation({ name: p.name, email: p.email, phone: p.phone, topic: p.topic, message: p.firstMessage, source: handoffPrefill ? 'AI Handoff' : 'Live Chat', transcript: handoffPrefill ?? undefined })
                  .then(
                    (c) => {
                      setConv(c);
                      setToken(c.token);
                      setHandoffPrefill(null);
                    },
                    (e: Error) => push({ tone: 'error', title: 'Could not start the chat', body: e.message }),
                  )
                  .finally(() => setStartBusy(false));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StartChatForm({ onStart, transcript, busy }: { onStart: (p: { name: string; email: string; phone: string; topic: string; firstMessage: string }) => void; transcript: string | null; busy?: boolean }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', topic: '', firstMessage: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const e: Record<string, string> = {};
    if (clean(f.name).length < 2) e.name = 'Please enter your name';
    if (!isEmail(f.email)) e.email = 'Enter a valid email';
    if (!isPhone(f.phone)) e.phone = 'Enter a valid mobile number';
    if (!f.firstMessage.trim() && !transcript) e.firstMessage = 'Type your message';
    setErr(e);
    if (Object.keys(e).length) return;
    onStart({ name: clean(f.name, 120), email: f.email.trim(), phone: f.phone.trim(), topic: clean(f.topic, 120) || 'General question', firstMessage: clean(f.firstMessage, 4000) });
  };
  const hint = useMemo(() => (transcript ? 'Our assistant will pass your conversation to the team.' : 'Leave your details so we can reply even if you close this window.'), [transcript]);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5">
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-gold-400/20 bg-gold-400/5 p-3">
        <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
        <div>
          <p className="text-sm font-medium text-white">Chat with a person</p>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
      </div>
      <div className="space-y-3">
        <Field label="Your name" required error={err.name}>
          <Input value={f.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" required error={err.email}>
            <Input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
          </Field>
          <Field label="Mobile" required error={err.phone}>
            <Input value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="+63 9xx" />
          </Field>
        </div>
        <Field label="Topic">
          <Input value={f.topic} onChange={set('topic')} placeholder="e.g. CCTV for my store" />
        </Field>
        <Field label="Message" required={!transcript} error={err.firstMessage}>
          <Textarea rows={3} value={f.firstMessage} onChange={set('firstMessage')} placeholder="How can we help?" />
        </Field>
        <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
          {busy ? 'Starting…' : 'Start conversation'}
        </Button>
        <p className="text-center text-[11px] text-slate-500">By chatting you agree to our handling of your data for this inquiry.</p>
      </div>
    </div>
  );
}

export const openChat = (tab?: Tab) => window.dispatchEvent(new CustomEvent('marpel:open-chat', { detail: tab }));
