import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { createAnnouncementSchema } from '@/lib/validation/announcement';
import { writeAuditLog } from '@/lib/audit';

// Visible set = platform-wide announcements (companyId null) plus the caller's own
// company's announcements. Super Admin with no companyId only sees platform-wide ones.
export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'announcement', action: 'list', resourceCompanyId: ctx.companyId });

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, ...(ctx.companyId ? [{ companyId: ctx.companyId }] : [])],
      },
      include: { createdByUser: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ announcements });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const body = await req.json();
    const parsed = createAnnouncementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // Super Admin may post platform-wide (companyId null) or scope to one company they
    // pick — for simplicity here, Super Admin posting always goes platform-wide unless
    // they're also somehow company-scoped (they never are). Company Admin is always
    // scoped to their own company regardless of the platformWide flag.
    const companyId = ctx.role === 'SUPER_ADMIN' ? null : ctx.companyId;

    requireAbility(ctx, { resource: 'announcement', action: 'create', resourceCompanyId: companyId });

    const announcement = await prisma.announcement.create({
      data: {
        companyId,
        title: input.title,
        body: input.body,
        createdByUserId: ctx.userId,
      },
    });

    await writeAuditLog({
      companyId,
      userId: ctx.userId,
      action: 'announcement.create',
      entityType: 'Announcement',
      entityId: announcement.id,
      previousValue: null,
      newValue: { title: announcement.title },
    });

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
