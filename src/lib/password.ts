import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

/** Generates a random temporary password to hand to a newly-created user out of band. */
export function generateTempPassword(length = 14): string {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += CHARS[bytes[i]! % CHARS.length];
  }
  return out;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
