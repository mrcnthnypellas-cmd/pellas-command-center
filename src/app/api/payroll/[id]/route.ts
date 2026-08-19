import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { assertSameCompany, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';
import { updatePayrollStatusSchema } from '@/lib/validation/payroll';
import { writeAuditLog } from '@/lib/audit';
import { generatePayslipPdf } from '@/lib/pdf/payslip';
import { storage, buildStorageKey } from '@/lib/storage';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();

    const payroll = await prisma.payroll.findUnique({
      where: { id: params.id },
      include: { employee: { include: { user: true } }, payslip: true },
    });
    assertSameCompany(ctx, payroll);
    requireAbility(ctx, { resource: 'payroll', action: 'update', resourceCompanyId: payroll!.companyId });

    const body = await req.json();
    const parsed = updatePayrollStatusSchema.safeParse({ ...body, id: params.id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const previousStatus = payroll!.status;
    const movingToPaid = parsed.data.status === 'PAID' && !payroll!.payslip;

    // Generate + store the PDF BEFORE touching the database — if this throws (e.g. a
    // font-encoding error), the payroll must stay in its previous status rather than
    // showing PAID with no payslip ever created (a real bug this fixed: the old order
    // updated status first, so a PDF-generation crash left orphaned PAID records).
    let pdfStorageKey: string | null = null;
    if (movingToPaid) {
      const company = await prisma.company.findUnique({ where: { id: payroll!.companyId } });
      const pdfBuffer = await generatePayslipPdf({
        companyName: company?.name ?? 'Company',
        employeeName: `${payroll!.employee.user.firstName} ${payroll!.employee.user.lastName}`,
        employeeCode: payroll!.employee.employeeCode,
        department: payroll!.employee.department,
        payPeriodStart: payroll!.payPeriodStart,
        payPeriodEnd: payroll!.payPeriodEnd,
        gross: Number(payroll!.gross),
        sssDeduction: Number(payroll!.sssDeduction),
        philhealthDeduction: Number(payroll!.philhealthDeduction),
        pagibigDeduction: Number(payroll!.pagibigDeduction),
        taxDeduction: Number(payroll!.taxDeduction),
        otherDeductions: Number(payroll!.otherDeductions),
        otherDeductionsNote: payroll!.otherDeductionsNote,
        net: Number(payroll!.net),
      });
      pdfStorageKey = buildStorageKey(payroll!.companyId, 'payslips', `payslip-${payroll!.id}.pdf`);
      await storage().put(pdfStorageKey, pdfBuffer, 'application/pdf');
    }

    // Status update and payslip creation happen together so neither can persist without the other.
    const [updated] = await prisma.$transaction([
      prisma.payroll.update({
        where: { id: params.id },
        data: {
          status: parsed.data.status,
          processedAt: parsed.data.status === 'PAID' ? new Date() : payroll!.processedAt,
        },
      }),
      ...(movingToPaid
        ? [
            prisma.payslip.create({
              data: {
                companyId: payroll!.companyId,
                payrollId: payroll!.id,
                employeeId: payroll!.employeeId,
                pdfStoragePath: pdfStorageKey,
              },
            }),
          ]
        : []),
    ]);

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'payroll.status_change',
      entityType: 'Payroll',
      entityId: updated.id,
      previousValue: { status: previousStatus },
      newValue: { status: updated.status },
    });

    if (movingToPaid) {
      await prisma.notification.create({
        data: {
          companyId: payroll!.companyId,
          userId: payroll!.employee.userId,
          type: 'NEW_PAYSLIP',
          title: 'New payslip available',
          body: `Your payslip for ${payroll!.payPeriodStart.toLocaleDateString()} – ${payroll!.payPeriodEnd.toLocaleDateString()} is ready.`,
          payload: { payrollId: payroll!.id },
        },
      });
    }

    return NextResponse.json({ payroll: updated });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (err instanceof ScopeError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
