import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withDb, readDb } from "@/lib/db";
import { requireAdminApi } from "@/lib/apiAuth";
import { round2 } from "@/lib/pricing";
import { fireCheckInCascade, fireCheckOutCascade, fireCancelledCascade, firePaymentReceivedCascade, pushNotification } from "@/lib/notify";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === params.id);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({
    booking: {
      ...booking,
      guest: db.guests.find((g) => g.id === booking.guestId) || null,
      room: db.rooms.find((r) => r.id === booking.roomId) || null,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const now = new Date().toISOString();

  const outcome = await withDb((db) => {
    const booking = db.bookings.find((b) => b.id === params.id);
    if (!booking) return { error: "Booking not found.", code: 404 } as const;
    const guest = db.guests.find((g) => g.id === booking.guestId);
    const room = db.rooms.find((r) => r.id === booking.roomId);
    if (!guest || !room) return { error: "Related guest or room record is missing.", code: 500 } as const;

    switch (body.action) {
      case "confirm": {
        if (booking.status !== "pending") return { error: "Only pending bookings can be confirmed.", code: 409 } as const;
        booking.status = "confirmed";
        break;
      }
      case "checkin": {
        if (!["confirmed", "pending"].includes(booking.status)) {
          return { error: "Only confirmed bookings can be checked in.", code: 409 } as const;
        }
        booking.status = "checked_in";
        booking.actualCheckIn = now;
        booking.staffCheckIn = String(body.staff || "admin");
        fireCheckInCascade(db, booking, guest, room);
        break;
      }
      case "checkout": {
        if (booking.status !== "checked_in") {
          return { error: "Only checked-in bookings can be checked out.", code: 409 } as const;
        }
        const charges = Array.isArray(body.additionalCharges) ? body.additionalCharges : [];
        for (const c of charges) {
          if (!c.label || typeof c.amount !== "number" || c.amount < 0) {
            return { error: "Each additional charge needs a label and a non-negative amount.", code: 400 } as const;
          }
          booking.additionalCharges.push({ id: crypto.randomUUID(), label: String(c.label), amount: round2(c.amount), addedAt: now });
        }
        const additionalTotal = booking.additionalCharges.reduce((s, c) => s + c.amount, 0);
        const taxableBase = booking.subtotal - booking.discount;
        booking.total = round2(taxableBase + booking.tax + booking.serviceCharge + additionalTotal);
        booking.status = "checked_out";
        booking.actualCheckOut = now;
        booking.staffCheckOut = String(body.staff || "admin");
        if (body.paymentStatus) booking.paymentStatus = body.paymentStatus;
        fireCheckOutCascade(db, booking, guest, room);
        break;
      }
      case "cancel": {
        if (["checked_in", "checked_out", "cancelled"].includes(booking.status)) {
          return { error: "This booking can no longer be cancelled.", code: 409 } as const;
        }
        booking.status = "cancelled";
        if (booking.paymentStatus === "paid") booking.paymentStatus = "refunded";
        fireCancelledCascade(db, booking, guest, room);
        break;
      }
      case "no_show": {
        if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be marked no-show.", code: 409 } as const;
        booking.status = "no_show";
        break;
      }
      case "mark_paid": {
        booking.paymentStatus = "paid";
        booking.paymentMethod = body.paymentMethod || booking.paymentMethod || "cash";
        db.payments.push({
          id: crypto.randomUUID(),
          bookingId: booking.id,
          amount: booking.total,
          method: booking.paymentMethod || "cash",
          status: "paid",
          reference: `PAY-${booking.bookingReference}`,
          createdAt: now,
        });
        firePaymentReceivedCascade(db, booking, guest);
        break;
      }
      case "notes": {
        booking.notes = String(body.notes || "");
        break;
      }
      default:
        return { error: "Unknown action.", code: 400 } as const;
    }

    booking.updatedAt = now;
    return { booking } as const;
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.code });
  }
  return NextResponse.json({ booking: outcome.booking });
}
