import { z } from 'zod';

export const ANNOUNCEMENT_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(150),
  // Text is optional when an image is supplied instead — the image IS the
  // announcement content in that case. The route handler enforces that at least
  // one of body/image is present, since that depends on the uploaded file too.
  body: z.string().max(2000).optional(),
  // Only meaningful for Super Admin: true posts platform-wide (visible to every
  // company), false scopes it to the caller's own company. Company Admin ignores
  // this and is always scoped to their own company.
  platformWide: z.coerce.boolean().default(false),
  // Super Admin only (enforced server-side, not by this schema): links the
  // announcement to a date on the Calendar widget.
  eventDate: z.coerce.date().optional(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
