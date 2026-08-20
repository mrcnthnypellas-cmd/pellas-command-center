import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updateCountEventSchema } from '@/lib/validation/countEvent';
import { writeAuditLog } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'countEvent', action: 'read', resourceCompanyId: ctx.companyId });

    const event = await prisma.countEvent.findUnique({
      where: { id: params.id },
      include: { workers: { orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    assertSameCompany(ctx, event);

    return NextResponse.json({ event });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.countEvent.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, existing);
    requireAbility(ctx, { resource: 'countEvent', action: 'update', resourceCompanyId: existing!.companyId });

    const parsed = updateCountEventSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const event = await prisma.countEvent.update({
      where: { id: params.id },
      data: parsed.data,
    });

    await writeAuditLog({
      companyId: event.companyId,
      userId: ctx.userId,
      action: 'countEvent.update',
      entityType: 'CountEvent',
      entityId: event.id,
      previousValue: null,
      newValue: parsed.data,
    });

    return NextResponse.json({ event });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.countEvent.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, existing);
    requireAbility(ctx, { resource: 'countEvent', action: 'delete', resourceCompanyId: existing!.companyId });

    await prisma.countEvent.delete({ where: { id: params.id } });

    await writeAuditLog({
      companyId: existing!.companyId,
      userId: ctx.userId,
      action: 'countEvent.delete',
      entityType: 'CountEvent',
      entityId: params.id,
      previousValue: { siteName: existing!.siteName },
      newValue: null,
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
