import { NextResponse } from "next/server";
import { database, fileBucket } from "../../../db";
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
  const order = await database().prepare("SELECT customer_email, rider_email, status, payment_qr_storage_key, payment_qr_file_name, payment_qr_deleted_at FROM orders WHERE id=?").bind(orderId).first<OrderQr>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!viewer.isAdmin && viewer.email !== order.customer_email && viewer.email !== order.rider_email) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (order.status === "DELIVERED" || order.payment_qr_deleted_at || !order.payment_qr_storage_key) return NextResponse.json({ error: "Payment QR is unavailable" }, { status: 410 });
  const object = await fileBucket().get(order.payment_qr_storage_key);
  if (!object) return NextResponse.json({ error: "Payment QR is unavailable" }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/png", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(order.payment_qr_file_name || "payment-qr.png")}`, "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { orderId } = await context.params;
  const order = await database().prepare("SELECT status, payment_qr_storage_key FROM orders WHERE id=?").bind(orderId).first<{ status: string; payment_qr_storage_key: string | null }>();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["DELIVERED", "CANCELLED"].includes(order.status)) return NextResponse.json({ error: "A QR cannot be added to a completed order" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload a PNG, JPG or WEBP scanner up to 5 MB" }, { status: 400 });
  if (order.payment_qr_storage_key) await fileBucket().delete(order.payment_qr_storage_key);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `payment-qr/${orderId}/${crypto.randomUUID()}-${safeName}`;
  await fileBucket().put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
  await database().prepare("UPDATE orders SET payment_qr_storage_key=?, payment_qr_file_name=?, payment_qr_deleted_at=NULL WHERE id=?").bind(storageKey, file.name, orderId).run();
  return NextResponse.json({ uploaded: true });
}
