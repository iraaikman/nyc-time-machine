import { setupCuration } from "./curation.js";
import { createComparison } from "./comparison.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./style.css";
const $ = (s) => document.querySelector(s);
const map = L.map("map", { zoomControl: false }).setView([40.725, -73.99], 13);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);
const cluster = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 42,
  showCoverageOnHover: false,
  iconCreateFunction: (c) =>
    L.divIcon({
      html: `<span>${c.getChildCount()}</span>`,
      className: "cluster",
      iconSize: [36, 36],
    }),
}).addTo(map);
let photos = [];
let selectPhoto = (p) => alert(p.title);
const groups = new Map();
function applyFilters() {
  const q = $("#search").value.trim().toLowerCase(),
    decade = +$("#decade").value,
    undated = $("#unknown").checked;
  $("#decade-label").value = decade === 1860 ? "All years" : `${decade}s`;
  const filtered = photos.filter(
    (p) =>
      (p.year == null
        ? undated
        : decade === 1860 || (p.year >= decade && p.year < decade + 10)) &&
      (!q || `${p.title} ${p.text}`.toLowerCase().includes(q)),
  );
  groups.clear();
  for (const p of filtered) {
    const k = `${p.lat},${p.lon}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  cluster.clearLayers();
  cluster.addLayers(
    [...groups.values()].map((items) =>
      L.marker([items[0].lat, items[0].lon], {
        icon: L.divIcon({
          className: "photo-pin",
          html: "<span></span>",
          iconSize: [16, 16],
        }),
        title: items[0].title,
      }).on("click", () => selectPhoto(items[0], items)),
    ),
  );
  $("#count").textContent =
    `${filtered.length.toLocaleString()} photographs · ${groups.size.toLocaleString()} places`;
}
let debounce;
$("#search").oninput = () => {
  clearTimeout(debounce);
  debounce = setTimeout(applyFilters, 220);
};
$("#decade").oninput = applyFilters;
$("#unknown").onchange = applyFilters;
$("#reset").onclick = () => {
  $("#search").value = "";
  $("#decade").value = 1860;
  $("#unknown").checked = true;
  applyFilters();
  map.setView([40.725, -73.99], 13);
};
$("#about-btn").onclick = () => $("#about").showModal();
$("#settings-btn").onclick = () => $("#settings").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $("#" + b.dataset.close).close()));
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $("#search").focus();
  }
});
fetch(`${import.meta.env.BASE_URL}data/photos.json`)
  .then((r) => {
    if (!r.ok) throw Error("Archive download failed");
    return r.json();
  })
  .then((data) => {
    photos = data;
    applyFilters();
  })
  .catch(() => {
    $("#count").textContent = "Archive unavailable. Reload to try again.";
  });
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let activePhoto = null,
  locationPhotos = [],
  photoIndex = 0;
selectPhoto = (photo, items = [photo]) => {
  activePhoto = photo;
  locationPhotos = items;
  photoIndex = items.indexOf(photo);
  const panel = $("#panel");
  panel.hidden = false;
  panel.innerHTML = `<div class="panel-top"><span class="eyebrow">FROM THE NYPL ARCHIVE</span><button id="close-panel" class="text-btn" aria-label="Close photograph">×</button></div><div class="photo-frame"><img id="historic-img" src="${esc(photo.image)}" alt="${esc(photo.title)}"><div class="photo-year">${photo.year || "Undated"}</div></div><div class="panel-content"><div class="photo-pager"><span>${photoIndex + 1} of ${items.length} at this place</span><div><button id="prev-photo" aria-label="Previous historic photograph" ${photoIndex === 0 ? "disabled" : ""}>←</button><button id="next-photo" aria-label="Next historic photograph" ${photoIndex === items.length - 1 ? "disabled" : ""}>→</button></div></div><h2>${esc(photo.title)}</h2><p class="coordinates">${photo.lat.toFixed(5)}° N · ${Math.abs(photo.lon).toFixed(5)}° W</p><button id="compare-btn" class="primary wide">Then / Now <span>↗</span></button><p class="compare-hint">Find a street view with the same visible landmarks.</p><details ${photo.text ? "open" : ""}><summary>BACK OF THE PHOTOGRAPH</summary><p class="transcription">${esc(photo.text || "No transcription is available for this photograph.")}</p></details><a class="record-link" href="${esc(photo.nypl)}" target="_blank" rel="noreferrer">View original NYPL record ↗</a><p class="photo-credit">Historic photograph: The New York Public Library<br>Photographic Views of New York City · via OldNYC</p></div>`;
  $("#close-panel").onclick = () => {
    panel.hidden = true;
  };
  $("#historic-img").onerror = () => {
    $("#historic-img").alt =
      "NYPL image unavailable. Open the original NYPL record below.";
  };
  $("#prev-photo").onclick = () => selectPhoto(items[photoIndex - 1], items);
  $("#next-photo").onclick = () => selectPhoto(items[photoIndex + 1], items);
  $("#compare-btn").onclick = () => openComparison(photo);
  map.panTo([photo.lat, photo.lon]);
};
let openComparison = () => $("#settings").showModal();

const comparison = createComparison({
  esc,
  onSettings: () => $("#settings").showModal(),
});
openComparison = (p) => comparison.open(p);
$("#token-form").onsubmit = (e) => {
  e.preventDefault();
  comparison.setToken($("#token").value.trim());
  $("#token").value = "";
  $("#settings").close();
};

const curation = setupCuration({
  comparison,
  getPhotos: () => photos,
  esc,
  onCount: (n) => ($("#fav-count").textContent = n),
});
$("#tour-btn").onclick = () => curation.open();
