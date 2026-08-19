import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { createAssetSchema } from '@/lib/validation/asset';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'asset', action: 'list', resourceCompanyId: ctx.companyId });

    const assets = await prisma.asset.findMany({
      where: withCompanyScope(ctx),
      include: { assignedEmployee: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assets });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped admins can create assets' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'asset', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const qrCodeValue = `ASSET:${ctx.companyId}:${input.assetTag}`;
    // Validate it actually encodes before persisting — fail loudly, don't store a broken QR.
    await QRCode.toDataURL(qrCodeValue);

    const asset = await prisma.asset.create({
      data: { ...input, companyId: ctx.companyId, qrCodeValue, status: 'AVAILABLE' },
    });

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'asset.create',
      entityType: 'Asset',
      entityId: asset.id,
      previousValue: null,
      newValue: { assetTag: asset.assetTag, category: asset.category },
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Asset tag already in use' }, { status: 409 });
    }
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
