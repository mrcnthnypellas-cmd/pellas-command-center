import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { withCompanyScope, ScopeError } from '@/lib/scope';
import { prisma } from '@/lib/prisma';

const TIMEZONE = 'Asia/Manila';

function localDateParts(d: Date) {
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIMEZONE }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TIMEZONE }).format(d);
  return { date, time };
}

// Raw punch log — one row per Time In / Time Out event, unaggregated (unlike
// /api/attendance/export, which groups events into daily worked hours). Mirrors the
// biometric-device log format the user asked to replicate: a sequential log number,
// employee code/name, date, time, direction, and the capture device/source.
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
      orderBy: [{ timestamp: 'asc' }],
    });

    const rows = events.map((e, i) => {
      const { date, time } = localDateParts(e.timestamp);
      return {
        'Log No.': i + 1,
        'Employee Code': e.employee.employeeCode,
        'Employee Name': `${e.employee.user.firstName} ${e.employee.user.lastName}`,
        Date: date,
        Time: time,
        Direction: e.type === 'IN' ? 'Time In' : 'Time Out',
        Device: e.device ?? '',
        Source: e.source,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No attendance records in this range' }]);
    worksheet['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Log');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const { date: startLabel } = localDateParts(start);
    const { date: endLabel } = localDateParts(end);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance-log-${startLabel}-to-${endLabel}.xlsx"`,
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
