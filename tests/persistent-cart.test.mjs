import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const cart = await readFile(new URL("../app/api/cart/route.ts", import.meta.url), "utf8");
const orders = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

test("signed-in carts are restored from durable server storage", () => {
  assert.match(app, /fetch\("\/api\/cart", \{ cache: "no-store" \}\)/);
  assert.match(cart, /SELECT c\.item_json FROM cart_items/);
  assert.match(cart, /u\.order_id IS NULL/);
});

test("cart items persist when added and files are deleted when removed", () => {
  assert.match(app, /fetch\("\/api\/cart", \{ method: "POST"/);
  assert.match(app, /method: "DELETE"/);
  assert.match(cart, /fileBucket\(\)\.delete/);
  assert.match(cart, /DELETE FROM uploads/);
});

test("placing an order removes its saved cart records", () => {
  assert.match(orders, /DELETE FROM cart_items WHERE upload_id/);
});
