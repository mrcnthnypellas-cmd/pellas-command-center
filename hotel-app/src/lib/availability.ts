import { Booking, Room } from "./types";

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "checked_in"]);

/** Standard half-open date-range overlap check: [aStart,aEnd) intersects [bStart,bEnd). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * A room is unavailable for [checkIn, checkOut) if any non-cancelled,
 * non-checked-out booking for that room overlaps the requested range.
 * Checked-out bookings free the room immediately (checkout date becomes
 * available again), matching the half-open range semantics.
 */
export function isRoomAvailable(
  roomId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
  ignoreBookingId?: string
): boolean {
  return !bookings.some(
    (b) =>
      b.roomId === roomId &&
      b.id !== ignoreBookingId &&
      ACTIVE_STATUSES.has(b.status) &&
      rangesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
  );
}

export function getAvailableRooms(
  rooms: Room[],
  bookings: Booking[],
  checkIn: string,
  checkOut: string,
  minGuests = 1
): Room[] {
  return rooms.filter(
    (r) =>
      r.status === "available" &&
      r.capacity >= minGuests &&
      isRoomAvailable(r.id, checkIn, checkOut, bookings)
  );
}

/** Current point-in-time state of a room, used for admin dashboard cards. */
export function currentRoomState(room: Room, bookings: Booking[], todayIso: string): "maintenance" | "occupied" | "reserved" | "available" {
  if (room.status === "maintenance") return "maintenance";
  const roomBookings = bookings.filter((b) => b.roomId === room.id && ACTIVE_STATUSES.has(b.status));
  if (roomBookings.some((b) => b.status === "checked_in")) return "occupied";
  if (roomBookings.some((b) => rangesOverlap(b.checkIn, b.checkOut, todayIso, addDays(todayIso, 1)))) {
    return "reserved";
  }
  return "available";
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
