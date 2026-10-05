"use strict";
const $ = (selector) => document.querySelector(selector);
const assetBase = new URL(
  "assets/",
  document.querySelector('script[src*="app.js"]').src,
).href;
// Image paths can later be replaced by local JPGs or full photo URLs.
const stoneImageURL = (stone) => new URL(stone.image, assetBase).href;
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
        street
          ? [street, properties.housenumber].filter(Boolean).join(" ")
          : "",
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
// A stone stays alive for 90 days after its latest recorded encounter.
function journeyStatistics(stones, now = Date.now()) {
  const cutoff = now - 90 * 86400000;
  const finds = stones.flatMap((stone) => stone.finds);
  return {
    created: stones.length,
    alive: stones.filter((stone) => {
      const lastSeen = Date.parse(stone.finds.at(-1)?.date);
      return lastSeen >= cutoff && lastSeen <= now;
    }).length,
    finds: finds.length,
    countries: new Set(finds.map((find) => find.country).filter(Boolean)).size,
  };
}
// This repository is the only data boundary. New finds live in memory for
// this visit: no localStorage, database, or server writes.
const stoneRepository = (() => {
  const additions = {};
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
      additions[id] = [...(additions[id] || []), { ...find, local: true }];
    },
  };
})();
let selectedId = null;
let flow = null;
let returnFocus = null;
let toastTimer;
const mapInstances = new Map();
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
function disposeMap(id) {
  const instance = mapInstances.get(id);
  if (!instance) return;
  instance.observer?.disconnect();
  instance.map.remove();
  mapInstances.delete(id);
}
function renderOverview() {
  const stones = stoneRepository.list();
  $("#stone-rows").innerHTML = stones
    .map((stone) => {
      const last = stone.finds.at(-1),
        birth = stone.finds[0];
      const countries = new Set(stone.finds.map((find) => find.country)).size;
      const countryCode =
        { Slovakia: "SK", Austria: "AT", Hungary: "HU" }[birth.country] ||
        birth.country;
      const compactBirth = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(stone.started));
      const fullBirth = `Born: ${formatDate(stone.started)}, ${birth.country}`;
      const fullPlace = `${last.city}, ${last.country}`;
      const lastTime = last.date.includes("T")
        ? new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(last.date))
        : "";
      const shortDate = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: lastTime ? undefined : "2-digit",
        timeZone: "UTC",
      }).format(new Date(last.date));
      const flagCode = { Slovakia: "sk", Austria: "at", Hungary: "hu" }[
        last.country
      ];
      const flag = flagCode
        ? `<img class="country-flag" src="${new URL(`flags/${flagCode}.svg`, assetBase).href}" alt="${escapeHTML(last.country)}" width="15" height="10">`
        : "";
      return `<tr class="stone-row" data-stone="${stone.id}"><td class="overview-stone"><a class="stone-link" href="?stone=${stone.id}" data-stone="${stone.id}" aria-label="Explore ${stone.name}, ${fullBirth}, ${stone.finds.length} finds, last seen in ${escapeHTML(fullPlace)}"><span class="stone-visual"><span class="stone-thumbnail theme-${stone.theme}"><img src="${escapeHTML(stoneImageURL(stone))}" alt="${escapeHTML(stone.imageAlt || "Painted stone: " + stone.name)}" loading="lazy"></span>${stone.demo ? '<span class="demo-badge">Demo</span>' : ""}</span><span class="stone-identity"><strong>${stone.name}</strong><small class="stone-tagline">${stone.tagline}</small><small class="stone-born" title="${escapeHTML(fullBirth)}"><span class="born-full">${escapeHTML(fullBirth)}</span><span class="born-compact" aria-hidden="true">Born: ${compactBirth} · ${escapeHTML(countryCode)}</span></small></span></a></td><td class="overview-start" data-label="Born"><time datetime="${stone.started}">${formatDate(stone.started)}</time><small>${escapeHTML(birth.country)}</small></td><td class="overview-age" data-label="Age"><strong>${daysTravelling(stone)} <span class="age-unit">days</span></strong></td><td class="overview-finds" data-label="Finds"><strong>${stone.finds.length}</strong><small class="find-countries" title="${countries} ${countries === 1 ? "country" : "countries"}" aria-label="${countries} ${countries === 1 ? "country" : "countries"}"><span class="countries-full">${countries} ${countries === 1 ? "country" : "countries"}</span><span class="countries-compact" aria-hidden="true">${countries} <span class="country-globe">🌍</span></span></small></td><td class="overview-location" data-label="Last Found"><time datetime="${escapeHTML(last.date)}" title="${formatDate(last.date)}${lastTime ? " · " + lastTime : ""}"><span class="date-full">${formatDate(last.date)}${lastTime ? " · " + lastTime : ""}</span><span class="date-compact" aria-hidden="true">${shortDate}${lastTime ? " · " + lastTime : ""}</span></time><strong class="last-place" title="${escapeHTML(fullPlace)}"><span class="place-name">${escapeHTML(last.city)}</span>${flag}</strong></td><td class="overview-latest" data-label="Last Comment"><small class="latest-note" title="${escapeHTML(last.nickname + (last.message ? ": “" + last.message + "”" : ""))}">${escapeHTML(last.nickname)}${last.message ? ": “" + escapeHTML(last.message) + "”" : ""}</small></td><td class="overview-arrow"><span aria-hidden="true">↗</span></td></tr>`;
    })
    .join("");
  const stats = journeyStatistics(stones);
  $("#total-stones").textContent = stats.created;
  $("#total-active").textContent = stats.alive;
  $("#total-finds").textContent = stats.finds;
  $("#total-countries").textContent = stats.countries;
  $("#explore-title").innerHTML =
    `<span class="story-count">${stats.created}</span> ${stats.created === 1 ? "stone" : "stones"}. <span class="adventure-count">${stats.created}</span> little ${stats.created === 1 ? "adventure" : "adventures"}.`;
  $("#hello-count").textContent = stats.finds;
  $("#hello-label").textContent =
    stats.finds === 1 ? "little hello shared" : "little hellos shared";
  renderMap($("#world-map"), stones);
}

function renderMap(container, stones, journey = false, previewPlace = null) {
  disposeMap(container.id);
  container.replaceChildren();
  container.parentElement.querySelector(".map-notice")?.remove();
  const points = previewPlace
    ? [previewPlace]
    : journey
      ? stones[0].finds
      : stones.map((stone) => stone.finds.at(-1));
  const map = L.map(container, {
    scrollWheelZoom: false,
    minZoom: 2,
    maxZoom: 19,
    zoomSnap: 0.25,
    zoomControl: true,
    zoomAnimation: false,
    markerZoomAnimation: false,
    fadeAnimation: false,
  });
  map.setView([48.1486, 17.1077], 9);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  });
  const note = document.createElement("span");
  note.className = "map-notice";
  note.setAttribute("role", "status");
  note.hidden = true;
  note.textContent = "Map tiles unavailable. Location markers still work.";
  container.parentElement.append(note);
  let loaded = 0;
  tiles.on("tileload", () => {
    loaded++;
    note.hidden = true;
  });
  tiles.on("tileerror", () => {
    if (!loaded) note.hidden = false;
  });
  const coordinates = points.map((point) => [point.lat, point.lon]);
  const bounds = L.latLngBounds(coordinates);
  const fit = () =>
    previewPlace
      ? map.setView(coordinates[0], 16, { animate: false })
      : map.fitBounds(bounds, {
          padding: journey ? [38, 38] : [55, 55],
          maxZoom: journey ? 13 : 10,
          animate: false,
        });
  if (journey && !previewPlace)
    L.polyline(coordinates, {
      color: "#b49aff",
      weight: 3,
      opacity: 0.9,
      dashArray: "5 7",
    }).addTo(map);
  if (!journey && !previewPlace)
    L.circle([48.1486, 17.1077], {
      radius: 100000,
      color: "#94a3af",
      weight: 1,
      opacity: 0.25,
      fill: false,
      dashArray: "4 7",
      interactive: false,
    }).addTo(map);
  const symbols = { sun: "☀", moon: "☾", leaf: "♧", heart: "♡", wave: "≈" };
  const markers = points.map((find, index) => {
    const stone = journey || previewPlace ? stones[0] : stones[index];
    const latest = journey && index === points.length - 1;
    const local = find.local || Boolean(previewPlace);
    const color = local ? "#b49aff" : stone.color;
    const label = previewPlace
      ? "Your find location"
      : journey
        ? `${index + 1}. ${find.city}, ${find.country}${find.local ? " · Your preview find" : ""}`
        : `${stone.name} · ${find.city}`;
    const marker = L.marker([find.lat, find.lon], {
      title: label,
      alt: label,
      icon: L.divIcon({
        className: `stone-pin${local ? " is-new" : ""}`,
        html: `<span class="pin-core" style="--stone-color:${color}">${local ? "✦" : journey ? index + 1 : symbols[stone.theme]}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -12],
      }),
    })
      .bindPopup(
        `<strong>${escapeHTML(journey || previewPlace ? find.city : stone.name)}</strong><br>${escapeHTML(find.address || find.city + ", " + find.country)}<br><span class="map-popup-note">${previewPlace ? "Location preview — not submitted" : formatDate(find.date)}${find.local ? " · Preview for this visit" : ""}</span>${!journey && !previewPlace ? `<br><a class="map-popup-link" href="?stone=${stone.id}" data-stone="${stone.id}">Open stone story ↗</a>` : ""}`,
      )
      .addTo(map);
    marker.getElement().setAttribute("aria-label", label);
    if (!journey && !previewPlace) {
      marker.bindTooltip(escapeHTML(stone.name), {
        permanent: !supportsPreciseLocation(),
        direction: "top",
        offset: [0, -15],
        className: "stone-tooltip",
      });
      marker.on("click", () => openStone(stone.id));
    }
    if (latest && local)
      marker.bindTooltip("Your new find", {
        permanent: true,
        direction: "top",
        offset: [0, -18],
        className: "stone-tooltip",
      });
    return marker;
  });
  const precise =
    previewPlace || (journey && points.at(-1).local && points.at(-1));
  if (precise?.source === "gps" && Number.isFinite(precise.accuracy))
    L.circle([precise.lat, precise.lon], {
      radius: precise.accuracy,
      color: "#b49aff",
      fillOpacity: 0.08,
      weight: 1,
      interactive: false,
    }).addTo(map);
  fit();
  tiles.addTo(map);
  const observer = new ResizeObserver(() => {
    if (mapInstances.get(container.id)?.map === map)
      map.invalidateSize({ pan: false });
  });
  observer.observe(container);
  mapInstances.set(container.id, {
    map,
    bounds,
    fit,
    markers,
    tiles,
    observer,
  });
}
function historyHTML(stone) {
  return stone.finds
    .map(
      (find, index) =>
        `<tr class="${find.local ? "new-find" : ""}"><td class="find-number">${index + 1}</td><td class="find-date"><time datetime="${escapeHTML(find.date)}">${formatDate(find.date)}</time>${find.local ? `<br><span class="local-badge">${find.source === "demo" ? "Demo preview" : "GPS preview"}</span>` : ""}</td><td class="find-place"><strong>${escapeHTML(find.city)}, ${escapeHTML(find.country)}</strong><small>${escapeHTML(find.address || "Address unavailable — " + find.lat.toFixed(5) + ", " + find.lon.toFixed(5))}</small>${find.accuracy != null ? `<span class="accuracy-note">GPS accuracy ~${Math.round(find.accuracy)} m${find.accuracy > 150 ? " · approximate area" : ""}</span>` : ""}</td><td class="find-finder">${escapeHTML(find.nickname || "A kind stranger")}</td><td class="find-message">${find.message ? "“" + escapeHTML(find.message) + "”" : "—"}</td></tr>`,
    )
    .join("");
}
function renderDetail() {
  const stone = stoneRepository.get(selectedId);
  if (!stone) return;
  disposeMap("journey-map");
  disposeMap("location-preview");
  const last = stone.finds.at(-1),
    birth = stone.finds[0];
  $("#stone-detail").innerHTML =
    `<div class="detail-topbar"><h2 id="detail-title"><span class="color-dot" style="--stone-color:${stone.color}"></span>${stone.name}<small>${stone.id}</small></h2><button class="icon-button" id="close-detail" aria-label="Close stone detail">×</button></div><div class="detail-body"><section aria-labelledby="journey-title"><h3 id="journey-title" class="sr-only">${stone.name} journey map</h3><div class="map-frame"><div id="journey-map" class="map-panel journey-map" role="region" aria-label="Interactive map of ${stone.name}’s finds"></div><button class="map-reset" data-reset-map="journey-map">Show whole journey ⤢</button></div><div class="journey-caption"><span>Last seen: ${escapeHTML(last.city)} · ${formatDate(last.date)}</span><span>${last.local ? '<span class="new-find-key">✦ Your new find · preview</span>' : "Numbers follow the history below."}</span></div></section><div class="detail-summary"><div class="detail-image theme-${stone.theme}"><img src="${escapeHTML(stoneImageURL(stone))}" alt="${stone.name}, a painted ${stone.theme} stone"></div><div class="detail-copy"><h3>${stone.tagline}</h3><p class="detail-story">${stone.story}</p><p class="origin-note">My first home: ${escapeHTML(birth.city)} · ${escapeHTML(birth.address)} · ${formatDate(stone.started)}</p><div class="detail-stats"><span><strong>${daysTravelling(stone)}</strong> days travelling</span><span><strong>${stone.finds.length}</strong> finds</span><span><strong>${new Set(stone.finds.map((find) => find.country)).size}</strong> countries</span></div><div class="detail-actions">${supportsPreciseLocation() ? '<button class="button primary" id="start-find">I found this stone ↗</button>' : ""}<button class="button secondary" id="share-stone">Share my story ↗</button></div>${supportsPreciseLocation() ? "" : '<p class="desktop-note">Found me? Open my link on your phone to tell me where we met.</p>'}<div id="share-fallback" class="share-fallback" hidden></div></div></div><div id="find-container"></div><section class="detail-section" aria-labelledby="history-title"><h3 id="history-title">The friends I’ve met.</h3><p class="section-subtitle">Every hello is part of my story.</p><div class="table-scroll"><table class="find-history"><caption class="sr-only">Find history, including dates, addresses, finders and messages</caption><thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Location / address</th><th scope="col">Finder</th><th scope="col">Their note</th></tr></thead><tbody>${historyHTML(stone)}</tbody></table></div></section><p class="detail-footnote">Demo story. New finds disappear on refresh. Looking never records a find.</p></div>`;
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
  if (!dialog.open) dialog.showModal();
  renderDetail();
  if (updateURL && new URL(location.href).searchParams.get("stone") !== id) {
    const url = new URL(location.href);
    url.searchParams.set("stone", id);
    history.pushState({ livingstonesDetail: true }, "", url);
  }
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
    disposeMap("journey-map");
    disposeMap("location-preview");
    $("#stone-dialog").close();
    const focusTarget = returnFocus?.isConnected
      ? returnFocus
      : document.querySelector(
          `.stone-link[data-stone="${returnFocus?.dataset?.stone || ""}"]`,
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
    disposeMap("location-preview");
    target.replaceChildren();
    return;
  }
  disposeMap("location-preview");
  const stone = stoneRepository.get(flow.id);
  if (flow.step === 4) {
    target.innerHTML = `<section class="find-panel success-panel" aria-labelledby="success-title"><span class="success-icon" aria-hidden="true">✓</span><h3 id="success-title" tabindex="-1">You’ve made my day.</h3><p>A new memory in ${escapeHTML(flow.place.city)} — thanks to you. Take me along, then leave me somewhere new for my next friend.<br>Preview for this visit only; refreshing resets it.</p><button class="button primary" id="finish-find">See our little moment <span aria-hidden="true">↓</span></button></section>`;
    $("#finish-find").addEventListener("click", () => {
      flow = null;
      renderFlow();
      const chapter = $(".find-history tbody tr:last-child");
      chapter.scrollIntoView({ behavior: "smooth", block: "center" });
      chapter.setAttribute("tabindex", "-1");
      chapter.focus({ preventScroll: true });
    });
    return;
  }
  const steps = `<div class="find-steps" aria-label="Find progress">${["The Find Code", "Your location", "Your moment"].map((title, i) => `<span class="${flow.step === i + 1 ? "active" : flow.step > i + 1 ? "done" : ""}" ${flow.step === i + 1 ? 'aria-current="step"' : ""}>${i + 1}. ${title}</span>`).join("")}</div>`;
  let content = "";
  if (flow.step === 1)
    content = `<label class="field" for="find-code">Find Code<input id="find-code" name="code" required maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="The code on the stone" value="${escapeHTML(flow.code)}" aria-describedby="code-hint find-error"></label><p class="field-hint" id="code-hint">My code is on the back. Try <strong>${stone.code}</strong> in this demo. Continue to request your phone’s location, or pick a demo place.</p><div class="form-actions"><button class="button primary" type="submit">Continue &amp; locate <span aria-hidden="true">→</span></button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  if (flow.step === 2)
    content = `<p class="location-consent">Your phone needs permission to find our meeting place. Coordinates go to Photon for the address. A demo place works too.</p><button class="button secondary" id="use-gps" type="button">⌖ Use my location</button><p class="location-status ${flow.place ? "ready" : ""}" id="location-status" role="status">${flow.place ? placeLabel(flow.place) : "No location selected yet."}</p><div class="map-frame location-preview-frame" id="location-preview-frame" ${flow.place ? "" : "hidden"}><div class="map-panel location-preview-map" id="location-preview" role="region" aria-label="Preview of your find location"></div></div><p class="location-separator">OR TRY A FICTIONAL LOCATION</p><label class="field" for="demo-city">Demo city<select id="demo-city"><option value="">Choose a city…</option>${DEMO_PLACES.map((place, index) => `<option value="${index}" ${flow.place?.source === "demo" && flow.place.city === place.city ? "selected" : ""}>${place.city}, ${place.country}</option>`).join("")}</select></label><p class="field-hint">Demo locations are clearly marked in the history.</p><div class="form-actions"><button class="button primary" id="location-next" type="submit" ${flow.place ? "" : "disabled"}>Continue <span aria-hidden="true">→</span></button><button class="button secondary" id="flow-back" type="button">Back</button><button class="button secondary" id="cancel-find" type="button">Cancel</button></div>`;
  if (flow.step === 3)
    content = `<div class="review-location">⌖ ${escapeHTML(flow.place.address || flow.place.city + ", " + flow.place.country)}${flow.place.source === "demo" ? " · Demo location" : ""}</div><label class="field" for="nickname">Your nickname <small>optional</small><input id="nickname" name="nickname" maxlength="40" autocomplete="nickname" placeholder="A kind stranger" value="${escapeHTML(flow.nickname)}"></label><label class="field" for="find-message">Leave a little message <small>optional</small><textarea id="find-message" name="message" maxlength="400" placeholder="Tell me about our little moment.">${escapeHTML(flow.message)}</textarea></label><p class="field-hint">This is a prototype. Your find is a preview for this visit only. Refreshing resets it.</p><div class="form-actions"><button class="button primary" type="submit">Add my chapter <span aria-hidden="true">↗</span></button><button class="button secondary" type="button" id="flow-back">Back</button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  target.innerHTML = `<section class="find-panel" aria-labelledby="find-title"><h3 id="find-title" tabindex="-1">I’m glad you found me.</h3><p>Take me along, enjoy my company, then leave me safely in another town for my next friend.</p>${steps}<form id="find-form">${content}<p id="find-error" class="error" role="alert"></p></form></section>`;
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
      requestLocation();
    } else if (flow.step === 2) {
      if (!flow.place) return;
      flow.step = 3;
      renderFlow();
    } else if (flow.step === 3) {
      saveDraft();
      flow.busy = true;
      stoneRepository.addFind(flow.id, {
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
    renderLocationPreview();
  });
  $("#use-gps")?.addEventListener("click", requestLocation);
  if (flow.step === 2 && flow.place) renderLocationPreview();
}
function renderLocationPreview() {
  const frame = $("#location-preview-frame");
  if (!frame) return;
  frame.hidden = !flow?.place;
  if (!flow?.place) {
    disposeMap("location-preview");
    return;
  }
  renderMap(
    $("#location-preview"),
    [stoneRepository.get(flow.id)],
    false,
    flow.place,
  );
}
function saveDraft() {
  if (flow?.step === 3) {
    flow.nickname = $("#nickname").value.slice(0, 40);
    flow.message = $("#find-message").value.slice(0, 400);
  }
}
function placeLabel(place) {
  return `${place.source === "demo" ? "Demo location" : "Device location"}: ${place.address || place.city + ", " + place.country}${place.accuracy != null ? ` · accuracy ~${Math.round(place.accuracy)} m` : ""}`;
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
      address: formatPlace(properties, coords.accuracy),
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
        renderLocationPreview();
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
  const reset = event.target.closest("[data-reset-map]");
  if (reset) {
    mapInstances.get(reset.dataset.resetMap)?.fit();
    return;
  }
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
