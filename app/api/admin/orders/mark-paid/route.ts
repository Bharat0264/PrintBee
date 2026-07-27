import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId } = await request.json() as { orderId?: string };
  const result = await database().prepare("UPDATE orders SET payment_status='PAID', status='CONFIRMED' WHERE id=? AND payment_status='PENDING' AND payment_reference IS NOT NULL").bind(orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Customer payment reference is required" }, { status: 400 });
  return NextResponse.json({ paid: true });
}
