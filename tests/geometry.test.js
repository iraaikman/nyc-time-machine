import test from "node:test";
import assert from "node:assert/strict";
import { homography, project, cssMatrix } from "../src/homography.js";
import { validatePair } from "../src/curation.js";
const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const close = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-8));
test("identity, affine and perspective transforms map all four landmarks", () => {
  for (const target of [
    square,
    [
      [0.1, 0.2],
      [0.9, 0.2],
      [0.9, 0.8],
      [0.1, 0.8],
    ],
    [
      [0.2, 0.1],
      [0.8, 0.2],
      [0.95, 0.9],
      [0.05, 0.8],
    ],
  ]) {
    const h = homography(square, target);
    square.forEach((p, i) => close(project(h, p), target[i]));
  }
});
test("CSS perspective matrix maps normalized landmarks to stage pixels", () => {
  const target = [
      [0.2, 0.1],
      [0.8, 0.2],
      [0.95, 0.9],
      [0.05, 0.8],
    ],
    h = homography(square, target),
    w = 900,
    height = 600;
  const m = cssMatrix(h, w, height).slice(9, -1).split(",").map(Number);
  square.forEach(([u, v], i) => {
    let x = u * w,
      y = v * height,
      d = m[3] * x + m[7] * y + m[15];
    close(
      [(m[0] * x + m[4] * y + m[12]) / d, (m[1] * x + m[5] * y + m[13]) / d],
      [target[i][0] * w, target[i][1] * height],
    );
  });
});
test("reject degenerate and malformed point sets", () => {
  for (const pts of [
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [0.2, 0.2],
      [0.5, 0.5],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 1],
      [0, 1],
    ],
  ])
    assert.throws(() => homography(pts, square));
  assert.throws(() =>
    validatePair({
      photoId: "x",
      mapillaryId: "javascript:alert(1)",
      oldPoints: square,
      newPoints: square,
    }),
  );
  assert.throws(() =>
    validatePair({
      photoId: "x",
      mapillaryId: "123",
      oldPoints: [[NaN, 0]],
      newPoints: square,
    }),
  );
});
