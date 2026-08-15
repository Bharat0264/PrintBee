import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { razorpayConfig } from "../../razorpay";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId } = await request.json() as { orderId?: string };
  const db = database();
  const order = await db.prepare("SELECT id, order_number, total_paise, payment_status, razorpay_order_id FROM orders WHERE id=? AND customer_email=? AND status!='CANCELLED'").bind(orderId, viewer.email).first<{ id: string; order_number: string; total_paise: number; payment_status: string; razorpay_order_id: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "PAID") return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  const { keyId, keySecret } = razorpayConfig();
  const checkoutLabel = order.order_number.startsWith("CHECKOUT-") ? "PrintBee secure checkout" : order.order_number;
  if (order.razorpay_order_id) return NextResponse.json({ keyId, razorpayOrderId: order.razorpay_order_id, amount: order.total_paise, currency: "INR", orderNumber: checkoutLabel });
  const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: order.total_paise, currency: "INR", receipt: order.order_number, notes: { printbee_order_id: order.id, printbee_order_number: order.order_number } }) });
  if (!response.ok) return NextResponse.json({ error: "Payment could not be started" }, { status: 502 });
  const created = await response.json() as { id: string };
  await db.prepare("UPDATE orders SET razorpay_order_id=? WHERE id=? AND razorpay_order_id IS NULL").bind(created.id, order.id).run();
  return NextResponse.json({ keyId, razorpayOrderId: created.id, amount: order.total_paise, currency: "INR", orderNumber: checkoutLabel });
}
