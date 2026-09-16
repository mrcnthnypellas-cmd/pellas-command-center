import { NextResponse } from "next/server";
import { requireAdminOrNull } from "./auth";

/** Returns a 401 NextResponse if the request isn't from a logged-in admin, else null. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const ok = await requireAdminOrNull();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
