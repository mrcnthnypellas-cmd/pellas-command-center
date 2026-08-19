import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

// Timezone is intentionally public/unauthenticated to read — the login page and every
// dashboard header need it to render the live clock, including before sign-in.
export async function GET() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json({ timezone: setting?.timezone ?? 'Asia/Manila' });
}

const updateSchema = z.object({ timezone: z.string().min(1).max(100) });

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'platformSetting', action: 'update', resourceCompanyId: null });

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Validate it's a real IANA timezone name before persisting.
    try {
      Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone });
    } catch {
      return NextResponse.json({ error: 'Not a valid timezone name' }, { status: 400 });
    }

    const setting = await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', timezone: parsed.data.timezone, updatedByUserId: ctx.userId },
      update: { timezone: parsed.data.timezone, updatedByUserId: ctx.userId },
    });

    return NextResponse.json({ timezone: setting.timezone });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
