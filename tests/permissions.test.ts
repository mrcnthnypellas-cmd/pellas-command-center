import { describe, it, expect } from 'vitest';
import { can, requireAbility, ForbiddenError, type AbilityContext } from '@/lib/permissions';

const companyA = 'company-a';
const companyB = 'company-b';

function ctx(overrides: Partial<AbilityContext>): AbilityContext {
  return { userId: 'user-1', role: 'EMPLOYEE', companyId: companyA, ...overrides };
}

describe('RBAC permission matrix — required negative test cases (spec §3)', () => {
  it('Employee A cannot read Employee B payslip', () => {
    const employeeA = ctx({ userId: 'emp-a', role: 'EMPLOYEE', companyId: companyA });
    const result = can(employeeA, {
      resource: 'payslip',
      action: 'read',
      resourceCompanyId: companyA,
      ownerUserId: 'emp-b', // payslip belongs to a different employee's user account
    });
    expect(result).toBe(false);
    expect(() =>
      requireAbility(employeeA, {
        resource: 'payslip',
        action: 'read',
        resourceCompanyId: companyA,
        ownerUserId: 'emp-b',
      }),
    ).toThrow(ForbiddenError);
  });

  it('Employee CAN read their own payslip', () => {
    const employeeA = ctx({ userId: 'emp-a', role: 'EMPLOYEE', companyId: companyA });
    expect(
      can(employeeA, {
        resource: 'payslip',
        action: 'read',
        resourceCompanyId: companyA,
        ownerUserId: 'emp-a',
      }),
    ).toBe(true);
  });

  it('IT Admin is denied payroll data entirely', () => {
    const itAdmin = ctx({ userId: 'it-1', role: 'IT_ADMIN', companyId: companyA });
    expect(can(itAdmin, { resource: 'payroll', action: 'read', resourceCompanyId: companyA })).toBe(false);
    expect(can(itAdmin, { resource: 'payslip', action: 'list', resourceCompanyId: companyA })).toBe(false);
    expect(
      can(itAdmin, { resource: 'employee.confidential', action: 'read', resourceCompanyId: companyA }),
    ).toBe(false);
  });

  it('IT Admin CAN manage assets in their own company', () => {
    const itAdmin = ctx({ userId: 'it-1', role: 'IT_ADMIN', companyId: companyA });
    expect(can(itAdmin, { resource: 'asset', action: 'update', resourceCompanyId: companyA })).toBe(true);
  });

  it('Client A cannot read Client B transaction', () => {
    const clientA = ctx({ userId: 'client-a', role: 'CLIENT', companyId: companyA });
    const result = can(clientA, {
      resource: 'transaction',
      action: 'read',
      resourceCompanyId: companyA,
      ownerUserId: 'client-b',
    });
    expect(result).toBe(false);
  });

  it('Client CAN read their own transaction', () => {
    const clientA = ctx({ userId: 'client-a', role: 'CLIENT', companyId: companyA });
    expect(
      can(clientA, {
        resource: 'transaction',
        action: 'read',
        resourceCompanyId: companyA,
        ownerUserId: 'client-a',
      }),
    ).toBe(true);
  });

  it('A user from Company A is denied any Company B resource by ID, for every non-super-admin role', () => {
    const roles = ['COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN', 'EMPLOYEE', 'CLIENT'] as const;
    for (const role of roles) {
      const user = ctx({ userId: `${role}-user`, role, companyId: companyA });
      expect(
        can(user, { resource: 'employee', action: 'read', resourceCompanyId: companyB }),
      ).toBe(false);
    }
  });

  it('Super Admin bypasses company scoping', () => {
    const superAdmin = ctx({ userId: 'root', role: 'SUPER_ADMIN', companyId: null });
    expect(can(superAdmin, { resource: 'employee', action: 'read', resourceCompanyId: companyA })).toBe(true);
    expect(can(superAdmin, { resource: 'employee', action: 'read', resourceCompanyId: companyB })).toBe(true);
  });

  it('HR Admin has no asset module access', () => {
    const hrAdmin = ctx({ userId: 'hr-1', role: 'HR_ADMIN', companyId: companyA });
    expect(can(hrAdmin, { resource: 'asset', action: 'read', resourceCompanyId: companyA })).toBe(false);
  });

  it('Employee cannot list all employees (no bulk HR access)', () => {
    const employeeA = ctx({ userId: 'emp-a', role: 'EMPLOYEE', companyId: companyA });
    expect(can(employeeA, { resource: 'employee', action: 'list', resourceCompanyId: companyA })).toBe(false);
  });

  it('An owner-scoped check with a missing ownerUserId fails closed, not open', () => {
    const employeeA = ctx({ userId: 'emp-a', role: 'EMPLOYEE', companyId: companyA });
    expect(
      can(employeeA, { resource: 'asset', action: 'read', resourceCompanyId: companyA }),
    ).toBe(false);
  });

  it('Employee CAN list/read documents (visibility-filtered separately, not owner-scoped)', () => {
    const employeeA = ctx({ userId: 'emp-a', role: 'EMPLOYEE', companyId: companyA });
    expect(can(employeeA, { resource: 'document', action: 'list', resourceCompanyId: companyA })).toBe(true);
    expect(can(employeeA, { resource: 'document', action: 'read', resourceCompanyId: companyA })).toBe(true);
  });

  it('Client CAN list/read documents (visibility-filtered separately, not owner-scoped)', () => {
    const clientA = ctx({ userId: 'client-a', role: 'CLIENT', companyId: companyA });
    expect(can(clientA, { resource: 'document', action: 'list', resourceCompanyId: companyA })).toBe(true);
  });
});
