import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("checkout uses admin-provided QR and pay-on-delivery", () => {
  assert.match(orderSource, /'PAY_ON_DELIVERY'/);
  assert.match(appSource, /admin uploads it/);
  assert.match(appSource, /\/api\/orders\/\$\{order\.id\}\/payment-qr/);
  assert.doesNotMatch(appSource, /checkout\.razorpay\.com|razorpay\.me/);
});

test("browser receives hosted Supabase configuration", () => {
  assert.match(pageSource, /supabaseConfig=\{supabaseConfig\}/);
  assert.match(appSource, /supabaseConfig\.url/);
  assert.doesNotMatch(appSource, /process\.env\.NEXT_PUBLIC_SUPABASE/);
});
