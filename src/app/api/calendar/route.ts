import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createCalendarEventSchema } from '@/lib/validation/calendar';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'calendarEvent', action: 'list', resourceCompanyId: ctx.companyId });

    const events = await prisma.calendarEvent.findMany({
      where: withCompanyScope(ctx),
      orderBy: { startAt: 'asc' },
    });

    return NextResponse.json({ events });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped users can create events' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'calendarEvent', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createCalendarEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const event = await prisma.calendarEvent.create({
      data: {
        companyId: ctx.companyId,
        title: input.title,
        description: input.description,
        department: input.department,
        startAt: input.startAt,
        endAt: input.endAt,
        isDeadline: input.isDeadline,
        location: input.location,
        source: 'MANUAL',
        createdByUserId: ctx.userId,
      },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'calendarEvent.create',
      entityType: 'CalendarEvent',
      entityId: event.id,
      previousValue: null,
      newValue: { title: event.title, startAt: event.startAt },
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
