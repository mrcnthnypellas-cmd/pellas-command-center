// Core data model for the Hotel Booking & Management System.
// Everything here is persisted as plain JSON — see db.ts.

export type RoomStatus = "available" | "maintenance";
// Note: a room's per-date state (Reserved/Occupied) is derived from Bookings,
// never stored on the Room itself — see availability.ts. "maintenance" is the
// only status an admin sets directly, since it removes a room from booking
// regardless of dates.

export interface Room {
  id: string;
  roomNumber: string;
  name: string;
  type: string; // Deluxe, Standard, Suite, Family, ...
  description: string;
  price: number;
  capacity: number;
  bedType: string;
  amenities: string[];
  images: string[]; // data URLs or /uploads paths
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";
export type PaymentMethod = "cash" | "gcash" | "maya" | "bank_transfer" | "card";

export interface AdditionalCharge {
  id: string;
  label: string;
  amount: number;
  addedAt: string;
}

export interface Booking {
  id: string;
  bookingReference: string; // "HTL-000001"
  guestId: string;
  roomId: string;
  checkIn: string; // ISO date (yyyy-mm-dd)
  checkOut: string; // ISO date (yyyy-mm-dd)
  guests: number;
  nights: number;
  roomPrice: number; // price/night at time of booking
  subtotal: number;
  couponCode: string | null;
  discount: number;
  taxRate: number;
  tax: number;
  serviceChargeRate: number;
  serviceCharge: number;
  additionalCharges: AdditionalCharge[];
  total: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  staffCheckIn: string | null;
  staffCheckOut: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  type:
    | "new_booking"
    | "payment_received"
    | "booking_cancelled"
    | "todays_checkin"
    | "todays_checkout"
    | "maintenance"
    | "outstanding_payment";
  title: string;
  message: string;
  read: boolean;
  bookingId?: string;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  bookingId: string;
  recipient: string;
  subject: string;
  content: string;
  status: "sent" | "failed";
  createdAt: string;
}

export interface SmsLog {
  id: string;
  bookingId: string;
  phone: string;
  message: string;
  status: "sent" | "failed";
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  createdAt: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  category: "Hotel" | "Rooms" | "Pool" | "Restaurant" | "Exterior" | "Facilities";
  caption: string;
  createdAt: string;
}

export interface HotelSettings {
  hotelName: string;
  tagline: string;
  logo: string | null;
  heroImage: string | null;
  description: string;
  address: string;
  phone: string;
  email: string;
  checkInTime: string;
  checkOutTime: string;
  currency: string;
  taxRate: number; // e.g. 0.12 for 12%
  serviceChargeRate: number;
  bookingRules: string;
  amenities: string[];
  faq: { question: string; answer: string }[];
}

export interface AdminSession {
  token: string;
  username: string;
  createdAt: string;
  expiresAt: string;
}

export interface Counters {
  bookingSeq: number;
}

export interface Database {
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  payments: Payment[];
  notifications: NotificationRecord[];
  emailLogs: EmailLog[];
  smsLogs: SmsLog[];
  coupons: Coupon[];
  gallery: GalleryImage[];
  settings: HotelSettings;
  sessions: AdminSession[];
  counters: Counters;
}
