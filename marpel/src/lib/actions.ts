// Business workflows. Each function mutates a DB draft inside `update()`.
// Side effects (dashboard notification, simulated email, audit log) are applied
// here so every entry point — public forms, chat, AI assistant, admin screens —
// triggers the same behaviour. In production these become server-side
// functions / database triggers.

import type {
  Appointment,
  AppNotification,
  Attachment,
  Conversation,
  Customer,
  DB,
  EmailEvent,
  Inquiry,
  NotificationType,
  Project,
  Quotation,
  Role,
  User,
} from './types';
import { addDays, money, nowISO, pad, randomCode, todayYMD, uid } from './utils';

export interface Actor {
  name: string;
  role: Role | 'customer' | 'public';
}
export const PUBLIC_ACTOR: Actor = { name: 'Website visitor', role: 'public' };
export const actorOf = (u: User | null): Actor => (u ? { name: u.name, role: u.role } : PUBLIC_ACTOR);

// ── Side-effect helpers ─────────────────────────────────────────────────────

export function notify(d: DB, type: NotificationType, title: string, body: string, link: string) {
  const n: AppNotification = { id: uid('nt_'), type, title, body, link, at: nowISO(), read: false };
  d.notifications.unshift(n);
  if (d.notifications.length > 300) d.notifications.length = 300;
}

export function sendEmail(d: DB, event: EmailEvent, to: string, subject: string, body: string) {
  const enabled = d.settings.emailEvents[event] !== false;
  d.emails.unshift({ id: uid('em_'), event, to, subject, body, at: nowISO(), status: enabled ? 'Simulated' : 'Skipped (disabled)' });
  if (d.emails.length > 300) d.emails.length = 300;
}

export function audit(d: DB, actor: Actor, action: string, target: string) {
  d.audit.unshift({ id: uid('au_'), at: nowISO(), user: actor.name, role: actor.role, action, target });
  if (d.audit.length > 500) d.audit.length = 500;
}

const year = () => new Date().getFullYear();

// ── Customers ───────────────────────────────────────────────────────────────

/** Find a customer by email or create one (used by every public intake path). */
export function upsertCustomer(d: DB, p: { name: string; email: string; phone: string; company?: string; address?: string; source: string }): Customer {
  const existing = d.customers.find((c) => c.email.toLowerCase() === p.email.toLowerCase());
  if (existing) {
    if (!existing.phone && p.phone) existing.phone = p.phone;
    if (!existing.company && p.company) existing.company = p.company;
    return existing;
  }
  const c: Customer = {
    id: uid('c_'),
    name: p.name,
    company: p.company ?? '',
    email: p.email,
    phone: p.phone,
    address: p.address ?? '',
    category: p.company ? 'Small Business' : 'Individual',
    registeredAt: nowISO(),
    archived: false,
    notes: '',
    source: p.source,
    communications: [],
  };
  d.customers.push(c);
  notify(d, 'customer', 'New customer registered', `${c.name}${c.company ? ' — ' + c.company : ''}`, `/admin/customers/${c.id}`);
  sendEmail(d, 'new_customer', d.settings.adminNotificationEmail, `[New Customer] ${c.name}`, `${c.name} (${c.email}) was added to your customer database via ${p.source}.`);
  return c;
}

// ── Inquiries ───────────────────────────────────────────────────────────────

export interface InquiryInput {
  name: string;
  email: string;
  mobile: string;
  company: string;
  service: string;
  title: string;
  description: string;
  budget: string;
  schedule: string;
  attachments: Attachment[];
  source: Inquiry['source'];
}

export function submitInquiry(d: DB, input: InquiryInput): Inquiry {
  const cust = upsertCustomer(d, { name: input.name, email: input.email, phone: input.mobile, company: input.company, source: input.source });
  d.counters.inquiry += 1;
  const at = nowISO();
  const inq: Inquiry = {
    id: uid('inq_'),
    ref: `INQ-${year()}-${pad(d.counters.inquiry)}`,
    customerId: cust.id,
    ...input,
    status: 'New',
    notes: [],
    communications: [],
    history: [{ id: uid('h_'), at, by: 'System', text: `Inquiry received via ${input.source}` }],
    createdAt: at,
    updatedAt: at,
  };
  d.inquiries.push(inq);
  notify(d, 'inquiry', `New inquiry from ${inq.name}`, `${inq.title} — ${inq.service}`, `/admin/inquiries/${inq.id}`);
  sendEmail(
    d,
    'new_inquiry',
    d.settings.adminNotificationEmail,
    `[New Inquiry ${inq.ref}] ${inq.title} — ${inq.name}`,
    `A new inquiry was submitted via ${inq.source}.\n\nCustomer: ${inq.name}${inq.company ? ' (' + inq.company + ')' : ''}\nEmail: ${inq.email}\nMobile: ${inq.mobile}\nService: ${inq.service}\nBudget: ${inq.budget}\nPreferred schedule: ${inq.schedule}\n\n${inq.description}`,
  );
  sendEmail(
    d,
    'new_inquiry',
    inq.email,
    `We received your inquiry — ${inq.ref}`,
    `Hi ${inq.name.split(' ')[0]},\n\nThank you for contacting ${d.settings.businessName}. Your reference number is ${inq.ref}. Our team will review your requirements and contact you within one business day.\n\n— ${d.settings.shortName}`,
  );
  audit(d, { name: inq.name, role: 'public' }, 'Submitted inquiry', inq.ref);
  return inq;
}

export function setInquiryStatus(d: DB, inquiryId: string, status: Inquiry['status'], actor: Actor) {
  const inq = d.inquiries.find((i) => i.id === inquiryId);
  if (!inq || inq.status === status) return;
  inq.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Status changed from ${inq.status} to ${status}` });
  inq.status = status;
  inq.updatedAt = nowISO();
  audit(d, actor, `Changed inquiry status to ${status}`, inq.ref);
}

// ── Chat ────────────────────────────────────────────────────────────────────

export function startConversation(d: DB, p: { name: string; email: string; phone: string; topic: string; firstMessage?: string; source?: Conversation['source']; transcript?: string; attachments?: Attachment[] }): Conversation {
  const cust = upsertCustomer(d, { name: p.name, email: p.email, phone: p.phone, source: 'Live Chat' });
  const at = nowISO();
  const conv: Conversation = {
    id: uid('cv_'),
    token: `${randomCode(6)}-${randomCode(6)}`.toLowerCase(),
    customerName: p.name,
    email: p.email,
    phone: p.phone,
    customerId: cust.id,
    status: 'Open',
    adminUnread: 0,
    customerUnread: 0,
    messages: [],
    source: p.source ?? 'Live Chat',
    topic: p.topic || 'General question',
    createdAt: at,
    updatedAt: at,
  };
  if (p.transcript) conv.messages.push({ id: uid('m_'), from: 'system', authorName: 'System', text: p.transcript, at, attachments: [] });
  d.conversations.unshift(conv);
  if (p.firstMessage || p.attachments?.length) customerSend(d, conv.id, p.firstMessage ?? '', p.attachments ?? []);
  else notify(d, 'message', `New conversation from ${p.name}`, p.topic, `/admin/chat?c=${conv.id}`);
  return conv;
}

export function customerSend(d: DB, convId: string, text: string, attachments: Attachment[] = []) {
  const c = d.conversations.find((x) => x.id === convId);
  if (!c) return;
  c.messages.push({ id: uid('m_'), from: 'customer', authorName: c.customerName, text, at: nowISO(), attachments });
  c.adminUnread += 1;
  c.updatedAt = nowISO();
  if (c.status === 'Resolved' || c.status === 'Closed') c.status = 'Open';
  notify(d, 'message', `New message from ${c.customerName}`, text || `${attachments.length} attachment(s)`, `/admin/chat?c=${c.id}`);
  sendEmail(d, 'new_message', d.settings.adminNotificationEmail, `[New Message] ${c.customerName}`, text || '(attachment)');
}

export function adminSend(d: DB, convId: string, text: string, actor: Actor, attachments: Attachment[] = []) {
  const c = d.conversations.find((x) => x.id === convId);
  if (!c) return;
  c.messages.push({ id: uid('m_'), from: 'admin', authorName: actor.name, text, at: nowISO(), attachments });
  c.customerUnread += 1;
  c.adminUnread = 0;
  c.updatedAt = nowISO();
  if (c.status === 'Pending') c.status = 'Open';
}

// ── Quotations ──────────────────────────────────────────────────────────────

export function newQuotation(d: DB, p: { customerId: string; inquiryId?: string; title: string; serviceCategory: string; preparedBy: string }, actor: Actor): Quotation {
  d.counters.quotation += 1;
  const issued = new Date();
  const q: Quotation = {
    id: uid('q_'),
    number: `${d.settings.quotationPrefix}-${year()}-${pad(d.counters.quotation)}`,
    customerId: p.customerId,
    inquiryId: p.inquiryId,
    title: p.title,
    serviceCategory: p.serviceCategory,
    summary: '',
    issuedAt: issued.toISOString(),
    expiresAt: addDays(issued, d.settings.quotationValidityDays).toISOString(),
    items: [{ id: uid('qi_'), kind: 'Service', description: '', qty: 1, unit: 'lot', unitPrice: 0 }],
    discountType: 'percent',
    discount: 0,
    taxRate: d.settings.defaultTaxRate,
    paymentTerms: d.settings.defaultPaymentTerms,
    terms: d.settings.defaultQuotationTerms,
    notes: '',
    status: 'Draft',
    preparedBy: p.preparedBy,
    history: [{ id: uid('h_'), at: nowISO(), by: actor.name, text: 'Quotation created' }],
    createdAt: nowISO(),
  };
  d.quotations.push(q);
  if (p.inquiryId) {
    const inq = d.inquiries.find((i) => i.id === p.inquiryId);
    if (inq) {
      inq.quotationId = q.id;
      inq.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Quotation ${q.number} drafted` });
    }
  }
  audit(d, actor, 'Created quotation', q.number);
  return q;
}

export function setQuotationStatus(d: DB, qid: string, status: Quotation['status'], actor: Actor, total?: number) {
  const q = d.quotations.find((x) => x.id === qid);
  if (!q || q.status === status) return;
  q.status = status;
  const verb: Record<string, string> = {
    Sent: 'Quotation sent to customer (simulated email)',
    Viewed: 'Customer viewed quotation',
    Approved: 'Customer approved quotation',
    Rejected: 'Customer declined quotation',
    Expired: 'Quotation marked expired',
    Draft: 'Quotation reverted to draft',
  };
  q.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: verb[status] ?? status });
  const cust = d.customers.find((c) => c.id === q.customerId);
  const inq = q.inquiryId ? d.inquiries.find((i) => i.id === q.inquiryId) : undefined;
  if (status === 'Sent') {
    if (cust)
      sendEmail(
        d,
        'quotation_status',
        cust.email,
        `Quotation ${q.number}: ${q.title}`,
        `Hi ${cust.name.split(' ')[0]},\n\nPlease find attached our quotation ${q.number} for "${q.title}" amounting to ${total !== undefined ? money(total, d.settings.currencySymbol) : 'the stated total'}. It is valid until ${new Date(q.expiresAt).toDateString()}.\n\nReply to this email or message us to approve.\n\n— ${d.settings.shortName}`,
      );
    if (inq && ['New', 'Pending', 'Contacted', 'For Assessment'].includes(inq.status)) setInquiryStatus(d, inq.id, 'Quotation Sent', actor);
  }
  if (status === 'Approved' || status === 'Rejected') {
    notify(d, 'quotation', `Quotation ${status.toLowerCase()}${cust ? ' by ' + cust.name : ''}`, `${q.number} — ${q.title}`, `/admin/quotations/${q.id}`);
    sendEmail(d, 'quotation_status', d.settings.adminNotificationEmail, `[Quotation ${status}] ${q.number} — ${q.title}`, `${cust?.name ?? 'Customer'} ${status.toLowerCase()} quotation ${q.number}.`);
    if (inq) setInquiryStatus(d, inq.id, status, actor);
  }
  audit(d, actor, `Quotation status → ${status}`, q.number);
}

// ── Projects ────────────────────────────────────────────────────────────────

export function createProject(
  d: DB,
  p: { name: string; customerId: string; category: string; description: string; budget: number; managerId: string; staffIds: string[]; startDate: string; targetDate: string; quotationId?: string; inquiryId?: string; status?: Project['status'] },
  actor: Actor,
): Project {
  d.counters.project += 1;
  const stages = d.stageTemplates[p.category] ?? ['Planning', 'Execution', 'Testing', 'Handover'];
  const start = new Date(p.startDate);
  const target = new Date(p.targetDate);
  const span = Math.max(1, (target.getTime() - start.getTime()) / 864e5);
  const proj: Project = {
    id: uid('prj_'),
    code: `PRJ-${year()}-${pad(d.counters.project, 3)}`,
    trackingRef: `MTN-${randomCode(4)}-${randomCode(4)}`,
    accessPin: String(100000 + Math.floor(Math.random() * 900000)),
    name: p.name,
    customerId: p.customerId,
    quotationId: p.quotationId,
    inquiryId: p.inquiryId,
    category: p.category,
    description: p.description,
    startDate: p.startDate,
    targetDate: p.targetDate,
    budget: p.budget,
    recordedRevenue: 0,
    managerId: p.managerId,
    staffIds: p.staffIds,
    status: p.status ?? 'Approved',
    progressMode: 'auto',
    manualProgress: 0,
    milestones: stages.map((name, i) => ({ id: uid('ms_'), name, status: i === 0 ? 'active' : 'pending', dueDate: todayYMD(addDays(start, Math.round(((i + 1) / stages.length) * span))) })),
    notes: '',
    attachments: [],
    updates: [],
    activity: [{ id: uid('h_'), at: nowISO(), by: actor.name, text: 'Project created' }],
    createdAt: nowISO(),
  };
  d.projects.push(proj);
  if (p.quotationId) {
    const q = d.quotations.find((x) => x.id === p.quotationId);
    if (q) {
      q.projectId = proj.id;
      q.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Converted to project ${proj.code}` });
    }
  }
  if (p.inquiryId) {
    const inq = d.inquiries.find((x) => x.id === p.inquiryId);
    if (inq) {
      inq.projectId = proj.id;
      inq.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Converted to project ${proj.code}` });
      if (inq.status !== 'In Progress') {
        inq.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Status changed from ${inq.status} to In Progress` });
        inq.status = 'In Progress';
      }
    }
  }
  notify(d, 'project', `Project created: ${proj.name}`, `${proj.code} · tracking ${proj.trackingRef}`, `/admin/projects/${proj.id}`);
  audit(d, actor, 'Created project', proj.code);
  return proj;
}

export function projectProgress(p: Project) {
  if (p.progressMode === 'manual') return p.manualProgress;
  if (p.status === 'Completed') return 100;
  const total = p.milestones.length || 1;
  const done = p.milestones.filter((m) => m.status === 'done').length;
  const active = p.milestones.some((m) => m.status === 'active') ? 0.5 : 0;
  return Math.round(((done + active) / total) * 100);
}

export function postProjectUpdate(d: DB, projectId: string, u: { title: string; body: string; images: string[]; visibleToCustomer: boolean }, actor: Actor) {
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return;
  p.updates.unshift({ id: uid('pu_'), at: nowISO(), by: actor.name, ...u });
  p.activity.unshift({ id: uid('h_'), at: nowISO(), by: actor.name, text: `Posted update "${u.title}"${u.visibleToCustomer ? ' (visible to customer)' : ' (internal)'}` });
  if (u.visibleToCustomer) {
    const c = d.customers.find((x) => x.id === p.customerId);
    if (c)
      sendEmail(
        d,
        'project_update',
        c.email,
        `Project update: ${u.title}`,
        `Hello ${c.name.split(' ')[0]},\n\nA new update was posted to your project "${p.name}".\n\n${u.body}\n\nTrack your project anytime with reference ${p.trackingRef}.\n\n— ${d.settings.shortName}`,
      );
  }
  notify(d, 'project', 'Project update posted', `${u.title} — ${p.name}`, `/admin/projects/${p.id}`);
  audit(d, actor, 'Posted project update', p.name);
}

// ── Appointments ────────────────────────────────────────────────────────────

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Double-booking guard: a slot is taken when overlapping active bookings reach the per-slot limit. */
export function slotTaken(d: DB, date: string, time: string, duration: number, ignoreId?: string) {
  const s = toMin(time);
  const e = s + duration;
  const overlapping = d.appointments.filter((a) => a.id !== ignoreId && a.date === date && !['Cancelled', 'Completed'].includes(a.status) && toMin(a.time) < e && toMin(a.time) + a.duration > s);
  return overlapping.length >= d.availability.maxPerSlot;
}

export function bookAppointment(d: DB, input: Omit<Appointment, 'id' | 'ref' | 'status' | 'notes' | 'history' | 'createdAt' | 'customerId' | 'assignedTo'>): Appointment | string {
  if (slotTaken(d, input.date, input.time, input.duration)) return 'Sorry, that time slot was just taken. Please choose another time.';
  const cust = upsertCustomer(d, { name: input.name, email: input.email, phone: input.mobile, source: 'Booking Form' });
  d.counters.appointment += 1;
  const a: Appointment = {
    ...input,
    id: uid('ap_'),
    ref: `APT-${year()}-${pad(d.counters.appointment)}`,
    customerId: cust.id,
    status: 'Pending',
    notes: [],
    history: [{ id: uid('h_'), at: nowISO(), by: 'System', text: 'Booking submitted online' }],
    createdAt: nowISO(),
  };
  d.appointments.push(a);
  notify(d, 'appointment', `New booking: ${a.type}`, `${a.name} — ${a.date} ${a.time}`, `/admin/appointments?a=${a.id}`);
  sendEmail(d, 'appointment_request', d.settings.adminNotificationEmail, `[Appointment Request ${a.ref}] ${a.type} — ${a.name}`, `${a.name} requested ${a.type} on ${a.date} at ${a.time}.\nLocation: ${a.location}\n\n${a.description}`);
  sendEmail(d, 'appointment_request', a.email, `Booking received — ${a.ref}`, `Hi ${a.name.split(' ')[0]},\n\nWe received your ${a.type} request for ${a.date} at ${a.time}. We will confirm your schedule shortly.\n\n— ${d.settings.shortName}`);
  audit(d, { name: a.name, role: 'public' }, 'Booked appointment', a.ref);
  return a;
}

export function setAppointmentStatus(d: DB, apId: string, status: Appointment['status'], actor: Actor, extra?: { date?: string; time?: string }) {
  const a = d.appointments.find((x) => x.id === apId);
  if (!a) return;
  const prev = `${a.date} ${a.time}`;
  if (extra?.date) a.date = extra.date;
  if (extra?.time) a.time = extra.time;
  a.history.push({ id: uid('h_'), at: nowISO(), by: actor.name, text: status === 'Rescheduled' ? `Rescheduled from ${prev} to ${a.date} ${a.time}` : `Status changed to ${status}` });
  a.status = status;
  if (status === 'Confirmed' || status === 'Rescheduled' || status === 'Cancelled') {
    sendEmail(
      d,
      'appointment_confirmation',
      a.email,
      `Your ${a.type} is ${status.toLowerCase()} — ${a.ref}`,
      `Hi ${a.name.split(' ')[0]},\n\nYour ${a.type} (${a.ref}) is ${status.toLowerCase()}${status !== 'Cancelled' ? ` for ${a.date} at ${a.time}` : ''}.\n\n— ${d.settings.shortName}`,
    );
    if (status === 'Confirmed') notify(d, 'appointment', 'Appointment confirmed', `${a.type} — ${a.name}, ${a.date} ${a.time}`, `/admin/appointments?a=${a.id}`);
  }
  audit(d, actor, `Appointment ${status.toLowerCase()}`, a.ref);
}
