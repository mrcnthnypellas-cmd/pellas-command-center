import { CheckCircle2, CircleDashed, FlaskConical, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from '../components/ui';

const FEATURES: [string, 'Working' | 'Simulated', string][] = [
  ['Public website, service pages, portfolio, blog, contact', 'Working', 'All content is read from the CMS data and editable in the admin.'],
  ['Inquiry / quotation request form + reference number', 'Working', 'Validates input, saves the inquiry, creates/links the customer, notifies admin.'],
  ['Inquiry management (status, notes, assignment, comms log, history)', 'Working', 'Full CRUD and workflow inside the prototype.'],
  ['Customer database (add, edit, search, archive, linked records)', 'Working', ''],
  ['Quotation generator (items, discounts, VAT, terms, preview, print/PDF)', 'Working', 'PDF uses the browser’s “Save as PDF” print dialog.'],
  ['Quotation approval tracking + convert to project', 'Working', 'Customers can approve from the client portal.'],
  ['Project management, milestones, updates, payments, activity', 'Working', ''],
  ['Customer project tracking portal (ref + PIN)', 'Working', 'Production adds real customer accounts and database-level access rules.'],
  ['Appointment booking with live availability & double-booking guard', 'Working', 'Rules enforced in the browser; production enforces them in the database too.'],
  ['Calendar, approve/reject, reschedule, availability & blackout dates', 'Working', ''],
  ['Website content, services, portfolio, blog, testimonials, SEO fields', 'Working', 'Draft / publish / unpublish / archive / delete.'],
  ['Reports with date & category filters, CSV export', 'Working', 'PDF export via print.'],
  ['Role-based navigation, route protection, data scoping, audit log', 'Working', 'Prototype-level security (see below).'],
  ['Dashboard notifications (bell, unread counter, history)', 'Working', ''],
  ['Live chat between website visitor and admin', 'Simulated', 'Syncs across browser tabs on this computer. Production: Supabase Realtime.'],
  ['AI inquiry assistant', 'Simulated', 'Rule-based demo using your admin data. Production: Claude API via a secure server function.'],
  ['Email notifications', 'Simulated', 'Written to Notifications → Email log. Production: SMTP / Resend / SendGrid.'],
  ['File uploads', 'Simulated', 'Images are compressed and kept in browser storage; other files keep name/size only. Production: cloud storage with signed links.'],
  ['Login & passwords', 'Simulated', 'Demo accounts in browser storage. Production: Supabase Auth, hashed passwords, password reset, optional 2FA.'],
  ['Google Maps', 'Simulated', 'Styled placeholder + “Open in Maps” link. Production: Maps Embed API.'],
  ['Data storage', 'Simulated', 'Browser localStorage (per device). Production: PostgreSQL (see docs/schema.sql).'],
];

const SCENARIOS = [
  ['Submit an inquiry', 'Website → Request a Quote → submit. Note the reference number. Then Admin → Inquiries: it appears as New, with a bell notification and a simulated email.'],
  ['Inquiry → quotation → project', 'Open an inquiry → Create quotation → add items → Send → Record approval → Convert to project. The project gets a tracking reference and milestones.'],
  ['Customer tracking', 'Website → Track Project, use MTN-8K4P-2Q7D / PIN 482913. Post an update visible to the customer in Admin → Projects and refresh the portal.'],
  ['Live chat across tabs', 'Open the website in one tab and the admin Live Chat in another. Start a chat on the website — reply from the admin and watch it appear.'],
  ['AI assistant', 'Open the chat widget → ask “How much is CCTV?”, “Do you fix iPhones?”, then “Request a quotation” to capture a lead, or “Talk to a person” for handoff.'],
  ['Booking', 'Website → Book a Consultation. Fully booked slots are disabled. Approve it in Admin → Appointments, or reschedule it.'],
  ['Roles', 'Use the avatar menu → “switch account” to sign in as Staff (jerome) and compare what they can see.'],
  ['Edit the website', 'Admin → Website Content → change the hero headline → Publish changes → open the website.'],
];

export default function Guide() {
  return (
    <>
      <PageHeader eyebrow="Phase 1 · Prototype" title="Prototype guide" subtitle="What works now, what is simulated, and how to test each workflow." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Feature status" subtitle="Working = fully interactive in the prototype. Simulated = behaves realistically but needs a production service." />
          <Table>
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th>Prototype</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(([f, s, n]) => (
                <tr key={f}>
                  <Td className="text-slate-200">{f}</Td>
                  <Td>
                    {s === 'Working' ? (
                      <Badge tone="green">
                        <CheckCircle2 className="h-3 w-3" /> Working
                      </Badge>
                    ) : (
                      <Badge tone="violet">
                        <FlaskConical className="h-3 w-3" /> Simulated
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-400">{n}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Demo accounts" subtitle="Password for all: demo1234" />
            <ul className="divide-y divide-white/[0.05] text-sm">
              {[
                ['owner', 'Super Administrator'],
                ['admin', 'Administrator'],
                ['jerome', 'Staff — Network Engineer'],
                ['kevin', 'Staff — CCTV Technician'],
                ['patricia', 'Staff — Web & Software'],
              ].map(([u, r]) => (
                <li key={u} className="flex justify-between px-5 py-2.5">
                  <span className="font-mono text-gold-200">{u}</span>
                  <span className="text-slate-400">{r}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Client portal demo" />
            <div className="space-y-1 p-5 font-mono text-sm text-slate-300">
              <p>MTN-8K4P-2Q7D · PIN 482913</p>
              <p>MTN-W3BP-7LCX · PIN 135790</p>
              <Link to="/track" target="_blank" className="mt-2 block font-sans text-xs text-gold-200 underline">
                Open Track Project
              </Link>
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-2">
          <CardHeader title="Suggested test scenarios" />
          <ol className="divide-y divide-white/[0.05]">
            {SCENARIOS.map(([t, d], i) => (
              <li key={t} className="flex gap-4 px-5 py-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-xs font-semibold text-gold-200">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-white">{t}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title="After your approval (Phase 4)" subtitle="Not started — requires explicit owner approval" />
          <ul className="space-y-2.5 p-5 text-sm text-slate-300">
            {[
              'Next.js production build with server rendering for SEO',
              'Supabase: PostgreSQL, Auth, Storage, Realtime, row-level security',
              'Real email delivery (SMTP / transactional provider)',
              'Claude-powered AI assistant via secure server function',
              'Cloud deployment, custom domain, SSL, backups, monitoring',
              'Security hardening & penetration checklist',
              'Future: Android/iOS apps, staff app, online payments, SMS, ticketing, maintenance contracts, IT inventory',
            ].map((x) => (
              <li key={x} className="flex gap-2.5">
                {x.startsWith('Future') ? <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                {x}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
