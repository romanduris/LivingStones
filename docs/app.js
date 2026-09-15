'use strict';
const missing = 'Nedostupné';
const yes = value => value === undefined ? missing : value ? 'Áno' : 'Nie';
const unit = (value, suffix) => value == null ? missing : `${value} ${suffix}`;
function rows(target, entries) {
  target.replaceChildren();
  for (const [label, value] of entries) {
    const row = document.createElement('div');
    const key = document.createElement('dt');
    const data = document.createElement('dd');
    key.textContent = label;
    data.textContent = value == null || value === '' ? missing : String(value);
    row.append(key, data); target.append(row);
  }
}
function card(title, entries) {
  const section = document.createElement('section');
  const heading = document.createElement('h2'); heading.textContent = title;
  const list = document.createElement('dl'); rows(list, entries);
  section.append(heading, list); document.querySelector('#cards').append(section);
  return list;
}
function identifyDevice(n) {
  const ua = n.userAgent || '';
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
  const tablet = ipad || /Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
  const mobile = /Mobi|iPhone|iPod/.test(ua) || n.userAgentData?.mobile === true;
  const desktop = /Windows|Macintosh|X11|CrOS|Linux/.test(ua);
  const type = /SmartTV|SMART-TV|HbbTV/.test(ua) ? 'Smart TV' : tablet ? 'Tablet' : mobile ? 'Mobil' : desktop ? 'Počítač / notebook' : missing;
  let os = ipad ? 'iPadOS' : /iPhone|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows NT 10/.test(ua) ? 'Windows 10 / 11' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : missing;
  const osVersion = ua.match(/(?:Android |(?:CPU (?:iPhone )?OS) |Mac OS X )([\d_.]+)/)?.[1]?.replaceAll('_', '.');
  if (osVersion && (!ipad || /iPad/.test(ua))) os += ` ${osVersion}`;
  const patterns = [['Edge', /(?:EdgA|EdgiOS|Edg)\/([\d.]+)/], ['Opera', /(?:OPR|OPT)\/([\d.]+)/], ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/], ['Chrome / kompatibilný', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]];
  let browser = missing;
  for (const [name, pattern] of patterns) {
    const match = ua.match(pattern);
    if (match) { browser = `${name} ${match[1]}`; break; }
  }
  return { type, os, browser };
}
function browserId() {
  try {
    const key = 'livingstones.browserId';
    const stored = localStorage.getItem(key);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch { return missing; }
}
const summaryId = browserId();
let summaryLocation = 'Načítavam…';
let preciseLocation = null;
function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
function showMap(latitude, longitude, accuracy) {
  const frame = document.querySelector('#location-map');
  const status = document.querySelector('#map-status');
  const link = document.querySelector('#map-link');
  if (!validCoordinates(latitude, longitude)) {
    frame.hidden = true; frame.src = 'about:blank'; link.hidden = true;
    status.textContent = 'Súradnice podľa IP nie sú dostupné. Skús tlačidlo Urči presnú polohu.';
    return;
  }
  const precise = accuracy !== undefined;
  const span = precise ? Math.max(0.002, Math.min(90, accuracy / 111000 * 2)) : 0.12;
  const lonSpan = Math.min(180, span / Math.max(0.01, Math.cos(latitude * Math.PI / 180)));
  const bbox = [Math.max(-180, longitude-lonSpan), Math.max(-90, latitude-span), Math.min(180, longitude+lonSpan), Math.min(90, latitude+span)];
  frame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.join(',')}&layer=mapnik&marker=${latitude},${longitude}`;
  frame.hidden = false;
  link.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${precise ? 16 : 11}/${latitude}/${longitude}`;
  link.hidden = false;
  status.textContent = precise ? `Poloha zo zariadenia · hlásená presnosť približne ${Math.round(accuracy)} m.` : 'Približná poloha podľa IP · presnosť nie je známa, bod nemusí označovať tvoju ulicu ani mestskú časť.';
}
function updateSummary() {
  const device = identifyDevice(navigator);
  const type = ['Mobil', 'Tablet'].includes(device.type) ? 'Mobile' : device.type === 'Počítač / notebook' ? 'Desktop' : device.type;
  const row = document.createElement('tr');
  for (const value of [summaryId, type, preciseLocation || summaryLocation, Intl.DateTimeFormat().resolvedOptions().timeZone, device.os]) {
    const cell = document.createElement('td'); cell.textContent = value || missing; row.append(cell);
  }
  document.querySelector('#device-summary').replaceChildren(row);
}
function graphics() {
  let gl;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return [['Stav', 'WebGL je nedostupné alebo blokované']];
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return [['Grafický renderer (hlásený)', debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)], ['Výrobca grafiky (hlásený)', debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)], ['Verzia WebGL', gl.getParameter(gl.VERSION)], ['Verzia shaderov', gl.getParameter(gl.SHADING_LANGUAGE_VERSION)], ['Max. rozmer textúry', unit(gl.getParameter(gl.MAX_TEXTURE_SIZE), 'px')]];
  } catch { return [['Stav', missing]]; }
  finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
}
async function advancedDevice(list) {
  try {
    const data = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'wow64']);
    rows(list, [['Platforma', data.platform], ['Verzia platformy (Client Hints, nemusí byť marketingová verzia OS)', data.platformVersion], ['Model zariadenia', data.model], ['Architektúra', data.architecture], ['Architektúra – počet bitov', data.bitness], ['32-bitový proces na 64-bit Windows', yes(data.wow64)], ['Úplné verzie prehliadača', data.fullVersionList?.map(b => `${b.brand} ${b.version}`).join(', ')]]);
  } catch { rows(list, [['Stav', 'Prehliadač rozšírené údaje neposkytuje. Základný odhad je vyššie.']]); }
}
let revision = 0;
async function refresh() {
  updateSummary();
  const current = ++revision;
  document.querySelector('#cards').replaceChildren();
  const n = navigator, s = screen, c = n.connection || n.mozConnection || n.webkitConnection;
  const date = new Date();
  const identity = identifyDevice(n);
  card('01 / Prehliadač', [
    ['Prehliadač a verzia (odhad)', identity.browser],
    ['User agent', n.userAgent], ['Platforma (orientačne)', n.userAgentData?.platform || n.platform],
    ['Značky prehliadača', n.userAgentData?.brands?.map(b => `${b.brand} ${b.version}`).join(', ')],
    ['Mobil podľa prehliadača', yes(n.userAgentData?.mobile)], ['Výrobca prehliadača', n.vendor],
    ['Cookies povolené', yes(n.cookieEnabled)], ['Do Not Track', n.doNotTrack === '1' ? 'Zapnuté' : 'Vypnuté / neoznámené'],
    ['Global Privacy Control', yes(n.globalPrivacyControl)], ['Automatizované ovládanie (signál)', yes(n.webdriver)]
  ]);
  card('02 / Zariadenie a obrazovka', [
    ['Typ zariadenia (odhad)', identity.type], ['Operačný systém (odhad)', identity.os],
    ['Logické procesory (hlásené)', n.hardwareConcurrency], ['RAM (hrubý odhad)', unit(n.deviceMemory, 'GB')],
    ['Dotykové body', n.maxTouchPoints], ['Rozlíšenie (CSS pixely)', `${s.width} × ${s.height}`],
    ['Dostupná plocha', `${s.availWidth} × ${s.availHeight}`], ['Okno stránky', `${innerWidth} × ${innerHeight}`],
    ['Pomer pixelov', devicePixelRatio], ['Farebná hĺbka', unit(s.colorDepth, 'bitov')],
    ['Orientácia', s.orientation?.type], ['Farebná téma systému', matchMedia('(prefers-color-scheme: dark)').matches ? 'Tmavá' : 'Svetlá'],
    ['Obmedzenie animácií', yes(matchMedia('(prefers-reduced-motion: reduce)').matches)],
    ['Jemný ukazovateľ (myš / trackpad)', yes(matchMedia('(pointer: fine)').matches)]
  ]);
  card('03 / Jazyk a čas', [
    ['Hlavný jazyk', n.language], ['Preferované jazyky', n.languages?.join(', ')],
    ['Časové pásmo', Intl.DateTimeFormat().resolvedOptions().timeZone],
    ['Lokálny čas zariadenia', date.toLocaleString('sk-SK')], ['Čas UTC', date.toISOString()],
    ['Posun voči UTC', unit(-date.getTimezoneOffset(), 'minút')]
  ]);
  card('04 / Sieť a návšteva', [
    ['Online podľa prehliadača', yes(n.onLine)], ['Typ pripojenia', c?.type],
    ['Efektívny typ siete', c?.effectiveType], ['Rýchlosť (odhad)', unit(c?.downlink, 'Mb/s')],
    ['Odozva (odhad)', unit(c?.rtt, 'ms')], ['Šetrenie dát', yes(c?.saveData)],
    ['Zabezpečený kontext', yes(isSecureContext)], ['Adresa tejto stránky', location.origin + location.pathname],
    ['Odkazujúca stránka', document.referrer || 'Priamy vstup alebo skryté prehliadačom'],
    ['Viditeľnosť karty', document.visibilityState]
  ]);
  const batteryList = card('05 / Batéria', [['Stav', n.getBattery ? 'Načítavam…' : missing]]);
  const permissionsList = card('06 / Povolenia pre tento web', [['Stav', 'Načítavam…']]);
  card('07 / Grafika', graphics());
  const advancedList = card('08 / Rozšírené údaje zariadenia', [['Stav', 'Načítavam…']]);
  advancedDevice(advancedList);
  card('09 / Podporované funkcie', [
    ['Geolokácia', yes('geolocation' in n)], ['Prístup ku kamere / mikrofónu (API, nie prítomnosť hardvéru)', yes(Boolean(n.mediaDevices?.getUserMedia))],
    ['WebRTC', yes('RTCPeerConnection' in globalThis)], ['WebAssembly', yes('WebAssembly' in globalThis)],
    ['WebGPU (API)', yes('gpu' in n)], ['Bluetooth (API)', yes('bluetooth' in n)], ['USB (API)', yes('usb' in n)],
    ['Gamepad (API)', yes('getGamepads' in n)], ['Vibrácie (API)', yes('vibrate' in n)],
    ['Service Worker', yes('serviceWorker' in n)], ['Zdieľanie zo stránky', yes('share' in n)],
    ['PDF priamo v prehliadači', yes(n.pdfViewerEnabled)], ['Celá obrazovka', yes(document.fullscreenEnabled)],
    ['HDR podľa prehliadača', yes(matchMedia('(dynamic-range: high)').matches)],
    ['Široký farebný gamut P3', yes(matchMedia('(color-gamut: p3)').matches)],
    ['Ukazovateľ podporuje hover', yes(matchMedia('(hover: hover)').matches)]
  ]);
  card('10 / Čo sa týmto zistiť nedá', [
    ['Identita človeka', 'Meno, e-mail ani telefón nie sú automaticky dostupné.'],
    ['Presný model a vek zariadenia', 'Iba ak ich prehliadač sprístupní; inak sa spoľahlivo určiť nedajú.'],
    ['MAC, IMEI a sériové číslo', 'Bežná webová stránka k nim nemá prístup.'],
    ['VPN / proxy', 'Z týchto údajov sa nedajú spoľahlivo potvrdiť.'],
    ['Kamera, mikrofón a súbory', 'Obsah sa automaticky nečíta. Vyžaduje povolenie alebo výber používateľa.'],
    ['História a heslá', 'Prehliadač ich tejto stránke nesprístupňuje.']
  ]);
  document.querySelector('#updated').textContent = `Aktualizované ${date.toLocaleTimeString('sk-SK')}`;
  const states = { granted: 'Povolené', denied: 'Zamietnuté', prompt: 'Vyžaduje súhlas' };
  const permissions = await Promise.all([['Poloha', 'geolocation'], ['Kamera', 'camera'], ['Mikrofón', 'microphone'], ['Notifikácie', 'notifications']].map(async ([label, name]) => {
    try { const result = await n.permissions.query({ name }); return [label, states[result.state] || result.state]; }
    catch { return [label, missing]; }
  }));
  if (current !== revision) return;
  rows(permissionsList, permissions);
  if (n.getBattery) {
    try {
      const b = await n.getBattery();
      if (current !== revision) return;
      rows(batteryList, [['Nabitie', `${Math.round(b.level * 100)} %`], ['Nabíjanie', yes(b.charging)], ['Do nabitia (odhad)', Number.isFinite(b.chargingTime) ? unit(b.chargingTime, 's') : missing], ['Do vybitia (odhad)', Number.isFinite(b.dischargingTime) ? unit(b.dischargingTime, 's') : missing]]);
    } catch { rows(batteryList, [['Stav', missing]]); }
  }
}
document.querySelector('#refresh').addEventListener('click', () => { refresh(); lookupIp(); });
const ipServices = [
  {
    name: 'ipwho.is', url: 'https://ipwho.is/',
    normalize: data => {
      if (data.success !== true) throw new Error('service');
      return { ip: data.ip, version: data.type, country_name: data.country,
        region: data.region, city: data.city, postal: data.postal,
        org: data.connection?.org || data.connection?.isp,
        asn: data.connection?.asn == null ? undefined : `AS${data.connection.asn}`,
        timezone: data.timezone?.id, latitude: data.latitude, longitude: data.longitude };
    }
  },
  { name: 'ipapi.co', url: 'https://ipapi.co/json/', normalize: data => {
    if (data.error) throw new Error('service');
    return data;
  } }
];
async function lookupIp() {
  const button = document.querySelector('#ip'), output = document.querySelector('#ip-result');
  if (button.disabled) return;
  button.disabled = true;
  summaryLocation = 'Načítavam…'; updateSummary();
  try {
    for (const [index, service] of ipServices.entries()) {
      rows(output, [['Stav', index === 0 ? 'Načítavam…' : 'Skúšam záložnú službu…']]);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(service.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('service');
        const data = service.normalize(await response.json());
        if (typeof data.ip !== 'string' || !data.ip.trim() ||
            ![data.country_name, data.region, data.city].some(value => typeof value === 'string' && value.trim())) {
          throw new Error('incomplete');
        }
        summaryLocation = [data.city, data.region, data.country_name].filter((value, index, all) => typeof value === 'string' && value.trim() && all.indexOf(value) === index).join(', ');
        if (!preciseLocation) showMap(data.latitude, data.longitude);
        updateSummary();
        rows(output, [['Zdroj údajov', service.name], ['Verejná IP', data.ip], ['Verzia IP', data.version], ['Krajina (odhad)', data.country_name], ['Región (odhad)', data.region], ['Mesto (odhad)', data.city], ['PSČ (odhad)', data.postal], ['Poskytovateľ / organizácia', data.org], ['Autonómny systém', data.asn], ['Časové pásmo podľa IP', data.timezone], ['Zemepisná šírka (odhad)', data.latitude], ['Zemepisná dĺžka (odhad)', data.longitude]]);
        return;
      } catch {
        // A failed or incomplete response falls through to the next provider.
      } finally { clearTimeout(timeout); }
    }
    summaryLocation = missing; updateSummary();
    if (!preciseLocation) showMap();
    rows(output, [['Stav', 'IP a približná poloha sú momentálne nedostupné. Služby môžu byť blokované, bez pripojenia alebo po prekročení limitu. Skús to neskôr alebo použi tlačidlo Urči presnú polohu pri mape.']]);
  } finally { button.disabled = false; }
}
document.querySelector('#ip').addEventListener('click', lookupIp);
document.querySelector('#location').addEventListener('click', event => {
  const button = event.currentTarget, output = document.querySelector('#location-result');
  if (button.disabled) return;
  if (!navigator.geolocation) { rows(output, [['Stav', 'Tento prehliadač polohu neposkytuje.']]); return; }
  button.disabled = true; rows(output, [['Stav', 'Čakám na povolenie a polohu…']]);
  const fail = error => {
    rows(output, [['Stav', ({1: 'Povolenie bolo zamietnuté. Zmeniť ho môžeš v nastaveniach webu v prehliadači.', 2: 'Polohu sa nepodarilo zistiť.', 3: 'Čas na získanie polohy vypršal. Skús to znovu.'})[error.code] || 'Poloha nie je dostupná.']]);
    button.disabled = false;
  };
  try {
    navigator.geolocation.getCurrentPosition(position => {
      const c = position.coords;
      if (!validCoordinates(c.latitude, c.longitude) || !Number.isFinite(c.accuracy) || c.accuracy < 0) { fail({code:2}); return; }
      preciseLocation = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} (presnosť ~${Math.round(c.accuracy)} m)`;
      showMap(c.latitude, c.longitude, c.accuracy);
      updateSummary();
      rows(output, [['Zdroj', 'Poloha zariadenia so súhlasom'], ['Zemepisná šírka', c.latitude], ['Zemepisná dĺžka', c.longitude], ['Presnosť', unit(Math.round(c.accuracy), 'm')], ['Čas merania', new Date(position.timestamp).toLocaleString('sk-SK')]]);
      button.disabled = false;
    }, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch { fail({}); }
});
refresh();
lookupIp();
