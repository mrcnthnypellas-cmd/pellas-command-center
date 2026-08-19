import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';

function startOfLocalDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // YYYY-MM-DD
}

// Pairs sequential IN → next OUT events into worked sessions and sums their duration.
// Any unpaired trailing IN (still clocked in) contributes no hours to this summary.
function computeDailyHours(events: { type: 'IN' | 'OUT'; timestamp: Date }[]): number {
  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let totalMs = 0;
  let openIn: Date | null = null;
  for (const e of sorted) {
    if (e.type === 'IN') {
      openIn = e.timestamp;
    } else if (e.type === 'OUT' && openIn) {
      totalMs += e.timestamp.getTime() - openIn.getTime();
      openIn = null;
    }
  }
  return Math.round((totalMs / 3600000) * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'attendance', action: 'list', resourceCompanyId: ctx.companyId });

    const now = new Date();
    const startParam = req.nextUrl.searchParams.get('start');
    const endParam = req.nextUrl.searchParams.get('end');
    const start = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endParam ? new Date(endParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    const events = await prisma.attendance.findMany({
      where: { ...withCompanyScope(ctx), timestamp: { gte: start, lte: end } },
      include: { employee: { include: { user: true } } },
      orderBy: [{ employeeId: 'asc' }, { timestamp: 'asc' }],
    });

    // Group by employee, then by local calendar day.
    const byEmployeeDay = new Map<string, { name: string; code: string; days: Map<string, { type: 'IN' | 'OUT'; timestamp: Date }[]> }>();
    for (const e of events) {
      const key = e.employeeId;
      if (!byEmployeeDay.has(key)) {
        byEmployeeDay.set(key, {
          name: `${e.employee.user.firstName} ${e.employee.user.lastName}`,
          code: e.employee.employeeCode,
          days: new Map(),
        });
      }
      const entry = byEmployeeDay.get(key)!;
      const dayKey = startOfLocalDay(e.timestamp);
      if (!entry.days.has(dayKey)) entry.days.set(dayKey, []);
      entry.days.get(dayKey)!.push({ type: e.type, timestamp: e.timestamp });
    }

    const rows: Record<string, string | number>[] = [];
    for (const { name, code, days } of byEmployeeDay.values()) {
      const sortedDays = [...days.keys()].sort();
      for (const day of sortedDays) {
        rows.push({
          'Employee Code': code,
          'Employee Name': name,
          Date: day,
          'Hours Worked': computeDailyHours(days.get(day)!),
        });
      }
    }

    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No attendance records in this range' }]);
    worksheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Summary');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance-summary-${startOfLocalDay(start)}-to-${startOfLocalDay(end)}.xlsx"`,
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
