import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { NewCompanyForm } from '@/components/companies/NewCompanyForm';
import { GeofenceForm } from '@/components/companies/GeofenceForm';

export default async function CompaniesPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const companies = await prisma.company.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Companies</h1>
        <p className="text-sm text-slate-500">{companies.length} compan(y/ies)</p>
      </div>

      <NewCompanyForm />

      <div className="space-y-4">
        {companies.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{c.name}</p>
                <p className="text-sm text-slate-500">
                  {c._count.users} user(s) · Created {formatDate(c.createdAt)}
                </p>
                <p className="mt-1 text-xs">
                  {c.geofenceEnabled ? (
                    <span className="badge bg-amber-50 text-amber-700">
                      Login restricted to set location ({c.geofenceRadiusMeters}m radius)
                    </span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-600">Login unrestricted</span>
                  )}
                </p>
              </div>
              <GeofenceForm
                companyId={c.id}
                companyName={c.name}
                geofenceEnabled={c.geofenceEnabled}
                geofenceLat={c.geofenceLat}
                geofenceLng={c.geofenceLng}
                geofenceRadiusMeters={c.geofenceRadiusMeters}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
