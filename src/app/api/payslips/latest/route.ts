import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Owner-scoped by construction — employee.id is derived from the session, never a
// client-supplied param, matching the pattern used by /api/attendance/today.
export async function GET() {
  try {
    const ctx = await requireCtx();

    const employee = await prisma.employee.findUnique({ where: { userId: ctx.userId } });
    if (!employee) return NextResponse.json({ payslip: null });

    const latest = await prisma.payslip.findFirst({
      where: { employeeId: employee.id },
      include: { payroll: true },
      orderBy: { issuedAt: 'desc' },
    });

    if (!latest) return NextResponse.json({ payslip: null });

    return NextResponse.json({
      payslip: {
        id: latest.id,
        periodStart: latest.payroll.payPeriodStart,
        periodEnd: latest.payroll.payPeriodEnd,
        net: Number(latest.payroll.net),
      },
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
