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
// The feed header already shows the city and country; keep stored addresses intact.
function storyAddress(entry) {
  if (!entry.address) {
    return `Address unavailable — ${entry.lat.toFixed(5)}, ${entry.lon.toFixed(5)}`;
  }
  const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const headerParts = new Set([entry.city, entry.country].filter(Boolean).map(normalize));
  return entry.address
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !headerParts.has(normalize(part)))
    .join(", ") || "Exact address unavailable";
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
// Calendar days in UTC match the dates shown in the journey table.
function findRecency(value, now = Date.now()) {
  const days = Math.max(
    0,
    Math.floor(now / 86400000) - Math.floor(Date.parse(value) / 86400000),
  );
  return {
    days,
    label:
      days === 0 ? "(today)" : `(${days} ${days === 1 ? "day" : "days"} ago)`,
    compact: days === 0 ? "(today)" : `(${days}d ago)`,
  };
}
// Keep route points chronological; only the visible story feed is newest first.
function storyEntries(stone) {
  return [
    ...stone.finds.map((find, index) => ({
      ...find,
      id: find.id || `${stone.id}-find-${index}`,
      type: "find",
    })),
    ...(stone.comments || [])
      .filter((comment) => !comment.findId)
      .map((comment) => ({ ...comment, type: "note" })),
  ].sort(
    (a, b) =>
      Date.parse(b.date) - Date.parse(a.date) ||
      String(b.id).localeCompare(String(a.id)),
  );
}
// This repository is the only data boundary. The API is the source of truth.
const stoneRepository = (() => {
  let stones = [];
  async function request(path, body, key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(LIVINGSTONES_API + path, {
        method: body ? "POST" : "GET",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: body
          ? {
              "Content-Type": "application/json",
              ...(key ? { "Idempotency-Key": key } : {}),
            }
          : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again.");
      return data;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError)
        throw new Error(
          "We couldn’t reach my story. Please try again — your form is still here.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function save(id, kind, body, key) {
    const result = await request(
      `/api/stones/${encodeURIComponent(id)}/${kind}`,
      body,
      key,
    );
    if (kind === "finds") {
      const find = result.stone.finds.find((f) => f.id === result.recordId);
      if (find) find.local = true;
    }
    stones = stones.map((s) => (s.id === id ? result.stone : s));
    return result;
  }
  return {
    get: (id) => stones.find((s) => s.id === id) || null,
    list: () => stones,
    async load() {
      stones = (await request("/api/stones")).stones;
    },
    verify: (id, code) =>
      request(`/api/stones/${encodeURIComponent(id)}/verify`, { code }),
    addFind: (id, body, key) => save(id, "finds", body, key),
    addComment: (id, body, key) => save(id, "comments", body, key),
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
        birth = stone.finds[0],
        lastComment = stone.comments?.at(-1) || last;
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
      const recency = findRecency(last.date);
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
      return `<tr class="stone-row" data-stone="${stone.id}"><td class="overview-stone"><a class="stone-link" href="?stone=${stone.id}" data-stone="${stone.id}" aria-label="Explore ${escapeHTML(stone.name)}, ${escapeHTML(fullBirth)}, ${stone.finds.length} finds, last seen in ${escapeHTML(fullPlace)}"><span class="stone-visual"><span class="stone-thumbnail theme-${stone.theme}"><img src="${escapeHTML(stoneImageURL(stone))}" alt="${escapeHTML(stone.imageAlt || "Painted stone: " + stone.name)}" loading="lazy"></span>${stone.demo ? '<span class="demo-badge">Demo</span>' : '<span class="demo-badge real-badge">Real</span>'}</span><span class="stone-identity"><strong>${escapeHTML(stone.name)}</strong><small class="stone-tagline">${escapeHTML(stone.tagline)}</small><small class="stone-born" title="${escapeHTML(fullBirth)}"><span class="born-full">${escapeHTML(fullBirth)}</span><span class="born-compact" aria-hidden="true">Born: ${compactBirth} · ${escapeHTML(countryCode)}</span></small></span></a></td><td class="overview-start" data-label="Born"><time datetime="${stone.started}">${formatDate(stone.started)}</time><small>${escapeHTML(birth.country)}</small></td><td class="overview-age" data-label="Age"><strong>${daysTravelling(stone)} <span class="age-unit">days</span></strong></td><td class="overview-finds" data-label="Finds"><strong>${stone.finds.length}</strong><small class="find-countries" title="${countries} ${countries === 1 ? "country" : "countries"}" aria-label="${countries} ${countries === 1 ? "country" : "countries"}"><span class="countries-compact" aria-hidden="true">${countries} <span class="country-globe">🌍</span></span></small></td><td class="overview-location" data-label="Last Found"><time datetime="${escapeHTML(last.date)}" title="${formatDate(last.date)}${lastTime ? " · " + lastTime : ""}"><span class="date-full">${formatDate(last.date)}${lastTime ? " · " + lastTime : ""}</span><span class="date-compact" aria-hidden="true">${shortDate}${lastTime ? " · " + lastTime : ""}</span></time><strong class="last-place" title="${escapeHTML(fullPlace)}"><span class="place-name">${escapeHTML(last.city)}</span>${flag}</strong><small class="last-ago" title="${recency.label}" aria-label="Last found ${recency.label}"><span class="ago-full">${recency.label}</span><span class="ago-compact" aria-hidden="true">${recency.compact}</span></small></td><td class="overview-latest" data-label="Last Comment"><small class="latest-note" title="${escapeHTML(lastComment.nickname + (lastComment.message ? ": “" + lastComment.message + "”" : ""))}">${escapeHTML(lastComment.nickname)}${lastComment.message ? ": “" + escapeHTML(lastComment.message) + "”" : ""}</small></td><td class="overview-arrow"><span aria-hidden="true">↗</span></td></tr>`;
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
  if (!stones.length && !previewPlace) {
    container.textContent = "Our first little adventures are on their way.";
    return;
  }
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
        ? `${index + 1}. ${find.city}, ${find.country}${find.local ? " · Your saved find" : ""}`
        : `${escapeHTML(stone.name)} · ${find.city}`;
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
        `<strong>${escapeHTML(journey || previewPlace ? find.city : stone.name)}</strong><br>${escapeHTML(find.address || find.city + ", " + find.country)}<br><span class="map-popup-note">${previewPlace ? "Location preview — not submitted" : formatDate(find.date)}${find.local ? " · Saved find" : ""}</span>${!journey && !previewPlace ? `<br><a class="map-popup-link" href="?stone=${stone.id}" data-stone="${stone.id}">Open stone story ↗</a>` : ""}`,
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
function countryFlagHTML(country) {
  const code = { Slovakia: "sk", Austria: "at", Hungary: "hu" }[country];
  return code
    ? `<img class="country-flag" src="${new URL(`flags/${code}.svg`, assetBase).href}" alt="${escapeHTML(country)}" width="15" height="10">`
    : "";
}
function formatMoment(value) {
  return (
    formatDate(value) +
    (value.includes("T")
      ? " · " +
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "")
  );
}
function historyHTML(stone) {
  return storyEntries(stone)
    .map((entry) => {
      const isFind = entry.type === "find";
      const address = isFind
        ? storyAddress(entry)
        : "No location shared with this note.";
      return `<article class="story-entry ${isFind ? "find-entry" : "note-entry"}${entry.local ? " new-find" : ""}" data-entry="${escapeHTML(entry.id)}">
      <header class="entry-header">
        <div class="entry-place">
          <div class="entry-meta"><time datetime="${escapeHTML(entry.date)}">${formatMoment(entry.date)}</time>${isFind ? `<span class="entry-location"><strong>${escapeHTML(entry.city)}</strong>${countryFlagHTML(entry.country)}</span>` : '<span class="entry-kind">A little note</span>'}</div>
          <p class="entry-address">${escapeHTML(address)}${isFind && entry.source === "gps" ? ` <span class="local-badge gps-badge">GPS find${entry.accuracy != null ? ` ~${Math.round(entry.accuracy)}m` : ""}</span>` : isFind && entry.source === "demo" ? ' <span class="local-badge demo-location-badge">Demo</span>' : ""}</p>
        </div>
        <div class="entry-author"><strong class="entry-finder">${escapeHTML(entry.nickname || "A kind stranger")}</strong></div>
      </header>
      ${entry.message ? `<p class="entry-message">“${escapeHTML(entry.message)}”</p>` : '<p class="entry-message no-message">A little hello, without a note this time.</p>'}
    </article>`;
    })
    .join("");
}
function renderDetail() {
  const stone = stoneRepository.get(selectedId);
  if (!stone) return;
  disposeMap("journey-map");
  disposeMap("location-preview");
  const last = stone.finds.at(-1),
    birth = stone.finds[0];
  const days = daysTravelling(stone),
    finds = stone.finds.length;
  const birthParts = (birth.address || "")
    .split(",")
    .map((part) => part.trim());
  const paintedPlace =
    stone.demo && birthParts.length > 2 && birthParts.at(-1) === birth.city
      ? birthParts.at(-2)
      : birth.city;
  const creator = stone.creator
    ? `${escapeHTML(stone.creator)} painted me`
    : "My story began";
  const shareIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
  $("#stone-detail").innerHTML = `
    <div class="detail-topbar"><h2 id="detail-title"><img class="detail-pebble" src="${escapeHTML(stoneImageURL(stone))}" alt="" width="36" height="36"><span class="detail-title-copy"><span>${escapeHTML(stone.name)}</span><small>Alive · ${days} ${days === 1 ? "day" : "days"}</small></span></h2><button class="icon-button" id="close-detail" aria-label="Close stone detail">×</button></div>
    <div class="detail-body">
      <section class="detail-intro" aria-labelledby="intro-title">
        <h3 id="intro-title" class="sr-only">Meet ${escapeHTML(stone.name)}</h3>
        <p class="detail-story">I’m a little painted stone called <strong>${escapeHTML(stone.name)}</strong>. ${creator} on <strong>${formatDate(stone.started)}</strong> in <span class="birth-place"><strong>${escapeHTML(paintedPlace)}, ${escapeHTML(birth.country)}</strong>${countryFlagHTML(birth.country)}</span>. Every person I meet brings me a little more to life. Take me on a trip, then leave me somewhere safe for my next friend. 😊</p>
        <p class="find-help">${supportsPreciseLocation() ? "Found me? Tap below to help my story grow." : "Found me? Open my link on your phone to help my story grow."}</p>
        <div class="detail-actions">${supportsPreciseLocation() ? '<button class="button primary" id="start-find">I found this stone</button>' : ""}<button class="button secondary" id="other-stones">Other stones ↗</button><button class="button secondary share-button" id="share-stone" aria-label="Share my story" title="Share my story">${shareIcon}</button></div>
        <div id="share-fallback" class="share-fallback" hidden></div>
      </section>
      <div id="find-container"></div>
      <section class="detail-journey" aria-labelledby="journey-title">
        <h3 id="journey-title" class="sr-only">${escapeHTML(stone.name)} journey map</h3>
        <p class="journey-explanation">Follow my journey. Each numbered stop is a little hello.</p>
        <div class="map-frame"><div id="journey-map" class="map-panel journey-map" role="region" aria-label="Interactive map of ${escapeHTML(stone.name)}’s finds"></div><button class="map-reset" data-reset-map="journey-map">Show whole journey ⤢</button></div>
        <div class="journey-caption"><span>Last seen: ${escapeHTML(last.city)} · ${formatDate(last.date)}</span><span class="journey-caption-end">${last.local ? '<span class="new-find-key">✦ Your new find · saved</span>' : ""}<span class="stone-views" title="Example count; view tracking is coming later" aria-label="Views: 524, example count">Views: <strong>524</strong></span></span></div>
        <div class="detail-stats" aria-label="My journey statistics"><span class="stat-alive"><strong>${days}</strong> Days alive</span><span class="stat-finds"><strong>${finds}</strong> Finds</span><span class="stat-countries"><strong>${new Set(stone.finds.map((find) => find.country)).size}</strong> Countries</span></div>
      </section>
      <section class="detail-section" aria-labelledby="history-title"><div class="detail-history-heading"><h3 id="history-title">The friends I’ve met.</h3>${supportsPreciseLocation() ? '<button class="button secondary note-button" id="start-comment">Leave a note</button>' : ""}</div><p class="section-subtitle">Every hello is part of my story.</p><div id="stone-notes" class="story-feed">${historyHTML(stone)}</div></section>
      <p class="detail-footnote">${stone.demo ? "Demo stone, real shared moments." : "A real stone, a growing story."} Looking never records a find.</p>
    </div>`;
  renderMap($("#journey-map"), [stone], true);
  $("#close-detail").addEventListener("click", closeDetail);
  $("#share-stone").addEventListener("click", shareStone);
  $("#other-stones").addEventListener("click", showOtherStones);
  $("#start-comment")?.addEventListener("click", () => startComment(stone));
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
      requestId: crypto.randomUUID(),
    };
    renderFlow();
    $("#find-container").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#find-code").focus({ preventScroll: true });
  });
}
function showOtherStones() {
  const show = () => {
    $("#explore").scrollIntoView({ behavior: "smooth", block: "start" });
    $(".stone-link")?.focus({ preventScroll: true });
  };
  if (history.state?.livingstonesDetail) {
    window.addEventListener("popstate", show, { once: true });
    closeDetail();
  } else {
    closeDetail();
    show();
  }
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
      toast(
        "That stone is not in our collection. Meet another little explorer.",
      );
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
    target.innerHTML = `<section class="find-panel success-panel" aria-labelledby="success-title"><span class="success-icon" aria-hidden="true">✓</span><h3 id="success-title" tabindex="-1">You’ve made my day.</h3><p>A new memory in ${escapeHTML(flow.place.city)} — thanks to you. Take me along, then leave me somewhere new for my next friend.<br>Your moment is saved in my story.</p><button class="button primary" id="finish-find">See our little moment <span aria-hidden="true">↓</span></button></section>`;
    $("#finish-find").addEventListener("click", () => {
      flow = null;
      renderFlow();
      const chapter = $(".find-entry.new-find") || $(".find-entry");
      chapter.scrollIntoView({ behavior: "smooth", block: "center" });
      chapter.setAttribute("tabindex", "-1");
      chapter.focus({ preventScroll: true });
    });
    return;
  }
  const steps = `<div class="find-steps" aria-label="Find progress">${["The Find Code", "Your location", "Your moment"].map((title, i) => `<span class="${flow.step === i + 1 ? "active" : flow.step > i + 1 ? "done" : ""}" ${flow.step === i + 1 ? 'aria-current="step"' : ""}>${i + 1}. ${title}</span>`).join("")}</div>`;
  let content = "";
  if (flow.step === 1)
    content = `<label class="field" for="find-code">Find Code<input id="find-code" name="code" required maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="The code on the stone" value="${escapeHTML(flow.code)}" aria-describedby="code-hint find-error"></label><p class="field-hint" id="code-hint">My code is on the back. ${stone.demo ? `Try <strong>${escapeHTML(stone.code)}</strong> for this demo stone.` : ""} Continue to request your phone’s location, or pick a demo place.</p><div class="form-actions"><button class="button primary" type="submit">Continue &amp; locate <span aria-hidden="true">→</span></button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  if (flow.step === 2)
    content = `<p class="location-consent">Your phone needs permission to find our meeting place. Coordinates go to Photon for the address. A demo place works too.</p><button class="button secondary" id="use-gps" type="button">⌖ Use my location</button><p class="location-status ${flow.place ? "ready" : ""}" id="location-status" role="status">${flow.place ? placeLabel(flow.place) : "No location selected yet."}</p><div class="map-frame location-preview-frame" id="location-preview-frame" ${flow.place ? "" : "hidden"}><div class="map-panel location-preview-map" id="location-preview" role="region" aria-label="Preview of your find location"></div></div><p class="location-separator">OR TRY A FICTIONAL LOCATION</p><label class="field" for="demo-city">Demo city<select id="demo-city"><option value="">Choose a city…</option>${DEMO_PLACES.map((place, index) => `<option value="${index}" ${flow.place?.source === "demo" && flow.place.city === place.city ? "selected" : ""}>${place.city}, ${place.country}</option>`).join("")}</select></label><p class="field-hint">Demo locations are clearly marked in the history.</p><div class="form-actions"><button class="button primary" id="location-next" type="submit" ${flow.place ? "" : "disabled"}>Continue <span aria-hidden="true">→</span></button><button class="button secondary" id="flow-back" type="button">Back</button><button class="button secondary" id="cancel-find" type="button">Cancel</button></div>`;
  if (flow.step === 3)
    content = `<div class="review-location">⌖ ${escapeHTML(flow.place.address || flow.place.city + ", " + flow.place.country)}${flow.place.source === "demo" ? " · Demo location" : ""}</div><label class="field" for="nickname">Your nickname <small>optional</small><input id="nickname" name="nickname" maxlength="40" autocomplete="nickname" placeholder="A kind stranger" value="${escapeHTML(flow.nickname)}"></label><label class="field" for="find-message">Leave a little message <small>optional</small><textarea id="find-message" name="message" maxlength="400" placeholder="Tell me about our little moment.">${escapeHTML(flow.message)}</textarea></label><p class="field-hint">Your find and note will become a public part of my story. Take me somewhere new for my next friend.</p><div class="form-actions"><button class="button primary" type="submit">Add my chapter <span aria-hidden="true">↗</span></button><button class="button secondary" type="button" id="flow-back">Back</button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  target.innerHTML = `<section class="find-panel" aria-labelledby="find-title"><h3 id="find-title" tabindex="-1">I’m glad you found me.</h3><p>Take me along, enjoy my company, then leave me safely in another town for my next friend.</p>${steps}<form id="find-form">${content}<p id="find-error" class="error" role="alert"></p></form></section>`;
  if (!stone.demo && flow.step === 2) {
    $("#demo-city").closest("label").hidden = true;
    $(".location-separator").hidden = true;
    $("#demo-city").disabled = true;
    $(".location-consent").textContent =
      "Allow your phone’s location so I can remember where we met. Coordinates go to Photon for the address.";
  }
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
  $("#find-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!flow || flow.busy || !supportsPreciseLocation()) return;
    if (flow.step === 1) {
      flow.code = $("#find-code").value.trim().toUpperCase();
      const activeFlow = flow;
      flow.busy = true;
      const submit = $("#find-form button[type=submit]");
      submit.disabled = true;
      try {
        await stoneRepository.verify(flow.id, flow.code);
      } catch (error) {
        if (flow !== activeFlow) return;
        flow.busy = false;
        submit.disabled = false;
        $("#find-error").textContent = error.message;
        $("#find-code").setAttribute("aria-invalid", "true");
        $("#find-code").focus();
        return;
      }
      if (flow !== activeFlow) return;
      flow.busy = false;
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
      const activeFlow = flow;
      // Keep the exact payload and key for retries after a lost response.
      const submission = {
        code: flow.code,
        place: { ...flow.place },
        nickname: flow.nickname.trim(),
        message: flow.message.trim(),
      };
      if (
        flow.submission &&
        JSON.stringify(flow.submission) !== JSON.stringify(submission)
      )
        flow.requestId = crypto.randomUUID();
      flow.submission = submission;
      $("#find-form")
        .querySelectorAll("button, input, textarea")
        .forEach((el) => (el.disabled = true));
      $("#find-error").textContent = "Saving our little moment…";
      try {
        await stoneRepository.addFind(flow.id, flow.submission, flow.requestId);
      } catch (error) {
        if (flow !== activeFlow) return;
        flow.busy = false;
        $("#find-form")
          .querySelectorAll("button, input, textarea")
          .forEach((el) => (el.disabled = false));
        $("#find-error").textContent = error.message;
        return;
      }
      if (flow !== activeFlow) {
        renderOverview();
        return;
      }
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
    status.textContent = stoneRepository.get(flow.id).demo
      ? "GPS is unavailable in this browser. Choose a demo city to continue."
      : "GPS is unavailable in this browser. Open my link in a browser with location support.";
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
      $("#demo-city").disabled = !stoneRepository.get(flow.id).demo;
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
    if (!stoneRepository.get(flow.id).demo)
      status.textContent =
        "We couldn’t get your location. Allow location in your browser settings and try again.";
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
async function boot() {
  const status = $("#data-status");
  status.hidden = false;
  status.textContent = "Our little stories are on their way…";
  try {
    await stoneRepository.load();
    renderOverview();
    syncURL();
    status.hidden = true;
  } catch (error) {
    status.innerHTML = `<span>${escapeHTML(error.message)}</span> <button class="button secondary" id="retry-load">Try again</button>`;
    $("#retry-load").addEventListener("click", boot);
  }
}
boot();

function startComment(stone) {
  if (!supportsPreciseLocation()) return;
  flow = null;
  disposeMap("location-preview");
  const target = $("#find-container");
  const state = { key: crypto.randomUUID(), payload: null, busy: false };
  target.innerHTML = `<section class="find-panel"><h3>A little hello makes my day.</h3><p>Take me on an adventure, then leave me somewhere safe for my next friend.</p><form id="comment-form"><label class="field">Find Code<input id="comment-code" required maxlength="32" autocomplete="off" autocapitalize="characters"></label>${stone.demo ? `<p class="field-hint">Demo code: <strong>${escapeHTML(stone.code)}</strong></p>` : ""}<label class="field">Your nickname <small>optional</small><input id="comment-nickname" maxlength="40" autocomplete="nickname"></label><label class="field">Your little note<textarea id="comment-message" required maxlength="400"></textarea></label><p class="field-hint">Your note is public. It won’t record a find or move my pin.</p><div class="form-actions"><button class="button primary" type="submit">Send my little note ↗</button><button class="button secondary" id="cancel-comment" type="button">Cancel</button></div><p id="comment-error" class="error" role="alert"></p></form></section>`;
  $("#cancel-comment").onclick = () => {
    target.replaceChildren();
    $("#start-comment").focus();
  };
  $("#comment-form").onsubmit = async (event) => {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const payload = {
      code: $("#comment-code").value.trim().toUpperCase(),
      nickname: $("#comment-nickname").value.trim(),
      message: $("#comment-message").value.trim(),
    };
    if (
      state.payload &&
      JSON.stringify(payload) !== JSON.stringify(state.payload)
    )
      state.key = crypto.randomUUID();
    state.payload = payload;
    state.busy = true;
    form
      .querySelectorAll("input,textarea,button")
      .forEach((el) => (el.disabled = true));
    $("#comment-error").textContent = "Saving your little note…";
    try {
      const saved = await stoneRepository.addComment(
        stone.id,
        payload,
        state.key,
      );
      renderOverview();
      if (selectedId === stone.id && $("#stone-dialog").open) {
        renderDetail();
        const note = $(
          `.note-entry[data-entry="${CSS.escape(saved.recordId)}"]`,
        );
        note.scrollIntoView({ behavior: "smooth", block: "center" });
        note.setAttribute("tabindex", "-1");
        note.focus({ preventScroll: true });
      }
      toast("Your little note is saved. Thank you for saying hello.");
    } catch (error) {
      state.busy = false;
      if (form.isConnected) {
        form
          .querySelectorAll("input,textarea,button")
          .forEach((el) => (el.disabled = false));
        $("#comment-error").textContent = error.message;
      }
    }
  };
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#comment-code").focus({ preventScroll: true });
}
