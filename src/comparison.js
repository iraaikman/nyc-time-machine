import { nearbyImages, freshImage, rankImages, distance } from "./mapillary.js";

const loadImage = (element, url) => new Promise((resolve, reject) => {
  element.onload = resolve;
  element.onerror = () => reject(Error("Photograph unavailable. Try another view or open its original record below."));
  element.src = url;
});

export function createComparison({ esc, onSettings }) {
  let token = __MAPILLARY_TOKEN__, configToken = "", photo, images = [],
    index = 0, controller, request = 0, thenReady, galleryCount = 24;
  const configReady = fetch(`${import.meta.env.BASE_URL}config.json`)
    .then((r) => r.ok ? r.json() : {})
    .then((c) => { configToken = typeof c.MAPILLARY_TOKEN === "string" ? c.MAPILLARY_TOKEN : ""; })
    .catch(() => {});
  const dialog = document.createElement("dialog");
  dialog.id = "comparison";
  document.body.append(dialog);
  dialog.innerHTML = `
    <div class="compare-header"><div><div class="eyebrow">FIND THE SAME VIEW</div><h2 id="comparison-title"></h2></div><button class="close" id="close-compare" aria-label="Close comparison">×</button></div>
    <p class="viewpoint-help">Match the camera position, direction and height before aligning. Archive pins may locate the subject rather than the photographer. Rooftop views and interiors may have no street-level match.</p>
    <div class="view-search"><label>Search around archive pin<select id="view-radius"><option value="50">50 metres</option><option value="100">100 metres</option><option value="200">200 metres</option></select></label><label>Browse views by<select id="view-direction"><option value="pin">Facing archive pin · estimate</option><option value="nearest">Distance from archive pin</option><option value="0">Looking north</option><option value="45">Looking northeast</option><option value="90">Looking east</option><option value="135">Looking southeast</option><option value="180">Looking south</option><option value="225">Looking southwest</option><option value="270">Looking west</option><option value="315">Looking northwest</option></select></label><button id="compare-settings" class="text-btn">Token settings</button></div>
    <div id="compare-status" role="status"></div>
    <div class="compare-stage side-by-side" id="compare-stage"><img id="now-image" alt="Mapillary street view"><div id="old-clip"><img id="then-image" alt="Historic NYPL photograph"></div><div id="divider"><span>↔</span></div><div class="stage-tag then-tag">THEN <span id="then-date"></span></div><div class="stage-tag now-tag">STREET VIEW <span id="now-date"></span></div></div>
    <div class="compare-controls"><div class="nearby-controls"><button id="prev-now" aria-label="Previous Mapillary view">←</button><span id="now-info"></span><button id="next-now" aria-label="Next Mapillary view">→</button></div><div class="slider-controls" hidden><label>Reveal<input id="reveal" type="range" min="0" max="100" value="50"></label><label>Old photo opacity<input id="opacity" type="range" min="0" max="100" value="100"></label></div><div class="compare-actions"><button id="mode-btn" disabled>Overlay preview</button><button id="align-btn" disabled>⌖ Align shared landmarks</button><button id="save-pair" disabled>♡ Save favourite</button></div></div>
    <details class="view-picker" open><summary id="view-picker-title">Choose a street view</summary><p class="viewpoint-help">Look for the same façade and visible corners. Sorting estimates direction only; it does not verify a match. If nothing overlaps, try a wider radius, a different direction, or another historic photo.</p><div id="view-gallery" class="view-gallery"></div><button id="more-views" hidden>Show more views</button></details>
    <div class="comparison-credit"><a id="then-credit" target="_blank" rel="noreferrer">Historic: The New York Public Library ↗</a><a id="now-credit" href="https://www.mapillary.com/" target="_blank" rel="noreferrer">Street view: Mapillary contributors ↗</a></div>`;
  const $ = (s) => dialog.querySelector(s);
  const status = (message) => { $("#compare-status").textContent = message; };
  const abort = () => { controller?.abort(); request++; };
  const setMode = (overlay) => {
    $("#compare-stage").classList.toggle("side-by-side", !overlay);
    $(".slider-controls").hidden = !overlay;
    $("#mode-btn").textContent = overlay ? "Side by side" : "Overlay preview";
    $("#mode-btn").setAttribute("aria-pressed", String(overlay));
  };
  $("#mode-btn").onclick = () => setMode($("#compare-stage").classList.contains("side-by-side"));
  $("#close-compare").onclick = () => dialog.close();
  dialog.addEventListener("close", abort);
  $("#compare-settings").onclick = onSettings;
  const updateReveal = () => {
    const value = +$("#reveal").value;
    $("#old-clip").style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    $("#divider").style.left = value + "%";
  };
  $("#reveal").oninput = updateReveal;
  $("#opacity").oninput = () => { $("#then-image").style.opacity = $("#opacity").value / 100; };
  let dragging = false;
  $("#compare-stage").addEventListener("pointerdown", (event) => {
    if (!$("#compare-stage").classList.contains("ready") || $("#compare-stage").classList.contains("side-by-side")) return;
    dragging = true;
    $("#compare-stage").setPointerCapture(event.pointerId);
    drag(event);
  });
  $("#compare-stage").addEventListener("pointermove", (event) => { if (dragging) drag(event); });
  for (const type of ["pointerup", "pointercancel"]) {
    $("#compare-stage").addEventListener(type, () => { dragging = false; });
  }
  function drag(event) {
    const rect = $("#compare-stage").getBoundingClientRect();
    $("#reveal").value = Math.max(0, Math.min(100, 100 * (event.clientX - rect.left) / rect.width));
    updateReveal();
  }
  const describe = (image) => `${Number.isFinite(image.distance) ? Math.round(image.distance) + " m from pin" : "distance unknown"} · ${Number.isFinite(image.compass_angle) ? Math.round(image.compass_angle) + "°" : "heading unknown"}`;
  function renderGallery() {
    $("#view-picker-title").textContent = `Choose a street view · ${images.length} ${images.length === 1 ? "candidate" : "candidates"}`;
    galleryCount = Math.max(galleryCount, index + 1);
    $("#view-gallery").innerHTML = images.slice(0, galleryCount).map((image, i) => `
      <button class="view-candidate" data-view="${i}" aria-pressed="${i === index}" aria-label="View ${i + 1}: ${esc(describe(image))}"><img loading="lazy" src="${esc(image.thumb_2048_url)}" alt="Street view candidate ${i + 1}"><span>${i + 1} · ${esc(describe(image))}</span></button>`).join("");
    $("#view-gallery").querySelectorAll("[data-view]").forEach((button) => {
      button.onclick = () => showImage(Number(button.dataset.view));
    });
    $("#more-views").hidden = images.length <= galleryCount;
  }
  $("#more-views").onclick = () => { galleryCount += 24; renderGallery(); };
  $("#view-direction").onchange = () => {
    if (!images.length) return;
    const id = images[index].id;
    images = rankImages(images, photo, $("#view-direction").value);
    index = images.findIndex((image) => image.id === id);
    renderGallery();
    $("#now-info").textContent = `${index + 1} / ${images.length} · ${describe(images[index])}`;
  };
  $("#view-radius").onchange = () => { if (photo) open(photo); };
  function resetPair() {
    dragging = false;
    for (const id of ["align-btn", "save-pair", "mode-btn"]) $("#" + id).disabled = true;
    $("#compare-stage").classList.remove("ready");
    $("#then-image").style.transform = "";
    $("#then-image").style.objectFit = "contain";
    $("#then-image").style.opacity = 1;
    $("#opacity").value = 100;
    $("#reveal").value = 50;
    setMode(false);
    updateReveal();
    dialog.dispatchEvent(new CustomEvent("pairloading"));
  }
  async function showImage(i) {
    if (!images.length) return;
    abort();
    controller = new AbortController();
    const current = ++request;
    index = (i + images.length) % images.length;
    resetPair();
    renderGallery();
    status("Loading photographs…");
    try {
      const image = await freshImage(images[index].id, token || configToken, controller.signal);
      if (current !== request) return;
      if (!image.thumb_2048_url) throw Error("This street view has no available photograph. Choose another candidate.");
      images[index] = { ...images[index], ...image };
      const ready = thenReady;
      await Promise.all([loadImage($("#now-image"), image.thumb_2048_url), ready]);
      if (current !== request) return;
      $("#compare-stage").style.setProperty("--image-ratio", $("#now-image").naturalWidth / $("#now-image").naturalHeight);
      $("#compare-stage").style.aspectRatio = `${$("#now-image").naturalWidth} / ${$("#now-image").naturalHeight}`;
      $("#compare-stage").classList.add("ready");
      for (const id of ["align-btn", "save-pair", "mode-btn"]) $("#" + id).disabled = false;
      $("#now-date").textContent = image.captured_at ? new Date(image.captured_at).getFullYear() : "";
      $("#now-info").textContent = `${index + 1} / ${images.length} · ${describe(images[index])}`;
      $("#now-credit").href = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(image.id)}&focus=photo`;
      $("#now-credit").textContent = `Street view: Mapillary contributors · ${image.captured_at ? new Date(image.captured_at).toLocaleDateString() : "date unknown"} ↗`;
      status("Viewpoint unverified. Find the same façade and four shared landmarks before aligning.");
      dialog.dispatchEvent(new CustomEvent("pairready", { detail: { photo, image: images[index] } }));
    } catch (error) {
      if (error.name !== "AbortError" && current === request) status(error.message);
    }
  }
  $("#prev-now").onclick = () => showImage(index - 1);
  $("#next-now").onclick = () => showImage(index + 1);
  let pendingSaved = null;
  async function open(p, saved = null) {
    abort();
    const current = ++request;
    photo = p;
    images = [];
    pendingSaved = saved;
    index = 0;
    galleryCount = 24;
    resetPair();
    renderGallery();
    thenReady = loadImage($("#then-image"), p.image);
    thenReady.catch(() => {});
    $("#comparison-title").textContent = p.title;
    $("#then-date").textContent = p.year || "Undated";
    $("#then-credit").href = p.nypl;
    $("#now-info").textContent = "";
    $("#prev-now").disabled = $("#next-now").disabled = true;
    if (!dialog.open) dialog.showModal();
    status("Finding nearby street views…");
    await configReady;
    if (!dialog.open || current !== request) return;
    if (!(token || configToken)) {
      status("A free Mapillary client token is needed. Open Token settings to connect.");
      return;
    }
    controller = new AbortController();
    const radius = Number($("#view-radius").value);
    status(`Finding street views within ${radius} metres…`);
    try {
      if (saved) {
        const image = await freshImage(saved.mapillaryId, token || configToken, controller.signal);
        if (current !== request) return;
        images = [{ ...image, distance: image.geometry?.coordinates ? distance(p, {lat: image.geometry.coordinates[1], lon: image.geometry.coordinates[0]}) : null }];
      } else {
        const result = await nearbyImages(p, token || configToken, controller.signal, radius);
        if (current !== request) return;
        images = rankImages(result.images, p, $("#view-direction").value);
      }
      renderGallery();
      if (!images.length) {
        status(`No street views found within ${radius} metres. Try a wider radius or another historic photo.`);
        return;
      }
      $("#prev-now").disabled = $("#next-now").disabled = images.length < 2;
      await showImage(0);
    } catch (error) {
      if (error.name !== "AbortError" && current === request) status(error.message);
    }
  }
  return {
    open, dialog, status, setMode,
    getPair: () => ({ photo, image: images[index] }),
    setToken: (value) => { token = value; if (dialog.open && photo) open(photo, pendingSaved); },
  };
}
