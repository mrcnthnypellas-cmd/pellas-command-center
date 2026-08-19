import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { parseAndValidateCalendarImport } from '@/lib/calendarImport';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

function combineDateAndTime(date: Date, time: string): Date {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  const combined = new Date(date);
  if (match) {
    combined.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  return combined;
}

// Re-parses the file server-side rather than trusting whatever the client says was
// "valid" in the preview step — the server is the sole source of truth on what gets
// committed. Only rows that pass validation are inserted; invalid rows are reported
// back, never silently dropped without the caller knowing (spec §7).
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped users can import events' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'calendarEvent', action: 'create', resourceCompanyId: ctx.companyId });

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { results } = parseAndValidateCalendarImport(buffer);

    const validRows = results.filter((r) => r.valid && r.parsed);
    const invalidRows = results.filter((r) => !r.valid);

    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No valid rows to import', invalidRows }, { status: 400 });
    }

    const created = await prisma.$transaction(
      validRows.map((row) => {
        const p = row.parsed!;
        const startAt = combineDateAndTime(p.Date, p['Start Time']);
        const endAt = p['End Time'] ? combineDateAndTime(p.Date, p['End Time']) : undefined;
        return prisma.calendarEvent.create({
          data: {
            companyId: ctx.companyId!,
            title: p.Title,
            description: p.Description || undefined,
            department: p.Department || undefined,
            startAt,
            endAt,
            isDeadline: p.Deadline,
            location: p.Location || undefined,
            status: p.Status,
            source: 'EXCEL_IMPORT',
            createdByUserId: ctx.userId,
          },
        });
      }),
    );

    await writeAuditLog({
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'calendarEvent.excel_import',
      entityType: 'CalendarEvent',
      entityId: null,
      previousValue: null,
      newValue: { importedCount: created.length, skippedCount: invalidRows.length },
    });

    return NextResponse.json({ importedCount: created.length, skippedRows: invalidRows });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
