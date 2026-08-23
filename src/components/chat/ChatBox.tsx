'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Trash2 } from 'lucide-react';

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
// canModerate = true for an admin viewer, who can delete either side's messages;
// an Employee viewer can only ever delete their own (handled server-side too).
export function ChatBox({
  employeeUserId,
  currentUserId,
  title,
  canModerate = false,
}: {
  employeeUserId?: string;
  currentUserId: string;
  title?: string;
  canModerate?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('Asia/Manila');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/platform-settings')
      .then((res) => res.json())
      .then((data) => data.timezone && setTimezone(data.timezone))
      .catch(() => {});
  }, []);

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

  async function remove(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistic
    const res = await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete message.');
      await load(); // roll back the optimistic removal
    }
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
            const canDelete = mine || canModerate;
            return (
              <div key={m.id} className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                {canDelete && !mine && (
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    aria-label="Delete message"
                    className="rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
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
                    {new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(m.createdAt))}
                  </div>
                </div>
                {canDelete && mine && (
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    aria-label="Delete message"
                    className="rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
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
