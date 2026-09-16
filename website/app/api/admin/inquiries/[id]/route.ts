import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const schema = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }
  await db.inquiry.update({ where: { id: params.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
