import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  email: z.string().trim().email(),
  phone: z.string().trim().max(50).optional(),
  serviceNeeded: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form fields and try again.' }, { status: 400 });
  }

  const { name, company, email, phone, serviceNeeded, message } = parsed.data;
  await db.inquiry.create({
    data: {
      name,
      company: company || null,
      email,
      phone: phone || null,
      serviceNeeded: serviceNeeded || null,
      message,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
