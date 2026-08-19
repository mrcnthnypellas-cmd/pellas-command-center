import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

/** Exposes the caller's own company office location (if set) — used to render the
 * reference pin on the employee Time In/Out map. Not the Super Admin management
 * endpoint; any authenticated user with a company may read their own company's geofence. */
export async function GET() {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) return NextResponse.json({ geofence: null });

    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
    });
    if (!company?.geofenceEnabled) return NextResponse.json({ geofence: null });

    return NextResponse.json({
      geofence: {
        lat: company.geofenceLat,
        lng: company.geofenceLng,
        radiusMeters: company.geofenceRadiusMeters,
      },
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
