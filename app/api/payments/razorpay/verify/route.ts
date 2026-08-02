import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";
import { hmacHex, markRazorpayOrderPaid, razorpayConfig, safeEqualHex } from "../../razorpay";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { orderId?: string; razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
  const order = await database().prepare("SELECT razorpay_order_id FROM orders WHERE id=? AND customer_email=? AND status!='CANCELLED'").bind(body.orderId, viewer.email).first<{ razorpay_order_id: string | null }>();
  if (!order?.razorpay_order_id || order.razorpay_order_id !== body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) return NextResponse.json({ error: "Invalid payment response" }, { status: 400 });
  const expected = await hmacHex(`${order.razorpay_order_id}|${body.razorpay_payment_id}`, razorpayConfig().keySecret);
  if (!safeEqualHex(expected, body.razorpay_signature)) return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  await markRazorpayOrderPaid(order.razorpay_order_id, body.razorpay_payment_id, "RAZORPAY_CHECKOUT");
  return NextResponse.json({ paid: true });
}
