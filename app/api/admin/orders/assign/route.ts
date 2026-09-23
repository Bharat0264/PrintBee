import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { sendPushToEmail } from "../../../push/send";
import { ensureTrackingTables, transitionOrder } from "../../../delivery/tracking";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, riderEmail } = await request.json() as { orderId?: string; riderEmail?: string };
  const rider = await database().prepare("SELECT email FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED' AND is_available=1").bind(riderEmail?.toLowerCase()).first();
  if (!rider) return NextResponse.json({ error: "Select an available rider" }, { status: 400 });
  await ensureTrackingTables();
  const db = database();
  const current = await db.prepare("SELECT status FROM orders WHERE id=? AND payment_status='PAID'").bind(orderId).first<{ status: string }>();
  if (!current || !["READY_FOR_PICKUP", "RIDER_ASSIGNED"].includes(current.status)) return NextResponse.json({ error: "Mark the order ready for pickup before assigning a rider" }, { status: 409 });
  const assigned = await db.prepare("UPDATE orders SET rider_email=? WHERE id=? AND payment_status='PAID'").bind(riderEmail?.toLowerCase(), orderId).run();
  const changed = current.status === "RIDER_ASSIGNED" || await transitionOrder(orderId!, current.status, "RIDER_ASSIGNED", viewer.email, "ADMIN");
  const result = { meta: { changes: assigned.meta.changes && changed ? 1 : 0 } };
  if (!result.meta.changes) return NextResponse.json({ error: "Only active orders can be assigned" }, { status: 400 });
  const order = await database().prepare("SELECT order_number,customer_email FROM orders WHERE id=?").bind(orderId).first<{ order_number: string; customer_email: string }>();
  if (order) await Promise.all([sendPushToEmail(order.customer_email, { title: "Delivery partner assigned", body: `${order.order_number} now has a delivery partner.`, tag: `${orderId}-rider`, url: "/" }), sendPushToEmail(riderEmail!.toLowerCase(), { title: "Order assigned", body: `${order.order_number} has been assigned to you.`, tag: `${orderId}-assigned`, url: "/" })]);
  return NextResponse.json({ assigned: true });
}
