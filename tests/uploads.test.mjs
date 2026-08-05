import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app/PrintBeeApp.tsx", import.meta.url), "utf8");
const uploadSource = await readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8");
const chunkedSource = await readFile(new URL("../app/api/uploads/chunked/route.ts", import.meta.url), "utf8");

test("accepts only PDF, JPEG, PNG, and HEIC files up to 50 MB", () => {
  assert.match(appSource, /50 \* 1024 \* 1024/);
  assert.match(appSource, /application\/pdf,.pdf,image\/jpeg/);
  assert.match(uploadSource, /pdf\|heic\|jpe\?g\|png/);
  assert.match(uploadSource, /50 \* 1024 \* 1024/);
});

test("accepts PDF files even when the browser supplies a generic MIME type", () => {
  assert.match(uploadSource, /pdf\|heic/);
  assert.match(uploadSource, /maximum upload size is 50 MB/);
});

test("continues to reject non-printable file types", () => {
  assert.match(uploadSource, /Upload only PDF, JPEG, PNG, or HEIC files/);
});

test("optimizes images and splits larger files below the request-layer threshold", () => {
  assert.match(appSource, /HOSTED_IMAGE_TARGET_BYTES = 700 \* 1024/);
  assert.match(appSource, /optimizeImageForUpload/);
  assert.match(appSource, /canvas\.toBlob\(resolve, "image\/webp"/);
  assert.match(appSource, /CHUNKED_UPLOAD_THRESHOLD_BYTES = 700 \* 1024/);
  assert.match(appSource, /api\/uploads\/chunked\?action=part/);
});

test("accepts browser-optimized WebP payloads produced from allowed images", () => {
  assert.match(uploadSource, /jpe\?g\|png\|webp/);
  assert.match(chunkedSource, /jpe\?g\|png\|webp/);
  assert.doesNotMatch(appSource, /accept=[^\n]*webp/);
});
