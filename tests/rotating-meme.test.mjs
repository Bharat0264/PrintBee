import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const app = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
test("home payment copy uses a rotating Gen-Z meme", () => {
  assert.match(app, /Fed up begging for cash and long queues in DTPs and Xerox centers\?/);
  assert.match(app, /Scan and relax — we deliver your documents safely\./);
  assert.match(app, /crypto\.getRandomValues/);
  assert.match(app, /GEN_Z_MEMES/);
});
