import { NextRequest, NextResponse } from "next/server";
import { readDb, withDb } from "@/lib/db";
import { requireAdminApi } from "@/lib/apiAuth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = readDb();
  const room = db.rooms.find((r) => r.id === params.id);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json({ room });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const body = await req.json();
  if (body.price !== undefined && Number(body.price) < 0) {
    return NextResponse.json({ error: "Price cannot be negative." }, { status: 400 });
  }

  const room = await withDb((db) => {
    const r = db.rooms.find((x) => x.id === params.id);
    if (!r) return null;
    Object.assign(r, {
      roomNumber: body.roomNumber ?? r.roomNumber,
      name: body.name ?? r.name,
      type: body.type ?? r.type,
      description: body.description ?? r.description,
      price: body.price !== undefined ? Number(body.price) : r.price,
      capacity: body.capacity !== undefined ? Number(body.capacity) : r.capacity,
      bedType: body.bedType ?? r.bedType,
      amenities: body.amenities ?? r.amenities,
      images: body.images ?? r.images,
      status: body.status ?? r.status,
      updatedAt: new Date().toISOString(),
    });
    return r;
  });

  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json({ room });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const result = await withDb((db) => {
    const hasActiveBookings = db.bookings.some(
      (b) => b.roomId === params.id && ["pending", "confirmed", "checked_in"].includes(b.status)
    );
    if (hasActiveBookings) return "HAS_BOOKINGS" as const;
    const before = db.rooms.length;
    db.rooms = db.rooms.filter((r) => r.id !== params.id);
    return db.rooms.length < before ? ("OK" as const) : ("NOT_FOUND" as const);
  });

  if (result === "HAS_BOOKINGS") {
    return NextResponse.json({ error: "This room has active bookings and cannot be deleted. Cancel or complete them first." }, { status: 409 });
  }
  if (result === "NOT_FOUND") {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
