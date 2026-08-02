import { NextResponse } from "next/server";
import { database, decryptDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rows = await database().prepare("SELECT o.id, o.order_number, o.location_name, o.total_paise, o.status, o.payment_status, o.payment_reference, o.payment_rejection_reason, o.payment_qr_storage_key IS NOT NULL has_payment_qr, CASE WHEN o.rider_email IS NOT NULL THEN COALESCE(u.name, 'Delivery partner') END rider_name, CASE WHEN o.rider_email IS NOT NULL THEN u.mobile_number END rider_mobile_number, o.cancellation_reason, o.delivery_code_encrypted, o.created_at FROM orders o LEFT JOIN app_users u ON u.email=o.rider_email WHERE o.customer_email=? ORDER BY o.created_at DESC").bind(viewer.email).all<any>();
  const orders = await Promise.all(rows.results.map(async (order) => ({
    ...order,
    deliveryCode: order.payment_status === "PAID" && order.delivery_code_encrypted ? await decryptDeliveryCode(order.delivery_code_encrypted) : null,
    delivery_code_encrypted: undefined,
  })));
  return NextResponse.json(orders);
}
