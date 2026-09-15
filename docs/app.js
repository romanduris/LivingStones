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
let revision = 0;
async function refresh() {
  const current = ++revision;
  document.querySelector('#cards').replaceChildren();
  const n = navigator, s = screen, c = n.connection || n.mozConnection || n.webkitConnection;
  const date = new Date();
  card('01 / Prehliadač', [
    ['User agent', n.userAgent], ['Platforma (orientačne)', n.userAgentData?.platform || n.platform],
    ['Značky prehliadača', n.userAgentData?.brands?.map(b => `${b.brand} ${b.version}`).join(', ')],
    ['Mobil podľa prehliadača', yes(n.userAgentData?.mobile)], ['Výrobca prehliadača', n.vendor],
    ['Cookies povolené', yes(n.cookieEnabled)], ['Do Not Track', n.doNotTrack === '1' ? 'Zapnuté' : 'Vypnuté / neoznámené'],
    ['Global Privacy Control', yes(n.globalPrivacyControl)], ['Automatizované ovládanie (signál)', yes(n.webdriver)]
  ]);
  card('02 / Zariadenie a obrazovka', [
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
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#ip').addEventListener('click', async event => {
  const button = event.currentTarget, output = document.querySelector('#ip-result');
  button.disabled = true; rows(output, [['Stav', 'Načítavam…']]);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('service');
    const data = await response.json(); if (data.error) throw new Error('service');
    rows(output, [['Verejná IP', data.ip], ['Verzia IP', data.version], ['Krajina (odhad)', data.country_name], ['Región (odhad)', data.region], ['Mesto (odhad)', data.city], ['PSČ (odhad)', data.postal], ['Poskytovateľ / organizácia', data.org], ['Autonómny systém', data.asn], ['Časové pásmo podľa IP', data.timezone], ['Zemepisná šírka (odhad)', data.latitude], ['Zemepisná dĺžka (odhad)', data.longitude]]);
  } catch { rows(output, [['Stav', 'Služba je nedostupná, blokovaná alebo prekročila limit. Skús to neskôr.']]); }
  finally { clearTimeout(timeout); button.disabled = false; }
});
document.querySelector('#location').addEventListener('click', event => {
  const button = event.currentTarget, output = document.querySelector('#location-result');
  if (!navigator.geolocation) { rows(output, [['Stav', 'Tento prehliadač polohu neposkytuje.']]); return; }
  button.disabled = true; rows(output, [['Stav', 'Čakám na povolenie a polohu…']]);
  navigator.geolocation.getCurrentPosition(position => {
    const c = position.coords;
    rows(output, [['Zemepisná šírka', c.latitude], ['Zemepisná dĺžka', c.longitude], ['Presnosť', unit(Math.round(c.accuracy), 'm')], ['Nadmorská výška', unit(c.altitude, 'm')], ['Presnosť výšky', unit(c.altitudeAccuracy, 'm')], ['Rýchlosť', unit(c.speed, 'm/s')], ['Smer pohybu', unit(c.heading, '°')], ['Čas merania', new Date(position.timestamp).toLocaleString('sk-SK')]]);
    button.disabled = false; refresh();
  }, error => {
    rows(output, [['Stav', ({1: 'Povolenie bolo zamietnuté. Zmeniť ho môžeš v nastaveniach webu v prehliadači.', 2: 'Polohu sa nepodarilo zistiť.', 3: 'Čas na získanie polohy vypršal. Skús to znovu.'})[error.code] || 'Poloha nie je dostupná.']]);
    button.disabled = false; refresh();
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
refresh();
