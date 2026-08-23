import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  // Omitted for an Employee sending into their own thread; required for an
  // admin replying into a specific employee's thread.
  employeeUserId: z.string().cuid().optional(),
  body: z.string().min(1, 'Message cannot be empty').max(2000),
});
