export const distance = (a, b) => {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const fields = "id,thumb_2048_url,captured_at,compass_angle,geometry";
export async function mapillaryRequest(path, params, token, signal) {
  const url = new URL(`https://graph.mapillary.com/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    let msg =
      res.status === 401 || res.status === 403
        ? "Mapillary rejected the client token. Check its permissions in Settings."
        : res.status === 429
          ? "Mapillary is busy. Please wait a moment and try again."
          : `Mapillary request failed (${res.status}). Please try again.`;
    throw Error(msg);
  }
  return res.json();
}
export async function nearbyImages(photo, token, signal) {
  // Graph v4 spatial search uses a bounding box. Filter its corners to a true 50 m circle.
  const dy = 50 / 111320,
    dx = dy / Math.cos((photo.lat * Math.PI) / 180);
  const data = await mapillaryRequest(
    "images",
    {
      bbox: [
        photo.lon - dx,
        photo.lat - dy,
        photo.lon + dx,
        photo.lat + dy,
      ].join(","),
      fields,
      limit: 500,
    },
    token,
    signal,
  );
  const images = (data.data || [])
    .filter((x) => x.geometry?.coordinates && x.thumb_2048_url)
    .map((x) => ({
      ...x,
      distance: distance(photo, {
        lat: x.geometry.coordinates[1],
        lon: x.geometry.coordinates[0],
      }),
    }))
    .filter((x) => x.distance <= 50);
  const nearest = [...images].sort((a, b) => a.distance - b.distance)[0];
  images.sort(
    (a, b) =>
      (a.compass_angle ?? 360) - (b.compass_angle ?? 360) ||
      a.distance - b.distance,
  );
  return { images, nearest };
}
export const freshImage = (id, token, signal) =>
  mapillaryRequest(encodeURIComponent(id), { fields }, token, signal);
