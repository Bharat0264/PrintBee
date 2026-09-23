import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { DELIVERY_STATUSES, ensureTrackingTables, transitionOrder } from "../../../delivery/tracking";
import { sendPushToEmail } from "../../../push/send";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rider = await database().prepare("SELECT 1 FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(viewer.email).first();
  if (!rider) return NextResponse.json({ error: "Approved rider access required" }, { status: 403 });
  const { orderId, status } = await request.json() as { orderId?: string; status?: string };
  if (!orderId || !DELIVERY_STATUSES.includes(status as any) || ["DELIVERED", "CANCELLED"].includes(status!)) return NextResponse.json({ error: "Invalid delivery action" }, { status: 400 });
  await ensureTrackingTables();
  const order = await database().prepare("SELECT status,customer_email,order_number FROM orders WHERE id=? AND rider_email=? AND payment_status='PAID'").bind(orderId, viewer.email).first<any>();
  if (!order) return NextResponse.json({ error: "Assigned order not found" }, { status: 404 });
  if (!await transitionOrder(orderId, order.status, status!, viewer.email, "RIDER")) return NextResponse.json({ error: "That action is not available for this order" }, { status: 409 });
  await sendPushToEmail(order.customer_email, { title: "Delivery update", body: `${order.order_number} is now ${status!.replaceAll("_", " ").toLowerCase()}.`, tag: `${orderId}-${status}`, url: "/" });
  return NextResponse.json({ updated: true, status });
}
