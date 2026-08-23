import { NextRequest, NextResponse } from 'next/server';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { requireAbility, ForbiddenError } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

const ADMIN_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_ADMIN', 'IT_ADMIN'] as const;

// A message can be deleted by whoever sent it, or by any admin-ish role moderating
// that thread (in their own company, or any company for Super Admin) — an Employee
// can't delete an admin's message, but an admin can delete either side's.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireCtx();
    const message = await prisma.chatMessage.findUnique({ where: { id: params.id } });
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwnMessage = message.senderId === ctx.userId;
    const isModeratingAdmin =
      (ADMIN_ROLES as readonly string[]).includes(ctx.role) &&
      (ctx.role === 'SUPER_ADMIN' || message.companyId === ctx.companyId);

    if (!isOwnMessage && !isModeratingAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    requireAbility(ctx, {
      resource: 'chatMessage',
      action: 'delete',
      resourceCompanyId: ctx.role === 'SUPER_ADMIN' ? null : message.companyId,
      ownerUserId: message.employeeUserId,
    });

    await prisma.chatMessage.delete({ where: { id: message.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
