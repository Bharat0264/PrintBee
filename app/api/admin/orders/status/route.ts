import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { sendPushToEmail } from "../../../push/send";

const allowed = new Set(["CONFIRMED", "PRINTING", "READY_FOR_PICKUP", "RIDER_ASSIGNED"]);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, status } = await request.json() as { orderId?: string; status?: string };
  if (!status || !allowed.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const db = database();
  const order = await db.prepare("SELECT order_number,customer_email FROM orders WHERE id=? AND payment_status='PAID'").bind(orderId).first<{ order_number: string; customer_email: string }>();
  await db.prepare("UPDATE orders SET status=? WHERE id=? AND payment_status='PAID' AND status NOT IN ('DELIVERED','CANCELLED')").bind(status, orderId).run();
  if (order) await sendPushToEmail(order.customer_email, { title: "Order updated", body: `${order.order_number} is now ${status.replaceAll("_", " ").toLowerCase()}.`, tag: `${orderId}-${status}`, url: "/" });
  return NextResponse.json({ updated: true });
}
