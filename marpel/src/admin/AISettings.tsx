import { Bot, Plus, RotateCcw, Save, Send, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AIBubble } from '../components/chat';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, ListEditor, Modal, PageHeader, Select, SimBadge, Tabs, Textarea, Toggle } from '../components/ui';
import { actorOf, audit } from '../lib/actions';
import { greet, initialAIState, respond, type AIState } from '../lib/ai';
import { useSession, useStore, useToast } from '../lib/store';
import type { AIConversation, AISettings as A, FAQ } from '../lib/types';
import { fmtDateTime, timeAgo, uid } from '../lib/utils';

type Tab = 'behaviour' | 'faqs' | 'test' | 'history';

export default function AISettings() {
  const { db, update } = useStore();
  const { user } = useSession();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('behaviour');
  const [a, setA] = useState<Omit<A, 'conversations'>>(() => {
    const { conversations: _c, ...rest } = structuredClone(db.ai);
    void _c;
    return rest;
  });
  const { conversations: _cc, ...current } = db.ai;
  void _cc;
  const dirty = JSON.stringify(a) !== JSON.stringify(current);
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA({ ...a, [k]: v });
  const save = () => {
    update((d) => {
      d.ai = { ...d.ai, ...a };
      audit(d, actorOf(user), 'Updated AI assistant settings', a.name);
    });
    push({ tone: 'success', title: 'AI assistant settings saved' });
  };
  const [faq, setFaq] = useState<FAQ | null>(null);
  const [view, setView] = useState<AIConversation | null>(null);
  const [outcome, setOutcome] = useState('All');

  // test console
  const [testState, setTestState] = useState<AIState>(initialAIState);
  const [testMsgs, setTestMsgs] = useState<{ from: 'ai' | 'user'; text: string }[]>([]);
  const [testInput, setTestInput] = useState('');
  const testDb = { ...db, ai: { ...db.ai, ...a } };
  const runTest = (t: string) => {
    if (!t.trim()) return;
    const { reply, state } = respond(testDb, testState, t);
    setTestMsgs((m) => [...m, { from: 'user', text: t }, { from: 'ai', text: reply.text + (reply.action ? `\n\n[action: ${reply.action.type}]` : '') + (reply.chips ? `\n[chips: ${reply.chips.join(' | ')}]` : '') }]);
    setTestState(state);
    setTestInput('');
  };

  const convs = db.ai.conversations.filter((c) => outcome === 'All' || c.outcome === outcome);

  return (
    <>
      <PageHeader
        title="AI assistant"
        subtitle="Configure the website’s inquiry assistant. It answers only from your services, packages, FAQs and business details."
        actions={
          <>
            <SimBadge>Demo engine</SimBadge>
            {tab !== 'history' && tab !== 'test' && (
              <>
                <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={!dirty} onClick={() => setA(current)}>
                  Discard
                </Button>
                <Button variant="gold" icon={<Save className="h-4 w-4" />} disabled={!dirty} onClick={save}>
                  Save
                </Button>
              </>
            )}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'behaviour', label: 'Behaviour' },
          { value: 'faqs', label: 'FAQs', count: a.faqs.length },
          { value: 'test', label: 'Test console' },
          { value: 'history', label: 'Conversation history', count: db.ai.conversations.length },
        ]}
      />

      {tab === 'behaviour' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader title="Assistant" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Toggle checked={a.enabled} onChange={(v) => set('enabled', v)} label="Enable AI assistant on the website" description="When off, the chat widget offers live chat with your team only" />
              </div>
              <Field label="Assistant name">
                <Input value={a.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Response tone">
                <Select value={a.tone} onChange={(e) => set('tone', e.target.value as A['tone'])}>
                  <option>Professional</option>
                  <option>Friendly</option>
                  <option>Concise</option>
                </Select>
              </Field>
              <Field label="Greeting message" className="sm:col-span-2">
                <Textarea rows={3} value={a.greeting} onChange={(e) => set('greeting', e.target.value)} />
              </Field>
              <Field label="Fallback when it can’t answer" className="sm:col-span-2" hint="The assistant never guesses — it says this and offers a human">
                <Textarea rows={2} value={a.fallbackMessage} onChange={(e) => set('fallbackMessage', e.target.value)} />
              </Field>
              <Field label="Business information for the assistant" className="sm:col-span-2" hint="Service area, policies and anything else it may tell visitors">
                <Textarea rows={3} value={a.businessContext} onChange={(e) => set('businessContext', e.target.value)} />
              </Field>
            </div>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Lead capture & pricing" />
              <div className="space-y-4 p-5">
                <Toggle checked={a.collectLeads} onChange={(v) => set('collectLeads', v)} label="Collect quotation requests in chat" description="Creates an inquiry with source “AI Assistant”" />
                <Toggle checked={a.showStartingPrices} onChange={(v) => set('showStartingPrices', v)} label="Mention published starting prices" description="Only prices shown on service pages; always says final price needs a quotation" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Human handoff" />
              <div className="space-y-4 p-5">
                <Field label="Handoff behaviour">
                  <Select value={a.handoffMode} onChange={(e) => set('handoffMode', e.target.value as A['handoffMode'])}>
                    <option value="offer">Offer a person when it can’t answer</option>
                    <option value="after_misses">Automatically transfer after unanswered questions</option>
                    <option value="always_available">Always show “Talk to a person”</option>
                  </Select>
                </Field>
                {a.handoffMode === 'after_misses' && (
                  <Field label="Unanswered questions before transfer">
                    <Input type="number" min={1} max={5} value={a.missesBeforeHandoff} onChange={(e) => set('missesBeforeHandoff', Math.max(1, Number(e.target.value)))} />
                  </Field>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <ShieldAlert className="h-4 w-4 text-gold-300" /> Guardrails
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-400">
                <li>Never invents prices, discounts, timelines or capabilities.</li>
                <li>Knowledge sources: {db.services.filter((s) => s.status === 'published').length} published services, {a.faqs.filter((f) => f.enabled).length} FAQs, business settings.</li>
                <li>Production: Claude API called from a secure server function; API key stored as a server secret, never in the website code.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === 'faqs' && (
        <Card>
          <CardHeader
            title="Frequently asked questions"
            subtitle="Matched by keywords in the visitor's message"
            action={
              <Button size="sm" variant="gold" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFaq({ id: uid('faq_'), question: '', answer: '', keywords: [], enabled: true })}>
                Add FAQ
              </Button>
            }
          />
          <ul className="divide-y divide-white/[0.05]">
            {a.faqs.map((f) => (
              <li key={f.id} className="flex items-start gap-4 px-5 py-4">
                <div className="w-12 pt-0.5">
                  <Toggle checked={f.enabled} onChange={(v) => set('faqs', a.faqs.map((x) => (x.id === f.id ? { ...x, enabled: v } : x)))} />
                </div>
                <button type="button" onClick={() => setFaq(structuredClone(f))} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-slate-100">{f.question}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{f.answer}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.keywords.map((k) => (
                      <Badge key={k} tone="slate">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </button>
                <IconButton label="Delete FAQ" onClick={() => set('faqs', a.faqs.filter((x) => x.id !== f.id))} className="hover:text-rose-300">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'test' && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader
            title="Test console"
            subtitle="Try questions against your current (unsaved) settings. Nothing is saved or submitted."
            action={
              <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => (setTestMsgs([]), setTestState(initialAIState()))}>
                Reset
              </Button>
            }
          />
          <div className="h-[420px] space-y-3 overflow-y-auto p-5">
            <AIBubble from="ai" text={greet(testDb).text} />
            {testMsgs.map((m, i) => (
              <AIBubble key={i} from={m.from} text={m.text} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-5 pt-3">
            {['How much is a 4 camera CCTV?', 'Do you fix iPhones?', 'I need load balancing for 2 ISPs', 'Do you offer free inspection?', 'Request a quotation'].map((s) => (
              <button key={s} type="button" onClick={() => runTest(s)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:border-gold-400/40 hover:text-gold-100">
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              runTest(testInput);
            }}
          >
            <Input value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="Ask something a visitor might ask…" />
            <Button type="submit" variant="gold" icon={<Send className="h-4 w-4" />}>
              Send
            </Button>
          </form>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <div className="border-b border-white/[0.06] p-4">
            <Tabs value={outcome} onChange={setOutcome} tabs={['All', 'Answered', 'Lead captured', 'Handed off', 'Abandoned'].map((o) => ({ value: o, label: o, count: o === 'All' ? db.ai.conversations.length : db.ai.conversations.filter((c) => c.outcome === o).length }))} />
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {convs.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setView(c)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.03]">
                  <Bot className="h-5 w-5 text-gold-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-200">{c.visitor}</span>
                    <span className="block truncate text-xs text-slate-500">{c.messages.find((m) => m.from === 'user')?.text ?? '—'}</span>
                  </span>
                  {c.suggestedService && <Badge tone="slate">{c.suggestedService}</Badge>}
                  <Badge tone={c.outcome === 'Lead captured' ? 'green' : c.outcome === 'Handed off' ? 'violet' : 'slate'}>{c.outcome}</Badge>
                  <span className="w-20 text-right text-xs text-slate-500">{timeAgo(c.startedAt)}</span>
                </button>
              </li>
            ))}
            {!convs.length && <li className="p-8 text-center text-sm text-slate-500">No conversations yet — try the assistant on the website.</li>}
          </ul>
        </Card>
      )}

      {faq && (
        <Modal
          open
          onClose={() => setFaq(null)}
          title={a.faqs.some((f) => f.id === faq.id) ? 'Edit FAQ' : 'New FAQ'}
          footer={
            <Button
              variant="gold"
              disabled={!faq.question.trim() || !faq.answer.trim() || !faq.keywords.length}
              onClick={() => {
                set('faqs', a.faqs.some((f) => f.id === faq.id) ? a.faqs.map((f) => (f.id === faq.id ? faq : f)) : [...a.faqs, faq]);
                setFaq(null);
                push({ tone: 'info', title: 'FAQ updated — remember to save' });
              }}
            >
              Apply
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="Question">
              <Input value={faq.question} onChange={(e) => setFaq({ ...faq, question: e.target.value })} />
            </Field>
            <Field label="Answer">
              <Textarea rows={4} value={faq.answer} onChange={(e) => setFaq({ ...faq, answer: e.target.value })} />
            </Field>
            <Field label="Trigger keywords" hint="Lower-case words or phrases that should match this FAQ">
              <ListEditor value={faq.keywords} onChange={(v) => setFaq({ ...faq, keywords: v.map((x) => x.toLowerCase()) })} placeholder="e.g. warranty" />
            </Field>
          </div>
        </Modal>
      )}
      {view && (
        <Modal open onClose={() => setView(null)} title={view.visitor} subtitle={`${fmtDateTime(view.startedAt)} · ${view.outcome}`} size="lg">
          <div className="space-y-3">
            {view.messages.map((m, i) => (
              <AIBubble key={i} from={m.from} text={m.text} />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
