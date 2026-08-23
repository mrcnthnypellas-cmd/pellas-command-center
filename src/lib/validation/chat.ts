import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  recipientId: z.string().cuid(),
  body: z.string().min(1, 'Message cannot be empty').max(2000),
});
