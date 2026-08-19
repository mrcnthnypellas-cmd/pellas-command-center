import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

// Same visibility rule as the announcement itself: platform-wide, or scoped to the
// caller's own company. Image bytes are only ever served through this
// authorization-checked route — the storage key is never exposed to the client.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'announcement', action: 'read', resourceCompanyId: ctx.companyId });

    const announcement = await prisma.announcement.findUnique({ where: { id: params.id } });
    if (!announcement?.imageStorageKey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (announcement.companyId !== null && announcement.companyId !== ctx.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bytes = await storage().get(announcement.imageStorageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': announcement.imageMimeType ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
