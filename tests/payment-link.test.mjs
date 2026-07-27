import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

test("checkout uses only the PrintBee Razorpay payment link", async () => {
  assert.match(appSource, /https:\/\/razorpay\.me\/@PrintBee/);
  assert.match(appSource, /Open Razorpay payment link/);
  assert.match(appSource, /Submit payment reference/);
  assert.doesNotMatch(appSource, /checkout\.razorpay\.com|startRazorpayPayment|paymentConfigured/);
  assert.doesNotMatch(orderSource, /RAZORPAY_KEY_ID|RAZORPAY_KEY_SECRET|paymentConfigured/);

  await assert.rejects(access(new URL("../app/api/payments/razorpay/create/route.ts", import.meta.url)));
  await assert.rejects(access(new URL("../app/api/payments/razorpay/verify/route.ts", import.meta.url)));
});
