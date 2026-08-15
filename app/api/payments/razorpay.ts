import { database } from "../db";

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  return { keyId, keySecret };
}

export async function hmacHex(message: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length || !/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  let different = 0;
  for (let index = 0; index < a.length; index++) different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return different === 0;
}

export async function markRazorpayOrderPaid(razorpayOrderId: string, paymentId: string, actor: string) {
  const now = new Date().toISOString();
  const db = database();
  const order = await db.prepare("SELECT id,order_number,customer_email,items_json,points_redeemed FROM orders WHERE razorpay_order_id=? AND payment_status!='PAID' AND status!='CANCELLED'").bind(razorpayOrderId).first<any>();
  if (!order) return null;
  let items: any[] = [];
  try { items = JSON.parse(order.items_json); } catch {}
  let finalOrderNumber = order.order_number;
  const stagedCheckout = String(order.order_number).startsWith("CHECKOUT-");
  if (stagedCheckout) {
    const sequence = await db.prepare("UPDATE order_sequences SET next_value=next_value+1 WHERE id='orders' RETURNING next_value-1 number").first<{ number: number }>();
    if (!sequence) throw new Error("Order numbering is temporarily unavailable");
    finalOrderNumber = `PB${String(sequence.number).padStart(3, "0")}`;
  }
  const uploadIds = items.filter((item) => item.kind !== "ADDON").map((item) => item.uploadId).filter(Boolean);
  await db.batch([
    db.prepare("UPDATE orders SET order_number=?,payment_status='PAID',status=CASE WHEN status='PAYMENT_PENDING' THEN 'CONFIRMED' ELSE status END,razorpay_payment_id=?,payment_verified_at=?,payment_verified_by=?,payment_qr_storage_key=NULL,payment_qr_file_name=NULL,payment_qr_deleted_at=? WHERE id=? AND payment_status!='PAID'").bind(finalOrderNumber, paymentId, now, actor, now, order.id),
    ...(stagedCheckout && order.points_redeemed ? [db.prepare("UPDATE customer_profiles SET points_balance=points_balance-? WHERE email=? AND points_balance>=?").bind(order.points_redeemed, order.customer_email, order.points_redeemed)] : []),
    ...uploadIds.map((uploadId) => db.prepare("UPDATE uploads SET order_id=? WHERE id=? AND customer_email=? AND order_id IS NULL").bind(order.id, uploadId, order.customer_email)),
    ...uploadIds.map((uploadId) => db.prepare("DELETE FROM cart_items WHERE upload_id=? AND customer_email=?").bind(uploadId, order.customer_email)),
    ...items.filter((item) => item.kind === "ADDON").map((item) => db.prepare("DELETE FROM cart_items WHERE id=? AND customer_email=?").bind(item.id, order.customer_email)),
  ]);
  return { orderNumber: finalOrderNumber };
}
