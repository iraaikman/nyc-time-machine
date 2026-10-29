// Street membership comes from archive captions at the same mapped location.
// Keep boroughs and East/West street names distinct; never guess camera positions.
const BOROUGH = /^(Manhattan|Brooklyn|Bronx|Queens|Staten Island):\s*(.+)$/i;
const road = /^(?:[\w.'’ -]+?\s+)?(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Lane|Ln\.?|Place|Pl\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Terrace|Terr\.?|Parkway|Pkwy\.?|Court|Ct\.?|Square)(?:\s+\((East|West|North|South)\))?$/i;
const specialRoad = /^(?:(?:East|West|Old)\s+)?Broadway$|^(?:The )?Bowery$|^Central Park (?:West|South|North)$|^Park Row$/i;
const ordinals = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', eleventh: '11', twelfth: '12' };
const ids = new Intl.Collator('en', { numeric: true });
export const placeKey = p => `${p.lat},${p.lon}`;
export const decadeOf = p => p.year == null ? 'undated' : String(Math.floor(p.year / 10) * 10);
export const byDate = (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || ids.compare(String(a.id), String(b.id));
export function datedPhoto(photo) {
  // A closing, standalone month/day/year is stronger evidence than an archive
  // year extracted from historical references in the body of a transcription.
  const lines = (photo.text || '').split('\n').map(line => line.trim()).filter(Boolean).slice(-4);
  const datelines = lines.map(line => line.match(/^(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+((?:18|19|20)\d{2})[.]?$/i)).filter(Boolean);
  const years = [...new Set(datelines.map(match => Number(match[1])))];
  if (years.length === 1) return { ...photo, year: years[0], archiveYear: photo.year, dateSource: 'transcription' };
  return { ...photo, dateSource: 'archive' };
}
export function normalizeStreet(value) {
  return value.toLowerCase().replace(/[.’']/g, '')
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/g, word => ordinals[word])
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\b(st|ave|rd|ln|pl|blvd|dr|terr|pkwy|ct)\b/g, word => ({st:'street',ave:'avenue',rd:'road',ln:'lane',pl:'place',blvd:'boulevard',dr:'drive',terr:'terrace',pkwy:'parkway',ct:'court'})[word])
    .replace(/\s+/g, ' ').trim();
}
export function captionStreets(title) {
  const match = title.match(BOROUGH);
  if (!match) return [];
  const borough = match[1].replace(/\b\w/g, c => c.toUpperCase());
  return match[2].split(/\s+-\s+/).slice(0, 2).flatMap(part => {
    let label = part.split(/,|\s+(?:btw\.?|between)\s+/i)[0].trim().replace(/\.$/, '');
    if (!road.test(label) && !specialRoad.test(label)) return [];
    label = label.replace(/^(.*?)\s+\((East|West|North|South)\)$/i, '$2 $1');
    label = label.replace(/\bAve\.?$/i, 'Avenue').replace(/\bSt\.?$/i, 'Street');
    return [{ key: `${borough.toLowerCase()}|${normalizeStreet(label)}`, label, borough }];
  });
}
export function createArchive(photos) {
  photos = photos.map(datedPhoto);
  const byId = new Map(), places = new Map(), streets = new Map();
  for (const photo of photos) {
    byId.set(photo.id, photo);
    const key = placeKey(photo);
    if (!places.has(key)) places.set(key, { key, photos: [], streets: new Map() });
    const place = places.get(key);
    place.photos.push(photo);
    for (const street of captionStreets(photo.title)) place.streets.set(street.key, street);
  }
  for (const place of places.values()) {
    place.photos.sort(byDate);
    for (const street of place.streets.values()) {
      if (!streets.has(street.key)) streets.set(street.key, { ...street, photos: [] });
      streets.get(street.key).photos.push(...place.photos);
    }
  }
  for (const street of streets.values()) {
    street.photos.sort(byDate);
    street.search = normalizeStreet(`${street.label} ${street.borough}`);
  }
  return { photos: [...photos].sort(byDate), byId, places, streets };
}
export function decadeCounts(photos) {
  const counts = new Map();
  for (const p of photos) counts.set(decadeOf(p), (counts.get(decadeOf(p)) || 0) + 1);
  return [...counts].sort(([a], [b]) => a === 'undated' ? 1 : b === 'undated' ? -1 : Number(a) - Number(b));
}
export function filterDecade(photos, decade) {
  return decade === 'all' ? photos : photos.filter(p => decadeOf(p) === decade);
}
export function searchStreets(archive, query, limit = 8) {
  const words = normalizeStreet(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return [...archive.streets.values()].filter(s => words.every(w => s.search.includes(w)))
    .sort((a, b) => b.photos.length - a.photos.length || a.label.localeCompare(b.label)).slice(0, limit);
}
