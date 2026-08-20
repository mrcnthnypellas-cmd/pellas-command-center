import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updateCountWorkerSchema } from '@/lib/validation/countEvent';
import { writeAuditLog } from '@/lib/audit';

async function loadEventForWorker(eventId: string, workerId: string) {
  const worker = await prisma.countWorker.findUnique({ where: { id: workerId } });
  if (!worker || worker.countEventId !== eventId) return { worker: null, event: null };
  const event = await prisma.countEvent.findUnique({ where: { id: eventId } });
  return { worker, event };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; workerId: string } },
) {
  try {
    const ctx = await requireCtx();

    const { worker, event } = await loadEventForWorker(params.id, params.workerId);
    if (!worker || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    assertSameCompany(ctx, event);
    requireAbility(ctx, { resource: 'countEvent', action: 'update', resourceCompanyId: event.companyId });

    const parsed = updateCountWorkerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.countWorker.update({
      where: { id: params.workerId },
      data: parsed.data,
    });

    return NextResponse.json({ worker: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; workerId: string } },
) {
  try {
    const ctx = await requireCtx();

    const { worker, event } = await loadEventForWorker(params.id, params.workerId);
    if (!worker || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    assertSameCompany(ctx, event);
    requireAbility(ctx, { resource: 'countEvent', action: 'update', resourceCompanyId: event.companyId });

    await prisma.countWorker.delete({ where: { id: params.workerId } });

    await writeAuditLog({
      companyId: event.companyId,
      userId: ctx.userId,
      action: 'countWorker.delete',
      entityType: 'CountWorker',
      entityId: params.workerId,
      previousValue: { name: worker.name },
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
