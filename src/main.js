import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './style.css';
import { createArchive, placeKey, byDate, decadeCounts, filterDecade, searchStreets } from './archive.js';
import { KEY, loadFavourites, validateFavourites, serialiseFavourites } from './favourites.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString();
const yearLabel = photo => photo.year == null ? 'Undated' : `${photo.dateSource === 'transcription' ? '' : 'c. '}${photo.year}`;
const notice = message => { $('#archive-status').textContent = message; };
const storage = () => { try { return window.localStorage; } catch { return null; } };
let archive, favourites = new Set(), scope = { kind: 'all' }, decade = 'all', items = [], visible = [], selected = 0, gridLimit = 36;
let imageRequest = 0, searchTimer;
const map = L.map('map', { zoomControl: false }).setView([40.725, -73.99], 13);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
}).addTo(map);
const cluster = L.markerClusterGroup({ maxClusterRadius: 38, showCoverageOnHover: false,
  iconCreateFunction: c => L.divIcon({html:`<span>${c.getChildCount()}</span>`,className:'cluster',iconSize:[36,36]}),
}).addTo(map);
const activePin = L.circleMarker([40.725,-73.99], {radius:10, color:'#442b20',weight:2, fillColor:'#b8694e',fillOpacity:0.8,interactive:false});
new ResizeObserver(() => map.invalidateSize({pan:false})).observe($('#map'));

function scopePhotos() {
  if (scope.kind === 'street') return archive.streets.get(scope.key)?.photos || [];
  if (scope.kind === 'place') return archive.places.get(scope.key)?.photos || [];
  if (scope.kind === 'saved') return [...favourites].map(id => archive.byId.get(id)).filter(Boolean).sort(byDate);
  if (scope.kind === 'search') {
    const words = scope.query.toLowerCase().split(/\s+/).filter(Boolean);
    return archive.photos.filter(p => words.every(w => `${p.title} ${p.text}`.toLowerCase().includes(w)));
  }
  return archive.photos;
}
function scopeName() {
  if (scope.kind === 'street') return archive.streets.get(scope.key)?.label || 'A street through time';
  if (scope.kind === 'place') {
    const streets = [...archive.places.get(scope.key).streets.values()];
    return streets.length ? streets.slice(0,2).map(s => s.label).join(' & ') : 'At this corner';
  }
  if (scope.kind === 'saved') return 'Your New York';
  if (scope.kind === 'search') return `“${scope.query}”`;
  return 'All New York';
}
function setScope(next, {photoId, period = 'all', fit = true} = {}) {
  if (!archive) return;
  scope = next;
  decade = period;
  gridLimit = 36;
  items = scopePhotos();
  if (decade !== 'all' && !decadeCounts(items).some(([key]) => key === decade)) decade = 'all';
  renderCollection(photoId, fit);
  $('#search-results').hidden = true;
  $('.archive-pane').scrollTop = 0;
}
function renderCollection(photoId, fit = false) {
  if (decade !== 'all' && !decadeCounts(items).some(([key]) => key === decade)) decade = 'all';
  visible = filterDecade(items, decade);
  selected = Math.max(0, visible.findIndex(p => p.id === photoId));
  $('#scope-title').textContent = scopeName();
  const firstPlace = items[0] && archive.places.get(placeKey(items[0]));
  const borough = scope.kind === 'street' ? archive.streets.get(scope.key).borough
    : scope.kind === 'place' ? [...firstPlace.streets.values()][0]?.borough : '';
  $('#scope-borough').textContent = borough || (scope.kind === 'saved' ? 'YOUR PERSONAL ARCHIVE' : 'THE FIVE BOROUGHS');
  const dates = items.filter(p => p.year != null).map(p => p.year);
  const range = dates.length ? `${Math.min(...dates)}–${Math.max(...dates)}` : 'Dates unknown';
  $('#scope-description').textContent = `${number(items.length)} historic views · ${range}${scope.kind === 'street' ? ' · Along this street' : scope.kind === 'place' ? ' · At this mapped location' : ''}`;
  $('#timeline').innerHTML = `<button data-decade="all" aria-pressed="${decade === 'all'}">All years <span>${number(items.length)}</span></button>` + decadeCounts(items).map(([key,count]) => `<button data-decade="${key}" aria-pressed="${decade === key}">${key === 'undated' ? 'Undated' : key + 's'} <span>${number(count)}</span></button>`).join('');
  $('#photo-content').hidden = !visible.length;
  $('#empty-state').hidden = !!visible.length;
  $('#empty-title').textContent = scope.kind === 'saved' ? 'Keep a little piece of the city.' : 'No photographs found.';
  $('#empty-description').textContent = scope.kind === 'saved' ? 'Save photographs as you explore. They will appear here, arranged by date.' : 'Try another street name, a broader search, or All New York.';
  $('#favourite-tools').hidden = scope.kind !== 'saved';
  $('#export-favourites').disabled = !favourites.size;
  $('#collection-title').textContent = scope.kind === 'street' ? 'Along this street' : scope.kind === 'place' ? 'At this corner' : scope.kind === 'saved' ? 'Your saved photographs' : 'From the archive';
  $('.collection-heading').hidden = !visible.length;
  notice('');
  renderMap(fit);
  renderGrid();
  if (visible.length) selectPhoto(selected, false);
  else {
    $('#scope-links').replaceChildren();
    map.removeLayer(activePin);
    if ($('#photo-viewer').open) $('#photo-viewer').close();
    syncHash();
  }
}
function renderMap(fit) {
  const places = new Map();
  for (const photo of visible) {
    const key = placeKey(photo);
    if (!places.has(key)) places.set(key, []);
    places.get(key).push(photo);
  }
  cluster.clearLayers();
  cluster.addLayers([...places.entries()].map(([key,photos]) => L.marker([photos[0].lat,photos[0].lon], {
    icon:L.divIcon({className:'photo-pin',html:'<span></span>',iconSize:[18,18]}),
    title:`${photos[0].title} · ${photos.length} ${photos.length === 1 ? 'photograph' : 'photographs'}`,
    alt:`Explore ${photos[0].title}`,
  }).on('click', () => {
    setScope({kind:'place',key}, {photoId:photos[0].id,fit:false});
    revealArchive();
  })));
  $('#map-count').textContent = `${number(visible.length)} views · ${number(places.size)} locations`;
  if (fit && places.size) map.fitBounds([...places.values()].map(ps => [ps[0].lat,ps[0].lon]), {padding:[35,35],maxZoom:16,animate:false});
}
function renderGrid() {
  $('#photo-grid').innerHTML = visible.slice(0,gridLimit).map(photo => `<button class="photo-card" data-photo="${esc(photo.id)}" aria-pressed="${photo.id === visible[selected]?.id}" aria-label="View ${esc(photo.title)}, ${yearLabel(photo)}"><div><img loading="lazy" decoding="async" src="${esc(photo.image)}" alt="" /><span>${yearLabel(photo)}</span></div><p>${esc(photo.title)}</p></button>`).join('');
  $('#collection-count').textContent = `${number(Math.min(gridLimit,visible.length))} of ${number(visible.length)}`;
  $('#load-more').hidden = gridLimit >= visible.length;
}
function renderScopeLinks(photo) {
  const place = archive.places.get(placeKey(photo));
  $('#scope-links').innerHTML = (scope.kind === 'place' ? '' : '<button data-corner="true">At this corner</button>') + [...place.streets.values()].filter(s => scope.kind !== 'street' || s.key !== scope.key).map(s => `<button data-street="${esc(s.key)}">Follow ${esc(s.label)} →</button>`).join('');
}
function updateSaveButtons() {
  const saved = favourites.has(visible[selected]?.id);
  for (const id of ['save-photo','viewer-save']) {
    $('#' + id).textContent = saved ? '♥ Saved' : '♡ Save photo';
    $('#' + id).setAttribute('aria-pressed', String(saved));
  }
  $('#fav-count').textContent = favourites.size;
}
function selectPhoto(index, pan = true) {
  if (!visible.length) return;
  selected = Math.max(0, Math.min(visible.length - 1,index));
  const photo = visible[selected], generation = ++imageRequest;
  $('#hero-image').alt = photo.title;
  $('#hero-image').hidden = false;
  $('#image-error').hidden = true;
  $('#expand-photo').disabled = true;
  $('.photo-stage').classList.add('loading');
  $('#hero-image').onload = () => {
    if (generation !== imageRequest) return;
    $('.photo-stage').classList.remove('loading');
    $('.photo-stage').style.setProperty('--photo-ratio', $('#hero-image').naturalWidth / $('#hero-image').naturalHeight);
    $('#expand-photo').disabled = false;
  };
  $('#hero-image').onerror = () => {
    if (generation !== imageRequest) return;
    $('.photo-stage').classList.remove('loading');
    $('#hero-image').hidden = true;
    $('#image-error').hidden = false;
  };
  $('#hero-image').src = photo.image;
  $('#hero-year').textContent = yearLabel(photo);
  $('#hero-year').title = photo.dateSource === 'transcription' ? 'Date from a closing date line in the archive notes.' : 'Approximate archive year; dates may refer to a range.';
  $('#photo-title').textContent = photo.title;
  $('#photo-record').href = $('#error-record').href = photo.nypl;
  $('#photo-transcription').textContent = photo.text || 'No transcription is available for this photograph.';
  $('#photo-notes').open = false;
  $('#photo-position').textContent = `${number(selected + 1)} / ${number(visible.length)} · ${decade === 'all' ? 'In date order' : decade === 'undated' ? 'Date unknown' : decade + 's'}`;
  $('#previous-photo').disabled = $('#viewer-prev').disabled = selected === 0;
  $('#next-photo').disabled = $('#viewer-next').disabled = selected === visible.length - 1;
  $('#photo-grid').querySelectorAll('[data-photo]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.photo === photo.id)));
  activePin.setLatLng([photo.lat,photo.lon]).addTo(map).bringToFront();
  if (pan && !map.getBounds().contains([photo.lat,photo.lon])) map.panTo([photo.lat,photo.lon],{animate:false});
  renderScopeLinks(photo);
  updateSaveButtons();
  if ($('#photo-viewer').open) renderViewer();
  syncHash();
}
function syncHash() {
  const params = new URLSearchParams();
  if (scope.kind === 'street') params.set('street',scope.key);
  if (scope.kind === 'place') params.set('place',scope.key);
  if (scope.kind === 'saved') params.set('collection','favourites');
  if (scope.kind === 'search') params.set('q',scope.query);
  if (decade !== 'all') params.set('decade',decade);
  if (visible[selected]) params.set('photo',visible[selected].id);
  history.replaceState(null,'',`${location.pathname}${location.search}#${params}`);
}
function openHash() {
  if (!archive) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const photo = archive.byId.get(params.get('photo'));
  const options = {photoId:photo?.id,period:params.get('decade') || 'all'};
  if (archive.streets.has(params.get('street'))) setScope({kind:'street',key:params.get('street')},options);
  else if (params.get('collection') === 'favourites') setScope({kind:'saved'},options);
  else if (params.get('q')) setScope({kind:'search',query:params.get('q')},options);
  else if (archive.places.has(params.get('place'))) setScope({kind:'place',key:params.get('place')},options);
  else if (photo) setScope({kind:'place',key:placeKey(photo)},options);
  else {
    const street = archive.streets.get('manhattan|bowery') || [...archive.streets.values()][0];
    setScope(street ? {kind:'street',key:street.key} : {kind:'all'}, {period: street?.photos.some(p => p.year >= 1930 && p.year < 1940) ? '1930' : 'all'});
  }
}
function revealArchive() { if (matchMedia('(max-width: 800px)').matches) $('.archive-pane').scrollIntoView({behavior:'smooth',block:'start'}); }
function revealMap() { $('.map-pane').scrollIntoView({behavior:'smooth',block:'start'}); }
$('#show-map').onclick = revealMap;
$('#locate-photo').onclick = () => {
  const photo = visible[selected];
  if (!photo) return;
  map.setView([photo.lat,photo.lon],17,{animate:false});
  revealMap();
};
$('#timeline').onclick = event => {
  const button = event.target.closest('[data-decade]');
  if (!button) return;
  const id = visible[selected]?.id;
  decade = button.dataset.decade;
  gridLimit = 36;
  renderCollection(id);
  $('#timeline').querySelector('[aria-pressed="true"]').focus({preventScroll:true});
};
$('#scope-links').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  const photo = visible[selected];
  if (button.dataset.street) setScope({kind:'street',key:button.dataset.street},{photoId:photo.id});
  else setScope({kind:'place',key:placeKey(photo)},{photoId:photo.id});
};
$('#photo-grid').onclick = event => {
  const button = event.target.closest('[data-photo]');
  if (!button) return;
  selectPhoto(visible.findIndex(p => p.id === button.dataset.photo));
  $('#photo-content').scrollIntoView({behavior:'smooth',block:'start'});
};
$('#load-more').onclick = () => { gridLimit += 36; renderGrid(); };
$('#previous-photo').onclick = $('#viewer-prev').onclick = () => selectPhoto(selected - 1);
$('#next-photo').onclick = $('#viewer-next').onclick = () => selectPhoto(selected + 1);
$('#all-photos').onclick = () => { setScope({kind:'all'}); $('#search').value = ''; };
$('#favourites-btn').onclick = () => { setScope({kind:'saved'}); revealArchive(); };
$('#about-btn').onclick = () => $('#about').showModal();
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $('#' + button.dataset.close).close(); });
$('#search').oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query = $('#search').value.trim();
    if (!archive || !query) { $('#search-results').hidden = true; return; }
    const matches = searchStreets(archive,query);
    $('#search-results').innerHTML = matches.map(street => `<button data-search-street="${esc(street.key)}"><span><strong>${esc(street.label)}</strong><small>${esc(street.borough)}</small></span><span>${number(street.photos.length)} views →</span></button>`).join('') + `<button data-search-text="true">Search all captions for “${esc(query)}” →</button>`;
    $('#search-results').hidden = false;
  },180);
};
$('#search-results').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.searchStreet) setScope({kind:'street',key:button.dataset.searchStreet});
  else searchCaptions();
  revealArchive();
};
function searchCaptions() {
  const query = $('#search').value.trim();
  if (query) setScope({kind:'search',query});
  else setScope({kind:'all'});
}
$('#search-form').onsubmit = event => {
  event.preventDefault();
  if (!archive) return;
  const matches = searchStreets(archive, $('#search').value.trim());
  if (matches.length === 1) setScope({kind:'street',key:matches[0].key});
  else searchCaptions();
  revealArchive();
};
$('#search').onkeydown = event => { if (event.key === 'Escape') $('#search-results').hidden = true; };
document.addEventListener('click', event => { if (!event.target.closest('.discovery')) $('#search-results').hidden = true; });
$('#starter-streets').onclick = event => {
  const button = event.target.closest('[data-street]');
  if (button) { setScope({kind:'street',key:button.dataset.street}); $('#search').value=''; revealArchive(); }
};

function persistFavourites(ids) {
  const target = storage();
  if (!target) throw Error('Browser storage is unavailable. Enable it to save favourites.');
  if (ids.size > 5000) throw Error('Your collection can contain up to 5,000 photos. Export a backup before making room.');
  target.setItem(KEY,serialiseFavourites(ids));
  favourites = ids;
  updateSaveButtons();
}
function toggleFavourite() {
  const photo = visible[selected];
  if (!photo) return;
  const next = new Set(favourites);
  next.has(photo.id) ? next.delete(photo.id) : next.add(photo.id);
  try {
    persistFavourites(next);
    if (scope.kind === 'saved') { items = scopePhotos(); renderCollection(photo.id); }
    notice(next.has(photo.id) ? 'Photo saved to your favourites.' : 'Photo removed from your favourites.');
  } catch (error) {
    const message = error.name === 'QuotaExceededError' ? 'Browser storage is full. Export your favourites before making room.' : error.message;
    notice(message);
    if ($('#photo-viewer').open) $('#viewer-status').textContent = message;
  }
}
$('#save-photo').onclick = $('#viewer-save').onclick = toggleFavourite;
$('#export-favourites').onclick = () => {
  const url = URL.createObjectURL(new Blob([serialiseFavourites(favourites)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'nyc-time-machine-favourites.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('#import-favourites').onchange = async event => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2000000) throw Error('Choose a backup smaller than 2 MB.');
    const ids = validateFavourites(JSON.parse(await file.text()),archive.byId);
    persistFavourites(new Set([...favourites,...ids]));
    setScope({kind:'saved'});
    notice(`Imported ${number(ids.length)} photos. Existing favourites were kept.`);
  } catch (error) { notice(error.message); }
  finally { event.target.value = ''; }
};
window.addEventListener('storage', event => {
  if (!archive || (event.key !== KEY && event.key !== null)) return;
  const loaded = loadFavourites(storage(),archive.byId);
  favourites = new Set(loaded.ids);
  if (scope.kind === 'saved') { items = scopePhotos(); renderCollection(visible[selected]?.id); }
  updateSaveButtons();
  if (loaded.message) notice(loaded.message);
});

function renderViewer() {
  const photo = visible[selected];
  if (!photo) return;
  $('#viewer-title').textContent = photo.title;
  $('#viewer-date').textContent = `${yearLabel(photo)} · THE NEW YORK PUBLIC LIBRARY`;
  $('#viewer-image').alt = photo.title;
  $('#viewer-image').onerror = () => { $('#viewer-status').textContent = 'Image unavailable. Open the NYPL record or choose another photograph.'; };
  $('#viewer-image').src = photo.image;
  $('#viewer-position').textContent = `${selected + 1} / ${number(visible.length)}`;
  $('#viewer-record').href = photo.nypl;
  $('#viewer-stage').classList.remove('zoomed');
  $('#viewer-stage').scrollTop = $('#viewer-stage').scrollLeft = 0;
  $('#viewer-zoom').textContent = 'Zoom in';
  $('#viewer-status').textContent = 'Use ← and → to browse. Escape closes the photograph.';
  updateSaveButtons();
}
$('#expand-photo').onclick = () => { renderViewer(); $('#photo-viewer').showModal(); };
$('#viewer-zoom').onclick = () => {
  const zoomed = $('#viewer-stage').classList.toggle('zoomed');
  $('#viewer-zoom').textContent = zoomed ? 'Fit photograph' : 'Zoom in';
  $('#viewer-stage').scrollTop = $('#viewer-stage').scrollLeft = 0;
};
document.addEventListener('keydown', event => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if ($('#photo-viewer').open) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectPhoto(selected - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectPhoto(selected + 1); }
  } else if (event.key === '/' && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('#search').focus(); revealMap();
  }
});
window.addEventListener('hashchange',openHash);
async function loadArchive() {
  $('#all-photos').disabled = $('#favourites-btn').disabled = true;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/photos.json`);
    if (!response.ok) throw Error();
    archive = createArchive(await response.json());
    const loaded = loadFavourites(storage(),archive.byId);
    favourites = new Set(loaded.ids);
    $('#starter-streets').innerHTML = ['manhattan|bowery','manhattan|broadway','manhattan|5 avenue','brooklyn|fulton street'].filter(key => archive.streets.has(key)).map(key => `<button data-street="${key}">${esc(archive.streets.get(key).label)}</button>`).join('');
    $('#all-photos').disabled = $('#favourites-btn').disabled = false;
    $('.archive-pane').setAttribute('aria-busy','false');
    openHash();
    if (loaded.message) notice(loaded.message);
  } catch {
    $('#scope-title').textContent = 'The archive could not load.';
    $('#scope-description').textContent = 'Check your connection and try again.';
    $('#archive-status').innerHTML = '<button id="retry-archive">Retry loading the archive</button>';
    $('#retry-archive').onclick = loadArchive;
    $('#map-count').textContent = 'Archive unavailable';
    $('.archive-pane').setAttribute('aria-busy','false');
  }
}
loadArchive();
