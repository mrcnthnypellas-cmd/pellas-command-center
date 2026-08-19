import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(150),
  body: z.string().min(1).max(2000),
  // Only meaningful for Super Admin: true posts platform-wide (visible to every
  // company), false scopes it to the caller's own company. Company Admin ignores
  // this and is always scoped to their own company.
  platformWide: z.coerce.boolean().default(false),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
