import { Database } from "./types";

/** Must be called inside a withDb() mutator — bumps and returns "HTL-000001" style reference. */
export function nextBookingReference(db: Database): string {
  db.counters.bookingSeq += 1;
  return `HTL-${String(db.counters.bookingSeq).padStart(6, "0")}`;
}
