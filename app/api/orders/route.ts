import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../db";
import { getViewer } from "../../supabase/server";
import { cleanupAbandonedCheckouts } from "../maintenance";
import { calculateDeliveryFeePaise, calculateDistanceMeters, readCoordinates } from "../delivery/fees";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await cleanupAbandonedCheckouts();
  const availability = await database().prepare("SELECT accepting_orders FROM order_availability WHERE id='main'").first<{ accepting_orders: number }>();
  if (availability?.accepting_orders === 0) return NextResponse.json({ error: "Service will be live soon. We are not accepting orders right now." }, { status: 503 });
  const body = await request.json() as { customerName?: string; mobileNumber?: string; deliveryAddress?: string; deliveryLandmark?: string; items?: unknown[]; totalPaise?: number; usePoints?: boolean; needsPackaging?: boolean; latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  const deliveryAddress = body.deliveryAddress?.trim();
  const deliveryLandmark = body.deliveryLandmark?.trim() || null;
  if (!name || !mobile || mobile.length !== 10 || !deliveryAddress || deliveryAddress.length > 500 || !body.items?.length) {
    return NextResponse.json({ error: "Name, 10-digit mobile, delivery address and cart items are required" }, { status: 400 });
  }
  const customerLocation = readCoordinates(body);
  if (!customerLocation) return NextResponse.json({ error: "Use your current location before checkout" }, { status: 400 });
  const store = await database().prepare("SELECT latitude,longitude FROM store_location WHERE id='main'").first<{ latitude: number; longitude: number }>();
  const storeLocation = readCoordinates(store);
  if (!storeLocation) return NextResponse.json({ error: "Delivery is temporarily unavailable" }, { status: 503 });
  const id = crypto.randomUUID();
  const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const deliveryCode = code.toString().padStart(6, "0");
  const printingSubtotalPaise = Math.max(0, Math.round(Number(body.totalPaise) || 0));
  const deliveryDistanceMeters = Math.round(calculateDistanceMeters(storeLocation, customerLocation));
  const deliveryFeePaise = calculateDeliveryFeePaise(deliveryDistanceMeters);
  const deliveryAccuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0 ? body.accuracy : null;
  const platformFeePaise = 350;
  const uploadIds = body.items.filter((item: any) => item.kind !== "ADDON").map((item: any) => item.uploadId).filter(Boolean);
  if (uploadIds.length !== body.items.filter((item: any) => item.kind !== "ADDON").length) return NextResponse.json({ error: "Every print item must finish uploading" }, { status: 400 });
  for (const item of body.items as Array<{ kind?: string; addonId?: string; uploadId?: string; copies?: number; serviceId?: string }>) {
    if (item.kind === "ADDON") {
      const addon = await database().prepare("SELECT id FROM addons WHERE id=? AND active=1").bind(item.addonId).first<{ id: string }>();
      if (!addon) return NextResponse.json({ error: "One or more selected add-ons are unavailable" }, { status: 400 });
      continue;
    }
    const upload = await database().prepare("SELECT id, page_count FROM uploads WHERE id=? AND customer_email=? AND order_id IS NULL").bind(item.uploadId, viewer.email).first<{ id: string; page_count: number }>();
    if (!upload) return NextResponse.json({ error: "One or more uploaded files are unavailable" }, { status: 400 });
    const service = await database().prepare("SELECT id FROM print_services WHERE id=? AND active=1").bind(item.serviceId || "document-printing").first<{ id: string }>();
    if (!service) return NextResponse.json({ error: "One or more selected services are unavailable" }, { status: 400 });
  }
  const feeSettings = await database().prepare("SELECT gateway_enabled,surge_enabled,surge_type,surge_value,late_night_enabled,late_night_type,late_night_value,packaging_enabled,packaging_fee_paise FROM checkout_fee_settings WHERE id='main'").first<any>();
  const packagingFeePaise = body.needsPackaging && feeSettings?.packaging_enabled ? Math.max(0, Number(feeSettings.packaging_fee_paise) || 0) : 0;
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
  const existing = await db.prepare("SELECT id,order_number,location_name,total_paise,late_night_fee_paise,points_redeemed,points_discount_paise FROM orders WHERE customer_email=? AND payment_status='PENDING' AND status='PAYMENT_PENDING' AND location_id=? AND items_json=? AND total_paise=? ORDER BY created_at DESC LIMIT 1")
    .bind(viewer.email, "CURRENT_GPS", JSON.stringify(body.items), totalPaise).first<any>();
  if (existing) return NextResponse.json({ id: existing.id, orderNumber: null, locationName: existing.location_name, totalPaise: existing.total_paise, lateNightFeePaise: existing.late_night_fee_paise, pointsRedeemed: existing.points_redeemed, pointsDiscountPaise: existing.points_discount_paise, paymentMode: "RAZORPAY" });
  const orderNumber = `CHECKOUT-${id}`;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO orders (id, order_number, customer_email, customer_name, mobile_number, location_id, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, delivery_latitude, delivery_longitude, delivery_accuracy, delivery_address, delivery_landmark, delivery_captured_at, delivery_distance_meters, store_latitude, store_longitude, platform_fee_paise, packaging_fee_paise, payment_gateway_fee_paise, surge_fee_paise, late_night_fee_paise, total_paise, points_redeemed, points_discount_paise, referral_rewarded_at, delivery_code_hash, delivery_code_encrypted, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'PENDING', ?)`)
      .bind(id, orderNumber, viewer.email, name, mobile, "CURRENT_GPS", deliveryAddress, JSON.stringify(body.items), printingSubtotalPaise, deliveryFeePaise, customerLocation.latitude, customerLocation.longitude, deliveryAccuracy, deliveryAddress, deliveryLandmark, now, deliveryDistanceMeters, storeLocation.latitude, storeLocation.longitude, platformFeePaise, packagingFeePaise, paymentGatewayFeePaise, surgeFeePaise, lateNightFeePaise, totalPaise, pointsRedeemed, pointsDiscountPaise, null, hash, encryptedCode, now),
  ]);
  return NextResponse.json({ id, orderNumber: null, locationName: deliveryAddress, totalPaise, lateNightFeePaise, pointsRedeemed, pointsDiscountPaise, paymentMode: "RAZORPAY" });
}
