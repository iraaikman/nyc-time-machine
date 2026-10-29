import test from "node:test";
import assert from "node:assert/strict";
import { nearbyImages, freshImage, distance } from "../src/mapillary.js";
test("enforce 50 metre radius, select nearest, order headings and refresh URLs", async () => {
  const p = { lat: 40.7, lon: -74 },
    calls = [];
  const records = [
    ["1", 40.7001, 180],
    ["2", 40.7002, 30],
    ["3", 40.701, 0],
  ].map(([id, lat, compass_angle]) => ({
    id,
    geometry: { coordinates: [-74, lat] },
    thumb_2048_url: `https://example.org/${id}.jpg`,
    compass_angle,
  }));
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push([new URL(url), options]);
    return {
      ok: true,
      json: async () =>
        url.pathname.endsWith("/images")
          ? { data: records }
          : { ...records[0], thumb_2048_url: "https://example.org/fresh.jpg" },
    };
  };
  try {
    const { images, nearest } = await nearbyImages(p, "public-test-token");
    assert.deepEqual(
      images.map((p) => p.id),
      ["2", "1"],
    );
    assert.equal(nearest.id, "1");
    assert.ok(distance(p, { lat: 40.701, lon: -74 }) > 50);
    assert.equal(calls[0][0].searchParams.get("bbox").split(",").length, 4);
    assert.equal(
      (await freshImage("1", "public-test-token")).thumb_2048_url,
      "https://example.org/fresh.jpg",
    );
    assert.equal(calls[1][1].cache, "no-store");
  } finally {
    global.fetch = original;
  }
});
test("authentication failures produce an actionable message", async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(
      () => nearbyImages({ lat: 40.7, lon: -74 }, "bad"),
      /client token/,
    );
  } finally {
    global.fetch = original;
  }
});
