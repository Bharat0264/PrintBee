import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await database().prepare("SELECT role FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(viewer.email).first();
    if (!agent) return NextResponse.json({ error: "Rider access required" }, { status: 403 });
  }
  const query = viewer.isAdmin
    ? database().prepare("SELECT id, order_number, customer_name, mobile_number, location_name, incampus_delivery, incampus_type, campus_building, classroom_number, delivery_latitude, delivery_longitude, total_paise, payment_status, status, rider_email, delivery_code_hash, delivery_code_encrypted, payment_qr_storage_key IS NOT NULL has_payment_qr, created_at FROM orders WHERE rider_email IS NOT NULL AND status!='DELIVERED' ORDER BY created_at")
    : database().prepare("SELECT id, order_number, customer_name, mobile_number, location_name, incampus_delivery, incampus_type, campus_building, classroom_number, delivery_latitude, delivery_longitude, total_paise, payment_status, status, rider_email, delivery_code_hash, delivery_code_encrypted, payment_qr_storage_key IS NOT NULL has_payment_qr, created_at FROM orders WHERE rider_email=? AND status!='DELIVERED' ORDER BY created_at").bind(viewer.email);
  const rows = await query.all<any>();
  await Promise.all(rows.results.filter((order) => order.payment_status === "PAID" && (!order.delivery_code_hash || !order.delivery_code_encrypted)).map(async (order) => {
    const deliveryCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await database().prepare("UPDATE orders SET delivery_code_hash=?,delivery_code_encrypted=? WHERE id=? AND (delivery_code_hash IS NULL OR delivery_code_encrypted IS NULL)").bind(await hashDeliveryCode(order.id, deliveryCode), await encryptDeliveryCode(deliveryCode), order.id).run();
  }));
  // Older assignments can have a rider email while still being marked Ready for
  // pickup. Present those to the rider as assigned so the normal Start pickup
  // button is available; the status endpoint repairs the stored transition.
  return NextResponse.json(rows.results.map((order) => order.status === "READY_FOR_PICKUP" ? { ...order, status: "RIDER_ASSIGNED" } : order));
}
