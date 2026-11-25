import { Bot, Send } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Attachment, ChatMessage } from '../lib/types';
import { cx } from '../lib/utils';
import { AttachmentList, AttachmentPicker } from './ui';

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Renders a conversation. `perspective` decides which side is "me". */
export function ChatThread({ messages, perspective, className, typing }: { messages: ChatMessage[]; perspective: 'customer' | 'admin'; className?: string; typing?: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, typing]);
  let lastDay = '';
  return (
    <div className={cx('space-y-3', className)}>
      {messages.map((m) => {
        const day = dayLabel(m.at);
        const showDay = day !== lastDay;
        lastDay = day;
        if (m.from === 'system')
          return (
            <div key={m.id}>
              {showDay && <DayDivider label={day} />}
              <p className="mx-auto max-w-[90%] rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-center text-[11px] leading-relaxed text-slate-400">{m.text}</p>
            </div>
          );
        const mine = perspective === 'customer' ? m.from === 'customer' : m.from === 'admin';
        return (
          <div key={m.id}>
            {showDay && <DayDivider label={day} />}
            <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[82%]', mine && 'items-end')}>
                {!mine && <p className="mb-1 px-1 text-[10px] font-medium text-slate-500">{m.authorName}</p>}
                <div className={cx('whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed', mine ? 'rounded-br-md bg-gold-400/90 text-navy-950' : 'rounded-bl-md border border-white/[0.07] bg-navy-800 text-slate-100')}>
                  {m.text}
                  {m.attachments.length > 0 && <AttachmentList items={m.attachments} className="mt-2" />}
                </div>
                <p className={cx('mt-1 px-1 text-[10px] text-slate-500', mine && 'text-right')}>{new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gold-300" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </span>
          {typing}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-600">
      <span className="h-px flex-1 bg-white/5" />
      {label}
      <span className="h-px flex-1 bg-white/5" />
    </div>
  );
}

export function Composer({ onSend, placeholder = 'Type a message…', allowAttachments = true, disabled, extra }: { onSend: (text: string, attachments: Attachment[]) => void; placeholder?: string; allowAttachments?: boolean; disabled?: boolean; extra?: ReactNode }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const send = () => {
    const t = text.trim();
    if (!t && !files.length) return;
    onSend(t.slice(0, 4000), files);
    setText('');
    setFiles([]);
  };
  return (
    <div className="border-t border-white/[0.07] bg-navy-900/60 p-3">
      {files.length > 0 && <AttachmentList items={files} onRemove={(id) => setFiles(files.filter((f) => f.id !== id))} className="mb-2" />}
      <div className="flex items-end gap-2">
        {allowAttachments && <AttachmentPicker compact value={files} onChange={setFiles} label="Attach image or document" />}
        <textarea
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-white/10 bg-navy-950/60 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
          aria-label="Message"
        />
        {extra}
        <button type="button" onClick={send} disabled={disabled} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-sheen text-navy-950 transition hover:brightness-110 disabled:opacity-40" aria-label="Send message">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AIBubble({ from, text, children }: { from: 'ai' | 'user'; text: string; children?: ReactNode }) {
  const mine = from === 'user';
  return (
    <div className={cx('flex gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10 text-gold-200">
          <Bot className="h-4 w-4" />
        </span>
      )}
      <div className={cx('max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed', mine ? 'rounded-br-md bg-gold-400/90 text-navy-950' : 'rounded-bl-md border border-white/[0.07] bg-navy-800 text-slate-100')}>
        {text}
        {children}
      </div>
    </div>
  );
}
