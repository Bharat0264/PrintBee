import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("renders the PrintBee application shell", () => {
  assert.match(layoutSource, /PrintBee/);
  assert.match(appSource, /Upload\. Print\. Delivered\./);
  assert.match(appSource, /Allow order notifications\?/);
});

test("shows customer and rider payment scanners through the protected endpoint", () => {
  const matches = appSource.match(/payment-qr/g) ?? [];
  assert.ok(matches.length >= 4);
  assert.match(appSource, /customer-payment-qr/);
  assert.match(appSource, /Boolean\(order.has_payment_qr\)/);
  assert.match(appSource, /order.payment_status === "PAID"/);
});
