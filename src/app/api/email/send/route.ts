import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCtx, UnauthenticatedError } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { emailProvider } from '@/lib/email';

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCtx();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Only company-scoped users can send email' }, { status: 400 });
    }

    const parsed = sendEmailSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { to, subject, body } = parsed.data;

    let status = 'sent';
    let providerId: string | null = null;
    try {
      const result = await emailProvider().send({ to, subject, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` });
      providerId = result.id;
    } catch (sendErr) {
      console.error('Email send failed', sendErr);
      status = 'failed';
    }

    const log = await prisma.emailLog.create({
      data: { companyId: ctx.companyId, sentByUserId: ctx.userId, toAddress: to, subject, bodyHtml: body, providerId, status },
    });

    if (status === 'failed') {
      return NextResponse.json({ error: 'Email provider failed to send', log }, { status: 502 });
    }
    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
