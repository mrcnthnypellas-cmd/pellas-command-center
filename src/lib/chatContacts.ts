import type { Prisma, Role } from '@prisma/client';

/**
 * Who a given user is allowed to chat with — the single source of truth used both
 * to build the contact list and to validate a message's recipient, so the two
 * can never drift apart.
 *
 *  - Super Admin <-> any Employee (platform-wide)
 *  - Employee <-> any other Employee/Company Admin/HR Admin/IT Admin at the same
 *    company, plus any Super Admin
 *  - Company Admin/HR Admin/IT Admin <-> Employees at their own company
 *
 * Company Admin/HR Admin/IT Admin don't message each other or Super Admin here —
 * not asked for, and keeping it to "admins reachable by their own employees" is
 * the narrower, safer default.
 */
export function contactsWhereClause(ctx: { role: Role; companyId: string | null }): Prisma.UserWhereInput {
  if (ctx.role === 'SUPER_ADMIN') {
    return { role: 'EMPLOYEE' };
  }
  if (ctx.role === 'EMPLOYEE') {
    return {
      OR: [
        { role: 'SUPER_ADMIN' },
        { companyId: ctx.companyId, role: { in: ['EMPLOYEE', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN'] } },
      ],
    };
  }
  // COMPANY_ADMIN / HR_ADMIN / IT_ADMIN
  return { companyId: ctx.companyId, role: 'EMPLOYEE' };
}
