import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const existing = await prisma.announcement.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // A company-scoped announcement can only be managed by that company's admins; a
    // platform-wide one (companyId null) only by Super Admin.
    if (existing.companyId === null && ctx.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (existing.companyId !== null && existing.companyId !== ctx.companyId && ctx.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    requireAbility(ctx, { resource: 'announcement', action: 'update', resourceCompanyId: existing.companyId });

    const body = await req.json();
    const updated = await prisma.announcement.update({
      where: { id: params.id },
      data: { isActive: !!body.isActive },
    });

    await writeAuditLog({
      companyId: existing.companyId,
      userId: ctx.userId,
      action: 'announcement.toggle',
      entityType: 'Announcement',
      entityId: updated.id,
      previousValue: { isActive: existing.isActive },
      newValue: { isActive: updated.isActive },
    });

    return NextResponse.json({ announcement: updated });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
