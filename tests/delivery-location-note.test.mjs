import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");

test("shows the exact delivery-location guidance on the start page and at checkout", () => {
  const note = "Select the nearest delivery location and share your exact delivery location after a delivery partner is assigned.";
  assert.equal(appSource.split(note).length - 1, 2);
  assert.equal(appSource.split(`<strong>${note}</strong>`).length - 1, 2);
});
