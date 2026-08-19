import { z } from 'zod';

// Deductions are entered manually per payslip (project decision — no statutory
// auto-calculation in this build). All amounts are still validated as non-negative
// currency values server-side.
export const createPayrollSchema = z
  .object({
    employeeId: z.string().cuid(),
    payPeriodStart: z.coerce.date(),
    payPeriodEnd: z.coerce.date(),
    gross: z.coerce.number().nonnegative(),
    sssDeduction: z.coerce.number().nonnegative().default(0),
    philhealthDeduction: z.coerce.number().nonnegative().default(0),
    pagibigDeduction: z.coerce.number().nonnegative().default(0),
    taxDeduction: z.coerce.number().nonnegative().default(0),
    otherDeductions: z.coerce.number().nonnegative().default(0),
    otherDeductionsNote: z.string().max(500).optional(),
  })
  .refine((data) => data.payPeriodEnd >= data.payPeriodStart, {
    message: 'payPeriodEnd must be on or after payPeriodStart',
    path: ['payPeriodEnd'],
  });
export type CreatePayrollInput = z.infer<typeof createPayrollSchema>;

export const updatePayrollStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['DRAFT', 'PROCESSED', 'PAID']),
});
