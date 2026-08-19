import { z } from 'zod';

export const createCalendarEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    department: z.string().max(100).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date().optional(),
    isDeadline: z.boolean().default(false),
    location: z.string().max(200).optional(),
  })
  .refine((data) => !data.endAt || data.endAt >= data.startAt, {
    message: 'endAt must be on or after startAt',
    path: ['endAt'],
  });
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

// One row of the Excel import, matching spec §7 columns exactly.
export const calendarImportRowSchema = z
  .object({
    Date: z.coerce.date({ invalid_type_error: 'Date is required and must be a valid date' }),
    Title: z.string().min(1, 'Title is required').max(200),
    Description: z.string().max(2000).optional().default(''),
    Department: z.string().max(100).optional().default(''),
    'Start Time': z.string().min(1, 'Start Time is required'),
    'End Time': z.string().optional().default(''),
    Deadline: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? /^(true|yes|1)$/i.test(v.trim()) : v))
      .default(false),
    Location: z.string().max(200).optional().default(''),
    Status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']).optional().default('SCHEDULED'),
  })
  .strict();
export type CalendarImportRow = z.infer<typeof calendarImportRowSchema>;

export interface CalendarImportRowResult {
  rowNumber: number; // 1-indexed, matching what the user sees in Excel (header = row 1)
  raw: Record<string, unknown>;
  valid: boolean;
  errors: string[];
  parsed?: CalendarImportRow;
}
