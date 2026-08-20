import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

const FONT_OPTIONS = ['Inter', 'System Default', 'Georgia', 'Monospace'] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Deliberately public/unauthenticated — the login page and every dashboard header
// need this (timezone for the clock, branding, theme) to render, including before
// sign-in.
export async function GET() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json({
    timezone: setting?.timezone ?? 'Asia/Manila',
    appName: setting?.appName ?? 'My Pellas Command Center',
    hasLogo: !!setting?.logoStorageKey,
    themePrimaryColor: setting?.themePrimaryColor ?? null,
    themeBackgroundColor: setting?.themeBackgroundColor ?? null,
    themeFontFamily: setting?.themeFontFamily ?? null,
  });
}

const updateSchema = z.object({
  timezone: z.string().min(1).max(100).optional(),
  appName: z.string().min(1).max(80).optional(),
  themePrimaryColor: z.union([z.string().regex(HEX_COLOR), z.null()]).optional(),
  themeBackgroundColor: z.union([z.string().regex(HEX_COLOR), z.null()]).optional(),
  themeFontFamily: z.union([z.enum(FONT_OPTIONS), z.null()]).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'platformSetting', action: 'update', resourceCompanyId: null });

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    if (input.timezone) {
      try {
        Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
      } catch {
        return NextResponse.json({ error: 'Not a valid timezone name' }, { status: 400 });
      }
    }

    const data = { ...input, updatedByUserId: ctx.userId };
    const setting = await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });

    return NextResponse.json({
      timezone: setting.timezone,
      appName: setting.appName,
      themePrimaryColor: setting.themePrimaryColor,
      themeBackgroundColor: setting.themeBackgroundColor,
      themeFontFamily: setting.themeFontFamily,
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
