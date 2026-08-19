import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { createUserSchema } from '@/lib/validation/user';
import { hashPassword } from '@/lib/password';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'user', action: 'list', resourceCompanyId: ctx.companyId });

    const users = await prisma.user.findMany({
      where: ctx.role === 'SUPER_ADMIN' ? {} : { companyId: ctx.companyId },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ users });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // Only Super Admin may create another Super Admin or assign a company other than
    // their own; Company Admin may create any other role but only within their company.
    if (ctx.role === 'SUPER_ADMIN') {
      requireAbility(ctx, { resource: 'user', action: 'create', resourceCompanyId: null });
    } else {
      requireAbility(ctx, { resource: 'user', action: 'create', resourceCompanyId: ctx.companyId });
      if (input.role === 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Only Super Admin can create another Super Admin' }, { status: 403 });
      }
      if (input.companyId && input.companyId !== ctx.companyId) {
        return NextResponse.json({ error: 'Cannot assign a user to another company' }, { status: 403 });
      }
    }

    const passwordHash = await hashPassword(input.password);
    const companyId = input.role === 'SUPER_ADMIN' ? null : (input.companyId ?? ctx.companyId ?? null);
    if (input.role !== 'SUPER_ADMIN' && !companyId) {
      return NextResponse.json({ error: 'A company is required for this role' }, { status: 400 });
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId,
          role: input.role,
          email: input.username.toLowerCase().trim(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          status: 'ACTIVE',
        },
      });

      if (input.role === 'EMPLOYEE') {
        await tx.employee.create({
          data: {
            companyId: companyId!,
            userId: created.id,
            employeeCode: input.employeeCode!,
            department: input.department!,
            position: input.position!,
            hireDate: new Date(),
          },
        });
      }

      if (input.role === 'CLIENT') {
        await tx.client.create({
          data: {
            companyId: companyId!,
            userId: created.id,
            clientCode: input.clientCode!,
            businessName: input.businessName,
          },
        });
      }

      return created;
    });

    await writeAuditLog({
      companyId,
      userId: ctx.userId,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      previousValue: null,
      newValue: { username: user.email, role: user.role },
    });

    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Username, employee code, or client code already in use' }, { status: 409 });
    }
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
