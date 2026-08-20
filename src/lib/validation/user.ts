import { z } from 'zod';

// Username here follows the same convention as the seed accounts (plain lowercase
// strings, not necessarily real email addresses) — see prisma/seed.ts and login page.
export const createUserSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, dashes, and underscores'),
    password: z.string().min(5, 'Password must be at least 5 characters').max(100),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().max(30).optional(),
    role: z.enum(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN', 'EMPLOYEE', 'CLIENT']),
    companyId: z.string().cuid().optional(),
    // Only used when role === EMPLOYEE
    employeeCode: z.string().max(50).optional(),
    department: z.string().max(100).optional(),
    position: z.string().max(100).optional(),
    // Only used when role === CLIENT
    clientCode: z.string().max(50).optional(),
    businessName: z.string().max(200).optional(),
  })
  .refine((data) => data.role === 'SUPER_ADMIN' || !!data.companyId, {
    message: 'A company is required for every role except Super Admin',
    path: ['companyId'],
  })
  .refine((data) => data.role !== 'EMPLOYEE' || (!!data.employeeCode && !!data.department && !!data.position), {
    message: 'Employee code, department, and position are required for the Employee role',
    path: ['employeeCode'],
  })
  .refine((data) => data.role !== 'CLIENT' || !!data.clientCode, {
    message: 'Client code is required for the Client role',
    path: ['clientCode'],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

// Editing an existing user. Every field is optional (partial update — e.g. the
// Deactivate/Reactivate toggle sends only `status`); the route handler falls back to
// the existing DB value for anything omitted. The one cross-field rule (a company is
// required for non-Super-Admin roles) only applies when `role` is actually part of
// this request, since a status-only PATCH doesn't carry role/companyId at all.
export const updateUserSchema = z
  .object({
    password: z.string().min(5, 'Password must be at least 5 characters').max(100).optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional(),
    role: z.enum(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN', 'EMPLOYEE', 'CLIENT']).optional(),
    companyId: z.string().cuid().optional(),
    employeeCode: z.string().max(50).optional(),
    department: z.string().max(100).optional(),
    position: z.string().max(100).optional(),
    clientCode: z.string().max(50).optional(),
    businessName: z.string().max(200).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((data) => data.role === undefined || data.role === 'SUPER_ADMIN' || !!data.companyId, {
    message: 'A company is required for every role except Super Admin',
    path: ['companyId'],
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
