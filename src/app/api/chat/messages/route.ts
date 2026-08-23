import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { sendChatMessageSchema } from '@/lib/validation/chat';
import { contactsWhereClause } from '@/lib/chatContacts';

// GET ?withUserId=X returns the full conversation between the caller and X (both
// directions), and marks whatever X sent as read. POST sends a message to a
// recipientId, which must be a legitimate contact per contactsWhereClause — the
// same rule the contact list itself is built from, so a message can never be sent
// to someone who wouldn't also show up as a pickable contact.

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'chatMessage', action: 'list', resourceCompanyId: ctx.companyId });

    const withUserId = req.nextUrl.searchParams.get('withUserId');
    if (!withUserId) return NextResponse.json({ error: 'withUserId is required' }, { status: 400 });

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: ctx.userId, recipientId: withUserId },
          { senderId: withUserId, recipientId: ctx.userId },
        ],
      },
      include: { sender: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.chatMessage.updateMany({
      where: { senderId: withUserId, recipientId: ctx.userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ messages });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    requireAbility(ctx, { resource: 'chatMessage', action: 'create', resourceCompanyId: ctx.companyId });

    const body = await req.json();
    const parsed = sendChatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.recipientId === ctx.userId) {
      return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });
    }

    const recipient = await prisma.user.findFirst({
      where: { AND: [{ id: parsed.data.recipientId }, contactsWhereClause(ctx)] },
    });
    if (!recipient) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // A Super Admin sender has no companyId of their own — the message is filed
    // under the other (Employee) party's company so it still shows up in that
    // company's records.
    const companyId = ctx.companyId ?? recipient.companyId!;

    const message = await prisma.chatMessage.create({
      data: { companyId, senderId: ctx.userId, recipientId: recipient.id, body: parsed.data.body },
      include: { sender: { select: { firstName: true, lastName: true, role: true } } },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
