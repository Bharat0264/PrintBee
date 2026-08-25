import { NextResponse } from "next/server";
import { mongoDb } from "../../../../../lib/mongodb";
import { r2 } from "../../../../../lib/r2";
import { getViewer } from "../../../../supabase/server";

type OrderQr = {
  customer_email: string;
  rider_email: string | null;
  status: string;
  payment_qr_storage_key: string | null;
  payment_qr_file_name: string | null;
  payment_qr_deleted_at: string | null;
};

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { orderId } = await context.params;
  const order = await mongoDb().collection<OrderQr>("orders").findOne({ id: orderId }, { projection: { _id: 0, customer_email: 1, rider_email: 1, status: 1, payment_qr_storage_key: 1, payment_qr_file_name: 1, payment_qr_deleted_at: 1 } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!viewer.isAdmin && viewer.email !== order.customer_email && viewer.email !== order.rider_email) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (order.status === "DELIVERED" || order.payment_qr_deleted_at || !order.payment_qr_storage_key) return NextResponse.json({ error: "Payment QR is unavailable" }, { status: 410 });
  const object = await r2.get(order.payment_qr_storage_key);
  if (!object.Body) return NextResponse.json({ error: "Payment QR is unavailable" }, { status: 404 });
  return new Response(object.Body.transformToWebStream(), { headers: { "Content-Type": object.ContentType || "image/png", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(order.payment_qr_file_name || "payment-qr.png")}`, "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId } = await context.params;
  const order = await mongoDb().collection<{ status: string; payment_qr_storage_key: string | null }>("orders").findOne({ id: orderId }, { projection: { _id: 0, status: 1, payment_qr_storage_key: 1 } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["DELIVERED", "CANCELLED"].includes(order.status)) return NextResponse.json({ error: "A QR cannot be added to a completed order" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload a PNG, JPG or WEBP scanner up to 5 MB" }, { status: 400 });
  if (order.payment_qr_storage_key) await r2.delete(order.payment_qr_storage_key);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `payment-qr/${orderId}/${crypto.randomUUID()}-${safeName}`;
  await r2.put(storageKey, file, file.type);
  await mongoDb().collection("orders").updateOne({ id: orderId }, { $set: { payment_qr_storage_key: storageKey, payment_qr_file_name: file.name, payment_qr_deleted_at: null } });
  return NextResponse.json({ uploaded: true });
}
