import { requireCtx } from '@/lib/session';
import { requireAbility, can } from '@/lib/permissions';
import { withCompanyScope } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { canViewDocumentEntity } from '@/lib/serializers/document';
import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { DocumentList } from '@/components/documents/DocumentList';

export default async function DocumentsPage() {
  const ctx = await requireCtx();
  requireAbility(ctx, { resource: 'document', action: 'list', resourceCompanyId: ctx.companyId });

  const scope = withCompanyScope(ctx);
  const [folders, documents] = await Promise.all([
    prisma.documentFolder.findMany({ where: { ...scope, isArchived: false }, orderBy: { name: 'asc' } }),
    prisma.document.findMany({
      where: { ...scope, isArchived: false, folderId: null },
      include: { uploadedByUser: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const visibleFolders = folders.filter((f) => canViewDocumentEntity(f, ctx.role, ctx.userId));
  const visibleDocs = documents.filter((d) => canViewDocumentEntity(d, ctx.role, ctx.userId));
  const canManage = can(ctx, { resource: 'document', action: 'update', resourceCompanyId: ctx.companyId });
  const canUpload = can(ctx, { resource: 'document', action: 'create', resourceCompanyId: ctx.companyId });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500">
          {visibleFolders.length} folder(s), {visibleDocs.length} document(s) in root
        </p>
      </div>

      {canUpload && (
        <DocumentUploadForm folders={visibleFolders.map((f) => ({ id: f.id, name: f.name }))} />
      )}

      <DocumentList
        documents={visibleDocs.map((d) => ({
          id: d.id,
          filename: d.filename,
          mimeType: d.mimeType,
          currentVersion: d.currentVersion,
          uploadedBy: `${d.uploadedByUser.firstName} ${d.uploadedByUser.lastName}`,
          createdAt: d.createdAt.toISOString(),
        }))}
        canManage={canManage}
      />
    </div>
  );
}
