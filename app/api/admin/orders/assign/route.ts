import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { sendPushToEmail } from "../../../push/send";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, riderEmail } = await request.json() as { orderId?: string; riderEmail?: string };
  const rider = await database().prepare("SELECT email FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED' AND is_available=1").bind(riderEmail?.toLowerCase()).first();
  if (!rider) return NextResponse.json({ error: "Select an available rider" }, { status: 400 });
  const result = await database().prepare("UPDATE orders SET rider_email=?, status='RIDER_ASSIGNED' WHERE id=? AND payment_status='PAID' AND status IN ('READY_FOR_PICKUP','CONFIRMED','PRINTING','RIDER_ASSIGNED')").bind(riderEmail?.toLowerCase(), orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Only active orders can be assigned" }, { status: 400 });
  const order = await database().prepare("SELECT order_number,customer_email FROM orders WHERE id=?").bind(orderId).first<{ order_number: string; customer_email: string }>();
  if (order) await Promise.all([sendPushToEmail(order.customer_email, { title: "Delivery partner assigned", body: `${order.order_number} now has a delivery partner.`, tag: `${orderId}-rider`, url: "/" }), sendPushToEmail(riderEmail!.toLowerCase(), { title: "Order assigned", body: `${order.order_number} has been assigned to you.`, tag: `${orderId}-assigned`, url: "/" })]);
  return NextResponse.json({ assigned: true });
}
