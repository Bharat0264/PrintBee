import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/order-availability/route.ts", import.meta.url), "utf8");
const orders = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

test("admin controls whether customers can place orders", () => {
  assert.match(api, /viewer\?\.isAdmin/);
  assert.match(api, /accepting_orders/);
  assert.match(app, /role="switch"/);
  assert.match(app, /Service will be live soon/);
  assert.match(app, /launch-countdown/);
  assert.match(app, /Launch date and time \(IST\)/);
  assert.match(api, /launch_at/);
  assert.match(orders, /availability\?\.accepting_orders === 0/);
});
