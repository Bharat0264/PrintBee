import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsSource = await readFile(new URL("../app/api/fee-settings/route.ts", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");

test("admin controls one optional packaging fee", () => {
  assert.match(settingsSource, /packaging_enabled/);
  assert.match(settingsSource, /packaging_fee_paise/);
  assert.match(appSource, /Optional packaging/);
  assert.match(appSource, /Save packaging price/);
});

test("server applies packaging only when the customer opts in and admin enabled it", () => {
  assert.match(orderSource, /body\.needsPackaging && feeSettings\?\.packaging_enabled/);
  assert.match(orderSource, /packagingFeePaise/);
  assert.match(orderSource, /packaging_fee_paise/);
  assert.match(appSource, /Need packaging for this order\?/);
  assert.match(appSource, /Packaging fee/);
  assert.doesNotMatch(appSource, /Handling charge/);
});
