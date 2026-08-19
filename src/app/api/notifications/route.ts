import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Notifications are always owner-scoped to the caller's own userId — there is no
// "list all notifications" ability for any role, admins included, since these are
// personal inbox items, not company data.
export async function GET() {
  try {
    const ctx = await requireCtx();
    const notifications = await prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ notifications });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
