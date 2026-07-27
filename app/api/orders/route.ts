import { NextResponse } from "next/server";
import { database, hashDeliveryCode } from "../db";
import { getViewer } from "../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { customerName?: string; mobileNumber?: string; locationId?: string; items?: unknown[]; totalPaise?: number };
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  if (!name || !mobile || mobile.length !== 10 || !body.locationId || !body.items?.length) {
    return NextResponse.json({ error: "Name, 10-digit mobile, location and cart items are required" }, { status: 400 });
  }
  const location = await database().prepare("SELECT id, name FROM locations WHERE id = ? AND active = 1").bind(body.locationId).first<{ id: string; name: string }>();
  if (!location) return NextResponse.json({ error: "Choose an available delivery location" }, { status: 400 });
  const id = crypto.randomUUID();
  const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const deliveryCode = code.toString().padStart(6, "0");
  const orderNumber = `PB${Date.now().toString().slice(-8)}`;
  const printingSubtotalPaise = Math.max(0, Math.round(Number(body.totalPaise) || 0));
  const deliveryFeePaise = 1500;
  const platformFeePaise = 350;
  const totalPaise = printingSubtotalPaise + deliveryFeePaise + platformFeePaise;
  const hash = await hashDeliveryCode(id, deliveryCode);
  await database().prepare(`INSERT INTO orders (id, order_number, customer_email, customer_name, mobile_number, location_id, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, total_paise, delivery_code_hash, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'PENDING', ?)`)
    .bind(id, orderNumber, viewer.email, name, mobile, location.id, location.name, JSON.stringify(body.items), printingSubtotalPaise, deliveryFeePaise, platformFeePaise, totalPaise, hash, new Date().toISOString()).run();
  return NextResponse.json({ id, orderNumber, deliveryCode, locationName: location.name, totalPaise, paymentConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) });
}
