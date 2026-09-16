import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withDb, readDb } from "@/lib/db";
import { isRoomAvailable } from "@/lib/availability";
import { calculatePrice, isCouponValid } from "@/lib/pricing";
import { nextBookingReference } from "@/lib/bookingRef";
import { fireBookingCreatedCascade, firePaymentReceivedCascade } from "@/lib/notify";
import { requireAdminApi } from "@/lib/apiAuth";
import { Booking } from "@/lib/types";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const db = readDb();
  const bookings = db.bookings
    .map((b) => ({
      ...b,
      guest: db.guests.find((g) => g.id === b.guestId) || null,
      room: db.rooms.find((r) => r.id === b.roomId) || null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ bookings });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { roomId, checkIn, checkOut, guests, guest, couponCode, paymentMethod } = body || {};

  // --- Validation ---
  if (!roomId || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Room and dates are required." }, { status: 400 });
  }
  if (typeof checkIn !== "string" || typeof checkOut !== "string" || checkOut <= checkIn) {
    return NextResponse.json({ error: "Check-out date must be after check-in date." }, { status: 400 });
  }
  const guestsCount = Number(guests);
  if (!Number.isInteger(guestsCount) || guestsCount < 1) {
    return NextResponse.json({ error: "Number of guests must be at least 1." }, { status: 400 });
  }
  if (!guest || !guest.name || !guest.email || !guest.phone) {
    return NextResponse.json({ error: "Guest name, email, and phone are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(guest.email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const validMethods = ["cash", "gcash", "maya", "bank_transfer", "card"];
  if (!validMethods.includes(paymentMethod)) {
    return NextResponse.json({ error: "Please select a valid payment method." }, { status: 400 });
  }

  const now = new Date().toISOString();

  const outcome = await withDb((db) => {
    const room = db.rooms.find((r) => r.id === roomId);
    if (!room) return { error: "Selected room does not exist.", code: 404 } as const;
    if (room.status !== "available") return { error: "This room is not currently bookable.", code: 409 } as const;
    if (guestsCount > room.capacity) {
      return { error: `This room accommodates a maximum of ${room.capacity} guests.`, code: 400 } as const;
    }
    // Double-booking prevention: re-checked here, inside the serialized write
    // queue, so two simultaneous requests for the same room/dates can't both pass.
    if (!isRoomAvailable(roomId, checkIn, checkOut, db.bookings)) {
      return { error: "This room is no longer available for the selected dates. Please choose different dates or another room.", code: 409 } as const;
    }

    let dbGuest = db.guests.find((g) => g.email.toLowerCase() === String(guest.email).toLowerCase());
    if (!dbGuest) {
      dbGuest = {
        id: crypto.randomUUID(),
        name: String(guest.name),
        email: String(guest.email),
        phone: String(guest.phone),
        address: String(guest.address || ""),
        createdAt: now,
      };
      db.guests.push(dbGuest);
    } else {
      dbGuest.name = String(guest.name);
      dbGuest.phone = String(guest.phone);
      dbGuest.address = String(guest.address || dbGuest.address);
    }

    let coupon = couponCode ? db.coupons.find((c) => c.code.toUpperCase() === String(couponCode).toUpperCase()) : null;
    if (couponCode && !isCouponValid(coupon)) {
      return { error: "That coupon code is invalid, expired, or has reached its usage limit.", code: 400 } as const;
    }

    const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
    const price = calculatePrice({
      roomPrice: room.price,
      nights,
      taxRate: db.settings.taxRate,
      serviceChargeRate: db.settings.serviceChargeRate,
      coupon: coupon && isCouponValid(coupon) ? coupon : null,
    });

    // Payment simulation: cash is settled at the hotel later; every other
    // method is simulated as succeeding immediately.
    const paymentStatus = paymentMethod === "cash" ? "unpaid" : "paid";

    const booking: Booking = {
      id: crypto.randomUUID(),
      bookingReference: nextBookingReference(db),
      guestId: dbGuest.id,
      roomId: room.id,
      checkIn,
      checkOut,
      guests: guestsCount,
      nights,
      roomPrice: room.price,
      subtotal: price.subtotal,
      couponCode: coupon ? coupon.code : null,
      discount: price.discount,
      taxRate: price.taxRate,
      tax: price.tax,
      serviceChargeRate: price.serviceChargeRate,
      serviceCharge: price.serviceCharge,
      additionalCharges: [],
      total: price.total,
      status: "confirmed",
      paymentStatus,
      paymentMethod,
      actualCheckIn: null,
      actualCheckOut: null,
      staffCheckIn: null,
      staffCheckOut: null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    db.bookings.push(booking);

    if (coupon) coupon.uses += 1;

    if (paymentStatus === "paid") {
      db.payments.push({
        id: crypto.randomUUID(),
        bookingId: booking.id,
        amount: booking.total,
        method: paymentMethod,
        status: "paid",
        reference: `PAY-${booking.bookingReference}`,
        createdAt: now,
      });
    }

    fireBookingCreatedCascade(db, booking, dbGuest, room);
    if (paymentStatus === "paid") {
      firePaymentReceivedCascade(db, booking, dbGuest);
    }

    return { booking } as const;
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.code });
  }
  return NextResponse.json({ booking: outcome.booking }, { status: 201 });
}
