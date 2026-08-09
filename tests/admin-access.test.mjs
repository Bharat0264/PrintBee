import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authSource = await readFile(new URL("../app/supabase/server.ts", import.meta.url), "utf8");

test("configured admin accounts receive administrator access", () => {
  assert.match(authSource, /bharathsaipulipati@gmail\.com/);
  assert.match(authSource, /raniramyasana@gmail\.com/);
  assert.match(authSource, /ADMIN_EMAILS\.has\(email\)/);
});
