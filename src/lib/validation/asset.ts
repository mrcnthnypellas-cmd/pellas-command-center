import { z } from 'zod';

export const createAssetSchema = z.object({
  assetTag: z.string().min(1).max(50),
  category: z.string().min(1).max(100),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  purchaseDate: z.coerce.date().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  supplier: z.string().max(200).optional(),
  warrantyExpiresAt: z.coerce.date().optional(),
  contractInfo: z.string().max(500).optional(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).default('GOOD'),
  location: z.string().max(200).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const assetLifecycleActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ASSIGN'), toEmployeeId: z.string().cuid(), notes: z.string().max(500).optional() }),
  z.object({
    action: z.literal('TRANSFER'),
    toEmployeeId: z.string().cuid(),
    notes: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal('RETURN'), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal('REPAIR'), notes: z.string().max(500) }),
  z.object({ action: z.literal('AUDIT'), notes: z.string().max(500).optional() }),
  z.object({ action: z.literal('RETIRE'), notes: z.string().max(500) }),
]);
export type AssetLifecycleActionInput = z.infer<typeof assetLifecycleActionSchema>;
