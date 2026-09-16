import { db } from '@/lib/db';
import { InquiryStatusSelect } from '@/components/admin/InquiryStatusSelect';

export const dynamic = 'force-dynamic';

export default async function InquiriesPage() {
  const inquiries = await db.inquiry.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div>
      <h1 className="font-serif text-2xl text-navy-950">Inquiries</h1>
      <p className="mt-2 text-sm text-navy-600">
        Consultation requests submitted through the public contact form.
      </p>

      {inquiries.length === 0 ? (
        <p className="mt-8 border border-navy-900/10 bg-white p-8 text-sm text-navy-500">
          No inquiries yet. They&rsquo;ll show up here as soon as someone submits the contact form on the site.
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {inquiries.map((inquiry) => (
            <div key={inquiry.id} className="border border-navy-900/10 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-serif text-lg text-navy-950">{inquiry.name}</p>
                  <p className="text-xs text-navy-400">
                    {new Date(inquiry.createdAt).toLocaleString('en-PH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <InquiryStatusSelect id={inquiry.id} status={inquiry.status} />
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {inquiry.company && (
                  <Field label="Company" value={inquiry.company} />
                )}
                <Field label="Email" value={inquiry.email} href={`mailto:${inquiry.email}`} />
                {inquiry.phone && <Field label="Phone" value={inquiry.phone} href={`tel:${inquiry.phone}`} />}
                {inquiry.serviceNeeded && <Field label="Service Needed" value={inquiry.serviceNeeded} />}
              </dl>

              <p className="mt-4 whitespace-pre-wrap border-t border-navy-900/10 pt-4 text-sm text-navy-700">
                {inquiry.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className="text-navy-800">
        {href ? (
          <a href={href} className="hover:text-gold-600">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
