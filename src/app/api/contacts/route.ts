import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createContactDirectoryEntrySchema } from '@/lib/validation/contactDirectory';
import { writeAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'contactDirectory', action: 'list', resourceCompanyId: ctx.companyId });

    const explicitCompanyId = req.nextUrl.searchParams.get('companyId') ?? undefined;
    const scope = withCompanyScope(ctx, explicitCompanyId);
    if (!('companyId' in scope) || !scope.companyId) {
      // Super Admin with no company selected — there is no platform-wide contact
      // directory (unlike Announcements), so just return nothing.
      return NextResponse.json({ contacts: [] });
    }

    const contacts = await prisma.contactDirectoryEntry.findMany({
      where: scope,
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ contacts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();

    const parsed = createContactDirectoryEntrySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const companyId = ctx.role === 'SUPER_ADMIN' ? input.companyId : ctx.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'contactDirectory', action: 'create', resourceCompanyId: companyId });

    const maxSort = await prisma.contactDirectoryEntry.aggregate({
      where: { companyId },
      _max: { sortOrder: true },
    });

    const contact = await prisma.contactDirectoryEntry.create({
      data: {
        companyId,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        name: input.name,
        description: input.description ?? null,
        phone: input.phone,
        extension: input.extension ?? null,
        icon: input.icon,
        isEmergency: input.isEmergency,
        createdByUserId: ctx.userId,
      },
    });

    await writeAuditLog({
      companyId,
      userId: ctx.userId,
      action: 'contactDirectory.create',
      entityType: 'ContactDirectoryEntry',
      entityId: contact.id,
      previousValue: null,
      newValue: { name: contact.name, phone: contact.phone },
    });

    return NextResponse.json({ contact }, { status: 201 });
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
