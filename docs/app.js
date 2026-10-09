"use strict";
const $ = (selector) => document.querySelector(selector);
const assetBase = new URL(
  "assets/",
  document.querySelector('script[src*="app.js"]').src,
).href;
// Image paths can later be replaced by local JPGs or full photo URLs.
const stoneImageURL = (stone) => {
  const url = new URL(stone.image, assetBase);
  if (url.origin === new URL(assetBase).origin) url.searchParams.set("v", "60");
  return url.href;
};
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
// Sort a copy so table ordering never changes route or map marker ordering.
function sortStonesByLastFound(stones) {
  const latest = (stone) => {
    const date = Date.parse(stone.finds?.at(-1)?.date);
    return Number.isFinite(date) ? date : -Infinity;
  };
  return [...stones].sort((a, b) => latest(b) - latest(a) || a.id.localeCompare(b.id));
}
// Estimate travel as 1.5 times each straight-line leg, then sum the route.
function journeyDistance(stone) {
  const rad = (n) => n * Math.PI / 180;
  return stone.finds.reduce((total, point, index, points) => {
    const previous = points[index - 1];
    if (!previous || !validCoordinates(point.lat, point.lon) || !validCoordinates(previous.lat, previous.lon)) return total;
    const a = Math.sin(rad(point.lat - previous.lat) / 2) ** 2 +
      Math.cos(rad(previous.lat)) * Math.cos(rad(point.lat)) * Math.sin(rad(point.lon - previous.lon) / 2) ** 2;
    return total + 1.5 * 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }, 0);
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
      if (!response.ok) {
        const error = new Error(data.error || "Please try again.");
        error.status = response.status;
        throw error;
      }
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
    async loadStone(id) {
      const { stone } = await request(`/api/stones/${encodeURIComponent(id)}`);
      if (stone.initialized !== false && !stones.some(s => s.id === id)) stones.push(stone);
      return stone;
    },
    recordHomepage: () => request("/api/page-views", {viewId: crypto.randomUUID()}),
    async recordView(id) {
      const result = await request(`/api/stones/${encodeURIComponent(id)}/views`, {viewId: crypto.randomUUID()});
      const stone = stones.find(s => s.id === id);
      if (stone) stone.views = result.views;
      return result.views;
    },
    watch: (id, email) => request(`/api/stones/${encodeURIComponent(id)}/watchdog`, { email }),
    verify: (id, code) =>
      request(`/api/stones/${encodeURIComponent(id)}/verify`, { code }),
    addFind: (id, body, key) => save(id, "finds", body, key),
    addComment: (id, body, key) => save(id, "comments", body, key),
  };
})();
let selectedId = null;
let overviewVisible = false;
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
const collectionState = { view: "cards", sort: "recent", search: "", visibleRows: 3 };
function updateCardPagination() {
  const cards = [...document.querySelectorAll("#stone-cards .journey-card")];
  const isCards = collectionState.view === "cards";
  const columns = isCards ? getComputedStyle($("#stone-cards")).gridTemplateColumns.split(" ").length : 1;
  const shown = isCards ? Math.min(cards.length, columns * collectionState.visibleRows) : cards.length;
  cards.forEach((card, index) => { card.hidden = isCards && index >= shown; });
  $("#stone-pagination").hidden = false;
  $("#stone-count").textContent = `Showing ${shown} of ${cards.length} ${cards.length === 1 ? "stone" : "stones"}`;
  $("#show-more-stones").hidden = !isCards || shown >= cards.length;
}
function renderCollection() {
  const query = collectionState.search.trim().toLocaleLowerCase();
  const visible = stoneRepository.list().filter(stone => {
    const last = stone.finds.at(-1);
    return (!query || [stone.name, stone.id, last?.city, last?.country].some(value => String(value || "").toLocaleLowerCase().includes(query)));
  });
  const stones = collectionState.sort === "distance"
    ? [...visible].sort((a, b) => journeyDistance(b) - journeyDistance(a) || a.id.localeCompare(b.id))
    : collectionState.sort === "age"
      ? [...visible].sort((a, b) => Date.parse(a.started) - Date.parse(b.started) || a.id.localeCompare(b.id))
      : sortStonesByLastFound(visible);
  $("#stone-cards").innerHTML = stones.map(stone => {
    const last = stone.finds.at(-1);
    const recency = last ? findRecency(last.date) : null;
    const place = last ? `${last.city}, ${last.country}` : "Waiting for a first find";
    const id = escapeHTML(stone.id);
    return `<a class="journey-card" href="?stone=${encodeURIComponent(stone.id)}" data-stone="${id}" aria-label="Explore ${escapeHTML(stone.name)}" style="--stone-color:${escapeHTML(/^#[0-9a-f]{6}$/i.test(stone.color) ? stone.color : "#9290be")}">
      <span class="card-kind">${stone.demo ? "Demo" : "Real"}</span>
      <span class="card-age" aria-label="${daysTravelling(stone)} days alive"><span>Age</span><strong>${daysTravelling(stone)} d</strong></span>
      <span class="card-portrait"><img src="${escapeHTML(stoneImageURL(stone))}" alt="${escapeHTML(stone.imageAlt || "Painted stone: " + stone.name)}" width="340" height="280"><time class="card-born" datetime="${escapeHTML(stone.started)}" title="Born: ${formatDate(stone.started)}">${formatDate(stone.started)}</time></span>
      <h3>${escapeHTML(stone.name)}</h3>
      <dl class="card-facts"><div><dt>Distance</dt><dd><span aria-hidden="true">⌁</span> ${Math.round(journeyDistance(stone)).toLocaleString("en-GB")} km</dd></div><div><dt>Finds</dt><dd aria-label="${stone.finds.length} ${stone.finds.length === 1 ? "find" : "finds"}">${stone.finds.length}<span class="card-find-unit"> ${stone.finds.length === 1 ? "find" : "finds"}</span></dd></div></dl>
      <div class="card-location" title="${escapeHTML(place)}"><span>${last ? countryFlagHTML(last.country) : ""}<span class="card-city">${escapeHTML(last?.city || "Awaiting a find")}</span></span>${last ? `<time datetime="${escapeHTML(last.date)}" title="${formatDate(last.date)} ${recency.label}">${recency.days === 0 ? "Today" : `${recency.days}d ago`}</time>` : ""}</div>
    </a>`;
  }).join("");
  $("#stone-cards").hidden = collectionState.view !== "cards";
  $("#stone-list").hidden = collectionState.view !== "list" || !stones.length;
  $("#stone-empty").hidden = stones.length !== 0;
  updateCardPagination();
  document.querySelectorAll("[data-stone-sort]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.stoneSort === collectionState.sort)));
  document.querySelectorAll("[data-stone-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.stoneView === collectionState.view)));
  const heading = $('.stone-table th:nth-child(6)');
  const ageHeading = $('.stone-table th:nth-child(3)');
  if (collectionState.sort === "age") ageHeading.setAttribute("aria-sort", "descending");
  else ageHeading.removeAttribute("aria-sort");
  heading.setAttribute("aria-sort", collectionState.sort === "recent" ? "descending" : "none");
  heading.title = collectionState.sort === "recent" ? "Newest finds first" : collectionState.sort === "age" ? "Oldest stones first" : "Stones sorted by distance traveled";
  heading.querySelector(".sort-indicator").hidden = collectionState.sort !== "recent";
  $("#stone-rows").innerHTML = stones
    .map((stone) => {
      const last = stone.finds.at(-1),
        birth = stone.finds[0],
        lastComment = stone.comments?.at(-1) || last;
      const countries = new Set(stone.finds.map((find) => find.country)).size;
      const fullBirth = `Born: ${formatDate(stone.started)}, ${birth.country}`;
      const fullPlace = `${last.city}, ${last.country}`;
      const recency = findRecency(last.date);
      return `<tr class="stone-row" data-stone="${stone.id}">
        <td class="overview-stone"><a class="stone-link" href="?stone=${stone.id}" data-stone="${stone.id}" aria-label="Explore ${escapeHTML(stone.name)}, ${escapeHTML(fullBirth)}, ${stone.finds.length} finds, last seen in ${escapeHTML(fullPlace)}"><span class="stone-visual"><span class="stone-thumbnail theme-${stone.theme}"><img src="${escapeHTML(stoneImageURL(stone))}" alt="${escapeHTML(stone.imageAlt || "Painted stone: " + stone.name)}" loading="lazy"></span>${stone.demo ? '<span class="demo-badge">Demo</span>' : '<span class="demo-badge real-badge">Real</span>'}</span><span class="stone-identity"><strong>${escapeHTML(stone.name)}</strong><small class="stone-born" title="${escapeHTML(fullBirth)}" aria-label="${escapeHTML(fullBirth)}"><span class="born-full">${escapeHTML(fullBirth)}</span><span class="born-compact" aria-hidden="true">${formatDate(stone.started)}</span></small></span></a></td>
        <td class="overview-start" data-label="Born"><time datetime="${stone.started}">${formatDate(stone.started)}</time><small>${escapeHTML(birth.country)}</small></td>
        <td class="overview-age" data-label="Age (days)"><strong aria-label="${daysTravelling(stone)} days alive">${daysTravelling(stone)} d</strong></td>
        <td class="overview-finds" data-label="Finds"><strong>${stone.finds.length}</strong></td>
        <td class="overview-countries" data-label="Countries"><strong aria-label="${countries} ${countries === 1 ? "country" : "countries"}">${countries}</strong></td>
        <td class="overview-location" data-label="Last Found"><time datetime="${escapeHTML(last.date)}" title="${formatDate(last.date)} ${recency.label}"><span class="last-recency">${recency.days === 0 ? "Today" : `${recency.days}d ago`}</span></time><small class="last-place" title="${escapeHTML(fullPlace)}"><span class="place-name">${escapeHTML(last.city)}</span>${countryFlagHTML(last.country)}</small></td>
        <td class="overview-latest" data-label="Last Comment"><strong>${escapeHTML(lastComment.nickname)}</strong><small class="latest-note" title="${escapeHTML(lastComment.message)}">${escapeHTML(lastComment.message || "A little hello")}</small></td><td class="overview-arrow"><span aria-hidden="true">↗</span></td>
      </tr>`;
    })
    .join("");
}
function renderOverview() {
  const stones = stoneRepository.list();
  renderCollection();
  const stats = journeyStatistics(stones);
  $("#total-stones").textContent = stats.created;
  $("#total-active").textContent = stats.alive;
  $("#total-finds").textContent = stats.finds;
  $("#total-countries").textContent = stats.countries;
  renderMap($("#world-map"), stones);
}

function overviewPopupHTML(stone, last) {
  const days = daysTravelling(stone);
  return `<section class="stone-popup" aria-label="${escapeHTML(stone.name)} summary">
    <div class="stone-popup-heading"><img src="${escapeHTML(stoneImageURL(stone))}" alt="" width="44" height="44"><strong>${escapeHTML(stone.name)}</strong></div>
    <dl class="stone-popup-facts">
      <div><dt>Born</dt><dd>${formatDate(stone.started)}</dd></div>
      <div><dt>Alive</dt><dd class="stone-popup-age">${days} ${days === 1 ? "day" : "days"}</dd></div>
      <div><dt>Last found</dt><dd><time datetime="${escapeHTML(last.date)}">${formatMoment(last.date)}</time><span class="stone-popup-city">${escapeHTML(last.city)}${countryFlagHTML(last.country)}</span></dd></div>
    </dl>
    <a class="map-popup-link stone-popup-action" href="?stone=${encodeURIComponent(stone.id)}" data-stone="${escapeHTML(stone.id)}">Open stone story <span aria-hidden="true">↗</span></a>
  </section>`;
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
  const markers = points.map((find, index) => {
    const stone = journey || previewPlace ? stones[0] : stones[index];
    const latest = journey && index === points.length - 1;
    const local = find.local || Boolean(previewPlace);
    const color = local ? "#b49aff" : /^#[0-9a-f]{6}$/i.test(stone.color) ? stone.color : "#9290be";
    const label = previewPlace
      ? "Your find location"
      : journey
        ? `${index + 1}. ${find.city}, ${find.country}${find.local ? " · Your saved find" : ""}`
        : `${escapeHTML(stone.name)} · ${find.city}`;
    const marker = L.marker([find.lat, find.lon], {
      title: label,
      alt: label,
      icon: L.divIcon({
        className: `stone-pin${!journey && !previewPlace ? " stone-dot-pin" : ""}${local ? " is-new" : ""}`,
        html: !journey && !previewPlace
          ? `<span class="map-stone-dot" style="--stone-color:${color}" aria-hidden="true"></span>`
          : `<span class="pin-core" style="--stone-color:${color}">${local ? "✦" : index + 1}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -12],
      }),
    })
      .bindPopup(
        !journey && !previewPlace ? overviewPopupHTML(stone, find) : `<strong>${escapeHTML(find.city)}</strong><br>${escapeHTML(find.address || find.city + ", " + find.country)}<br><span class="map-popup-note">${previewPlace ? "Location preview — not submitted" : formatDate(find.date)}${find.local ? " · Saved find" : ""}</span>`,
        !journey && !previewPlace ? { maxWidth: 220, autoPanPaddingTopLeft: [16, 80], autoPanPaddingBottomRight: [16, 12], className: "stone-overview-popup" } : {},
      )
      .addTo(map);
    marker.getElement().setAttribute("aria-label", label);
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
  const needsFit = !container.clientWidth || !container.clientHeight;
  if (!needsFit) fit();
  tiles.addTo(map);
  const observer = new ResizeObserver(() => {
    const instance = mapInstances.get(container.id);
    if (instance?.map !== map || !container.clientWidth || !container.clientHeight) return;
    map.invalidateSize({ pan: false });
    if (instance.needsFit) {
      fit();
      instance.needsFit = false;
    }
  });
  observer.observe(container);
  mapInstances.set(container.id, {
    map,
    bounds,
    fit,
    markers,
    needsFit,
    tiles,
    observer,
  });
}
function countryFlagHTML(country) {
  const code = { Slovakia: "sk", Austria: "at", Hungary: "hu", Czechia: "cz", "Czech Republic": "cz", Česko: "cz" }[country];
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
          <p class="entry-address">${isFind && entry.source === "gps" ? '<span class="local-badge gps-badge">GPS</span> ' : isFind && entry.source === "manual" ? '<span class="local-badge manual-badge">Manual</span> ' : isFind && entry.source === "demo" ? '<span class="local-badge demo-location-badge">Demo</span> ' : ""}${escapeHTML(address)}</p>
        </div>
        <div class="entry-author"><strong class="entry-finder">${escapeHTML(entry.nickname || "A kind stranger")}</strong></div>
      </header>
      ${entry.message ? `<p class="entry-message">“${escapeHTML(entry.message)}”</p>` : '<p class="entry-message no-message">A little hello, without a note this time.</p>'}
    </article>`;
    })
    .join("");
}
function openedFromQR() {
  const params = new URL(location.href).searchParams;
  return params.get("source") === "qr" && params.get("stone") === selectedId;
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
  // The first location records birth, rather than a later encounter.
  const encounters = Math.max(0, finds - 1);
  const travelSummary = encounters
    ? ` Since I was born, I’ve been found <strong>${encounters} ${encounters === 1 ? "time" : "times"}</strong> and travelled <strong>${Math.round(journeyDistance(stone)).toLocaleString("en-GB")} km</strong>.`
    : "";
  const birthParts = (birth.address || "")
    .split(",")
    .map((part) => part.trim());
  const paintedPlace =
    stone.demo && birthParts.length > 2 && birthParts.at(-1) === birth.city
      ? birthParts.at(-2)
      : birth.city;
  const creator = stone.creator
    ? `<strong>${escapeHTML(stone.creator)}</strong> painted me`
    : "My story began";
  const shareIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
  $("#stone-detail").innerHTML = `
    <div class="detail-topbar"><h2 id="detail-title"><img class="detail-pebble" src="${escapeHTML(stoneImageURL(stone))}" alt="" width="48" height="48"><span class="detail-title-copy"><span>${escapeHTML(stone.name)}</span></span></h2><div class="detail-header-actions"><div class="language-picker"><button class="language-switch" type="button" popovertarget="detail-language-menu" aria-expanded="false" aria-label="Choose language. Current language: English" title="Choose language"><img class="language-flag" src="${assetBase}flags/gb.svg" alt="" width="18" height="12"><span class="language-label">EN</span></button><div id="detail-language-menu" class="language-menu" popover="auto" role="group" aria-label="Languages"><button type="button" data-language="en" aria-current="true" autofocus><span class="language-name"><img class="language-flag" src="${assetBase}flags/gb.svg" alt="" width="18" height="12">English</span><span class="language-code">EN</span></button><button type="button" data-language="sk"><span class="language-name"><img class="language-flag" src="${assetBase}flags/sk.svg" alt="" width="18" height="12">Slovenčina</span><span class="language-code">SK</span></button><button type="button" data-language="hu"><span class="language-name"><img class="language-flag" src="${assetBase}flags/hu.svg" alt="" width="18" height="12">Magyar</span><span class="language-code">HU</span></button><button type="button" data-language="de"><span class="language-name"><img class="language-flag" src="${assetBase}flags/de.svg" alt="" width="18" height="12">Deutsch</span><span class="language-code">DE</span></button></div></div><button class="icon-button" id="close-detail" aria-label="Close stone detail">×</button></div></div>
    <div class="detail-body">
      <section class="detail-intro" aria-labelledby="intro-title">
        <h3 id="intro-title" class="sr-only">Meet ${escapeHTML(stone.name)}</h3>
        <p class="detail-story">I’m a little painted stone called <strong>${escapeHTML(stone.name)}</strong>. ${creator} on <strong>${formatDate(stone.started)}</strong>. I was born in <span class="birth-place"><strong>${escapeHTML(paintedPlace)}, ${escapeHTML(birth.country)}</strong>${countryFlagHTML(birth.country)}</span>.${travelSummary} Every person I meet brings me a little more to life. Take me on a trip, then leave me somewhere safe for my next friend. 😊</p>
        ${openedFromQR() ? `<p class="find-help">${supportsPreciseLocation() ? "Found me? Tap below to help my story grow." : "Found me? Scan my QR code on your phone to help my story grow."}</p>` : ""}
        <div class="detail-actions">${openedFromQR() && supportsPreciseLocation() ? '<button class="button primary" id="start-find">I found this stone</button>' : ""}<button class="button secondary" id="other-stones">Explore more stones ↗</button><button class="icon-button" id="watch-stone" type="button" aria-label="Watchdog: watch this stone" title="Watchdog: watch this stone" aria-expanded="false" aria-controls="watchdog-panel"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/><path d="M12 2V1"/></svg></button><button class="icon-button share-button" id="share-stone" aria-label="Share my story" title="Share my story">${shareIcon}</button></div>
        <div id="share-fallback" class="share-fallback" hidden></div>
      </section>
      <div id="find-container"></div>
      <section id="watchdog-panel" class="find-panel" aria-labelledby="watchdog-title" hidden>
        <h3 id="watchdog-title" tabindex="-1">Watchdog · Follow ${escapeHTML(stone.name)}’s next adventure</h3>
        <p id="watchdog-help">Leave your email to follow <strong>${escapeHTML(stone.name)}</strong>. Watchdog will let you know when a new find is recorded or I move to a new place. Your email stays private.</p>
        <form id="watchdog-form">
          <label class="field" for="watchdog-email">Your email<input id="watchdog-email" name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" aria-describedby="watchdog-help watchdog-status"></label>
          <div class="form-actions"><button class="button primary" id="save-watchdog" type="submit">Save my email</button></div>
        </form>
        <p id="watchdog-status" role="status" aria-live="polite"></p>
        <button class="button secondary" id="close-watchdog" type="button">Close</button>
      </section>
      <section class="detail-journey" aria-labelledby="journey-title">
        <h3 id="journey-title" class="sr-only">${escapeHTML(stone.name)} journey map</h3>
        <p class="journey-explanation">Follow my journey.</p>
        <div class="map-frame"><div id="journey-map" class="map-panel journey-map" role="region" aria-label="Interactive map of ${escapeHTML(stone.name)}’s finds"></div><button class="map-reset" data-reset-map="journey-map">Show whole journey ⤢</button></div>
        <div class="journey-caption"><span>Last seen: ${escapeHTML(last.city)} · ${formatDate(last.date)}</span><span class="journey-caption-end">${last.local ? '<span class="new-find-key">✦ Your new find · saved</span>' : ""}<span class="stone-views" title="Story openings since view tracking began">Views: <strong>${stone.views || 0}</strong></span></span></div>
        <div class="detail-stats" aria-label="My journey statistics"><span class="stat-alive"><strong>${days}</strong> Days alive</span><span class="stat-finds"><strong>${encounters}</strong> ${encounters === 1 ? "Find" : "Finds"}</span><span class="stat-countries"><strong>${new Set(stone.finds.map((find) => find.country)).size}</strong> Countries</span></div>
      </section>
      <section class="detail-section" aria-labelledby="history-title"><div class="detail-history-heading"><h3 id="history-title">My activity <span class="activity-description">(Every find and message is part of my story.)</span></h3></div><div id="stone-notes" class="story-feed">${historyHTML(stone)}</div></section>
      <p class="detail-footnote">${stone.demo ? "Demo stone, real shared moments." : "A real stone, a growing story."} Looking never records a find.</p>
    </div>`;
  renderMap($("#journey-map"), [stone], true);
  $("#close-detail").addEventListener("click", closeDetail);
  $("#share-stone").addEventListener("click", shareStone);
  $("#other-stones").addEventListener("click", showOtherStones);
  const watchButton = $("#watch-stone"), watchPanel = $("#watchdog-panel");
  const closeWatchdog = () => {
    watchPanel.hidden = true;
    watchButton.setAttribute("aria-expanded", "false");
    $("#find-container").hidden = false;
    watchButton.focus({ preventScroll: true });
  };
  watchButton.addEventListener("click", () => {
    if (!watchPanel.hidden) return closeWatchdog();
    watchPanel.hidden = false;
    watchButton.setAttribute("aria-expanded", "true");
    $("#find-container").hidden = true;
    watchPanel.style.scrollMarginTop = `${$(".detail-topbar").getBoundingClientRect().height + 12}px`;
    watchPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#watchdog-title").focus({ preventScroll: true });
  });
  $("#close-watchdog").addEventListener("click", closeWatchdog);
  const watchForm = $("#watchdog-form"), watchEmail = $("#watchdog-email"), watchSubmit = $("#save-watchdog"), watchStatus = $("#watchdog-status");
  watchForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (watchSubmit.disabled) return;
    const email = watchEmail.value.trim();
    watchSubmit.disabled = true;
    watchEmail.disabled = true;
    watchSubmit.textContent = "Saving…";
    watchStatus.textContent = "";
    try {
      await stoneRepository.watch(stone.id, email);
      watchForm.reset();
      watchStatus.textContent = "Your email is saved for this stone. Notifications are not active yet; no emails will be sent.";
    } catch (error) {
      watchStatus.textContent = error.message;
    } finally {
      watchSubmit.disabled = false;
      watchEmail.disabled = false;
      watchSubmit.textContent = "Save my email";
    }
  });
  $("#start-find")?.addEventListener("click", () => {
    if (!openedFromQR() || !supportsPreciseLocation()) return;
    watchPanel.hidden = true;
    watchButton.setAttribute("aria-expanded", "false");
    $("#find-container").hidden = false;
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
    const panel = $("#find-container .find-panel");
    panel.style.scrollMarginTop = `${$(".detail-topbar").getBoundingClientRect().height + 12}px`;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#find-title").focus({ preventScroll: true });
  });
}
function showOtherStones() {
  const show = () => {
    $("#explore").scrollIntoView({ behavior: "smooth", block: "start" });
    $(collectionState.view === "cards" ? ".journey-card" : ".stone-link")?.focus({ preventScroll: true });
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
  if (updateURL) {
    const url = new URL(location.href);
    url.searchParams.set("stone", id);
    url.searchParams.delete("source");
    if (url.href !== location.href)
      history.pushState({ livingstonesDetail: true }, "", url);
  }
  selectedId = id;
  overviewVisible = false;
  flow = null;
  if (!dialog.open) dialog.showModal();
  renderDetail();
  stoneRepository.recordView(id).then(views => {
    if (selectedId === id && dialog.open) {
      const counter = $(".stone-views strong");
      if (counter) counter.textContent = views;
    }
  }).catch(() => {});
  dialog.scrollTop = 0;
  $("#close-detail").focus({ preventScroll: true });
}
function closeDetail() {
  if (history.state?.livingstonesDetail) history.back();
  else {
    const url = new URL(location.href);
    url.searchParams.delete("stone");
    url.searchParams.delete("source");
    history.replaceState(null, "", url);
    syncURL();
  }
}
function syncURL() {
  const id = new URL(location.href).searchParams.get("stone");
  if (stoneRepository.get(id)) openStone(id, false);
  else {
    if (!overviewVisible) {
      overviewVisible = true;
      stoneRepository.recordHomepage().catch(() => {});
    }
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
  url.searchParams.delete("source");
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
    const nickname = flow.nickname.trim();
    const thanks = nickname ? `${escapeHTML(nickname)} 👏, you’ve made my day.` : "You’ve made my day. 👏";
    target.innerHTML = `<section class="find-panel success-panel" aria-labelledby="success-title"><div class="success-heading"><span class="success-icon" aria-hidden="true">✓</span><h3 id="success-title" tabindex="-1">${thanks}</h3></div><p>Take me along, then leave me somewhere new for my next friend.</p><p>Your moment is saved in my story.</p><button class="button primary" id="finish-find">See our little moment <span aria-hidden="true">↓</span></button></section>`;
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
    content = `<label class="field" for="find-code">Find Code<input id="find-code" name="code" required maxlength="32" inputmode="${/^\d+$/.test(stone.code || "") ? "numeric" : "text"}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="The code on the stone" value="${escapeHTML(flow.code)}" aria-describedby="code-hint find-error"></label><p class="field-hint" id="code-hint">My code is on the back. ${stone.demo ? `Try <strong>${escapeHTML(stone.code)}</strong> for this demo stone.` : ""} Continue to request your phone’s location, or choose your city if GPS is unavailable.</p><div class="form-actions"><button class="button primary" type="submit">Continue &amp; locate <span aria-hidden="true">→</span></button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
  if (flow.step === 2)
    content = `<p class="location-consent">Your phone needs permission to find our meeting place. Coordinates go to Photon for the address. If GPS is unavailable, you can choose your city instead.</p><button class="button secondary" id="use-gps" type="button">⌖ Use my location</button><p class="location-status ${flow.place ? "ready" : ""}" id="location-status" role="status">${flow.place ? placeLabel(flow.place) : "No location selected yet."}</p><div class="map-frame location-preview-frame" id="location-preview-frame" ${flow.place ? "" : "hidden"}><div class="map-panel location-preview-map" id="location-preview" role="region" aria-label="Preview of your find location"></div></div><button class="manual-location-toggle" id="choose-city" type="button" aria-expanded="${Boolean(flow.manualOpen)}" aria-controls="manual-location">Location not working? Choose a city</button><div id="manual-location" ${flow.manualOpen ? "" : "hidden"}><label class="field" for="manual-city">City<input id="manual-city" maxlength="120" autocomplete="off" placeholder="Start typing a city…" value="${flow.place?.source === "manual" ? escapeHTML(flow.place.city) : ""}" aria-describedby="city-search-status"></label><p class="field-hint">Choose a result to mark the approximate city location. City searches go to Photon.</p><p class="field-hint" id="city-search-status" role="status"></p><div id="city-results" class="city-results" aria-label="Matching cities"></div></div><div class="form-actions"><button class="button primary" id="location-next" type="submit" ${flow.place ? "" : "disabled"}>Continue <span aria-hidden="true">→</span></button><button class="button secondary" id="flow-back" type="button">Back</button><button class="button secondary" id="cancel-find" type="button">Cancel</button></div>`;
  if (flow.step === 3)
    content = `<div class="review-location">⌖ ${escapeHTML(flow.place.source === "manual" ? flow.place.city + ", " + flow.place.country : flow.place.address || flow.place.city + ", " + flow.place.country)}${flow.place.source === "manual" ? " · Manual city location" : ""}</div><label class="field" for="nickname">Your nickname <small>optional</small><input id="nickname" name="nickname" maxlength="40" autocomplete="nickname" placeholder="A kind stranger" value="${escapeHTML(flow.nickname)}"></label><label class="field" for="find-message">Leave a little message <small>optional</small><textarea id="find-message" name="message" maxlength="400" placeholder="Tell me about our little moment.">${escapeHTML(flow.message)}</textarea></label><p class="field-hint">Your find and note will become a public part of my story. Take me somewhere new for my next friend.</p><div class="form-actions"><button class="button primary" type="submit">Add my chapter <span aria-hidden="true">↗</span></button><button class="button secondary" type="button" id="flow-back">Back</button><button class="button secondary" type="button" id="cancel-find">Cancel</button></div>`;
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
  if (flow.step === 2) bindCitySearch();
  $("#use-gps")?.addEventListener("click", requestLocation);
  if (flow.step === 2 && flow.place) renderLocationPreview();
}
function bindCitySearch() {
  const activeFlow = flow;
  const input = $("#manual-city"), results = $("#city-results"), status = $("#city-search-status");
  let timer, controller;
  const current = () => flow === activeFlow && flow.step === 2 && $("#manual-city") === input;
  const cancel = () => { clearTimeout(timer); controller?.abort(); };
  const updatePlace = (place) => {
    flow.place = place;
    $("#location-status").textContent = place ? placeLabel(place) : "Choose a city from the suggestions.";
    $("#location-status").classList.toggle("ready", Boolean(place));
    $("#location-next").disabled = !place;
    renderLocationPreview();
  };
  $("#choose-city").onclick = () => {
    cancel();
    activeFlow.locationRun = (activeFlow.locationRun || 0) + 1;
    activeFlow.busy = false;
    $("#use-gps").disabled = false;
    input.disabled = false;
    activeFlow.manualOpen = true;
    $("#manual-location").hidden = false;
    $("#choose-city").setAttribute("aria-expanded", "true");
    if (flow.place?.source !== "manual") updatePlace(null);
    input.focus();
  };
  input.addEventListener("input", () => {
    cancel();
    results.replaceChildren();
    updatePlace(null);
    const query = input.value.trim();
    status.textContent = query.length < 2 ? "Type at least two letters." : "Searching cities…";
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      if (!current()) return;
      const request = controller = new AbortController();
      const timeout = setTimeout(() => request.abort(), 8000);
      const valid = () => current() && controller === request && input.value.trim() === query && !input.disabled;
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.search = new URLSearchParams({ q: query, limit: "6", lang: "en", layer: "city" });
        const response = await fetch(url, { signal: request.signal });
        if (!response.ok) throw Error("City search unavailable");
        const data = await response.json();
        if (!valid()) return;
        const seen = new Set();
        for (const feature of data.features || []) {
          const [lon, lat] = feature.geometry?.coordinates || [];
          const p = feature.properties || {};
          const city = p.name || p.city, country = p.country;
          if (!city || !country || !validCoordinates(lat, lon) || feature.geometry?.type !== "Point") continue;
          const label = [city, p.state, country].filter(Boolean).join(", ");
          if (seen.has(label)) continue;
          seen.add(label);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "city-result";
          button.textContent = label;
          button.onclick = () => {
            if (!valid()) return;
            cancel();
            activeFlow.locationRun = (activeFlow.locationRun || 0) + 1;
            input.value = city;
            results.replaceChildren();
            status.textContent = "City selected — approximate location.";
            updatePlace({ city, country, lat, lon, address: "Approximate city location", source: "manual", accuracy: null });
          };
          results.append(button);
        }
        status.textContent = results.children.length ? "Choose your city below." : "No matching cities. Try a different spelling.";
      } catch {
        if (valid()) status.textContent = "City search is unavailable. Try typing again or use GPS.";
      } finally { clearTimeout(timeout); }
    }, 350);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      results.querySelector("button")?.focus();
    }
  });
  results.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") { input.focus(); return; }
    const buttons = [...results.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  });
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
  return `${place.source === "manual" ? "Manual city location" : "Device location"}: ${place.source === "manual" ? place.city + ", " + place.country + " · approximate location" : place.address || place.city + ", " + place.country}${place.accuracy != null ? ` · accuracy ~${Math.round(place.accuracy)} m` : ""}`;
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
    status = $("#location-status"),
    run = activeFlow.locationRun = (activeFlow.locationRun || 0) + 1;
  const current = () =>
    flow === activeFlow && flow.step === 2 && $("#use-gps") === button && activeFlow.locationRun === run;
  if (!navigator.geolocation) {
    status.textContent = "GPS is unavailable in this browser. Choose a city to continue.";
    return;
  }
  activeFlow.busy = true;
  button.disabled = true;
  $("#location-next").disabled = true;
  $("#manual-city").disabled = true;
  status.textContent = "Waiting for permission and your location…";
  const unlock = () => {
    activeFlow.busy = false;
    if (current()) {
      button.disabled = false;
      $("#location-next").disabled = !flow.place;
      $("#manual-city").disabled = false;
    }
  };
  const fail = (error) => {
    if (!current()) return;
    status.textContent =
      {
        1: "Location permission was denied. You can enable it in browser settings, or choose a city.",
        2: "Your location is unavailable. Try again or choose a city.",
        3: "Location took too long. Try again or choose a city.",
      }[error.code] ||
      "Could not get your location. Choose a city to continue.";
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
        $("#manual-city").value = "";
        $("#city-results").replaceChildren();
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
// Language choices are a UI preview; English remains the active language.
function positionLanguageMenu(menu) {
  const button = document.querySelector(`[popovertarget="${menu.id}"]`);
  if (!button) return;
  const rect = button.getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(rect.right - 176, innerWidth - 188))}px`;
  menu.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - 188))}px`;
}
document.addEventListener("beforetoggle", (event) => {
  if (!event.target.matches?.(".language-menu")) return;
  const button = document.querySelector(`[popovertarget="${event.target.id}"]`);
  button?.setAttribute("aria-expanded", String(event.newState === "open"));
  if (event.newState === "open") positionLanguageMenu(event.target);
}, true);
const repositionLanguages = () => document.querySelectorAll(".language-menu:popover-open").forEach(positionLanguageMenu);
window.addEventListener("resize", repositionLanguages);
document.addEventListener("scroll", repositionLanguages, true);
$("#map-toggle").addEventListener("click", () => {
  const button = $("#map-toggle");
  const body = $("#world-map-body");
  body.hidden = !body.hidden;
  button.setAttribute("aria-expanded", String(!body.hidden));
  button.setAttribute("aria-label", body.hidden ? "Show map" : "Hide map");
  button.title = body.hidden ? "Show map" : "Hide map";
  if (!body.hidden) requestAnimationFrame(() => {
    const instance = mapInstances.get("world-map");
    instance?.map.invalidateSize({ pan: false });
    if (instance?.needsFit) {
      instance.fit();
      instance.needsFit = false;
    }
  });
});
$("#filters-toggle").addEventListener("click", () => {
  const button = $("#filters-toggle");
  const body = $("#stone-filter-body");
  body.hidden = !body.hidden;
  button.setAttribute("aria-expanded", String(!body.hidden));
  button.setAttribute("aria-label", body.hidden ? "Show filters" : "Hide filters");
  button.title = body.hidden ? "Show filters" : "Hide filters";
});
$("#stone-search").addEventListener("input", event => {
  collectionState.search = event.target.value;
  collectionState.visibleRows = 3;
  renderCollection();
});
document.querySelector(".stone-toolbar").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.stoneView && button.dataset.stoneView !== collectionState.view) {
    collectionState.view = button.dataset.stoneView;
    collectionState.visibleRows = 3;
  }
  if (button.dataset.stoneSort && button.dataset.stoneSort !== collectionState.sort) {
    collectionState.sort = button.dataset.stoneSort;
    collectionState.visibleRows = 3;
  }
  renderCollection();
});
$("#show-more-stones").addEventListener("click", () => {
  const next = document.querySelector("#stone-cards .journey-card[hidden]");
  collectionState.visibleRows += 3;
  updateCardPagination();
  next?.focus({ preventScroll: true });
  next?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
let paginationResize;
window.addEventListener("resize", () => {
  cancelAnimationFrame(paginationResize);
  paginationResize = requestAnimationFrame(updateCardPagination);
});
document.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-language]");
  if (choice) {
    const menu = choice.closest(".language-menu");
    menu.hidePopover();
    document.querySelector(`[popovertarget="${menu.id}"]`)?.focus({ preventScroll: true });
    return;
  }
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
  if (location.hostname === "livingstones.rodulab.com" && location.protocol === "http:") {
    const secureURL = new URL(location.href);
    secureURL.protocol = "https:";
    location.replace(secureURL.href);
    return;
  }
  const status = $("#data-status");
  status.hidden = false;
  status.textContent = "Our little stories are on their way…";
  try {
    await stoneRepository.load();
    const requestedId = new URL(location.href).searchParams.get("stone");
    if (requestedId && !stoneRepository.get(requestedId)) {
      let stone;
      try { stone = await stoneRepository.loadStone(requestedId); } catch (error) {
        if (error.status !== 404) throw error;
      }
      if (stone?.initialized === false) {
        const setupURL = new URL("../initialize/", document.querySelector('script[src*="app.js"]').src);
        setupURL.search = new URLSearchParams({stone: requestedId});
        location.replace(setupURL.href);
        return;
      }
    }
    renderOverview();
    syncURL();
    status.hidden = true;
  } catch (error) {
    status.innerHTML = `<span>${escapeHTML(error.message)}</span> <button class="button secondary" id="retry-load">Try again</button>`;
    $("#retry-load").addEventListener("click", boot);
  }
}
boot();
