-- ════════════════════════════════════════════════════════════════════════════
-- Marpel Tech & Network Solutions: PostgreSQL / Supabase schema DRAFT
-- Mirrors src/lib/types.ts. For Phase 4 (production) after owner approval.
-- Not applied anywhere yet.
-- ════════════════════════════════════════════════════════════════════════════

create type user_role as enum ('super_admin', 'admin', 'staff');
create type content_status as enum ('draft', 'published', 'archived');
create type inquiry_status as enum ('New','Pending','Contacted','For Assessment','Quotation Sent','Approved','Rejected','In Progress','Completed','Cancelled');
create type quotation_status as enum ('Draft','Sent','Viewed','Approved','Rejected','Expired');
create type project_status as enum ('Planning','Approved','In Progress','On Hold','Completed','Cancelled');
create type appointment_status as enum ('Pending','Confirmed','Rescheduled','Completed','Cancelled');
create type conversation_status as enum ('Open','Pending','Resolved','Closed');
create type line_kind as enum ('Service','Labor','Materials','Equipment');

-- ── People ──────────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  username text unique not null,
  title text,
  phone text,
  role user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users,           -- set when the customer creates a portal login
  name text not null,
  company text,
  email citext unique not null,
  phone text,
  address text,
  category text not null default 'Individual',
  source text,
  notes text,
  archived boolean not null default false,
  registered_at timestamptz not null default now()
);

create table communications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers on delete cascade,
  inquiry_id uuid,
  channel text not null,
  direction text not null check (direction in ('Inbound','Outbound')),
  summary text not null,
  by_user uuid references profiles,
  at timestamptz not null default now()
);

-- ── CMS ─────────────────────────────────────────────────────────────────────
create table settings (id int primary key default 1 check (id = 1), data jsonb not null);
create table site_content (id int primary key default 1 check (id = 1), data jsonb not null);

create table services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon text,
  short text,
  description text,
  image_path text,
  gallery text[] default '{}',
  offerings text[] default '{}',
  features text[] default '{}',
  benefits text[] default '{}',
  starting_price numeric(12,2),
  show_price boolean not null default false,
  status content_status not null default 'draft',
  sort_order int not null default 0,
  seo_title text,
  seo_description text
);

create table service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services on delete cascade,
  name text not null,
  price numeric(12,2),
  price_note text,
  features text[] default '{}',
  popular boolean default false,
  sort_order int default 0
);

create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text not null, client text, location text,
  summary text, description text, completed_at date, technologies text[] default '{}',
  featured boolean default false, image_path text, before_image_path text, after_image_path text,
  status content_status not null default 'draft'
);

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null, slug text unique not null, category text not null,
  excerpt text, body text, cover_path text, author text, tags text[] default '{}',
  status content_status not null default 'draft', published_at timestamptz, updated_at timestamptz default now()
);

create table testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null, role text, company text, quote text not null,
  rating int check (rating between 1 and 5), service text, status content_status not null default 'draft'
);

-- ── Sales ───────────────────────────────────────────────────────────────────
create sequence inquiry_seq;
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null default 'INQ-' || to_char(now(),'YYYY') || '-' || lpad(nextval('inquiry_seq')::text, 4, '0'),
  customer_id uuid references customers,
  name text not null, email citext not null, mobile text, company text,
  service text, title text not null, description text, budget text, schedule text,
  status inquiry_status not null default 'New',
  assigned_to uuid references profiles,
  source text not null,
  project_id uuid, quotation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table inquiry_notes (id uuid primary key default gen_random_uuid(), inquiry_id uuid references inquiries on delete cascade, text text not null, by_user uuid references profiles, at timestamptz default now());
create table inquiry_history (id uuid primary key default gen_random_uuid(), inquiry_id uuid references inquiries on delete cascade, text text not null, by_name text, at timestamptz default now());

create table attachments (
  id uuid primary key default gen_random_uuid(),
  owner_table text not null, owner_id uuid not null,       -- inquiry / message / appointment / project
  storage_path text not null, file_name text not null, mime_type text not null, size_bytes int not null,
  uploaded_at timestamptz default now()
);

create sequence quotation_seq;
create table quotations (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  customer_id uuid not null references customers,
  inquiry_id uuid references inquiries,
  project_id uuid,
  title text not null, service_category text, summary text,
  issued_at date not null default current_date, expires_at date not null,
  discount_type text not null default 'percent' check (discount_type in ('percent','amount')),
  discount numeric(12,2) default 0, tax_rate numeric(5,2) default 12,
  payment_terms text, terms text, notes text,
  status quotation_status not null default 'Draft',
  prepared_by uuid references profiles,
  created_at timestamptz default now()
);
create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations on delete cascade,
  kind line_kind not null, description text not null, qty numeric(12,2) not null, unit text, unit_price numeric(12,2) not null,
  sort_order int default 0
);

-- ── Delivery ────────────────────────────────────────────────────────────────
create table stage_templates (category text primary key, stages text[] not null);

create sequence project_seq;
create table projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  tracking_ref text unique not null,
  access_pin_hash text not null,                          -- PIN stored hashed
  name text not null, customer_id uuid not null references customers,
  quotation_id uuid references quotations, inquiry_id uuid references inquiries,
  category text, description text,
  start_date date, target_date date, completed_date date,
  budget numeric(12,2) default 0,
  status project_status not null default 'Approved',
  progress_mode text default 'auto', manual_progress int default 0,
  manager_id uuid references profiles, notes text,
  created_at timestamptz default now()
);
create table project_staff (project_id uuid references projects on delete cascade, user_id uuid references profiles, primary key (project_id, user_id));
create table milestones (id uuid primary key default gen_random_uuid(), project_id uuid references projects on delete cascade, name text not null, status text not null default 'pending', due_date date, completed_at timestamptz, sort_order int);
create table project_updates (id uuid primary key default gen_random_uuid(), project_id uuid references projects on delete cascade, title text, body text, image_paths text[] default '{}', visible_to_customer boolean default true, by_user uuid references profiles, at timestamptz default now());
create table payments (id uuid primary key default gen_random_uuid(), project_id uuid references projects on delete cascade, amount numeric(12,2) not null, received_at date default current_date, method text, reference text, recorded_by uuid references profiles);
-- Recorded revenue = sum(payments.amount); projected = quotation totals. Never mixed.

create sequence appointment_seq;
create table appointments (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  customer_id uuid references customers,
  name text, email citext, mobile text,
  type text not null, starts_at timestamptz not null, duration_min int not null,
  location text, mode text, description text,
  status appointment_status not null default 'Pending',
  assigned_to uuid references profiles,
  created_at timestamptz default now(),
  -- double-booking guard (with btree_gist): no overlapping active appointments
  during tstzrange generated always as (tstzrange(starts_at, starts_at + make_interval(mins => duration_min))) stored
);
-- create extension btree_gist;
-- alter table appointments add constraint no_overlap exclude using gist (during with &&) where (status in ('Pending','Confirmed','Rescheduled'));
create table availability (id int primary key default 1 check (id = 1), data jsonb not null);
create table blackout_dates (date date primary key, reason text);

-- ── Messaging, AI, notifications ────────────────────────────────────────────
create table conversations (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  customer_id uuid references customers,
  topic text, source text, status conversation_status default 'Open',
  assigned_to uuid references profiles,
  admin_unread int default 0, customer_unread int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table messages (id uuid primary key default gen_random_uuid(), conversation_id uuid references conversations on delete cascade, sender text not null check (sender in ('customer','admin','system','ai')), author_name text, body text, at timestamptz default now());
create table faqs (id uuid primary key default gen_random_uuid(), question text, answer text, keywords text[], enabled boolean default true);
create table ai_conversations (id uuid primary key default gen_random_uuid(), visitor text, started_at timestamptz default now(), outcome text, suggested_service text, transcript jsonb);
create table notifications (id uuid primary key default gen_random_uuid(), user_id uuid references profiles, type text, title text, body text, link text, read boolean default false, at timestamptz default now());
create table email_outbox (id uuid primary key default gen_random_uuid(), event text, to_email citext, subject text, body text, status text default 'queued', attempts int default 0, sent_at timestamptz, created_at timestamptz default now());
create table audit_log (id bigserial primary key, at timestamptz default now(), actor uuid, actor_name text, role text, action text, target text);

-- ── Row-level security (outline) ────────────────────────────────────────────
alter table inquiries enable row level security;
create function is_mgmt() returns boolean language sql stable as $$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin','super_admin') and active) $$;
create policy inquiries_mgmt on inquiries for all using (is_mgmt());
create policy inquiries_staff on inquiries for select using (assigned_to = auth.uid());
create policy inquiries_staff_update on inquiries for update using (assigned_to = auth.uid());

alter table projects enable row level security;
create policy projects_mgmt on projects for all using (is_mgmt());
create policy projects_staff on projects for select using (manager_id = auth.uid() or exists (select 1 from project_staff ps where ps.project_id = id and ps.user_id = auth.uid()));
create policy projects_customer on projects for select using (customer_id in (select id from customers where auth_user_id = auth.uid()));

alter table project_updates enable row level security;
create policy updates_customer on project_updates for select using (visible_to_customer and project_id in (select p.id from projects p join customers c on c.id = p.customer_id where c.auth_user_id = auth.uid()));
-- (similar policies for appointments, conversations/messages, quotations, customers)
