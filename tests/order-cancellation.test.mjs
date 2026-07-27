import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cancelApi = await readFile(new URL("../app/api/admin/orders/cancel/route.ts", import.meta.url), "utf8");
const markPaidApi = await readFile(new URL("../app/api/admin/orders/mark-paid/route.ts", import.meta.url), "utf8");
const paymentReferenceApi = await readFile(new URL("../app/api/orders/payment-reference/route.ts", import.meta.url), "utf8");

test("only admins can cancel active orders while preserving payment records", () => {
  assert.match(cancelApi, /viewer\?\.isAdmin/);
  assert.match(cancelApi, /status='CANCELLED'/);
  assert.match(cancelApi, /cancellation_reason/);
  assert.match(cancelApi, /status NOT IN \('DELIVERED','CANCELLED'\)/);
  assert.doesNotMatch(cancelApi, /payment_status=/);
  assert.match(markPaidApi, /status!='CANCELLED'/);
  assert.match(paymentReferenceApi, /status!='CANCELLED'/);
});
