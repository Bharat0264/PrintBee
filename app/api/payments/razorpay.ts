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
  return database().prepare("UPDATE orders SET payment_status='PAID', status=CASE WHEN status='PAYMENT_PENDING' THEN 'CONFIRMED' ELSE status END, razorpay_payment_id=?, payment_verified_at=?, payment_verified_by=?, payment_qr_storage_key=NULL, payment_qr_file_name=NULL, payment_qr_deleted_at=? WHERE razorpay_order_id=? AND payment_status!='PAID' AND status!='CANCELLED'")
    .bind(paymentId, now, actor, now, razorpayOrderId).run();
}
