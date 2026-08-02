import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../app/api/print-services/route.ts", import.meta.url), "utf8");
const orderSource = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

test("customers choose visible service options instead of a dropdown", () => {
  assert.match(appSource, /className="service-option-grid"/);
  assert.match(appSource, /role="radiogroup"/);
  assert.doesNotMatch(appSource, /<select value=\{serviceId\}/);
});

test("admin can edit service details and packaging behavior", () => {
  assert.match(apiSource, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(apiSource, /counts_for_packaging/);
  assert.match(appSource, /Edit service option/);
  assert.match(appSource, /Count this service's pages for packaging charges/);
});

test("server excludes non-printing service pages from packaging", () => {
  assert.match(orderSource, /SELECT counts_for_packaging FROM print_services/);
  assert.match(orderSource, /if \(service\.counts_for_packaging\) totalPrintedPages/);
});
