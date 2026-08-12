import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const deliveryApi = await readFile(new URL("../app/api/orders/verify-delivery/route.ts", import.meta.url), "utf8");
const qrApi = await readFile(new URL("../app/api/orders/[orderId]/payment-qr/route.ts", import.meta.url), "utf8");
const paymentReviewApi = await readFile(new URL("../app/api/admin/orders/payment-review/route.ts", import.meta.url), "utf8");
const ordersApi = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

test("only the customer, assigned rider, and admin can view an active payment QR", () => {
  assert.match(qrApi, /viewer\.email !== order\.customer_email/);
  assert.match(qrApi, /viewer\.email !== order\.rider_email/);
  assert.match(qrApi, /payment_qr_deleted_at/);
  assert.match(qrApi, /Cache-Control.*private, no-store/);
});

test("marking payment paid removes the QR from storage and the order", () => {
  assert.match(paymentReviewApi, /fileBucket\(\)\.delete/);
  assert.match(paymentReviewApi, /payment_qr_storage_key=NULL/);
  assert.match(paymentReviewApi, /payment_qr_file_name=NULL/);
});

test("OTP delivery permanently removes documents but retains the order", () => {
  assert.match(deliveryApi, /SELECT storage_key FROM uploads WHERE order_id=/);
  assert.match(deliveryApi, /fileBucket\(\)\.delete/);
  assert.match(deliveryApi, /DELETE FROM uploads WHERE order_id=/);
  assert.doesNotMatch(deliveryApi, /DELETE FROM orders/);
});

test("delivered orders reward buyer spend at ₹10 and referrer spend at ₹15", () => {
  assert.match(deliveryApi, /Math\.floor\(order\.total_paise \/ 1000\)/);
  assert.match(deliveryApi, /Math\.floor\(order\.total_paise \/ 1500\)/);
  assert.match(deliveryApi, /REFERRAL_SPEND_REWARD/);
  assert.doesNotMatch(ordersApi, /points_balance=points_balance\+10/);
  assert.doesNotMatch(ordersApi, /10 referral points/);
});
