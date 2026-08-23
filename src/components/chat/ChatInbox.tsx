'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChatBox } from './ChatBox';
import { cn, roleLabel } from '@/lib/utils';

interface Contact {
  userId: string;
  name: string;
  role: string;
  companyName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

// Used by every role — Employee, Company Admin, HR Admin, IT Admin, Super Admin —
// each just sees a different contact list (see contactsWhereClause on the server).
export function ChatInbox({ currentUserId }: { currentUserId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const res = await fetch('/api/chat/contacts');
    if (res.ok) {
      const data = await res.json();
      setContacts(data.contacts ?? []);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
    const t = setInterval(() => void loadContacts(), 5000);
    return () => clearInterval(t);
  }, [loadContacts]);

  useEffect(() => {
    if (!selected && contacts.length > 0) setSelected(contacts[0]!.userId);
  }, [contacts, selected]);

  const activeContact = contacts.find((c) => c.userId === selected);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card flex h-[520px] flex-col overflow-hidden lg:col-span-1">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Contacts</div>
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No one to chat with yet.</p>
          ) : (
            contacts.map((c) => (
              <button
                key={c.userId}
                type="button"
                onClick={() => setSelected(c.userId)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50',
                  c.userId === selected && 'bg-brand-50',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {roleLabel(c.role)}
                    {c.companyName && ` · ${c.companyName}`}
                    {c.lastMessage && ` — ${c.lastMessage}`}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {activeContact ? (
          <ChatBox
            key={activeContact.userId}
            recipientId={activeContact.userId}
            currentUserId={currentUserId}
            title={`${activeContact.name} · ${roleLabel(activeContact.role)}`}
          />
        ) : (
          <div className="card flex h-[520px] items-center justify-center text-sm text-slate-500">
            Select a contact to start chatting.
          </div>
        )}
      </div>
    </div>
  );
}
