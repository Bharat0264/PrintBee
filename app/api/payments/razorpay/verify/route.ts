import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ error: "Razorpay is not configured" }, { status: 503 });
  const body = await request.json() as { printbeeOrderId?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  const order = await database().prepare("SELECT id, razorpay_order_id FROM orders WHERE id = ? AND customer_email = ? AND payment_status = 'PENDING'").bind(body.printbeeOrderId, viewer.email).first<{ id: string; razorpay_order_id: string }>();
  if (!order || !body.razorpay_payment_id || !body.razorpay_signature || order.razorpay_order_id !== body.razorpay_order_id) return NextResponse.json({ error: "Invalid payment response" }, { status: 400 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${order.razorpay_order_id}|${body.razorpay_payment_id}`)));
  if (expected !== body.razorpay_signature) return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
  await database().prepare("UPDATE orders SET payment_status = 'PAID', status = 'CONFIRMED', razorpay_payment_id = ? WHERE id = ?").bind(body.razorpay_payment_id, order.id).run();
  return NextResponse.json({ paid: true });
}
