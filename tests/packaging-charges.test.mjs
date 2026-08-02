import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(new URL("../app/api/packaging-charges/route.ts", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");

test("admin can add, edit, and remove non-overlapping packaging ranges", () => {
  assert.match(apiSource, /viewer\?\.isAdmin/);
  assert.match(apiSource, /min_pages<=\? AND max_pages>=\?/);
  assert.match(apiSource, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(apiSource, /DELETE FROM packaging_charge_rules/);
  assert.match(appSource, /Save edited charge/);
});

test("server calculates and saves packaging fees from uploaded page counts", () => {
  assert.match(orderSource, /upload\.page_count \* Math\.max/);
  assert.match(orderSource, /packagingFeePaise/);
  assert.match(orderSource, /packaging_fee_paise/);
  assert.match(appSource, /Packaging charge \(\{cartPrintedPages\} pages\)/);
});
