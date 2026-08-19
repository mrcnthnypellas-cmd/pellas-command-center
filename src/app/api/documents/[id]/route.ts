import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { renameDocumentSchema } from '@/lib/validation/document';
import { canViewDocumentEntity } from '@/lib/serializers/document';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const doc = await prisma.document.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, doc);
    requireAbility(ctx, { resource: 'document', action: 'update', resourceCompanyId: doc!.companyId });
    if (!canViewDocumentEntity(doc!, ctx.role, ctx.userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (body.action === 'archive') {
      const updated = await prisma.document.update({ where: { id: params.id }, data: { isArchived: true } });
      await writeAuditLog({
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: 'document.archive',
        entityType: 'Document',
        entityId: updated.id,
        previousValue: { isArchived: false },
        newValue: { isArchived: true },
      });
      return NextResponse.json({ document: updated });
    }

    const parsed = renameDocumentSchema.safeParse({ ...body, id: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const previousFilename = doc!.filename;
    const updated = await prisma.document.update({
      where: { id: params.id },
      data: { filename: parsed.data.filename },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'document.rename',
      entityType: 'Document',
      entityId: updated.id,
      previousValue: { filename: previousFilename },
      newValue: { filename: updated.filename },
    });

    return NextResponse.json({ document: updated });
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
