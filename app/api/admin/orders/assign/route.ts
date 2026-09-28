import { NextResponse } from "next/server";
import { database, encryptDeliveryCode, hashDeliveryCode } from "../../../db";
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
  const current = await db.prepare("SELECT status,delivery_code_hash,delivery_code_encrypted FROM orders WHERE id=? AND payment_status='PAID'").bind(orderId).first<{ status: string; delivery_code_hash: string | null; delivery_code_encrypted: string | null }>();
  if (!current || !["READY_FOR_PICKUP", "RIDER_ASSIGNED"].includes(current.status)) return NextResponse.json({ error: "Mark the order ready for pickup before assigning a rider" }, { status: 409 });
  // Move the status before exposing the assignment to the rider. Previously the
  // rider email could be saved even when the transition failed, leaving an order
  // stuck at Ready for pickup without the rider's pickup/OTP controls.
  if (current.status === "READY_FOR_PICKUP") {
    const changed = await transitionOrder(orderId!, current.status, "RIDER_ASSIGNED", viewer.email, "ADMIN");
    if (!changed) return NextResponse.json({ error: "The order changed. Refresh and assign the rider again." }, { status: 409 });
  }
  const assigned = await db.prepare("UPDATE orders SET rider_email=? WHERE id=? AND status='RIDER_ASSIGNED' AND payment_status='PAID'").bind(riderEmail?.toLowerCase(), orderId).run();
  if (!assigned.meta.changes) return NextResponse.json({ error: "Only active orders can be assigned" }, { status: 400 });
  let generatedDeliveryCode: string | undefined;
  if (!current.delivery_code_hash || !current.delivery_code_encrypted) {
    generatedDeliveryCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.prepare("UPDATE orders SET delivery_code_hash=?,delivery_code_encrypted=? WHERE id=?").bind(await hashDeliveryCode(orderId!, generatedDeliveryCode), await encryptDeliveryCode(generatedDeliveryCode), orderId).run();
  }
  const order = await database().prepare("SELECT order_number,customer_email FROM orders WHERE id=?").bind(orderId).first<{ order_number: string; customer_email: string }>();
  if (order) void Promise.all([sendPushToEmail(order.customer_email, { title: "Delivery partner assigned", body: `${order.order_number} now has a delivery partner.`, tag: `${orderId}-rider`, url: "/" }), sendPushToEmail(riderEmail!.toLowerCase(), { title: "Order assigned", body: `${order.order_number} has been assigned to you.`, tag: `${orderId}-assigned`, url: "/" })]);
  return NextResponse.json({ assigned: true, generatedDeliveryCode });
}
