import { z } from 'zod';

// Allow-listed icon keys — mapped to a lucide-react component client-side in
// CONTACT_ICON_MAP (src/components/dashboard/ContactDirectoryCard.tsx). Keeping
// this a closed enum (not a free-text string) means a bad value can never reach
// a dynamic icon loader.
export const CONTACT_ICON_KEYS = [
  'hr',
  'admin',
  'it',
  'accounting',
  'emergency',
  'phone',
  'building',
] as const;

export const createContactDirectoryEntrySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(200).optional().nullable(),
  phone: z.string().min(1).max(30),
  extension: z.string().max(20).optional().nullable(),
  icon: z.enum(CONTACT_ICON_KEYS).default('phone'),
  isEmergency: z.coerce.boolean().default(false),
  // Only used when the caller is Super Admin (who has no companyId of their own).
  companyId: z.string().cuid().optional(),
});
export type CreateContactDirectoryEntryInput = z.infer<typeof createContactDirectoryEntrySchema>;

export const updateContactDirectoryEntrySchema = createContactDirectoryEntrySchema.partial().extend({
  sortOrder: z.coerce.number().int().optional(),
});
export type UpdateContactDirectoryEntryInput = z.infer<typeof updateContactDirectoryEntrySchema>;
