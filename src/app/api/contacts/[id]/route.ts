import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updateContactDirectoryEntrySchema } from '@/lib/validation/contactDirectory';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.contactDirectoryEntry.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    assertSameCompany(ctx, existing);
    requireAbility(ctx, { resource: 'contactDirectory', action: 'update', resourceCompanyId: existing.companyId });

    const parsed = updateContactDirectoryEntrySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { companyId: _ignored, ...data } = parsed.data;

    const updated = await prisma.contactDirectoryEntry.update({
      where: { id: params.id },
      data,
    });

    await writeAuditLog({
      companyId: existing.companyId,
      userId: ctx.userId,
      action: 'contactDirectory.update',
      entityType: 'ContactDirectoryEntry',
      entityId: updated.id,
      previousValue: { name: existing.name, phone: existing.phone },
      newValue: { name: updated.name, phone: updated.phone },
    });

    return NextResponse.json({ contact: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.contactDirectoryEntry.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    assertSameCompany(ctx, existing);
    requireAbility(ctx, { resource: 'contactDirectory', action: 'delete', resourceCompanyId: existing.companyId });

    await prisma.contactDirectoryEntry.delete({ where: { id: params.id } });

    await writeAuditLog({
      companyId: existing.companyId,
      userId: ctx.userId,
      action: 'contactDirectory.delete',
      entityType: 'ContactDirectoryEntry',
      entityId: params.id,
      previousValue: { name: existing.name, phone: existing.phone },
      newValue: null,
    });

    return NextResponse.json({ success: true });
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
