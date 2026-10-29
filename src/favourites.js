export const KEY = 'nyc-time-machine:favourites:v2';
const LEGACY = 'nyc-time-machine:alignments:v1';
export function validateFavourites(data, byId) {
  const ids = data?.version === 2 && data?.type === 'historic-photos' ? data.photoIds
    : data?.version === 1 && Array.isArray(data.pairs) ? data.pairs.map(p => p?.photoId) : null;
  if (!Array.isArray(ids) || ids.length > 5000 || ids.some(id => typeof id !== 'string' || !byId.has(id))) {
    throw Error('Choose an archive favourites backup containing up to 5,000 known photo IDs. Previous alignment backups are also supported.');
  }
  return [...new Set(ids)];
}
export function loadFavourites(storage, byId) {
  try {
    const stored = storage.getItem(KEY);
    if (stored !== null) return { ids: validateFavourites(JSON.parse(stored), byId), message: '' };
    const legacy = JSON.parse(storage.getItem(LEGACY) || '[]');
    if (!Array.isArray(legacy)) throw Error();
    const ids = [...new Set(legacy.map(p => p?.photoId).filter(id => byId.has(id)))];
    return { ids, message: ids.length ? 'Your previously saved historic photos are here in Favourites.' : '' };
  } catch {
    return { ids: [], message: 'Saved photos could not be read. You can import a favourites backup.' };
  }
}
export const serialiseFavourites = ids => JSON.stringify({ version: 2, type: 'historic-photos', photoIds: [...ids] }, null, 2);
