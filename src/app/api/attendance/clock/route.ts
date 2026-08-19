import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { clockEventSchema } from '@/lib/validation/attendance';
import { distanceMeters } from '@/lib/geo';

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const employee = await prisma.employee.findUnique({
      where: { userId: ctx.userId },
      include: { company: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'No employee record for this user' }, { status: 400 });
    }

    requireAbility(ctx, {
      resource: 'attendance',
      action: 'create',
      resourceCompanyId: employee.companyId,
      ownerUserId: ctx.userId,
    });

    const body = await req.json();
    const parsed = clockEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Time In / Time Out are gated by the same company geofence used for login —
    // one location, configured once by Super Admin.
    if (employee.company.geofenceEnabled) {
      const { geofenceLat, geofenceLng, geofenceRadiusMeters } = employee.company;
      if (parsed.data.latitude == null || parsed.data.longitude == null) {
        return NextResponse.json(
          { error: 'Location access is required to time in/out. Please allow location permissions and try again.' },
          { status: 400 },
        );
      }
      if (geofenceLat != null && geofenceLng != null && geofenceRadiusMeters != null) {
        const distance = distanceMeters(parsed.data.latitude, parsed.data.longitude, geofenceLat, geofenceLng);
        if (distance > geofenceRadiusMeters) {
          return NextResponse.json(
            { error: 'You are outside the allowed location for time in/out.' },
            { status: 400 },
          );
        }
      }
    }

    const attendance = await prisma.attendance.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        type: parsed.data.type,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        device: parsed.data.device,
        source: 'web',
      },
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
