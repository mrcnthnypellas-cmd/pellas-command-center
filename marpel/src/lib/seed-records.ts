// Realistic SAMPLE operational records (customers, inquiries, quotations,
// projects, appointments, chats). Dates are generated relative to "now" so the
// prototype always looks current. A deterministic PRNG keeps it reproducible.

import type {
  AIConversation,
  Appointment,
  AppointmentType,
  AppNotification,
  AuditEntry,
  Conversation,
  Customer,
  CustomerCategory,
  EmailLog,
  Inquiry,
  InquiryStatus,
  LeadSource,
  Milestone,
  Project,
  ProjectStatus,
  Quotation,
  QuotationStatus,
  QuoteItem,
  User,
} from './types';
import { SERVICE_NAMES, seedSettings, seedStageTemplates } from './seed-content';
import { addDays, mulberry32, pad, quoteTotals, todayYMD } from './utils';

const rnd = mulberry32(20261125);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const NOW = new Date();
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 864e5 - hours * 36e5).toISOString();
const ymd = (offset: number) => todayYMD(addDays(NOW, offset));
let seq = 0;
const id = (p: string) => `${p}${(++seq).toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;

// ── Users ───────────────────────────────────────────────────────────────────
export const seedUsers: User[] = [
  { id: 'u_owner', name: 'Marpel Owner', username: 'owner', email: 'owner@marpeltech.example', password: 'demo1234', role: 'super_admin', title: 'Founder & Managing Director', phone: '+63 917 000 0001', active: true, createdAt: ago(900) },
  { id: 'u_admin', name: 'Carla Mendoza', username: 'admin', email: 'carla@marpeltech.example', password: 'demo1234', role: 'admin', title: 'Operations Manager', phone: '+63 917 000 0002', active: true, createdAt: ago(700) },
  { id: 'u_jerome', name: 'Jerome Santos', username: 'jerome', email: 'jerome@marpeltech.example', password: 'demo1234', role: 'staff', title: 'Network Engineer', phone: '+63 917 000 0003', active: true, createdAt: ago(600) },
  { id: 'u_kevin', name: 'Kevin Ramos', username: 'kevin', email: 'kevin@marpeltech.example', password: 'demo1234', role: 'staff', title: 'CCTV & Field Technician', phone: '+63 917 000 0004', active: true, createdAt: ago(520) },
  { id: 'u_patricia', name: 'Patricia Lim', username: 'patricia', email: 'patricia@marpeltech.example', password: 'demo1234', role: 'staff', title: 'Lead Web & Software Developer', phone: '+63 917 000 0005', active: true, createdAt: ago(480) },
];

const SPECIALIST: Record<string, string> = {
  'Website Development': 'u_patricia',
  'Software Development': 'u_patricia',
  'CCTV and Security Systems': 'u_kevin',
  'MikroTik and Network Solutions': 'u_jerome',
  'IT Infrastructure and Technical Services': 'u_jerome',
};

// ── Customers ───────────────────────────────────────────────────────────────
type CSeed = [string, string, string, string, CustomerCategory, number];
const CRAFTED_CUSTOMERS: CSeed[] = [
  ['c_lito', 'Lito Fernandez', 'Fernandez Hardware & Construction Supply', 'Marikina City', 'Small Business', 320],
  ['c_grace', 'Grace Tan', 'Golden Harvest Bakeshop', 'Quezon City', 'Small Business', 300],
  ['c_ramon', 'Dr. Ramon Aquino', 'Aquino Family Dental Clinic', 'Pasig City', 'Small Business', 290],
  ['c_michelle', 'Michelle Reyes', 'Northpoint Logistics Inc.', 'Valenzuela City', 'Corporate', 260],
  ['c_paolo', 'Engr. Paolo Cruz', 'St. Benedict Academy', 'Antipolo City', 'Education', 330],
  ['c_anna', 'Anna Dizon', 'Dizon Boutique Resort', 'Nasugbu, Batangas', 'Small Business', 200],
  ['c_roberto', 'Hon. Roberto Mercado', 'Barangay San Isidro', 'Rodriguez, Rizal', 'Government', 340],
  ['c_jasmine', 'Jasmine Villareal', '', 'Taguig City', 'Individual', 12],
  ['c_mark', 'Mark Lopez', 'Lopez Auto Parts', 'San Juan City', 'Small Business', 95],
  ['c_sofia', 'Sofia Garcia', 'Brightpath Learning Center', 'Mandaluyong City', 'Education', 70],
  ['c_daniel', 'Daniel Uy', 'Uy Trading Corp.', 'Binondo, Manila', 'Corporate', 360],
  ['c_carmela', 'Atty. Carmela Santos', 'Santos Law Office', 'Makati City', 'Small Business', 110],
  ['c_victor', 'Victor Ong', 'Ong Pharmacy Group', 'Caloocan City', 'Corporate', 60],
  ['c_lea', 'Lea Bautista', 'LB Gaming & Internet Hub', 'Cainta, Rizal', 'Small Business', 4],
];

function mkCustomer(cid: string, name: string, company: string, address: string, email: string, category: CustomerCategory, daysAgo: number, source = 'Website Form'): Customer {
  return {
    id: cid,
    name,
    company,
    email,
    phone: `+63 9${int(15, 99)} ${pad(int(0, 999), 3)} ${pad(int(0, 9999), 4)}`,
    address,
    category,
    registeredAt: ago(daysAgo, int(0, 8)),
    archived: false,
    notes: '',
    source,
    communications: [],
  };
}

const customers: Customer[] = CRAFTED_CUSTOMERS.map(([cid, n, co, addr, cat, d]) => {
  const email = n.replace(/^(Dr\.|Engr\.|Hon\.|Atty\.)\s+/, '').toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.') + '@example.com';
  return mkCustomer(cid, n, co, addr + ', Philippines', email, cat, d);
});
customers.find((c) => c.id === 'c_mark')!.notes = 'Prefers Viber updates. Main contact for the inventory system project.';
customers.find((c) => c.id === 'c_victor')!.notes = 'Three branches — Caloocan main, Malabon and Navotas. Purchasing requires PO before down payment.';

// ── Historical generator ───────────────────────────────────────────────────
const FIRST = ['Joy', 'Mario', 'Kristine', 'Allan', 'Rhea', 'Jun', 'Cecilia', 'Ronald', 'Mylene', 'Arnel', 'Liza', 'Bong', 'Trisha', 'Edwin', 'Marites', 'Jayson', 'Hazel', 'Ramil', 'Nikki', 'Oscar', 'Bea', 'Gilbert', 'Camille', 'Dennis', 'Ivy', 'Rodel', 'Precious', 'Noel'];
const LAST = ['Dela Cruz', 'Reyes', 'Santos', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Gonzales', 'Ramos', 'Castillo', 'Navarro', 'Rivera', 'Domingo', 'Pascual', 'Salazar', 'Villanueva', 'Manalo', 'Aquino', 'Lim', 'Tan'];
const BIZ = ['Sari-Sari Mart', 'Dental Studio', 'Auto Supply', 'Learning Hub', 'Water Station', 'Printing Services', 'Trucking Services', 'Farm Supply', 'Milk Tea Café', 'Hardware', 'Clinic', 'Realty', 'Pharmacy', 'Bakery', 'Laundry Shop', 'Construction', 'Apartelle', 'Grill & Restobar', 'Gym & Fitness', 'Computer Shop'];
const CITIES = ['Quezon City', 'Pasig City', 'Marikina City', 'Antipolo City', 'Cainta, Rizal', 'Taytay, Rizal', 'Caloocan City', 'Makati City', 'Bacoor, Cavite', 'Santa Rosa, Laguna', 'Meycauayan, Bulacan', 'Las Piñas City', 'Parañaque City', 'Taguig City'];
const SERVICE_WEIGHTS: [string, number][] = [
  ['CCTV and Security Systems', 0.3],
  ['MikroTik and Network Solutions', 0.22],
  ['Website Development', 0.2],
  ['IT Infrastructure and Technical Services', 0.16],
  ['Software Development', 0.12],
];
const weightedService = () => {
  let r = rnd();
  for (const [s, w] of SERVICE_WEIGHTS) {
    if ((r -= w) <= 0) return s;
  }
  return SERVICE_WEIGHTS[0]![0];
};
const TITLES: Record<string, string[]> = {
  'Website Development': ['Company website', 'Website redesign', 'Online store for products', 'Booking website', 'Website maintenance'],
  'Software Development': ['POS system for store', 'Inventory system', 'Payroll system', 'Clinic management system', 'Order tracking app'],
  'CCTV and Security Systems': ['4-camera CCTV for store', '8 CCTV cameras for warehouse', 'CCTV remote viewing not working', 'Add cameras to existing DVR', 'Home CCTV installation'],
  'MikroTik and Network Solutions': ['Dual ISP load balancing', 'Hotspot vendo setup', 'MikroTik failover', 'Office VPN for branches', 'Slow network optimisation'],
  'IT Infrastructure and Technical Services': ['Office LAN cabling', 'Wi-Fi dead spots', 'NAS backup setup', 'Network rack cleanup', 'Computer repair & maintenance'],
};
const BUDGETS = ['Below ₱25,000', '₱25,000 – ₱50,000', '₱50,000 – ₱100,000', '₱100,000 – ₱250,000', '₱250,000+', 'Not sure yet'];

function quoteItemsFor(service: string, scale = 1): QuoteItem[] {
  const q = (kind: QuoteItem['kind'], description: string, qty: number, unit: string, unitPrice: number): QuoteItem => ({ id: id('qi_'), kind, description, qty, unit, unitPrice: Math.round(unitPrice * scale) });
  switch (service) {
    case 'Website Development':
      return [
        q('Service', 'Website UI/UX design and development (responsive)', 1, 'lot', 38000),
        q('Service', 'Content management setup and SEO foundation', 1, 'lot', 8000),
        q('Labor', 'Content upload and staff training (2 sessions)', 2, 'session', 2500),
        q('Service', 'Domain registration and hosting — 1 year', 1, 'year', 6500),
      ];
    case 'Software Development':
      return [
        q('Service', 'Requirements analysis and system design', 1, 'lot', 25000),
        q('Service', 'Core modules development', 1, 'lot', 120000),
        q('Labor', 'Data migration and user training', 1, 'lot', 15000),
        q('Equipment', 'Thermal receipt printer', 2, 'unit', 4500),
      ];
    case 'CCTV and Security Systems': {
      const n = pick([4, 8, 8, 16]);
      return [
        q('Equipment', '2MP/5MP IP bullet camera with night vision', n, 'unit', 3200),
        q('Equipment', `${n <= 4 ? 4 : n <= 8 ? 8 : 16}-channel NVR with 2TB surveillance HDD`, 1, 'unit', n <= 8 ? 9500 : 16500),
        q('Materials', 'Cat6 cable, PVC conduit, junction boxes and connectors', 1, 'lot', 1200 * n),
        q('Labor', 'Installation, configuration and remote viewing setup', n, 'camera', 1100),
      ];
    }
    case 'MikroTik and Network Solutions':
      return [
        q('Equipment', 'MikroTik hEX / RB5009 router', 1, 'unit', 9800),
        q('Service', 'Load balancing, failover and firewall configuration', 1, 'lot', 9000),
        q('Service', 'Bandwidth management queues and documentation', 1, 'lot', 3500),
        q('Labor', 'On-site deployment and testing', 1, 'visit', 2500),
      ];
    default:
      return [
        q('Materials', 'Cat6 UTP cable (305m box) and RJ45 keystones', 1, 'box', 7800),
        q('Equipment', '24-port managed switch', 1, 'unit', 12500),
        q('Equipment', 'Ceiling-mount Wi-Fi 6 access point', 2, 'unit', 6800),
        q('Labor', 'Cable runs, termination, labelling and testing', 12, 'run', 850),
      ];
  }
}

function milestonesFor(category: string, doneCount: number, start: Date, target: Date): Milestone[] {
  const names = seedStageTemplates[category] ?? seedStageTemplates['IT Infrastructure and Technical Services']!;
  const span = Math.max(1, (target.getTime() - start.getTime()) / 864e5);
  return names.map((name, i) => {
    const due = addDays(start, Math.round(((i + 1) / names.length) * span));
    const status: Milestone['status'] = i < doneCount ? 'done' : i === doneCount ? 'active' : 'pending';
    return { id: id('ms_'), name, status, dueDate: todayYMD(due), completedAt: status === 'done' ? addDays(due, -int(0, 2)).toISOString() : undefined };
  });
}

const trackingRef = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s = (n: number) => Array.from({ length: n }, () => A[Math.floor(rnd() * A.length)]).join('');
  return `MTN-${s(4)}-${s(4)}`;
};
const pin = () => String(int(100000, 999999));

const inquiries: Inquiry[] = [];
const quotations: Quotation[] = [];
const projects: Project[] = [];

function baseInquiry(p: Partial<Inquiry> & Pick<Inquiry, 'name' | 'email' | 'service' | 'title' | 'createdAt' | 'status'>): Inquiry {
  return {
    id: id('inq_'),
    ref: '',
    mobile: `+63 9${int(15, 99)} ${pad(int(0, 999), 3)} ${pad(int(0, 9999), 4)}`,
    company: '',
    description: '',
    budget: pick(BUDGETS),
    schedule: 'Within the month',
    attachments: [],
    notes: [],
    communications: [],
    history: [{ id: id('h_'), at: p.createdAt, by: 'System', text: `Inquiry received via ${p.source ?? 'Website Form'}` }],
    source: 'Website Form',
    updatedAt: p.createdAt,
    ...p,
  };
}

function makeQuotation(customerId: string, inquiry: Inquiry | undefined, title: string, service: string, issued: Date, status: QuotationStatus, scale = 1, preparedBy = 'u_admin'): Quotation {
  const q: Quotation = {
    id: id('q_'),
    number: '',
    customerId,
    inquiryId: inquiry?.id,
    title,
    serviceCategory: service,
    summary: `Supply, installation and configuration for: ${title}.`,
    issuedAt: issued.toISOString(),
    expiresAt: addDays(issued, seedSettings.quotationValidityDays).toISOString(),
    items: quoteItemsFor(service, scale),
    discountType: 'percent',
    discount: pick([0, 0, 5, 10]),
    taxRate: 12,
    paymentTerms: seedSettings.defaultPaymentTerms,
    terms: seedSettings.defaultQuotationTerms,
    notes: '',
    status,
    preparedBy,
    history: [{ id: id('h_'), at: issued.toISOString(), by: 'Carla Mendoza', text: 'Quotation created' }],
    createdAt: issued.toISOString(),
  };
  if (status !== 'Draft') q.history.push({ id: id('h_'), at: addDays(issued, 0).toISOString(), by: 'Carla Mendoza', text: 'Quotation sent to customer (simulated email)' });
  if (['Viewed', 'Approved', 'Rejected'].includes(status)) q.history.push({ id: id('h_'), at: addDays(issued, 1).toISOString(), by: 'Customer', text: 'Customer viewed quotation' });
  if (status === 'Approved') q.history.push({ id: id('h_'), at: addDays(issued, 3).toISOString(), by: 'Customer', text: 'Customer approved quotation' });
  if (status === 'Rejected') q.history.push({ id: id('h_'), at: addDays(issued, 4).toISOString(), by: 'Customer', text: 'Customer declined quotation' });
  if (inquiry) inquiry.quotationId = q.id;
  quotations.push(q);
  return q;
}

function makeProject(o: {
  name: string;
  customerId: string;
  category: string;
  description: string;
  start: Date;
  target: Date;
  status: ProjectStatus;
  doneStages: number;
  budget: number;
  revenue: number;
  quotation?: Quotation;
  inquiry?: Inquiry;
  completed?: Date;
  ref?: string;
  pin?: string;
}): Project {
  const mgr = 'u_admin';
  const spec = SPECIALIST[o.category] ?? 'u_jerome';
  const p: Project = {
    id: id('prj_'),
    code: '',
    trackingRef: o.ref ?? trackingRef(),
    accessPin: o.pin ?? pin(),
    name: o.name,
    customerId: o.customerId,
    quotationId: o.quotation?.id,
    inquiryId: o.inquiry?.id,
    category: o.category,
    description: o.description,
    startDate: todayYMD(o.start),
    targetDate: todayYMD(o.target),
    completedDate: o.completed ? todayYMD(o.completed) : undefined,
    budget: o.budget,
    recordedRevenue: o.revenue,
    managerId: mgr,
    staffIds: [spec],
    status: o.status,
    progressMode: 'auto',
    manualProgress: 0,
    milestones: milestonesFor(o.category, o.doneStages, o.start, o.target),
    notes: '',
    attachments: [],
    updates: [],
    activity: [{ id: id('h_'), at: o.start.toISOString(), by: 'Carla Mendoza', text: 'Project created' }],
    createdAt: o.start.toISOString(),
  };
  if (o.status === 'Completed') p.milestones.forEach((m) => { m.status = 'done'; m.completedAt ??= o.completed?.toISOString(); });
  if (o.quotation) o.quotation.projectId = p.id;
  if (o.inquiry) o.inquiry.projectId = p.id;
  projects.push(p);
  return p;
}

// Generate 12 months of history (excluding the current month's crafted records).
for (let m = 11; m >= 0; m--) {
  const monthStart = new Date(NOW.getFullYear(), NOW.getMonth() - m, 1);
  const monthEnd = m === 0 ? NOW : new Date(NOW.getFullYear(), NOW.getMonth() - m + 1, 0);
  const daysInRange = Math.max(1, Math.floor((monthEnd.getTime() - monthStart.getTime()) / 864e5));
  const count = Math.round(5 + (11 - m) * 0.55 + rnd() * 3) - (m === 0 ? 3 : 0);
  for (let k = 0; k < count; k++) {
    const created = addDays(monthStart, int(0, daysInRange));
    created.setHours(int(8, 19), int(0, 59));
    if (created > NOW) continue;
    const age = (NOW.getTime() - created.getTime()) / 864e5;
    const first = pick(FIRST);
    const last = pick(LAST);
    const service = weightedService();
    const isBiz = rnd() < 0.75;
    const company = isBiz ? `${last.split(' ').pop()} ${pick(BIZ)}` : '';
    const cust = mkCustomer(id('c_'), `${first} ${last}`, company, `${pick(CITIES)}, Philippines`, `${first}.${last.replace(/\s/g, '')}${int(1, 99)}@example.com`.toLowerCase(), isBiz ? (rnd() < 0.15 ? 'Corporate' : 'Small Business') : 'Individual', Math.floor(age), pick(['Website Form', 'Website Form', 'Referral', 'Live Chat', 'AI Assistant', 'Phone']));
    customers.push(cust);

    let status: InquiryStatus;
    const r = rnd();
    if (age > 60) status = r < 0.48 ? 'Completed' : r < 0.68 ? 'Rejected' : r < 0.8 ? 'Cancelled' : r < 0.9 ? 'Quotation Sent' : 'Contacted';
    else if (age > 20) status = r < 0.3 ? 'Completed' : r < 0.45 ? 'In Progress' : r < 0.6 ? 'Quotation Sent' : r < 0.72 ? 'Rejected' : r < 0.85 ? 'Approved' : 'Contacted';
    else status = r < 0.25 ? 'Contacted' : r < 0.45 ? 'For Assessment' : r < 0.65 ? 'Quotation Sent' : r < 0.8 ? 'Pending' : 'New';

    const title = pick(TITLES[service]!);
    const inq = baseInquiry({
      name: cust.name,
      email: cust.email,
      mobile: cust.phone,
      company,
      customerId: cust.id,
      service,
      title,
      description: `${title} for our ${company || 'home'} in ${cust.address.split(',')[0]}. Please advise on recommended setup and estimated cost.`,
      createdAt: created.toISOString(),
      updatedAt: addDays(created, int(1, 10)).toISOString(),
      status,
      source: cust.source as LeadSource,
      assignedTo: status === 'New' ? undefined : SPECIALIST[service],
    });
    inquiries.push(inq);

    const quoteDate = addDays(created, int(2, 6));
    const scale = 0.7 + rnd() * 0.9;
    if (status === 'Completed' || status === 'In Progress' || status === 'Approved') {
      const q = makeQuotation(cust.id, inq, title, service, quoteDate, 'Approved', scale);
      const total = quoteTotals(q).total;
      const start = addDays(quoteDate, int(3, 7));
      const target = addDays(start, int(10, 40));
      if (status === 'Completed') {
        const completed = target > NOW ? addDays(NOW, -int(1, 5)) : target;
        makeProject({ name: `${title} — ${company || cust.name}`, customerId: cust.id, category: service, description: inq.description, start, target, status: 'Completed', doneStages: 99, budget: Math.round(total), revenue: Math.round(total), quotation: q, inquiry: inq, completed });
      } else if (status === 'In Progress') {
        makeProject({ name: `${title} — ${company || cust.name}`, customerId: cust.id, category: service, description: inq.description, start, target: target < NOW ? addDays(NOW, int(5, 25)) : target, status: 'In Progress', doneStages: int(1, 4), budget: Math.round(total), revenue: Math.round(total * 0.5), quotation: q, inquiry: inq });
      }
    } else if (status === 'Quotation Sent') {
      makeQuotation(cust.id, inq, title, service, quoteDate, age > 35 ? 'Expired' : pick(['Sent', 'Viewed']), scale);
    } else if (status === 'Rejected' && rnd() < 0.7) {
      makeQuotation(cust.id, inq, title, service, quoteDate, 'Rejected', scale);
    }
  }
}

// ── Crafted, recent records (the ones a reviewer will click into) ───────────

const C = (cid: string) => customers.find((c) => c.id === cid)!;
function crafted(cid: string, o: Partial<Inquiry> & Pick<Inquiry, 'service' | 'title' | 'description' | 'status' | 'createdAt'>): Inquiry {
  const c = C(cid);
  const inq = baseInquiry({ name: c.name, email: c.email, mobile: c.phone, company: c.company, customerId: c.id, ...o });
  inquiries.push(inq);
  return inq;
}

// Completed showcase projects (feed revenue + portfolio)
{
  const i1 = crafted('c_grace', { service: 'Software Development', title: 'POS and inventory for 3 bakeshop branches', description: 'We have 3 branches and track stock manually. Need POS with inventory per branch, ingredient tracking and daily sales report I can see on my phone.', status: 'Completed', createdAt: ago(165), budget: '₱100,000 – ₱250,000', assignedTo: 'u_patricia' });
  const q1 = makeQuotation('c_grace', i1, 'Multi-Branch POS & Inventory System', 'Software Development', addDays(NOW, -160), 'Approved', 1.45);
  makeProject({ name: 'Multi-Branch POS & Inventory System', customerId: 'c_grace', category: 'Software Development', description: i1.description, start: addDays(NOW, -150), target: addDays(NOW, -102), completed: addDays(NOW, -103), status: 'Completed', doneStages: 99, budget: 245000, revenue: 245000, quotation: q1, inquiry: i1 });

  const i2 = crafted('c_michelle', { service: 'MikroTik and Network Solutions', title: 'Dual ISP failover for dispatch office', description: 'Our dispatch goes offline when the fiber drops. We have PLDT fiber and a Globe LTE backup. Need automatic failover and VLAN for scanners and CCTV.', status: 'Completed', createdAt: ago(170), budget: '₱50,000 – ₱100,000', assignedTo: 'u_jerome' });
  const q2 = makeQuotation('c_michelle', i2, 'Dual-ISP Failover & VLAN Segmentation', 'MikroTik and Network Solutions', addDays(NOW, -165), 'Approved', 2.1);
  makeProject({ name: 'Dual-ISP Failover & VLAN Segmentation', customerId: 'c_michelle', category: 'MikroTik and Network Solutions', description: i2.description, start: addDays(NOW, -158), target: addDays(NOW, -148), completed: addDays(NOW, -148), status: 'Completed', doneStages: 99, budget: 68000, revenue: 68000, quotation: q2, inquiry: i2 });

  const i3 = crafted('c_carmela', { service: 'IT Infrastructure and Technical Services', title: 'Server rack cleanup and NAS backup', description: 'Our network rack is a mess and we have no backup of client files. Please organize the rack and set up a NAS with automatic backup.', status: 'Completed', createdAt: ago(95), assignedTo: 'u_jerome' });
  const q3 = makeQuotation('c_carmela', i3, 'Rack Re-organization & NAS Backup', 'IT Infrastructure and Technical Services', addDays(NOW, -90), 'Approved', 1.1);
  makeProject({ name: 'Rack Re-organization & NAS Backup', customerId: 'c_carmela', category: 'IT Infrastructure and Technical Services', description: i3.description, start: addDays(NOW, -86), target: addDays(NOW, -80), completed: addDays(NOW, -82), status: 'Completed', doneStages: 99, budget: 58000, revenue: 58000, quotation: q3, inquiry: i3 });
}

// Active showcase project with full tracking data (demo login on /track)
const iMark = crafted('c_mark', { service: 'Software Development', title: 'Inventory & sales system for auto parts store', description: 'We carry 3,000+ SKUs. Need barcode-based inventory, supplier purchase orders, sales and low stock alerts. Two cashiers and one stock clerk.', status: 'In Progress', createdAt: ago(58), budget: '₱100,000 – ₱250,000', assignedTo: 'u_patricia', source: 'AI Assistant' });
const qMark = makeQuotation('c_mark', iMark, 'Inventory & Sales Management System', 'Software Development', addDays(NOW, -52), 'Approved', 1.05);
const pMark = makeProject({ name: 'Inventory & Sales Management System', customerId: 'c_mark', category: 'Software Development', description: 'Barcode-based inventory with purchase orders, POS for two cashier stations, supplier management, low-stock alerts and owner dashboard.', start: addDays(NOW, -45), target: addDays(NOW, 21), status: 'In Progress', doneStages: 3, budget: 168000, revenue: 84000, quotation: qMark, inquiry: iMark, ref: 'MTN-8K4P-2Q7D', pin: '482913' });
pMark.staffIds = ['u_patricia', 'u_jerome'];
pMark.updates = [
  { id: id('pu_'), at: ago(40), by: 'Patricia Lim', title: 'Requirements signed off', body: 'Thank you for the workshop. The requirements document covering inventory, POS, purchasing and reports is approved. We are moving to system design.', images: [], visibleToCustomer: true },
  { id: id('pu_'), at: ago(26), by: 'Patricia Lim', title: 'Screen designs approved', body: 'All 18 screens were approved including the barcode receiving screen and the owner dashboard. Development has started.', images: [], visibleToCustomer: true },
  { id: id('pu_'), at: ago(6), by: 'Patricia Lim', title: 'Inventory & purchasing modules ready for testing', body: 'Product catalog import (3,214 SKUs), stock movements, supplier purchase orders and receiving are complete. POS module is in progress. QA testing begins next week.', images: [], visibleToCustomer: true },
  { id: id('pu_'), at: ago(5), by: 'Jerome Santos', title: 'Internal: server sizing', body: 'Store LAN checked — recommend a small UPS for the POS terminals. Add to change request.', images: [], visibleToCustomer: false },
];
pMark.activity.push(
  { id: id('h_'), at: ago(40), by: 'Patricia Lim', text: 'Milestone "Requirements" completed' },
  { id: id('h_'), at: ago(26), by: 'Patricia Lim', text: 'Milestone "System Design" completed' },
  { id: id('h_'), at: ago(30), by: 'Carla Mendoza', text: 'Down payment of ₱84,000.00 recorded' },
);

const iVictor = crafted('c_victor', { service: 'CCTV and Security Systems', title: '24 cameras for 3 pharmacy branches', description: 'Need 8 cameras per branch, central viewing at the main office and 30-day recording. Cash counter must be clearly visible.', status: 'In Progress', createdAt: ago(48), budget: '₱250,000+', assignedTo: 'u_kevin' });
const qVictor = makeQuotation('c_victor', iVictor, '24-Camera Multi-Branch Surveillance', 'CCTV and Security Systems', addDays(NOW, -42), 'Approved', 1);
qVictor.items = [
  { id: id('qi_'), kind: 'Equipment', description: '4MP IP dome camera with IR (cash counter / aisles)', qty: 18, unit: 'unit', unitPrice: 3600 },
  { id: id('qi_'), kind: 'Equipment', description: '4MP IP bullet camera, outdoor (entrances)', qty: 6, unit: 'unit', unitPrice: 3900 },
  { id: id('qi_'), kind: 'Equipment', description: '8-channel PoE NVR with 4TB HDD', qty: 3, unit: 'unit', unitPrice: 14500 },
  { id: id('qi_'), kind: 'Materials', description: 'Cat6 cable, conduit, junction boxes, connectors', qty: 3, unit: 'branch', unitPrice: 9500 },
  { id: id('qi_'), kind: 'Labor', description: 'Installation, configuration and central remote viewing', qty: 24, unit: 'camera', unitPrice: 1200 },
];
const pVictor = makeProject({ name: '24-Camera Multi-Branch Surveillance', customerId: 'c_victor', category: 'CCTV and Security Systems', description: 'Eight IP cameras per branch across Caloocan, Malabon and Navotas with central viewing at the main office.', start: addDays(NOW, -35), target: addDays(NOW, 9), status: 'In Progress', doneStages: 4, budget: 0, revenue: 0, quotation: qVictor, inquiry: iVictor });
pVictor.budget = Math.round(quoteTotals(qVictor).total);
pVictor.recordedRevenue = Math.round(pVictor.budget * 0.5);
pVictor.staffIds = ['u_kevin', 'u_jerome'];
pVictor.updates = [
  { id: id('pu_'), at: ago(14), by: 'Kevin Ramos', title: 'Caloocan main branch installed', body: 'All 8 cameras installed and recording at the main branch. Cash counter coverage verified with the branch supervisor.', images: [], visibleToCustomer: true },
  { id: id('pu_'), at: ago(3), by: 'Kevin Ramos', title: 'Malabon branch installed', body: 'Malabon cameras installed. Configuration and central viewing scheduled this week. Navotas installation follows.', images: [], visibleToCustomer: true },
];

const iSofia = crafted('c_sofia', { service: 'Website Development', title: 'Learning center website with enrollment inquiry', description: 'We need a professional website showing our programs, schedules and teachers, plus an online enrollment inquiry form.', status: 'In Progress', createdAt: ago(40), budget: '₱25,000 – ₱50,000', assignedTo: 'u_patricia' });
const qSofia = makeQuotation('c_sofia', iSofia, 'Brightpath Learning Center Website', 'Website Development', addDays(NOW, -36), 'Approved', 0.85);
const pSofia = makeProject({ name: 'Brightpath Learning Center Website', customerId: 'c_sofia', category: 'Website Development', description: 'Program catalog, teacher profiles, schedules and enrollment inquiry form with CMS.', start: addDays(NOW, -30), target: addDays(NOW, 6), status: 'In Progress', doneStages: 2, budget: 0, revenue: 0, quotation: qSofia, inquiry: iSofia, ref: 'MTN-W3BP-7LCX', pin: '135790' });
pSofia.budget = Math.round(quoteTotals(qSofia).total);
pSofia.recordedRevenue = Math.round(pSofia.budget * 0.5);
pSofia.updates = [{ id: id('pu_'), at: ago(9), by: 'Patricia Lim', title: 'Homepage design approved', body: 'Homepage and program page designs approved. Building the CMS and enrollment form now.', images: [], visibleToCustomer: true }];

const iDaniel = crafted('c_daniel', { service: 'MikroTik and Network Solutions', title: 'VLAN segmentation and site-to-site VPN', description: 'Warehouse and office need separate VLANs, and we want a VPN to our Cavite warehouse.', status: 'Approved', createdAt: ago(16), budget: '₱100,000 – ₱250,000', assignedTo: 'u_jerome' });
const qDaniel = makeQuotation('c_daniel', iDaniel, 'VLAN Segmentation & Site-to-Site VPN', 'MikroTik and Network Solutions', addDays(NOW, -12), 'Approved', 2.6);
const pDaniel = makeProject({ name: 'VLAN Segmentation & Site-to-Site VPN', customerId: 'c_daniel', category: 'MikroTik and Network Solutions', description: iDaniel.description, start: addDays(NOW, 3), target: addDays(NOW, 24), status: 'Planning', doneStages: 0, budget: 0, revenue: 0, quotation: qDaniel, inquiry: iDaniel });
pDaniel.budget = Math.round(quoteTotals(qDaniel).total);
pDaniel.milestones[0]!.status = 'pending';

const iRob = crafted('c_roberto', { service: 'MikroTik and Network Solutions', title: 'Expand public hotspot to covered court', description: 'Extend the barangay hotspot to the covered court using point-to-point wireless.', status: 'In Progress', createdAt: ago(70), assignedTo: 'u_jerome', budget: '₱50,000 – ₱100,000' });
const qRob = makeQuotation('c_roberto', iRob, 'Hotspot Expansion — Covered Court', 'MikroTik and Network Solutions', addDays(NOW, -64), 'Approved', 1.6);
const pRob = makeProject({ name: 'Hotspot Expansion — Covered Court', customerId: 'c_roberto', category: 'MikroTik and Network Solutions', description: iRob.description, start: addDays(NOW, -55), target: addDays(NOW, -20), status: 'On Hold', doneStages: 2, budget: 0, revenue: 0, quotation: qRob, inquiry: iRob });
pRob.budget = Math.round(quoteTotals(qRob).total);
pRob.recordedRevenue = Math.round(pRob.budget * 0.5);
pRob.notes = 'On hold pending release of barangay funds for the second tranche. Follow up first week of next month.';

const iJas = crafted('c_jasmine', { service: 'CCTV and Security Systems', title: 'Home CCTV — 4 cameras with phone viewing', description: 'Townhouse, 2 floors. Want front gate, garage, back door and living room covered. Viewing on my phone.', status: 'Approved', createdAt: ago(10), budget: 'Below ₱25,000', assignedTo: 'u_kevin', source: 'Live Chat' });
const qJas = makeQuotation('c_jasmine', iJas, 'Home CCTV — 4 Cameras', 'CCTV and Security Systems', addDays(NOW, -7), 'Approved', 0.8);
void qJas;

// Open pipeline inquiries
crafted('c_lea', { service: 'MikroTik and Network Solutions', title: 'Piso Wi-Fi hotspot with vouchers + load balance', description: 'Internet café with 20 PCs and walk-in Wi-Fi customers. Want 2 ISPs combined, hotspot with vouchers and bandwidth limit per user.', status: 'New', createdAt: ago(0, 2), budget: '₱25,000 – ₱50,000', schedule: 'As soon as possible', source: 'AI Assistant' });
crafted('c_lito', { service: 'CCTV and Security Systems', title: 'Warehouse CCTV — 12 cameras', description: 'Hardware warehouse and yard. Need night vision for the yard and cameras at the cashier and loading bay.', status: 'New', createdAt: ago(0, 6), budget: '₱50,000 – ₱100,000', schedule: 'Next 2 weeks', attachments: [{ id: 'att1', name: 'warehouse-floorplan.pdf', size: 482_000, type: 'application/pdf' }] });
crafted('c_anna', { service: 'Website Development', title: 'Add online booking & payment to resort site', description: 'We want guests to reserve rooms and pay a deposit online through our existing website.', status: 'Pending', createdAt: ago(1, 3), budget: '₱50,000 – ₱100,000', assignedTo: 'u_patricia' });
crafted('c_paolo', { service: 'IT Infrastructure and Technical Services', title: 'Computer laboratory networking (40 PCs)', description: 'New computer lab with 40 PCs needs structured cabling, two switches and internet with content filtering.', status: 'For Assessment', createdAt: ago(4), budget: '₱100,000 – ₱250,000', assignedTo: 'u_jerome', schedule: 'Before January classes' });
const iRamon = crafted('c_ramon', { service: 'Software Development', title: 'Patient records and appointment system', description: 'Dental clinic needs patient records, treatment charting, appointments with SMS reminders and billing.', status: 'Quotation Sent', createdAt: ago(9), budget: '₱100,000 – ₱250,000', assignedTo: 'u_patricia' });
makeQuotation('c_ramon', iRamon, 'Dental Clinic Management System', 'Software Development', addDays(NOW, -5), 'Viewed', 1.15);
crafted('c_michelle', { service: 'CCTV and Security Systems', title: 'CCTV for new warehouse bay', description: 'Add 6 cameras to the new loading bay and connect to the existing NVR.', status: 'Contacted', createdAt: ago(3), assignedTo: 'u_kevin', source: 'Phone' });
const iMarkDraft = crafted('c_mark', { service: 'IT Infrastructure and Technical Services', title: 'UPS and LAN for POS terminals', description: 'Change request from the inventory project: UPS for POS terminals and 4 new LAN drops.', status: 'Quotation Sent', createdAt: ago(5), assignedTo: 'u_jerome', source: 'Walk-in' });
makeQuotation('c_mark', iMarkDraft, 'UPS & LAN Drops for POS Terminals', 'IT Infrastructure and Technical Services', addDays(NOW, -1), 'Draft', 0.45);

// Crafted communications & notes for richer detail pages
for (const inq of inquiries.slice(-12)) {
  if (inq.status !== 'New') {
    inq.communications.push({ id: id('cm_'), at: addDays(new Date(inq.createdAt), 0).toISOString(), by: 'Carla Mendoza', channel: 'Phone Call', direction: 'Outbound', summary: 'Called customer to confirm requirements and preferred schedule.' });
    inq.history.push({ id: id('h_'), at: addDays(new Date(inq.createdAt), 0).toISOString(), by: 'Carla Mendoza', text: `Status changed to ${inq.status}` });
  }
}
const lito = inquiries.find((i) => i.title.startsWith('Warehouse CCTV'))!;
lito.notes.push({ id: id('n_'), at: ago(0, 5), by: 'Carla Mendoza', text: 'Repeat-potential client (hardware supplier). Offer free site inspection this week.' });

// ── Number everything chronologically ───────────────────────────────────────
const year = (iso: string) => new Date(iso).getFullYear();
inquiries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x, i) => (x.ref = `INQ-${year(x.createdAt)}-${pad(i + 1)}`));
quotations.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x, i) => (x.number = `${seedSettings.quotationPrefix}-${year(x.createdAt)}-${pad(i + 1)}`));
projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x, i) => (x.code = `PRJ-${year(x.createdAt)}-${pad(i + 1, 3)}`));
customers.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));

// ── Appointments ────────────────────────────────────────────────────────────
const appointments: Appointment[] = [];
function appt(cid: string | null, name: string, type: AppointmentType, dayOffset: number, time: string, status: Appointment['status'], assignedTo: string | undefined, location: string, description: string, mode: Appointment['mode'] = 'On-site') {
  const c = cid ? C(cid) : undefined;
  const a: Appointment = {
    id: id('ap_'),
    ref: '',
    customerId: c?.id,
    name: c?.name ?? name,
    email: c?.email ?? `${name.split(' ')[0]!.toLowerCase()}@example.com`,
    mobile: c?.phone ?? '+63 917 555 0101',
    type,
    date: ymd(dayOffset),
    time,
    duration: type.includes('Inspection') || type.includes('Survey') ? 120 : type === 'Software Consultation' ? 90 : 60,
    location,
    mode,
    description,
    attachments: [],
    status,
    assignedTo,
    notes: [],
    history: [{ id: id('h_'), at: ago(Math.max(0, -dayOffset + 5)), by: 'System', text: 'Booking submitted online' }],
    createdAt: ago(Math.max(0, -dayOffset + 5)),
  };
  appointments.push(a);
  return a;
}
// Skip Sundays for any generated date.
const wd = (o: number) => (addDays(NOW, o).getDay() === 0 ? o + 1 : o);
appt('c_lito', '', 'CCTV Site Inspection', wd(1), '10:00', 'Confirmed', 'u_kevin', 'Fernandez Hardware, Marikina City', 'Inspect warehouse and yard for 12-camera layout.');
appt('c_paolo', '', 'Network Site Survey', wd(2), '09:00', 'Confirmed', 'u_jerome', 'St. Benedict Academy, Antipolo City', 'Survey new computer laboratory for 40 PCs.');
appt('c_anna', '', 'Website Consultation', wd(2), '14:00', 'Pending', undefined, 'Online (Google Meet)', 'Discuss online booking and deposit payments.', 'Online');
appt('c_lea', '', 'Network Site Survey', wd(3), '13:00', 'Pending', undefined, 'LB Gaming & Internet Hub, Cainta', 'Assess ISP lines and hotspot coverage.');
appt(null, 'Rhea Castillo', 'Technical Support', wd(4), '11:00', 'Rescheduled', 'u_jerome', 'Castillo Printing Services, Taytay', 'Office network intermittently drops. Rescheduled at customer request.');
appt('c_ramon', '', 'Software Consultation', wd(5), '15:00', 'Confirmed', 'u_patricia', 'Aquino Family Dental Clinic, Pasig', 'Walk-through of proposed clinic management system.', 'Office');
appt(null, 'Edwin Navarro', 'IT Consultation', wd(7), '10:00', 'Pending', undefined, 'Office visit', 'Planning IT setup for a new 15-person office.', 'Office');
appt('c_michelle', '', 'CCTV Site Inspection', wd(8), '09:00', 'Confirmed', 'u_kevin', 'Northpoint Logistics, Valenzuela', 'New loading bay cameras.');
appt(null, 'Joy Manalo', 'CCTV Site Inspection', wd(11), '13:00', 'Pending', undefined, 'Manalo Water Station, Bacoor', '4-camera package inquiry.');
appt('c_victor', '', 'Technical Support', wd(0), '16:00', 'Confirmed', 'u_kevin', 'Ong Pharmacy Navotas branch', 'Pre-installation check for Navotas branch.');
appt('c_jasmine', '', 'CCTV Site Inspection', -3, '10:00', 'Completed', 'u_kevin', 'Taguig City', 'Home CCTV site inspection.');
appt('c_daniel', '', 'Network Site Survey', -9, '09:00', 'Completed', 'u_jerome', 'Uy Trading Corp., Binondo', 'Survey for VLAN and VPN project.');
appt('c_sofia', '', 'Website Consultation', -32, '14:00', 'Completed', 'u_patricia', 'Online', 'Kick-off meeting.', 'Online');
appt(null, 'Allan Torres', 'IT Consultation', -6, '11:00', 'Cancelled', undefined, 'Office visit', 'Customer cancelled — will rebook next month.', 'Office');
appt('c_mark', '', 'Software Consultation', -20, '10:00', 'Completed', 'u_patricia', 'Lopez Auto Parts, San Juan', 'Design review with owner.');
for (let k = 0; k < 26; k++) {
  const o = -int(25, 330);
  appt(null, `${pick(FIRST)} ${pick(LAST)}`, pick(['IT Consultation', 'Website Consultation', 'CCTV Site Inspection', 'Network Site Survey', 'Technical Support', 'Software Consultation'] as AppointmentType[]), o, pick(['09:00', '10:00', '13:00', '14:00', '15:00']), rnd() < 0.85 ? 'Completed' : 'Cancelled', pick(['u_kevin', 'u_jerome', 'u_patricia']), pick(CITIES), 'Historical appointment.');
}
appointments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((x, i) => (x.ref = `APT-${year(x.createdAt)}-${pad(i + 1)}`));
appointments.find((a) => a.status === 'Rescheduled')!.history.push({ id: id('h_'), at: ago(1), by: 'Carla Mendoza', text: 'Rescheduled from earlier date at customer request' });

// ── Conversations ───────────────────────────────────────────────────────────
const msg = (from: 'customer' | 'admin' | 'system' | 'ai', authorName: string, text: string, at: string) => ({ id: id('m_'), from, authorName, text, at, attachments: [] });
const conversations: Conversation[] = [
  {
    id: 'cv1', token: 'demo-lea-7Q2K', customerName: 'Lea Bautista', email: C('c_lea').email, phone: C('c_lea').phone, customerId: 'c_lea', status: 'Open', assignedTo: undefined, adminUnread: 2, customerUnread: 0, source: 'AI Handoff', topic: 'Piso Wi-Fi hotspot', createdAt: ago(0, 2), updatedAt: ago(0, 1),
    messages: [
      msg('system', 'System', 'Conversation transferred from Marpel Assist (AI). Transcript summary: customer wants 2 ISPs combined plus voucher hotspot for an internet café with 20 PCs.', ago(0, 2)),
      msg('customer', 'Lea Bautista', 'Hi! Can you also install the coin-operated Piso Wi-Fi machine or just the router setup?', ago(0, 1.5)),
      msg('customer', 'Lea Bautista', 'Also how soon can someone visit? We are in Cainta.', ago(0, 1)),
    ],
  },
  {
    id: 'cv2', token: 'demo-lito-4M8P', customerName: 'Lito Fernandez', email: C('c_lito').email, phone: C('c_lito').phone, customerId: 'c_lito', status: 'Open', assignedTo: 'u_kevin', adminUnread: 1, customerUnread: 0, source: 'Live Chat', topic: 'Warehouse CCTV', createdAt: ago(0, 7), updatedAt: ago(0, 4),
    messages: [
      msg('customer', 'Lito Fernandez', 'Good morning. I submitted an inquiry for 12 cameras. Do you have cameras that can see plate numbers at the gate?', ago(0, 7)),
      msg('admin', 'Kevin Ramos', 'Good morning sir Lito! Yes — for plate capture we recommend a dedicated varifocal camera aimed at the gate lane. We can check the distance and lighting during the site inspection.', ago(0, 6.5)),
      msg('customer', 'Lito Fernandez', 'Ok. Is tomorrow 10am confirmed?', ago(0, 4)),
    ],
  },
  {
    id: 'cv3', token: 'demo-anna-9X3T', customerName: 'Anna Dizon', email: C('c_anna').email, phone: C('c_anna').phone, customerId: 'c_anna', status: 'Pending', assignedTo: 'u_patricia', adminUnread: 0, customerUnread: 1, source: 'Live Chat', topic: 'Online booking', createdAt: ago(1, 2), updatedAt: ago(1, 1),
    messages: [
      msg('customer', 'Anna Dizon', 'Can our current website accept GCash deposits?', ago(1, 2)),
      msg('admin', 'Patricia Lim', 'Hi Ma’am Anna! Yes, we can integrate a payment gateway that supports GCash, Maya and cards. I booked a consultation slot for you so we can walk through the flow.', ago(1, 1)),
    ],
  },
  {
    id: 'cv4', token: 'demo-joy-2B6N', customerName: 'Joy Manalo', email: 'joy@example.com', phone: '+63 918 555 0142', status: 'Resolved', assignedTo: 'u_kevin', adminUnread: 0, customerUnread: 0, source: 'Live Chat', topic: 'CCTV package question', createdAt: ago(4), updatedAt: ago(4),
    messages: [
      msg('customer', 'Joy Manalo', 'Is the 4-camera package inclusive of installation?', ago(4, 1)),
      msg('admin', 'Kevin Ramos', 'Hi Joy! Yes, the 4-Camera HD Package includes standard installation and remote viewing setup. Final cost is confirmed after a quick site inspection.', ago(4, 0.5)),
      msg('customer', 'Joy Manalo', 'Great, I booked an inspection. Thanks!', ago(4)),
    ],
  },
  {
    id: 'cv5', token: 'demo-mark-5H1R', customerName: 'Mark Lopez', email: C('c_mark').email, phone: C('c_mark').phone, customerId: 'c_mark', status: 'Closed', assignedTo: 'u_patricia', adminUnread: 0, customerUnread: 0, source: 'Live Chat', topic: 'Barcode scanner model', createdAt: ago(12), updatedAt: ago(12),
    messages: [
      msg('customer', 'Mark Lopez', 'Which barcode scanner should I buy for the system?', ago(12, 2)),
      msg('admin', 'Patricia Lim', 'Any USB HID 1D/2D scanner works. We will send two recommended models with your next update.', ago(12, 1)),
    ],
  },
];

// ── AI conversation log samples ─────────────────────────────────────────────
const aiConversations: AIConversation[] = [
  { id: 'ai1', visitor: 'Lea Bautista', startedAt: ago(0, 2.2), outcome: 'Handed off', suggestedService: 'MikroTik and Network Solutions', messages: [
    { from: 'ai', text: 'Hi! I’m Marpel Assist. What can I help you with today?', at: ago(0, 2.2) },
    { from: 'user', text: 'I need two internet lines combined for my internet café plus voucher wifi', at: ago(0, 2.2) },
    { from: 'ai', text: 'That sounds like MikroTik load balancing with a hotspot voucher system — part of our MikroTik and Network Solutions service. Would you like me to prepare a quotation request?', at: ago(0, 2.15) },
    { from: 'user', text: 'Can I talk to a person', at: ago(0, 2.1) },
    { from: 'ai', text: 'Of course — I’m transferring you to our team now.', at: ago(0, 2.1) },
  ] },
  { id: 'ai2', visitor: 'Visitor #1842', startedAt: ago(1, 5), outcome: 'Answered', suggestedService: 'CCTV and Security Systems', messages: [
    { from: 'user', text: 'do you do free ocular inspection for cctv', at: ago(1, 5) },
    { from: 'ai', text: 'Yes — CCTV and network site inspections are free within Metro Manila.', at: ago(1, 5) },
  ] },
  { id: 'ai3', visitor: 'Mark Lopez', startedAt: ago(58, 2), outcome: 'Lead captured', suggestedService: 'Software Development', messages: [
    { from: 'user', text: 'I need an inventory system with barcode for my auto parts store', at: ago(58, 2) },
    { from: 'ai', text: 'Our Software Development team builds inventory and POS systems. May I collect a few details so our team can prepare a quotation?', at: ago(58, 2) },
  ] },
];

// ── Notifications / emails / audit ──────────────────────────────────────────
const notifications: AppNotification[] = [
  { id: id('nt_'), type: 'inquiry', title: 'New inquiry from Lea Bautista', body: 'Piso Wi-Fi hotspot with vouchers + load balance (via AI Assistant)', link: '/admin/inquiries', at: ago(0, 2), read: false },
  { id: id('nt_'), type: 'message', title: 'New message from Lea Bautista', body: 'Also how soon can someone visit? We are in Cainta.', link: '/admin/chat', at: ago(0, 1), read: false },
  { id: id('nt_'), type: 'inquiry', title: 'New inquiry from Lito Fernandez', body: 'Warehouse CCTV — 12 cameras', link: '/admin/inquiries', at: ago(0, 6), read: false },
  { id: id('nt_'), type: 'message', title: 'New message from Lito Fernandez', body: 'Ok. Is tomorrow 10am confirmed?', link: '/admin/chat', at: ago(0, 4), read: false },
  { id: id('nt_'), type: 'appointment', title: 'New booking: Network Site Survey', body: 'Lea Bautista — LB Gaming & Internet Hub', link: '/admin/appointments', at: ago(0, 1.5), read: false },
  { id: id('nt_'), type: 'quotation', title: 'Quotation viewed by Dr. Ramon Aquino', body: 'Dental Clinic Management System', link: '/admin/quotations', at: ago(2), read: true },
  { id: id('nt_'), type: 'project', title: 'Project update posted', body: 'Malabon branch installed — 24-Camera Multi-Branch Surveillance', link: '/admin/projects', at: ago(3), read: true },
  { id: id('nt_'), type: 'quotation', title: 'Quotation approved by Jasmine Villareal', body: 'Home CCTV — 4 Cameras', link: '/admin/quotations', at: ago(5), read: true },
  { id: id('nt_'), type: 'customer', title: 'New customer registered', body: 'Lea Bautista — LB Gaming & Internet Hub', link: '/admin/customers', at: ago(4), read: true },
  { id: id('nt_'), type: 'system', title: 'Prototype mode', body: 'Email delivery is simulated. Connect an email provider in Business Settings during production.', link: '/admin/settings', at: ago(6), read: true },
];

const emails: EmailLog[] = [
  { id: id('em_'), event: 'new_inquiry', to: seedSettings.adminNotificationEmail, subject: '[New Inquiry] Piso Wi-Fi hotspot with vouchers + load balance — Lea Bautista', body: 'A new inquiry was submitted via the AI Assistant.\n\nService: MikroTik and Network Solutions\nBudget: ₱25,000 – ₱50,000\n\nOpen the dashboard to respond.', at: ago(0, 2), status: 'Simulated' },
  { id: id('em_'), event: 'new_message', to: seedSettings.adminNotificationEmail, subject: '[New Message] Lea Bautista', body: 'Also how soon can someone visit? We are in Cainta.', at: ago(0, 1), status: 'Simulated' },
  { id: id('em_'), event: 'new_inquiry', to: seedSettings.adminNotificationEmail, subject: '[New Inquiry] Warehouse CCTV — 12 cameras — Lito Fernandez', body: 'A new inquiry was submitted via the website form.', at: ago(0, 6), status: 'Simulated' },
  { id: id('em_'), event: 'project_update', to: C('c_victor').email, subject: 'Project update: Malabon branch installed', body: 'Hello Victor,\n\nA new update was posted to your project 24-Camera Multi-Branch Surveillance.', at: ago(3), status: 'Simulated' },
];

const audit: AuditEntry[] = [
  { id: id('au_'), at: ago(0, 1), user: 'Carla Mendoza', role: 'admin', action: 'Viewed inquiry', target: 'Warehouse CCTV — 12 cameras' },
  { id: id('au_'), at: ago(1), user: 'Carla Mendoza', role: 'admin', action: 'Created quotation (draft)', target: 'UPS & LAN Drops for POS Terminals' },
  { id: id('au_'), at: ago(3), user: 'Kevin Ramos', role: 'staff', action: 'Posted project update', target: '24-Camera Multi-Branch Surveillance' },
  { id: id('au_'), at: ago(5), user: 'Marpel Owner', role: 'super_admin', action: 'Updated business settings', target: 'Operating hours' },
  { id: id('au_'), at: ago(6), user: 'Patricia Lim', role: 'staff', action: 'Posted project update', target: 'Inventory & Sales Management System' },
  { id: id('au_'), at: ago(9), user: 'Patricia Lim', role: 'staff', action: 'Posted project update', target: 'Brightpath Learning Center Website' },
];

export const seedRecords = {
  users: seedUsers,
  customers,
  inquiries,
  quotations,
  projects,
  appointments,
  conversations,
  aiConversations,
  notifications,
  emails,
  audit,
  counters: { inquiry: inquiries.length, quotation: quotations.length, project: projects.length, appointment: appointments.length },
  serviceNames: SERVICE_NAMES,
};
