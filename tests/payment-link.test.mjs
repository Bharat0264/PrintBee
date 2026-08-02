import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const createSource = await readFile(new URL("../app/api/payments/razorpay/create/route.ts", import.meta.url), "utf8");
const verifySource = await readFile(new URL("../app/api/payments/razorpay/verify/route.ts", import.meta.url), "utf8");
const webhookSource = await readFile(new URL("../app/api/payments/razorpay/webhook/route.ts", import.meta.url), "utf8");

test("checkout creates a server-side Razorpay order", () => {
  assert.match(orderSource, /'PAYMENT_PENDING', 'PENDING'/);
  assert.match(createSource, /api\.razorpay\.com\/v1\/orders/);
  assert.match(createSource, /customer_email=\?/);
  assert.match(appSource, /checkout\.razorpay\.com\/v1\/checkout\.js/);
});

test("payment verification is server-side and signed", () => {
  assert.match(verifySource, /razorpay_order_id !== body\.razorpay_order_id/);
  assert.match(verifySource, /hmacHex/);
  assert.match(verifySource, /safeEqualHex/);
  assert.match(webhookSource, /x-razorpay-signature/);
  assert.match(webhookSource, /payment\.captured/);
  assert.match(webhookSource, /request\.text\(\)/);
});
