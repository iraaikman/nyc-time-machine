import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("bundled archive has unique IDs, valid coordinates and upstream archive image links", () => {
  const data = JSON.parse(
    readFileSync(new URL("../public/data/photos.json", import.meta.url)),
  );
  assert.ok(data.length > 49000);
  assert.equal(new Set(data.map((p) => p.id)).size, data.length);
  for (const p of data) {
    assert.ok(Number.isFinite(p.lat) && Math.abs(p.lat) <= 90);
    assert.ok(Number.isFinite(p.lon) && Math.abs(p.lon) <= 180);
    assert.ok(
      ["oldnyc-assets.nypl.org", "images.nypl.org", "www.oldnyc.org"].includes(
        new URL(p.image).hostname,
      ),
    );
    assert.equal(new URL(p.nypl).hostname, "digitalcollections.nypl.org");
    assert.ok(p.year === null || Number.isInteger(p.year));
    assert.equal(typeof p.text, "string");
  }
});
