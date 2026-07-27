import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId, reason } = await request.json() as { orderId?: string; reason?: string };
  const cleanReason = reason?.trim();
  if (!orderId || !cleanReason || cleanReason.length > 200) {
    return NextResponse.json({ error: "Order and cancellation reason are required" }, { status: 400 });
  }
  const result = await database().prepare(
    "UPDATE orders SET status='CANCELLED', cancellation_reason=?, cancelled_at=?, cancelled_by=?, rider_email=NULL WHERE id=? AND status NOT IN ('DELIVERED','CANCELLED')"
  ).bind(cleanReason, new Date().toISOString(), viewer.email, orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "This order cannot be cancelled" }, { status: 400 });
  return NextResponse.json({ cancelled: true });
}
