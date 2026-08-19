import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { documentUploadMetaSchema, ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '@/lib/validation/document';
import { canViewDocumentEntity } from '@/lib/serializers/document';
import { writeAuditLog } from '@/lib/audit';
import { storage, buildStorageKey } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'document', action: 'list', resourceCompanyId: ctx.companyId });

    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined;

    const documents = await prisma.document.findMany({
      where: { ...withCompanyScope(ctx), isArchived: false, folderId: folderId ?? null },
      include: { uploadedByUser: true },
      orderBy: { createdAt: 'desc' },
    });

    const visible = documents.filter((d) => canViewDocumentEntity(d, ctx.role, ctx.userId));
    return NextResponse.json({
      documents: visible.map((d) => ({
        id: d.id,
        filename: d.filename,
        mimeType: d.mimeType,
        currentVersion: d.currentVersion,
        uploadedBy: `${d.uploadedByUser.firstName} ${d.uploadedByUser.lastName}`,
        createdAt: d.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped users can upload documents' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'document', action: 'create', resourceCompanyId: ctx.companyId });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `File type ${file.type} is not allowed` }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 25MB limit' }, { status: 400 });
    }

    const parsed = documentUploadMetaSchema.safeParse({
      folderId: formData.get('folderId') || undefined,
      visibility: formData.get('visibility') || undefined,
      allowedRoles: formData.getAll('allowedRoles'),
      transactionId: formData.get('transactionId') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const meta = parsed.data;

    if (meta.folderId) {
      const folder = await prisma.documentFolder.findUnique({ where: { id: meta.folderId } });
      assertSameCompany(ctx, folder);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = buildStorageKey(ctx.companyId, 'documents', file.name);
    await storage().put(key, buffer, file.type);

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          companyId: ctx.companyId!,
          folderId: meta.folderId,
          filename: file.name,
          mimeType: file.type,
          visibility: meta.visibility,
          allowedRoles: meta.allowedRoles,
          uploadedByUserId: ctx.userId,
          transactionId: meta.transactionId,
          currentVersion: 1,
        },
      });
      await tx.documentVersion.create({
        data: {
          companyId: ctx.companyId!,
          documentId: doc.id,
          version: 1,
          storagePath: key,
          sizeBytes: file.size,
          uploadedByUserId: ctx.userId,
        },
      });
      return doc;
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'document.upload',
      entityType: 'Document',
      entityId: document.id,
      previousValue: null,
      newValue: { filename: document.filename },
    });

    return NextResponse.json({ document }, { status: 201 });
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
