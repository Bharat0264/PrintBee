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
  const order = await db.collection<{ order_number: string; payment_qr_storage_key: string | null }>("orders").findOne({ id: orderId }, { projection: { _id: 0, order_number: 1, payment_qr_storage_key: 1 } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const uploads = await db.collection<{ storage_key: string }>("uploads").find({ order_id: orderId, deleted_at: { $in: [null, undefined] } }, { projection: { _id: 0, storage_key: 1 } }).toArray();
  const keys = uploads.map((file) => file.storage_key).filter(Boolean);
  if (order.payment_qr_storage_key) keys.push(order.payment_qr_storage_key);
  await Promise.all(keys.map((key) => r2.delete(key)));
  await Promise.all([db.collection("uploads").deleteMany({ order_id: orderId }), db.collection("orders").deleteOne({ id: orderId })]);
  return NextResponse.json({ deleted: true, orderNumber: order.order_number, deletedFiles: keys.length });
}
