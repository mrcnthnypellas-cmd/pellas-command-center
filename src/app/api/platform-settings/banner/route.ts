import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

const FONT_OPTIONS = ['Inter', 'System Default', 'Georgia', 'Monospace'] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SPEED_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
const HEIGHT_OPTIONS = [32, 40, 48, 56, 64, 72] as const;

// Public/unauthenticated — every dashboard needs this to render the banner.
export async function GET() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json({
    bannerEnabled: setting?.bannerEnabled ?? false,
    bannerMessage: setting?.bannerMessage ?? '',
    bannerTextColor: setting?.bannerTextColor ?? '#ffffff',
    bannerBackgroundColor: setting?.bannerBackgroundColor ?? '#dc2626',
    bannerFontFamily: setting?.bannerFontFamily ?? null,
    bannerSpeedSeconds: setting?.bannerSpeedSeconds ?? 20,
    bannerHeight: setting?.bannerHeight ?? 40,
  });
}

const updateSchema = z.object({
  bannerEnabled: z.boolean().optional(),
  bannerMessage: z.string().max(500).optional(),
  bannerTextColor: z.string().regex(HEX_COLOR).optional(),
  bannerBackgroundColor: z.string().regex(HEX_COLOR).optional(),
  bannerFontFamily: z.union([z.enum(FONT_OPTIONS), z.null()]).optional(),
  bannerSpeedSeconds: z.enum(SPEED_OPTIONS.map(String) as [string, ...string[]]).transform(Number).optional(),
  bannerHeight: z.enum(HEIGHT_OPTIONS.map(String) as [string, ...string[]]).transform(Number).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'ledBanner', action: 'update', resourceCompanyId: null });

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = { ...parsed.data, updatedByUserId: ctx.userId };
    const setting = await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });

    return NextResponse.json({
      bannerEnabled: setting.bannerEnabled,
      bannerMessage: setting.bannerMessage,
      bannerTextColor: setting.bannerTextColor,
      bannerBackgroundColor: setting.bannerBackgroundColor,
      bannerFontFamily: setting.bannerFontFamily,
      bannerSpeedSeconds: setting.bannerSpeedSeconds,
      bannerHeight: setting.bannerHeight,
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
