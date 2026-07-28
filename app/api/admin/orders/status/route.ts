import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

const allowed = new Set(["CONFIRMED", "PRINTING", "READY_FOR_PICKUP", "RIDER_ASSIGNED"]);

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId, status } = await request.json() as { orderId?: string; status?: string };
  if (!status || !allowed.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  await database().prepare("UPDATE orders SET status=? WHERE id=? AND payment_status!='REJECTED' AND status NOT IN ('DELIVERED','CANCELLED')").bind(status, orderId).run();
  return NextResponse.json({ updated: true });
}
