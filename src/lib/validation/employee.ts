import { z } from 'zod';

export const employmentStatusEnum = z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']);

export const createEmployeeSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  employeeCode: z.string().min(1).max(50),
  department: z.string().min(1).max(100),
  position: z.string().min(1).max(100),
  hireDate: z.coerce.date(),
  employmentStatus: employmentStatusEnum.default('ACTIVE'),
  // Confidential fields — only ever accepted from HR Admin / Company Admin callers;
  // the API route must call requireAbility(ctx, { resource: 'employee.confidential', ... })
  // before persisting any of these, regardless of what the client sends.
  salary: z.coerce.number().nonnegative().optional(),
  sssNumber: z.string().max(20).optional(),
  philhealthNumber: z.string().max(20).optional(),
  pagibigNumber: z.string().max(20).optional(),
  tinNumber: z.string().max(20).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  id: z.string().cuid(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
