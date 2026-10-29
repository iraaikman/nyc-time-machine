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

test("rank views facing the archive pin before closer views looking away", async () => {
  const { rankImages, angleDifference, bearing } = await import("../src/mapillary.js");
  const photo = { lat: 40.7, lon: -74 };
  const images = [
    { id: "away", distance: 10, compass_angle: 0, geometry: { coordinates: [-74, 40.7001] } },
    { id: "toward", distance: 30, compass_angle: 180, geometry: { coordinates: [-74, 40.7003] } },
    { id: "unknown", distance: 5, compass_angle: null, geometry: { coordinates: [-74, 40.70005] } },
  ];
  assert.deepEqual(rankImages(images, photo).map(x => x.id), ["toward", "away", "unknown"]);
  assert.equal(rankImages(images, photo, "nearest")[0].id, "unknown");
  assert.equal(rankImages(images, photo, "0")[0].id, "away");
  assert.equal(angleDifference(359, 1), 2);
  assert.equal(bearing({ lat: 40.701, lon: -74 }, photo), 180);
  assert.equal(images[0].id, "away", "ranking must not mutate the candidate list");
});

test("wider searches include distant cameras, reject out-of-radius and invalid geometry", async () => {
  const original = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(new URL(url));
    return { ok: true, json: async () => ({data: [
      { id: "near", geometry: { coordinates: [-74, 40.7001] }, thumb_2048_url: "near.jpg" },
      { id: "far", geometry: { coordinates: [-74, 40.7012] }, thumb_2048_url: "far.jpg" },
      { id: "outside", geometry: { coordinates: [-74, 40.703] }, thumb_2048_url: "outside.jpg" },
      { id: "invalid", geometry: { coordinates: [-74, null] }, thumb_2048_url: "bad.jpg" },
    ]})};
  };
  try {
    const photo = { lat: 40.7, lon: -74 };
    assert.deepEqual((await nearbyImages(photo, "test", undefined, 50)).images.map(x => x.id), ["near"]);
    assert.deepEqual((await nearbyImages(photo, "test", undefined, 200)).images.map(x => x.id), ["near", "far"]);
    const span = (url) => { const b = url.searchParams.get("bbox").split(",").map(Number); return b[3] - b[1]; };
    assert.ok(Math.abs(span(urls[1]) / span(urls[0]) - 4) < 0.0001);
    await assert.rejects(() => nearbyImages(photo, "test", undefined, 5000), /radius/);
  } finally {
    global.fetch = original;
  }
});
