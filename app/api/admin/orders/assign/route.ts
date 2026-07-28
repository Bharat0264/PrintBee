import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId, riderEmail } = await request.json() as { orderId?: string; riderEmail?: string };
  const rider = await database().prepare("SELECT email FROM app_users WHERE email=? AND role='AGENT' AND approval_status='APPROVED'").bind(riderEmail?.toLowerCase()).first();
  if (!rider) return NextResponse.json({ error: "Select an active rider" }, { status: 400 });
  const result = await database().prepare("UPDATE orders SET rider_email=?, status='RIDER_ASSIGNED' WHERE id=? AND payment_status NOT IN ('REJECTED') AND status IN ('READY_FOR_PICKUP','CONFIRMED','PRINTING','RIDER_ASSIGNED')").bind(riderEmail?.toLowerCase(), orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Only active orders can be assigned" }, { status: 400 });
  return NextResponse.json({ assigned: true });
}
