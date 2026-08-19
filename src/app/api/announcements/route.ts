import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import {
  createAnnouncementSchema,
  ANNOUNCEMENT_IMAGE_TYPES,
  ANNOUNCEMENT_IMAGE_MAX_BYTES,
} from '@/lib/validation/announcement';
import { writeAuditLog } from '@/lib/audit';
import { storage, buildStorageKey } from '@/lib/storage';

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

    return NextResponse.json({
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        hasImage: a.imageStorageKey != null,
        eventDate: a.eventDate,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const form = await req.formData();
    const title = form.get('title');
    const bodyText = form.get('body');
    const platformWide = form.get('platformWide');
    const eventDateRaw = form.get('eventDate');
    const image = form.get('image');

    const parsed = createAnnouncementSchema.safeParse({
      title,
      body: typeof bodyText === 'string' && bodyText.trim() ? bodyText : undefined,
      platformWide: platformWide ?? undefined,
      eventDate: typeof eventDateRaw === 'string' && eventDateRaw ? eventDateRaw : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const hasImage = image instanceof File && image.size > 0;
    if (!input.body && !hasImage) {
      return NextResponse.json({ error: 'Provide a message or an image for the announcement.' }, { status: 400 });
    }

    // Image upload and calendar-date linking are Super Admin only for now.
    if ((hasImage || input.eventDate) && ctx.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only Super Admin can post an image or calendar-linked announcement right now.' },
        { status: 403 },
      );
    }

    // Super Admin may post platform-wide (companyId null) or scope to one company they
    // pick — for simplicity here, Super Admin posting always goes platform-wide unless
    // they're also somehow company-scoped (they never are). Company Admin is always
    // scoped to their own company regardless of the platformWide flag.
    const companyId = ctx.role === 'SUPER_ADMIN' ? null : ctx.companyId;

    requireAbility(ctx, { resource: 'announcement', action: 'create', resourceCompanyId: companyId });

    let imageStorageKey: string | null = null;
    let imageMimeType: string | null = null;
    if (hasImage) {
      const file = image as File;
      if (!ANNOUNCEMENT_IMAGE_TYPES.includes(file.type as (typeof ANNOUNCEMENT_IMAGE_TYPES)[number])) {
        return NextResponse.json({ error: 'Image must be JPEG or PNG.' }, { status: 400 });
      }
      if (file.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: 'Image must be 5MB or smaller.' }, { status: 400 });
      }
      const key = buildStorageKey(companyId ?? 'platform', 'announcements', file.name);
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage().put(key, bytes, file.type);
      imageStorageKey = key;
      imageMimeType = file.type;
    }

    const announcement = await prisma.announcement.create({
      data: {
        companyId,
        title: input.title,
        body: input.body ?? null,
        imageStorageKey,
        imageMimeType,
        eventDate: input.eventDate ?? null,
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
      newValue: { title: announcement.title, hasImage, eventDate: input.eventDate ?? null },
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
