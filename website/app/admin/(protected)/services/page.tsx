import { db } from '@/lib/db';
import { ServicesEditor } from '@/components/admin/ServicesEditor';
import type { Service } from '@/data/services';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const rows = await db.service.findMany({ orderBy: { sortOrder: 'asc' } });
  const services = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon as Service['icon'],
  }));

  return (
    <div>
      <h1 className="font-serif text-2xl text-navy-950">Services</h1>
      <p className="mt-2 text-sm text-navy-600">
        These show up as the service cards on the public site, in this order.
      </p>
      <div className="mt-8">
        <ServicesEditor services={services} />
      </div>
    </div>
  );
}
