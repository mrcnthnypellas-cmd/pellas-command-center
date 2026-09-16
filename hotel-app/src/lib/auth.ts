// Minimal cookie-session auth for the admin area. LOCAL DEVELOPMENT ONLY —
// the credentials and session store here are intentionally simple (a JSON
// file, a fixed demo login) and are not meant to survive contact with the
// internet. See ANDROID-TABLET-SETUP.md for the production-auth upgrade path.

import { cookies } from "next/headers";
import crypto from "crypto";
import { withDb, readDb } from "./db";

export const SESSION_COOKIE = "hotel_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
  };
}

export async function createSession(username: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  await withDb((db) => {
    db.sessions = db.sessions.filter((s) => new Date(s.expiresAt) > now);
    db.sessions.push({
      token,
      username,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    });
  });
  return token;
}

export async function destroySession(token: string) {
  await withDb((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== token);
  });
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return false;
  return new Date(session.expiresAt) > new Date();
}

/** For use in Server Components / Route Handlers. */
export async function requireAdminOrNull() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return isValidSessionToken(token);
}
