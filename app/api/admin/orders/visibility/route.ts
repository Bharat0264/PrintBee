import { NextResponse } from "next/server";
import { database } from "../../../db";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId, hidden } = await request.json() as { orderId?: string; hidden?: boolean };
  if (!orderId || typeof hidden !== "boolean") return NextResponse.json({ error: "Order and visibility are required" }, { status: 400 });
  const result = hidden
    ? await database().prepare("UPDATE orders SET hidden_at=?, hidden_by=? WHERE id=? AND hidden_at IS NULL").bind(new Date().toISOString(), viewer.email, orderId).run()
    : await database().prepare("UPDATE orders SET hidden_at=NULL, hidden_by=NULL WHERE id=? AND hidden_at IS NOT NULL").bind(orderId).run();
  if (!result.meta.changes) return NextResponse.json({ error: "Order visibility is already up to date" }, { status: 400 });
  return NextResponse.json({ updated: true, hidden });
}
