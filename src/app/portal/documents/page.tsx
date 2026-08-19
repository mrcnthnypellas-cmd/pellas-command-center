import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireCtx } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';

export default async function PortalDocumentsPage() {
  const ctx = await requireCtx();
  if (ctx.role !== 'CLIENT') redirect('/dashboard');

  const client = await prisma.client.findUnique({ where: { userId: ctx.userId } });
  if (!client) redirect('/login');

  // Owner-scoped via the client's own transactions only — a client can never see a
  // document attached to another client's transaction.
  const documents = await prisma.document.findMany({
    where: { transaction: { clientId: client.id }, isArchived: false },
    include: { transaction: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Documents</h1>

      <div className="card divide-y divide-slate-100">
        {documents.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No documents yet.</p>
        ) : (
          documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{d.filename}</div>
                <div className="text-xs text-slate-500">
                  {d.transaction?.transactionCode} · {formatDate(d.createdAt)}
                </div>
              </div>
              <a
                href={`/api/documents/${d.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
