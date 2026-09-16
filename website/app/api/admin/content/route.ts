import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const schema = z.object({
  companyName: z.string().trim().min(1),
  legalName: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  designation: z.string().trim().min(1),
  tagline: z.string().trim().min(1),
  taglineEyebrow: z.string().trim().min(1),
  heroDescription: z.string().trim().min(1),
  aboutHeadline: z.string().trim().min(1),
  aboutStory: z.string().trim().min(1),
  addressLine1: z.string().trim().min(1),
  addressLine2: z.string().trim().min(1),
  addressCountry: z.string().trim().min(1),
  phone1: z.string().trim(),
  phone2: z.string().trim(),
  email: z.string().trim().email(),
  hoursWeekday: z.string().trim(),
  hoursWeekend: z.string().trim(),
  facebookUrl: z.string().trim(),
});

export async function PATCH(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form fields and try again.' }, { status: 400 });
  }

  await db.siteSettings.upsert({
    where: { id: 'main' },
    create: { id: 'main', ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
