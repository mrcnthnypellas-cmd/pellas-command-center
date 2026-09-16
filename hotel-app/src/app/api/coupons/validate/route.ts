import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { isCouponValid } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  const { code, subtotal } = await req.json();
  if (!code) return NextResponse.json({ error: "Please enter a coupon code." }, { status: 400 });

  const db = readDb();
  const coupon = db.coupons.find((c) => c.code.toUpperCase() === String(code).toUpperCase());
  if (!isCouponValid(coupon)) {
    return NextResponse.json({ error: "That coupon code is invalid, expired, or has reached its usage limit." }, { status: 404 });
  }

  const discountAmount = Math.round(((Number(subtotal) || 0) * coupon.discountPercent) / 100 * 100) / 100;
  return NextResponse.json({ valid: true, discountPercent: coupon.discountPercent, discountAmount });
}
