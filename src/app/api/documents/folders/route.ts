import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createFolderSchema } from '@/lib/validation/document';
import { canViewDocumentEntity } from '@/lib/serializers/document';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'document', action: 'list', resourceCompanyId: ctx.companyId });

    const folders = await prisma.documentFolder.findMany({
      where: { ...withCompanyScope(ctx), isArchived: false },
      orderBy: { name: 'asc' },
    });

    const visible = folders.filter((f) => canViewDocumentEntity(f, ctx.role, ctx.userId));
    return NextResponse.json({ folders: visible });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped users can create folders' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'document', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createFolderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    if (input.parentFolderId) {
      const parent = await prisma.documentFolder.findUnique({ where: { id: input.parentFolderId } });
      assertSameCompany(ctx, parent);
    }

    const folder = await prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        name: input.name,
        parentFolderId: input.parentFolderId,
        visibility: input.visibility,
        allowedRoles: input.allowedRoles,
        createdByUserId: ctx.userId,
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
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
