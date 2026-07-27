import { NextResponse } from "next/server";
import { database } from "../../db";
import { getViewer } from "../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId, reference } = await request.json() as { orderId?: string; reference?: string };
  const clean = reference?.trim();
  if (!clean || clean.length < 6 || clean.length > 80) return NextResponse.json({ error: "Enter a valid Razorpay payment ID/reference" }, { status: 400 });
  const result = await database().prepare("UPDATE orders SET payment_reference=?, status='PAYMENT_REVIEW' WHERE id=? AND customer_email=? AND payment_status='PENDING' AND status!='CANCELLED'").bind(clean, orderId, viewer.email).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Pending order not found" }, { status: 404 });
  return NextResponse.json({ submitted: true });
}
