// ─────────────────────────────────────────────────────────────────────────────
// DEMO AI ASSISTANT — rule-based, runs entirely in the browser.
//
// It answers ONLY from administrator-managed data: services, packages, FAQs,
// business settings and the "business context" note. It never invents prices,
// capabilities or promises; anything it can't match is offered for handoff.
//
// PRODUCTION: replace `respond()` with a call to a server-side endpoint
// (e.g. Supabase Edge Function) that calls the Claude API with the same
// knowledge base as a system prompt + tools for lead capture and handoff.
// The API key must live only on the server — never in this frontend bundle.
// ─────────────────────────────────────────────────────────────────────────────

import type { DB, Service } from './types';
import { isEmail, isPhone, money } from './utils';

export type LeadField = 'name' | 'email' | 'mobile' | 'service' | 'description' | 'budget';

export interface AIState {
  mode: 'chat' | 'lead' | 'confirm' | 'done';
  field?: LeadField;
  lead: Partial<Record<LeadField, string>>;
  misses: number;
  suggested?: string;
}

export type AIAction = { type: 'handoff' } | { type: 'submit_lead' } | { type: 'link'; to: string; label: string };

export interface AIReply {
  text: string;
  chips?: string[];
  action?: AIAction;
  links?: { to: string; label: string }[];
}

export const initialAIState = (): AIState => ({ mode: 'chat', lead: {}, misses: 0 });

const SERVICE_KEYWORDS: Record<string, string[]> = {
  'website-development': ['website', 'web site', 'webpage', 'web page', 'landing page', 'e-commerce', 'ecommerce', 'online store', 'shop online', 'domain', 'hosting', 'seo', 'redesign', 'wordpress'],
  'software-development': ['software', 'system', 'pos', 'point of sale', 'inventory', 'crm', 'payroll', 'hr ', 'human resource', 'app', 'application', 'automation', 'billing', 'database', 'management system', 'barcode'],
  'cctv-security-systems': ['cctv', 'camera', 'cameras', 'surveillance', 'dvr', 'nvr', 'security', 'ip cam', 'remote viewing', 'monitoring cam'],
  'mikrotik-network-solutions': ['mikrotik', 'load balanc', 'failover', 'fail over', 'hotspot', 'piso', 'vendo', 'vlan', 'vpn', 'bandwidth', 'router', 'isp', 'firewall', 'two internet', '2 internet', 'dual isp', 'combine internet'],
  'it-infrastructure-technical-services': ['lan', 'cabling', 'cable', 'wifi', 'wi-fi', 'access point', 'server', 'nas', 'computer', 'pc ', 'laptop', 'troubleshoot', 'rack', 'repair', 'switch', 'slow internet', 'technical support', 'tech support', 'printer'],
};

const BUDGETS = ['Below ₱25,000', '₱25,000 – ₱50,000', '₱50,000 – ₱100,000', '₱100,000 – ₱250,000', '₱250,000+', 'Not sure yet'];

const has = (t: string, words: string[]) =>
  words.some((w) => (w.length <= 4 ? new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t) : t.includes(w)));

function detectService(db: DB, t: string): Service | undefined {
  let best: { s: Service; score: number } | undefined;
  for (const s of db.services.filter((x) => x.status === 'published')) {
    const kws = SERVICE_KEYWORDS[s.slug] ?? [s.name.toLowerCase()];
    const score = kws.reduce((n, k) => n + (has(t, [k.trim()]) ? k.length : 0), 0) + (t.includes(s.name.toLowerCase()) ? 20 : 0);
    if (score > 0 && (!best || score > best.score)) best = { s, score };
  }
  return best?.s;
}

function matchFAQ(db: DB, t: string) {
  let best: { a: string; score: number } | undefined;
  for (const f of db.ai.faqs.filter((x) => x.enabled)) {
    const score = f.keywords.reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 + k.length / 10 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { a: f.answer, score };
  }
  return best && best.score >= 1 ? best.a : undefined;
}

function tone(db: DB, text: string) {
  if (db.ai.tone === 'Professional') return text.replace(/!/g, '.');
  return text;
}

function priceLine(db: DB, s: Service) {
  if (!db.ai.showStartingPrices || !s.showPrice) return 'Pricing depends on your requirements, so our team prepares a written quotation after a quick assessment.';
  const priced = s.packages.filter((p) => p.price !== null);
  if (!priced.length) return 'Pricing is determined after assessment and confirmed in a written quotation.';
  const lines = priced.map((p) => `• ${p.name}: ${money(p.price, db.settings.currencySymbol, 0)} (${p.priceNote})`).join('\n');
  return `These are our published starting prices for ${s.name}:\n${lines}\n\nFinal pricing always depends on your site and requirements and is confirmed in a written quotation — I can't give an exact quote here.`;
}

const LEAD_QUESTIONS: Record<LeadField, string> = {
  name: 'Great — let’s prepare your quotation request. What is your full name?',
  email: 'Thanks! What email address should we send the quotation to?',
  mobile: 'And your mobile number, so our team can reach you?',
  service: 'Which service is this for?',
  description: 'Please describe your project — what do you need, where is it, and anything we should know (number of cameras, pages, users, etc.)?',
  budget: 'Do you have an estimated budget range?',
};
const ORDER: LeadField[] = ['name', 'email', 'mobile', 'service', 'description', 'budget'];

function nextField(st: AIState): LeadField | undefined {
  return ORDER.find((f) => !st.lead[f]);
}

function askNext(db: DB, st: AIState): AIReply {
  const f = nextField(st);
  if (!f) {
    st.mode = 'confirm';
    const l = st.lead;
    return {
      text: `Here’s your quotation request:\n\n• Name: ${l.name}\n• Email: ${l.email}\n• Mobile: ${l.mobile}\n• Service: ${l.service}\n• Budget: ${l.budget}\n• Details: ${l.description}\n\nShall I submit this to our team?`,
      chips: ['Submit request', 'Start over', 'Cancel'],
    };
  }
  st.mode = 'lead';
  st.field = f;
  if (f === 'service') return { text: LEAD_QUESTIONS.service, chips: db.services.filter((s) => s.status === 'published').map((s) => s.name) };
  if (f === 'budget') return { text: LEAD_QUESTIONS.budget, chips: BUDGETS };
  return { text: LEAD_QUESTIONS[f], chips: ['Cancel'] };
}

export function greet(db: DB): AIReply {
  return {
    text: db.ai.greeting,
    chips: ['What services do you offer?', 'I need CCTV', 'Request a quotation', 'Book a consultation', 'Talk to a person'],
  };
}

export function respond(db: DB, prev: AIState, input: string): { reply: AIReply; state: AIState } {
  const st: AIState = structuredClone(prev);
  const raw = input.trim();
  const t = raw.toLowerCase();

  // Universal escape hatches
  if (has(t, ['talk to a person', 'human', 'real person', 'agent', 'staff', 'representative', 'talk to someone', 'customer service'])) {
    return { reply: { text: 'Of course — I’ll connect you with our team. Please share your contact details so they can reply even if you leave this page.', action: { type: 'handoff' } }, state: { ...st, mode: 'chat' } };
  }

  // ── Lead capture flow ──
  if (st.mode === 'confirm') {
    if (t.startsWith('submit') || t === 'yes' || t === 'ok' || t === 'sure') {
      st.mode = 'done';
      return { reply: { text: 'Submitting your request…', action: { type: 'submit_lead' } }, state: st };
    }
    if (t.startsWith('start over')) {
      st.lead = {};
      return { reply: askNext(db, st), state: st };
    }
    st.mode = 'chat';
    st.lead = {};
    return { reply: { text: 'No problem — I’ve cancelled the request. Anything else I can help with?' }, state: st };
  }

  if (st.mode === 'lead' && st.field) {
    if (t === 'cancel') {
      st.mode = 'chat';
      st.field = undefined;
      return { reply: { text: 'Okay, cancelled. Feel free to ask me anything else about our services.' }, state: st };
    }
    const f = st.field;
    if (f === 'email' && !isEmail(raw)) return { reply: { text: 'That doesn’t look like a valid email address. Could you check it?', chips: ['Cancel'] }, state: st };
    if (f === 'mobile' && !isPhone(raw)) return { reply: { text: 'Please enter a valid mobile number (e.g. +63 917 123 4567).', chips: ['Cancel'] }, state: st };
    if (f === 'name' && raw.length < 2) return { reply: { text: 'Could you share your full name?', chips: ['Cancel'] }, state: st };
    if (f === 'description' && raw.length < 10) return { reply: { text: 'Could you add a bit more detail? It helps our team prepare an accurate quotation.', chips: ['Cancel'] }, state: st };
    if (f === 'service') {
      const s = db.services.find((x) => x.name.toLowerCase() === t) ?? detectService(db, t);
      st.lead.service = s?.name ?? raw;
    } else {
      st.lead[f] = raw;
    }
    return { reply: askNext(db, st), state: st };
  }

  // ── Normal chat ──
  const service = detectService(db, t);
  if (service) st.suggested = service.name;

  if (has(t, ['quotation', 'quote', 'estimate', 'proposal']) && !has(t, ['how much'])) {
    if (!db.ai.collectLeads) return { reply: { text: 'You can request a detailed quotation using our quotation form.', links: [{ to: `/quote${service ? '?service=' + service.slug : ''}`, label: 'Open quotation form' }] }, state: st };
    if (st.suggested) st.lead.service = st.suggested;
    return { reply: askNext(db, st), state: st };
  }

  if (has(t, ['how much', 'price', 'pricing', 'cost', 'rate', 'magkano', 'budget', 'package'])) {
    const s = service ?? db.services.find((x) => x.name === st.suggested);
    if (!s)
      return {
        reply: { text: 'Pricing depends on the service and your requirements. Which service are you asking about?', chips: db.services.filter((x) => x.status === 'published').map((x) => x.name) },
        state: st,
      };
    return { reply: { text: tone(db, priceLine(db, s)), chips: ['Request a quotation', 'Book a consultation', 'Talk to a person'] }, state: st };
  }

  if (has(t, ['book', 'schedule', 'appointment', 'consultation', 'meeting', 'visit']) && !matchFAQ(db, t)?.includes('free')) {
    return {
      reply: { text: 'You can book a consultation, site inspection or technical support visit online. Pick a date and time that works for you and our team will confirm.', links: [{ to: '/book', label: 'Book a consultation' }] },
      state: st,
    };
  }

  if (has(t, ['track', 'status of my', 'my project', 'progress'])) {
    return { reply: { text: 'You can check your project’s milestones and updates on our Track Project page using your tracking reference and access PIN.', links: [{ to: '/track', label: 'Track my project' }] }, state: st };
  }

  const faq = matchFAQ(db, t);
  if (faq) return { reply: { text: tone(db, faq), chips: ['Request a quotation', 'Book a consultation'] }, state: { ...st, misses: 0 } };

  if (has(t, ['hours', 'open today', 'are you open', 'what time', 'closing time', 'opening'])) {
    const hrs = db.settings.hours.map((h) => `• ${h.day}: ${h.closed ? 'Closed' : `${h.open}–${h.close}`}`).join('\n');
    return { reply: { text: `Our operating hours:\n${hrs}` }, state: st };
  }
  if (has(t, ['your address', 'office address', 'where are you', 'where is your office', 'located', 'what city', 'location'])) {
    return { reply: { text: `We’re located at ${db.settings.address}, ${db.settings.city}.`, links: [{ to: '/contact', label: 'View contact page' }] }, state: st };
  }
  if (has(t, ['contact', 'phone number', 'your number', 'mobile number', 'your email', 'email address', 'call you', 'reach you', 'landline'])) {
    return { reply: { text: `You can reach us at ${db.settings.phone} / ${db.settings.mobile} or ${db.settings.email}.`, links: [{ to: '/contact', label: 'Contact page' }] }, state: st };
  }

  if (has(t, ['services', 'what do you do', 'what do you offer', 'offer'])) {
    const list = db.services
      .filter((s) => s.status === 'published')
      .map((s) => `• ${s.name} — ${s.short}`)
      .join('\n');
    return { reply: { text: `Here’s what we do:\n${list}\n\nWhich one are you interested in?`, chips: db.services.filter((s) => s.status === 'published').map((s) => s.name) }, state: st };
  }

  if (service) {
    const intro = db.ai.tone === 'Concise' ? service.short : `${service.short}\n\n${service.description}`;
    const offerings = service.offerings.slice(0, 6).map((o) => `• ${o}`).join('\n');
    return {
      reply: {
        text: tone(db, `${db.ai.tone === 'Friendly' ? 'Great question! ' : ''}That falls under our ${service.name} service.\n\n${intro}\n\nWe handle:\n${offerings}\n\nWould you like me to prepare a quotation request or book a consultation?`),
        chips: ['Request a quotation', `How much is ${service.name}?`, 'Book a consultation'],
        links: [{ to: `/services/${service.slug}`, label: `View ${service.name}` }],
      },
      state: { ...st, misses: 0 },
    };
  }

  if (has(t, ['hi', 'hello', 'good morning', 'good afternoon', 'good evening', 'hey', 'kumusta'])) {
    return { reply: greet(db), state: st };
  }
  if (has(t, ['thank', 'salamat', 'ty'])) return { reply: { text: 'You’re welcome! Is there anything else I can help you with?' }, state: st };

  // Unknown → never guess.
  st.misses += 1;
  const autoHandoff = db.ai.handoffMode === 'after_misses' && st.misses >= db.ai.missesBeforeHandoff;
  return {
    reply: {
      text: autoHandoff ? `${db.ai.fallbackMessage}\n\nLet me connect you with our team now.` : db.ai.fallbackMessage,
      chips: autoHandoff ? undefined : ['Talk to a person', 'What services do you offer?'],
      action: autoHandoff ? { type: 'handoff' } : undefined,
    },
    state: st,
  };
}
