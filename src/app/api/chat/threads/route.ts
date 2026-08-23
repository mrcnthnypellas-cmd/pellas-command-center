import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

// Admin-side inbox: one row per employee, regardless of whether they've messaged
// yet — an admin can open any employee's thread to start the conversation, not
// just reply to existing ones. Company Admin/HR Admin/IT Admin see their own
// company's employees; Super Admin isn't tied to one company, so sees every
// employee on the platform (with a company label to tell threads apart).
export async function GET() {
  try {
    const ctx = await requireCtx();
    const isSuperAdmin = ctx.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !ctx.companyId) {
      return NextResponse.json({ error: 'No company on this account' }, { status: 400 });
    }
    requireAbility(ctx, { resource: 'chatMessage', action: 'list', resourceCompanyId: isSuperAdmin ? null : ctx.companyId });

    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE', status: 'ACTIVE', ...(isSuperAdmin ? {} : { companyId: ctx.companyId }) },
      select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }],
    });

    const threads = await Promise.all(
      employees.map(async (emp) => {
        const [lastMessage, unreadCount] = await Promise.all([
          prisma.chatMessage.findFirst({
            where: { employeeUserId: emp.id },
            orderBy: { createdAt: 'desc' },
            select: { body: true, createdAt: true, senderId: true },
          }),
          prisma.chatMessage.count({ where: { employeeUserId: emp.id, senderId: emp.id, isRead: false } }),
        ]);
        return {
          employeeUserId: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          companyName: isSuperAdmin ? (emp.company?.name ?? null) : null,
          lastMessage: lastMessage?.body ?? null,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unreadCount,
        };
      }),
    );

    threads.sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ threads });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
