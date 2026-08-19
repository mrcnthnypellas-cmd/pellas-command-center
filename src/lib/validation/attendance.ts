import { z } from 'zod';

export const clockEventSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  device: z.string().max(200).optional(),
});
export type ClockEventInput = z.infer<typeof clockEventSchema>;
