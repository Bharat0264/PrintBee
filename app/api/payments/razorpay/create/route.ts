import { NextResponse } from "next/server";
import { mongoDb } from "../../../../../lib/mongodb";
import { getViewer } from "../../../../supabase/server";
import { razorpayConfig } from "../../razorpay";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId } = await request.json() as { orderId?: string };
  const db = mongoDb();
  const order = await db.collection<{ id: string; order_number: string; total_paise: number; payment_status: string; razorpay_order_id: string | null }>("orders").findOne({ id: orderId, customer_email: viewer.email, status: { $ne: "CANCELLED" } }, { projection: { _id: 0, id: 1, order_number: 1, total_paise: 1, payment_status: 1, razorpay_order_id: 1 } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "PAID") return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  const { keyId, keySecret } = razorpayConfig();
  const checkoutLabel = order.order_number.startsWith("CHECKOUT-") ? "PrintBee secure checkout" : order.order_number;
  if (order.razorpay_order_id) return NextResponse.json({ keyId, razorpayOrderId: order.razorpay_order_id, amount: order.total_paise, currency: "INR", orderNumber: checkoutLabel });
  const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: order.total_paise, currency: "INR", receipt: order.order_number, notes: { printbee_order_id: order.id, printbee_order_number: order.order_number } }) });
  if (!response.ok) return NextResponse.json({ error: "Payment could not be started" }, { status: 502 });
  const created = await response.json() as { id: string };
  await db.collection("orders").updateOne({ id: order.id, razorpay_order_id: { $in: [null, undefined] } }, { $set: { razorpay_order_id: created.id } });
  return NextResponse.json({ keyId, razorpayOrderId: created.id, amount: order.total_paise, currency: "INR", orderNumber: checkoutLabel });
}
