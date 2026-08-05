import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../app/api/print-prices/route.ts", import.meta.url), "utf8");

test("A4 prices are shared through the database instead of browser storage", () => {
  assert.doesNotMatch(appSource, /printbee-a4-prices/);
  assert.match(appSource, /fetch\("\/api\/print-prices", \{ cache: "no-store" \}\)/);
  assert.match(apiSource, /viewer\?\.isAdmin/);
  assert.match(apiSource, /INSERT INTO print_prices/);
  assert.match(apiSource, /Cache-Control.*no-store/);
});
