import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardApi = await readFile(new URL("../app/api/admin/dashboard/route.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");

test("admin receives paid and unpaid order contact and document details", () => {
  assert.match(dashboardApi, /customer_email, customer_name, mobile_number/);
  assert.match(dashboardApi, /payment_status='PENDING'/);
  assert.match(dashboardApi, /JSON\.parse\(order\.items_json\)/);
  assert.match(appSource, /order\.mobile_number/);
  assert.match(appSource, /order\.items\?\.length/);
  assert.match(appSource, /Download \{file\.original_name\}/);
});
