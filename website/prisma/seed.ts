/**
 * Populates the local database with STARTING content only, taken from the original
 * data/company.ts, data/contact.ts, and data/services.ts files. Create-only and safe
 * to re-run: it never overwrites rows that already exist, so it won't clobber edits
 * you've since made in the dashboard. Run with: npm run db:seed
 */
import { db } from '../lib/db';
import { company } from '../data/company';
import { contact } from '../data/contact';
import { services } from '../data/services';

async function main() {
  const existingSettings = await db.siteSettings.findUnique({ where: { id: 'main' } });
  if (!existingSettings) {
    await db.siteSettings.create({
      data: {
        id: 'main',
        companyName: company.name,
        legalName: company.legalName,
        shortName: company.shortName,
        designation: company.designation,
        tagline: company.tagline,
        taglineEyebrow: company.taglineEyebrow,
        heroDescription: company.heroDescription,
        aboutHeadline: company.aboutHeadline,
        aboutStory: company.aboutStory.join('\n\n'),
        addressLine1: contact.address.line1,
        addressLine2: contact.address.line2,
        addressCountry: contact.address.country,
        phone1: contact.phones[0] ?? '',
        phone2: contact.phones[1] ?? '',
        email: contact.email,
        hoursWeekday: contact.hours[0]?.time ?? '',
        hoursWeekend: contact.hours[1]?.time ?? '',
        facebookUrl: contact.social.facebook,
      },
    });
    console.log('Seeded SiteSettings.');
  } else {
    console.log('SiteSettings already exists — left untouched.');
  }

  let createdServices = 0;
  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    const existing = await db.service.findUnique({ where: { slug: svc.slug } });
    if (!existing) {
      await db.service.create({ data: { ...svc, sortOrder: i } });
      createdServices++;
    }
  }
  console.log(`Seeded ${createdServices} new service(s) (${services.length - createdServices} already existed).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
