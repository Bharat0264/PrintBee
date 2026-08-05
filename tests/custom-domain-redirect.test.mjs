import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
test("old public hostname redirects to the PrintBee custom domain", () => {
  assert.match(page, /printbee-a4-printing\.bharathsaipulipati\.chatgpt\.site/);
  assert.match(page, /redirect\("https:\/\/www\.printbee\.co\.in"\)/);
});
