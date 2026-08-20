import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createCountEventSchema } from '@/lib/validation/countEvent';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'countEvent', action: 'list', resourceCompanyId: ctx.companyId });

    const events = await prisma.countEvent.findMany({
      where: withCompanyScope(ctx),
      include: { _count: { select: { workers: true } } },
      orderBy: { eventDate: 'desc' },
      take: 200,
    });

    return NextResponse.json({ events });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const parsed = createCountEventSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const companyId = ctx.role === 'SUPER_ADMIN' ? input.companyId : ctx.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'A company is required for a new count sheet' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'countEvent', action: 'create', resourceCompanyId: companyId });

    const event = await prisma.countEvent.create({
      data: {
        companyId,
        siteName: input.siteName,
        agencyName: input.agencyName,
        clientName: input.clientName,
        eventDate: input.eventDate,
        timeScheduleStart: input.timeScheduleStart,
        timeScheduleEnd: input.timeScheduleEnd,
        createdByUserId: ctx.userId,
      },
    });

    await writeAuditLog({
      companyId,
      userId: ctx.userId,
      action: 'countEvent.create',
      entityType: 'CountEvent',
      entityId: event.id,
      previousValue: null,
      newValue: { siteName: event.siteName, eventDate: event.eventDate },
    });

    return NextResponse.json({ event }, { status: 201 });
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
