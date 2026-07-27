import { NextResponse } from "next/server";
import { database, hashDeliveryCode } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!viewer.isAdmin) {
    const agent = await database().prepare("SELECT role FROM app_users WHERE email = ? AND role = 'AGENT'").bind(viewer.email).first();
    if (!agent) return NextResponse.json({ error: "Delivery-agent access required" }, { status: 403 });
  }
  const { orderNumber, code } = await request.json() as { orderNumber?: string; code?: string };
  const order = await database().prepare("SELECT id, delivery_code_hash, status, payment_status, rider_email FROM orders WHERE order_number = ?").bind(orderNumber?.trim().toUpperCase()).first<{ id: string; delivery_code_hash: string; status: string; payment_status: string; rider_email: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "DELIVERED") return NextResponse.json({ error: "Order is already delivered" }, { status: 409 });
  if (order.payment_status !== "PAID") return NextResponse.json({ error: "Order payment is not complete" }, { status: 400 });
  if (!viewer.isAdmin && order.rider_email !== viewer.email) return NextResponse.json({ error: "This order is assigned to another rider" }, { status: 403 });
  const candidate = await hashDeliveryCode(order.id, code?.trim() ?? "");
  if (candidate !== order.delivery_code_hash) return NextResponse.json({ error: "Delivery code does not match" }, { status: 400 });
  await database().prepare("UPDATE orders SET status = 'DELIVERED', delivered_at = ?, delivered_by = ? WHERE id = ? AND status = 'PLACED'").bind(new Date().toISOString(), viewer.email, order.id).run();
  return NextResponse.json({ delivered: true });
}
