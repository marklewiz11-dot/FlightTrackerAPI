export default async function handler(req, res) {
  const apiKey = "hn1UO6XF9P3DrZPwMPi5ABgWXEV3wrvF";
  const base = "https://aeroapi.flightaware.com/aeroapi";
  const CACHE_SECONDS = 3600;
  const BROWSER_CACHE_SECONDS = 0;
  const KEY_HUBS = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "MCT", "BAH", "KWI", "BKK"];

  const AIRPORTS = {
    OPIS: { code: "ISB", name: "Islamabad" },
    OPLA: { code: "LHE", name: "Lahore" },
    OPKC: { code: "KHI", name: "Karachi" }
  };

  const TRACKED_BASELINE = {
    ISB: [
      { from: "ISB", hub: "DOH", airline: "Qatar Airways", weekly: 14 },
      { from: "ISB", hub: "DXB", airline: "Emirates", weekly: 10 },
      { from: "ISB", hub: "DXB", airline: "flydubai", weekly: 7 },
      { from: "ISB", hub: "AUH", airline: "Etihad Airways", weekly: 14 }
    ],
    LHE: [
      { from: "LHE", hub: "DOH", airline: "Qatar Airways", weekly: 14 },
      { from: "LHE", hub: "DXB", airline: "Emirates", weekly: 10 },
      { from: "LHE", hub: "DXB", airline: "flydubai", weekly: 7 },
      { from: "LHE", hub: "AUH", airline: "Etihad Airways", weekly: 14 }
    ],
    KHI: [
      { from: "KHI", hub: "DOH", airline: "Qatar Airways", weekly: 14 },
      { from: "KHI", hub: "DXB", airline: "Emirates", weekly: 20 },
      { from: "KHI", hub: "AUH", airline: "Etihad Airways", weekly: 14 }
    ]
  };
  TRACKED_BASELINE.ALL = [...TRACKED_BASELINE.ISB, ...TRACKED_BASELINE.LHE, ...TRACKED_BASELINE.KHI];

  const airlineMap = {
    PIA: "Pakistan International Airlines", PK: "Pakistan International Airlines",
    ABQ: "Airblue", PA: "Airblue",
    SEP: "SereneAir", ER: "SereneAir",
    SIF: "AirSial", PF: "AirSial",
    FJL: "Fly Jinnah", "9P": "Fly Jinnah",
    UAE: "Emirates", EK: "Emirates",
    QTR: "Qatar Airways", QR: "Qatar Airways",
    ETD: "Etihad Airways", EY: "Etihad Airways",
    BAW: "British Airways", BA: "British Airways",
    THY: "Turkish Airlines", TK: "Turkish Airlines",
    SVA: "Saudia", SV: "Saudia",
    OMA: "Oman Air", WY: "Oman Air",
    FDB: "flydubai", FZ: "flydubai",
    THA: "Thai Airways", TG: "Thai Airways",
    ABY: "Air Arabia", G9: "Air Arabia",
    JZR: "Jazeera Airways", J9: "Jazeera Airways",
    CAL: "China Airlines", CI: "China Airlines",
    CCA: "Air China", CA: "Air China",
    KAC: "Kuwait Airways", KU: "Kuwait Airways",
    GFA: "Gulf Air", GF: "Gulf Air",
    ALK: "SriLankan Airlines", UL: "SriLankan Airlines"
  };

  const majorAirlinePatterns = [
    "pakistan international", "pia", "airblue", "serene", "airsial", "air sial", "fly jinnah",
    "emirates", "qatar", "etihad", "british airways", "turkish", "saudia", "oman air",
    "flydubai", "thai", "thai airways", "air arabia", "jazeera", "jazeera airways", "china airlines",
    "air china", "kuwait airways", "gulf air", "srilankan airlines"
  ];

  const majorAirlineCodes = new Set([
    "PK", "PIA", "PA", "ABQ", "ER", "SEP", "PF", "SIF", "9P", "FJL",
    "EK", "UAE", "QR", "QTR", "EY", "ETD", "BA", "BAW", "TK", "THY",
    "SV", "SVA", "WY", "OMA", "FZ", "FDB", "TG", "THA", "G9", "ABY",
    "J9", "JZR", "CI", "CAL", "CA", "CCA", "KU", "KAC", "GF", "GFA",
    "UL", "ALK"
  ]);

  function setCacheHeaders() {
    res.setHeader("Cache-Control", `public, max-age=${BROWSER_CACHE_SECONDS}, must-revalidate`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=60`);
    res.setHeader("Vercel-CDN-Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=60`);
  }

  function sendJson(statusCode, payload) {
    setCacheHeaders();
    if (payload && payload.generatedAt) res.setHeader("X-Data-Generated-At", payload.generatedAt);
    return res.status(statusCode).json(payload);
  }

  function headers() {
    return { "x-apikey": apiKey, accept: "application/json" };
  }

  function flightNumber(f) { return f.ident_iata || f.ident || "—"; }
  function airportCode(value) {
    if (!value) return "—";
    if (typeof value === "string") return value;
    return value.code_iata || value.code_icao || value.code || value.name || "—";
  }
  function toMillis(value) {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  function compareTimes(scheduled, estimateOrActual) {
    const s = toMillis(scheduled);
    const e = toMillis(estimateOrActual);
    if (s == null || e == null) return null;
    return Math.round((e - s) / 60000);
  }
  function normaliseAirlineName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/(airlines?|airways|international|corp|corporation|limited|ltd|company|co)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function canonicalAirlineName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "—";
    const simplified = raw
      .replace(/(airlines?|airways|international|limited|ltd|plc|corp|corporation|company|co)/gi, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const aliasMap = {
      "pia": "Pakistan International Airlines",
      "pakistan": "Pakistan International Airlines",
      "pakistan international": "Pakistan International Airlines",
      "airblue": "Airblue",
      "serene": "SereneAir",
      "sereneair": "SereneAir",
      "air sial": "AirSial",
      "airsial": "AirSial",
      "fly jinnah": "Fly Jinnah",
      "emirates": "Emirates",
      "qatar": "Qatar Airways",
      "qatar airways": "Qatar Airways",
      "etihad": "Etihad Airways",
      "etihad airways": "Etihad Airways",
      "british": "British Airways",
      "british airways": "British Airways",
      "turkish": "Turkish Airlines",
      "turkish airlines": "Turkish Airlines",
      "saudia": "Saudia",
      "oman": "Oman Air",
      "oman air": "Oman Air",
      "flydubai": "flydubai",
      "thai": "Thai Airways",
      "thai airways": "Thai Airways",
      "air arabia": "Air Arabia",
      "jazeera": "Jazeera Airways",
      "jazeera airways": "Jazeera Airways",
      "china": "China Airlines",
      "china airlines": "China Airlines",
      "air china": "Air China",
      "kuwait": "Kuwait Airways",
      "kuwait airways": "Kuwait Airways",
      "gulf": "Gulf Air",
      "gulf air": "Gulf Air",
      "srilankan": "SriLankan Airlines",
      "sri lankan": "SriLankan Airlines",
      "srilankan airlines": "SriLankan Airlines"
    };
    return aliasMap[simplified] || raw;
  }
  function normaliseCode(code) { return String(code || "").trim().toUpperCase(); }
  function flightPrefix(value) { return normaliseCode(String(value || "").replace(/[0-9].*$/, "")); }
  function airlineCodeForFlight(f) {
    const candidates = [
      normaliseCode(f.operator_iata),
      normaliseCode(f.operator_icao),
      flightPrefix(f.ident_iata),
      flightPrefix(f.ident),
      normaliseCode(f.operator)
    ];
    for (const code of candidates) {
      if (!code) continue;
      if (airlineMap[code]) return code.length > 3 ? (normaliseCode(f.operator_iata) || code) : code;
      if (/^[A-Z0-9]{2,3}$/.test(code)) return code;
    }
    return "—";
  }
  function fullAirlineName(f) {
    const code = airlineCodeForFlight(f);
    if (code !== "—" && airlineMap[code]) return airlineMap[code];
    const operator = canonicalAirlineName(f.operator);
    if (operator !== "—") return operator;
    return "—";
  }

  function isMajorAirline(flight, sourceFlight = null) {
    const rawName = String(flight.airline || "");
    const normalised = normaliseAirlineName(rawName);
    if (majorAirlinePatterns.some((p) => normalised.includes(p))) return true;
    const numberPrefix = String(flight.number || "").replace(/[0-9].*$/, "").toUpperCase();
    if (majorAirlineCodes.has(numberPrefix)) return true;
    const src = sourceFlight || {};
    const opIata = String(src.operator_iata || "").toUpperCase();
    const opIcao = String(src.operator_icao || "").toUpperCase();
    const identIata = String(src.ident_iata || "").replace(/[0-9].*$/, "").toUpperCase();
    const ident = String(src.ident || "").replace(/[0-9].*$/, "").toUpperCase();
    return majorAirlineCodes.has(opIata) || majorAirlineCodes.has(opIcao) || majorAirlineCodes.has(identIata) || majorAirlineCodes.has(ident);
  }

  function getDepScheduled(f) { return f.scheduled_off || f.scheduled_out || null; }
  function getDepEstimated(f) { return f.estimated_off || f.estimated_out || null; }
  function getDepActual(f) { return f.actual_off || f.actual_out || null; }
  function getArrScheduled(f) { return f.scheduled_on || f.scheduled_in || null; }
  function getArrEstimated(f) { return f.estimated_on || f.estimated_in || null; }
  function getArrActual(f) { return f.actual_on || f.actual_in || null; }
  function bestDepTime(f) { return getDepActual(f) || getDepEstimated(f) || getDepScheduled(f); }
  function bestArrTime(f) { return getArrActual(f) || getArrEstimated(f) || getArrScheduled(f); }
  function getDelayMinutes(f, direction) {
    const scheduled = direction === "Arrival" ? getArrScheduled(f) : getDepScheduled(f);
    const relevant = direction === "Arrival" ? (getArrActual(f) || getArrEstimated(f)) : (getDepActual(f) || getDepEstimated(f));
    const diff = compareTimes(scheduled, relevant);
    return diff && diff > 0 ? diff : 0;
  }
  function deriveArrivalStatus(f) {
    const raw = String(f.status || "").toLowerCase();
    const arrDelay = compareTimes(getArrScheduled(f), getArrEstimated(f) || getArrActual(f));
    if (f.cancelled || raw.includes("cancel")) return "Cancelled";
    if (f.diverted) return "Diverted";
    if (getArrActual(f)) return "Arrived";
    if (getDepActual(f) && !getArrActual(f)) return "In Air";
    if (raw.includes("air")) return "In Air";
    if (raw.includes("arriv")) return "Arrived";
    if (arrDelay != null && arrDelay >= 10) return "Delayed";
    if (arrDelay != null && Math.abs(arrDelay) <= 5) return "On Time";
    return "Scheduled";
  }
  function deriveDepartureStatus(f) {
    const raw = String(f.status || "").toLowerCase();
    const depDelay = compareTimes(getDepScheduled(f), getDepEstimated(f) || getDepActual(f));
    if (f.cancelled || raw.includes("cancel")) return "Cancelled";
    if (f.diverted) return "Diverted";
    if (getDepActual(f) && !getArrActual(f)) return "In Air";
    if (getArrActual(f)) return "Arrived";
    if (raw.includes("air")) return "In Air";
    if (raw.includes("depart")) return "Departed";
    if (depDelay != null && depDelay >= 10) return "Delayed";
    if (depDelay != null && Math.abs(depDelay) <= 5) return "On Time";
    return "Scheduled";
  }

  function serialiseArrival(f, airport) {
    return {
      id: `${flightNumber(f)}|ARR|${airport.code}|${getArrScheduled(f) || ""}`,
      airportCode: airport.code,
      airportName: airport.name,
      direction: "Arrival",
      number: flightNumber(f),
      airline: fullAirlineName(f),
      airlineCode: airlineCodeForFlight(f),
      origin: airportCode(f.origin),
      destination: airport.code,
      scheduledDep: getDepScheduled(f),
      scheduledArr: getArrScheduled(f),
      estimatedDep: getDepEstimated(f),
      estimatedArr: getArrEstimated(f),
      actualDep: getDepActual(f),
      actualArr: getArrActual(f),
      bestDep: bestDepTime(f),
      bestArr: bestArrTime(f),
      status: deriveArrivalStatus(f),
      delayMinutes: getDelayMinutes(f, "Arrival"),
      aircraft: f.aircraft_type || "—",
      type: f.type || "PAX",
      diverted: Boolean(f.diverted),
      isMajor: isMajorAirline({ airline: fullAirlineName(f), number: flightNumber(f) }, f)
    };
  }

  function serialiseDeparture(f, airport) {
    return {
      id: `${flightNumber(f)}|DEP|${airport.code}|${getDepScheduled(f) || ""}`,
      airportCode: airport.code,
      airportName: airport.name,
      direction: "Departure",
      number: flightNumber(f),
      airline: fullAirlineName(f),
      airlineCode: airlineCodeForFlight(f),
      origin: airport.code,
      destination: airportCode(f.destination),
      scheduledDep: getDepScheduled(f),
      scheduledArr: getArrScheduled(f),
      estimatedDep: getDepEstimated(f),
      estimatedArr: getArrEstimated(f),
      actualDep: getDepActual(f),
      actualArr: getArrActual(f),
      bestDep: bestDepTime(f),
      bestArr: bestArrTime(f),
      status: deriveDepartureStatus(f),
      delayMinutes: getDelayMinutes(f, "Departure"),
      aircraft: f.aircraft_type || "—",
      type: f.type || "PAX",
      diverted: Boolean(f.diverted),
      isMajor: isMajorAirline({ airline: fullAirlineName(f), number: flightNumber(f) }, f)
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((f) => {
      const key = [f.number, f.direction, f.airportCode, f.scheduledDep || f.scheduledArr || "", f.origin, f.destination].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getBroadPakistanWindow() {
    const now = new Date();
    const localParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const y = localParts.find((p) => p.type === "year").value;
    const m = localParts.find((p) => p.type === "month").value;
    const d = localParts.find((p) => p.type === "day").value;
    const startDate = new Date(`${y}-${m}-${d}T00:00:00+05:00`);
    const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    return { start: startDate.toISOString().replace(".000Z", "Z"), end: endDate.toISOString().replace(".000Z", "Z") };
  }

  async function getJson(url) {
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status} ${text}`);
    }
    return r.json();
  }

  function resolveScope(scopeParam) {
    const scope = String(scopeParam || "ISB").toUpperCase();
    if (scope === "LHE") return { key: "LHE", airportIds: ["OPLA"], pageLimitMap: { OPLA: 1 }, label: "Lahore on demand" };
    if (scope === "KHI") return { key: "KHI", airportIds: ["OPKC"], pageLimitMap: { OPKC: 1 }, label: "Karachi on demand" };
    if (scope === "ALL") return { key: "ALL", airportIds: ["OPIS", "OPLA", "OPKC"], pageLimitMap: { OPIS: 3, OPLA: 1, OPKC: 1 }, label: "All airports with Lahore and Karachi on demand depth" };
    return { key: "ISB", airportIds: ["OPIS"], pageLimitMap: { OPIS: 3 }, label: "Islamabad default" };
  }

  async function fetchWindowForAirports(airportIds, start, end, pageLimitMap) {
    const allFlights = [];
    for (const airportId of airportIds) {
      const airport = AIRPORTS[airportId];
      const maxPages = pageLimitMap[airportId] || 1;
      const arrivalsUrl = `${base}/airports/${airportId}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const departuresUrl = `${base}/airports/${airportId}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const [arrivalsRaw, departuresRaw] = await Promise.all([getJson(arrivalsUrl), getJson(departuresUrl)]);
      const arrivals = dedupe(Array.isArray(arrivalsRaw.scheduled_arrivals) ? arrivalsRaw.scheduled_arrivals.map((f) => serialiseArrival(f, airport)) : []);
      const departures = dedupe(Array.isArray(departuresRaw.scheduled_departures) ? departuresRaw.scheduled_departures.map((f) => serialiseDeparture(f, airport)) : []);
      allFlights.push(...arrivals, ...departures);
    }
    return dedupe(allFlights);
  }

function getTrackedBaselineEntries(scopeKey) {
  return TRACKED_BASELINE[scopeKey] || TRACKED_BASELINE.ISB;
}

function rowMatchesTrackedEntry(row, entry) {
  if (!row || row.direction !== "Departure") return false;
  const fromCode = String(row.airportCode || row.origin || "").toUpperCase();
  return fromCode === String(entry.from || "").toUpperCase()
    && String(row.destination || "").toUpperCase() === String(entry.hub || "").toUpperCase()
    && String(row.airline || "").trim().toLowerCase() === String(entry.airline || "").trim().toLowerCase();
}

function getPakistanDateFromIso(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function getPakistanDayFromDate(dateString) {
  if (!dateString) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "long" }).format(new Date(`${dateString}T00:00:00+05:00`));
}

function getServiceDateForFlight(row) {
  return getPakistanDateFromIso(row.scheduledDep || row.bestDep || row.estimatedDep || row.actualDep);
}

function getWindowServiceDates(startIso) {
  const first = getPakistanDateFromIso(startIso);
  const secondIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const second = getPakistanDateFromIso(secondIso);
  return [first, second].filter(Boolean);
}

function uniqueServiceKey(row) {
  return [
    row.number || "—",
    row.scheduledDep || row.bestDep || row.estimatedDep || row.actualDep || "",
    row.origin || row.airportCode || "—",
    row.destination || "—"
  ].join("|");
}

function buildSnapshotSummary(scope, flights, generatedAt, serviceDates) {
  const outbound = flights.filter((f) => f.direction === "Departure");
  const trackedEntries = getTrackedBaselineEntries(scope.key);
  const trackedDepartures = outbound.filter((f) => trackedEntries.some((entry) => rowMatchesTrackedEntry(f, entry)));
  const usable = trackedDepartures.filter((f) => f.status !== "Cancelled" && f.status !== "Diverted" && Number(f.delayMinutes || 0) < 60);
  const routeSummary = trackedEntries.map((entry) => {
    const matching = trackedDepartures.filter((f) => rowMatchesTrackedEntry(f, entry));
    const usableMatching = usable.filter((f) => rowMatchesTrackedEntry(f, entry));
    return {
      from: entry.from,
      hub: entry.hub,
      airline: entry.airline,
      scheduled: matching.length,
      usable: usableMatching.length,
      estimatedUsablePax: usableMatching.reduce((sum, f) => sum + (Number(f.estimatedPax || 0)), 0)
    };
  });
  return {
    generatedAt,
    scope: scope.key,
    scopeLabel: scope.label,
    totalFlights: flights.length,
    trackedDepartures: trackedDepartures.length,
    usableTrackedDepartures: usable.length,
    serviceDays: serviceDates.map((serviceDate) => ({ serviceDate, dayOfWeek: getPakistanDayFromDate(serviceDate) })),
    routeSummary
  };
}

function buildDailyTrackedRecords(scope, flights, generatedAt, serviceDates) {
  const trackedEntries = getTrackedBaselineEntries(scope.key);
  return serviceDates.map((serviceDate) => {
    const dayOfWeek = getPakistanDayFromDate(serviceDate);
    const routeSummary = trackedEntries.map((entry) => {
      const matchingAll = flights.filter((row) =>
        row.direction === "Departure"
        && rowMatchesTrackedEntry(row, entry)
        && getServiceDateForFlight(row) === serviceDate
      );
      const uniqueMatching = [...new Map(matchingAll.map((row) => [uniqueServiceKey(row), row])).values()];
      const usable = uniqueMatching.filter((row) => row.status !== "Cancelled" && row.status !== "Diverted" && Number(row.delayMinutes || 0) < 60);
      return {
        from: entry.from,
        hub: entry.hub,
        airline: entry.airline,
        serviceDate,
        dayOfWeek,
        currentScheduled: uniqueMatching.length,
        usable: usable.length,
        estimatedUsablePax: usable.reduce((sum, row) => sum + (Number(row.estimatedPax || 0)), 0),
        flights: uniqueMatching.map((row) => ({
          number: row.number || "—",
          scheduledDep: row.scheduledDep || row.bestDep || null,
          status: row.status || "Unknown",
          delayMinutes: Number(row.delayMinutes || 0)
        }))
      };
    });
    return {
      generatedAt,
      scope: scope.key,
      scopeLabel: scope.label,
      serviceDate,
      dayOfWeek,
      trackedTotals: {
        currentScheduled: routeSummary.reduce((sum, line) => sum + line.currentScheduled, 0),
        usable: routeSummary.reduce((sum, line) => sum + line.usable, 0),
        estimatedUsablePax: routeSummary.reduce((sum, line) => sum + line.estimatedUsablePax, 0)
      },
      trackedRoutes: routeSummary
    };
  });
}

async function saveSnapshot(scope, summary, dailyRecords) {
  const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  if (!tokenPresent) {
    return { enabled: false, saved: false, note: "History saving is ready but not active. Add a private Vercel Blob store and BLOB_READ_WRITE_TOKEN to start collecting history.", recentCount: null, dailyPathnames: [] };
  }
  try {
    const sdk = await import("@vercel/blob");
    if (!sdk?.put) {
      return { enabled: true, saved: false, note: "History saving is configured but @vercel/blob is not installed in the project.", recentCount: null, dailyPathnames: [] };
    }
    const pathname = `snapshots/flight-tracker/${scope.key}/${summary.generatedAt.replace(/[:.]/g, "-")}.json`;
    await sdk.put(pathname, JSON.stringify(summary, null, 2), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60
    });

    const dailyPathnames = [];
    for (const record of dailyRecords) {
      const dailyPath = `history/flight-tracker/${scope.key}/${record.serviceDate}.json`;
      await sdk.put(dailyPath, JSON.stringify(record, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60
      });
      dailyPathnames.push(dailyPath);
    }

    let recentCount = null;
    if (typeof sdk.list === "function") {
      try {
        const listed = await sdk.list({ prefix: `snapshots/flight-tracker/${scope.key}/`, limit: 50 });
        recentCount = Array.isArray(listed?.blobs) ? listed.blobs.length : null;
      } catch (_) {}
    }
    return {
      enabled: true,
      saved: true,
      note: "Full refresh snapshots are saved on fresh refreshes. A slimmer tracked record is also updated by Pakistan service date and day of week, including weekends, so repeated hourly refreshes do not duplicate the history file used for comparisons.",
      recentCount,
      pathname,
      dailyPathnames
    };
  } catch (error) {
    return { enabled: true, saved: false, note: error?.message || "History save failed.", recentCount: null, dailyPathnames: [] };
  }
}
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.put) {
        return { enabled: true, saved: false, note: "Snapshot saving is configured but @vercel/blob is not installed in the project.", recentCount: null };
      }
      const pathname = `snapshots/flight-tracker/${scope.key}/${summary.generatedAt.replace(/[:.]/g, "-")}.json`;
      await sdk.put(pathname, JSON.stringify(summary, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60
      });
      let recentCount = null;
      if (typeof sdk.list === "function") {
        try {
          const listed = await sdk.list({ prefix: `snapshots/flight-tracker/${scope.key}/`, limit: 50 });
          recentCount = Array.isArray(listed?.blobs) ? listed.blobs.length : null;
        } catch (_) {}
      }
      return { enabled: true, saved: true, note: "Private Vercel Blob snapshot saved on fresh refresh. Historical baseline will strengthen as more snapshots accumulate.", recentCount, pathname };
    } catch (error) {
      return { enabled: true, saved: false, note: error?.message || "Snapshot save failed.", recentCount: null };
    }
  }

  try {
    const generatedAt = new Date().toISOString();
    const requestedScope = req.query?.airport || req.query?.scope || "ISB";
    const scope = resolveScope(requestedScope);
    const { start, end } = getBroadPakistanWindow();
    const dedupedFlights = await fetchWindowForAirports(scope.airportIds, start, end, scope.pageLimitMap);
    const serviceDates = getWindowServiceDates(start);
    dedupedFlights.sort((a, b) => {
      const aTime = toMillis(a.bestDep || a.bestArr || a.scheduledDep || a.scheduledArr) || 0;
      const bTime = toMillis(b.bestDep || b.bestArr || b.scheduledDep || b.scheduledArr) || 0;
      return aTime - bTime;
    });
    const flightsWithPax = dedupedFlights.map((f) => ({ ...f, estimatedPax: 0 }));
    const snapshotSummary = buildSnapshotSummary(scope, flightsWithPax, generatedAt, serviceDates);
    const dailyRecords = buildDailyTrackedRecords(scope, flightsWithPax, generatedAt, serviceDates);
    const snapshotMeta = await saveSnapshot(scope, snapshotSummary, dailyRecords);
    return sendJson(200, {
      generatedAt,
      cacheSeconds: CACHE_SECONDS,
      scope: scope.key,
      scopeLabel: scope.label,
      snapshotMeta,
      filtersMeta: {
        airports: ["ISB", "LHE", "KHI", "ALL"],
        airlines: [...new Set(dedupedFlights.map((f) => f.airline).filter(Boolean))].sort(),
        statuses: ["On Time", "Delayed", "Cancelled", "In Air", "Departed", "Arrived", "Diverted", "Scheduled"],
        directions: ["Both", "Departure", "Arrival"]
      },
      flights: dedupedFlights,
      warnings: []
    });
  } catch (error) {
    const generatedAt = new Date().toISOString();
    return sendJson(500, {
      generatedAt,
      cacheSeconds: CACHE_SECONDS,
      scope: "ISB",
      scopeLabel: "Islamabad default",
      snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving unavailable because the flight refresh failed.", recentCount: null },
      filtersMeta: { airports: ["ISB", "LHE", "KHI", "ALL"], airlines: [], statuses: [], directions: [] },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."]
    });
  }
}
