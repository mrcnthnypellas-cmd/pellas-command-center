import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Constant-time-ish comparison target so login doesn't leak whether a username exists.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeOoO4M5jY6c6q7g0e2wA2c1G9C6H8h6Iy';

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing username or password.' }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const user = await db.adminUser.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const token = await createSessionToken(user.username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
