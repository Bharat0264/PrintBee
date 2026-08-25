import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../db";
import { getViewer } from "../../supabase/server";
import { cleanupAbandonedCheckouts } from "../maintenance";
import { calculateDeliveryFeePaise, calculateDistanceMeters, readCoordinates } from "../delivery/fees";

async function createOrder(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await cleanupAbandonedCheckouts();
  const availability = await database().prepare("SELECT accepting_orders FROM order_availability WHERE id='main'").first<{ accepting_orders: number }>();
  if (availability?.accepting_orders === 0) return NextResponse.json({ error: "Service will be live soon. We are not accepting orders right now." }, { status: 503 });
  const body = await request.json() as { customerName?: string; mobileNumber?: string; deliveryAddress?: string; deliveryLandmark?: string; incampusDelivery?: boolean; incampusType?: "CLASSROOM" | "HOSTEL"; campusBuilding?: string; classroomNumber?: string; couponCode?: string; items?: unknown[]; totalPaise?: number; usePoints?: boolean; needsPackaging?: boolean; latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  const deliveryAddress = body.deliveryAddress?.trim();
  const deliveryLandmark = body.deliveryLandmark?.trim() || null;
  const incampusDelivery = body.incampusDelivery === true;
  const incampusType = body.incampusType === "HOSTEL" ? "HOSTEL" : "CLASSROOM";
  const campusBuilding = body.campusBuilding?.trim() || null;
  const classroomNumber = body.classroomNumber?.trim() || null;
  const couponCode = body.couponCode?.trim().toUpperCase() || null;
  if (!name || !mobile || mobile.length !== 10 || !deliveryAddress || deliveryAddress.length > 500 || !body.items?.length) {
    return NextResponse.json({ error: "Name, 10-digit mobile, delivery address and cart items are required" }, { status: 400 });
  }
  if (incampusDelivery && (!campusBuilding || campusBuilding.length > 160 || (incampusType === "CLASSROOM" && (!classroomNumber || classroomNumber.length > 80)))) return NextResponse.json({ error: incampusType === "CLASSROOM" ? "Enter the classroom number and building name" : "Enter the hostel building name" }, { status: 400 });
  if (couponCode && couponCode !== "ADMIN50") return NextResponse.json({ error: "Coupon code is invalid" }, { status: 400 });
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
  const deliveryAccuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0 ? body.accuracy : null;
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
  const feeSettings = await database().prepare("SELECT gateway_enabled,surge_enabled,surge_type,surge_value,late_night_enabled,late_night_type,late_night_value,platform_fee_paise,delivery_base_fee_paise,delivery_fee_per_100m_paise,packaging_enabled,packaging_fee_paise FROM checkout_fee_settings WHERE id='main'").first<any>();
  const storedPlatformFee = Number(feeSettings?.platform_fee_paise);
  const platformFeePaise = Number.isFinite(storedPlatformFee) ? Math.max(0, storedPlatformFee) : 350;
  const baseDeliveryFeePaise = Number(feeSettings?.delivery_base_fee_paise);
  const deliveryFeePer100MetersPaise = Number(feeSettings?.delivery_fee_per_100m_paise);
  const deliveryFeePaise = calculateDeliveryFeePaise(deliveryDistanceMeters, Number.isFinite(baseDeliveryFeePaise) ? baseDeliveryFeePaise : 1000, Number.isFinite(deliveryFeePer100MetersPaise) ? deliveryFeePer100MetersPaise : 100);
  const incampusFeePaise = incampusDelivery ? 1000 : 0;
  const couponDeliveryDiscountPaise = couponCode === "ADMIN50" ? Math.floor(deliveryFeePaise / 2) : 0;
  const packagingFeePaise = body.needsPackaging && feeSettings?.packaging_enabled ? Math.max(0, Number(feeSettings.packaging_fee_paise) || 0) : 0;
  const feeBasePaise = printingSubtotalPaise + deliveryFeePaise - couponDeliveryDiscountPaise + incampusFeePaise + platformFeePaise;
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
  if (couponCode === "ADMIN50") {
    const couponClaim = await db.prepare("INSERT INTO coupon_redemptions (coupon_code,customer_email,order_id,created_at) SELECT 'ADMIN50',?,?,? WHERE (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_code='ADMIN50') < 15 AND NOT EXISTS (SELECT 1 FROM coupon_redemptions WHERE coupon_code='ADMIN50' AND customer_email=?)")
      .bind(viewer.email, id, now, viewer.email).run();
    if (!couponClaim.meta.changes) {
      const usedBefore = await db.prepare("SELECT 1 FROM coupon_redemptions WHERE coupon_code='ADMIN50' AND customer_email=?").bind(viewer.email).first();
      return NextResponse.json({ error: usedBefore ? "You have already used ADMIN50. This offer is limited to one use per customer." : "ADMIN50 has expired. The first 15 redemptions have been used." }, { status: 400 });
    }
  }
  await db.prepare(`INSERT INTO orders (id, order_number, customer_email, customer_name, mobile_number, location_id, location_name, items_json, printing_subtotal_paise, delivery_fee_paise, coupon_code, coupon_delivery_discount_paise, incampus_delivery, incampus_type, campus_building, classroom_number, incampus_fee_paise, delivery_latitude, delivery_longitude, delivery_accuracy, delivery_address, delivery_landmark, delivery_captured_at, delivery_distance_meters, store_latitude, store_longitude, platform_fee_paise, packaging_fee_paise, payment_gateway_fee_paise, surge_fee_paise, late_night_fee_paise, total_paise, points_redeemed, points_discount_paise, referral_rewarded_at, delivery_code_hash, delivery_code_encrypted, status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'PENDING', ?)`)
    .bind(id, orderNumber, viewer.email, name, mobile, "CURRENT_GPS", incampusDelivery ? `In-campus ${incampusType === "CLASSROOM" ? "classroom" : "hostel"}: ${campusBuilding}${classroomNumber ? ` · Room ${classroomNumber}` : ""}` : deliveryAddress, JSON.stringify(body.items), printingSubtotalPaise, deliveryFeePaise, couponCode, couponDeliveryDiscountPaise, incampusDelivery ? 1 : 0, incampusDelivery ? incampusType : null, campusBuilding, classroomNumber, incampusFeePaise, customerLocation.latitude, customerLocation.longitude, deliveryAccuracy, deliveryAddress, deliveryLandmark, now, deliveryDistanceMeters, storeLocation.latitude, storeLocation.longitude, platformFeePaise, packagingFeePaise, paymentGatewayFeePaise, surgeFeePaise, lateNightFeePaise, totalPaise, pointsRedeemed, pointsDiscountPaise, null, hash, encryptedCode, now).run();
  return NextResponse.json({ id, orderNumber: null, locationName: incampusDelivery ? `In-campus ${incampusType === "CLASSROOM" ? "classroom" : "hostel"}: ${campusBuilding}${classroomNumber ? ` · Room ${classroomNumber}` : ""}` : deliveryAddress, totalPaise, lateNightFeePaise, pointsRedeemed, pointsDiscountPaise, paymentMode: "RAZORPAY" });
}

export async function POST(request: Request) {
  try {
    return await createOrder(request);
  } catch (error) {
    console.error("[orders] checkout creation failed", error);
    return NextResponse.json({ error: "We could not create your order. Please try again in a moment." }, { status: 500 });
  }
}
