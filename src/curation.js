import { homography, cssMatrix, validPoints } from "./homography.js";
const KEY = "nyc-time-machine:alignments:v1";
export function validatePair(p) {
  if (
    !p ||
    typeof p.photoId !== "string" ||
    p.photoId.length > 150 ||
    typeof p.mapillaryId !== "string" ||
    !/^\d{1,30}$/.test(p.mapillaryId) ||
    !validPoints(p.oldPoints) ||
    !validPoints(p.newPoints)
  )
    throw Error(
      "Invalid alignment file: expected photo IDs and four normalized points for each image.",
    );
  homography(p.oldPoints, p.newPoints);
  return {
    photoId: p.photoId,
    mapillaryId: p.mapillaryId,
    oldPoints: p.oldPoints,
    newPoints: p.newPoints,
  };
}
export function setupCuration({ comparison, getPhotos, esc, onCount }) {
  let pairs = [],
    storageWarning = "";
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(saved)) throw Error();
    pairs = saved.map(validatePair);
  } catch {
    storageWarning =
      "Saved alignments could not be read. Import a backup if you have one.";
  }
  onCount(pairs.length);
  function persist(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      pairs = next;
      onCount(pairs.length);
    } catch {
      throw Error(
        "Browser storage is full or disabled. Export your current set before continuing.",
      );
    }
  }
  const d = comparison.dialog,
    $ = (s) => d.querySelector(s);
  let current = null,
    points = null;
  d.addEventListener("pairloading", () => {
    current = null;
    points = null;
    $("#save-pair").textContent = "♡ Save favourite";
  });
  function apply(pair) {
    const old = $("#then-image");
    if (!pair) {
      old.style.transform = "";
      old.style.objectFit = "contain";
      points = null;
      $("#save-pair").textContent = "♡ Save favourite";
      return;
    }
    points = pair;
    const rect = $("#compare-stage").getBoundingClientRect();
    old.style.objectFit = "fill";
    old.style.transformOrigin = "0 0";
    old.style.transform = cssMatrix(
      homography(pair.oldPoints, pair.newPoints),
      rect.width,
      rect.height,
    );
    $("#save-pair").textContent = "♥ Saved to favourites";
  }
  new ResizeObserver(() => {
    if (points) apply(points);
  }).observe($("#compare-stage"));
  d.addEventListener("pairready", (e) => {
    current = e.detail;
    apply(
      pairs.find(
        (p) =>
          p.photoId === current.photo.id &&
          p.mapillaryId === String(current.image.id),
      ),
    );
    if (points) {
      comparison.setMode(true);
      comparison.status("Saved alignment restored. Drag the divider or switch to side by side.");
    }
    if (storageWarning) comparison.status(storageWarning);
  });
  $("#save-pair").onclick = () => {
    if (!points) {
      openAlignment();
      return;
    }
    save(points);
  };
  function save(pair) {
    try {
      persist([
        ...pairs.filter(
          (p) =>
            !(p.photoId === pair.photoId && p.mapillaryId === pair.mapillaryId),
        ),
        pair,
      ]);
      apply(pair);
      comparison.setMode(true);
      comparison.status(
        "Alignment saved in this browser. Export your favourites to keep a backup.",
      );
    } catch (e) {
      comparison.status(e.message);
    }
  }
  const alignment = document.createElement("dialog");
  alignment.id = "alignment";
  document.body.append(alignment);
  alignment.innerHTML = `<button class="close" id="close-alignment" aria-label="Close alignment">×</button><div class="eyebrow">FOUR SHARED LANDMARKS</div><h2>Match a visible façade.</h2><p>Choose four matching points around the same flat façade, clockwise from the top left. Click all four on the historic photo, then the same four in the same order on the street view. If you cannot find those landmarks in both photos, close this window and choose another view. Alignment cannot recreate a rooftop camera position or missing buildings.</p><div class="alignment-images"><section><div class="alignment-label">01 · THEN <span>NYPL</span></div><div class="point-image" id="old-points"><img alt="Historic photograph: click four landmarks"><div class="point-layer"></div></div></section><section><div class="alignment-label">02 · NOW <span>Mapillary</span></div><div class="point-image" id="new-points"><img alt="Street view: click the four matching landmarks"><div class="point-layer"></div></div></section></div><p id="alignment-status" role="status"></p><div class="align-actions"><button id="undo-point">Undo last point</button><button id="reset-points">Start again</button><button class="primary" id="apply-alignment" disabled>Apply & save alignment</button></div><p class="muted">Perspective alignment matches one plane; moving objects, depth and lens differences may still differ. Historic: NYPL · Present: Mapillary contributors. <a id="alignment-record" target="_blank" rel="noreferrer">Original NYPL record ↗</a></p>`;
  const a = (s) => alignment.querySelector(s);
  let oldPoints = [],
    newPoints = [];
  const render = () => {
    for (const [id, list] of [
      ["old-points", oldPoints],
      ["new-points", newPoints],
    ])
      a("#" + id + " .point-layer").innerHTML = list
        .map(
          ([x, y], i) =>
            `<span class="landmark" style="left:${x * 100}%;top:${y * 100}%">${i + 1}</span>`,
        )
        .join("");
    a("#apply-alignment").disabled =
      oldPoints.length !== 4 || newPoints.length !== 4;
    a("#alignment-status").textContent =
      oldPoints.length < 4
        ? `Historic photo: choose point ${oldPoints.length + 1} of 4.`
        : newPoints.length < 4
          ? `Street view: match point ${newPoints.length + 1} of 4.`
          : "Eight points selected. Apply to preview and save.";
  };
  function openAlignment() {
    if (!current) return;
    a("#alignment-record").href = current.photo.nypl;
    oldPoints = points ? points.oldPoints.map((p) => [...p]) : [];
    newPoints = points ? points.newPoints.map((p) => [...p]) : [];
    for (const [id, source] of [["old-points", current.photo.image], ["new-points", current.image.thumb_2048_url]]) {
      const image = a("#" + id + " img");
      image.onload = () => a("#" + id).style.setProperty("--point-ratio", image.naturalWidth / image.naturalHeight);
      image.src = source;
    }
    render();
    alignment.showModal();
  }
  $("#align-btn").onclick = openAlignment;
  a("#close-alignment").onclick = () => alignment.close();
  for (const id of ["old-points", "new-points"])
    a("#" + id).onclick = (e) => {
      const target = id === "old-points" ? oldPoints : newPoints;
      if (target.length === 4 || (id === "new-points" && oldPoints.length < 4))
        return;
      const r = a("#" + id).getBoundingClientRect();
      target.push([
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      ]);
      render();
    };
  a("#undo-point").onclick = () => {
    (newPoints.length ? newPoints : oldPoints).pop();
    render();
  };
  a("#reset-points").onclick = () => {
    oldPoints = [];
    newPoints = [];
    render();
  };
  a("#apply-alignment").onclick = () => {
    try {
      const pair = validatePair({
        photoId: current.photo.id,
        mapillaryId: String(current.image.id),
        oldPoints,
        newPoints,
      });
      persist([
        ...pairs.filter(
          (p) =>
            !(p.photoId === pair.photoId && p.mapillaryId === pair.mapillaryId),
        ),
        pair,
      ]);
      apply(pair);
      comparison.setMode(true);
      alignment.close();
      comparison.status(
        "Aligned and saved. Drag the divider or fade between views.",
      );
    } catch (e) {
      a("#alignment-status").textContent = e.message;
    }
  };
  const tour = document.createElement("dialog");
  tour.id = "tour";
  document.body.append(tour);
  let tourIndex = 0,
    touring = false;
  tour.innerHTML = `<button class="close" id="close-tour" aria-label="Close favourites">×</button><div class="eyebrow">YOUR PERSONAL TIME MACHINE</div><h2>Familiar places.<br>Another lifetime.</h2><p>Aligned photographs, collected by you.</p><div class="tour-actions"><button id="start-tour" class="primary">Play full-screen tour ↗</button><button id="export-pairs">Export JSON</button><label class="file-button">Import JSON<input type="file" id="import-pairs" accept="application/json,.json"></label></div><p id="tour-status" role="status"></p><div id="favourite-list"></div>`;
  const t = (s) => tour.querySelector(s);
  const tourNav = document.createElement("div");
  tourNav.className = "tour-nav";
  tourNav.hidden = true;
  tourNav.innerHTML =
    '<button id="tour-prev" aria-label="Previous favourite">←</button><span id="tour-position"></span><button id="tour-next" aria-label="Next favourite">→</button><button id="tour-stop">End tour</button>';
  d.querySelector(".compare-controls").prepend(tourNav);
  async function showPair(i) {
    if (!pairs.length) return;
    tourIndex = (i + pairs.length) % pairs.length;
    const pair = pairs[tourIndex],
      p = getPhotos().find((p) => p.id === pair.photoId);
    if (!p) {
      comparison.status("This photo is missing from the current archive.");
      return;
    }
    tourNav.hidden = !touring;
    $("#tour-position").textContent =
      `Favourite ${tourIndex + 1} of ${pairs.length}`;
    await comparison.open(p, pair);
  }
  $("#tour-prev").onclick = () => showPair(tourIndex - 1);
  $("#tour-next").onclick = () => showPair(tourIndex + 1);
  $("#tour-stop").onclick = () => {
    touring = false;
    tourNav.hidden = true;
    if (document.fullscreenElement === d)
      document.exitFullscreen?.().catch(() => {});
  };
  d.addEventListener("close", () => {
    touring = false;
    tourNav.hidden = true;
    if (document.fullscreenElement === d)
      document.exitFullscreen?.().catch(() => {});
  });
  d.addEventListener("keydown", (e) => {
    if (
      touring &&
      !["INPUT", "BUTTON"].includes(document.activeElement.tagName)
    ) {
      if (e.key === "ArrowLeft") showPair(tourIndex - 1);
      if (e.key === "ArrowRight") showPair(tourIndex + 1);
    }
  });
  function renderTour() {
    const photos = getPhotos(),
      lookup = new Map(photos.map((p) => [p.id, p]));
    t("#favourite-list").innerHTML = pairs.length
      ? pairs
          .map((p, i) => {
            const photo = lookup.get(p.photoId);
            return `<article class="favourite"><button class="favourite-open" data-open="${i}"><img loading="lazy" src="${esc(photo?.image || "")}" alt=""><span><strong>${esc(photo?.title || p.photoId)}</strong><small>${photo?.year || "Undated"} · Historic: NYPL · Present: Mapillary</small></span></button><a class="favourite-record" href="${esc(photo?.nypl || "https://www.nypl.org/")}" target="_blank" rel="noreferrer">NYPL ↗</a><button data-delete="${i}" aria-label="Remove favourite">×</button></article>`;
          })
          .join("")
      : '<div class="empty-collection"><span>♡</span><h3>A little history, just for you.</h3><p>Open a photo on the map, choose Then / Now, and align four matching points. Your saved pairs will appear here.</p></div>';
    t("#start-tour").disabled = t("#export-pairs").disabled = !pairs.length;
    tour.querySelectorAll("[data-open]").forEach(
      (b) =>
        (b.onclick = () => {
          tour.close();
          touring = false;
          showPair(+b.dataset.open);
        }),
    );
    tour.querySelectorAll("[data-delete]").forEach(
      (b) =>
        (b.onclick = () => {
          try {
            persist(pairs.filter((_, i) => i !== +b.dataset.delete));
            renderTour();
          } catch (e) {
            t("#tour-status").textContent = e.message;
          }
        }),
    );
  }
  t("#close-tour").onclick = () => tour.close();
  t("#start-tour").onclick = () => {
    tour.close();
    touring = true;
    showPair(0);
    d.requestFullscreen?.().catch(() => {});
  };
  t("#export-pairs").onclick = () => {
    const blob = new Blob([JSON.stringify({ version: 1, pairs }, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "nyc-time-machine-alignments.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  t("#import-pairs").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2000000) throw Error("File is too large (maximum 2 MB).");
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        !Array.isArray(data.pairs) ||
        data.pairs.length > 2000
      )
        throw Error(
          "Expected a version 1 alignment export, with at most 2,000 pairs.",
        );
      const imported = data.pairs.map(validatePair),
        ids = new Set(getPhotos().map((p) => p.id));
      if (imported.some((p) => !ids.has(p.photoId)))
        throw Error(
          "This export contains photos missing from the current archive.",
        );
      const merged = new Map(
        pairs.map((p) => [p.photoId + ":" + p.mapillaryId, p]),
      );
      for (const p of imported) merged.set(p.photoId + ":" + p.mapillaryId, p);
      persist([...merged.values()]);
      renderTour();
      t("#tour-status").textContent =
        `Imported ${imported.length} alignments. Existing pairs were merged.`;
    } catch (error) {
      t("#tour-status").textContent = error.message;
    } finally {
      e.target.value = "";
    }
  };
  return {
    open: () => {
      renderTour();
      t("#tour-status").textContent = storageWarning;
      tour.showModal();
    },
  };
}
