'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChatBox } from './ChatBox';
import { cn } from '@/lib/utils';

interface Thread {
  employeeUserId: string;
  name: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export function AdminChatInbox({ currentUserId }: { currentUserId: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads');
    if (res.ok) {
      const data = await res.json();
      setThreads(data.threads ?? []);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const t = setInterval(() => void loadThreads(), 5000);
    return () => clearInterval(t);
  }, [loadThreads]);

  useEffect(() => {
    if (!selected && threads.length > 0) setSelected(threads[0]!.employeeUserId);
  }, [threads, selected]);

  const activeThread = threads.find((t) => t.employeeUserId === selected);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card flex h-[520px] flex-col overflow-hidden lg:col-span-1">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Employees</div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No employees yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.employeeUserId}
                type="button"
                onClick={() => setSelected(t.employeeUserId)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50',
                  t.employeeUserId === selected && 'bg-brand-50',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{t.name}</div>
                  <div className="truncate text-xs text-slate-500">{t.lastMessage ?? 'No messages yet'}</div>
                </div>
                {t.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {t.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {activeThread ? (
          <ChatBox
            key={activeThread.employeeUserId}
            employeeUserId={activeThread.employeeUserId}
            currentUserId={currentUserId}
            title={activeThread.name}
          />
        ) : (
          <div className="card flex h-[520px] items-center justify-center text-sm text-slate-500">
            Select an employee to start chatting.
          </div>
        )}
      </div>
    </div>
  );
}
