import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { assetLifecycleActionSchema } from '@/lib/validation/asset';
import { writeAuditLog } from '@/lib/audit';
import type { AssetStatus } from '@prisma/client';

// Every lifecycle transition writes an AssetHistory row AND updates the asset in the
// same transaction — a transfer must never just overwrite assignedEmployeeId without
// leaving a trail (spec §8). Both the losing and gaining employee's "My Assets" view
// read live off Asset.assignedEmployeeId, so this single update keeps both in sync.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const asset = await prisma.asset.findUnique({ where: { id: params.id } });
    assertSameCompany(ctx, asset);
    requireAbility(ctx, { resource: 'asset', action: 'update', resourceCompanyId: asset!.companyId });

    const body = await req.json();
    const parsed = assetLifecycleActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    let toEmployeeId: string | null = null;
    let fromEmployeeId: string | null = asset!.assignedEmployeeId;
    let nextStatus: AssetStatus = asset!.status;
    let nextAssignedEmployeeId: string | null = asset!.assignedEmployeeId;

    switch (input.action) {
      case 'ASSIGN':
        if (asset!.assignedEmployeeId) {
          return NextResponse.json({ error: 'Asset is already assigned — use Transfer instead' }, { status: 409 });
        }
        toEmployeeId = input.toEmployeeId;
        nextAssignedEmployeeId = input.toEmployeeId;
        nextStatus = 'ASSIGNED';
        break;
      case 'TRANSFER':
        if (!asset!.assignedEmployeeId) {
          return NextResponse.json({ error: 'Asset is not currently assigned — use Assign instead' }, { status: 409 });
        }
        toEmployeeId = input.toEmployeeId;
        nextAssignedEmployeeId = input.toEmployeeId;
        nextStatus = 'ASSIGNED';
        break;
      case 'RETURN':
        nextAssignedEmployeeId = null;
        nextStatus = 'AVAILABLE';
        break;
      case 'REPAIR':
        nextStatus = 'IN_REPAIR';
        break;
      case 'AUDIT':
        // No state change — an audit is a point-in-time verification, logged as history only.
        break;
      case 'RETIRE':
        nextAssignedEmployeeId = null;
        nextStatus = 'RETIRED';
        break;
    }

    const [updatedAsset, history] = await prisma.$transaction([
      prisma.asset.update({
        where: { id: params.id },
        data: { status: nextStatus, assignedEmployeeId: nextAssignedEmployeeId },
      }),
      prisma.assetHistory.create({
        data: {
          companyId: asset!.companyId,
          assetId: asset!.id,
          action: input.action,
          fromEmployeeId,
          toEmployeeId,
          performedByUserId: ctx.userId,
          notes: input.notes,
        },
      }),
    ]);

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `asset.${input.action.toLowerCase()}`,
      entityType: 'Asset',
      entityId: updatedAsset.id,
      previousValue: { status: asset!.status, assignedEmployeeId: asset!.assignedEmployeeId },
      newValue: { status: updatedAsset.status, assignedEmployeeId: updatedAsset.assignedEmployeeId },
    });

    if ((input.action === 'ASSIGN' || input.action === 'TRANSFER') && toEmployeeId) {
      const toEmployee = await prisma.employee.findUnique({ where: { id: toEmployeeId } });
      if (toEmployee) {
        await prisma.notification.create({
          data: {
            companyId: asset!.companyId,
            userId: toEmployee.userId,
            type: 'ASSET_ASSIGNED',
            title: `Asset ${asset!.assetTag} assigned to you`,
            payload: { assetId: asset!.id },
          },
        });
      }
    }
    if (input.action === 'RETURN' && fromEmployeeId) {
      const fromEmployee = await prisma.employee.findUnique({ where: { id: fromEmployeeId } });
      if (fromEmployee) {
        await prisma.notification.create({
          data: {
            companyId: asset!.companyId,
            userId: fromEmployee.userId,
            type: 'ASSET_RETURNED',
            title: `Asset ${asset!.assetTag} return confirmed`,
            payload: { assetId: asset!.id },
          },
        });
      }
    }

    return NextResponse.json({ asset: updatedAsset, history });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
