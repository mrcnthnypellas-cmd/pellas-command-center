import { db } from './db';
import type { Service } from '@/data/services';

export type CompanyData = {
  name: string;
  legalName: string;
  shortName: string;
  designation: string;
  tagline: string;
  taglineEyebrow: string;
  heroDescription: string;
  aboutHeadline: string;
  aboutStory: string[];
  logo: { initials: string; imageSrc: string | null };
};

export type ContactData = {
  address: { line1: string; line2: string; country: string };
  phones: string[];
  email: string;
  hours: { days: string; time: string }[];
  social: { facebook: string };
};

/**
 * Reads the single dashboard-editable SiteSettings row and reshapes it into
 * the same {company, contact} shape the UI components already expect.
 * Throws if the database hasn't been seeded yet (run `npm run db:seed`).
 */
export async function getSiteContent(): Promise<{ company: CompanyData; contact: ContactData }> {
  const s = await db.siteSettings.findUnique({ where: { id: 'main' } });
  if (!s) {
    throw new Error(
      'SiteSettings row not found. Run `npm run db:seed` to populate the database from data/company.ts and data/contact.ts.'
    );
  }
  return {
    company: {
      name: s.companyName,
      legalName: s.legalName,
      shortName: s.shortName,
      designation: s.designation,
      tagline: s.tagline,
      taglineEyebrow: s.taglineEyebrow,
      heroDescription: s.heroDescription,
      aboutHeadline: s.aboutHeadline,
      aboutStory: s.aboutStory.split('\n\n').filter(Boolean),
      // Logo image upload isn't part of the dashboard yet — still set in data/company.ts.
      logo: { initials: 'PA', imageSrc: null },
    },
    contact: {
      address: { line1: s.addressLine1, line2: s.addressLine2, country: s.addressCountry },
      phones: [s.phone1, s.phone2].filter(Boolean),
      email: s.email,
      hours: [
        { days: 'Monday – Friday', time: s.hoursWeekday },
        { days: 'Saturday – Sunday', time: s.hoursWeekend },
      ],
      social: { facebook: s.facebookUrl },
    },
  };
}

export async function getServicesList(): Promise<Service[]> {
  const rows = await db.service.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon as Service['icon'],
  }));
}
