# Marpel Tech & Network Solutions — Interactive Prototype (Phase 1)

A complete, clickable prototype of the Marpel Tech public website, CRM, customer portal and business
management dashboard. It is a **prototype for review and approval**. It is not the production system.

- **Public website**: home, about, services (5 categories, detail pages, packages), portfolio
  (with before/after slider), blog, contact, quotation request, appointment booking, project tracking portal,
  secure customer conversation page, floating chat widget with a demo AI assistant.
- **Admin dashboard**: 17 modules: Dashboard, Inquiries, Live Chat, Customers, Services, Portfolio,
  Blog, Quotations, Projects, Project Tracking, Appointments, AI Assistant, Notifications, Reports,
  Users & Roles, Website Content and Business Settings, plus a Prototype Guide.

## Live preview

**https://marpel-prototype.vercel.app** (Vercel project `marpel-prototype`, team Pellas, root directory `marpel/`,
built from branch `ccr-b4c02944-pexusk`). **Private:** Vercel Authentication is on for all deployments, so only
signed-in members of the Pellas Vercel team can open it. Pushes to that branch create preview deployments automatically; the
public URL is updated by promoting/deploying that branch to production.

## Screenshots

`docs/screenshots/`: home, service page, client portal, booking, dashboard, live chat, quotation,
appointments, reports, project detail, mobile.

## Letterhead

`docs/branding/marpel-letterhead-dark.png` and `-light.png` (2481 px wide = A4 at 300 dpi) for Word / Google Docs.
In the app, the same header is `src/components/DocHeader.tsx` (Business Settings → Letterhead) and is used on quotations.

## Run it

```bash
cd marpel
npm install
npm run dev        # http://localhost:5180
# or a production build:
npm run build && npm run preview
```

The app uses hash routes (`/#/admin`, `/#/track` …), so the `dist/` folder can be hosted on any static host
for review.

### Demo accounts (password `demo1234`)

| Username | Role |
|---|---|
| `owner` | Super Administrator (full control, users, data reset) |
| `admin` | Administrator (business operations) |
| `jerome`, `kevin`, `patricia` | Staff (only assigned inquiries, projects, appointments) |

Use the avatar menu → **Prototype: switch account** to jump between roles.

### Client portal demo

`/#/track`: `MTN-8K4P-2Q7D` / PIN `482913` or `MTN-W3BP-7LCX` / PIN `135790`.

## What is real vs simulated

| Works fully in the prototype | Simulated (needs production services) |
|---|---|
| All forms, validation, reference numbers | Email delivery → written to **Notifications → Email log** |
| Inquiry → quotation → approval → project workflow | Live chat realtime → syncs between browser tabs on one computer |
| Quotation builder, preview, print / Save-as-PDF | AI assistant → rule-based demo using admin data (no API key) |
| Projects, milestones, updates, payments, tracking portal | File storage → images compressed into browser storage; other files keep metadata only |
| Booking calendar with availability & double-booking guard | Authentication → demo accounts in browser storage |
| CMS: services, portfolio, blog, testimonials, homepage, about, SEO | Google Maps → styled placeholder + "Open in Maps" link |
| Reports with filters + CSV export | Database → browser `localStorage` (per device) |
| Role-based navigation, route guards, data scoping, audit log | |

All data lives in the browser. **Reset** (floating Prototype bar on the website, or Business Settings →
Data & backup) restores the sample data. Sample dates are generated relative to today, so the dashboard
always looks current.

## Try these scenarios

1. Website → **Request a Quote** → submit → note the `INQ-…` reference → Admin → Inquiries (bell notification + simulated email).
2. Open that inquiry → **Create quotation** → add items → **Send** → **Record approval** → **Convert to project**.
3. Open the website and the admin **Live Chat** in two tabs → start a chat on the site → reply from admin.
4. Chat widget → ask *"How much is CCTV?"*, *"Do you fix iPhones?"*, then *"Request a quotation"* or *"Talk to a person"*.
5. **Book a Consultation** → approve or reschedule it in Admin → Appointments.
6. Admin → **Website Content** → edit the hero → **Publish changes** → view the site.
7. Sign in as `jerome` (staff) and compare what is visible.

## Project structure

```
marpel/
  src/
    lib/            data model (types.ts), sample data, store (persistence + sessions),
                    business workflows (actions.ts), permissions, metrics, demo AI engine
    components/     design system: ui.tsx, charts.tsx, calendar.tsx, chat.tsx, brand.tsx
    public/         public website layout, chat widget, pages
    admin/          dashboard layout and every admin module
  docs/
    ARCHITECTURE.md production plan (Phase 4, after approval)
    schema.sql      PostgreSQL / Supabase schema draft mirroring src/lib/types.ts
  public/           favicon, robots.txt, sitemap.xml, social preview image
```

## Design system

Dark navy (`navy-950 … navy-500`), metallic gold (`gold-50 … gold-700`), white and slate greys.
Typefaces are Sora for display and Inter for body text, both self-hosted. The logo concept (an "M" network
path with a node) is in `src/components/brand.tsx` and can be replaced by uploading a logo in Business Settings.
Chart colours were checked for colour-vision-deficiency separation on the dashboard surface.

## Next step

Review the prototype and request changes. Production development (Phase 4) starts **only after explicit
owner approval**; see `docs/ARCHITECTURE.md`.
