'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send } from 'lucide-react';

interface ChatMessageItem {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { firstName: string; lastName: string; role: string };
}

// employeeUserId omitted = the caller's own thread (Employee use). Passed = an
// admin opening a specific employee's thread. Polls every few seconds rather than
// using a websocket — simple, and fine for a low-volume internal help-desk chat.
export function ChatBox({ employeeUserId, currentUserId, title }: { employeeUserId?: string; currentUserId: string; title?: string }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const url = employeeUserId ? `/api/chat/messages?employeeUserId=${employeeUserId}` : '/api/chat/messages';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }, [employeeUserId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeUserId, body: trimmed }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not send message.');
      return;
    }
    setText('');
    await load();
  }

  return (
    <div className="card flex h-[520px] flex-col overflow-hidden">
      {title && <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">{title}</div>}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {!mine && (
                    <div className="mb-0.5 text-[11px] font-semibold opacity-70">
                      {m.sender.firstName} {m.sender.lastName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                    {new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(m.createdAt))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4 pb-2 text-xs text-red-600">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="input flex-1"
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn-primary px-3.5">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
