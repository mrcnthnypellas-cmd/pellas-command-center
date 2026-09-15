# Pellas & Associates Co. — Website

A premium marketing website for **Pellas & Associates Co., Certified Public Accountants**,
built with Next.js 14 (App Router), React, TypeScript, and Tailwind CSS.

> **This is a standalone project.** It lives in its own folder (`/website`) inside the
> `pellas-command-center` repository, completely separate from the internal
> "Pellas Command Center" staff app in the parent folder. It has its own `package.json`
> and dependencies, and running it has no effect on that other app or its database.
> It is **not deployed anywhere** — it only runs locally until you decide otherwise.

---

## 1. Install & Run

From inside this `website/` folder:

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

If port 3000 is already in use, Next.js will automatically pick the next free port
(3001, 3002, ...) and print the URL it's actually using in the terminal — check the
`- Local:` line in the output.

Other useful commands:

```bash
npm run build      # production build (also catches type errors)
npm run start       # run the production build locally
npm run typecheck   # TypeScript check only
npm run lint         # ESLint
```

---

## 2. Important: research limitations

The environment this site was built in could not reach `alpellas.com` or Facebook
directly (network access to those domains was blocked). What you'll find here instead:

- **Verified via public search-engine listings** (real, but not re-confirmed against the
  live pages directly): company name variants, address, phone numbers, email, and the
  general service list. These are marked `VERIFY` in the data files below.
- **Explicit placeholders** for anything that was not found anywhere (business hours,
  the firm's own "About" story in its own words, real photography, the real logo).
  These are marked `PLACEHOLDER`.
- **Nothing was invented** for years of experience, awards, certifications, client
  counts, testimonials, or statistics, per the brief — those simply aren't on the site
  until you add real, verified ones.

**Before this goes live, go through every file in `/data` and double-check it against
the real company.**

---

## 3. Where to edit things

Everything content-related lives in `/data` as small, typed TypeScript files — no
digging through components required:

| File | Controls |
|---|---|
| `data/company.ts` | Company name, tagline, hero description, About Us story, logo initials |
| `data/contact.ts` | Address, phone numbers, email, business hours, Facebook link |
| `data/services.ts` | Service cards (name, description, icon) + the quick-services bar |
| `data/industries.ts` | Industries/client-types section |
| `data/process.ts` | The 5-step "How We Work" process |
| `data/values.ts` | Firm values card + "Why Choose Us" claims |
| `data/nav.ts` | Navbar / footer navigation links |

Each file has a comment at the top explaining what's safe to edit and what (if
anything) still needs verifying.

### Images

Put real photos in `public/images/` using these filenames (already referenced in the
code as placeholders — see below):

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

`data/company.ts` → `company.logo`. Right now it renders as a "PA" monogram
(`components/layout/Logo.tsx`). Once you have the real logo file:

1. Add it to `public/images/logo.png` (or `.svg`).
2. Set `company.logo.imageSrc = '/images/logo.png'` in `data/company.ts`.
3. In `components/layout/Logo.tsx`, swap the `<span>{company.logo.initials}</span>`
   monogram box for an `<Image src={company.logo.imageSrc} .../>` when `imageSrc` is set.

### Colors

`tailwind.config.ts` → the `navy` and `gold` color scales, plus `ivory` and `charcoal`.
Every component uses these Tailwind tokens (`bg-navy-950`, `text-gold-500`, etc.), so
changing the scale here updates the whole site.

### Fonts

`app/layout.tsx` loads two Google Fonts via `next/font`: **Fraunces** (serif, headings)
and **Inter** (sans, body). Swap either `next/font/google` import for a different family
to change the typeface everywhere.

### Buttons

`components/ui/Button.tsx` defines the three button styles (`primary`, `secondary`,
`outline-light`) used across the site — edit the `variants` object there.

### Navigation

`data/nav.ts` (links) + `components/layout/Navbar.tsx` (behavior/layout) +
`components/layout/Footer.tsx` (footer nav/columns).

### Contact form behavior

`components/sections/ContactForm.tsx`. It validates on submit and shows a success
state — **it does not send anything anywhere yet** (this is called out in the UI itself
so nothing is misleading). To connect it to a real backend later, replace the body of
`handleSubmit` (after validation passes) with a `fetch()` call to an API route, form
service (e.g. Formspree), or your CRM.

### Sections / animations

Every homepage section is its own component in `components/sections/`, composed in
`app/page.tsx`. Shared building blocks (`Button`, `SectionHeading`, `ServiceCard`,
`AnimateIn`, `PlaceholderImage`, `Container`) live in `components/ui/`.
`components/ui/AnimateIn.tsx` wraps Framer Motion's scroll-triggered fade-up — reuse it
around any new content, and it already respects `prefers-reduced-motion` (see
`styles/globals.css`, which also disables it globally for users who request it).

---

## 4. Building for production later

```bash
npm run build
npm run start
```

This site is fully static/SSR-only (no database, no API routes), so `npm run build`
produces a deployable `.next` output. **Do not deploy it** until you've replaced the
placeholder content, verified the data in `/data`, and added real photography and the
logo — see Section 2.

---

## 5. Project structure

```
website/
  app/            # Next.js App Router: layout, page, sitemap, robots, favicon
  components/
    layout/       # Navbar, Footer, Logo
    sections/     # Hero, AboutSection, ServicesSection, ContactSection, etc.
    ui/           # Reusable primitives: Button, ServiceCard, AnimateIn, ...
  data/           # All editable company content (see Section 3)
  lib/            # Small shared utilities (cn/classnames helper)
  public/images/  # Where real photography + logo go
  styles/         # Tailwind global stylesheet
```
