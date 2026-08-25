import { NextResponse } from "next/server";
import { encryptDeliveryCode, hashDeliveryCode } from "../db";
import { mongoDb } from "../../../lib/mongodb";
import { getViewer } from "../../supabase/server";
import { cleanupAbandonedCheckouts } from "../maintenance";
import { calculateDeliveryFeePaise, calculateDistanceMeters, readCoordinates } from "../delivery/fees";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await cleanupAbandonedCheckouts();
  const db = mongoDb();
  const body = await request.json() as any;
  const name = body.customerName?.trim();
  const mobile = body.mobileNumber?.replace(/\D/g, "");
  const deliveryAddress = body.deliveryAddress?.trim();
  if (!name || !mobile || mobile.length !== 10 || !deliveryAddress || !body.items?.length) return NextResponse.json({ error: "Name, 10-digit mobile, delivery address and cart items are required" }, { status: 400 });
  const [availability, store] = await Promise.all([db.collection<any>("order_availability").findOne({ id: "main" }), db.collection<any>("store_location").findOne({ id: "main" })]);
  if (availability?.accepting_orders === 0) return NextResponse.json({ error: "Service will be live soon. We are not accepting orders right now." }, { status: 503 });
  const customerLocation = readCoordinates(body);
  const storeLocation = readCoordinates(store);
  if (!customerLocation || !storeLocation) return NextResponse.json({ error: "Delivery is temporarily unavailable. Use your current location and try again." }, { status: 503 });
  for (const item of body.items as any[]) {
    const record = item.kind === "ADDON"
      ? await db.collection("addons").findOne({ id: item.addonId, active: { $in: [true, 1] } })
      : await db.collection("uploads").findOne({ id: item.uploadId, customer_email: viewer.email, order_id: { $in: [null, undefined] }, deleted_at: { $in: [null, undefined] } });
    if (!record) return NextResponse.json({ error: "One or more selected items are unavailable" }, { status: 400 });
  }
  const [fees, profile] = await Promise.all([db.collection<any>("checkout_fee_settings").findOne({ id: "main" }), db.collection<any>("customer_profiles").findOne({ email: viewer.email })]);
  const distance = Math.round(calculateDistanceMeters(storeLocation, customerLocation));
  const subtotal = Math.max(0, Math.round(Number(body.totalPaise) || 0));
  const deliveryFee = calculateDeliveryFeePaise(distance, Number(fees?.delivery_base_fee_paise) || 1000, Number(fees?.delivery_fee_per_100m_paise) || 100);
  const platformFee = Math.max(0, Number(fees?.platform_fee_paise) || 350);
  const packagingFee = body.needsPackaging && fees?.packaging_enabled ? Math.max(0, Number(fees.packaging_fee_paise) || 0) : 0;
  const beforePoints = subtotal + deliveryFee + platformFee + packagingFee;
  const pointsRedeemed = body.usePoints ? Math.min(Number(profile?.points_balance) || 0, Math.max(0, Math.floor((beforePoints - 100) * .15))) : 0;
  const pointsDiscount = Math.floor(pointsRedeemed * 100 / 15);
  const total = beforePoints - pointsDiscount;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const itemsJson = JSON.stringify(body.items);
  const existing = await db.collection<any>("orders").find({ customer_email: viewer.email, payment_status: "PENDING", status: "PAYMENT_PENDING", items_json: itemsJson, total_paise: total }).sort({ created_at: -1 }).limit(1).next();
  if (existing) return NextResponse.json({ id: existing.id, orderNumber: null, locationName: existing.location_name, totalPaise: existing.total_paise, pointsRedeemed: existing.points_redeemed, pointsDiscountPaise: existing.points_discount_paise, paymentMode: "RAZORPAY" });
  const deliveryCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await db.collection("orders").insertOne({ id, order_number: `CHECKOUT-${id}`, customer_email: viewer.email, customer_name: name, mobile_number: mobile, location_id: "CURRENT_GPS", location_name: deliveryAddress, items_json: itemsJson, printing_subtotal_paise: subtotal, delivery_fee_paise: deliveryFee, platform_fee_paise: platformFee, packaging_fee_paise: packagingFee, total_paise: total, points_redeemed: pointsRedeemed, points_discount_paise: pointsDiscount, delivery_latitude: customerLocation.latitude, delivery_longitude: customerLocation.longitude, delivery_address: deliveryAddress, delivery_landmark: body.deliveryLandmark?.trim() || null, delivery_distance_meters: distance, store_latitude: storeLocation.latitude, store_longitude: storeLocation.longitude, delivery_code_hash: await hashDeliveryCode(id, deliveryCode), delivery_code_encrypted: await encryptDeliveryCode(deliveryCode), status: "PAYMENT_PENDING", payment_status: "PENDING", created_at: now });
  return NextResponse.json({ id, orderNumber: null, locationName: deliveryAddress, totalPaise: total, pointsRedeemed, pointsDiscountPaise: pointsDiscount, paymentMode: "RAZORPAY" });
}
