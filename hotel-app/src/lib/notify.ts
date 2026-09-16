import crypto from "crypto";
import { Database, Booking, Guest, Room } from "./types";
import { formatCurrency, formatDate } from "./format";

function id() {
  return crypto.randomUUID();
}

export function pushNotification(
  db: Database,
  type: Database["notifications"][number]["type"],
  title: string,
  message: string,
  bookingId?: string
) {
  db.notifications.unshift({
    id: id(),
    type,
    title,
    message,
    read: false,
    bookingId,
    createdAt: new Date().toISOString(),
  });
}

export function logEmail(db: Database, booking: Booking, recipient: string, subject: string, content: string) {
  db.emailLogs.unshift({
    id: id(),
    bookingId: booking.id,
    recipient,
    subject,
    content,
    status: "sent",
    createdAt: new Date().toISOString(),
  });
}

export function logSms(db: Database, booking: Booking, phone: string, message: string) {
  db.smsLogs.unshift({
    id: id(),
    bookingId: booking.id,
    phone,
    message,
    status: "sent",
    createdAt: new Date().toISOString(),
  });
}

/** Fires the full simulated notification cascade after a booking is created. */
export function fireBookingCreatedCascade(db: Database, booking: Booking, guest: Guest, room: Room) {
  pushNotification(
    db,
    "new_booking",
    "New Booking",
    `${guest.name} booked ${room.name} (Room ${room.roomNumber}) for ${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}, total ${formatCurrency(booking.total)}.`,
    booking.id
  );

  logEmail(
    db,
    booking,
    guest.email,
    `Booking Confirmation — ${booking.bookingReference}`,
    `Dear ${guest.name},\n\nThank you for booking with us!\n\nBooking Reference: ${booking.bookingReference}\nRoom: ${room.name} (Room ${room.roomNumber})\nCheck-in: ${formatDate(booking.checkIn)}\nCheck-out: ${formatDate(booking.checkOut)}\nGuests: ${booking.guests}\nTotal: ${formatCurrency(booking.total)}\nPayment status: ${booking.paymentStatus}\n\nWe look forward to welcoming you.`
  );

  logSms(
    db,
    booking,
    guest.phone,
    `Your booking ${booking.bookingReference} has been ${booking.status}. Check-in: ${formatDate(booking.checkIn)}.`
  );
}

export function fireCheckInCascade(db: Database, booking: Booking, guest: Guest, room: Room) {
  logEmail(db, booking, guest.email, `You're checked in — ${booking.bookingReference}`, `Dear ${guest.name},\n\nYou have been checked in to ${room.name} (Room ${room.roomNumber}).\n\nEnjoy your stay!`);
  logSms(db, booking, guest.phone, `You are now checked in to Room ${room.roomNumber}. Enjoy your stay!`);
}

export function fireCheckOutCascade(db: Database, booking: Booking, guest: Guest, room: Room) {
  logEmail(
    db,
    booking,
    guest.email,
    `Check-out Receipt — ${booking.bookingReference}`,
    `Dear ${guest.name},\n\nThank you for staying with us at ${room.name} (Room ${room.roomNumber}).\nFinal total: ${formatCurrency(booking.total)}\nPayment status: ${booking.paymentStatus}\n\nWe hope to see you again!`
  );
  logSms(db, booking, guest.phone, `Thank you for staying with us! Your final bill was ${formatCurrency(booking.total)}.`);
}

export function fireCancelledCascade(db: Database, booking: Booking, guest: Guest, room: Room) {
  pushNotification(db, "booking_cancelled", "Booking Cancelled", `${guest.name}'s booking ${booking.bookingReference} for ${room.name} was cancelled.`, booking.id);
  logEmail(db, booking, guest.email, `Booking Cancelled — ${booking.bookingReference}`, `Dear ${guest.name},\n\nYour booking ${booking.bookingReference} has been cancelled.`);
  logSms(db, booking, guest.phone, `Your booking ${booking.bookingReference} has been cancelled.`);
}

export function firePaymentReceivedCascade(db: Database, booking: Booking, guest: Guest) {
  pushNotification(db, "payment_received", "Payment Received", `Payment of ${formatCurrency(booking.total)} received for ${booking.bookingReference} (${guest.name}).`, booking.id);
  logEmail(db, booking, guest.email, `Payment Confirmation — ${booking.bookingReference}`, `Dear ${guest.name},\n\nWe've received your payment of ${formatCurrency(booking.total)} for booking ${booking.bookingReference}. Thank you!`);
}
