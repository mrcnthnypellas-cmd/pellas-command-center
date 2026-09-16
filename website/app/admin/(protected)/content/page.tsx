import { db } from '@/lib/db';
import { ContentForm } from '@/components/admin/ContentForm';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const settings = await db.siteSettings.findUnique({ where: { id: 'main' } });
  if (!settings) {
    return (
      <p className="border border-navy-900/10 bg-white p-8 text-sm text-navy-600">
        No site content found. Run <code>npm run db:seed</code> in the project terminal first.
      </p>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-2xl text-navy-950">Site Content</h1>
      <p className="mt-2 text-sm text-navy-600">
        Edits here update the company info, About section, and contact details shown across the public site.
      </p>
      <div className="mt-8">
        <ContentForm
          initialValues={{
            companyName: settings.companyName,
            legalName: settings.legalName,
            shortName: settings.shortName,
            designation: settings.designation,
            tagline: settings.tagline,
            taglineEyebrow: settings.taglineEyebrow,
            heroDescription: settings.heroDescription,
            aboutHeadline: settings.aboutHeadline,
            aboutStory: settings.aboutStory,
            addressLine1: settings.addressLine1,
            addressLine2: settings.addressLine2,
            addressCountry: settings.addressCountry,
            phone1: settings.phone1,
            phone2: settings.phone2,
            email: settings.email,
            hoursWeekday: settings.hoursWeekday,
            hoursWeekend: settings.hoursWeekend,
            facebookUrl: settings.facebookUrl,
          }}
        />
      </div>
    </div>
  );
}
