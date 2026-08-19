import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updateEmployeeSchema } from '@/lib/validation/employee';
import { serializeEmployee } from '@/lib/serializers/employee';
import { writeAuditLog } from '@/lib/audit';

async function loadEmployee(id: string) {
  return prisma.employee.findUnique({ where: { id }, include: { user: true } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const employee = await loadEmployee(params.id);
    assertSameCompany(ctx, employee); // handles both "not found" and cross-company by ID (spec §3)

    const isSelf = employee!.userId === ctx.userId;
    requireAbility(ctx, {
      resource: 'employee',
      action: 'read',
      resourceCompanyId: employee!.companyId,
      ownerUserId: isSelf ? ctx.userId : undefined,
    });

    return NextResponse.json({ employee: serializeEmployee(employee!, ctx.role, ctx.userId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const existing = await loadEmployee(params.id);
    assertSameCompany(ctx, existing);

    requireAbility(ctx, { resource: 'employee', action: 'update', resourceCompanyId: existing!.companyId });

    const body = await req.json();
    const parsed = updateEmployeeSchema.safeParse({ ...body, id: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    const canSetConfidential = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN'].includes(ctx.role);

    const previousValue = {
      department: existing!.department,
      position: existing!.position,
      employmentStatus: existing!.employmentStatus,
      salary: existing!.salary ? Number(existing!.salary) : null,
    };

    const updated = await prisma.$transaction(async (tx) => {
      if (input.firstName || input.lastName || input.phone) {
        await tx.user.update({
          where: { id: existing!.userId },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
          },
        });
      }

      return tx.employee.update({
        where: { id: params.id },
        data: {
          department: input.department,
          position: input.position,
          employmentStatus: input.employmentStatus,
          hireDate: input.hireDate,
          ...(canSetConfidential
            ? {
                salary: input.salary,
                sssNumber: input.sssNumber,
                philhealthNumber: input.philhealthNumber,
                pagibigNumber: input.pagibigNumber,
                tinNumber: input.tinNumber,
              }
            : {}),
        },
        include: { user: true },
      });
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'employee.update',
      entityType: 'Employee',
      entityId: updated.id,
      previousValue,
      newValue: {
        department: updated.department,
        position: updated.position,
        employmentStatus: updated.employmentStatus,
        salary: updated.salary ? Number(updated.salary) : null,
      },
    });

    return NextResponse.json({ employee: serializeEmployee(updated, ctx.role, ctx.userId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const existing = await loadEmployee(params.id);
    assertSameCompany(ctx, existing);

    requireAbility(ctx, { resource: 'employee', action: 'delete', resourceCompanyId: existing!.companyId });

    // Soft-delete via user status rather than hard-deleting the record, to preserve
    // attendance/payroll/asset history integrity.
    await prisma.user.update({ where: { id: existing!.userId }, data: { status: 'INACTIVE' } });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'employee.deactivate',
      entityType: 'Employee',
      entityId: existing!.id,
      previousValue: { status: existing!.user.status },
      newValue: { status: 'INACTIVE' },
    });

    return NextResponse.json({ success: true });
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
