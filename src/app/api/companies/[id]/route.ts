import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

const geofenceSchema = z
  .object({
    geofenceEnabled: z.boolean(),
    geofenceLat: z.number().min(-90).max(90).nullable(),
    geofenceLng: z.number().min(-180).max(180).nullable(),
    geofenceRadiusMeters: z.number().int().min(10).max(50000).nullable(),
  })
  .refine(
    (data) =>
      !data.geofenceEnabled ||
      (data.geofenceLat != null && data.geofenceLng != null && data.geofenceRadiusMeters != null),
    { message: 'Latitude, longitude, and radius are required when the geofence is enabled.' },
  );

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'company', action: 'update', resourceCompanyId: null });

    const existing = await prisma.company.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const parsed = geofenceSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const company = await prisma.company.update({
      where: { id: params.id },
      data: parsed.data,
    });

    await writeAuditLog({
      companyId: company.id,
      userId: ctx.userId,
      action: 'company.geofence.update',
      entityType: 'Company',
      entityId: company.id,
      previousValue: {
        geofenceEnabled: existing.geofenceEnabled,
        geofenceLat: existing.geofenceLat,
        geofenceLng: existing.geofenceLng,
        geofenceRadiusMeters: existing.geofenceRadiusMeters,
      },
      newValue: parsed.data,
    });

    return NextResponse.json({ company });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
