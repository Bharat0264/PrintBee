import { mongoDb } from "../../../lib/mongodb";
import { sendPushToAdmins, sendPushToEmail } from "../push/send";

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
  const db = mongoDb();
  const order = await db.collection<any>("orders").findOne({ razorpay_order_id: razorpayOrderId, payment_status: { $ne: "PAID" }, status: { $ne: "CANCELLED" } });
  if (!order) return null;
  let items: any[] = [];
  try { items = JSON.parse(order.items_json); } catch {}
  let finalOrderNumber = order.order_number;
  const stagedCheckout = String(order.order_number).startsWith("CHECKOUT-");
  if (stagedCheckout) {
    const sequence = await db.collection<{ next_value: number }>("order_sequences").findOneAndUpdate({ id: "orders" }, { $inc: { next_value: 1 } }, { returnDocument: "before" });
    if (!sequence?.next_value) throw new Error("Order numbering is temporarily unavailable");
    finalOrderNumber = `PB${String(sequence.next_value).padStart(3, "0")}`;
  }
  const uploadIds = items.filter((item) => item.kind !== "ADDON").map((item) => item.uploadId).filter(Boolean);
  const paid = await db.collection("orders").updateOne({ id: order.id, payment_status: { $ne: "PAID" } }, { $set: { order_number: finalOrderNumber, payment_status: "PAID", status: order.status === "PAYMENT_PENDING" ? "CONFIRMED" : order.status, razorpay_payment_id: paymentId, payment_verified_at: now, payment_verified_by: actor, payment_qr_storage_key: null, payment_qr_file_name: null, payment_qr_deleted_at: now } });
  if (!paid.modifiedCount) return null;
  await Promise.all([
    ...(stagedCheckout && order.points_redeemed ? [db.collection("customer_profiles").updateOne({ email: order.customer_email, points_balance: { $gte: order.points_redeemed } }, { $inc: { points_balance: -order.points_redeemed } })] : []),
    db.collection("uploads").updateMany({ id: { $in: uploadIds }, customer_email: order.customer_email, order_id: { $in: [null, undefined] } }, { $set: { order_id: order.id } }),
    db.collection("cart_items").deleteMany({ customer_email: order.customer_email, $or: [{ upload_id: { $in: uploadIds } }, { id: { $in: items.filter((item) => item.kind === "ADDON").map((item) => item.id) } }] }),
  ]);
  await Promise.all([
    sendPushToEmail(order.customer_email, { title: "Order placed", body: `${finalOrderNumber} was created after payment verification.`, tag: `${order.id}-paid`, url: "/" }),
    sendPushToAdmins({ title: "New paid order", body: `${finalOrderNumber} is paid and ready for operations.`, tag: `admin-${order.id}`, url: "/" }),
  ]);
  return { orderNumber: finalOrderNumber };
}
