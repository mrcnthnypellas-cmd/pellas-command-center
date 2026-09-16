# Pellas & Associates Co. — Website

A premium marketing website for **Pellas & Associates Co., Certified Public Accountants**,
built with Next.js 14 (App Router), React, TypeScript, Tailwind CSS, and a local database
(SQLite via Prisma) with a password-protected dashboard for editing content and viewing
consultation requests.

> **This is a standalone project.** It lives in its own folder (`/website`) inside the
> `pellas-command-center` repository, completely separate from the internal
> "Pellas Command Center" staff app in the parent folder. It has its own `package.json`,
> dependencies, and database, and running it has no effect on that other app.
> It is **not deployed anywhere** — it only runs locally until you decide otherwise.

---

## 1. Install & Run (first time)

From inside this `website/` folder:

```bash
npm install
```

The database (`prisma/dev.db`) ships already set up and pre-loaded with the starting
company info and services, so the only thing left is to set your own dashboard login:

```bash
npm run create-admin
```

It'll ask for a username (defaults to `admin`) and a password (minimum 8 characters) —
type them in and press Enter after each. Then run the site:

```bash
npm run dev
```

Open **http://localhost:3000** for the public site, and **http://localhost:3000/admin/login**
to sign in to the dashboard with the username/password you just set.

If port 3000 is already in use, Next.js automatically picks the next free port — check the
`- Local:` line the terminal prints.

Other useful commands:

```bash
npm run build       # production build (also catches type errors)
npm run start        # run the production build locally
npm run typecheck    # TypeScript check only
npm run lint          # ESLint
npm run db:studio     # opens a browser GUI to inspect/edit the database directly
```

---

## 2. The dashboard (`/admin`)

Go to `/admin/login`, sign in, and you get:

- **Overview** — quick counts (new inquiries, total inquiries, services listed).
- **Inquiries** — every submission from the public "Send Inquiry" contact form, with
  name, email, phone, service requested, and message. Change each one's status
  (New / Contacted / Closed) from a dropdown.
- **Site Content** — edit the company name, tagline, hero text, About Us story, address,
  phone numbers, email, business hours, and Facebook link. Saves write straight to the
  database and take effect immediately on the public site (no rebuild needed).
- **Services** — add, edit, or delete the service cards shown on the public site, and
  pick an icon for each from a fixed set.

**Not yet in the dashboard** (still edited via code, see Section 4): industries, the
5-step process, firm values / "why choose us", colors, fonts, images, and the logo.
These change far less often, so keeping them as code keeps the dashboard focused.

### Resetting your dashboard password

Run `npm run create-admin` again any time — it updates the password for that username
(or creates a new admin if you pick a different username).

---

## 3. How content flows

- `data/company.ts`, `data/contact.ts`, `data/services.ts` are now only the **seed
  source** — `npm run db:seed` copies them into the database once. After that, the
  database is the source of truth; editing these files again does nothing unless you
  wipe the database and reseed.
- Everything the dashboard can edit lives in `prisma/dev.db` (SQLite), read via
  `lib/site-content.ts`.
- Submitting the public contact form saves a real row to the `Inquiry` table (see
  `app/api/inquiries/route.ts`) — it shows up under **Inquiries** in the dashboard
  immediately.

`prisma/dev.db` and `.env` are gitignored and **not included if you push this project
to git** — they're specific to your machine. If you ever delete `prisma/dev.db` by
mistake, just re-run Section 1's `db:push` → `db:seed` → `create-admin` steps.

---

## 4. Important: research limitations

The environment this site was built in could not reach `alpellas.com` or Facebook
directly (network access to those domains was blocked). What you'll find here instead:

- **Verified via public search-engine listings** (real, but not re-confirmed against the
  live pages directly): company name variants, address, phone numbers, email, and the
  general service list.
- **Explicit placeholders** for anything that was not found anywhere (business hours,
  the firm's own "About" story in its own words, real photography, the real logo).
- **Nothing was invented** for years of experience, awards, certifications, client
  counts, testimonials, or statistics — those simply aren't on the site until you add
  real, verified ones.

**Before this goes live, open the dashboard's Site Content page and double-check every
field against the real company** (or edit `data/company.ts` / `data/contact.ts` before
your first `npm run db:seed`, since seeding only happens once).

---

## 5. Where to edit the code-only content

| Want to change... | Edit this file |
|---|---|
| Industries served | `data/industries.ts` |
| The 5-step process | `data/process.ts` |
| Firm values / Why Choose Us | `data/values.ts` |
| Navbar / footer links | `data/nav.ts` |

### Images

Put real photos in `public/images/` using these filenames:

```
public/images/hero.jpg
public/images/about.jpg
public/images/industry-business.jpg
public/images/industry-corporate.jpg
public/images/industry-foreign.jpg
public/images/industry-entrepreneurs.jpg
public/images/industry-nonprofit.jpg
public/images/cta.jpg
```

Right now these are rendered by `<PlaceholderImage file="hero.jpg" ... />`
(`components/ui/PlaceholderImage.tsx`) — a tasteful navy/gold "coming soon" panel that
shows exactly which file to add, so nothing looks broken while photography is pending.

**To swap in a real photo:** add the file to `public/images/`, then in the relevant
component (e.g. `components/sections/Hero.tsx`) replace:

```tsx
<PlaceholderImage file="hero.jpg" label="..." className="h-full w-full" />
```

with:

```tsx
import Image from 'next/image';
// ...
<Image src="/images/hero.jpg" alt="Pellas & Associates office" fill priority className="object-cover" />
```

(`fill` requires the parent element to be `position: relative` with a defined size,
which all the current placeholder containers already are.)

### Logo

Currently renders as a "PA" monogram (`components/layout/Logo.tsx`). To use a real
logo image, add the file to `public/images/logo.png`, then edit `Logo.tsx` to render an
`<Image>` instead of the monogram `<span>` when a logo file is set.

### Colors

`tailwind.config.ts` → the `navy` and `gold` color scales, plus `ivory` and `charcoal`.
Every component uses these Tailwind tokens, so changing the scale here updates the
whole site.

### Fonts

`app/layout.tsx` loads two Google Fonts via `next/font`: **Fraunces** (serif, headings)
and **Inter** (sans, body). Swap either import for a different family to change the
typeface everywhere.

### Buttons

`components/ui/Button.tsx` defines the three button styles (`primary`, `secondary`,
`outline-light`) — edit the `variants` object there.

### Sections / animations

Every homepage section is its own component in `components/sections/`, composed in
`app/page.tsx`. Shared building blocks (`Button`, `SectionHeading`, `ServiceCard`,
`AnimateIn`, `PlaceholderImage`, `Container`) live in `components/ui/`.
`components/ui/AnimateIn.tsx` wraps Framer Motion's scroll-triggered fade-up, and
already respects `prefers-reduced-motion` (see `styles/globals.css`).

---

## 6. Deploying later (when you're ready)

This project is not deployed anywhere yet, by design. When you do decide to put it
online, a few things to know:

- SQLite (`prisma/dev.db`) works great for local development but isn't a good fit for
  most hosting platforms (e.g. Vercel's filesystem isn't persistent between requests).
  You'll want to switch `prisma/schema.prisma`'s `datasource` to a hosted database
  (Postgres is the common choice — providers like Neon or Supabase have free tiers)
  before deploying, then run `npm run db:push` and `npm run create-admin` against it.
- Set real values for `DATABASE_URL` and `AUTH_SECRET` (a fresh random one — don't
  reuse the local `.env` value) as environment variables on your host.
- Run `npm run create-admin` once against the production database to set a real
  admin password (don't reuse a local dev password).
- Every route that reads the database is set to render fresh on every request
  (`export const dynamic = 'force-dynamic'`), so dashboard edits show up immediately
  in production too — no extra caching setup needed.

---

## 7. Project structure

```
website/
  app/
    admin/          # Dashboard: /admin/login, /admin (overview), inquiries, content, services
    api/             # /api/inquiries (public form), /api/admin/* (dashboard actions)
    layout.tsx, page.tsx, sitemap.ts, robots.ts, icon.svg
  components/
    admin/          # Dashboard-only client components (forms, editors)
    layout/          # Navbar, Footer, Logo
    sections/        # Hero, AboutSection, ServicesSection, ContactSection, etc.
    ui/               # Reusable primitives: Button, ServiceCard, AnimateIn, ...
  data/              # Seed-only content (industries/process/values still live here directly)
  lib/               # db.ts (Prisma client), site-content.ts (DB → UI shape), auth.ts, utils.ts
  prisma/            # schema.prisma, seed.ts, dev.db (gitignored)
  scripts/           # create-admin.ts
  public/images/     # Where real photography + logo go
  styles/            # Tailwind global stylesheet
```
