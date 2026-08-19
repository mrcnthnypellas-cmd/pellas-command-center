import { z } from 'zod';

export const createTransactionSchema = z.object({
  clientId: z.string().cuid(),
  transactionCode: z.string().min(1).max(50),
  service: z.string().min(1).max(200),
  amount: z.coerce.number().nonnegative(),
  assignedStaffUserId: z.string().cuid().optional(),
  remarks: z.string().max(1000).optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']),
  remarks: z.string().max(1000).optional(),
});
