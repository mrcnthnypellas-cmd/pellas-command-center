import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

// Payslip PDFs are served ONLY through this authorization-checked route — never as a
// static public file (spec §6). The storage key itself (e.g. an S3 key or local path)
// is never exposed to the client.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const payslip = await prisma.payslip.findUnique({
      where: { id: params.id },
      include: { employee: true },
    });
    assertSameCompany(ctx, payslip);

    const isSelf = payslip!.employee.userId === ctx.userId;
    requireAbility(ctx, {
      resource: 'payslip',
      action: 'read',
      resourceCompanyId: payslip!.companyId,
      ownerUserId: isSelf ? ctx.userId : undefined,
    });

    if (!payslip!.pdfStoragePath) {
      return NextResponse.json({ error: 'Payslip PDF not generated yet' }, { status: 404 });
    }

    const bytes = await storage().get(payslip!.pdfStoragePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payslip-${payslip!.id}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
