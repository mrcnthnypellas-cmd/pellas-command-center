import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '@/lib/validation/document';
import { writeAuditLog } from '@/lib/audit';
import { storage, buildStorageKey } from '@/lib/storage';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const doc = await prisma.document.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, doc);
    requireAbility(ctx, { resource: 'document', action: 'read', resourceCompanyId: doc!.companyId });

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: params.id },
      include: { uploadedByUser: true },
      orderBy: { version: 'desc' },
    });
    return NextResponse.json({ versions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const doc = await prisma.document.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, doc);
    requireAbility(ctx, { resource: 'document', action: 'update', resourceCompanyId: doc!.companyId });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `File type ${file.type} is not allowed` }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 25MB limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = buildStorageKey(doc!.companyId, 'documents', file.name);
    await storage().put(key, buffer, file.type);

    const nextVersion = doc!.currentVersion + 1;
    const [, updatedDoc] = await prisma.$transaction([
      prisma.documentVersion.create({
        data: {
          companyId: doc!.companyId,
          documentId: doc!.id,
          version: nextVersion,
          storagePath: key,
          sizeBytes: file.size,
          uploadedByUserId: ctx.userId,
        },
      }),
      prisma.document.update({ where: { id: doc!.id }, data: { currentVersion: nextVersion } }),
    ]);

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'document.new_version',
      entityType: 'Document',
      entityId: doc!.id,
      previousValue: { currentVersion: doc!.currentVersion },
      newValue: { currentVersion: nextVersion },
    });

    return NextResponse.json({ document: updatedDoc }, { status: 201 });
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
