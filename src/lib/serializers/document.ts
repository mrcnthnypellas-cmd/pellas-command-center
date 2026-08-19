import type { Role } from '@prisma/client';

interface VisibilityCheckable {
  visibility: 'COMPANY_ALL' | 'ROLE_RESTRICTED' | 'PRIVATE';
  allowedRoles: Role[];
  uploadedByUserId?: string;
  createdByUserId?: string;
}

/**
 * Folder/document-level visibility check, applied on top of the base RBAC resource
 * check and company scope. COMPANY_ALL is visible to any authenticated company member;
 * ROLE_RESTRICTED requires the caller's role to be in allowedRoles; PRIVATE is visible
 * only to its creator/uploader (plus Company/Super Admin, who can always see everything
 * within their scope for oversight).
 */
export function canViewDocumentEntity(
  entity: VisibilityCheckable,
  viewerRole: Role,
  viewerUserId: string,
): boolean {
  if (viewerRole === 'SUPER_ADMIN' || viewerRole === 'COMPANY_ADMIN') return true;

  switch (entity.visibility) {
    case 'COMPANY_ALL':
      return true;
    case 'ROLE_RESTRICTED':
      return entity.allowedRoles.includes(viewerRole);
    case 'PRIVATE':
      return entity.uploadedByUserId === viewerUserId || entity.createdByUserId === viewerUserId;
    default:
      return false;
  }
}
