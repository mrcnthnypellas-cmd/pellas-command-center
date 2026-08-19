import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updateTransactionStatusSchema } from '@/lib/validation/transaction';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const transaction = await prisma.transaction.findUnique({ where: { id: params.id }, include: { client: true } });
    assertSameCompany(ctx, transaction);
    requireAbility(ctx, { resource: 'transaction', action: 'update', resourceCompanyId: transaction!.companyId });

    const body = await req.json();
    const parsed = updateTransactionStatusSchema.safeParse({ ...body, id: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const previousStatus = transaction!.status;
    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: { status: parsed.data.status, remarks: parsed.data.remarks },
    });

    await prisma.notification.create({
      data: {
        companyId: transaction!.companyId,
        userId: transaction!.client.userId,
        type: 'TRANSACTION_UPDATE',
        title: `Transaction ${updated.transactionCode} is now ${updated.status.toLowerCase()}`,
        payload: { transactionId: updated.id },
      },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'transaction.status_change',
      entityType: 'Transaction',
      entityId: updated.id,
      previousValue: { status: previousStatus },
      newValue: { status: updated.status },
    });

    return NextResponse.json({ transaction: updated });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
