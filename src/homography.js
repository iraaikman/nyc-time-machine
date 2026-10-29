// Solve the eight degrees of freedom, using pivoted Gaussian elimination.
export function homography(source, target) {
  if (!validPoints(source) || !validPoints(target))
    throw Error(
      "Use four distinct points around the outside of a façade, in matching order.",
    );
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i],
      [u, v] = target[i];
    rows.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    if (Math.abs(rows[pivot][col]) < 1e-10)
      throw Error(
        "These points cannot define a stable perspective. Spread them across the photograph.",
      );
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const scale = rows[col][col];
    rows[col] = rows[col].map((v) => v / scale);
    for (let r = 0; r < 8; r++)
      if (r !== col) {
        const f = rows[r][col];
        rows[r] = rows[r].map((v, c) => v - f * rows[col][c]);
      }
  }
  const h = rows.map((r) => r[8]);
  h.push(1);
  // Reject a horizon through the source image: it would project pixels to infinity.
  const denominators = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => h[6] * x + h[7] * y + 1);
  if (denominators.some((v) => v < 0.02))
    throw Error(
      "This transform crosses a perspective horizon. Choose a smaller, flatter façade.",
    );
  return h;
}
export function validPoints(p) {
  return (
    Array.isArray(p) &&
    p.length === 4 &&
    p.every(
      (x) =>
        Array.isArray(x) &&
        x.length === 2 &&
        x.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    )
  );
}
export function project(h, [x, y]) {
  const d = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}
export function cssMatrix(h, w, height) {
  return `matrix3d(${[h[0], (h[3] * height) / w, 0, h[6] / w, (h[1] * w) / height, h[4], 0, h[7] / height, 0, 0, 1, 0, h[2] * w, h[5] * height, 0, 1].join(",")})`;
}
