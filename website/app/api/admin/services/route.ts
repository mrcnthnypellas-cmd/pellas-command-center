import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const ICONS = ['Calculator', 'ShieldCheck', 'Receipt', 'LineChart', 'Building2', 'Cloud', 'Users'] as const;

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  icon: z.enum(ICONS),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form fields and try again.' }, { status: 400 });
  }

  const baseSlug = slugify(parsed.data.name) || 'service';
  let slug = baseSlug;
  let n = 2;
  while (await db.service.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const maxOrder = await db.service.aggregate({ _max: { sortOrder: true } });
  const service = await db.service.create({
    data: { ...parsed.data, slug, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });

  return NextResponse.json(service, { status: 201 });
}
