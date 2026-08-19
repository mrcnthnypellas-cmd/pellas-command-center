import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

const createCompanySchema = z.object({ name: z.string().min(1).max(200) });

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'company', action: 'list', resourceCompanyId: null });

    const companies = await prisma.company.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ companies });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'company', action: 'create', resourceCompanyId: null });

    const parsed = createCompanySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const company = await prisma.company.create({ data: { name: parsed.data.name } });

    await writeAuditLog({
      companyId: company.id,
      userId: ctx.userId,
      action: 'company.create',
      entityType: 'Company',
      entityId: company.id,
      previousValue: null,
      newValue: { name: company.name },
    });

    return NextResponse.json({ company }, { status: 201 });
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
