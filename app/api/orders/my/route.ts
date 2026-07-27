import { NextResponse } from "next/server";
import { database, decryptDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rows = await database().prepare("SELECT id, order_number, location_name, total_paise, status, payment_status, payment_reference, delivery_code_encrypted, created_at FROM orders WHERE customer_email=? ORDER BY created_at DESC").bind(viewer.email).all<any>();
  const orders = await Promise.all(rows.results.map(async (order) => ({
    ...order,
    deliveryCode: order.delivery_code_encrypted ? await decryptDeliveryCode(order.delivery_code_encrypted) : null,
    delivery_code_encrypted: undefined,
  })));
  return NextResponse.json(orders);
}
