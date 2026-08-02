import { NextResponse } from "next/server";
import { hmacHex, markRazorpayOrderPaid, safeEqualHex } from "../../razorpay";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!secret) return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  const rawBody = await request.text();
  if (!safeEqualHex(await hmacHex(rawBody, secret), signature)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
  const payment = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment?.status === "captured" && payment.id && payment.order_id) await markRazorpayOrderPaid(payment.order_id, payment.id, "RAZORPAY_WEBHOOK");
  return NextResponse.json({ received: true });
}
