import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createTransactionSchema } from '@/lib/validation/transaction';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();

    if (ctx.role === 'CLIENT') {
      const client = await prisma.client.findUnique({ where: { userId: ctx.userId } });
      if (!client) return NextResponse.json({ transactions: [] });

      requireAbility(ctx, {
        resource: 'transaction',
        action: 'list',
        resourceCompanyId: client.companyId,
        ownerUserId: ctx.userId,
      });

      // Owner-scoped by construction — clientId is derived from the session, never a
      // client-supplied param (that's exactly what the Client A / Client B negative
      // test case in spec §3 guards against).
      const transactions = await prisma.transaction.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ transactions });
    }

    requireAbility(ctx, { resource: 'transaction', action: 'list', resourceCompanyId: ctx.companyId });
    const transactions = await prisma.transaction.findMany({
      where: withCompanyScope(ctx),
      include: { client: { include: { user: true } }, assignedStaffUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ transactions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped staff can create transactions' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'transaction', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    assertSameCompany(ctx, client);

    const transaction = await prisma.transaction.create({
      data: {
        companyId: ctx.companyId,
        clientId: input.clientId,
        transactionCode: input.transactionCode,
        service: input.service,
        amount: input.amount,
        assignedStaffUserId: input.assignedStaffUserId,
        remarks: input.remarks,
        status: 'PENDING',
      },
    });

    await prisma.notification.create({
      data: {
        companyId: ctx.companyId,
        userId: client!.userId,
        type: 'TRANSACTION_UPDATE',
        title: 'New transaction created',
        body: `${transaction.service} — ${transaction.transactionCode}`,
        payload: { transactionId: transaction.id },
      },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'transaction.create',
      entityType: 'Transaction',
      entityId: transaction.id,
      previousValue: null,
      newValue: { transactionCode: transaction.transactionCode, amount: input.amount },
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Transaction code already in use' }, { status: 409 });
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
