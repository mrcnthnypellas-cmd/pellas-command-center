import { z } from 'zod';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
];
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const createFolderSchema = z.object({
  name: z.string().min(1).max(150),
  parentFolderId: z.string().cuid().optional(),
  visibility: z.enum(['COMPANY_ALL', 'ROLE_RESTRICTED', 'PRIVATE']).default('COMPANY_ALL'),
  allowedRoles: z
    .array(z.enum(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN', 'EMPLOYEE', 'CLIENT']))
    .default([]),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const renameDocumentSchema = z.object({
  id: z.string().cuid(),
  filename: z.string().min(1).max(255),
});

export const documentUploadMetaSchema = z.object({
  folderId: z.string().cuid().optional(),
  visibility: z.enum(['COMPANY_ALL', 'ROLE_RESTRICTED', 'PRIVATE']).default('COMPANY_ALL'),
  allowedRoles: z
    .array(z.enum(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN', 'EMPLOYEE', 'CLIENT']))
    .default([]),
  transactionId: z.string().cuid().optional(),
});
