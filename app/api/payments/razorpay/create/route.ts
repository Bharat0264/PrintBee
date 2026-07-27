import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay test keys are not configured yet" }, { status: 503 });
  const { orderId } = await request.json() as { orderId?: string };
  const order = await database().prepare("SELECT id, order_number, total_paise FROM orders WHERE id = ? AND customer_email = ? AND payment_status = 'PENDING'").bind(orderId, viewer.email).first<{ id: string; order_number: string; total_paise: number }>();
  if (!order) return NextResponse.json({ error: "Pending order not found" }, { status: 404 });
  const authorization = btoa(`${keyId}:${keySecret}`);
  const result = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: order.total_paise, currency: "INR", receipt: order.order_number }),
  });
  const razorpayOrder = await result.json() as { id?: string; error?: { description?: string } };
  if (!result.ok || !razorpayOrder.id) return NextResponse.json({ error: razorpayOrder.error?.description ?? "Razorpay order creation failed" }, { status: 502 });
  await database().prepare("UPDATE orders SET razorpay_order_id = ? WHERE id = ?").bind(razorpayOrder.id, order.id).run();
  return NextResponse.json({ keyId, razorpayOrderId: razorpayOrder.id, amount: order.total_paise, currency: "INR", printbeeOrderId: order.id });
}
