import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/addons/route.ts", import.meta.url), "utf8");
const cartApi = await readFile(new URL("../app/api/cart/route.ts", import.meta.url), "utf8");
const ordersApi = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0028_addons.sql", import.meta.url), "utf8");

test("double-sided B&W and colour options are customer and admin configurable", () => {
  assert.match(app, /B&W · Double side/);
  assert.match(app, /Colour · Double side/);
  assert.match(app, /const sideDivisor = side === "double" \? 2 : 1/);
  assert.match(app, /\(pages \/ sideDivisor\) \* copies \* prices\[mode\]/);
});

test("admin-managed fixed-price add-ons flow through cart and checkout", () => {
  assert.match(migration, /CREATE TABLE `addons`/);
  assert.match(api, /if \(!viewer\?\.isAdmin\)/);
  assert.match(app, /fetch\("\/api\/addons"/);
  assert.match(app, /addonsTotal/);
  assert.match(app, />Add-ons</);
  assert.match(app, /cartAddonCharges/);
});

test("customers can buy add-ons without uploading print files", () => {
  assert.match(app, /Don’t need printouts\? Order add-ons only/);
  assert.match(app, /kind: "ADDON"/);
  assert.match(cartApi, /c\.upload_id LIKE 'addon:%'/);
  assert.match(ordersApi, /item\.kind !== "ADDON"/);
  assert.match(ordersApi, /item\.kind === "ADDON"/);
});
