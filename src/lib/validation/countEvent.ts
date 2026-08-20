import { z } from 'zod';

export const createCountEventSchema = z.object({
  siteName: z.string().min(1).max(150),
  agencyName: z.string().min(1).max(150).optional(),
  clientName: z.string().min(1).max(150).optional(),
  eventDate: z.coerce.date(),
  timeScheduleStart: z.string().min(1).max(20).optional(),
  timeScheduleEnd: z.string().min(1).max(20).optional(),
  // Only used when the caller is Super Admin (who has no companyId of their own).
  companyId: z.string().cuid().optional(),
});
export type CreateCountEventInput = z.infer<typeof createCountEventSchema>;

export const updateCountEventSchema = createCountEventSchema.partial();
export type UpdateCountEventInput = z.infer<typeof updateCountEventSchema>;

const decimalField = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null || v === '' ? null : String(v)))
  .optional();

export const countWorkerSchema = z.object({
  name: z.string().min(1).max(150),
  position: z.enum(['SUPERVISOR', 'ENCODER', 'COUNTER']),
  tin: z.string().max(30).optional().nullable(),
  ratePerDay: decimalField,
  hourlyRate: decimalField,
  hoursWorked: decimalField,
  regularHrs: decimalField,
  otHrs: decimalField,
  nightDiffHrs: decimalField,
  dailyRatePayout: decimalField,
  otPayout: decimalField,
  nightDiffPayout: decimalField,
  transpoAllowance: decimalField,
  deductionLess: decimalField,
  netPay: decimalField,
  receivedBy: z.string().max(150).optional().nullable(),
});
export type CountWorkerInput = z.infer<typeof countWorkerSchema>;

export const updateCountWorkerSchema = countWorkerSchema.partial();
export type UpdateCountWorkerInput = z.infer<typeof updateCountWorkerSchema>;
