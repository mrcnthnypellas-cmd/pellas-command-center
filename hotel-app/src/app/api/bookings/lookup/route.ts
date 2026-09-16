import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const ref = new URL(req.url).searchParams.get("ref")?.trim().toUpperCase();
  if (!ref) return NextResponse.json({ error: "Please enter a booking reference." }, { status: 400 });

  const db = readDb();
  const booking = db.bookings.find((b) => b.bookingReference === ref);
  if (!booking) return NextResponse.json({ error: "No booking found with that reference." }, { status: 404 });

  const guest = db.guests.find((g) => g.id === booking.guestId);
  const room = db.rooms.find((r) => r.id === booking.roomId);

  return NextResponse.json({
    booking: {
      ...booking,
      guestName: guest?.name || "",
      room: room ? { name: room.name, roomNumber: room.roomNumber, type: room.type, images: room.images } : null,
    },
  });
}
