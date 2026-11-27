// Public (visitor-facing) operations. In LIVE mode every call goes to a
// secure database function, so visitors never read or write tables directly.
// In prototype mode the same operations run against the local sample data.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { bookAppointment as protoBook, customerSend, startConversation as protoStart, submitInquiry as protoSubmit, setQuotationStatus, projectProgress, type InquiryInput } from './actions';
import { useStore } from './store';
import { LIVE, sb } from './supabase';
import type { AIConversation, Appointment, Attachment, Conversation, DB, Milestone, Project, QuoteItem } from './types';

export interface QuoteSummary {
  id?: string;
  number: string;
  title?: string;
  expiresAt?: string;
  status?: string;
  items: QuoteItem[];
  discount: number;
  discountType: 'amount' | 'percent';
  taxRate: number;
}

/** What a customer may see about their project (no budget, notes or internal updates). */
export interface TrackView {
  id: string;
  name: string;
  trackingRef: string;
  category: string;
  description: string;
  status: Project['status'];
  startDate: string;
  targetDate: string;
  completedDate?: string;
  progressMode: Project['progressMode'];
  manualProgress: number;
  milestones: Milestone[];
  updates: { id: string; at: string; by: string; title: string; body: string; images: string[] }[];
  managerName: string | null;
  customer: { name: string; company: string };
  quotation: QuoteSummary | null;
  pendingQuotes: QuoteSummary[];
}

export type NewAppointment = Omit<Appointment, 'id' | 'ref' | 'status' | 'notes' | 'history' | 'createdAt' | 'customerId' | 'assignedTo'>;

function rpcError(e: unknown): Error {
  const msg = (e as { message?: string })?.message ?? 'Something went wrong. Please try again.';
  return new Error(msg);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw rpcError(error);
  return data as T;
}

export const trackProgress = (v: Pick<TrackView, 'progressMode' | 'manualProgress' | 'status' | 'milestones'>) => projectProgress(v as unknown as Project);

function protoTrackView(db: DB, p: Project): TrackView {
  const c = db.customers.find((x) => x.id === p.customerId);
  const q = p.quotationId ? db.quotations.find((x) => x.id === p.quotationId) : undefined;
  return {
    id: p.id,
    name: p.name,
    trackingRef: p.trackingRef,
    category: p.category,
    description: p.description,
    status: p.status,
    startDate: p.startDate,
    targetDate: p.targetDate,
    completedDate: p.completedDate,
    progressMode: p.progressMode,
    manualProgress: p.manualProgress,
    milestones: p.milestones,
    updates: p.updates.filter((u) => u.visibleToCustomer).map(({ id, at, by, title, body, images }) => ({ id, at, by, title, body, images })),
    managerName: db.users.find((u) => u.id === p.managerId)?.name ?? null,
    customer: { name: c?.name ?? '', company: c?.company ?? '' },
    quotation: q ? { number: q.number, items: q.items, discount: q.discount, discountType: q.discountType, taxRate: q.taxRate } : null,
    pendingQuotes: db.quotations
      .filter((x) => x.customerId === p.customerId && (x.status === 'Sent' || x.status === 'Viewed'))
      .map((x) => ({ id: x.id, number: x.number, title: x.title, expiresAt: x.expiresAt, status: x.status, items: x.items, discount: x.discount, discountType: x.discountType, taxRate: x.taxRate })),
  };
}

export function usePublicApi() {
  const { db, update } = useStore();

  const submitInquiry = useCallback(
    async (input: InquiryInput): Promise<{ ref: string; id: string }> => {
      if (LIVE) return rpc('submit_inquiry', { p: input });
      let out = { ref: '', id: '' };
      update((d) => {
        const inq = protoSubmit(d, input);
        out = { ref: inq.ref, id: inq.id };
      });
      return out;
    },
    [update],
  );

  const bookedSlots = useCallback(
    async (from: string, to: string): Promise<{ date: string; time: string; duration: number }[]> => {
      if (LIVE) return rpc('booked_slots', { d_from: from, d_to: to });
      return db.appointments.filter((a) => a.date >= from && a.date <= to && !['Cancelled', 'Completed'].includes(a.status)).map((a) => ({ date: a.date, time: a.time, duration: a.duration }));
    },
    [db.appointments],
  );

  const bookAppointment = useCallback(
    async (input: NewAppointment): Promise<Appointment | string> => {
      if (LIVE) {
        try {
          return await rpc<Appointment>('book_appointment', { p: input });
        } catch (e) {
          const m = (e as Error).message;
          return m.includes('SLOT_TAKEN') ? 'Sorry, that time slot was just taken. Please choose another time.' : m;
        }
      }
      let out: Appointment | string = '';
      update((d) => {
        out = protoBook(d, input);
      });
      return out;
    },
    [update],
  );

  const startConversation = useCallback(
    async (p: { name: string; email: string; phone: string; topic: string; message: string; source: Conversation['source']; transcript?: string; attachments?: Attachment[] }): Promise<Conversation> => {
      if (LIVE) return rpc('start_conversation', { p });
      let out: Conversation | null = null;
      update((d) => {
        out = protoStart(d, { name: p.name, email: p.email, phone: p.phone, topic: p.topic, firstMessage: p.message, source: p.source, transcript: p.transcript, attachments: p.attachments });
      });
      return out!;
    },
    [update],
  );

  const getConversation = useCallback(
    async (token: string, markRead = true): Promise<Conversation | null> => {
      if (LIVE) return rpc('get_conversation', { t: token, mark_read: markRead });
      const c = db.conversations.find((x) => x.token === token);
      if (markRead && c && c.customerUnread > 0)
        update((d) => {
          const x = d.conversations.find((y) => y.id === c.id);
          if (x) x.customerUnread = 0;
        });
      return c ?? null;
    },
    [db.conversations, update],
  );

  const sendMessage = useCallback(
    async (token: string, text: string, attachments: Attachment[]): Promise<Conversation | null> => {
      if (LIVE) return rpc('send_message', { t: token, msg: text, att: attachments });
      let out: Conversation | null = null;
      update((d) => {
        const c = d.conversations.find((x) => x.token === token);
        if (!c) return;
        customerSend(d, c.id, text, attachments);
        out = d.conversations.find((x) => x.token === token) ?? null;
      });
      return out;
    },
    [update],
  );

  const trackProject = useCallback(
    async (ref: string, pin: string): Promise<TrackView | null> => {
      if (LIVE) return rpc('track_project', { ref, pin });
      const p = db.projects.find((x) => x.trackingRef.toUpperCase() === ref.trim().toUpperCase() && x.accessPin === pin.trim());
      if (!p) return null;
      update((d) => {
        d.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), user: d.customers.find((c) => c.id === p.customerId)?.name ?? 'Customer', role: 'customer', action: 'Opened project tracking', target: p.trackingRef });
      });
      return protoTrackView(db, p);
    },
    [db, update],
  );

  const respondQuotation = useCallback(
    async (ref: string, pin: string, qid: string, decision: 'Approved' | 'Rejected', customerName: string): Promise<void> => {
      if (LIVE) {
        await rpc('respond_quotation', { ref, pin, qid, decision });
        return;
      }
      update((d) => setQuotationStatus(d, qid, decision, { name: customerName || 'Customer', role: 'customer' }));
    },
    [update],
  );

  const logAI = useCallback(
    (conv: AIConversation) => {
      if (LIVE) {
        sb().rpc('log_ai_conversation', { p: conv }).then(
          () => undefined,
          () => undefined,
        );
        return;
      }
      update((d) => {
        const i = d.ai.conversations.findIndex((c) => c.id === conv.id);
        if (i >= 0) {
          const prev = d.ai.conversations[i]!;
          d.ai.conversations[i] = { ...conv, startedAt: prev.startedAt, outcome: prev.outcome === 'Lead captured' || prev.outcome === 'Handed off' ? prev.outcome : conv.outcome };
        } else d.ai.conversations.unshift(conv);
      });
    },
    [update],
  );

  return useMemo(
    () => ({ submitInquiry, bookedSlots, bookAppointment, startConversation, getConversation, sendMessage, trackProject, respondQuotation, logAI }),
    [submitInquiry, bookedSlots, bookAppointment, startConversation, getConversation, sendMessage, trackProject, respondQuotation, logAI],
  );
}

/**
 * The visitor's own conversation. Prototype: read from local data.
 * LIVE: fetched through the secure function and refreshed every few seconds
 * while visible (every 30 s in the background, to keep the unread badge fresh).
 */
export function useCustomerConversation(token: string | null, visible: boolean) {
  const { db } = useStore();
  const { getConversation } = usePublicApi();
  const [live, setLive] = useState<Conversation | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!LIVE || !token) return;
    let stop = false;
    const load = () =>
      getConversation(token, visible).then(
        (c) => {
          if (stop) return;
          setLive(c);
          setMissing(!c);
        },
        () => undefined,
      );
    load();
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, visible ? 4000 : 30000);
    return () => {
      stop = true;
      window.clearInterval(iv);
    };
  }, [token, visible, getConversation]);
  const conv = LIVE ? (live && token && live.token === token ? live : null) : token ? (db.conversations.find((c) => c.token === token) ?? null) : null;
  return { conv, setConv: setLive, missing: LIVE ? missing : !!token && !conv };
}
