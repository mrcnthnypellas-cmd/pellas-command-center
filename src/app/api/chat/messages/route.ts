import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { sendChatMessageSchema } from '@/lib/validation/chat';

const ADMIN_ROLES = ['COMPANY_ADMIN', 'HR_ADMIN'] as const;

// Resolves which employee's thread this request targets, and checks the caller is
// allowed into it: an Employee only ever reaches their own thread; an admin must
// name a real EMPLOYEE in their own company.
async function resolveThreadOwner(
  ctx: { userId: string; role: string; companyId: string | null },
  requestedEmployeeUserId: string | undefined,
): Promise<{ employeeUserId: string; companyId: string } | NextResponse> {
  if (ctx.role === 'EMPLOYEE') {
    if (!ctx.companyId) return NextResponse.json({ error: 'No company on this account' }, { status: 400 });
    return { employeeUserId: ctx.userId, companyId: ctx.companyId };
  }

  if (!(ADMIN_ROLES as readonly string[]).includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!requestedEmployeeUserId) {
    return NextResponse.json({ error: 'employeeUserId is required' }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: requestedEmployeeUserId } });
  if (!target || target.role !== 'EMPLOYEE' || target.companyId !== ctx.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return { employeeUserId: target.id, companyId: target.companyId! };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    const requested = req.nextUrl.searchParams.get('employeeUserId') ?? undefined;
    const resolved = await resolveThreadOwner(ctx, requested);
    if (resolved instanceof NextResponse) return resolved;

    requireAbility(ctx, { resource: 'chatMessage', action: 'list', resourceCompanyId: resolved.companyId, ownerUserId: resolved.employeeUserId });

    const messages = await prisma.chatMessage.findMany({
      where: { employeeUserId: resolved.employeeUserId },
      include: { sender: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Opening the thread reads the other side's messages — mark whatever the caller
    // didn't send themselves as read.
    await prisma.chatMessage.updateMany({
      where: { employeeUserId: resolved.employeeUserId, senderId: { not: ctx.userId }, isRead: false },
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
    const body = await req.json();
    const parsed = sendChatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const resolved = await resolveThreadOwner(ctx, parsed.data.employeeUserId);
    if (resolved instanceof NextResponse) return resolved;

    requireAbility(ctx, { resource: 'chatMessage', action: 'create', resourceCompanyId: resolved.companyId, ownerUserId: resolved.employeeUserId });

    const message = await prisma.chatMessage.create({
      data: {
        companyId: resolved.companyId,
        employeeUserId: resolved.employeeUserId,
        senderId: ctx.userId,
        body: parsed.data.body,
      },
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
