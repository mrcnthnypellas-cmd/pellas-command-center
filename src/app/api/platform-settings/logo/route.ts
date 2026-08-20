import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { storage, buildStorageKey } from '@/lib/storage';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// Deliberately public/unauthenticated — the login page and sidebar logo must render
// before/without sign-in on the login page.
export async function GET() {
  const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
  if (!setting?.logoStorageKey) {
    return NextResponse.json({ error: 'No logo set' }, { status: 404 });
  }

  try {
    const bytes = await storage().get(setting.logoStorageKey);
    const ext = setting.logoStorageKey.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ error: 'Logo not found' }, { status: 404 });
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
      return NextResponse.json({ error: 'Only PNG, JPEG, WebP, or SVG images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image exceeds the 2MB limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = buildStorageKey('platform', 'branding', file.name);
    await storage().put(key, buffer, file.type);

    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', logoStorageKey: key, updatedByUserId: ctx.userId },
      update: { logoStorageKey: key, updatedByUserId: ctx.userId },
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
    if (setting?.logoStorageKey) {
      await storage().delete(setting.logoStorageKey);
    }

    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', logoStorageKey: null, updatedByUserId: ctx.userId },
      update: { logoStorageKey: null, updatedByUserId: ctx.userId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
