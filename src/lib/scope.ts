import { Role } from '@prisma/client';
import { ForbiddenError } from './permissions';

/**
 * The single shared company-scoping helper (spec §2). Every module's data access
 * must go through this instead of hand-rolling `where: { companyId }`.
 *
 * - SUPER_ADMIN gets no company filter (platform-wide access), unless a specific
 *   companyId is explicitly requested (e.g. viewing one company's detail page).
 * - Every other role is force-filtered to their own companyId, full stop — the
 *   caller-supplied `where` can never override this.
 */

export interface ScopeContext {
  userId: string;
  role: Role;
  companyId: string | null;
}

export class ScopeError extends Error {
  constructor(message = 'No company scope available for this user') {
    super(message);
    this.name = 'ScopeError';
  }
}

/**
 * Returns a `where` fragment `{ companyId: string } | {}` to merge into a Prisma query.
 * Use via: prisma.employee.findMany({ where: { ...withCompanyScope(ctx), ...otherFilters } })
 */
export function withCompanyScope<T extends { companyId?: string }>(
  ctx: ScopeContext,
  explicitCompanyId?: string,
): { companyId?: string } {
  if (ctx.role === 'SUPER_ADMIN') {
    return explicitCompanyId ? { companyId: explicitCompanyId } : {};
  }

  if (!ctx.companyId) {
    throw new ScopeError(`User ${ctx.userId} has role ${ctx.role} but no companyId`);
  }

  if (explicitCompanyId && explicitCompanyId !== ctx.companyId) {
    // Non-super-admin explicitly asked for another company's data by ID — deny, don't silently reroute.
    throw new ForbiddenError('Cross-company access denied');
  }

  return { companyId: ctx.companyId };
}

/**
 * Asserts a single already-fetched record belongs to the caller's company (or caller is Super Admin).
 * Use this after `findUnique` calls where you fetched by a bare `id` (e.g. resource IDs from a URL
 * param) to guarantee a manipulated ID from another company can never be read/mutated.
 */
export function assertSameCompany(
  ctx: ScopeContext,
  record: { companyId: string | null } | null,
): void {
  if (!record) throw new ForbiddenError('Not found');
  if (ctx.role === 'SUPER_ADMIN') return;
  if (record.companyId !== ctx.companyId) {
    throw new ForbiddenError('Cross-company access denied');
  }
}
