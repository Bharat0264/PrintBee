import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../app/api/print-services/route.ts", import.meta.url), "utf8");

test("customers choose visible service options instead of a dropdown", () => {
  assert.match(appSource, /className="service-option-grid"/);
  assert.match(appSource, /role="radiogroup"/);
  assert.match(appSource, /\{printServices\.map\(\(service\) =>/);
  assert.doesNotMatch(appSource, /printServices\.filter\(\(service\) => MIXED_PRINT_SERVICES\.has\(service\.id\)\)/);
  assert.doesNotMatch(appSource, /<select value=\{serviceId\}/);
});

test("admin can edit service details", () => {
  assert.match(apiSource, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(apiSource, /counts_for_packaging/);
  assert.match(appSource, /Edit service option/);
  assert.doesNotMatch(appSource, /Count this service's pages for handling charges/);
});

test("existing non-printing services default to excluded packaging pages", async () => {
  const migration = await readFile(new URL("../drizzle/0015_service_packaging_flag.sql", import.meta.url), "utf8");
  assert.match(migration, /WHERE `id` <> 'document-printing'/);
});
