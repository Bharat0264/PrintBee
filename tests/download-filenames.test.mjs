import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const downloadRoute = await readFile(new URL("../app/api/admin/files/[uploadId]/download/route.ts", import.meta.url), "utf8");

test("admin document downloads use order-number filenames", () => {
  assert.match(downloadRoute, /o\.order_number/);
  assert.match(downloadRoute, /orderFiles\.results\.length > 1/);
  assert.match(downloadRoute, /alphabeticSuffix\(fileIndex\)/);
  assert.match(downloadRoute, /fileExtension\(file\.original_name\)/);
  assert.match(downloadRoute, /encodeURIComponent\(downloadName\)/);
});
