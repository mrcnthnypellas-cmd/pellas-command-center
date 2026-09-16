import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { readDb, withDb } from "@/lib/db";
import { getAvailableRooms, isRoomAvailable } from "@/lib/availability";
import { requireAdminApi } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const db = readDb();
  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const guests = Number(searchParams.get("guests") || "1");

  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      return NextResponse.json({ error: "Check-out date must be after check-in date." }, { status: 400 });
    }
    const available = getAvailableRooms(db.rooms, db.bookings, checkIn, checkOut, guests);
    const availableIds = new Set(available.map((r) => r.id));
    const rooms = db.rooms.map((r) => ({ ...r, available: availableIds.has(r.id) }));
    return NextResponse.json({ rooms });
  }

  const rooms = db.rooms.map((r) => ({
    ...r,
    available: r.status === "available" && isRoomAvailable(r.id, new Date().toISOString().slice(0, 10), "9999-12-31", db.bookings),
  }));
  return NextResponse.json({ rooms });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const body = await req.json();
  if (!body.roomNumber || !body.name || !body.type || !body.price) {
    return NextResponse.json({ error: "roomNumber, name, type, and price are required." }, { status: 400 });
  }
  if (Number(body.price) < 0) {
    return NextResponse.json({ error: "Price cannot be negative." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const room = await withDb((db) => {
    if (db.rooms.some((r) => r.roomNumber === body.roomNumber)) {
      throw new Error("DUPLICATE_ROOM_NUMBER");
    }
    const newRoom = {
      id: crypto.randomUUID(),
      roomNumber: String(body.roomNumber),
      name: String(body.name),
      type: String(body.type),
      description: String(body.description || ""),
      price: Number(body.price),
      capacity: Number(body.capacity || 2),
      bedType: String(body.bedType || ""),
      amenities: Array.isArray(body.amenities) ? body.amenities : [],
      images: Array.isArray(body.images) ? body.images : [],
      status: body.status === "maintenance" ? "maintenance" : ("available" as const),
      createdAt: now,
      updatedAt: now,
    };
    db.rooms.push(newRoom);
    return newRoom;
  }).catch((e: Error) => e);

  if (room instanceof Error) {
    return NextResponse.json({ error: "A room with that number already exists." }, { status: 409 });
  }
  return NextResponse.json({ room }, { status: 201 });
}
