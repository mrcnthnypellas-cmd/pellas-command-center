import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { countWorkerSchema } from '@/lib/validation/countEvent';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const event = await prisma.countEvent.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, event);
    requireAbility(ctx, { resource: 'countEvent', action: 'update', resourceCompanyId: event!.companyId });

    const parsed = countWorkerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const maxSort = await prisma.countWorker.aggregate({
      where: { countEventId: params.id },
      _max: { sortOrder: true },
    });

    const worker = await prisma.countWorker.create({
      data: {
        countEventId: params.id,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        ...parsed.data,
      },
    });

    await writeAuditLog({
      companyId: event!.companyId,
      userId: ctx.userId,
      action: 'countWorker.create',
      entityType: 'CountWorker',
      entityId: worker.id,
      previousValue: null,
      newValue: { name: worker.name, position: worker.position },
    });

    return NextResponse.json({ worker }, { status: 201 });
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
