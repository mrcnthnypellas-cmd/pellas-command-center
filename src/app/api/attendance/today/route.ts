import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const ctx = await requireCtx();

    const employee = await prisma.employee.findUnique({ where: { userId: ctx.userId } });
    if (!employee) return NextResponse.json({ events: [] });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Owner-scoped by construction: employee.id is derived from ctx.userId above,
    // never taken from client input, so there is no way to request another employee's log.
    const events = await prisma.attendance.findMany({
      where: { employeeId: employee.id, timestamp: { gte: startOfDay, lt: endOfDay } },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
