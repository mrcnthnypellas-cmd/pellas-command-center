# Production architecture plan (Phase 4: after owner approval only)

This document describes how the approved prototype becomes the production platform. **None of this is
built or deployed yet.**

## 1. Target stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Reuse prototype components and design system. Public pages are server-rendered/static for SEO. |
| Backend | Supabase | PostgreSQL, Auth, Storage, Realtime, Edge Functions |
| Email | SMTP or a transactional provider (Resend / SendGrid / SES) | Sent from Edge Functions only |
| AI assistant | Claude API via a Supabase Edge Function | API key stored as a server secret, never shipped to the browser |
| Hosting | Vercel (frontend) + Supabase cloud | Environment-based config: `development`, `staging`, `production` |
| Maps | Google Maps Embed API | Restricted browser key (domain-locked) |

## 2. Mapping prototype → production

The prototype's `src/lib/store.tsx` (`useDB`, `update`) and `src/lib/actions.ts` are the only modules that
touch data. In production:

- `useDB()` selectors become typed Supabase queries (React Query / server components).
- Each function in `actions.ts` becomes a server action or Edge Function with the same name and inputs
  (`submitInquiry`, `setQuotationStatus`, `createProject`, `bookAppointment`, …). Side effects (notifications,
  emails, audit) move into the server function or a database trigger so every channel behaves the same.
- `docs/schema.sql` mirrors `src/lib/types.ts` table-for-table.

## 3. Security

- **Authentication**: Supabase Auth (email + password, magic links, optional TOTP 2FA for admins).
  Passwords hashed by the provider. Session refresh and an 8-hour idle timeout for staff.
- **Authorization**: `profiles.role` ∈ `super_admin | admin | staff`; customers live in `customers` linked to
  `auth.users`. **Row-level security** reproduces the prototype scoping in `src/lib/permissions.ts`:
  - staff: `inquiries.assigned_to = auth.uid()`, `projects` where they are manager or in `project_staff`,
    `appointments.assigned_to = auth.uid()`, conversations unassigned or assigned to them;
  - customers: only their own conversations, quotations and projects.
- **Project tracking**: customers sign in, or use reference + PIN via an Edge Function that rate-limits
  attempts and returns only customer-visible fields (never internal notes or internal updates).
- **Uploads**: private Storage buckets, MIME/size validation on the server, virus scanning hook, signed URLs
  that expire.
- **Inputs**: server-side validation (zod) on every action; React escapes output; the blog renderer allows no
  raw HTML.
- **Audit**: `audit_log` written by triggers on sensitive tables.
- **Secrets**: only in Supabase/Vercel environment variables. Nothing secret is placed in client bundles.
- **Hardening**: CSP headers, HTTPS only, rate limits on public forms, CAPTCHA (Turnstile) on public forms, backups and point-in-time recovery.

## 4. Realtime chat

`conversations` and `messages` tables with Supabase Realtime subscriptions. The customer widget holds a
conversation token (httpOnly cookie in production) that the Edge Function exchanges for scoped access.
Unread counters are maintained by triggers.

## 5. AI assistant

Edge Function `ai-chat`:
1. Loads published services, packages (only if `show_price`), enabled FAQs and the business context.
2. Calls the Claude API with a system prompt that forbids inventing prices, capabilities or promises,
   and defines tools: `capture_lead` (creates an inquiry), `handoff_to_human` (creates a conversation),
   `suggest_booking`.
3. Stores the transcript in `ai_conversations` for the admin history view.

## 6. Notifications

Dashboard notifications are a `notifications` table + Realtime. Emails are queued in `email_outbox` by
triggers and delivered by a scheduled Edge Function (retries, delivery status), respecting the
per-event toggles in Business Settings.

## 7. SEO & marketing

- Server-rendered public pages with per-page metadata from the CMS (`seo` fields already modelled).
- Generated `sitemap.xml` (services, blog posts, portfolio) and `robots.txt`.
- Open Graph/Twitter images, JSON-LD `LocalBusiness` + `Service` structured data, Google Business Profile link.
- Image optimization (Next/Image), Core Web Vitals budget, analytics (privacy-friendly).

## 8. Deployment checklist

1. Supabase project + migrations from `schema.sql`; seed services/content from the prototype.
2. Auth providers, RLS policies, Storage buckets.
3. Edge Functions: `ai-chat`, `send-email`, `track-project`, `public-forms`.
4. Vercel project, environment variables, custom domain, SSL.
5. Data import of real services, portfolio, testimonials.
6. Security review, load test of public forms, backup/restore drill.
7. Owner acceptance testing → go-live.

## 9. Future expansion (designed for, not built)

The API-first backend allows: Android/iOS customer apps and a staff field app (React Native/Expo sharing
types), online payments (PayMongo / GCash / Maya), SMS (Semaphore / Twilio), support ticketing, service
contracts with preventive-maintenance scheduling, IT equipment inventory, and automated email marketing.
