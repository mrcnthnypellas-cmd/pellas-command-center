import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { storage, buildStorageKey } from '@/lib/storage';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

// Deliberately public/unauthenticated — the login page background must render before
// anyone has signed in. This serves branding only (never anything from Document/Payslip
// storage), so it doesn't conflict with the "never serve sensitive files statically"
// rule in spec §6.
export async function GET() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  if (!setting?.loginBackgroundStorageKey) {
    return NextResponse.json({ error: 'No background set' }, { status: 404 });
  }

  try {
    const bytes = await storage().get(setting.loginBackgroundStorageKey);
    const ext = setting.loginBackgroundStorageKey.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Background image not found' }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'platformSetting', action: 'update', resourceCompanyId: null });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, or WebP images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image exceeds the 8MB limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = buildStorageKey('platform', 'branding', file.name);
    await storage().put(key, buffer, file.type);

    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', loginBackgroundStorageKey: key, updatedByUserId: ctx.userId },
      update: { loginBackgroundStorageKey: key, updatedByUserId: ctx.userId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'platformSetting', action: 'update', resourceCompanyId: null });

    const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
    if (setting?.loginBackgroundStorageKey) {
      await storage().delete(setting.loginBackgroundStorageKey);
    }

    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', loginBackgroundStorageKey: null, updatedByUserId: ctx.userId },
      update: { loginBackgroundStorageKey: null, updatedByUserId: ctx.userId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
