import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { updateUserSchema } from '@/lib/validation/user';
import { hashPassword } from '@/lib/password';
import { writeAuditLog } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'user', action: 'read', resourceCompanyId: ctx.companyId });

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: { employee: true, client: true },
    });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (ctx.role !== 'SUPER_ADMIN' && user.companyId !== ctx.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ user });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      include: { employee: true, client: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ctx.role === 'SUPER_ADMIN') {
      requireAbility(ctx, { resource: 'user', action: 'update', resourceCompanyId: null });
    } else {
      requireAbility(ctx, { resource: 'user', action: 'update', resourceCompanyId: ctx.companyId });
      if (existing.companyId !== ctx.companyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (existing.role === 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Only Super Admin can edit another Super Admin' }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    if (ctx.role !== 'SUPER_ADMIN') {
      if (input.role === 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Only Super Admin can promote to Super Admin' }, { status: 403 });
      }
      if (input.companyId && input.companyId !== ctx.companyId) {
        return NextResponse.json({ error: 'Cannot assign a user to another company' }, { status: 403 });
      }
    }
    // Prevent a Super Admin from locking themselves out.
    if (existing.id === ctx.userId && input.status === 'INACTIVE') {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
    }

    // Partial update — anything not present in this request keeps its current value.
    // `role` in particular must fall back to the EXISTING role, not just "no role
    // sent", so companyId resolution below doesn't misfire on a status-only PATCH.
    const role = input.role ?? existing.role;
    const companyId = role === 'SUPER_ADMIN' ? null : (input.companyId ?? existing.companyId ?? null);
    if (role !== 'SUPER_ADMIN' && !companyId) {
      return NextResponse.json({ error: 'A company is required for this role' }, { status: 400 });
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: existing.id },
        data: {
          companyId,
          role,
          firstName: input.firstName ?? existing.firstName,
          lastName: input.lastName ?? existing.lastName,
          phone: input.phone ?? existing.phone,
          ...(input.username ? { email: input.username } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      if (role === 'EMPLOYEE' && existing.employee) {
        await tx.employee.update({
          where: { userId: existing.id },
          data: {
            companyId: companyId!,
            department: input.department ?? existing.employee.department,
            position: input.position ?? existing.employee.position,
          },
        });
      }

      if (role === 'CLIENT' && existing.client) {
        await tx.client.update({
          where: { userId: existing.id },
          data: {
            companyId: companyId!,
            businessName: input.businessName ?? existing.client.businessName,
          },
        });
      }

      return user;
    });

    await writeAuditLog({
      companyId,
      userId: ctx.userId,
      action: 'user.update',
      entityType: 'User',
      entityId: updated.id,
      previousValue: { role: existing.role, status: existing.status, companyId: existing.companyId },
      newValue: { role: updated.role, status: updated.status, companyId: updated.companyId },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
      const message = target.includes('email') ? 'That username is already taken' : 'Employee code or client code already in use';
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return handleError(err);
  }
}

// Permanently deletes the user AND, via onDelete: Cascade, their Employee/Client
// record and everything scoped to it (Attendance, Payroll, Payslips, Transactions,
// Notifications, ...). Distinct from the Deactivate toggle — deactivation is
// reversible and keeps history; this is not. See EditUserForm's Danger Zone for the
// confirmation UI that makes this hard to trigger by accident.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ctx.role === 'SUPER_ADMIN') {
      requireAbility(ctx, { resource: 'user', action: 'delete', resourceCompanyId: null });
    } else {
      requireAbility(ctx, { resource: 'user', action: 'delete', resourceCompanyId: ctx.companyId });
      if (existing.companyId !== ctx.companyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (existing.role === 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Only Super Admin can delete another Super Admin' }, { status: 403 });
      }
    }

    if (existing.id === ctx.userId) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    if (existing.role === 'SUPER_ADMIN') {
      const otherSuperAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN', id: { not: existing.id } } });
      if (otherSuperAdmins === 0) {
        return NextResponse.json({ error: 'Cannot delete the last remaining Super Admin' }, { status: 400 });
      }
    }

    await prisma.user.delete({ where: { id: existing.id } });

    await writeAuditLog({
      companyId: existing.companyId,
      userId: ctx.userId,
      action: 'user.delete',
      entityType: 'User',
      entityId: existing.id,
      previousValue: { email: existing.email, role: existing.role, companyId: existing.companyId },
      newValue: null,
    });

    return NextResponse.json({ ok: true });
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
