import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { contactsWhereClause } from '@/lib/chatContacts';

// One row per person the caller is allowed to chat with (see contactsWhereClause),
// regardless of whether they've messaged yet — picking a contact is how a
// conversation starts, same as any normal chat app.
export async function GET() {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'chatMessage', action: 'list', resourceCompanyId: ctx.companyId });

    const isSuperAdmin = ctx.role === 'SUPER_ADMIN';
    const users = await prisma.user.findMany({
      where: { AND: [contactsWhereClause(ctx), { id: { not: ctx.userId }, status: 'ACTIVE' }] },
      select: { id: true, firstName: true, lastName: true, role: true, company: { select: { name: true } } },
      orderBy: [{ firstName: 'asc' }],
    });

    const contacts = await Promise.all(
      users.map(async (u) => {
        const [lastMessage, unreadCount] = await Promise.all([
          prisma.chatMessage.findFirst({
            where: { OR: [{ senderId: ctx.userId, recipientId: u.id }, { senderId: u.id, recipientId: ctx.userId }] },
            orderBy: { createdAt: 'desc' },
            select: { body: true, createdAt: true },
          }),
          prisma.chatMessage.count({ where: { senderId: u.id, recipientId: ctx.userId, isRead: false } }),
        ]);
        return {
          userId: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          // Only shown when it's actually informative — Super Admin's cross-company
          // view is the one case where two contacts can share a name/role but not
          // a company.
          companyName: isSuperAdmin ? (u.company?.name ?? null) : null,
          lastMessage: lastMessage?.body ?? null,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unreadCount,
        };
      }),
    );

    contacts.sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ contacts });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
