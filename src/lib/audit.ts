import { prisma } from './prisma';

export interface AuditLogInput {
  companyId: string | null;
  userId: string | null;
  action: string; // e.g. "employee.create", "payroll.update", "asset.transfer"
  entityType: string; // e.g. "Employee", "Payroll", "Asset"
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

/**
 * Every create/update/delete on employee, payroll, asset, document, and transaction
 * records must call this (spec §6). Fire-and-forget is not acceptable here — callers
 * should await it so a failed audit write surfaces instead of silently vanishing.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValue: input.previousValue as never,
      newValue: input.newValue as never,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
