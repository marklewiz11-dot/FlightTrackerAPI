const DEFAULT_CACHE_SECONDS = 3600;
const WARNING_SECONDS = 5 * 60;
const DANGER_SECONDS = 30 * 60;

let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "ISB",
  airline: "All",
  status: "All",
  includeMinor: false,
  timezoneMode: "PKT",
  cacheSeconds: DEFAULT_CACHE_SECONDS,
  cacheRemaining: DEFAULT_CACHE_SECONDS,
  refreshPaused: false,
  activeTab: "flights",
  datasetGeneratedAtMs: null,
  lastLoadFailed: false,
  loadFactor: 85,
  scopeLabel: "Islamabad default"
};

const AIRLINE_STATUS_LINKS = [
  { name: "PIA", url: "https://www.piac.com.pk/", note: "Official airline site" },
  { name: "Airblue", url: "https://www.airblue.com/flightinfo/status", note: "Official flight status" },
  { name: "SereneAir", url: "https://www.sereneair.com/status", note: "Official flight status" },
  { name: "AirSial", url: "https://airsial.com/", note: "Official airline site" },
  { name: "Fly Jinnah", url: "https://www.flyjinnah.com/", note: "Official site with flight status" },
  { name: "Emirates", url: "https://www.emirates.com/english/help/flight-status/", note: "Official flight status" },
  { name: "Qatar Airways", url: "https://www.qatarairways.com/en/flight-status.html", note: "Official flight status" },
  { name: "Etihad Airways", url: "https://www.etihad.com/en/manage/flight-status", note: "Official flight status" },
  { name: "British Airways", url: "https://www.britishairways.com/travel/flightstatus/public/en_gb/search/FindFlightStatusPublic", note: "Official flight status" },
  { name: "Turkish Airlines", url: "https://www.turkishairlines.com/en-int/flights/flight-status/", note: "Official flight status" },
  { name: "Saudia", url: "https://www.saudia.com/pages/travel-information/flight-status", note: "Official flight status" },
  { name: "Oman Air", url: "https://www.omanair.com/gbl/en/flight-status", note: "Official flight status" },
  { name: "flydubai", url: "https://www.flydubai.com/en/plan/timetable-and-status", note: "Official flight status" },
  { name: "Thai Airways", url: "https://www.thaiairways.com/en-hk/content/flight-status/", note: "Official flight status" },
  { name: "Air Arabia", url: "https://flights.airarabia.com/en-pk/", note: "Official Pakistan site" },
  { name: "Jazeera Airways", url: "https://www.jazeeraairways.com/en-pk", note: "Official Pakistan site" },
  { name: "China Airlines", url: "https://www.china-airlines.com/", note: "Official airline site" },
  { name: "Air China", url: "https://www.airchina.com/", note: "Official airline site" },
  { name: "Kuwait Airways", url: "https://kuwaitairways.com/en/flightstatus", note: "Official flight status" },
  { name: "Gulf Air", url: "https://www.gulfair.com/flying-with-us/before-you-travel/flight-status", note: "Official flight status" },
  { name: "SriLankan Airlines", url: "https://www.srilankan.com/en_uk/plan-and-book/flight-status", note: "Official flight status" }
];

const HUB_NAMES = {
  DOH: "Doha", DXB: "Dubai", DWC: "Dubai World Central", AUH: "Abu Dhabi", SHJ: "Sharjah", IST: "Istanbul", SAW: "Sabiha Gokcen",
  JED: "Jeddah", RUH: "Riyadh", BAH: "Bahrain", KWI: "Kuwait", BKK: "Bangkok", MCT: "Muscat", MED: "Madinah", KUL: "Kuala Lumpur",
  LHR: "London Heathrow", LGW: "London Gatwick"
};

const PAKISTAN_AIRPORT_NAMES = { ISB: "Islamabad", LHE: "Lahore", KHI: "Karachi" };

const AIRCRAFT_CAPACITY = {
  A20N: 180, A20: 180, A319: 144, A320: 180, A321: 220, A21N: 220,
  A332: 270, A333: 300, A338: 257, A339: 287, A359: 315, A35K: 350,
  A388: 489, A380: 489, B37M: 189, B38M: 189, B39M: 220, B3XM: 189,
  B732: 130, B733: 149, B734: 168, B735: 132, B736: 120, B737: 162,
  B738: 189, B739: 215, B744: 416, B748: 467, B752: 200, B753: 243,
  B762: 216, B763: 269, B764: 304, B772: 314, B77L: 317, B77W: 396,
  B773: 396, B778: 349, B779: 400, B788: 248, B789: 290, B78X: 330,
  E190: 100, E195: 120, E75L: 76, E75S: 76, E170: 72, E145: 50,
  CRJ2: 50, CRJ7: 70, CRJ9: 90, ATR: 72, AT72: 72, AT75: 72,
  DH8D: 78, DH8C: 50, "32S": 180, "32N": 180, "321": 220, "320": 180,
  "319": 144, "330": 290, "350": 315, "359": 315, "388": 489, "738": 189,
  "739": 215, "772": 314, "77W": 396, "788": 248, "789": 290
};

function getTimeZoneInfo() {
  if (state.timezoneMode === "UK") return { label: "United Kingdom time", zone: "Europe/London" };
  return { label: "Pakistan Standard Time", zone: "Asia/Karachi" };
}

function getDataAgeSeconds() {
  if (!state.datasetGeneratedAtMs) return 0;
  return Math.max(0, Math.floor((Date.now() - state.datasetGeneratedAtMs) / 1000));
}

function getAgeSeverity() {
  if (state.lastLoadFailed) return "danger";
  const ageSeconds = getDataAgeSeconds();
  if (ageSeconds >= DANGER_SECONDS) return "danger";
  if (ageSeconds >= WARNING_SECONDS) return "warning";
  return "fresh";
}

function zonedDateParts(value) {
  const d = new Date(value);
  const tz = getTimeZoneInfo().zone;
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
  };
}

function safeArray(v) { return Array.isArray(v) ? v : []; }
function toMillis(value) { if (!value) return 0; const t = new Date(value).getTime(); return Number.isNaN(t) ? 0 : t; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel")) return "status-bad";
  if (s.includes("delay")) return "status-warn";
  if (s.includes("arrived") || s.includes("departed") || s.includes("landed") || s.includes("on time")) return "status-good";
  return "status-neutral";
}

function kpiPercent(part, total) { if (!total) return "0%"; return `${Math.round((part / total) * 100)}%`; }
function bestDepTime(row) { return row.bestDep || row.actualDep || row.estimatedDep || row.scheduledDep || null; }
function bestArrTime(row) { return row.bestArr || row.actualArr || row.estimatedArr || row.scheduledArr || null; }
function displayTime(value) { if (!value) return "—"; return zonedDateParts(value).time; }
function delayText(row) { return row.delayMinutes ? `${row.delayMinutes}m` : "—"; }
function displayStatus(row) { return row.status || "Unknown"; }

function isCancelled(row) { return row.status === "Cancelled"; }
function isDiverted(row) { return row.status === "Diverted" || row.diverted; }
function isDelayed(row) { return !isCancelled(row) && !isDiverted(row) && Number(row.delayMinutes || 0) > 0; }
function isDelayed60(row) { return !isCancelled(row) && !isDiverted(row) && Number(row.delayMinutes || 0) >= 60; }
function isDisrupted(row) { return isCancelled(row) || isDiverted(row) || isDelayed60(row); }

function disruptionPriority(row) {
  if (isCancelled(row)) return 4;
  if (isDiverted(row)) return 3;
  if (Number(row.delayMinutes || 0) >= 120) return 2;
  if (isDelayed60(row)) return 1;
  return 0;
}

function disruptionLabel(row) {
  if (isCancelled(row)) return "Cancelled";
  if (isDiverted(row)) return "Diverted";
  if (isDelayed60(row)) return `Delayed ${row.delayMinutes}m`;
  return row.status || "Operational";
}

function normaliseAircraftCode(code) { return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

function estimateSeatCapacity(row) {
  const raw = normaliseAircraftCode(row.aircraft || "");
  if (!raw) return 180;
  if (AIRCRAFT_CAPACITY[raw]) return AIRCRAFT_CAPACITY[raw];
  const match = Object.keys(AIRCRAFT_CAPACITY).find((k) => raw.includes(k) || k.includes(raw));
  if (match) return AIRCRAFT_CAPACITY[match];
  if (raw.startsWith("A38")) return 489;
  if (raw.startsWith("A35")) return 315;
  if (raw.startsWith("A33")) return 290;
  if (raw.startsWith("A32")) return 180;
  if (raw.startsWith("B77")) return 350;
  if (raw.startsWith("B78")) return 280;
  if (raw.startsWith("B73")) return 189;
  if (raw.startsWith("ATR")) return 72;
  return 180;
}

function estimatePax(row) {
  return Math.round(estimateSeatCapacity(row) * (state.loadFactor / 100));
}

function formatNumber(num) { return new Intl.NumberFormat("en-GB").format(num || 0); }

function renderLoadFactorUi() {
  const slider = document.getElementById("loadFactorSlider");
  const label = document.getElementById("loadFactorValue");
  if (slider) slider.value = String(state.loadFactor);
  if (label) label.textContent = `${state.loadFactor}%`;
}

function renderKpis(rows) {
  const total = rows.length;
  const cancelled = rows.filter(isCancelled);
  const diverted = rows.filter(isDiverted);
  const delayed60 = rows.filter(isDelayed60);
  const disrupted = rows.filter(isDisrupted);
  const preDepDelays = rows.filter((f) => f.direction === "Departure" && isDelayed(f) && !f.actualDep);
  const avgDelayMinutes = (() => {
    const delayed = rows.filter(isDelayed);
    return delayed.length ? Math.round(delayed.reduce((sum, f) => sum + Number(f.delayMinutes || 0), 0) / delayed.length) : 0;
  })();
  const cancelledPct = kpiPercent(cancelled.length, total);
  const cancelledPax = cancelled.reduce((sum, f) => sum + estimatePax(f), 0);
  const divertedPax = diverted.reduce((sum, f) => sum + estimatePax(f), 0);
  const delayedPax = delayed60.reduce((sum, f) => sum + estimatePax(f), 0);
  const disruptedPax = disrupted.reduce((sum, f) => sum + estimatePax(f), 0);

  const el = document.getElementById("kpis");
  el.innerHTML = `
    <div class="kpi"><div class="kpiLabel">Total Flights</div><div class="kpiValue">${total}</div></div>
    <div class="kpi ${cancelled.length > 0 ? "kpiDanger" : ""}"><div class="kpiLabel">Cancelled</div><div class="kpiValue">${cancelled.length}<span class="kpiSubValue">${cancelledPct}</span></div></div>
    <div class="kpi"><div class="kpiLabel">Diverted</div><div class="kpiValue">${diverted.length}</div></div>
    <div class="kpi ${delayed60.length > 0 ? "kpiWarn" : ""}"><div class="kpiLabel">Delayed >60m</div><div class="kpiValue">${delayed60.length}</div></div>
    <div class="kpi"><div class="kpiLabel">Pre dep Delays</div><div class="kpiValue">${preDepDelays.length}</div></div>
    <div class="kpi"><div class="kpiLabel">Avg Delay</div><div class="kpiValue">${avgDelayMinutes}m</div></div>
    <div class="kpi"><div class="kpiLabel">Cancelled PAX</div><div class="kpiValue">${formatNumber(cancelledPax)}</div></div>
    <div class="kpi"><div class="kpiLabel">Diverted PAX</div><div class="kpiValue">${formatNumber(divertedPax)}</div></div>
    <div class="kpi ${delayedPax > 0 ? "kpiWarn" : ""}"><div class="kpiLabel">Delayed >60 PAX</div><div class="kpiValue">${formatNumber(delayedPax)}</div></div>
    <div class="kpi ${disruptedPax > 0 ? "kpiWarn" : ""}"><div class="kpiLabel">Total Disrupted PAX</div><div class="kpiValue">${formatNumber(disruptedPax)}</div></div>`;
}

function fillSelect(id, items, includeAll = true) {
  const el = document.getElementById(id);
  const current = el.value || (includeAll ? "All" : "");
  const values = includeAll ? ["All", ...items] : items;
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join("");
  if (values.includes(current)) el.value = current;
  else if (values.length) el.value = includeAll ? "All" : values[0];
}

function baseClientFilteredRows() {
  if (!state.raw) return [];
  let rows = safeArray(state.raw.flights || []);
  if (!state.includeMinor) rows = rows.filter((r) => r.isMajor);
  return rows;
}

function dayFilteredRows(rows) {
  if (state.day === "all") return rows;
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrowDate);
  return rows.filter((row) => {
    const primary = row.direction === "Departure" ? (row.scheduledDep || bestDepTime(row)) : (row.scheduledArr || bestArrTime(row));
    if (!primary) return false;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(primary));
    if (state.day === "today") return date === today;
    if (state.day === "tomorrow") return date === tomorrow;
    return true;
  });
}

function applyFilters(rows) {
  let out = [...rows];
  out = dayFilteredRows(out);
  if (state.direction !== "Both") out = out.filter((r) => r.direction === state.direction);
  if (state.airline !== "All") out = out.filter((r) => r.airline === state.airline);
  if (state.status !== "All") out = out.filter((r) => r.status === state.status);
  return out;
}

function renderWarnings(warnings) {
  const el = document.getElementById("warnings");
  const items = safeArray(warnings).filter(Boolean);

  if (!items.length) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }

  el.style.display = "block";
  el.innerHTML = items.map((w) => `<div class="notice">${w}</div>`).join("");
}

function renderRows(rows) {
  const tbody = document.getElementById("flightRows");
  document.getElementById("flightCount").textContent = rows.length;
  document.getElementById("timezoneNote").textContent = getTimeZoneInfo().label;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="emptyState">No flights match the current filters.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row) => {
    const pax = formatNumber(estimatePax(row));
    const meta = `${row.aircraft || "—"} • ${row.airline || "—"} • LF ${state.loadFactor}% • ~${pax} PAX`;
    return `
      <tr>
        <td class="flightCell"><div class="flightCellWrap"><span class="flightPrimary">${escapeHtml(row.number || "—")}</span><span class="flightMetaRow">${escapeHtml(meta)}</span></div></td>
        <td>${escapeHtml(row.airline || "—")}</td>
        <td>${escapeHtml(row.origin || "—")}</td>
        <td>${escapeHtml(row.destination || "—")}</td>
        <td class="timeCell">${displayTime(bestDepTime(row))}</td>
        <td class="timeCell">${displayTime(bestArrTime(row))}</td>
        <td><span class="statusPill ${statusClass(row.status)}"><span class="statusDot"></span>${displayStatus(row)}</span></td>
        <td class="delayCell">${delayText(row)}</td>
        <td>${escapeHtml(row.aircraft || "—")}</td>
        <td>${escapeHtml(row.type || "—")}</td>
        <td><span class="paxCellValue">~${pax}</span><span class="tableSubMeta">LF ${state.loadFactor}%</span></td>
        <td>${row.diverted ? "Yes" : "—"}</td>
      </tr>`;
  }).join("");
}

function renderAirlines(rows) {
  const tbody = document.getElementById("airlineRows");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="emptyState">No airline data for the current filters.</div></td></tr>`;
    return;
  }
  const map = new Map();
  rows.forEach((row) => {
    const key = row.airline || "Unknown";
    if (!map.has(key)) map.set(key, { airline: key, total: 0, estPax: 0, onTime: 0, delayed: 0, cancelled: 0, diverted: 0, delayTotal: 0, delayCount: 0 });
    const item = map.get(key);
    item.total += 1;
    item.estPax += estimatePax(row);
    if (isCancelled(row)) item.cancelled += 1;
    else if (isDiverted(row)) item.diverted += 1;
    else if (isDelayed(row) || row.status === "Delayed") item.delayed += 1;
    else item.onTime += 1;
    if (isDelayed(row)) { item.delayTotal += Number(row.delayMinutes || 0); item.delayCount += 1; }
  });
  const list = [...map.values()].sort((a, b) => b.total - a.total);
  tbody.innerHTML = list.map((item) => {
    const delayedPct = item.total ? Math.round((item.delayed / item.total) * 100) : 0;
    const cancelledPct = item.total ? Math.round((item.cancelled / item.total) * 100) : 0;
    const goodPct = item.total ? Math.round((item.onTime / item.total) * 100) : 0;
    const avgDelay = item.delayCount ? `${Math.round(item.delayTotal / item.delayCount)}m` : "—";
    return `
      <tr>
        <td class="flightCell">${escapeHtml(item.airline)}</td>
        <td>${item.total}</td>
        <td>~${formatNumber(item.estPax)}</td>
        <td class="goodText">${item.onTime} <span class="percentText">(${goodPct}%)</span></td>
        <td class="warnText">${item.delayed} <span class="percentText">(${delayedPct}%)</span></td>
        <td class="badText">${item.cancelled} <span class="percentText">(${cancelledPct}%)</span></td>
        <td>${item.diverted}</td>
        <td>${avgDelay}</td>
        <td><div class="perfBar"><div class="perfGood" style="width:${goodPct}%"></div><div class="perfWarn" style="width:${delayedPct}%"></div><div class="perfBad" style="width:${cancelledPct}%"></div></div></td>
      </tr>`;
  }).join("");
}

function getNextMovementText(rowsForCard) {
  const candidates = rowsForCard.map((row) => {
    const t = row.direction === "Departure" ? (bestDepTime(row) || row.scheduledDep) : (bestArrTime(row) || row.scheduledArr);
    return { row, time: t, millis: toMillis(t) };
  }).filter((x) => x.millis > 0).sort((a, b) => a.millis - b.millis);
  if (!candidates.length) return "No movement shown";
  const item = candidates[0];
  const label = item.row.direction === "Departure" ? "Dep" : "Arr";
  return `${label} ${displayTime(item.time)} ${item.row.number || ""}`.trim();
}

function renderAirportCards(rows) {
  const pkEl = document.getElementById("pakistanAirportCards");
  const hubEl = document.getElementById("hubAirportCards");
  const pakistanCards = ["ISB", "LHE", "KHI"].map((code) => {
    const subset = rows.filter((r) => r.airportCode === code);
    return { code, name: PAKISTAN_AIRPORT_NAMES[code] || code, total: subset.length, cancelled: subset.filter(isCancelled).length, delayed: subset.filter(isDelayed60).length, nextMovement: getNextMovementText(subset) };
  });
  const hubMap = new Map();
  rows.forEach((row) => {
    const hubCode = row.direction === "Departure" ? row.destination : row.origin;
    if (!hubCode || hubCode === "—" || ["ISB", "LHE", "KHI"].includes(hubCode)) return;
    if (!hubMap.has(hubCode)) hubMap.set(hubCode, []);
    hubMap.get(hubCode).push(row);
  });
  const hubCards = [...hubMap.entries()].map(([code, subset]) => ({ code, name: HUB_NAMES[code] || code, total: subset.length, cancelled: subset.filter(isCancelled).length, delayed: subset.filter(isDelayed60).length, nextMovement: getNextMovementText(subset) })).sort((a, b) => (b.cancelled * 100 + b.delayed * 10 + b.total) - (a.cancelled * 100 + a.delayed * 10 + a.total)).slice(0, 12);
  pkEl.innerHTML = pakistanCards.map((card) => `<div class="airportCard ${card.cancelled > 0 ? "airportCardAlert" : ""}"><div class="airportCodeRow"><div class="airportCode">${card.code}</div>${card.cancelled > 0 ? `<div class="airportAlertDot">• ${card.cancelled}</div>` : ""}</div><div class="airportName">${card.name}</div><div class="airportStatsLine"><span>Total <strong>${card.total}</strong></span><span class="badText">Canx <strong>${card.cancelled}</strong></span><span class="warnText">Delay >60 <strong>${card.delayed}</strong></span></div><div class="airportNext">Next: ${card.nextMovement}</div></div>`).join("");
  if (!hubCards.length) { hubEl.innerHTML = `<div class="emptyBlock">No hub data in the current filters.</div>`; return; }
  hubEl.innerHTML = hubCards.map((card) => `<div class="airportCard ${card.cancelled > 0 ? "airportCardAlert" : ""}"><div class="airportCodeRow"><div class="airportCode">${card.code}</div>${card.cancelled > 0 ? `<div class="airportAlertDot">• ${card.cancelled}</div>` : ""}</div><div class="airportName">${card.name}</div><div class="airportStatsLine"><span>Total <strong>${card.total}</strong></span><span class="badText">Canx <strong>${card.cancelled}</strong></span><span class="warnText">Delay >60 <strong>${card.delayed}</strong></span></div><div class="airportNext">Next: ${card.nextMovement}</div></div>`).join("");
}

function renderDisruptionFeed(rows) {
  const el = document.getElementById("disruptionFeed");
  const disruptions = [...rows].filter(isDisrupted).sort((a, b) => {
    const priority = disruptionPriority(b) - disruptionPriority(a);
    if (priority !== 0) return priority;
    return toMillis(bestDepTime(a) || bestArrTime(a)) - toMillis(bestDepTime(b) || bestArrTime(b));
  }).slice(0, 6);
  if (!disruptions.length) { el.innerHTML = `<div class="feedEmpty">No major disruptions in the current filtered view.</div>`; return; }
  el.innerHTML = disruptions.map((row) => {
    const timeValue = displayTime(bestDepTime(row) || bestArrTime(row));
    const route = `${row.origin || "—"} → ${row.destination || "—"}`;
    return `<div class="feedRow"><div class="feedTime">${timeValue}</div><div class="feedFlight">${row.number}</div><div class="feedRoute">${route}</div><div class="feedStatus ${isCancelled(row) ? "badText" : "warnText"}">• ${disruptionLabel(row)}</div></div>`;
  }).join("");
}

function renderStaleStatus() {
  const pill = document.getElementById("staleStatus");
  if (!pill) return;
  pill.className = "stalePill";
  if (state.refreshPaused) { pill.textContent = "Paused"; pill.classList.add("stalePaused"); return; }
  if (!state.datasetGeneratedAtMs) { pill.textContent = "Loading"; pill.classList.add("staleWarning"); return; }
  const severity = getAgeSeverity();
  if (severity === "danger") { pill.textContent = "Stale"; pill.classList.add("staleStale"); return; }
  if (severity === "warning") { pill.textContent = "Warning"; pill.classList.add("staleWarning"); return; }
  pill.textContent = "Fresh"; pill.classList.add("staleFresh");
}

function renderCacheWarning() {
  const bar = document.getElementById("cacheWarningBar");
  const text = document.getElementById("cacheWarningText");
  if (!bar || !text) return;
  if (!state.datasetGeneratedAtMs) { bar.className = "cacheWarningBar hidden"; return; }
  const ageSeconds = getDataAgeSeconds();
  const ageMinutes = Math.floor(ageSeconds / 60);
  const severity = getAgeSeverity();
  if (severity === "fresh") { bar.className = "cacheWarningBar hidden"; return; }
  const message = state.lastLoadFailed
    ? `Data is ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} old. Last refresh failed, so the board is showing the last available shared dataset.`
    : `Data is ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} old. Showing last available.`;
  text.textContent = message;
  bar.className = `cacheWarningBar ${severity === "danger" ? "danger" : "warning"}`;
}

function renderCacheMeta() {
  const ageEl = document.getElementById("cacheAgeInfo");
  const cycleEl = document.getElementById("cacheCycleInfo");
  if (ageEl) ageEl.textContent = `Data age ${Math.floor(getDataAgeSeconds() / 60)}m`;
  if (cycleEl) cycleEl.textContent = `Shared ${Math.round((state.cacheSeconds || DEFAULT_CACHE_SECONDS) / 60)}m cache`;
}

function buildInstructions() {
  return `
    <p><strong>What this dashboard is for</strong></p>
    <ul>
      <li>This board gives a fast operational view of Pakistan related scheduled passenger flights with a default focus on Islamabad.</li>
      <li>It is built to help users spot disruption, likely passenger impact, and the next useful operational questions without making a fresh API call every time a local filter changes.</li>
    </ul>

    <p><strong>How the model works</strong></p>
    <ul>
      <li>The backend uses FlightAware scheduled arrivals and scheduled departures endpoints.</li>
      <li>Islamabad is the default operational scope and uses deeper coverage.</li>
      <li>Lahore and Karachi are now on demand. They are only fetched when you choose LHE, KHI, or ALL in the airport filter.</li>
      <li>To control cost, Lahore and Karachi are limited to one page each. Islamabad keeps broader coverage. ALL uses Islamabad plus one page each for Lahore and Karachi.</li>
      <li>Each airport scope is cached behind a shared 60 minute CDN cache. Shared means users looking at the same scope within that hour should see the same dataset.</li>
      <li>If nobody opens the dashboard, there should be no new upstream pull. The first user after cache expiry triggers the next refresh for that scope.</li>
      <li>The countdown is tied to the shared cached dataset generation time, not when your browser tab opened.</li>
      <li><strong>Cache updated</strong> is when the current shared dataset for that scope was generated.</li>
      <li><strong>Data age</strong> is how old that dataset is now.</li>
    </ul>

    <p><strong>Warning and status logic</strong></p>
    <ul>
      <li>Fresh means the shared dataset is under 5 minutes old.</li>
      <li>Warning means the shared dataset is 5 minutes old or more. A yellow banner appears and the status pill changes to Warning.</li>
      <li>Stale means the shared dataset is 30 minutes old or more, or the last refresh failed. A red banner appears and the status pill changes to Stale.</li>
      <li>Pause only pauses the auto refresh behaviour in your current tab. It does not globally stop the shared cache from refreshing if another request arrives after expiry.</li>
    </ul>

    <p><strong>What PAX means</strong></p>
    <ul>
      <li><strong>PAX</strong> means passengers.</li>
      <li>The board does not have airline booking counts. PAX is an estimate, not an actual manifest total.</li>
      <li>The estimate is calculated from an aircraft seat assumption multiplied by the selected load factor.</li>
      <li>Example: a 180 seat aircraft at 85% load factor is shown as about 153 PAX.</li>
      <li>The load factor slider changes only the passenger estimate. It does not change times, delays, or status.</li>
    </ul>

    <p><strong>How to use the board</strong></p>
    <ul>
      <li><strong>Day</strong> switches between today, tomorrow, and all flights in the current cached scope.</li>
      <li><strong>Direction</strong> filters arrivals, departures, or both.</li>
      <li><strong>Airport</strong> changes the dataset scope. ISB is the default. LHE and KHI fetch on demand. ALL fetches all three airports with lighter depth for Lahore and Karachi.</li>
      <li><strong>Airline</strong> narrows the visible flights to one carrier.</li>
      <li><strong>Status</strong> narrows the visible flights to one operational state.</li>
      <li><strong>Show smaller carriers</strong> expands beyond the main airline set used for the standard operational view.</li>
      <li><strong>PKT / UK</strong> switches the displayed time reference for all times in the board.</li>
      <li><strong>Export</strong> downloads the currently filtered Flights view as CSV.</li>
    </ul>

    <p><strong>How the tabs work</strong></p>
    <ul>
      <li><strong>Flights</strong> shows the underlying flight rows.</li>
      <li><strong>Airlines</strong> groups the visible rows by carrier and shows estimated passenger totals and simple performance indicators.</li>
      <li><strong>Airports</strong> gives a quick overview for Pakistan airports and key hubs based on the current visible scope.</li>
    </ul>

    <p><strong>How the KPIs work</strong></p>
    <ul>
      <li><strong>Total Flights</strong> is the number of visible rows after filters.</li>
      <li><strong>Cancelled</strong> shows the number of cancelled flights and the percentage of the visible board. The tile lights red when one or more cancellations are present.</li>
      <li><strong>Delayed >60m</strong> counts flights delayed by 60 minutes or more. The tile lights amber when one or more are present.</li>
      <li><strong>Pre dep Delays</strong> counts delayed departures that have not yet actually departed.</li>
      <li><strong>Cancelled PAX</strong>, <strong>Delayed >60 PAX</strong>, and <strong>Total Disrupted PAX</strong> only sum estimated passengers on affected flights.</li>
      <li><strong>Total Disrupted PAX</strong> is cancelled plus diverted plus delayed over 60 minutes.</li>
    </ul>`;
}

function buildBriefReadout() {
  const rows = applyFilters(baseClientFilteredRows());
  const cancelled = rows.filter(isCancelled);
  const delayed = rows.filter(isDelayed60);
  const diverted = rows.filter(isDiverted);
  const severe = rows.filter((r) => disruptionPriority(r) > 0).sort((a, b) => {
    const p = disruptionPriority(b) - disruptionPriority(a);
    if (p !== 0) return p;
    return Number(b.delayMinutes || 0) - Number(a.delayMinutes || 0);
  }).slice(0, 8);
  const keyHubs = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "BKK", "KWI", "BAH"];
  const nextOutboundHubs = rows.filter((r) => r.direction === "Departure").filter((r) => keyHubs.includes(String(r.destination || "").toUpperCase())).sort((a, b) => toMillis(bestDepTime(a) || a.scheduledDep) - toMillis(bestDepTime(b) || b.scheduledDep)).slice(0, 8);
  const cancelledPax = cancelled.reduce((sum, f) => sum + estimatePax(f), 0);
  const delayedPax = delayed.reduce((sum, f) => sum + estimatePax(f), 0);
  const divertedPax = diverted.reduce((sum, f) => sum + estimatePax(f), 0);
  return `
    <p><strong>Current scope:</strong> ${escapeHtml(state.scopeLabel)}.</p>
    <p><strong>Current filtered board:</strong> ${rows.length} flights.</p>
    <p><strong>Data age:</strong> ${Math.floor(getDataAgeSeconds() / 60)} minutes.</p>
    <p><strong>Active time reference:</strong> ${getTimeZoneInfo().label}.</p>
    <p><strong>Current load factor assumption:</strong> ${state.loadFactor}%.</p>
    <p><strong>Disruption picture:</strong> ${cancelled.length} cancelled, ${diverted.length} diverted, ${delayed.length} delayed over 60 minutes.</p>
    <p><strong>Estimated affected passengers:</strong> ~${formatNumber(cancelledPax)} cancelled PAX, ~${formatNumber(divertedPax)} diverted PAX, ~${formatNumber(delayedPax)} delayed PAX.</p>
    <p><strong>Most severe rows:</strong></p>
    <ul>${severe.length ? severe.map((r) => `<li>${r.number} ${r.airline} ${r.origin} to ${r.destination} ${disruptionLabel(r)} ~${formatNumber(estimatePax(r))} PAX</li>`).join("") : "<li>No severe disruption rows in the current view.</li>"}</ul>
    <p><strong>Next available outbound options to key hubs:</strong></p>
    <ul>${nextOutboundHubs.length ? nextOutboundHubs.map((r) => `<li>${r.number} ${r.airline} ${r.origin} to ${r.destination} at ${displayTime(bestDepTime(r) || r.scheduledDep)} showing ${r.status} ~${formatNumber(estimatePax(r))} PAX</li>`).join("") : "<li>No key hub departures shown in the current filtered view.</li>"}</ul>`;
}

function buildAirlineStatus() {
  return `<p><strong>Use these official airline pages alongside the board during disruption.</strong></p><div class="linkListCompact">${AIRLINE_STATUS_LINKS.map((link) => `<a class="statusLinkCardCompact" href="${link.url}" target="_blank" rel="noopener noreferrer"><span class="statusLinkNameCompact">${link.name}</span><span class="statusLinkNoteCompact">${link.note}</span></a>`).join("")}</div>`;
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tabPanel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`));
}

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(baseClientFilteredRows());
  renderRows(rows);
  renderAirlines(rows);
  renderAirportCards(rows);
  renderDisruptionFeed(rows);
  renderKpis(rows);
  const baseRows = baseClientFilteredRows();
  fillSelect("airlineFilter", [...new Set(baseRows.map((f) => f.airline).filter(Boolean))].sort());
  const airlineEl = document.getElementById("airlineFilter");
  if (![...airlineEl.options].some((o) => o.value === state.airline)) {
    state.airline = "All";
    airlineEl.value = "All";
  }
  renderLoadFactorUi();
  document.getElementById("timezoneNote").textContent = getTimeZoneInfo().label;
  renderStaleStatus();
  renderCacheWarning();
  renderCacheMeta();
}

function updateCacheUi() {
  const total = Math.max(1, state.cacheSeconds || DEFAULT_CACHE_SECONDS);
  const ageSeconds = getDataAgeSeconds();
  state.cacheRemaining = Math.max(0, total - ageSeconds);
  const remaining = state.cacheRemaining;
  const countdown = document.getElementById("cacheCountdown");
  const fill = document.getElementById("cacheBarFill");
  const pauseBtn = document.getElementById("pauseRefreshBtn");
  if (countdown) countdown.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  if (fill) fill.style.width = `${(remaining / total) * 100}%`;
  if (pauseBtn) pauseBtn.textContent = state.refreshPaused ? "▶" : "❚❚";
  renderStaleStatus();
  renderCacheWarning();
  renderCacheMeta();
}

function startCacheTimer() {
  updateCacheUi();
  if (window.cacheTimer) clearInterval(window.cacheTimer);
  window.cacheTimer = setInterval(() => {
    if (state.refreshPaused) {
      updateCacheUi();
      return;
    }
    updateCacheUi();
    if (state.cacheRemaining <= 0) {
      load(true);
    }
  }, 1000);
}

async function load(isBackground = false) {
  try {
    const res = await fetch(`/api/flights?airport=${encodeURIComponent(state.airport)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.warnings?.[0] || "Failed to load board data.");
    state.raw = data;
    state.cacheSeconds = Number(data.cacheSeconds || DEFAULT_CACHE_SECONDS);
    state.scopeLabel = data.scopeLabel || "Islamabad default";
    const generatedAtMs = data.generatedAt ? new Date(data.generatedAt).getTime() : Date.now();
    state.datasetGeneratedAtMs = generatedAtMs;
    state.lastLoadFailed = false;

    fillSelect("airportFilter", safeArray(data.filtersMeta?.airports || ["ISB", "LHE", "KHI", "ALL"]), false);
    fillSelect("statusFilter", safeArray(data.filtersMeta?.statuses || []));
    fillSelect("directionFilter", safeArray(data.filtersMeta?.directions || []), false);

    document.getElementById("airportFilter").value = state.airport;
    document.getElementById("directionFilter").value = state.direction;
    document.getElementById("statusFilter").value = state.status;
    document.getElementById("minorCarrierToggle").checked = state.includeMinor;

    const updated = data.generatedAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(data.generatedAt)) : "—";
    const cacheInfo = document.getElementById("cacheInfo");
    if (cacheInfo) cacheInfo.textContent = `Cache updated ${updated} PKT`;

    renderWarnings([]);

    refreshView();
    if (!window.cacheTimer) startCacheTimer();
    else updateCacheUi();
    if (!isBackground) updateCacheUi();
  } catch (error) {
    state.lastLoadFailed = true;
    renderWarnings([error.message || "Failed to load board data."]);
    renderStaleStatus();
    renderCacheWarning();
    renderCacheMeta();
  }
}

function exportRows() {
  if (!state.raw) return;
  const rows = applyFilters(baseClientFilteredRows());
  const headers = ["Flight", "Airline", "Origin", "Destination", "Departure", "Arrival", "Status", "Delay", "Aircraft", "Type", "Estimated PAX", "Diverted"];
  const lines = rows.map((row) => [row.number || "", row.airline || "", row.origin || "", row.destination || "", displayTime(bestDepTime(row)), displayTime(bestArrTime(row)), row.status || "", delayText(row), row.aircraft || "", row.type || "", estimatePax(row), row.diverted ? "Yes" : ""]);
  const csv = [headers, ...lines].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pakistan-flight-board.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function openInstructions() { const modal = document.getElementById("instructionsModal"); const body = document.getElementById("instructionsBody"); if (!modal || !body) return; body.innerHTML = buildInstructions(); modal.classList.remove("hidden"); }
function closeInstructions() { const modal = document.getElementById("instructionsModal"); if (modal) modal.classList.add("hidden"); }
function openBrief() { const modal = document.getElementById("briefModal"); const body = document.getElementById("briefBody"); if (!modal || !body) return; body.innerHTML = buildBriefReadout(); modal.classList.remove("hidden"); }
function closeBrief() { const modal = document.getElementById("briefModal"); if (modal) modal.classList.add("hidden"); }
function openAirlineStatus() { const modal = document.getElementById("airlineStatusModal"); const body = document.getElementById("airlineStatusBody"); if (!modal || !body) return; body.innerHTML = buildAirlineStatus(); modal.classList.remove("hidden"); }
function closeAirlineStatus() { const modal = document.getElementById("airlineStatusModal"); if (modal) modal.classList.add("hidden"); }

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("seg")) {
    document.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.day = e.target.dataset.day;
    refreshView();
  }
  if (e.target.classList.contains("timeBtn")) {
    document.querySelectorAll(".timeBtn").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.timezoneMode = e.target.dataset.tz;
    refreshView();
  }
  if (e.target.classList.contains("tab")) setActiveTab(e.target.dataset.tab);
});

document.getElementById("directionFilter").addEventListener("change", (e) => { state.direction = e.target.value; refreshView(); });
document.getElementById("airportFilter").addEventListener("change", async (e) => { state.airport = e.target.value; state.airline = "All"; await load(false); });
document.getElementById("airlineFilter").addEventListener("change", (e) => { state.airline = e.target.value; refreshView(); });
document.getElementById("statusFilter").addEventListener("change", (e) => { state.status = e.target.value; refreshView(); });
document.getElementById("minorCarrierToggle").addEventListener("change", (e) => { state.includeMinor = e.target.checked; state.airline = "All"; refreshView(); });
document.getElementById("loadFactorSlider").addEventListener("input", (e) => { state.loadFactor = Number(e.target.value || 85); refreshView(); });
document.getElementById("pauseRefreshBtn").addEventListener("click", () => { state.refreshPaused = !state.refreshPaused; updateCacheUi(); });
document.getElementById("exportBtn").addEventListener("click", exportRows);

document.getElementById("resetFilters").addEventListener("click", async () => {
  state.day = "today";
  state.direction = "Both";
  state.airport = "ISB";
  state.airline = "All";
  state.status = "All";
  state.includeMinor = false;
  state.loadFactor = 85;
  document.querySelectorAll(".seg").forEach((x) => x.classList.toggle("active", x.dataset.day === "today"));
  document.getElementById("loadFactorSlider").value = "85";
  await load(false);
});

document.getElementById("instructionsBtn").addEventListener("click", openInstructions);
document.getElementById("closeInstructionsBtn").addEventListener("click", closeInstructions);
document.getElementById("briefBtn").addEventListener("click", openBrief);
document.getElementById("closeBriefBtn").addEventListener("click", closeBrief);
document.getElementById("airlineStatusBtn").addEventListener("click", openAirlineStatus);
document.getElementById("closeAirlineStatusBtn").addEventListener("click", closeAirlineStatus);
document.getElementById("instructionsModal").addEventListener("click", (e) => { if (e.target.id === "instructionsModal") closeInstructions(); });
document.getElementById("briefModal").addEventListener("click", (e) => { if (e.target.id === "briefModal") closeBrief(); });
document.getElementById("airlineStatusModal").addEventListener("click", (e) => { if (e.target.id === "airlineStatusModal") closeAirlineStatus(); });

load();
