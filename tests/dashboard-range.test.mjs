import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");

test("dashboard summary cards use the selected date range", () => {
  assert.match(appSource, /const dashboardOrdersForRange = .*created_at.*revenueStart/);
  assert.match(appSource, /dashboardSummaryForRange\.total/);
  assert.match(appSource, /dashboardSummaryForRange\.revenuePaise/);
  assert.doesNotMatch(appSource, /dashboard\.summary\?\.total/);
});
