import { NextResponse } from "next/server";
import { mongoDb } from "../../../../../lib/mongodb";
import { r2 } from "../../../../../lib/r2";
import { getViewer } from "../../../../supabase/server";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin || !["OWNER", "OPERATIONS"].includes(viewer.adminRole || "")) return NextResponse.json({ error: "Operations access required" }, { status: 403 });
  const { orderId } = await request.json() as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "Order is required" }, { status: 400 });

  const db = mongoDb();
  const order = await db.collection<{ status: string; delivered_at: string | null; cancelled_at: string | null }>("orders").findOne({ id: orderId }, { projection: { _id: 0, status: 1, delivered_at: 1, cancelled_at: 1 } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const terminal = ["DELIVERED", "CANCELLED"].includes(order.status?.toUpperCase()) || Boolean(order.delivered_at) || Boolean(order.cancelled_at);
  if (!terminal) {
    return NextResponse.json({ error: "Documents can be deleted only after delivery or cancellation" }, { status: 400 });
  }

  const files = await db.collection<{ id: string; storage_key: string }>("uploads").find({ order_id: orderId, deleted_at: { $in: [null, undefined] } }, { projection: { _id: 0, id: 1, storage_key: 1 } }).toArray();
  if (!files.length) return NextResponse.json({ error: "Documents were already deleted or none were stored" }, { status: 400 });

  await Promise.all(files.map((file) => r2.delete(file.storage_key)));
  const deletedAt = new Date().toISOString();
  await db.collection("uploads").updateMany({ id: { $in: files.map((file) => file.id) } }, { $set: { deleted_at: deletedAt } });
  return NextResponse.json({ deleted: files.length, deletedAt });
}
