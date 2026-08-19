import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { canViewDocumentEntity } from '@/lib/serializers/document';
import { storage } from '@/lib/storage';

// Documents are served ONLY through this authorization-checked route (spec §6) — the
// underlying storage key is never exposed to the client, and visibility/allowedRoles
// are re-checked on every download, not just on the list view.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const doc = await prisma.document.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, doc);
    requireAbility(ctx, { resource: 'document', action: 'read', resourceCompanyId: doc!.companyId });
    if (!canViewDocumentEntity(doc!, ctx.role, ctx.userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const versionParam = req.nextUrl.searchParams.get('version');
    const version = versionParam ? Number(versionParam) : doc!.currentVersion;

    const docVersion = await prisma.documentVersion.findUnique({
      where: { documentId_version: { documentId: doc!.id, version } },
    });
    if (!docVersion) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

    const bytes = await storage().get(docVersion.storagePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': doc!.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc!.filename)}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
