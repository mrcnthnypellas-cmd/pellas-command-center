import { NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Owner-scoped: each user sees only mail they personally sent, not the whole
// company's outbound mail — there's no "read everyone's email" ability in this app.
export async function GET() {
  try {
    const ctx = await requireCtx();
    const logs = await prisma.emailLog.findMany({
      where: { sentByUserId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ logs });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
