const DEFAULT_CACHE_SECONDS = 3600;
const WARNING_SECONDS = 5 * 60;
const DANGER_SECONDS = 30 * 60;
const KEY_HUBS = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "MCT", "BAH", "KWI", "BKK"];

let state = {
  raw: null,
  day: "all",
  direction: "Both",
  airport: "ALL",
  airline: "All",
  status: "All",
  includeMinor: false,
  timezoneMode: "PKT",
  mode: "normal",
  modeMeta: { key: "normal", label: "Normal mode", note: "Normal mode uses a live FlightAware pull behind an 8 hour shared cache. The first refresh after expiry updates the shared dataset and saves history.", pageDepthByAirport: { ISB: 6, LHE: 3, KHI: 3 }, dataSource: "live" },
  cacheSeconds: 8 * 60 * 60,
  cacheRemaining: 8 * 60 * 60,
  refreshPaused: false,
  activeTab: "flights",
  datasetGeneratedAtMs: null,
  lastLoadFailed: false,
  loadFactor: 85,
  scopeLabel: "All airports",
  snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving not configured.", recentCount: null },
  historyChartGranularity: "day",
  historyChartAirport: "ISB"
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
function currentScopeLabel() {
  const code = String(state.airport || "ALL").toUpperCase();
  if (code === "ALL") return "All airports";
  return PAKISTAN_AIRPORT_NAMES[code] || code;
}

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

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotsAll(times) {
  return WEEKDAY_ORDER.reduce((acc, day) => {
    acc[day] = [...times];
    return acc;
  }, {});
}

const PUBLISHED_SCHEDULE_BASELINE = {
  ISB: [
    { origin: "ISB", hub: "DOH", airline: "Qatar Airways", weeklyFallback: 7, slotsByWeekday: slotsAll(["09:45"]) },
    { origin: "ISB", hub: "DXB", airline: "Emirates", weeklyFallback: 10 },
    { origin: "ISB", hub: "DXB", airline: "flydubai", weeklyFallback: 7 },
    { origin: "ISB", hub: "AUH", airline: "Etihad Airways", weeklyFallback: 14 },
    { origin: "ISB", hub: "IST", airline: "Turkish Airlines", weeklyFallback: 7, slotsByWeekday: slotsAll(["06:15"]) },
    { origin: "ISB", hub: "LGW", airline: "British Airways", weeklyFallback: 3, slotsByWeekday: {
      Sun: [], Mon: ["00:35"], Tue: [], Wed: [], Thu: ["00:35"], Fri: [], Sat: ["00:35"]
    } },
    { origin: "ISB", hub: "BKK", airline: "Thai Airways", weeklyFallback: 4, slotsByWeekday: {
      Sun: [], Mon: ["23:20"], Tue: [], Wed: ["23:20"], Thu: [], Fri: ["23:20"], Sat: ["23:20"]
    } }
  ],
  LHE: [
    { origin: "LHE", hub: "DOH", airline: "Qatar Airways", weeklyFallback: 14 },
    { origin: "LHE", hub: "DXB", airline: "Emirates", weeklyFallback: 10 },
    { origin: "LHE", hub: "DXB", airline: "flydubai", weeklyFallback: 7, slotsByWeekday: slotsAll(["12:05"]) },
    { origin: "LHE", hub: "AUH", airline: "Etihad Airways", weeklyFallback: 14 },
    { origin: "LHE", hub: "IST", airline: "Turkish Airlines", weeklyFallback: 7, slotsByWeekday: slotsAll(["10:10"]) },
    { origin: "LHE", hub: "BKK", airline: "Thai Airways", weeklyFallback: 6 }
  ],
  KHI: [
    { origin: "KHI", hub: "DOH", airline: "Qatar Airways", weeklyFallback: 7, slotsByWeekday: slotsAll(["04:20"]) },
    { origin: "KHI", hub: "DXB", airline: "Emirates", weeklyFallback: 20 },
    { origin: "KHI", hub: "DXB", airline: "flydubai", weeklyFallback: 28 },
    { origin: "KHI", hub: "AUH", airline: "Etihad Airways", weeklyFallback: 28 },
    { origin: "KHI", hub: "IST", airline: "Turkish Airlines", weeklyFallback: 7, slotsByWeekday: slotsAll(["06:15"]) },
    { origin: "KHI", hub: "BKK", airline: "Thai Airways", weeklyFallback: 5 }
  ]
};
PUBLISHED_SCHEDULE_BASELINE.ALL = [
  ...PUBLISHED_SCHEDULE_BASELINE.ISB,
  ...PUBLISHED_SCHEDULE_BASELINE.LHE,
  ...PUBLISHED_SCHEDULE_BASELINE.KHI
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

function getPakistanNow() {
  return new Date(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date()).replace(/(\d{2})\/(\d{2})\/(\d{4}),\s*/, "$3-$1-$2T") + "+05:00");
}

function getSelectedPakistanDates() {
  const now = getPakistanNow();
  const today = new Date(now.getTime());
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (state.day === "today") return [today];
  if (state.day === "tomorrow") return [tomorrow];
  return [today, tomorrow];
}

function getWeekdayKeyForDate(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(date);
}

function getWeekdayKeyForIso(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(new Date(value));
}

function getPakistanDateKey(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function getPakistanTimeKey(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatSlotTimes(slots) {
  const unique = [...new Set((slots || []).filter(Boolean))].sort();
  if (!unique.length) return "—";
  return unique.join(", ");
}

function getPublishedWindowSlots(entry) {
  const slotsByWeekday = entry?.slotsByWeekday || {};
  return getSelectedPakistanDates().flatMap((date) => slotsByWeekday[getWeekdayKeyForDate(date)] || []);
}

function getRollingBaselineForEntry(entry) {
  const history = state.raw?.historyMeta?.rollingByRouteWeekday || {};
  const routeKey = `${entry.origin || state.airport}|${entry.hub}|${entry.airline || ""}`;
  const routeHistory = history[routeKey] || {};
  const selectedDates = getSelectedPakistanDates();
  const dayModels = selectedDates
    .map((date) => routeHistory[getWeekdayKeyForDate(date)] || null)
    .filter(Boolean);

  if (!dayModels.length) {
    return { expectedCount: null, usableCount: null, slots: [], sampleCount: 0 };
  }

  const expectedCount = dayModels.reduce((sum, item) => sum + Number(item.expectedScheduledAvg || 0), 0);
  const usableCount = dayModels.reduce((sum, item) => sum + Number(item.expectedUsableAvg || 0), 0);
  const sampleCount = Math.min(...dayModels.map((item) => Number(item.sampleCount || 0)));
  const slots = dayModels.flatMap((item) => item.normalSlots || []);
  return { expectedCount, usableCount, slots, sampleCount };
}

function getWeeklyFallbackExpected(entry) {
  return (Number(entry?.weeklyFallback || 0) / 7) * getSelectedWindowDays();
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

function airportScopedRows(rows) {
  if (state.airport === "ALL") return rows;
  return rows.filter((r) => String(r.airportCode || r.origin || "").toUpperCase() === state.airport);
}

function applyFilters(rows) {
  let out = [...rows];
  out = airportScopedRows(out);
  out = dayFilteredRows(out);
  if (state.direction !== "Both") out = out.filter((r) => r.direction === state.direction);
  if (state.airline !== "All") out = out.filter((r) => r.airline === state.airline);
  if (state.status !== "All") out = out.filter((r) => r.status === state.status);
  return out;
}

function getEarlyWarningRows() {
  return dayFilteredRows(airportScopedRows(baseClientFilteredRows()));
}

function getBaselineEntriesForScope() {
  return PUBLISHED_SCHEDULE_BASELINE[state.airport] || PUBLISHED_SCHEDULE_BASELINE.ISB;
}

function getBaselineRouteKey(entry) {
  return `${String(entry.origin || state.airport).toUpperCase()}|${String(entry.hub || '').toUpperCase()}|${String(entry.airline || '').toLowerCase()}`;
}

function getTrackedBaselineRouteKeys() {
  return new Set(getBaselineEntriesForScope().map(getBaselineRouteKey));
}

function isTrackedBaselineRow(row) {
  const key = `${String(row.origin || state.airport).toUpperCase()}|${String(row.destination || '').toUpperCase()}|${String(row.airline || '').toLowerCase()}`;
  return getTrackedBaselineRouteKeys().has(key);
}

function getTrackedEarlyWarningRows() {
  return getEarlyWarningRows().filter((row) => row.direction === "Departure" && isTrackedBaselineRow(row));
}

function getCoverageSummary(filteredOutboundRows) {
  const coverage = state.raw?.coverageMeta?.departures;
  const shownCount = filteredOutboundRows.length;
  if (!coverage) {
    return { label: "Unknown", cls: "signalMedium", detail: `${shownCount} tracked departure row${shownCount === 1 ? "" : "s"} shown in the selected window.` };
  }
  if (coverage.truncatedPossible) {
    return {
      label: "Check coverage",
      cls: "signalHigh",
      detail: `${shownCount} tracked departure row${shownCount === 1 ? "" : "s"} shown in the selected window. The source pull signalled extra departure pages beyond the configured page cap, so scheduled counts may be understated.`
    };
  }
  return {
    label: "Good",
    cls: "signalLow",
    detail: `${shownCount} tracked departure row${shownCount === 1 ? "" : "s"} shown in the selected window. No extra departure page was signalled by the source pull.`
  };
}

function getBaselineComparison() {
  const outbound = getTrackedEarlyWarningRows();
  const entries = getBaselineEntriesForScope();

  const routeLines = entries.map((entry) => {
    const matching = outbound.filter((r) =>
      String(r.origin || "").toUpperCase() === String(entry.origin || state.airport).toUpperCase() &&
      String(r.destination || "").toUpperCase() === entry.hub &&
      String(r.airline || "").toLowerCase() === entry.airline.toLowerCase()
    );
    const usable = matching.filter((r) => !isCancelled(r) && !isDiverted(r) && !isDelayed60(r));

    const publishedSlots = getPublishedWindowSlots(entry);
    const rolling = getRollingBaselineForEntry(entry);
    const weeklyFallback = getWeeklyFallbackExpected(entry);

    let expected = weeklyFallback;
    let expectedDisplay = weeklyFallback.toFixed(1);
    let expectedSubline = "Checked weekly frequency fallback. Used where an exact current weekday slot pattern was not verified strongly enough to hard code.";
    let baselineSource = "weeklyFallback";

    if (publishedSlots.length) {
      expected = publishedSlots.length;
      expectedDisplay = String(publishedSlots.length);
      expectedSubline = `Published slots: ${formatSlotTimes(publishedSlots)}`;
      baselineSource = "publishedSlots";
    } else if (rolling.sampleCount >= 3 && rolling.expectedCount != null) {
      expected = rolling.expectedCount;
      expectedDisplay = rolling.expectedCount.toFixed(1);
      expectedSubline = `Observed rolling baseline from ${rolling.sampleCount} service day${rolling.sampleCount === 1 ? "" : "s"}: ${formatSlotTimes(rolling.slots)}`;
      baselineSource = "rollingHistory";
    }

    return {
      ...entry,
      expected,
      expectedDisplay,
      expectedSubline,
      baselineSource,
      rollingSampleCount: rolling.sampleCount,
      current: matching.length,
      usable: usable.length,
      estPax: usable.reduce((sum, r) => sum + estimatePax(r), 0)
    };
  });

  const expectedTotal = routeLines.reduce((sum, r) => sum + Number(r.expected || 0), 0);
  const currentTotal = routeLines.reduce((sum, r) => sum + r.current, 0);
  const usableTotal = routeLines.reduce((sum, r) => sum + r.usable, 0);
  const estPaxTotal = routeLines.reduce((sum, r) => sum + r.estPax, 0);
  let signal = "Normal";
  if (expectedTotal > 0) {
    const ratio = usableTotal / expectedTotal;
    if (ratio < 0.4) signal = "Low";
    else if (ratio < 0.75) signal = "Tightening";
  }
  return { routeLines, expectedTotal, currentTotal, usableTotal, estPaxTotal, signal };
}

function getUpcomingUsableOutbound(hoursAhead = 24) {
  const nowMs = Date.now();
  const horizonMs = nowMs + hoursAhead * 60 * 60 * 1000;
  return getTrackedEarlyWarningRows()
    .filter((row) => isUsableDeparture(row))
    .filter((row) => {
      const dep = toMillis(bestDepTime(row) || row.scheduledDep);
      return dep > nowMs && dep <= horizonMs;
    })
    .sort((a, b) => toMillis(bestDepTime(a) || a.scheduledDep) - toMillis(bestDepTime(b) || b.scheduledDep));
}

function getEarlyWarningModel() {
  const baseline = getBaselineComparison();
  const windowUsableRows = getTrackedEarlyWarningRows().filter((row) => isUsableDeparture(row));
  const nextOutbound = getUpcomingUsableOutbound(24);
  const ratio = baseline.expectedTotal > 0 ? baseline.usableTotal / baseline.expectedTotal : 1;
  let severity = "low";
  let signal = "Normal";
  if (state.lastLoadFailed || ratio < 0.4 || baseline.usableTotal <= 1) {
    severity = "high";
    signal = "High risk";
  } else if (ratio < 0.75 || baseline.usableTotal <= 3) {
    severity = "medium";
    signal = "Tightening";
  }
  const coverage = getCoverageSummary(getTrackedEarlyWarningRows());
  return {
    baseline,
    ratio,
    severity,
    signal,
    coverage,
    windowUsableRows,
    usablePaxWindow: baseline.estPaxTotal,
    nextOutbound
  };
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

function getHistorySeriesForChart(granularity = state.historyChartGranularity || "day") {
  const timeline = state.raw?.historyMeta?.timelineMeta || {};
  const series = granularity === "week" ? safeArray(timeline.airlineWeekly || []) : safeArray(timeline.airlineDaily || []);
  const airportKey = state.historyChartAirport || "ISB";
  const baselineEntries = PUBLISHED_SCHEDULE_BASELINE[airportKey] || [];
  const trackedAirlines = new Set(baselineEntries.map((entry) => String(entry.airline || '').toLowerCase()));
  const filtered = series.filter((item) => String(item.origin || '').toUpperCase() === airportKey && trackedAirlines.has(String(item.airline || '').toLowerCase()));
  const labelKey = granularity === "week" ? "weekStart" : "serviceDate";
  const labels = [...new Set(filtered.map((item) => item[labelKey]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const grouped = new Map();
  for (const item of filtered) {
    const name = item.airline;
    if (!grouped.has(name)) grouped.set(name, { name, points: new Map(), total: 0, order: baselineEntries.findIndex((entry) => entry.airline === name) });
    grouped.get(name).points.set(item[labelKey], Number(item.scheduled || 0));
    grouped.get(name).total += Number(item.scheduled || 0);
  }
  const datasets = [...grouped.values()]
    .sort((a, b) => (a.order - b.order) || b.total - a.total || a.name.localeCompare(b.name))
    .map((group) => ({
      name: group.name,
      values: labels.map((label) => Number(group.points.get(label) || 0))
    }));
  return { labels, datasets, granularity, airportKey };
}

function formatHistoryChartLabel(label, granularity) {
  if (!label) return "";
  const date = new Date(`${label}T00:00:00+05:00`);
  if (Number.isNaN(date.getTime())) return label;
  const short = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Karachi" });
  return granularity === "week" ? `W/C ${short}` : short;
}

function buildSmoothHistoryPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function renderHistoryChart() {
  const wrap = document.getElementById("historyChart");
  const meta = document.getElementById("historyChartMeta");
  if (!wrap || !meta) return;
  const chart = getHistorySeriesForChart();
  if (!chart.labels.length || !chart.datasets.length) {
    wrap.innerHTML = `<div class="emptyBlock">History chart will appear once enough snapshots have been saved for ${escapeHtml(PAKISTAN_AIRPORT_NAMES[state.historyChartAirport] || state.historyChartAirport)}.</div>`;
    meta.textContent = state.raw?.historyMeta?.note || "History is still building.";
    return;
  }
  const width = 980;
  const height = 340;
  const padLeft = 52;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 52;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const maxValue = Math.max(1, ...chart.datasets.flatMap((set) => set.values));
  const gridStep = Math.max(1, Math.ceil(maxValue / 4));
  const gridValues = [...new Set([0, gridStep, gridStep * 2, gridStep * 3, maxValue].filter((v) => v <= maxValue))].sort((a, b) => a - b);
  const xForIndex = (idx) => chart.labels.length === 1 ? padLeft + plotWidth / 2 : padLeft + (idx * plotWidth / (chart.labels.length - 1));
  const yForValue = (val) => padTop + plotHeight - (val / maxValue) * plotHeight;
  const baseY = padTop + plotHeight;
  const defs = chart.datasets.map((set, idx) => `<linearGradient id="historyGrad${idx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="historyGradStop historyGradStopTop series${idx % 7}"/><stop offset="100%" class="historyGradStop historyGradStopBottom series${idx % 7}"/></linearGradient>`).join('');
  const gridMarkup = gridValues.map((val) => `<g class="historyGrid"><line x1="${padLeft}" y1="${yForValue(val)}" x2="${width - padRight}" y2="${yForValue(val)}"></line><text x="${padLeft - 10}" y="${yForValue(val) + 4}" text-anchor="end">${val}</text></g>`).join('');
  const verticalGuides = chart.labels.map((_, idx) => `<line class="historyVerticalGuide" x1="${xForIndex(idx)}" y1="${padTop}" x2="${xForIndex(idx)}" y2="${baseY}"></line>`).join('');
  const seriesMarkup = chart.datasets.map((set, idx) => {
    const points = set.values.map((val, i) => ({ x: xForIndex(i), y: yForValue(val), value: val }));
    const linePath = buildSmoothHistoryPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
    const pointDots = points.map((pt, pointIdx) => `<circle class="historyPoint${pointIdx === points.length - 1 ? ' historyPointLast' : ''}" cx="${pt.x}" cy="${pt.y}" r="${pointIdx === points.length - 1 ? 4.2 : 3.2}"></circle>`).join('');
    const final = points[points.length - 1];
    const finalLabel = final ? `<text class="historyValueTag series${idx % 7}" x="${Math.min(width - 8, final.x + 8)}" y="${Math.max(16, final.y - 8)}">${set.values[set.values.length - 1]}</text>` : '';
    return `<g class="historySeries series${idx % 7}"><path class="historyArea series${idx % 7}" d="${areaPath}" fill="url(#historyGrad${idx})"></path><path class="historyLine" d="${linePath}"></path>${pointDots}${finalLabel}</g>`;
  }).join('');
  const xLabels = chart.labels.map((label, idx) => `<text class="historyAxisLabel" x="${xForIndex(idx)}" y="${height - 16}" text-anchor="middle">${escapeHtml(formatHistoryChartLabel(label, chart.granularity))}</text>`).join('');
  const legend = chart.datasets.map((set, idx) => `<span class="historyLegendItem"><span class="historyLegendSwatch series${idx % 7}"></span><span class="historyLegendText">${escapeHtml(set.name)}</span></span>`).join('');
  wrap.innerHTML = `<div class="historyChartShell"><div class="historyChartTitleRow"><div><div class="historyChartEyebrow">Tracked airlines</div><div class="historyChartTitle">${escapeHtml(PAKISTAN_AIRPORT_NAMES[chart.airportKey] || chart.airportKey)} ${chart.granularity === "week" ? "weekly" : "service day"} trend</div></div><div class="historyChartBadge">Saved history</div></div><svg viewBox="0 0 ${width} ${height}" class="historySvg" role="img" aria-label="Tracked airline history chart"><defs>${defs}</defs><rect class="historyFrame" x="0" y="0" width="${width}" height="${height}" rx="18" ry="18"></rect>${verticalGuides}${gridMarkup}<line class="historyAxis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${baseY}"></line><line class="historyAxis" x1="${padLeft}" y1="${baseY}" x2="${width - padRight}" y2="${baseY}"></line>${seriesMarkup}${xLabels}</svg><div class="historyLegend">${legend}</div></div>`;
  meta.textContent = `Tracked airline scheduled departures by ${chart.granularity === "week" ? "week" : "service day"} for ${PAKISTAN_AIRPORT_NAMES[chart.airportKey] || chart.airportKey}. ${state.raw?.historyMeta?.note || ""}`.trim();
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
  const metaEl = document.getElementById("earlyWarningMeta");
  const rowsEl = document.getElementById("earlyWarningRows");
  const outboundEl = document.getElementById("usableOutboundRows");
  const snapshotEl = document.getElementById("snapshotMetaText");
  const dayBtn = document.getElementById("historyDayBtn");
  const weekBtn = document.getElementById("historyWeekBtn");
  const model = getEarlyWarningModel();
  if (dayBtn) dayBtn.classList.toggle("active", state.historyChartGranularity !== "week");
  if (weekBtn) weekBtn.classList.toggle("active", state.historyChartGranularity === "week");
  document.querySelectorAll(".historyAirportBtn").forEach((btn) => btn.classList.toggle("active", btn.dataset.historyAirport === state.historyChartAirport));
  const severityClass = model.severity === "high" ? "warningRiskHigh" : (model.severity === "medium" ? "warningRiskMedium" : "warningRiskLow");
  cardsEl.innerHTML = `
    <div class="warningCard ${severityClass}"><div class="warningCardLabel">Overall signal</div><div class="warningCardValue">${model.signal}</div><div class="warningCardSub">Based on usable tracked departures against the normal expected level for the same selected scope and day window.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Usable tracked departures in window</div><div class="warningCardValue">${model.baseline.usableTotal}</div><div class="warningCardSub">Same tracked airlines, hubs and selected day window as the normal expected comparison.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Est. usable PAX in window</div><div class="warningCardValue">${formatNumber(model.usablePaxWindow)}</div><div class="warningCardSub">Estimated onward passenger carrying capacity in the same comparison window.</div></div>
    <div class="warningCard"><div class="warningCardLabel">Normal expected in window</div><div class="warningCardValue">${model.baseline.expectedTotal.toFixed(1)}</div><div class="warningCardSub">Each row below shows whether that expected count came from published slots, rolling history or weekly fallback.</div></div>`;

  if (metaEl) {
    const dailyLoaded = Number(state.raw?.historyMeta?.dailyRecordsLoaded || 0);
    const snapshotSummary = state.snapshotMeta.saved
      ? `Latest refresh saved. Full snapshots retained: ${state.snapshotMeta.recentCount ?? "—"}${dailyLoaded ? `. Service day files loaded: ${dailyLoaded}.` : "."}`
      : (state.snapshotMeta.note || "Snapshot collection not active.");
    metaEl.innerHTML = `<span class="earlyWarningMetaPill ${model.coverage.cls}">${escapeHtml(model.coverage.label)}</span><span>${escapeHtml(model.coverage.detail)}</span><span>•</span><span>${escapeHtml(snapshotSummary)}</span>`;
  }

  if (!model.baseline.routeLines.length) {
    rowsEl.innerHTML = `<tr><td colspan="8"><div class="emptyState">No baseline routes configured for this scope.</div></td></tr>`;
  } else {
    rowsEl.innerHTML = model.baseline.routeLines.map((line) => {
      let signal = { label: "Normal", cls: "signalLow" };
      if (line.usable === 0 && line.expected > 0) signal = { label: "Low", cls: "signalHigh" };
      else if (line.usable < line.expected) signal = { label: "Tightening", cls: "signalMedium" };
      return `<tr>
        <td>${escapeHtml(PAKISTAN_AIRPORT_NAMES[line.origin] || line.origin || state.airport)}</td>
        <td>${line.hub}</td>
        <td>${escapeHtml(line.airline)}</td>
        <td>${escapeHtml(line.expectedDisplay)}<span class="tableSubMeta">${escapeHtml(line.expectedSubline)}</span></td>
        <td>${line.current}</td>
        <td>${line.usable}</td>
        <td>~${formatNumber(line.estPax)}</td>
        <td><span class="signalPill ${signal.cls}">${signal.label}</span></td>
      </tr>`;
    }).join("");
  }

  if (!model.nextOutbound.length) {
    outboundEl.innerHTML = `<tr><td colspan="6"><div class="emptyState">No usable key hub departures in the next 24 hours in the current scope.</div></td></tr>`;
  } else {
    outboundEl.innerHTML = model.nextOutbound.slice(0, 12).map((row) => `<tr>
      <td>${escapeHtml(row.number || "—")}</td>
      <td>${escapeHtml(row.airline || "—")}</td>
      <td>${escapeHtml(row.origin || "—")} → ${escapeHtml(row.destination || "—")}</td>
      <td>${displayTime(bestDepTime(row) || row.scheduledDep)}</td>
      <td><span class="statusPill ${statusClass(row.status)}"><span class="statusDot"></span>${displayStatus(row)}</span></td>
      <td>~${formatNumber(estimatePax(row))}</td>
    </tr>`).join("");
  }

  const historyNote = state.raw?.historyMeta?.note ? `<br><span class="tableSubMeta">${escapeHtml(state.raw.historyMeta.note)}</span>` : "";
  const dailyPaths = Array.isArray(state.snapshotMeta.dailyPathnames) && state.snapshotMeta.dailyPathnames.length
    ? `<br><span class="tableSubMeta">Updated service day files: ${escapeHtml(state.snapshotMeta.dailyPathnames.join(", "))}</span>`
    : "";
  const loadedDaily = Number(state.raw?.historyMeta?.dailyRecordsLoaded || 0);
  const sourceMix = (loadedDaily || Number(state.raw?.historyMeta?.recentSnapshots || 0))
    ? `<br><span class="tableSubMeta">History currently loaded from ${loadedDaily} service day file${loadedDaily === 1 ? "" : "s"} and ${Number(state.raw?.historyMeta?.recentSnapshots || 0)} full snapshot${Number(state.raw?.historyMeta?.recentSnapshots || 0) === 1 ? "" : "s"}.</span>`
    : "";
  snapshotEl.innerHTML = `${escapeHtml(state.snapshotMeta.note || "Snapshot saving has not been configured yet.")}${state.snapshotMeta.pathname ? `<br><span class="tableSubMeta">Latest snapshot: ${escapeHtml(state.snapshotMeta.pathname)}</span>` : ""}${dailyPaths}${sourceMix}${historyNote}`;
  renderHistoryChart();
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
  if (cycleEl) cycleEl.textContent = state.mode === "crisis"
    ? `Crisis live ${Math.round((state.cacheSeconds || DEFAULT_CACHE_SECONDS) / 60)}m cache`
    : `Normal live ${Math.round((state.cacheSeconds || DEFAULT_CACHE_SECONDS) / 3600)}h cache`;
  document.querySelectorAll('.modeBtn').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === state.mode));
}

function buildInstructions() {
  const depth = state.modeMeta?.pageDepthByAirport || { ISB: 6, LHE: 3, KHI: 3 };
  return `
    <p><strong>What this dashboard shows</strong></p>
    <ul>
      <li>This board gives a live operational view of Pakistan related commercial flights with All airports as the default scope.</li>
      <li>The purpose is to spot disruption quickly and give an early warning when practical outbound options to key hubs are starting to thin out.</li>
    </ul>

    <p><strong>How the data modes work</strong></p>
    <ul>
      <li><strong>Normal mode</strong> uses a live FlightAware pull behind an <strong>8 hour shared cache</strong>. The first refresh after cache expiry updates the shared dataset and saves history.</li>
      <li><strong>Crisis mode</strong> uses a live FlightAware pull behind a <strong>1 hour shared cache</strong> with materially deeper page depth and a cost warning before entry.</li>
      <li>Snapshots are still saved on fresh shared refreshes, so the line graph and rolling baseline continue to build over time.</li>
    </ul>

    <p><strong>How to use it</strong></p>
    <ul>
      <li><strong>Flights</strong> shows the live flight rows for the current scope.</li>
      <li><strong>Early Warning</strong> compares current usable outbound departures against a checked baseline for the same selected day window, using like for like logic in the summary cards.</li>
      <li><strong>Airlines</strong> groups the visible rows by carrier.</li>
      <li><strong>Airports</strong> shows a quick airport and hub overview.</li>
      <li><strong>Day</strong> switches between today, tomorrow, and all flights in the shared cached window. The board now opens on <strong>All</strong>.</li>
      <li><strong>Airport</strong> filters between Islamabad, Lahore, Karachi, or All airports. The board now opens on <strong>All airports</strong>.</li>
      <li><strong>Data mode</strong> switches between lower cost Normal monitoring and live Crisis monitoring.</li>
      <li><strong>PKT / UK</strong> switches the displayed time reference for the board.</li>
      <li><strong>Load factor</strong> changes only the passenger estimate, not the flight status or timings.</li>
    </ul>

    <p><strong>How to read Early Warning</strong></p>
    <ul>
      <li>The Early Warning view focuses on practical outbound hub options rather than every flight equally.</li>
      <li><strong>From</strong> shows which Pakistan airport the route leaves from.</li>
      <li><strong>Usable</strong> means a departure that is not cancelled, not diverted, and not delayed more than 60 minutes.</li>
      <li><strong>Normal expected in window</strong> uses checked route logic. Each row states whether that expected count came from published slots, rolling history, or weekly fallback.</li>
      <li>The history chart is split by airport tab so it stays readable. Use Islamabad, Lahore, and Karachi with Day or Week views to compare tracked airlines including Thai where history exists.</li>
      <li>The coverage card matters. If the source signalled more pages than were pulled, current scheduled counts may still be understated.</li>
      <li>Current page depth in ${state.mode === "crisis" ? "Crisis" : "Normal"} mode is ISB ${depth.ISB}, LHE ${depth.LHE}, KHI ${depth.KHI} per scheduled arrivals request and the same again per scheduled departures request.</li>
    </ul>
  `;
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
    <p><strong>Current scope:</strong> ${escapeHtml(currentScopeLabel())}.</p>
    <p><strong>Current filtered board:</strong> ${rows.length} flights.</p>
    <p><strong>Data age:</strong> ${Math.floor(getDataAgeSeconds() / 60)} minutes.</p>
    <p><strong>Early warning signal:</strong> ${warning.signal}. Usable tracked departures in selected window: ${warning.baseline.usableTotal}. Estimated usable PAX in selected window: ~${formatNumber(warning.usablePaxWindow)}. Next usable tracked departures in 24 hours: ${warning.nextOutbound.length}. Coverage: ${warning.coverage.label}. ${warning.coverage.detail}</p>
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
    const res = await fetch(`/api/flights?airport=ALL&mode=${encodeURIComponent(state.mode)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.warnings?.[0] || "Failed to load board data.");
    state.raw = data;
    state.cacheSeconds = Number(data.cacheSeconds || DEFAULT_CACHE_SECONDS);
    state.scopeLabel = currentScopeLabel();
    state.snapshotMeta = data.snapshotMeta || state.snapshotMeta;
    state.modeMeta = data.modeMeta || state.modeMeta;
    state.mode = data.modeMeta?.key || state.mode;
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

function openCrisisConfirm() {
  const modal = document.getElementById("crisisConfirmModal");
  if (modal) modal.classList.remove("hidden");
}
function closeCrisisConfirm() {
  const modal = document.getElementById("crisisConfirmModal");
  if (modal) modal.classList.add("hidden");
}
async function switchMode(nextMode) {
  state.mode = nextMode;
  state.airline = "All";
  await load(false);
}

document.addEventListener("click", async (e) => {
  const dayBtn = e.target.closest(".seg[data-day]");
  if (dayBtn) {
    state.day = dayBtn.dataset.day;
    document.querySelectorAll(".seg[data-day]").forEach((x) => x.classList.toggle("active", x.dataset.day === state.day));
    refreshView();
    return;
  }
  const tzBtn = e.target.closest(".timeBtn[data-tz]");
  if (tzBtn) {
    state.timezoneMode = tzBtn.dataset.tz;
    document.querySelectorAll(".timeBtn[data-tz]").forEach((x) => x.classList.toggle("active", x.dataset.tz === state.timezoneMode));
    refreshView();
    return;
  }
  const modeBtn = e.target.closest(".modeBtn[data-mode]");
  if (modeBtn) {
    const nextMode = modeBtn.dataset.mode;
    if (nextMode === state.mode) return;
    if (nextMode === "crisis") openCrisisConfirm();
    else await switchMode("normal");
    return;
  }
  const historyBtn = e.target.closest("#historyDayBtn, #historyWeekBtn");
  if (historyBtn) {
    state.historyChartGranularity = historyBtn.id === "historyWeekBtn" ? "week" : "day";
    renderEarlyWarning();
    return;
  }
  const historyAirportBtn = e.target.closest(".historyAirportBtn[data-history-airport]");
  if (historyAirportBtn) {
    state.historyChartAirport = historyAirportBtn.dataset.historyAirport;
    renderEarlyWarning();
    return;
  }
  const tabBtn = e.target.closest(".tab[data-tab]");
  if (tabBtn) setActiveTab(tabBtn.dataset.tab);
});

document.getElementById("directionFilter").addEventListener("change", (e) => { state.direction = e.target.value; refreshView(); });
document.getElementById("airportFilter").addEventListener("change", (e) => { state.airport = e.target.value; state.scopeLabel = currentScopeLabel(); state.airline = "All"; refreshView(); });
document.getElementById("airlineFilter").addEventListener("change", (e) => { state.airline = e.target.value; refreshView(); });
document.getElementById("statusFilter").addEventListener("change", (e) => { state.status = e.target.value; refreshView(); });
document.getElementById("minorCarrierToggle").addEventListener("change", (e) => { state.includeMinor = e.target.checked; state.airline = "All"; refreshView(); });
document.getElementById("loadFactorSlider").addEventListener("input", (e) => { state.loadFactor = Number(e.target.value || 85); refreshView(); });
document.getElementById("pauseRefreshBtn").addEventListener("click", () => { state.refreshPaused = !state.refreshPaused; updateCacheUi(); });
document.getElementById("exportBtn").addEventListener("click", exportRows);

document.getElementById("resetFilters").addEventListener("click", async () => {
  state.day = "all";
  state.direction = "Both";
  state.airport = "ALL";
  state.airline = "All";
  state.status = "All";
  state.includeMinor = false;
  state.loadFactor = 85;
  state.historyChartAirport = "ISB";
  state.scopeLabel = currentScopeLabel();
  document.querySelectorAll(".seg[data-day]").forEach((x) => x.classList.toggle("active", x.dataset.day === "all"));
  document.getElementById("loadFactorSlider").value = "85";
  await load(false);
});

document.getElementById("instructionsBtn").addEventListener("click", openInstructions);
document.getElementById("closeInstructionsBtn").addEventListener("click", closeInstructions);
document.getElementById("briefBtn").addEventListener("click", openBrief);
document.getElementById("closeBriefBtn").addEventListener("click", closeBrief);
document.getElementById("airlineStatusBtn").addEventListener("click", openAirlineStatus);
document.getElementById("closeAirlineStatusBtn").addEventListener("click", closeAirlineStatus);
document.getElementById("closeCrisisConfirmBtn").addEventListener("click", closeCrisisConfirm);
document.getElementById("cancelCrisisBtn").addEventListener("click", closeCrisisConfirm);
document.getElementById("confirmCrisisBtn").addEventListener("click", async () => { closeCrisisConfirm(); await switchMode("crisis"); });
document.getElementById("instructionsModal").addEventListener("click", (e) => { if (e.target.id === "instructionsModal") closeInstructions(); });
document.getElementById("briefModal").addEventListener("click", (e) => { if (e.target.id === "briefModal") closeBrief(); });
document.getElementById("airlineStatusModal").addEventListener("click", (e) => { if (e.target.id === "airlineStatusModal") closeAirlineStatus(); });
document.getElementById("crisisConfirmModal").addEventListener("click", (e) => { if (e.target.id === "crisisConfirmModal") closeCrisisConfirm(); });

load();
