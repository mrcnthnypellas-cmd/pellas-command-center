import Link from 'next/link';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const [newCount, totalCount, serviceCount] = await Promise.all([
    db.inquiry.count({ where: { status: 'NEW' } }),
    db.inquiry.count(),
    db.service.count(),
  ]);

  return (
    <div>
      <h1 className="font-serif text-2xl text-navy-950">Overview</h1>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard label="New Inquiries" value={newCount} href="/admin/inquiries" accent />
        <StatCard label="Total Inquiries" value={totalCount} href="/admin/inquiries" />
        <StatCard label="Services Listed" value={serviceCount} href="/admin/services" />
      </div>

      <div className="mt-10 border border-navy-900/10 bg-white p-6 text-sm text-navy-600">
        <p>
          Edit company info, contact details, and business hours under <strong>Site Content</strong>. Add, edit, or
          remove service cards under <strong>Services</strong>. Consultation requests submitted through the public
          contact form show up under <strong>Inquiries</strong>.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className={`block border p-6 transition-colors ${
        accent ? 'border-gold-500 bg-navy-950' : 'border-navy-900/10 bg-white hover:border-navy-900/30'
      }`}
    >
      <p className={`text-3xl font-serif ${accent ? 'text-gold-400' : 'text-navy-950'}`}>{value}</p>
      <p className={`mt-2 text-sm ${accent ? 'text-navy-200' : 'text-navy-600'}`}>{label}</p>
    </Link>
  );
}
