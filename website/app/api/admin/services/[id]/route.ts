import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const ICONS = ['Calculator', 'ShieldCheck', 'Receipt', 'LineChart', 'Building2', 'Cloud', 'Users'] as const;

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  icon: z.enum(ICONS),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form fields and try again.' }, { status: 400 });
  }
  const service = await db.service.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(service);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.service.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
