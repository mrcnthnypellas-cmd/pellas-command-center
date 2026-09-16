// Builds the initial (or resettable) sample database. Runs automatically the
// first time db.ts finds no data/db.json on disk, and can be re-run any time
// with `npm run seed` (see package.json) to reset back to demo data.

import crypto from "crypto";
import { Database, Room, Guest, Booking } from "./types";
import { addDays } from "./availability";
import { calculatePrice } from "./pricing";
import { todayIso } from "./format";

function id() {
  return crypto.randomUUID();
}

/** A small inline SVG placeholder — keeps the whole demo 100% offline, no network images. */
function placeholder(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="533" viewBox="0 0 800 533"><rect width="800" height="533" fill="${bg}"/><text x="400" y="275" font-family="Georgia, serif" font-size="40" fill="#ffffff" text-anchor="middle" opacity="0.9">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildSeedDatabase(): Database {
  const now = new Date().toISOString();
  const today = todayIso();

  const rooms: Room[] = [
    {
      id: id(),
      roomNumber: "101",
      name: "Deluxe Room",
      type: "Deluxe",
      description: "A spacious deluxe room with a queen bed, city view, and modern amenities — perfect for couples or solo travelers.",
      price: 2500,
      capacity: 2,
      bedType: "Queen",
      amenities: ["WiFi", "Air Conditioning", "TV", "Hot Shower"],
      images: [placeholder("Deluxe Room 101", "#a06423")],
      status: "available",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      roomNumber: "102",
      name: "Deluxe Room",
      type: "Deluxe",
      description: "A spacious deluxe room with a queen bed, garden view, and modern amenities.",
      price: 2500,
      capacity: 2,
      bedType: "Queen",
      amenities: ["WiFi", "Air Conditioning", "TV", "Hot Shower"],
      images: [placeholder("Deluxe Room 102", "#a06423")],
      status: "available",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      roomNumber: "103",
      name: "Standard Room",
      type: "Standard",
      description: "A cozy, budget-friendly room with everything you need for a comfortable stay.",
      price: 1800,
      capacity: 2,
      bedType: "Double",
      amenities: ["WiFi", "Air Conditioning", "TV"],
      images: [placeholder("Standard Room 103", "#7d4d1f")],
      status: "available",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      roomNumber: "104",
      name: "Suite",
      type: "Suite",
      description: "Our premier suite with a separate living area, king bed, and premium amenities.",
      price: 4500,
      capacity: 3,
      bedType: "King",
      amenities: ["WiFi", "Air Conditioning", "TV", "Mini Bar", "Bathtub"],
      images: [placeholder("Suite 104", "#5f3b1c")],
      status: "maintenance",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      roomNumber: "105",
      name: "Family Room",
      type: "Family",
      description: "Generously sized room with two double beds, ideal for families and small groups.",
      price: 3500,
      capacity: 4,
      bedType: "2 Double Beds",
      amenities: ["WiFi", "Air Conditioning", "TV", "Extra Bed Available"],
      images: [placeholder("Family Room 105", "#c17f2e")],
      status: "available",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const guests: Guest[] = [
    { id: id(), name: "Juan Dela Cruz", email: "juan.delacruz@example.com", phone: "+63 917 111 2222", address: "Quezon City, Philippines", createdAt: now },
    { id: id(), name: "Maria Santos", email: "maria.santos@example.com", phone: "+63 917 222 3333", address: "Makati City, Philippines", createdAt: now },
    { id: id(), name: "Jose Rizal", email: "jose.rizal@example.com", phone: "+63 917 333 4444", address: "Calamba, Laguna", createdAt: now },
    { id: id(), name: "Ana Reyes", email: "ana.reyes@example.com", phone: "+63 917 444 5555", address: "Cebu City, Philippines", createdAt: now },
    { id: id(), name: "Pedro Lim", email: "pedro.lim@example.com", phone: "+63 917 555 6666", address: "Davao City, Philippines", createdAt: now },
    { id: id(), name: "Liza Cruz", email: "liza.cruz@example.com", phone: "+63 917 666 7777", address: "Baguio City, Philippines", createdAt: now },
    { id: id(), name: "Mark Tan", email: "mark.tan@example.com", phone: "+63 917 777 8888", address: "Iloilo City, Philippines", createdAt: now },
  ];

  const taxRate = 0.12;
  const serviceChargeRate = 0.05;

  const bookings: Booking[] = [];
  let seq = 0;

  function makeBooking(opts: {
    room: Room;
    guest: Guest;
    checkIn: string;
    checkOut: string;
    guestsCount: number;
    status: Booking["status"];
    paymentStatus: Booking["paymentStatus"];
    paymentMethod: Booking["paymentMethod"];
    additionalCharges?: { label: string; amount: number }[];
    checkedIn?: boolean;
    checkedOut?: boolean;
  }): Booking {
    seq += 1;
    const nights = Math.max(1, Math.round((new Date(opts.checkOut).getTime() - new Date(opts.checkIn).getTime()) / 86400000));
    const extra = (opts.additionalCharges || []).map((c) => ({ id: id(), label: c.label, amount: c.amount, addedAt: now }));
    const price = calculatePrice({
      roomPrice: opts.room.price,
      nights,
      taxRate,
      serviceChargeRate,
      additionalCharges: extra,
    });
    return {
      id: id(),
      bookingReference: `HTL-${String(seq).padStart(6, "0")}`,
      guestId: opts.guest.id,
      roomId: opts.room.id,
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      guests: opts.guestsCount,
      nights,
      roomPrice: opts.room.price,
      subtotal: price.subtotal,
      couponCode: null,
      discount: price.discount,
      taxRate,
      tax: price.tax,
      serviceChargeRate,
      serviceCharge: price.serviceCharge,
      additionalCharges: extra,
      total: price.total,
      status: opts.status,
      paymentStatus: opts.paymentStatus,
      paymentMethod: opts.paymentMethod,
      actualCheckIn: opts.checkedIn ? now : null,
      actualCheckOut: opts.checkedOut ? now : null,
      staffCheckIn: opts.checkedIn ? "admin" : null,
      staffCheckOut: opts.checkedOut ? "admin" : null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  // Upcoming confirmed & paid — Room 101
  bookings.push(
    makeBooking({
      room: rooms[0],
      guest: guests[0],
      checkIn: addDays(today, 4),
      checkOut: addDays(today, 6),
      guestsCount: 2,
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "gcash",
    })
  );

  // Currently checked-in — Room 102 (occupied now)
  bookings.push(
    makeBooking({
      room: rooms[1],
      guest: guests[1],
      checkIn: addDays(today, -2),
      checkOut: addDays(today, 1),
      guestsCount: 2,
      status: "checked_in",
      paymentStatus: "paid",
      paymentMethod: "cash",
      checkedIn: true,
    })
  );

  // Past, checked-out with additional charges — Room 103
  bookings.push(
    makeBooking({
      room: rooms[2],
      guest: guests[2],
      checkIn: addDays(today, -10),
      checkOut: addDays(today, -8),
      guestsCount: 1,
      status: "checked_out",
      paymentStatus: "paid",
      paymentMethod: "card",
      additionalCharges: [
        { label: "Food", amount: 800 },
        { label: "Laundry", amount: 300 },
      ],
      checkedIn: true,
      checkedOut: true,
    })
  );

  // Pending & unpaid — Room 105
  bookings.push(
    makeBooking({
      room: rooms[4],
      guest: guests[3],
      checkIn: addDays(today, 1),
      checkOut: addDays(today, 3),
      guestsCount: 3,
      status: "pending",
      paymentStatus: "unpaid",
      paymentMethod: null,
    })
  );

  // Cancelled & refunded — Room 101 (different dates, no conflict)
  bookings.push(
    makeBooking({
      room: rooms[0],
      guest: guests[4],
      checkIn: addDays(today, 10),
      checkOut: addDays(today, 11),
      guestsCount: 1,
      status: "cancelled",
      paymentStatus: "refunded",
      paymentMethod: "maya",
    })
  );

  // Today's check-in demo — Room 103
  bookings.push(
    makeBooking({
      room: rooms[2],
      guest: guests[5],
      checkIn: today,
      checkOut: addDays(today, 2),
      guestsCount: 2,
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "bank_transfer",
    })
  );

  // Today's check-out demo — Room 105 (checked in a few days ago, leaves today)
  bookings.push(
    makeBooking({
      room: rooms[4],
      guest: guests[6],
      checkIn: addDays(today, -3),
      checkOut: today,
      guestsCount: 2,
      status: "checked_in",
      paymentStatus: "paid",
      paymentMethod: "cash",
      checkedIn: true,
    })
  );

  const payments = bookings
    .filter((b) => b.paymentStatus === "paid" || b.paymentStatus === "refunded")
    .map((b) => ({
      id: id(),
      bookingId: b.id,
      amount: b.total,
      method: b.paymentMethod || "cash",
      status: b.paymentStatus,
      reference: `PAY-${b.bookingReference}`,
      createdAt: now,
    }));

  const notifications: Database["notifications"] = bookings.map((b, i) => ({
    id: id(),
    type: "new_booking",
    title: "New Booking",
    message: `${guests.find((g) => g.id === b.guestId)?.name} booked ${rooms.find((r) => r.id === b.roomId)?.name} — ${b.bookingReference}.`,
    read: i > 2,
    bookingId: b.id,
    createdAt: now,
  }));

  const emailLogs: Database["emailLogs"] = bookings.map((b) => ({
    id: id(),
    bookingId: b.id,
    recipient: guests.find((g) => g.id === b.guestId)?.email || "",
    subject: `Booking Confirmation — ${b.bookingReference}`,
    content: `Your booking ${b.bookingReference} is ${b.status}. Total: ${b.total}.`,
    status: "sent",
    createdAt: now,
  }));

  const smsLogs: Database["smsLogs"] = bookings.map((b) => ({
    id: id(),
    bookingId: b.id,
    phone: guests.find((g) => g.id === b.guestId)?.phone || "",
    message: `Your booking ${b.bookingReference} has been ${b.status}.`,
    status: "sent",
    createdAt: now,
  }));

  return {
    rooms,
    guests,
    bookings,
    payments,
    notifications,
    emailLogs,
    smsLogs,
    coupons: [
      {
        id: id(),
        code: "WELCOME10",
        discountPercent: 10,
        expiresAt: addDays(today, 90),
        maxUses: 50,
        uses: 3,
        active: true,
        createdAt: now,
      },
    ],
    gallery: [
      { id: id(), url: placeholder("Hotel Exterior", "#4a2f19"), category: "Exterior", caption: "Front entrance", createdAt: now },
      { id: id(), url: placeholder("Swimming Pool", "#1b1c22"), category: "Pool", caption: "Outdoor pool", createdAt: now },
      { id: id(), url: placeholder("Restaurant", "#5f3b1c"), category: "Restaurant", caption: "Main dining hall", createdAt: now },
      { id: id(), url: placeholder("Lobby", "#7d4d1f"), category: "Hotel", caption: "Hotel lobby", createdAt: now },
    ],
    settings: {
      hotelName: "Pellas Grand Hotel",
      tagline: "Comfort, warmth, and hospitality — right in the heart of the city.",
      logo: null,
      heroImage: placeholder("Pellas Grand Hotel", "#101116"),
      description:
        "Pellas Grand Hotel offers a premium yet welcoming stay with modern rooms, attentive service, and easy access to the city's best spots. Whether you're here for business or leisure, we make sure every stay feels like home.",
      address: "123 Rizal Avenue, Manila, Philippines",
      phone: "+63 2 8123 4567",
      email: "frontdesk@pellasgrandhotel.local",
      checkInTime: "14:00",
      checkOutTime: "12:00",
      currency: "PHP",
      taxRate: 0.12,
      serviceChargeRate: 0.05,
      bookingRules:
        "Check-in from 2:00 PM, check-out by 12:00 PM. Valid ID required at check-in. Cancellations made 24 hours before check-in are eligible for a full refund.",
      amenities: ["WiFi", "Pool", "Parking", "Restaurant", "Air Conditioning", "Breakfast", "Room Service", "24/7 Front Desk"],
      faq: [
        { question: "What time is check-in and check-out?", answer: "Check-in is at 2:00 PM and check-out is at 12:00 PM." },
        { question: "Is breakfast included?", answer: "Breakfast is included with select room types — check the room details." },
        { question: "Can I cancel my booking?", answer: "Yes, cancellations made at least 24 hours before check-in receive a full refund." },
        { question: "Do you allow pets?", answer: "Please contact the front desk in advance to arrange for pet-friendly accommodations." },
      ],
    },
    sessions: [],
    counters: { bookingSeq: seq },
  };
}
