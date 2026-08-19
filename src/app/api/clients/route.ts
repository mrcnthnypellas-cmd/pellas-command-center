import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';
import { generateTempPassword, hashPassword } from '@/lib/password';

const createClientSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  clientCode: z.string().min(1).max(50),
  businessName: z.string().max(200).optional(),
});

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'client', action: 'list', resourceCompanyId: ctx.companyId });

    const clients = await prisma.client.findMany({
      where: withCompanyScope(ctx),
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ clients });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped admins can create clients' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'client', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const client = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId: ctx.companyId!,
          role: 'CLIENT',
          email: input.email.toLowerCase().trim(),
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          status: 'ACTIVE',
        },
      });
      return tx.client.create({
        data: {
          companyId: ctx.companyId!,
          userId: user.id,
          clientCode: input.clientCode,
          businessName: input.businessName,
        },
        include: { user: true },
      });
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'client.create',
      entityType: 'Client',
      entityId: client.id,
      previousValue: null,
      newValue: { clientCode: client.clientCode, email: client.user.email },
    });

    return NextResponse.json({ client, tempPassword }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Email or client code already in use' }, { status: 409 });
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
