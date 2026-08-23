import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Employee dashboard's "this month" stat cards (Total Working Hours today, Days
// Worked, Late Count, Attendance Rate) — always the caller's own attendance, no
// ability check needed beyond being signed in as an Employee with a linked record.
export async function GET() {
  try {
    const ctx = await requireCtx();
    const employee = await prisma.employee.findUnique({ where: { userId: ctx.userId } });
    if (!employee) return NextResponse.json({ error: 'No employee record for this user' }, { status: 400 });

    const setting = await prisma.platformSetting.findUnique({ where: { id: 'singleton' } });
    const timezone = setting?.timezone ?? 'Asia/Manila';

    const now = new Date();
    const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    const todayKey = dateFmt.format(now);
    const [todayYear, todayMonth] = todayKey.split('-').map(Number);

    // Wide UTC net around the local month — trimmed precisely using the local date
    // string below, since the UTC day boundary and the platform-timezone day
    // boundary don't line up.
    const rangeStart = new Date(Date.UTC(todayYear!, todayMonth! - 1, 1) - 24 * 3600 * 1000);
    const rangeEnd = new Date(now.getTime() + 24 * 3600 * 1000);

    const events = await prisma.attendance.findMany({
      where: { employeeId: employee.id, timestamp: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { timestamp: 'asc' },
    });

    const monthPrefix = todayKey.slice(0, 7); // YYYY-MM
    const firstInByDay = new Map<string, Date>();
    const todayEvents: { type: string; timestamp: Date }[] = [];
    for (const e of events) {
      const dayKey = dateFmt.format(e.timestamp);
      if (!dayKey.startsWith(monthPrefix)) continue;
      if (e.type === 'IN' && !firstInByDay.has(dayKey)) firstInByDay.set(dayKey, e.timestamp);
      if (dayKey === todayKey) todayEvents.push({ type: e.type, timestamp: e.timestamp });
    }

    const daysWorked = firstInByDay.size;
    let lateCount = 0;
    for (const firstIn of firstInByDay.values()) {
      const [h, m] = timeFmt.format(firstIn).split(':').map(Number);
      if (h! > 8 || (h === 8 && m! >= 1)) lateCount++;
    }

    // Working days (Mon-Fri) elapsed so far this month, including today.
    let workingDaysSoFar = 0;
    for (let d = 1; d <= 31; d++) {
      const day = new Date(Date.UTC(todayYear!, todayMonth! - 1, d));
      if (day.getUTCMonth() !== todayMonth! - 1) break;
      if (dateFmt.format(day) > todayKey) break;
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(day);
      if (weekday !== 'Sat' && weekday !== 'Sun') workingDaysSoFar++;
    }
    const attendanceRatePercent = workingDaysSoFar > 0 ? Math.round((daysWorked / workingDaysSoFar) * 100) : 0;

    // Today's worked hours: paired IN->OUT sessions, plus the open session (if still
    // clocked in) counted up to now.
    const sorted = [...todayEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let totalMs = 0;
    let openIn: Date | null = null;
    for (const e of sorted) {
      if (e.type === 'IN') openIn = e.timestamp;
      else if (e.type === 'OUT' && openIn) {
        totalMs += e.timestamp.getTime() - openIn.getTime();
        openIn = null;
      }
    }
    if (openIn) totalMs += now.getTime() - openIn.getTime();
    const totalMinutes = Math.max(0, Math.round(totalMs / 60000));
    const todayWorkedLabel = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}h ${String(totalMinutes % 60).padStart(2, '0')}m`;

    return NextResponse.json({ daysWorked, lateCount, attendanceRatePercent, todayWorkedLabel });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
