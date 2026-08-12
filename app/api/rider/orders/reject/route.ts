import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId } = await request.json() as { orderId?: string };
  const result = await database().prepare("UPDATE orders SET rider_email=NULL,status='READY_FOR_PICKUP' WHERE id=? AND rider_email=? AND status='RIDER_ASSIGNED'").bind(orderId, viewer.email).run();
  if (!result.meta.changes) return NextResponse.json({ error: "This assignment can no longer be rejected" }, { status: 409 });
  return NextResponse.json({ rejected: true });
}
