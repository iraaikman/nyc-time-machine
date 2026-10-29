import { nearbyImages, freshImage } from "./mapillary.js";
export function createComparison({ esc, onSettings }) {
  let token = __MAPILLARY_TOKEN__,
    configToken = "",
    photo,
    images = [],
    index = 0,
    controller,
    request = 0;
  const configReady = fetch(`${import.meta.env.BASE_URL}config.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then(
      (c) =>
        (configToken =
          typeof c.MAPILLARY_TOKEN === "string" ? c.MAPILLARY_TOKEN : ""),
    )
    .catch(() => {});
  const dialog = document.createElement("dialog");
  dialog.id = "comparison";
  document.body.append(dialog);
  dialog.innerHTML = `<div class="compare-header"><div><div class="eyebrow">THEN / NOW</div><h2 id="comparison-title"></h2></div><button class="close" id="close-compare" aria-label="Close comparison">×</button></div><div id="compare-status" role="status"></div><div class="compare-stage" id="compare-stage"><img id="now-image" alt="Present-day Mapillary street view"><div id="old-clip"><img id="then-image" alt="Historic NYPL photograph"></div><div id="divider"><span>↔</span></div><div class="stage-tag then-tag">THEN <span id="then-date"></span></div><div class="stage-tag now-tag">NOW <span id="now-date"></span></div></div><div class="compare-controls"><div class="nearby-controls"><button id="prev-now" aria-label="Previous Mapillary angle">←</button><span id="now-info">Looking for nearby imagery…</span><button id="next-now" aria-label="Next Mapillary angle">→</button></div><div class="slider-controls"><label>Reveal<input id="reveal" type="range" min="0" max="100" value="50"></label><label>Old photo opacity<input id="opacity" type="range" min="0" max="100" value="100"></label></div><div class="compare-actions"><button id="align-btn" disabled>⌖ Align photographs</button><button id="save-pair" disabled>♡ Save favourite</button><button id="compare-settings" class="text-btn">Token settings</button></div></div><div class="comparison-credit"><a id="then-credit" target="_blank" rel="noreferrer">Historic: The New York Public Library ↗</a><a id="now-credit" href="https://www.mapillary.com/" target="_blank" rel="noreferrer">Present: Mapillary contributors ↗</a></div>`;
  const $ = (s) => dialog.querySelector(s);
  const status = (message) => ($("#compare-status").textContent = message);
  const abort = () => {
    controller?.abort();
    request++;
  };
  $("#close-compare").onclick = () => dialog.close();
  dialog.addEventListener("close", abort);
  $("#compare-settings").onclick = onSettings;
  const updateReveal = () => {
    const v = +$("#reveal").value;
    $("#old-clip").style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    $("#divider").style.left = v + "%";
  };
  $("#reveal").oninput = updateReveal;
  $("#opacity").oninput = () =>
    ($("#then-image").style.opacity = $("#opacity").value / 100);
  let dragging = false;
  $("#compare-stage").addEventListener("pointerdown", (e) => {
    if (!images.length) return;
    dragging = true;
    $("#compare-stage").setPointerCapture(e.pointerId);
    drag(e);
  });
  $("#compare-stage").addEventListener("pointermove", (e) => {
    if (dragging) drag(e);
  });
  $("#compare-stage").addEventListener("pointerup", () => (dragging = false));
  $("#compare-stage").addEventListener(
    "pointercancel",
    () => (dragging = false),
  );
  function drag(e) {
    const rect = $("#compare-stage").getBoundingClientRect();
    $("#reveal").value = Math.max(
      0,
      Math.min(100, (100 * (e.clientX - rect.left)) / rect.width),
    );
    updateReveal();
  }
  async function showImage(i) {
    abort();
    controller = new AbortController();
    const current = ++request;
    index = (i + images.length) % images.length;
    $("#align-btn").disabled = true;
    $("#save-pair").disabled = true;
    $("#compare-stage").classList.remove("ready");
    status("Loading a fresh street view…");
    try {
      const image = await freshImage(
        images[index].id,
        token || configToken,
        controller.signal,
      );
      if (current !== request) return;
      images[index] = { ...images[index], ...image };
      $("#now-image").onload = () => {
        if (current !== request) return;
        $("#compare-stage").style.setProperty(
          "--image-ratio",
          $("#now-image").naturalWidth / $("#now-image").naturalHeight,
        );
        $("#compare-stage").style.aspectRatio =
          `${$("#now-image").naturalWidth} / ${$("#now-image").naturalHeight}`;
        $("#compare-stage").classList.add("ready");
        $("#align-btn").disabled = false;
        $("#save-pair").disabled = false;
        status("Drag the divider to travel through time.");
        dialog.dispatchEvent(
          new CustomEvent("pairready", {
            detail: { photo, image: images[index] },
          }),
        );
      };
      $("#now-image").onerror = () => {
        if (current === request)
          status(
            "This Mapillary image could not load. Try another angle or reload the comparison.",
          );
      };
      $("#now-image").src = image.thumb_2048_url;
      $("#now-date").textContent = image.captured_at
        ? new Date(image.captured_at).getFullYear()
        : "";
      $("#now-info").textContent =
        `${index + 1} / ${images.length} · ${Math.round(images[index].distance || 0)} m · ${image.compass_angle == null ? "heading unknown" : Math.round(image.compass_angle) + "°"}`;
      $("#now-credit").href =
        `https://www.mapillary.com/app/?pKey=${encodeURIComponent(image.id)}&focus=photo`;
      $("#now-credit").textContent =
        `Present: Mapillary contributors · ${image.captured_at ? new Date(image.captured_at).toLocaleDateString() : "date unknown"} ↗`;
      $("#prev-now").disabled = $("#next-now").disabled = images.length < 2;
    } catch (e) {
      if (e.name !== "AbortError" && current === request) status(e.message);
    }
  }
  $("#prev-now").onclick = () => showImage(index - 1);
  $("#next-now").onclick = () => showImage(index + 1);
  let pendingPhoto = null,
    pendingSaved = null;
  async function open(p, saved = null) {
    abort();
    photo = p;
    images = [];
    pendingPhoto = p;
    pendingSaved = saved;
    index = 0;
    $("#compare-stage").classList.remove("ready");
    $("#then-image").style.transform = "";
    $("#then-image").style.objectFit = "contain";
    $("#then-image").style.opacity = 1;
    $("#reveal").value = 50;
    $("#opacity").value = 100;
    updateReveal();
    $("#then-image").src = p.image;
    $("#then-image").onerror = () =>
      status("NYPL image unavailable. Use the original record link below.");
    $("#comparison-title").textContent = p.title;
    $("#then-date").textContent = p.year || "Undated";
    $("#then-credit").href = p.nypl;
    $("#now-info").textContent = "";
    $("#align-btn").disabled = true;
    $("#save-pair").disabled = true;
    $("#prev-now").disabled = $("#next-now").disabled = true;
    if (!dialog.open) dialog.showModal();
    await configReady;
    if (!dialog.open || pendingPhoto !== p) return;
    if (!(token || configToken)) {
      status(
        "A free Mapillary client token is needed to compare this view. Open Token settings to connect.",
      );
      return;
    }
    status("Finding street views within 50 metres…");
    controller = new AbortController();
    const current = ++request;
    try {
      if (saved) {
        const im = await freshImage(
          saved.mapillaryId,
          token || configToken,
          controller.signal,
        );
        if (current !== request) return;
        images = [im];
      } else {
        const result = await nearbyImages(
          p,
          token || configToken,
          controller.signal,
        );
        if (current !== request) return;
        images = result.images;
        index = images.indexOf(result.nearest);
      }
      if (!images.length) {
        status(
          "No Mapillary imagery found within 50 metres. Try another photograph nearby.",
        );
        return;
      }
      await showImage(Math.max(0, index));
    } catch (e) {
      if (e.name !== "AbortError" && current === request) status(e.message);
    }
  }
  return {
    open,
    dialog,
    getPair: () => ({ photo, image: images[index] }),
    setToken: (v) => {
      token = v;
      if (dialog.open && pendingPhoto) open(pendingPhoto, pendingSaved);
    },
    status,
  };
}
