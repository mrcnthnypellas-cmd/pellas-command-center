import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Only the sender can delete their own message — these are now real 1:1
// conversations (Employee<->Employee included), so letting one side unilaterally
// delete the other's messages doesn't fit the way "moderating a shared support
// inbox" used to.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const message = await prisma.chatMessage.findUnique({ where: { id: params.id } });
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (message.senderId !== ctx.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.chatMessage.delete({ where: { id: message.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
