import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createPayrollSchema } from '@/lib/validation/payroll';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'payroll', action: 'list', resourceCompanyId: ctx.companyId });

    const payrolls = await prisma.payroll.findMany({
      where: withCompanyScope(ctx),
      include: { employee: { include: { user: true } } },
      orderBy: { payPeriodStart: 'desc' },
    });

    return NextResponse.json({ payrolls });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped admins can create payroll' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'payroll', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createPayrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    assertSameCompany(ctx, employee);

    const totalDeductions =
      input.sssDeduction + input.philhealthDeduction + input.pagibigDeduction + input.taxDeduction + input.otherDeductions;
    const net = input.gross - totalDeductions;
    if (net < 0) {
      return NextResponse.json({ error: 'Deductions exceed gross pay' }, { status: 400 });
    }

    const payroll = await prisma.payroll.create({
      data: {
        companyId: ctx.companyId,
        employeeId: input.employeeId,
        payPeriodStart: input.payPeriodStart,
        payPeriodEnd: input.payPeriodEnd,
        gross: input.gross,
        sssDeduction: input.sssDeduction,
        philhealthDeduction: input.philhealthDeduction,
        pagibigDeduction: input.pagibigDeduction,
        taxDeduction: input.taxDeduction,
        otherDeductions: input.otherDeductions,
        otherDeductionsNote: input.otherDeductionsNote,
        net,
        status: 'DRAFT',
        processedByUserId: ctx.userId,
      },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'payroll.create',
      entityType: 'Payroll',
      entityId: payroll.id,
      previousValue: null,
      newValue: { employeeId: input.employeeId, gross: input.gross, net },
    });

    return NextResponse.json({ payroll }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
