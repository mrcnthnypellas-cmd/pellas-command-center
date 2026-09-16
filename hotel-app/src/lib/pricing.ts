import { AdditionalCharge, Coupon } from "./types";

export interface PriceBreakdown {
  nights: number;
  roomPrice: number;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  serviceChargeRate: number;
  serviceCharge: number;
  additionalChargesTotal: number;
  total: number;
}

export function calculatePrice(params: {
  roomPrice: number;
  nights: number;
  taxRate: number;
  serviceChargeRate: number;
  coupon?: Coupon | null;
  additionalCharges?: AdditionalCharge[];
}): PriceBreakdown {
  const { roomPrice, nights, taxRate, serviceChargeRate, coupon, additionalCharges = [] } = params;
  const subtotal = round2(roomPrice * nights);
  const discount = coupon ? round2((subtotal * coupon.discountPercent) / 100) : 0;
  const taxableBase = subtotal - discount;
  const tax = round2(taxableBase * taxRate);
  const serviceCharge = round2(taxableBase * serviceChargeRate);
  const additionalChargesTotal = round2(additionalCharges.reduce((sum, c) => sum + c.amount, 0));
  const total = round2(taxableBase + tax + serviceCharge + additionalChargesTotal);
  return {
    nights,
    roomPrice,
    subtotal,
    discount,
    taxRate,
    tax,
    serviceChargeRate,
    serviceCharge,
    additionalChargesTotal,
    total,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isCouponValid(coupon: Coupon | undefined | null): coupon is Coupon {
  if (!coupon) return false;
  if (!coupon.active) return false;
  if (coupon.expiresAt && coupon.expiresAt < new Date().toISOString().slice(0, 10)) return false;
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return false;
  return true;
}
