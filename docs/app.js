"use strict";
const $ = (selector) => document.querySelector(selector);
const assetBase = new URL(
  "assets/",
  document.querySelector('script[src*="app.js"]').src,
).href;
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const formatDate = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
const daysTravelling = (stone) =>
  Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(stone.started + "T00:00:00Z")) / 86400000,
    ),
  );
function identifyDevice(n) {
  const ua = n.userAgent || "";
  const ipad =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
  const tablet =
    ipad ||
    /Tablet|PlayBook|Silk/.test(ua) ||
    (/Android/.test(ua) && !/Mobile/.test(ua));
  const mobile =
    /Mobi|iPhone|iPod/.test(ua) || n.userAgentData?.mobile === true;
  return {
    type: tablet ? "Tablet" : mobile ? "Mobile" : "Desktop",
    os: ipad
      ? "iPadOS"
      : /iPhone|iPod/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Windows/.test(ua)
            ? "Windows"
            : /Macintosh/.test(ua)
              ? "macOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown",
  };
}
function supportsPreciseLocation() {
  return ["Mobile", "Tablet"].includes(identifyDevice(navigator).type);
}
function validCoordinates(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}
function formatPlace(properties, accuracy) {
  if (!properties) return "";
  const street =
    accuracy <= 150
      ? properties.street ||
        (properties.type === "street" ? properties.name : "")
      : "";
  return [
    ...new Set(
      [
        street,
        properties.locality,
        properties.district,
        properties.city || properties.county,
        properties.country,
      ]
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => value.trim()),
    ),
  ].join(", ");
}
// This repository is the only persistence boundary. It intentionally performs
// no server writes, and opening a stone only calls read methods.
const stoneRepository = (() => {
  const key = "livingstones.demo.finds.v1";
  let additions = {};
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    for (const stone of DEMO_STONES) {
      if (!Array.isArray(stored?.[stone.id])) continue;
      additions[stone.id] = stored[stone.id]
        .filter(
          (find) =>
            find &&
            validCoordinates(find.lat, find.lon) &&
            typeof find.city === "string" &&
            typeof find.country === "string" &&
            typeof find.nickname === "string" &&
            typeof find.message === "string" &&
            Number.isFinite(Date.parse(find.date)) &&
            Date.parse(find.date) >= Date.parse(stone.started) &&
            Date.parse(find.date) <= Date.now() &&
            ["gps", "demo"].includes(find.source),
        )
        .slice(-100)
        .map((find) => ({
          ...find,
          city: find.city.slice(0, 120),
          country: find.country.slice(0, 80),
          nickname: find.nickname.slice(0, 40),
          message: find.message.slice(0, 400),
          local: true,
        }));
    }
  } catch {
    /* Unavailable or damaged storage: keep the prototype in memory. */
  }
  const get = (id) => {
    const base = DEMO_STONES.find((stone) => stone.id === id);
    return base
      ? {
          ...base,
          finds: [...base.finds, ...(additions[id] || [])].sort(
            (a, b) => Date.parse(a.date) - Date.parse(b.date),
          ),
        }
      : null;
  };
  return {
    get,
    list: () => DEMO_STONES.map((stone) => get(stone.id)),
    addFind(id, find) {
      if (!get(id) || !validCoordinates(find.lat, find.lon))
        throw new Error("Invalid find");
      additions[id] = [
        ...(additions[id] || []),
        { ...find, local: true },
      ].slice(-100);
      try {
        localStorage.setItem(key, JSON.stringify(additions));
        return true;
      } catch {
        return false;
      }
    },
  };
})();
let selectedId = null;
let flow = null;
let returnFocus = null;
let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
function renderOverview() {
  const stones = stoneRepository.list();
  $("#stone-grid").innerHTML = stones
    .map((stone) => {
      const last = stone.finds.at(-1);
      return `<a class="stone-card" href="?stone=${stone.id}" data-stone="${stone.id}" aria-label="Explore ${stone.name}, ${stone.finds.length} finds, last seen in ${escapeHTML(last.city)}"><div class="stone-image theme-${stone.theme}"><span class="stone-id">${stone.id} · EXPLORER</span><img src="${assetBase}${stone.image}" alt="Painted stone: ${stone.name}" loading="lazy"></div><div class="stone-content"><h3>${stone.name}</h3><p class="stone-tagline">${stone.tagline}</p><div class="stone-metrics"><span><b>${daysTravelling(stone)}</b> days out</span><span><b>${stone.finds.length}</b> finds</span></div><div class="stone-location"><strong>⌁ ${escapeHTML(last.city)}, ${escapeHTML(last.country)}</strong><small>Last seen ${formatDate(last.date)}</small></div><div class="card-bottom">Explore the story <span class="card-arrow" aria-hidden="true">↗</span></div></div></a>`;
    })
    .join("");
  $("#total-finds").textContent = stones.reduce(
    (sum, stone) => sum + stone.finds.length,
    0,
  );
  $("#total-countries").textContent = new Set(
    stones.flatMap((stone) => stone.finds.map((find) => find.country)),
  ).size;
  renderMap($("#world-map"), stones);
  $("#map-legend").innerHTML = stones
    .map(
      (stone) =>
        `<button data-stone="${stone.id}" style="--stone-color:${stone.color}"><span class="color-dot"></span>${stone.name} <span aria-hidden="true">↗</span></button>`,
    )
    .join("");
}
const project = (find) => [(find.lon + 180) * 3, (90 - find.lat) * 3];
function renderMap(container, stones, journey = false) {
  const points = journey
    ? stones[0].finds.map(project)
    : stones.map((stone) => project(stone.finds.at(-1)));
  let box = [0, 30, 1080, 450];
  if (journey) {
    const xs = points.map((point) => point[0]),
      ys = points.map((point) => point[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const width = Math.max(
      120,
      Math.max(...xs) - Math.min(...xs) + 65,
      (Math.max(...ys) - Math.min(...ys) + 50) * 2.1,
    );
    const height = width / 2.1;
    box = [
      Math.max(0, Math.min(1080 - width, cx - width / 2)),
      Math.max(0, cy - height / 2),
      width,
      height,
    ];
  }
  const scale = box[2] / 1080,
    r = journey ? Math.max(2.3, scale * 9) : 10;
  const route = journey
    ? `<polyline points="${points.map((point) => point.join(",")).join(" ")}" fill="none" stroke="${stones[0].color}" stroke-width="${Math.max(0.7, scale * 2)}" stroke-dasharray="${scale * 6} ${scale * 5}" stroke-linecap="round"/>`
    : "";
  const markers = points
    .map((point, i) => {
      const stone = journey ? stones[0] : stones[i],
        find = journey ? stone.finds[i] : stone.finds.at(-1);
      const title = escapeHTML(
        `${journey ? `${i + 1}. ` : stone.name + ": "}${find.city}, ${find.country} · ${formatDate(find.date)}`,
      );
      const labelY = stone.id === "B2" ? point[1] - 42 : point[1] + 19;
      const marker = `<title>${title}</title><circle cx="${point[0]}" cy="${point[1]}" r="${r * 1.8}" fill="${stone.color}" opacity=".18"/><circle cx="${point[0]}" cy="${point[1]}" r="${r}" fill="${stone.color}" stroke="#fffefa" stroke-width="${Math.max(0.7, scale * 2.5)}"/>${journey ? `<text x="${point[0]}" y="${point[1] + r * 0.34}" text-anchor="middle" font-family="sans-serif" font-size="${r * 1.05}" fill="#fff" font-weight="700">${i + 1}</text>` : `<rect x="${point[0] - 46}" y="${labelY}" width="92" height="23" rx="11.5" fill="#fffefa" fill-opacity=".95"/><text x="${point[0]}" y="${labelY + 15}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#414738">${escapeHTML(find.city)}</text>`}`;
      return journey
        ? `<g role="img" aria-label="${title}">${marker}</g>`
        : `<a class="map-marker" href="?stone=${stone.id}" data-stone="${stone.id}" aria-label="${title}">${marker}</a>`;
    })
    .join("");
  container.innerHTML = `<svg viewBox="${box.join(" ")}" role="${journey ? "img" : "group"}" aria-label="${journey ? `Journey map of ${stones[0].name}, with ${points.length} numbered finds matching the timeline` : "World map showing the last known locations of all five stones"}"><rect width="1080" height="540" fill="#e9ece3"/><image href="${assetBase}world.svg" width="1080" height="540"/>${route}${markers}</svg><div class="map-controls" aria-label="Map controls"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset" aria-label="Reset map">⤢</button></div><span class="map-caption">${journey ? "↗ Each numbered stop is a chapter below" : "✳ Little adventures are happening everywhere"}</span><a class="map-attribution" href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Map data: Natural Earth</a>`;
  let current = [...box];
  container.querySelectorAll("[data-zoom]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.zoom === "reset") current = [...box];
      else {
        const factor = button.dataset.zoom === "in" ? 0.75 : 1.333333;
        const width = Math.max(box[2] / 8, Math.min(1080, current[2] * factor));
        const height = (width * box[3]) / box[2];
        current = [
          current[0] + (current[2] - width) / 2,
          current[1] + (current[3] - height) / 2,
          width,
          height,
        ];
      }
      container.querySelector("svg").setAttribute("viewBox", current.join(" "));
    }),
  );
}
function timelineHTML(stone) {
  return stone.finds
    .map(
      (find, index) =>
        `<li><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-meta"><h4>${index + 1}. ${escapeHTML(find.city)}, ${escapeHTML(find.country)}</h4><time datetime="${escapeHTML(find.date)}">${formatDate(find.date)}</time></div><p class="finder">${index === 0 ? "Journey started with" : "Found by"} ${escapeHTML(find.nickname || "A kind stranger")}${find.local ? `<span class="local-badge">${find.source === "demo" ? "Your demo find" : "Your local find"}</span>` : ""}</p>${find.accuracy != null ? `<p class="finder">GPS accuracy: approximately ${Math.round(find.accuracy)} m</p>` : ""}${find.message ? `<blockquote>“${escapeHTML(find.message)}”</blockquote>` : ""}</li>`,
    )
    .join("");
}
function renderDetail() {
  const stone = stoneRepository.get(selectedId);
  if (!stone) return;
  const last = stone.finds.at(-1);
  $("#stone-detail").innerHTML =
    `<div class="detail-topbar"><span class="eyebrow"><span class="color-dot" style="--stone-color:${stone.color}"></span> A LITTLE STONE. AN ONGOING STORY.</span><button class="icon-button" id="close-detail" aria-label="Close stone detail">×</button></div><div class="detail-body"><div class="detail-hero"><div class="detail-image theme-${stone.theme}"><span class="stone-id">${stone.id} · EXPLORER</span><img src="${assetBase}${stone.image}" alt="${stone.name}, a hand-painted ${stone.theme} stone"></div><div><span class="eyebrow">ON THE MOVE SINCE ${formatDate(stone.started).toUpperCase()}</span><h2 id="detail-title">${stone.name}</h2><p class="tagline">${stone.tagline}</p><p class="detail-story">${stone.story}</p><div class="detail-stats"><div><strong>${daysTravelling(stone)}</strong><span>days travelling</span></div><div><strong>${stone.finds.length}</strong><span>confirmed finds</span></div><div><strong>${new Set(stone.finds.map((find) => find.country)).size}</strong><span>countries visited</span></div></div><div class="detail-actions">${supportsPreciseLocation() ? '<button class="button primary" id="start-find">I found this stone <span aria-hidden="true">↗</span></button>' : ""}<button class="button secondary" id="share-stone">Share this story <span aria-hidden="true">↗</span></button></div>${supportsPreciseLocation() ? "" : '<p class="desktop-note">Found this stone? Open this link on your phone or tablet to add your chapter.</p>'}<div id="share-fallback" class="share-fallback" hidden></div></div></div><div id="find-container"></div><section class="detail-section" aria-labelledby="journey-title"><h3 id="journey-title">A small stone, a world of adventures.</h3><p class="section-subtitle">Last seen in ${escapeHTML(last.city)}, ${escapeHTML(last.country)} · ${formatDate(last.date)}</p><div id="journey-map" class="map-panel journey-map"></div></section><section class="detail-section" aria-labelledby="timeline-title"><h3 id="timeline-title">Every find, a new chapter.</h3><p class="section-subtitle">The story so far, from the very first hello to the latest little adventure.</p><ol class="timeline">${timelineHTML(stone)}</ol></section><p class="detail-footnote">Fictional demo journey. Opening or sharing this story never adds a find. Your additions stay in this browser; they are not shared with other people.</p></div>`;
  renderMap($("#journey-map"), [stone], true);
  $("#close-detail").addEventListener("click", closeDetail);
  $("#share-stone").addEventListener("click", shareStone);
  $("#start-find")?.addEventListener("click", () => {
    if (!supportsPreciseLocation()) return;
    flow = {
      id: stone.id,
      step: 1,
      place: null,
      nickname: "",
      message: "",
      code: "",
      busy: false,
    };
    renderFlow();
    $("#find-container").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#find-code").focus({ preventScroll: true });
  });
}
function openStone(id, updateURL = true) {
  if (!stoneRepository.get(id)) return;
  const dialog = $("#stone-dialog");
  if (!dialog.open) returnFocus = document.activeElement;
  selectedId = id;
  flow = null;
  renderDetail();
  if (updateURL && new URL(location.href).searchParams.get("stone") !== id) {
    const url = new URL(location.href);
    url.searchParams.set("stone", id);
    history.pushState({ livingstonesDetail: true }, "", url);
  }
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $("#close-detail").focus({ preventScroll: true });
}
function closeDetail() {
  if (history.state?.livingstonesDetail) history.back();
  else {
    const url = new URL(location.href);
    url.searchParams.delete("stone");
    history.replaceState(null, "", url);
    syncURL();
  }
}
function syncURL() {
  const id = new URL(location.href).searchParams.get("stone");
  if (stoneRepository.get(id)) openStone(id, false);
  else {
    selectedId = null;
    flow = null;
    $("#stone-dialog").close();
    const focusTarget = returnFocus?.isConnected
      ? returnFocus
      : document.querySelector(
          `.stone-card[data-stone="${returnFocus?.dataset?.stone || ""}"]`,
        );
    focusTarget?.focus({ preventScroll: true });
    if (id)
      toast("That stone is not in this demo. Meet one of our five explorers.");
  }
}
async function shareStone() {
  const url = new URL(location.href);
  url.searchParams.set("stone", selectedId);
  if (navigator.share && supportsPreciseLocation()) {
    try {
      await navigator.share({
        title: `${stoneRepository.get(selectedId).name} · Living Stones`,
        text: "A little stone with a big story.",
        url: url.href,
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Story link copied. A little adventure, ready to share.");
  } catch {
    const target = $("#share-fallback");
    target.hidden = false;
    target.innerHTML = `<label class="field">Copy this story link<input readonly value="${escapeHTML(url.href)}" aria-label="Story link"></label>`;
    target.querySelector("input").select();
  }
}
function renderFlow() {
  const target = $("#find-container");
  if (!flow) {
    target.replaceChildren();
    return;
  }
  const stone = stoneRepository.get(flow.id);
  if (flow.step === 4) {
    target.innerHTML = `<section class="find-panel success-panel" aria-labelledby="success-title"><span class="success-icon" aria-hidden="true">✓</span><h3 id="success-title" tabindex="-1">You’re part of the story.</h3><p>Your ${flow.place.source === "demo" ? "demo " : ""}find in ${escapeHTML(flow.place.city)} is now a new chapter in ${stone.name}’s journey.<br>${flow.persisted ? "Saved in this browser." : "Saved for this visit only; browser storage is unavailable."} Thanks for passing a little kindness on.</p><button class="button primary" id="finish-find">See your chapter <span aria-hidden="true">↓</span></button></section>`;
    $("#finish-find").addEventListener("click", () => {
      flow = null;
      renderFlow();
      const chapter = $(".timeline li:last-child");
      chapter.scrollIntoView({ behavior: "smooth", block: "center" });
      chapter.setAttribute("tabindex", "-1");
      chapter.focus({ preventScroll: true });
    });
    return;
  }
  const steps = `<div class="find-steps" aria-label="Find progress">${["The Find Code", "Your location", "Your moment"].map((title, i) => `<span class="${flow.step === i + 1 ? "active" : flow.step > i + 1 ? "done" : ""}" ${flow.step === i + 1 ? 'aria-current="step"' : ""}>${i + 1}. ${title}</span>`).join("")}</div>`;
  let content = "";
  if (flow.step === 1)
    content = `<label class="field" for="find-code">Find Code<input id="find-code" name="code" required maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="The code on the stone" value="${escapeHTML(flow.code)}" aria-describedby="code-hint find-error"></label><p class="field-hint" id="code-hint">Look for the Find Code painted on the back. Trying the prototype? Use <strong>${stone.code}</strong>.</p><div class="form-actions"><button class="button primary" type="submit">Continue <span aria-hidden="true">→</span></button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  if (flow.step === 2)
    content = `<p class="location-consent">Use your device location, or choose a demo city to try the experience. GPS needs your permission. Coordinates are sent to Photon to look up the area name.</p><button class="button secondary" id="use-gps" type="button">⌖ Use my location</button><p class="location-status ${flow.place ? "ready" : ""}" id="location-status" role="status">${flow.place ? placeLabel(flow.place) : "No location selected yet."}</p><p class="location-separator">OR TRY A FICTIONAL LOCATION</p><label class="field" for="demo-city">Demo city<select id="demo-city"><option value="">Choose a city…</option>${DEMO_PLACES.map((place, index) => `<option value="${index}" ${flow.place?.source === "demo" && flow.place.city === place.city ? "selected" : ""}>${place.city}, ${place.country}</option>`).join("")}</select></label><p class="field-hint">Demo locations are clearly marked in the timeline.</p><div class="form-actions"><button class="button primary" id="location-next" type="submit" ${flow.place ? "" : "disabled"}>Continue <span aria-hidden="true">→</span></button><button class="button secondary" id="flow-back" type="button">Back</button><button class="button secondary" id="cancel-find" type="button">Cancel</button></div>`;
  if (flow.step === 3)
    content = `<div class="review-location">⌖ ${escapeHTML(flow.place.city)}, ${escapeHTML(flow.place.country)}${flow.place.source === "demo" ? " · Demo location" : ""}</div><label class="field" for="nickname">Your nickname <small>optional</small><input id="nickname" name="nickname" maxlength="40" autocomplete="nickname" placeholder="A kind stranger" value="${escapeHTML(flow.nickname)}"></label><label class="field" for="find-message">Leave a little message <small>optional</small><textarea id="find-message" name="message" maxlength="400" placeholder="Where did you find it? How did it make you feel?">${escapeHTML(flow.message)}</textarea></label><p class="field-hint">This is a prototype. Your find is saved only in this browser.</p><div class="form-actions"><button class="button primary" type="submit">Add my chapter <span aria-hidden="true">↗</span></button><button class="button secondary" type="button" id="flow-back">Back</button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  target.innerHTML = `<section class="find-panel" aria-labelledby="find-title"><h3 id="find-title" tabindex="-1">A new chapter starts with you.</h3><p>Only submit a find when you have the stone. Browsing its story never records a find.</p>${steps}<form id="find-form">${content}<p id="find-error" class="error" role="alert"></p></form></section>`;
  $("#cancel-find").addEventListener("click", () => {
    flow = null;
    renderFlow();
    $("#start-find").focus();
  });
  $("#flow-back")?.addEventListener("click", () => {
    saveDraft();
    flow.step--;
    flow.busy = false;
    renderFlow();
    $("#find-title").focus({ preventScroll: true });
  });
  $("#find-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!flow || flow.busy || !supportsPreciseLocation()) return;
    if (flow.step === 1) {
      flow.code = $("#find-code").value.trim().toUpperCase();
      if (flow.code !== stone.code) {
        $("#find-error").textContent =
          "That code doesn’t match this stone. Check the back, or use the demo code above.";
        $("#find-code").setAttribute("aria-invalid", "true");
        $("#find-code").focus();
        return;
      }
      flow.step = 2;
      renderFlow();
    } else if (flow.step === 2) {
      if (!flow.place) return;
      flow.step = 3;
      renderFlow();
    } else if (flow.step === 3) {
      saveDraft();
      flow.busy = true;
      flow.persisted = stoneRepository.addFind(flow.id, {
        ...flow.place,
        date: new Date().toISOString(),
        nickname: flow.nickname.trim() || "A kind stranger",
        message: flow.message.trim(),
      });
      flow.step = 4;
      renderOverview();
      renderDetail();
      renderFlow();
      $("#success-title").focus({ preventScroll: true });
      $("#find-container").scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    $("#find-title").focus({ preventScroll: true });
  });
  $("#demo-city")?.addEventListener("change", (event) => {
    const index = event.target.value;
    flow.place =
      index === "" ? null : { ...DEMO_PLACES[Number(index)], source: "demo" };
    $("#location-status").textContent = flow.place
      ? placeLabel(flow.place)
      : "No location selected yet.";
    $("#location-status").classList.toggle("ready", Boolean(flow.place));
    $("#location-next").disabled = !flow.place;
  });
  $("#use-gps")?.addEventListener("click", requestLocation);
}
function saveDraft() {
  if (flow?.step === 3) {
    flow.nickname = $("#nickname").value.slice(0, 40);
    flow.message = $("#find-message").value.slice(0, 400);
  }
}
function placeLabel(place) {
  return `${place.source === "demo" ? "Demo location" : "Device location"}: ${place.city}, ${place.country}${place.accuracy != null ? ` · accuracy ~${Math.round(place.accuracy)} m` : ""}`;
}
const placeCache = new Map();
async function lookupPlace(coords) {
  const key = `${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
  if (placeCache.has(key)) return placeCache.get(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://photon.komoot.io/reverse?lat=${coords.latitude}&lon=${coords.longitude}&radius=1&limit=1`,
      {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok) throw new Error("lookup");
    const data = await response.json();
    const properties = data?.features?.[0]?.properties;
    if (!properties) throw new Error("empty");
    const result = {
      city:
        properties.city ||
        properties.town ||
        properties.village ||
        properties.county ||
        `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
      country: properties.country || "GPS location",
      area: formatPlace(properties, coords.accuracy),
    };
    placeCache.set(key, result);
    return result;
  } catch {
    return {
      city: `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
      country: "GPS location",
    };
  } finally {
    clearTimeout(timeout);
  }
}
function requestLocation() {
  if (!flow || flow.busy || !supportsPreciseLocation()) return;
  const activeFlow = flow,
    button = $("#use-gps"),
    status = $("#location-status");
  const current = () =>
    flow === activeFlow && flow.step === 2 && $("#use-gps") === button;
  if (!navigator.geolocation) {
    status.textContent =
      "GPS is unavailable in this browser. Choose a demo city to continue.";
    return;
  }
  activeFlow.busy = true;
  button.disabled = true;
  $("#location-next").disabled = true;
  $("#demo-city").disabled = true;
  status.textContent = "Waiting for permission and your location…";
  const unlock = () => {
    activeFlow.busy = false;
    if (current()) {
      button.disabled = false;
      $("#location-next").disabled = !flow.place;
      $("#demo-city").disabled = false;
    }
  };
  const fail = (error) => {
    if (!current()) return;
    status.textContent =
      {
        1: "Location permission was denied. You can enable it in browser settings, or choose a demo city.",
        2: "Your location is unavailable. Try again or choose a demo city.",
        3: "Location took too long. Try again or choose a demo city.",
      }[error.code] ||
      "Could not get your location. Choose a demo city to continue.";
    unlock();
  };
  try {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!current()) return;
        const coords = position.coords;
        if (
          !validCoordinates(coords.latitude, coords.longitude) ||
          !Number.isFinite(coords.accuracy) ||
          coords.accuracy < 0
        ) {
          fail({ code: 2 });
          return;
        }
        status.textContent = "Location found. Looking up the area name…";
        const place = await lookupPlace(coords);
        if (!current()) return;
        flow.place = {
          ...place,
          lat: coords.latitude,
          lon: coords.longitude,
          accuracy: coords.accuracy,
          source: "gps",
        };
        $("#demo-city").value = "";
        status.textContent = placeLabel(flow.place);
        status.classList.add("ready");
        unlock();
      },
      fail,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  } catch {
    fail({});
  }
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-stone]");
  if (
    !link ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  event.preventDefault();
  openStone(link.dataset.stone);
});
$("#stone-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDetail();
});
$("#stone-dialog").addEventListener("click", (event) => {
  if (event.target !== $("#stone-dialog")) return;
  const rect = event.target.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeDetail();
});
window.addEventListener("popstate", syncURL);
renderOverview();
syncURL();
