import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../db";
import { getViewer } from "../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const availability = await database().prepare("SELECT accepting_orders FROM order_availability WHERE id='main'").first<{ accepting_orders: number }>();
  if (availability?.accepting_orders === 0) return NextResponse.json({ error: "Service will be live soon. We are not accepting orders right now." }, { status: 503 });
  const body = await request.json() as { customerName?: string; mobileNumber?: string; locationId?: string; items?: unknown[]; totalPaise?: number; usePoints?: boolean };
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  if (!name || !mobile || mobile.length !== 10 || !body.locationId || !body.items?.length) {
    return NextResponse.json({ error: "Name, 10-digit mobile, location and cart items are required" }, { status: 400 });
  }
  const location = await database().prepare("SELECT id, name, delivery_fee_paise, platform_fee_paise FROM locations WHERE id = ? AND active = 1").bind(body.locationId).first<{ id: string; name: string; delivery_fee_paise: number; platform_fee_paise: number }>();
  if (!location) return NextResponse.json({ error: "Choose an available delivery location" }, { status: 400 });
  const id = crypto.randomUUID();
  const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const deliveryCode = code.toString().padStart(6, "0");
  const printingSubtotalPaise = Math.max(0, Math.round(Number(body.totalPaise) || 0));
  const deliveryFeePaise = location.delivery_fee_paise ?? 1500;
  const platformFeePaise = location.platform_fee_paise ?? 350;
  const uploadIds = body.items.map((item: any) => item.uploadId).filter(Boolean);
  if (uploadIds.length !== body.items.length) return NextResponse.json({ error: "Every cart item must finish uploading" }, { status: 400 });
  let totalPrintedPages = 0;
  for (const item of body.items as Array<{ uploadId?: string; copies?: number; serviceId?: string }>) {
    const upload = await database().prepare("SELECT id, page_count FROM uploads WHERE id=? AND customer_email=? AND order_id IS NULL").bind(item.uploadId, viewer.email).first<{ id: string; page_count: number }>();
    if (!upload) return NextResponse.json({ error: "One or more uploaded files are unavailable" }, { status: 400 });
    const service = await database().prepare("SELECT counts_for_packaging FROM print_services WHERE id=? AND active=1").bind(item.serviceId || "document-printing").first<{ counts_for_packaging: number }>();
    if (!service) return NextResponse.json({ error: "One or more selected services are unavailable" }, { status: 400 });
    if (service.counts_for_packaging) totalPrintedPages += upload.page_count * Math.max(1, Math.min(100, Math.round(Number(item.copies) || 1)));
  }
  const packagingRule = await database().prepare("SELECT charge_paise FROM packaging_charge_rules WHERE min_pages<=? AND max_pages>=? ORDER BY min_pages DESC LIMIT 1").bind(totalPrintedPages, totalPrintedPages).first<{ charge_paise: number }>();
  const packagingFeePaise = packagingRule?.charge_paise ?? 0;
  const feeSettings = await database().prepare("SELECT gateway_enabled,surge_enabled,surge_type,surge_value,late_night_enabled,late_night_type,late_night_value FROM checkout_fee_settings WHERE id='main'").first<any>();
  const feeBasePaise = printingSubtotalPaise + deliveryFeePaise + platformFeePaise;
  const surgeFeePaise = feeSettings?.surge_enabled ? feeSettings.surge_type === "FIXED" ? Math.round(Number(feeSettings.surge_value) * 100) : Math.round(feeBasePaise * Number(feeSettings.surge_value) / 100) : 0;
  const lateNightFeePaise = feeSettings?.late_night_enabled ? feeSettings.late_night_type === "FIXED" ? Math.round(Number(feeSettings.late_night_value) * 100) : Math.round(feeBasePaise * Number(feeSettings.late_night_value) / 100) : 0;
  const paymentGatewayFeePaise = feeSettings?.gateway_enabled ? Math.round(feeBasePaise * 0.01) : 0;
  const grossTotalPaise = feeBasePaise + packagingFeePaise + surgeFeePaise + lateNightFeePaise + paymentGatewayFeePaise;
  const profile = await database().prepare("SELECT points_balance FROM customer_profiles WHERE email=?").bind(viewer.email).first<{ points_balance: number }>();
  const maxRedeemablePoints = Math.max(0, Math.floor((grossTotalPaise - 100) * 15 / 100));
  const pointsRedeemed = body.usePoints ? Math.min(profile?.points_balance ?? 0, maxRedeemablePoints) : 0;
  const pointsDiscountPaise = Math.floor(pointsRedeemed * 100 / 15);
  const totalPaise = grossTotalPaise - pointsDiscountPaise;
  const hash = await hashDeliveryCode(id, deliveryCode);
  const encryptedCode = await encryptDeliveryCode(deliveryCode);
  const db = database();
  const sequence = await db.prepare("UPDATE order_sequences SET next_value=next_value+1 WHERE id='orders' RETURNING next_value-1 number").first<{ number: number }>();
  if (!sequence) return NextResponse.json({ error: "Order numbering is temporarily unavailable" }, { status: 503 });
  const orderNumber = `PB${String(sequence.number).padStart(3, "0")}`;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO orders (id, order_number, customer_email, customer_name, mobile_number, location_id, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, platform_fee_paise, packaging_fee_paise, payment_gateway_fee_paise, surge_fee_paise, late_night_fee_paise, total_paise, points_redeemed, points_discount_paise, referral_rewarded_at, delivery_code_hash, delivery_code_encrypted, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'PENDING', ?)`)
      .bind(id, orderNumber, viewer.email, name, mobile, location.id, location.name, JSON.stringify(body.items), printingSubtotalPaise, deliveryFeePaise, platformFeePaise, packagingFeePaise, paymentGatewayFeePaise, surgeFeePaise, lateNightFeePaise, totalPaise, pointsRedeemed, pointsDiscountPaise, null, hash, encryptedCode, now),
    ...(pointsRedeemed ? [db.prepare("UPDATE customer_profiles SET points_balance=points_balance-? WHERE email=? AND points_balance>=?").bind(pointsRedeemed, viewer.email, pointsRedeemed)] : []),
    ...uploadIds.map((uploadId) => db.prepare("UPDATE uploads SET order_id=? WHERE id=?").bind(id, uploadId)),
    ...uploadIds.map((uploadId) => db.prepare("DELETE FROM cart_items WHERE upload_id=? AND customer_email=?").bind(uploadId, viewer.email)),
  ]);
  return NextResponse.json({ id, orderNumber, locationName: location.name, totalPaise, lateNightFeePaise, pointsRedeemed, pointsDiscountPaise, paymentMode: "RAZORPAY" });
}
