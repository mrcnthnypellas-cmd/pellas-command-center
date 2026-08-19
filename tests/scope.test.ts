import { describe, it, expect } from 'vitest';
import { withCompanyScope, assertSameCompany, ScopeError } from '@/lib/scope';
import { ForbiddenError } from '@/lib/permissions';
import type { ScopeContext } from '@/lib/scope';

const companyA = 'company-a';
const companyB = 'company-b';

describe('withCompanyScope — the single shared query-scoping helper (spec §2)', () => {
  it('non-super-admin roles are always filtered to their own companyId', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'HR_ADMIN', companyId: companyA };
    expect(withCompanyScope(ctx)).toEqual({ companyId: companyA });
  });

  it('a manipulated explicit companyId for another company is denied, not silently ignored', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'COMPANY_ADMIN', companyId: companyA };
    expect(() => withCompanyScope(ctx, companyB)).toThrow(ForbiddenError);
  });

  it('Super Admin with no explicit company gets an unfiltered scope', () => {
    const ctx: ScopeContext = { userId: 'root', role: 'SUPER_ADMIN', companyId: null };
    expect(withCompanyScope(ctx)).toEqual({});
  });

  it('Super Admin can explicitly scope to any single company', () => {
    const ctx: ScopeContext = { userId: 'root', role: 'SUPER_ADMIN', companyId: null };
    expect(withCompanyScope(ctx, companyB)).toEqual({ companyId: companyB });
  });

  it('throws ScopeError for a non-super-admin with no companyId (data integrity bug, not a normal case)', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'EMPLOYEE', companyId: null };
    expect(() => withCompanyScope(ctx)).toThrow(ScopeError);
  });
});

describe('assertSameCompany — guards a single record fetched by bare ID (manipulated resource ID case, spec §3)', () => {
  it('denies a record belonging to a different company', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'COMPANY_ADMIN', companyId: companyA };
    expect(() => assertSameCompany(ctx, { companyId: companyB })).toThrow(ForbiddenError);
  });

  it('allows a record belonging to the caller company', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'COMPANY_ADMIN', companyId: companyA };
    expect(() => assertSameCompany(ctx, { companyId: companyA })).not.toThrow();
  });

  it('denies (not-found) a null record so a nonexistent ID cannot be distinguished from a cross-company one', () => {
    const ctx: ScopeContext = { userId: 'u1', role: 'COMPANY_ADMIN', companyId: companyA };
    expect(() => assertSameCompany(ctx, null)).toThrow(ForbiddenError);
  });

  it('Super Admin can access a record from any company', () => {
    const ctx: ScopeContext = { userId: 'root', role: 'SUPER_ADMIN', companyId: null };
    expect(() => assertSameCompany(ctx, { companyId: companyB })).not.toThrow();
  });
});
