// ─────────────────────────────────────────────────────────────────────────────
// Marpel Tech & Network Solutions — prototype data model.
// These interfaces mirror the planned PostgreSQL schema (see docs/schema.sql)
// so the prototype store can be swapped for Supabase without UI rewrites.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;
export type ISODate = string; // ISO timestamp or YYYY-MM-DD for calendar dates

export type Role = 'super_admin' | 'admin' | 'staff';
export type ContentStatus = 'draft' | 'published' | 'archived';

export interface User {
  id: ID;
  name: string;
  username: string;
  email: string;
  /** PROTOTYPE ONLY — production uses Supabase Auth with hashed passwords. */
  password: string;
  role: Role;
  title: string;
  phone: string;
  active: boolean;
  createdAt: ISODate;
  lastLoginAt?: ISODate;
}

export interface Attachment {
  id: ID;
  name: string;
  size: number;
  type: string;
  /** Present for compressed images in the prototype; production stores files in object storage. */
  dataUrl?: string;
}

export interface HistoryEntry {
  id: ID;
  at: ISODate;
  by: string;
  text: string;
}

export interface Note {
  id: ID;
  at: ISODate;
  by: string;
  text: string;
}

export type CommChannel = 'Email' | 'Phone Call' | 'SMS' | 'Meeting' | 'Live Chat' | 'Viber/WhatsApp';
export interface Communication {
  id: ID;
  at: ISODate;
  by: string;
  channel: CommChannel;
  direction: 'Outbound' | 'Inbound';
  summary: string;
}

// ── Business settings & CMS ─────────────────────────────────────────────────

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface Settings {
  businessName: string;
  shortName: string;
  tagline: string;
  logoImage?: string;
  /** Branded splash screen shown when moving between public pages. */
  pageLoader?: boolean;
  email: string;
  supportEmail: string;
  phone: string;
  mobile: string;
  address: string;
  city: string;
  mapQuery: string;
  hours: BusinessHours[];
  socials: { facebook: string; instagram: string; linkedin: string; youtube: string; tiktok: string };
  currency: string;
  currencySymbol: string;
  taxLabel: string;
  defaultTaxRate: number;
  quotationPrefix: string;
  quotationValidityDays: number;
  defaultPaymentTerms: string;
  defaultQuotationTerms: string;
  tin: string;
  adminNotificationEmail: string;
  emailEvents: Record<EmailEvent, boolean>;
  emailProvider: 'Not connected' | 'SMTP' | 'Resend' | 'SendGrid' | 'Amazon SES';
}

export type EmailEvent =
  | 'new_inquiry'
  | 'new_message'
  | 'appointment_request'
  | 'appointment_confirmation'
  | 'quotation_status'
  | 'project_update'
  | 'new_customer';

export interface Feature {
  id: ID;
  icon: string;
  title: string;
  desc: string;
}

export interface SiteContent {
  hero: {
    eyebrow: string;
    title: string;
    highlight: string;
    subtitle: string;
    image?: string;
  };
  intro: { title: string; body: string };
  stats: { id: ID; value: string; label: string }[];
  whyChoose: Feature[];
  expertise: { id: ID; label: string; level: number }[];
  ctaBand: { title: string; body: string };
  about: {
    headline: string;
    profile: string;
    background: string;
    mission: string;
    vision: string;
    values: Feature[];
    capabilities: string[];
    whyUs: string[];
    founded: string;
  };
  footer: { blurb: string; copyright: string };
  seo: Record<string, { title: string; description: string }>;
  announcementBar: { enabled: boolean; text: string; link: string };
  /** Optional background photo for a public page's header banner, keyed by page (e.g. 'portfolio'). dim = 0–90 % dark overlay. */
  pageBackgrounds?: Record<string, { image?: string; dim: number }>;
}

export interface Testimonial {
  id: ID;
  name: string;
  role: string;
  company: string;
  quote: string;
  rating: number;
  service: string;
  status: ContentStatus;
}

export interface ServicePackage {
  id: ID;
  name: string;
  price: number | null;
  priceNote: string;
  features: string[];
  popular: boolean;
}

export interface Service {
  id: ID;
  slug: string;
  name: string;
  icon: string;
  short: string;
  description: string;
  image?: string;
  gallery: string[];
  offerings: string[];
  features: string[];
  benefits: string[];
  packages: ServicePackage[];
  startingPrice: number | null;
  showPrice: boolean;
  status: ContentStatus;
  order: number;
  seoTitle: string;
  seoDescription: string;
}

export const PORTFOLIO_CATEGORIES = [
  'Website Development',
  'Software Development',
  'CCTV Installation',
  'Network Infrastructure',
  'MikroTik Configuration',
  'IT Projects',
] as const;
export type PortfolioCategory = (typeof PORTFOLIO_CATEGORIES)[number];

export interface PortfolioItem {
  id: ID;
  title: string;
  category: PortfolioCategory;
  client: string;
  location: string;
  summary: string;
  description: string;
  completedAt: ISODate;
  technologies: string[];
  featured: boolean;
  image?: string;
  beforeImage?: string;
  afterImage?: string;
  status: ContentStatus;
}

export const BLOG_CATEGORIES = [
  'IT Tips',
  'Technology Updates',
  'Company Announcements',
  'Project Updates',
  'Service Promotions',
  'Tutorials',
] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export interface BlogPost {
  id: ID;
  title: string;
  slug: string;
  category: BlogCategory;
  excerpt: string;
  body: string;
  cover?: string;
  author: string;
  tags: string[];
  status: ContentStatus;
  publishedAt?: ISODate;
  updatedAt: ISODate;
}

// ── CRM ─────────────────────────────────────────────────────────────────────

export const CUSTOMER_CATEGORIES = ['Individual', 'Small Business', 'Corporate', 'Government', 'Education', 'Non-profit'] as const;
export type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number];

export interface Customer {
  id: ID;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  category: CustomerCategory;
  registeredAt: ISODate;
  archived: boolean;
  notes: string;
  source: string;
  communications: Communication[];
}

export const INQUIRY_STATUSES = [
  'New',
  'Pending',
  'Contacted',
  'For Assessment',
  'Quotation Sent',
  'Approved',
  'Rejected',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export type LeadSource = 'Website Form' | 'AI Assistant' | 'Live Chat' | 'Booking Form' | 'Walk-in' | 'Phone' | 'Referral';

export interface Inquiry {
  id: ID;
  ref: string;
  customerId?: ID;
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
  status: InquiryStatus;
  assignedTo?: ID;
  notes: Note[];
  communications: Communication[];
  history: HistoryEntry[];
  source: LeadSource;
  createdAt: ISODate;
  updatedAt: ISODate;
  projectId?: ID;
  quotationId?: ID;
}

// ── Messaging ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: ID;
  from: 'customer' | 'admin' | 'system' | 'ai';
  authorName: string;
  text: string;
  at: ISODate;
  attachments: Attachment[];
}

export type ConversationStatus = 'Open' | 'Pending' | 'Resolved' | 'Closed';

export interface Conversation {
  id: ID;
  token: string;
  customerName: string;
  email: string;
  phone: string;
  customerId?: ID;
  status: ConversationStatus;
  assignedTo?: ID;
  adminUnread: number;
  customerUnread: number;
  messages: ChatMessage[];
  source: 'Live Chat' | 'AI Handoff';
  topic: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ── Quotations ──────────────────────────────────────────────────────────────

export const QUOTATION_STATUSES = ['Draft', 'Sent', 'Viewed', 'Approved', 'Rejected', 'Expired'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export type LineKind = 'Service' | 'Labor' | 'Materials' | 'Equipment';

export interface QuoteItem {
  id: ID;
  kind: LineKind;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface Quotation {
  id: ID;
  number: string;
  customerId: ID;
  inquiryId?: ID;
  projectId?: ID;
  title: string;
  serviceCategory: string;
  summary: string;
  issuedAt: ISODate;
  expiresAt: ISODate;
  items: QuoteItem[];
  discountType: 'amount' | 'percent';
  discount: number;
  taxRate: number;
  paymentTerms: string;
  terms: string;
  notes: string;
  status: QuotationStatus;
  preparedBy: ID;
  history: HistoryEntry[];
  createdAt: ISODate;
}

// ── Projects ────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ['Planning', 'Approved', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Milestone {
  id: ID;
  name: string;
  status: 'pending' | 'active' | 'done';
  dueDate?: ISODate;
  completedAt?: ISODate;
}

export interface ProjectUpdate {
  id: ID;
  at: ISODate;
  by: string;
  title: string;
  body: string;
  images: string[];
  visibleToCustomer: boolean;
}

export interface Project {
  id: ID;
  code: string;
  trackingRef: string;
  accessPin: string;
  name: string;
  customerId: ID;
  quotationId?: ID;
  inquiryId?: ID;
  category: string;
  description: string;
  startDate: ISODate;
  targetDate: ISODate;
  completedDate?: ISODate;
  budget: number;
  /** Amount actually received/recognised — used for "recorded revenue". */
  recordedRevenue: number;
  managerId: ID;
  staffIds: ID[];
  status: ProjectStatus;
  progressMode: 'auto' | 'manual';
  manualProgress: number;
  milestones: Milestone[];
  notes: string;
  attachments: Attachment[];
  updates: ProjectUpdate[];
  activity: HistoryEntry[];
  createdAt: ISODate;
}

// ── Appointments ────────────────────────────────────────────────────────────

export const APPOINTMENT_TYPES = [
  'IT Consultation',
  'Website Consultation',
  'Software Consultation',
  'CCTV Site Inspection',
  'Network Site Survey',
  'Technical Support',
  'Other Services',
] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'Rescheduled', 'Completed', 'Cancelled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: ID;
  ref: string;
  customerId?: ID;
  name: string;
  email: string;
  mobile: string;
  type: AppointmentType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration: number;
  location: string;
  mode: 'On-site' | 'Office' | 'Online';
  description: string;
  attachments: Attachment[];
  status: AppointmentStatus;
  assignedTo?: ID;
  notes: Note[];
  history: HistoryEntry[];
  createdAt: ISODate;
}

export interface Availability {
  workingDays: number[]; // 0 = Sunday
  start: string;
  end: string;
  slotMinutes: number;
  durations: Record<AppointmentType, number>;
  blackoutDates: { id: ID; date: string; reason: string }[];
  maxPerSlot: number;
  leadTimeHours: number;
}

// ── AI assistant ────────────────────────────────────────────────────────────

export interface FAQ {
  id: ID;
  question: string;
  answer: string;
  keywords: string[];
  enabled: boolean;
}

export interface AIMessage {
  from: 'user' | 'ai';
  text: string;
  at: ISODate;
}

export interface AIConversation {
  id: ID;
  visitor: string;
  startedAt: ISODate;
  messages: AIMessage[];
  outcome: 'Answered' | 'Lead captured' | 'Handed off' | 'Abandoned';
  suggestedService?: string;
}

export interface AISettings {
  enabled: boolean;
  name: string;
  greeting: string;
  tone: 'Professional' | 'Friendly' | 'Concise';
  handoffMode: 'offer' | 'after_misses' | 'always_available';
  missesBeforeHandoff: number;
  collectLeads: boolean;
  showStartingPrices: boolean;
  fallbackMessage: string;
  businessContext: string;
  faqs: FAQ[];
  conversations: AIConversation[];
}

// ── Notifications, email, audit ─────────────────────────────────────────────

export type NotificationType = 'inquiry' | 'message' | 'appointment' | 'quotation' | 'customer' | 'project' | 'system';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  at: ISODate;
  read: boolean;
}

export interface EmailLog {
  id: ID;
  event: EmailEvent;
  to: string;
  subject: string;
  body: string;
  at: ISODate;
  status: 'Simulated' | 'Skipped (disabled)';
}

export interface AuditEntry {
  id: ID;
  at: ISODate;
  user: string;
  role: Role | 'customer' | 'public';
  action: string;
  target: string;
}

export interface DB {
  version: number;
  settings: Settings;
  content: SiteContent;
  testimonials: Testimonial[];
  services: Service[];
  portfolio: PortfolioItem[];
  posts: BlogPost[];
  users: User[];
  customers: Customer[];
  inquiries: Inquiry[];
  conversations: Conversation[];
  quotations: Quotation[];
  projects: Project[];
  stageTemplates: Record<string, string[]>;
  appointments: Appointment[];
  availability: Availability;
  ai: AISettings;
  notifications: AppNotification[];
  emails: EmailLog[];
  audit: AuditEntry[];
  counters: { inquiry: number; quotation: number; project: number; appointment: number };
}
