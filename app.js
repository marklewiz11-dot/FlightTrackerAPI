const DEFAULT_CACHE_SECONDS = 3600;
const WARNING_SECONDS = 5 * 60;
const DANGER_SECONDS = 30 * 60;
const KEY_HUBS = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "MCT", "BAH", "KWI", "BKK"];

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
  scopeLabel: "Islamabad default",
  snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving not configured.", recentCount: null }
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

const EXTERNAL_GULF_BASELINE = {
  ISB: [
    { hub: "DOH", airline: "Qatar Airways", weekly: 14 },
    { hub: "DXB", airline: "Emirates", weekly: 10 },
    { hub: "DXB", airline: "flydubai", weekly: 7 },
    { hub: "AUH", airline: "Etihad Airways", weekly: 14 }
  ],
  LHE: [
    { hub: "DOH", airline: "Qatar Airways", weekly: 14 },
    { hub: "DXB", airline: "Emirates", weekly: 10 },
    { hub: "DXB", airline: "flydubai", weekly: 7 },
    { hub: "AUH", airline: "Etihad Airways", weekly: 14 }
  ],
  KHI: [
    { hub: "DOH", airline: "Qatar Airways", weekly: 14 },
    { hub: "DXB", airline: "Emirates", weekly: 20 },
    { hub: "AUH", airline: "Etihad Airways", weekly: 14 }
  ]
};
EXTERNAL_GULF_BASELINE.ALL = [
  ...EXTERNAL_GULF_BASELINE.ISB,
  ...EXTERNAL_GULF_BASELINE.LHE,
  ...EXTERNAL_GULF_BASELINE.KHI
];

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

function getSelectedWindowDays() {
  return state.day === "all" ? 2 : 1;
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
  if (s.includes("cancel") || s.includes("divert")) return "status-bad";
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
function isKeyHub(row) { return KEY_HUBS.includes(String(row.destination || "").toUpperCase()); }
function isUsableDeparture(row) { return row.direction === "Departure" && isKeyHub(row) && !isCancelled(row) && !isDiverted(row) && !isDelayed60(row); }

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

function getEarlyWarningRows() {
  return dayFilteredRows(baseClientFilteredRows());
}

function getBaselineEntriesForScope() {
  return EXTERNAL_GULF_BASELINE[state.airport] || EXTERNAL_GULF_BASELINE.ISB;
}

function getBaselineComparison() {
  const rows = getEarlyWarningRows();
  const outbound = rows.filter((r) => r.direction === "Departure");
  const windowDays = getSelectedWindowDays();
  const entries = getBaselineEntriesForScope();

  const routeLines = entries.map((entry) => {
    const expected = (entry.weekly / 7) * windowDays;
    const matching = outbound.filter((r) =>
      String(r.destination || "").toUpperCase() === entry.hub &&
      String(r.airline || "").toLowerCase() === entry.airline.toLowerCase()
    );
    const usable = matching.filter((r) => !isCancelled(r) && !isDiverted(r) && !isDelayed60(r));
    return {
      ...entry,
      expected,
      current: matching.length,
      usable: usable.length,
      estPax: usable.reduce((sum, r) => sum + estimatePax(r), 0)
    };
  });

  const expectedTotal = routeLines.reduce((sum, r) => sum + r.expected, 0);
  const currentTotal = routeLines.reduce((sum, r) => sum + r.current, 0);
  const usableTotal = routeLines.reduce((sum, r) => sum + r.usable, 0);
  const estPaxTotal = routeLines.reduce((sum, r) => sum + r.estPax, 0);
  let signal = "Normal";
  if (expectedTotal > 0) {
    const ratio = usableTotal / expectedTotal;
    if (ratio < 0.4) signal = "Low";
    else if (ratio < 0.75) signal = "Tightening";
  }
  return { routeLines, expectedTotal, currentTotal, usableTotal, estPaxTotal, signal, windowDays };
}

function getUpcomingUsableOutbound(hoursAhead = 24) {
  const nowMs = Date.now();
  const horizonMs = nowMs + hoursAhead * 60 * 60 * 1000;
  return getEarlyWarningRows()
    .filter((row) => isUsableDeparture(row))
    .filter((row) => {
      const dep = toMillis(bestDepTime(row) || row.scheduledDep);
      return dep > nowMs && dep <= horizonMs;
    })
    .sort((a, b) => toMillis(bestDepTime(a) || a.scheduledDep) - toMillis(bestDepTime(b) || b.scheduledDep));
}

function getEarlyWarningModel() {
  const baseline = getBaselineComparison();
  const upcoming12 = getUpcomingUsableOutbound(12);
  const upcoming24 = getUpcomingUsableOutbound(24);
  const ratio = baseline.expectedTotal > 0 ? baseline.usableTotal / baseline.expectedTotal : 1;
  let severity = "low";
  let signal = "Normal";
  if (state.lastLoadFailed || ratio < 0.4 || upcoming12.length <= 1) {
    severity = "high";
    signal = "High risk";
  } else if (ratio < 0.75 || upcoming12.length <= 3) {
    severity = "medium";
    signal = "Tightening";
  }
  const usablePax12 = upcoming12.reduce((sum, row) => sum + estimatePax(row), 0);
  const usablePax24 = upcoming24.reduce((sum, row) => sum + estimatePax(row), 0);
  return { baseline, upcoming12, upcoming24, ratio, severity, signal, usablePax12, usablePax24 };
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
    const meta = `${row.aircraft || "—"} • ${row.airlineCode || "—"} • LF ${state.loadFactor}% • ~${pax} PAX`;
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
    if (isDelayed(row)) {
      item.delayTotal += Number(row.delayMinutes || 0);
      item.delayCount += 1;
    }
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
  if (!hubCards.length) {
    hubEl.innerHTML = `<div class="emptyBlock">No hub data in the current filters.</div>`;
    return;
  }
  hubEl.innerHTML = hubCards.map((card) => `<div class="airportCard ${card.cancelled > 0 ? "airportCardAlert" : ""}"><div class="airportCodeRow"><div class="airportCode">${card.code}</div>${card.cancelled > 0 ? `<div class="airportAlertDot">• ${card.cancelled}</div>` : ""}</div><div class="airportName">${card.name}</div><div class="airportStatsLine"><span>Total <strong>${card.total}</strong></span><span class="badText">Canx <strong>${card.cancelled}</strong></span><span class="warnText">Delay >60 <strong>${card.delayed}</strong></span></div><div class="airportNext">Next: ${card.nextMovement}</div></div>`).join("");
}

function renderDisruptionFeed(rows) {
  const el = document.getElementById("disruptionFeed");
  const disruptions = [...rows].filter(isDisrupted).sort((a, b) => {
    const priority = disruptionPriority(b) - disruptionPriority(a);
    if (priority !== 0) return priority;
    return toMillis(bestDepTime(a) || bestArrTime(a)) - toMillis(bestDepTime(b) || bestArrTime(b));
  }).slice(0, 6);
  if (!disruptions.length) {
    el.innerHTML = `<div class="feedEmpty">No major disruptions in the current filtered view.</div>`;
    return;
  }
  el.innerHTML = disruptions.map((row) => {
    const timeValue = displayTime(bestDepTime(row) || bestArrTime(row));
    const route = `${row.origin || "—"} → ${row.destination || "—"}`;
    return `<div class="feedRow"><div class="feedTime">${timeValue}</div><div class="feedFlight">${row.number}</div><div class="feedRoute">${route}</div><div class="feedStatus ${isCancelled(row) ? "badText" : "warnText"}">• ${disruptionLabel(row)}</div></div>`;
  }).join("");
}

function renderEarlyWarning() {
  const cardsEl = document.getElementById("earlyWarningCards");
  const rowsEl = document.getElementById("earlyWarningRows");
  const outboundEl = document.getElementById("usableOutboundRows");
  const snapshotEl = document.getElementById("snapshotMetaText");
  const model = getEarlyWarningModel();
  const severityClass = model.severity === "high" ? "warningRiskHigh" : (model.severity === "medium" ? "warningRiskMedium" : "warningRiskLow");
  cardsEl.innerHTML = `
    <div class="warningCard ${severityClass}"><div class="warningCardLabel">Overall signal</div><div class="warningCardValue">${model.signal}</div><div class="warningCardSub">Based on current usable hub departures versus published normal for the selected scope and day window.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Usable departures next 12h</div><div class="warningCardValue">${model.upcoming12.length}</div><div class="warningCardSub">Operational departures to key hubs that are not cancelled, diverted, or delayed more than 60 minutes.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Est. usable PAX next 12h</div><div class="warningCardValue">${formatNumber(model.usablePax12)}</div><div class="warningCardSub">Estimated onward passenger carrying capacity using the selected load factor.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Published normal this window</div><div class="warningCardValue">${model.baseline.expectedTotal.toFixed(1)}</div><div class="warningCardSub">Approximate baseline flights from published Gulf carrier schedules for this scope.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Snapshots</div><div class="warningCardValue">${state.snapshotMeta.recentCount ?? "—"}</div><div class="warningCardSub">${escapeHtml(state.snapshotMeta.saved ? "Latest snapshot saved on refresh." : state.snapshotMeta.note || "Snapshot collection not active.")}</div></div>`;

  if (!model.baseline.routeLines.length) {
    rowsEl.innerHTML = `<tr><td colspan="7"><div class="emptyState">No baseline routes configured for this scope.</div></td></tr>`;
  } else {
    rowsEl.innerHTML = model.baseline.routeLines.map((line) => {
      let signal = { label: "Normal", cls: "signalLow" };
      if (line.usable === 0 && line.expected > 0) signal = { label: "Low", cls: "signalHigh" };
      else if (line.usable < line.expected) signal = { label: "Tightening", cls: "signalMedium" };
      return `<tr>
        <td>${line.hub}</td>
        <td>${escapeHtml(line.airline)}</td>
        <td>${line.expected.toFixed(1)}</td>
        <td>${line.current}</td>
        <td>${line.usable}</td>
        <td>~${formatNumber(line.estPax)}</td>
        <td><span class="signalPill ${signal.cls}">${signal.label}</span></td>
      </tr>`;
    }).join("");
  }

  if (!model.upcoming24.length) {
    outboundEl.innerHTML = `<tr><td colspan="6"><div class="emptyState">No usable key hub departures in the next 24 hours in the current scope.</div></td></tr>`;
  } else {
    outboundEl.innerHTML = model.upcoming24.slice(0, 12).map((row) => `<tr>
      <td>${escapeHtml(row.number || "—")}</td>
      <td>${escapeHtml(row.airline || "—")}</td>
      <td>${escapeHtml(row.origin || "—")} → ${escapeHtml(row.destination || "—")}</td>
      <td>${displayTime(bestDepTime(row) || row.scheduledDep)}</td>
      <td><span class="statusPill ${statusClass(row.status)}"><span class="statusDot"></span>${displayStatus(row)}</span></td>
      <td>~${formatNumber(estimatePax(row))}</td>
    </tr>`).join("");
  }

  snapshotEl.innerHTML = `${escapeHtml(state.snapshotMeta.note || "Snapshot saving has not been configured yet.")}${state.snapshotMeta.pathname ? `<br><span class="tableSubMeta">Latest snapshot: ${escapeHtml(state.snapshotMeta.pathname)}</span>` : ""}`;
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
    : `Data is ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} old. Showing the last available shared dataset.`;
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
    <p><strong>What this dashboard shows</strong></p>
    <ul>
      <li>This board gives a live operational view of Pakistan related commercial flights with Islamabad as the default scope.</li>
      <li>The purpose is to spot disruption quickly and give an early warning when practical outbound options to key hubs are starting to thin out.</li>
    </ul>

    <p><strong>How to use it</strong></p>
    <ul>
      <li><strong>Flights</strong> shows the live flight rows for the current scope.</li>
      <li><strong>Early Warning</strong> compares current usable outbound hub departures against a published Gulf schedule baseline and highlights where options are tightening.</li>
      <li><strong>Airlines</strong> groups the visible rows by carrier.</li>
      <li><strong>Airports</strong> shows a quick airport and hub overview.</li>
      <li><strong>Day</strong> switches between today, tomorrow, and all flights in the shared cached window.</li>
      <li><strong>Airport</strong> changes the scope. Islamabad is the default. Lahore and Karachi load on demand. All gives all three airports with lighter depth for Lahore and Karachi.</li>
      <li><strong>PKT / UK</strong> switches the displayed time reference for the board.</li>
      <li><strong>Load factor</strong> changes only the passenger estimate, not the flight status or timings.</li>
    </ul>

    <p><strong>How to read the board</strong></p>
    <ul>
      <li><strong>PAX</strong> means estimated passengers. It is not a booking count. It is a seat estimate based on aircraft type multiplied by the selected load factor.</li>
      <li><strong>Cancelled</strong> and <strong>Delayed >60m</strong> tiles highlight material disruption. Cancelled lights red when cancellations are present. Delayed over 60 minutes lights amber when present.</li>
      <li>The sub line under each flight uses the aircraft type, airline code, load factor, and estimated PAX. The Airline column shows the full carrier name.</li>
      <li><strong>Fresh</strong>, <strong>Warning</strong>, and <strong>Stale</strong> are based on the age of the shared cached dataset for the current scope, not when your browser tab opened.</li>
    </ul>

    <p><strong>How to read Early Warning</strong></p>
    <ul>
      <li>The Early Warning view focuses on practical outbound hub options rather than every flight equally.</li>
      <li><strong>Usable</strong> means a key hub departure that is not cancelled, not diverted, and not delayed more than 60 minutes.</li>
      <li><strong>Published normal</strong> is an external baseline built from published schedules for key Gulf carriers into Pakistan.</li>
      <li>A tightening or low signal means the current usable options are materially below the published normal level for the selected scope and day window.</li>
      <li>Snapshots begin saving from fresh refreshes once private Vercel Blob is configured, so the historical baseline can strengthen over time.</li>
    </ul>`;
}

function buildBriefReadout() {
  const rows = getEarlyWarningRows();
  const cancelled = rows.filter(isCancelled);
  const delayed = rows.filter(isDelayed60);
  const diverted = rows.filter(isDiverted);
  const severe = rows.filter((r) => disruptionPriority(r) > 0).sort((a, b) => {
    const p = disruptionPriority(b) - disruptionPriority(a);
    if (p !== 0) return p;
    return Number(b.delayMinutes || 0) - Number(a.delayMinutes || 0);
  }).slice(0, 8);
  const nextOutboundHubs = getUpcomingUsableOutbound(24).slice(0, 8);
  const cancelledPax = cancelled.reduce((sum, f) => sum + estimatePax(f), 0);
  const delayedPax = delayed.reduce((sum, f) => sum + estimatePax(f), 0);
  const divertedPax = diverted.reduce((sum, f) => sum + estimatePax(f), 0);
  const warning = getEarlyWarningModel();
  return `
    <p><strong>Current scope:</strong> ${escapeHtml(state.scopeLabel)}.</p>
    <p><strong>Current filtered board:</strong> ${rows.length} flights.</p>
    <p><strong>Data age:</strong> ${Math.floor(getDataAgeSeconds() / 60)} minutes.</p>
    <p><strong>Early warning signal:</strong> ${warning.signal}. Usable key hub departures in next 12 hours: ${warning.upcoming12.length}. Estimated usable PAX in next 12 hours: ~${formatNumber(warning.usablePax12)}.</p>
    <p><strong>Disruption picture:</strong> ${cancelled.length} cancelled, ${diverted.length} diverted, ${delayed.length} delayed over 60 minutes.</p>
    <p><strong>Estimated affected passengers:</strong> ~${formatNumber(cancelledPax)} cancelled PAX, ~${formatNumber(divertedPax)} diverted PAX, ~${formatNumber(delayedPax)} delayed PAX.</p>
    <p><strong>Most severe rows:</strong></p>
    <ul>${severe.length ? severe.map((r) => `<li>${r.number} ${r.airline} ${r.origin} to ${r.destination} ${disruptionLabel(r)} ~${formatNumber(estimatePax(r))} PAX</li>`).join("") : "<li>No severe disruption rows in the current scope.</li>"}</ul>
    <p><strong>Next usable outbound options to key hubs:</strong></p>
    <ul>${nextOutboundHubs.length ? nextOutboundHubs.map((r) => `<li>${r.number} ${r.airline} ${r.origin} to ${r.destination} at ${displayTime(bestDepTime(r) || r.scheduledDep)} showing ${r.status} ~${formatNumber(estimatePax(r))} PAX</li>`).join("") : "<li>No usable key hub departures shown in the next 24 hours for the current scope.</li>"}</ul>`;
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
  renderEarlyWarning();
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
    state.snapshotMeta = data.snapshotMeta || state.snapshotMeta;
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
  const lines = rows.map((row) => [
    row.number || "",
    row.airline || "",
    row.origin || "",
    row.destination || "",
    displayTime(bestDepTime(row)),
    displayTime(bestArrTime(row)),
    row.status || "",
    delayText(row),
    row.aircraft || "",
    row.type || "",
    estimatePax(row),
    row.diverted ? "Yes" : ""
  ]);
  const csv = [headers, ...lines]
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
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
