import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createEmployeeSchema } from '@/lib/validation/employee';
import { serializeEmployee } from '@/lib/serializers/employee';
import { writeAuditLog } from '@/lib/audit';
import { generateTempPassword, hashPassword } from '@/lib/password';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'employee', action: 'list', resourceCompanyId: ctx.companyId });

    const employees = await prisma.employee.findMany({
      where: withCompanyScope(ctx),
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      employees: employees.map((e) => serializeEmployee(e, ctx.role, ctx.userId)),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped admins can create employees' }, { status: 400 });
    }

    requireAbility(ctx, { resource: 'employee', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // Only HR Admin / Company Admin / Super Admin may set confidential fields — even
    // if the request body includes them, an IT Admin (who has no 'employee.create'
    // ability at all, so never reaches here) or any other caller without
    // 'employee.confidential' write access gets them silently dropped, not honored.
    const canSetConfidential = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN'].includes(ctx.role);

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const employee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId: ctx.companyId!,
          role: 'EMPLOYEE',
          email: input.email.toLowerCase().trim(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          status: 'ACTIVE',
        },
      });

      return tx.employee.create({
        data: {
          companyId: ctx.companyId!,
          userId: user.id,
          employeeCode: input.employeeCode,
          department: input.department,
          position: input.position,
          hireDate: input.hireDate,
          employmentStatus: input.employmentStatus,
          salary: canSetConfidential ? input.salary : undefined,
          sssNumber: canSetConfidential ? input.sssNumber : undefined,
          philhealthNumber: canSetConfidential ? input.philhealthNumber : undefined,
          pagibigNumber: canSetConfidential ? input.pagibigNumber : undefined,
          tinNumber: canSetConfidential ? input.tinNumber : undefined,
        },
        include: { user: true },
      });
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'employee.create',
      entityType: 'Employee',
      entityId: employee.id,
      previousValue: null,
      newValue: { employeeCode: employee.employeeCode, email: employee.user.email },
    });

    return NextResponse.json(
      {
        employee: serializeEmployee(employee, ctx.role, ctx.userId),
        tempPassword, // shown once — admin must relay this to the new employee out of band
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Email or employee code already in use' }, { status: 409 });
    }
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
