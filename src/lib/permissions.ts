import { Role } from '@prisma/client';

/**
 * Central RBAC permission matrix (spec §3). Every server-side data access
 * must resolve through can()/requireAbility() — UI hiding is cosmetic only.
 */

export type Resource =
  | 'company' // super-admin managing companies
  | 'user'
  | 'employee'
  | 'employee.confidential' // salary, SSS/PhilHealth/Pag-IBIG/TIN
  | 'attendance'
  | 'payroll'
  | 'payslip'
  | 'asset'
  | 'document'
  | 'calendarEvent'
  | 'client'
  | 'transaction'
  | 'notification'
  | 'auditLog'
  | 'report'
  | 'platformSetting' // login page branding, etc. — Super Admin only
  | 'announcement';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'list';

export interface AbilityContext {
  userId: string;
  role: Role;
  companyId: string | null;
}

/**
 * ownerId semantics depend on resource:
 *  - employee/attendance/payroll/payslip/asset("My Assets"): the Employee.userId who owns the record
 *  - client/transaction: the Client.userId who owns the record
 *  - document: not owner-scoped, uses visibility/allowedRoles instead (checked separately)
 */
export interface AbilityCheck {
  resource: Resource;
  action: Action;
  resourceCompanyId: string | null; // null only for platform-level (Company itself, cross-company Super Admin views)
  ownerUserId?: string | null; // set when the resource is a "my own record" type
}

const ROLE_RESOURCE_MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  SUPER_ADMIN: {
    company: ['create', 'read', 'update', 'delete', 'list'],
    user: ['create', 'read', 'update', 'delete', 'list'],
    employee: ['create', 'read', 'update', 'delete', 'list'],
    'employee.confidential': ['read', 'update'],
    attendance: ['create', 'read', 'update', 'delete', 'list'],
    payroll: ['create', 'read', 'update', 'delete', 'list'],
    payslip: ['create', 'read', 'update', 'delete', 'list'],
    asset: ['create', 'read', 'update', 'delete', 'list'],
    document: ['create', 'read', 'update', 'delete', 'list'],
    calendarEvent: ['create', 'read', 'update', 'delete', 'list'],
    client: ['create', 'read', 'update', 'delete', 'list'],
    transaction: ['create', 'read', 'update', 'delete', 'list'],
    notification: ['create', 'read', 'update', 'delete', 'list'],
    auditLog: ['read', 'list'],
    report: ['read', 'list'],
    platformSetting: ['read', 'update'],
    announcement: ['create', 'read', 'update', 'delete', 'list'],
  },
  COMPANY_ADMIN: {
    user: ['create', 'read', 'update', 'delete', 'list'],
    employee: ['create', 'read', 'update', 'delete', 'list'],
    'employee.confidential': ['read', 'update'],
    attendance: ['create', 'read', 'update', 'delete', 'list'],
    payroll: ['create', 'read', 'update', 'delete', 'list'],
    payslip: ['create', 'read', 'update', 'delete', 'list'],
    asset: ['create', 'read', 'update', 'delete', 'list'],
    document: ['create', 'read', 'update', 'delete', 'list'],
    calendarEvent: ['create', 'read', 'update', 'delete', 'list'],
    client: ['create', 'read', 'update', 'delete', 'list'],
    transaction: ['create', 'read', 'update', 'delete', 'list'],
    notification: ['create', 'read', 'update', 'delete', 'list'],
    auditLog: ['read', 'list'],
    report: ['read', 'list'],
    announcement: ['create', 'read', 'update', 'delete', 'list'],
  },
  HR_ADMIN: {
    employee: ['create', 'read', 'update', 'delete', 'list'],
    'employee.confidential': ['read', 'update'],
    attendance: ['create', 'read', 'update', 'delete', 'list'],
    payroll: ['create', 'read', 'update', 'delete', 'list'],
    payslip: ['create', 'read', 'update', 'delete', 'list'],
    document: ['create', 'read', 'update', 'delete', 'list'],
    calendarEvent: ['create', 'read', 'update', 'list'],
    notification: ['read', 'update', 'list'],
    report: ['read', 'list'], // HR reports only — filtered at query layer
    announcement: ['read', 'list'],
  },
  IT_ADMIN: {
    // Explicitly denied: employee.confidential, payroll, payslip.
    employee: ['read', 'list'], // name/dept only, non-confidential fields filtered at serializer layer
    asset: ['create', 'read', 'update', 'delete', 'list'],
    calendarEvent: ['create', 'read', 'update', 'list'],
    notification: ['read', 'update', 'list'],
    report: ['read', 'list'], // IT reports only — filtered at query layer
    announcement: ['read', 'list'],
  },
  EMPLOYEE: {
    // All owner-scoped: ownerUserId must equal ctx.userId, enforced by requireAbility below.
    employee: ['read'],
    attendance: ['create', 'read', 'list'],
    payslip: ['read', 'list'],
    asset: ['read', 'list'],
    document: ['read', 'list'],
    calendarEvent: ['read', 'list'],
    notification: ['read', 'update', 'list'],
    announcement: ['read', 'list'],
  },
  CLIENT: {
    client: ['read'],
    transaction: ['read', 'list'],
    document: ['read', 'list'],
    notification: ['read', 'update', 'list'],
    announcement: ['read', 'list'],
  },
};

// Resources that, for non-admin roles, must additionally be restricted to the caller's own record.
// 'document' is deliberately excluded here even though Employee/Client only see "their"
// documents — that filtering is done separately by canViewDocumentEntity() (visibility/
// allowedRoles-based), and no document call site ever passes ownerUserId. Including it
// here would make every document list/read call fail closed for these roles.
const OWNER_SCOPED_FOR_ROLES: Partial<Record<Role, Resource[]>> = {
  EMPLOYEE: ['employee', 'attendance', 'payslip', 'asset'],
  CLIENT: ['client', 'transaction'],
};

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function can(ctx: AbilityContext, check: AbilityCheck): boolean {
  const allowedActions = ROLE_RESOURCE_MATRIX[ctx.role]?.[check.resource];
  if (!allowedActions || !allowedActions.includes(check.action)) return false;

  // Super Admin bypasses company scoping entirely.
  if (ctx.role === 'SUPER_ADMIN') return true;

  // Every other role must match company scope.
  if (check.resourceCompanyId !== null && check.resourceCompanyId !== ctx.companyId) {
    return false;
  }

  // Owner-scoped resources (Employee/Client self-service roles) must match the caller.
  const ownerScopedResources = OWNER_SCOPED_FOR_ROLES[ctx.role];
  if (ownerScopedResources?.includes(check.resource)) {
    if (check.ownerUserId === undefined) {
      // Caller forgot to pass ownerUserId for an owner-scoped resource — fail closed.
      return false;
    }
    if (check.ownerUserId !== ctx.userId) return false;
  }

  return true;
}

/** Throws ForbiddenError instead of returning boolean — use in API routes/server actions. */
export function requireAbility(ctx: AbilityContext, check: AbilityCheck): void {
  if (!can(ctx, check)) {
    throw new ForbiddenError(
      `Role ${ctx.role} denied ${check.action} on ${check.resource}`,
    );
  }
}
