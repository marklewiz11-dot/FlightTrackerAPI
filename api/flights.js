export default async function handler(req, res) {
  const apiKey = "PASTE_YOUR_FLIGHTAWARE_KEY_HERE";
  const base = "https://aeroapi.flightaware.com/aeroapi";
  const DEFAULT_CACHE_SECONDS = 3600;
  const BROWSER_CACHE_SECONDS = 0;
  const KEY_HUBS = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "MCT", "BAH", "KWI", "BKK"];
  const MODE_CONFIG = {
    normal: {
      key: "normal",
      label: "Normal mode",
      cacheSeconds: 8 * 60 * 60,
      pageLimits: { OPIS: 6, OPLA: 3, OPKC: 3 },
      collectorPageLimits: { OPIS: 6, OPLA: 3, OPKC: 3 },
      note: "8 hour shared cache with deeper collection pages for low cost baseline building."
    },
    crisis: {
      key: "crisis",
      label: "Crisis mode",
      cacheSeconds: 60 * 60,
      pageLimits: { OPIS: 12, OPLA: 6, OPKC: 6 },
      collectorPageLimits: { OPIS: 12, OPLA: 6, OPKC: 6 },
      note: "1 hour shared cache with materially deeper pages for crisis monitoring."
    }
  };

  const AIRPORTS = {
    OPIS: { code: "ISB", name: "Islamabad" },
    OPLA: { code: "LHE", name: "Lahore" },
    OPKC: { code: "KHI", name: "Karachi" }
  };

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

  function setCacheHeaders(cacheSeconds = DEFAULT_CACHE_SECONDS) {
    res.setHeader("Cache-Control", `public, max-age=${BROWSER_CACHE_SECONDS}, must-revalidate`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${cacheSeconds}, stale-while-revalidate=60`);
    res.setHeader("Vercel-CDN-Cache-Control", `public, max-age=${cacheSeconds}, stale-while-revalidate=60`);
  }

  function sendJson(statusCode, payload, cacheSeconds = DEFAULT_CACHE_SECONDS) {
    setCacheHeaders(cacheSeconds);
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

  async function getJsonWithMeta(url, collectionKey) {
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status} ${text}`);
    }
    const json = await r.json();
    const collection = Array.isArray(json?.[collectionKey]) ? json[collectionKey] : [];
    return {
      json,
      meta: {
        returnedCount: collection.length,
        numPagesReturned: Number(json?.num_pages || 1),
        truncatedPossible: Boolean(json?.links?.next)
      }
    };
  }

  function getPakistanDateKey(value) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  }

  function getPakistanWeekdayKey(value) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(new Date(value));
  }

  function getPakistanTimeKey(value) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  }

  function getPakistanWeekStartKey(value) {
    const dt = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
    const vals = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    const pktMidnight = new Date(`${vals.year}-${vals.month}-${vals.day}T00:00:00+05:00`);
    const jsDay = pktMidnight.getUTCDay();
    const mondayOffset = (jsDay + 6) % 7;
    pktMidnight.setUTCDate(pktMidnight.getUTCDate() - mondayOffset);
    const y = pktMidnight.getUTCFullYear();
    const m = String(pktMidnight.getUTCMonth() + 1).padStart(2, "0");
    const d = String(pktMidnight.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function resolveMode(modeParam) {
    const key = String(modeParam || "normal").toLowerCase() === "crisis" ? "crisis" : "normal";
    const config = MODE_CONFIG[key];
    return {
      ...config,
      pageDepthByAirport: {
        ISB: Number(config.pageLimits.OPIS || 0),
        LHE: Number(config.pageLimits.OPLA || 0),
        KHI: Number(config.pageLimits.OPKC || 0)
      }
    };
  }

  function resolveScope(scopeParam, mode, useCollectorDepth = false) {
    const scope = String(scopeParam || "ISB").toUpperCase();
    const limits = useCollectorDepth ? mode.collectorPageLimits : mode.pageLimits;
    if (scope === "LHE") return { key: "LHE", airportIds: ["OPLA"], pageLimitMap: { OPLA: limits.OPLA }, label: "Lahore on demand" };
    if (scope === "KHI") return { key: "KHI", airportIds: ["OPKC"], pageLimitMap: { OPKC: limits.OPKC }, label: "Karachi on demand" };
    if (scope === "ALL") return { key: "ALL", airportIds: ["OPIS", "OPLA", "OPKC"], pageLimitMap: { OPIS: limits.OPIS, OPLA: limits.OPLA, OPKC: limits.OPKC }, label: "All airports" };
    return { key: "ISB", airportIds: ["OPIS"], pageLimitMap: { OPIS: limits.OPIS }, label: "Islamabad default" };
  }

  function buildCoverageMeta(byAirport, fetchPlan = { includeArrivals: true, includeDepartures: true }) {
    const airportEntries = Object.entries(byAirport || {});
    const departureEntries = airportEntries.map(([airportCode, info]) => ({ airportCode, ...(info.departures || {}) }));
    const arrivalEntries = airportEntries.map(([airportCode, info]) => ({ airportCode, ...(info.arrivals || {}) }));
    const anyDepartureTruncated = departureEntries.some((item) => item.truncatedPossible);
    const anyArrivalTruncated = arrivalEntries.some((item) => item.truncatedPossible);
    return {
      byAirport,
      departures: {
        collected: Boolean(fetchPlan.includeDepartures),
        truncatedPossible: Boolean(fetchPlan.includeDepartures) && anyDepartureTruncated,
        returnedCount: departureEntries.reduce((sum, item) => sum + Number(item.returnedCount || 0), 0),
        note: !fetchPlan.includeDepartures
          ? "Departures were not collected in this run."
          : anyDepartureTruncated
            ? "Additional departure pages exist beyond the configured page cap, so scheduled counts may be understated."
            : "No extra departure page was signalled by the source pull."
      },
      arrivals: {
        collected: Boolean(fetchPlan.includeArrivals),
        truncatedPossible: Boolean(fetchPlan.includeArrivals) && anyArrivalTruncated,
        returnedCount: arrivalEntries.reduce((sum, item) => sum + Number(item.returnedCount || 0), 0),
        note: !fetchPlan.includeArrivals
          ? "Arrivals were intentionally skipped in this run to keep collection cost lower."
          : anyArrivalTruncated
            ? "Additional arrival pages exist beyond the configured page cap."
            : "No extra arrival page was signalled by the source pull."
      }
    };
  }

  async function fetchWindowForAirports(airportIds, start, end, pageLimitMap, fetchPlan = { includeArrivals: true, includeDepartures: true }) {
    const allFlights = [];
    const coverageByAirport = {};
    for (const airportId of airportIds) {
      const airport = AIRPORTS[airportId];
      const maxPages = pageLimitMap[airportId] || 1;
      const arrivalsUrl = `${base}/airports/${airportId}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const departuresUrl = `${base}/airports/${airportId}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;

      let arrivals = [];
      let departures = [];
      let arrivalsMeta = { returnedCount: 0, numPagesReturned: 0, truncatedPossible: false, skipped: !fetchPlan.includeArrivals };
      let departuresMeta = { returnedCount: 0, numPagesReturned: 0, truncatedPossible: false, skipped: !fetchPlan.includeDepartures };

      if (fetchPlan.includeArrivals && fetchPlan.includeDepartures) {
        const [arrivalsResult, departuresResult] = await Promise.all([
          getJsonWithMeta(arrivalsUrl, "scheduled_arrivals"),
          getJsonWithMeta(departuresUrl, "scheduled_departures")
        ]);
        arrivalsMeta = arrivalsResult.meta;
        departuresMeta = departuresResult.meta;
        arrivals = dedupe(Array.isArray(arrivalsResult.json.scheduled_arrivals) ? arrivalsResult.json.scheduled_arrivals.map((f) => serialiseArrival(f, airport)) : []);
        departures = dedupe(Array.isArray(departuresResult.json.scheduled_departures) ? departuresResult.json.scheduled_departures.map((f) => serialiseDeparture(f, airport)) : []);
      } else if (fetchPlan.includeDepartures) {
        const departuresResult = await getJsonWithMeta(departuresUrl, "scheduled_departures");
        departuresMeta = departuresResult.meta;
        departures = dedupe(Array.isArray(departuresResult.json.scheduled_departures) ? departuresResult.json.scheduled_departures.map((f) => serialiseDeparture(f, airport)) : []);
      } else if (fetchPlan.includeArrivals) {
        const arrivalsResult = await getJsonWithMeta(arrivalsUrl, "scheduled_arrivals");
        arrivalsMeta = arrivalsResult.meta;
        arrivals = dedupe(Array.isArray(arrivalsResult.json.scheduled_arrivals) ? arrivalsResult.json.scheduled_arrivals.map((f) => serialiseArrival(f, airport)) : []);
      }

      coverageByAirport[airport.code] = {
        arrivals: { ...arrivalsMeta, maxPagesRequested: maxPages, uniqueCount: arrivals.length },
        departures: { ...departuresMeta, maxPagesRequested: maxPages, uniqueCount: departures.length }
      };
      allFlights.push(...arrivals, ...departures);
    }
    return { flights: dedupe(allFlights), coverageMeta: buildCoverageMeta(coverageByAirport, fetchPlan) };
  }

  function buildSnapshotSummary(scope, flights, generatedAt, coverageMeta) {
    const outbound = flights.filter((f) => f.direction === "Departure");
    const keyHub = outbound.filter((f) => KEY_HUBS.includes(String(f.destination || "").toUpperCase()));
    const usable = keyHub.filter((f) => f.status !== "Cancelled" && f.status !== "Diverted" && Number(f.delayMinutes || 0) < 60);
    const routeSummary = [...new Set(keyHub.map((f) => `${f.origin || ""}|${f.destination}|${f.airline}`))].map((key) => {
      const [origin, hub, airline] = key.split("|");
      const matching = keyHub.filter((f) => (f.origin || "") === origin && f.destination === hub && f.airline === airline);
      const usableMatching = usable.filter((f) => (f.origin || "") === origin && f.destination === hub && f.airline === airline);
      return {
        origin,
        hub,
        airline,
        scheduled: matching.length,
        usable: usableMatching.length,
        estimatedUsablePax: usableMatching.reduce((sum, f) => sum + (Number(f.estimatedPax || 0)), 0)
      };
    });
    const departureSlots = keyHub
      .filter((f) => f.scheduledDep || f.bestDep)
      .map((f) => ({
        origin: f.origin,
        hub: f.destination,
        airline: f.airline,
        number: f.number,
        scheduledDep: f.scheduledDep || f.bestDep,
        delayMinutes: Number(f.delayMinutes || 0),
        status: f.status,
        usable: f.status !== "Cancelled" && f.status !== "Diverted" && Number(f.delayMinutes || 0) < 60
      }));

    return {
      generatedAt,
      scope: scope.key,
      scopeLabel: scope.label,
      totalFlights: flights.length,
      keyHubDepartures: keyHub.length,
      usableKeyHubDepartures: usable.length,
      coverageMeta,
      routeSummary,
      departureSlots
    };
  }


  function buildDailyHistoryRecords(scope, summary) {
    const byServiceDate = new Map();
    const slots = Array.isArray(summary?.departureSlots) ? summary.departureSlots : [];
    for (const slot of slots) {
      if (!slot?.scheduledDep || !slot?.hub || !slot?.airline) continue;
      const serviceDate = getPakistanDateKey(slot.scheduledDep);
      if (!serviceDate) continue;
      if (!byServiceDate.has(serviceDate)) {
        byServiceDate.set(serviceDate, {
          generatedAt: summary.generatedAt,
          scope: scope.key,
          scopeLabel: scope.label,
          serviceDate,
          dayOfWeek: getPakistanWeekdayKey(slot.scheduledDep),
          weekStart: getPakistanWeekStartKey(slot.scheduledDep),
          departureSlotsByKey: new Map()
        });
      }
      const record = byServiceDate.get(serviceDate);
      const timeKey = getPakistanTimeKey(slot.scheduledDep);
      const slotKey = `${slot.origin || ""}|${slot.hub}|${slot.airline}|${serviceDate}|${slot.number || ""}|${timeKey}`;
      if (!record.departureSlotsByKey.has(slotKey)) {
        record.departureSlotsByKey.set(slotKey, { ...slot });
      } else if (slot.usable) {
        record.departureSlotsByKey.set(slotKey, { ...record.departureSlotsByKey.get(slotKey), usable: true, status: slot.status, delayMinutes: Number(slot.delayMinutes || 0) });
      }
    }
    return [...byServiceDate.values()]
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
      .map((record) => ({
        generatedAt: record.generatedAt,
        scope: record.scope,
        scopeLabel: record.scopeLabel,
        serviceDate: record.serviceDate,
        dayOfWeek: record.dayOfWeek,
        weekStart: record.weekStart,
        departureSlots: [...record.departureSlotsByKey.values()].sort((a, b) => String(a.scheduledDep || "").localeCompare(String(b.scheduledDep || "")))
      }));
  }

  function isCollectorRequest() {
    return String(req.query?.collect || "0") === "1" || Boolean(req.headers["x-vercel-cron"]);
  }

  function isCollectorAuthorised() {
    if (!isCollectorRequest()) return true;
    if (req.headers["x-vercel-cron"]) return true;
    const requiredSecret = process.env.COLLECT_SECRET;
    if (!requiredSecret) return true;
    const providedSecret = String(req.query?.secret || req.headers["x-collect-secret"] || "");
    return providedSecret === requiredSecret;
  }

  async function saveSnapshot(scope, summary, dailyRecords, collectionMeta) {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent) {
      return { enabled: false, saved: false, note: "Snapshot saving is ready but not active. Add a private Vercel Blob store and BLOB_READ_WRITE_TOKEN to start collecting history.", recentCount: null, dailyPathnames: [] };
    }
    if (!collectionMeta?.collectRequested) {
      return {
        enabled: true,
        saved: false,
        recentCount: null,
        dailyPathnames: [],
        note: "History collection is collector driven in this build. This dashboard refresh did not write a new snapshot. Use the collector URL on your schedule instead."
      };
    }
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.put) {
        return { enabled: true, saved: false, note: "Snapshot saving is configured but @vercel/blob is not installed in the project.", recentCount: null, dailyPathnames: [] };
      }
      const pathname = `snapshots/flight-tracker/${scope.key}/${summary.generatedAt.replace(/[:.]/g, "-")}.json`;
      await sdk.put(pathname, JSON.stringify(summary, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60
      });

      const dailyPathnames = [];
      for (const record of (Array.isArray(dailyRecords) ? dailyRecords : [])) {
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
        note: `Collector run saved a full snapshot and refreshed slimmer service day files for ${collectionMeta.modeLabel}.`,
        recentCount,
        pathname,
        dailyPathnames
      };
    } catch (error) {
      return { enabled: true, saved: false, note: error?.message || "Snapshot save failed.", recentCount: null, dailyPathnames: [] };
    }
  }


  async function saveLatestBoardData(scope, payload, collectionMeta) {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent || !collectionMeta?.collectRequested) {
      return { saved: false, pathname: null };
    }
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.put) return { saved: false, pathname: null };
      const pathname = `latest/flight-tracker/${scope.key}/${collectionMeta.modeKey}.json`;
      await sdk.put(pathname, JSON.stringify(payload, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60
      });
      return { saved: true, pathname };
    } catch {
      return { saved: false, pathname: null };
    }
  }

  async function loadLatestBoardData(modeKey = "normal") {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent) return null;
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.get) return null;
      const pathname = `latest/flight-tracker/ALL/${modeKey}.json`;
      const result = await sdk.get(pathname, { access: "private" });
      if (!result || result.statusCode !== 200) return null;
      const text = await new Response(result.stream).text();
      const parsed = JSON.parse(text);
      parsed.latestBoardPath = pathname;
      return parsed;
    } catch {
      return null;
    }
  }


  function buildRollingHistoryFromSnapshots(snapshots) {
    const uniqueFlights = new Map();

    for (const snapshot of snapshots) {
      const slots = Array.isArray(snapshot?.departureSlots) ? snapshot.departureSlots : [];
      for (const slot of slots) {
        if (!slot?.scheduledDep || !slot?.hub || !slot?.airline) continue;
        const origin = slot.origin || "";
        const routeKey = `${origin}|${slot.hub}|${slot.airline}`;
        const serviceDate = getPakistanDateKey(slot.scheduledDep);
        const weekday = getPakistanWeekdayKey(slot.scheduledDep);
        const weekStart = getPakistanWeekStartKey(slot.scheduledDep);
        const timeKey = getPakistanTimeKey(slot.scheduledDep);
        const flightKey = `${routeKey}|${serviceDate}|${slot.number || ""}|${timeKey}`;
        if (!uniqueFlights.has(flightKey)) {
          uniqueFlights.set(flightKey, {
            routeKey,
            origin,
            hub: slot.hub,
            airline: slot.airline,
            serviceDate,
            weekday,
            weekStart,
            timeKey,
            usable: Boolean(slot.usable)
          });
        } else if (slot.usable) {
          uniqueFlights.get(flightKey).usable = true;
        }
      }
    }

    const serviceDateMap = new Map();
    for (const flight of uniqueFlights.values()) {
      const dedupeKey = `${flight.routeKey}|${flight.serviceDate}`;
      if (!serviceDateMap.has(dedupeKey)) {
        serviceDateMap.set(dedupeKey, {
          routeKey: flight.routeKey,
          origin: flight.origin,
          hub: flight.hub,
          airline: flight.airline,
          weekday: flight.weekday,
          serviceDate: flight.serviceDate,
          weekStart: flight.weekStart,
          times: new Set(),
          usable: 0,
          scheduled: 0
        });
      }
      const item = serviceDateMap.get(dedupeKey);
      item.scheduled += 1;
      item.times.add(flight.timeKey);
      if (flight.usable) item.usable += 1;
    }

    const routeWeekday = {};
    for (const item of serviceDateMap.values()) {
      routeWeekday[item.routeKey] ||= {};
      routeWeekday[item.routeKey][item.weekday] ||= { sampleCount: 0, scheduledTotal: 0, usableTotal: 0, slotCounts: {} };
      const target = routeWeekday[item.routeKey][item.weekday];
      target.sampleCount += 1;
      target.scheduledTotal += item.scheduled;
      target.usableTotal += item.usable;
      for (const time of item.times) {
        target.slotCounts[time] = (target.slotCounts[time] || 0) + 1;
      }
    }

    const rollingByRouteWeekday = {};
    for (const [routeKey, weekdays] of Object.entries(routeWeekday)) {
      rollingByRouteWeekday[routeKey] = {};
      for (const [weekday, data] of Object.entries(weekdays)) {
        const normalSlots = Object.entries(data.slotCounts)
          .filter(([, count]) => count >= Math.max(1, Math.ceil(data.sampleCount * 0.5)))
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([time]) => time);
        rollingByRouteWeekday[routeKey][weekday] = {
          sampleCount: data.sampleCount,
          expectedScheduledAvg: Number((data.scheduledTotal / data.sampleCount).toFixed(2)),
          expectedUsableAvg: Number((data.usableTotal / data.sampleCount).toFixed(2)),
          normalSlots
        };
      }
    }

    const airlineDayMap = new Map();
    const airlineWeekMap = new Map();
    for (const item of serviceDateMap.values()) {
      const airlineDayKey = `${item.origin}|${item.airline}|${item.serviceDate}`;
      if (!airlineDayMap.has(airlineDayKey)) {
        airlineDayMap.set(airlineDayKey, { origin: item.origin, airline: item.airline, serviceDate: item.serviceDate, scheduled: 0, usable: 0 });
      }
      airlineDayMap.get(airlineDayKey).scheduled += item.scheduled;
      airlineDayMap.get(airlineDayKey).usable += item.usable;

      const airlineWeekKey = `${item.origin}|${item.airline}|${item.weekStart}`;
      if (!airlineWeekMap.has(airlineWeekKey)) {
        airlineWeekMap.set(airlineWeekKey, { origin: item.origin, airline: item.airline, weekStart: item.weekStart, scheduled: 0, usable: 0 });
      }
      airlineWeekMap.get(airlineWeekKey).scheduled += item.scheduled;
      airlineWeekMap.get(airlineWeekKey).usable += item.usable;
    }

    const serviceDays = serviceDateMap.size;
    return {
      enabled: true,
      recentSnapshots: snapshots.length,
      serviceDays,
      note: serviceDays >= 3
        ? `Rolling baseline available from ${serviceDays} observed service day${serviceDays === 1 ? "" : "s"}. Weekday matching is based on unique scheduled departures, not repeat refreshes of the same flight.`
        : `History is building. ${serviceDays} observed service day${serviceDays === 1 ? "" : "s"} captured so far.`,
      rollingByRouteWeekday,
      timelineMeta: {
        airlineDaily: [...airlineDayMap.values()].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.airline.localeCompare(b.airline)),
        airlineWeekly: [...airlineWeekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.airline.localeCompare(b.airline))
      }
    };
  }

  async function loadRollingHistory(scope) {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent) {
      return { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline not available until Blob history is enabled.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } };
    }
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.list || !sdk?.get) {
        return { enabled: true, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline needs @vercel/blob list and get support in the project.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } };
      }

      let cursor;
      let hasMore = true;
      const dailyBlobs = [];
      while (hasMore && dailyBlobs.length < 90) {
        const listed = await sdk.list({ prefix: `history/flight-tracker/${scope.key}/`, limit: 30, cursor });
        dailyBlobs.push(...(Array.isArray(listed?.blobs) ? listed.blobs : []));
        hasMore = Boolean(listed?.hasMore) && dailyBlobs.length < 90;
        cursor = listed?.cursor;
      }

      const orderedDaily = dailyBlobs
        .sort((a, b) => String(a.pathname).localeCompare(String(b.pathname)))
        .slice(-42);

      const mergedSnapshots = [];
      let loadedDailyCount = 0;
      for (const blob of orderedDaily) {
        const result = await sdk.get(blob.pathname, { access: "private" });
        if (!result || result.statusCode !== 200) continue;
        const text = await new Response(result.stream).text();
        const record = JSON.parse(text);
        mergedSnapshots.push({ departureSlots: Array.isArray(record?.departureSlots) ? record.departureSlots : [] });
        loadedDailyCount += 1;
      }

      cursor = undefined;
      hasMore = true;
      const snapshotBlobs = [];
      while (hasMore && snapshotBlobs.length < 80) {
        const listed = await sdk.list({ prefix: `snapshots/flight-tracker/${scope.key}/`, limit: 20, cursor });
        snapshotBlobs.push(...(Array.isArray(listed?.blobs) ? listed.blobs : []));
        hasMore = Boolean(listed?.hasMore) && snapshotBlobs.length < 80;
        cursor = listed?.cursor;
      }

      const orderedSnapshots = snapshotBlobs
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 40);

      let loadedSnapshotCount = 0;
      for (const blob of orderedSnapshots) {
        const result = await sdk.get(blob.pathname, { access: "private" });
        if (!result || result.statusCode !== 200) continue;
        const text = await new Response(result.stream).text();
        mergedSnapshots.push(JSON.parse(text));
        loadedSnapshotCount += 1;
      }

      if (!mergedSnapshots.length) {
        return { enabled: true, recentSnapshots: 0, serviceDays: 0, note: "History is still building. No saved snapshot data has been loaded yet.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } };
      }

      const history = buildRollingHistoryFromSnapshots(mergedSnapshots);
      const sourceSummary = [];
      if (loadedDailyCount) sourceSummary.push(`${loadedDailyCount} service day file${loadedDailyCount === 1 ? "" : "s"}`);
      if (loadedSnapshotCount) sourceSummary.push(`${loadedSnapshotCount} full snapshot${loadedSnapshotCount === 1 ? "" : "s"}`);
      const sourceText = sourceSummary.length ? ` Source mix: ${sourceSummary.join(" plus ")}.` : "";
      return {
        ...history,
        recentSnapshots: loadedSnapshotCount,
        dailyRecordsLoaded: loadedDailyCount,
        note: history.serviceDays >= 3
          ? `Rolling baseline available from ${history.serviceDays} observed service day${history.serviceDays === 1 ? "" : "s"}. Matching uses day of week including weekends, ignores repeat refreshes of the same flight, and now merges daily history with archived full snapshots so older data stays visible.${sourceText}`
          : `History is building. ${history.serviceDays} observed service day${history.serviceDays === 1 ? "" : "s"} captured so far.${sourceText}`
      };
    } catch (error) {
      return { enabled: true, recentSnapshots: 0, serviceDays: 0, note: error?.message || "Rolling baseline could not be loaded.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } };
    }
  }

  try {
    const generatedAt = new Date().toISOString();
    const mode = resolveMode(req.query?.mode);
    const collectRequested = isCollectorRequest();
    if (collectRequested && !isCollectorAuthorised()) {
      return sendJson(401, {
        generatedAt,
        cacheSeconds: mode.cacheSeconds,
        modeMeta: { key: mode.key, label: mode.label, note: mode.note, pageDepthByAirport: mode.pageDepthByAirport, collectRequested: true },
        snapshotMeta: { enabled: false, saved: false, note: "Collector request blocked because the provided COLLECT_SECRET did not match.", recentCount: null, dailyPathnames: [] },
        coverageMeta: { departures: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the collector request was not authorised." }, arrivals: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the collector request was not authorised." }, byAirport: {} },
        historyMeta: { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline not loaded because the collector request was not authorised.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } },
        filtersMeta: { airports: ["ISB", "LHE", "KHI", "ALL"], airlines: [], statuses: [], directions: [] },
        flights: [],
        warnings: ["Collector request not authorised."]
      }, mode.cacheSeconds);
    }
    const requestedScope = req.query?.airport || req.query?.scope || "ALL";

    if (!collectRequested && mode.key === "normal") {
      const savedBoard = await loadLatestBoardData(mode.key);
      if (savedBoard) {
        const savedScope = resolveScope("ALL", mode, false);
        const historyMeta = await loadRollingHistory(savedScope);
        return sendJson(200, {
          ...savedBoard,
          cacheSeconds: mode.cacheSeconds,
          modeMeta: {
            ...(savedBoard.modeMeta || {}),
            key: mode.key,
            label: mode.label,
            note: "Normal mode serves the latest saved collector dataset by default. No fresh FlightAware pull was made for this board view.",
            pageDepthByAirport: mode.pageDepthByAirport,
            collectRequested: false,
            dataSource: "saved",
            collectorUrlHint: "/api/collect-normal",
            crisisCollectorUrlHint: "/api/collect-crisis"
          },
          scope: "ALL",
          scopeLabel: "All airports from latest saved collector dataset",
          snapshotMeta: {
            ...(savedBoard.snapshotMeta || {}),
            note: "Showing the latest saved collector dataset. Normal mode does not make a fresh live FlightAware pull by default.",
            latestBoardPath: savedBoard.latestBoardPath || savedBoard.snapshotMeta?.latestBoardPath || null
          },
          historyMeta,
          warnings: Array.isArray(savedBoard.warnings) ? savedBoard.warnings : []
        }, mode.cacheSeconds);
      }
    }

    const fetchPlan = collectRequested
      ? { includeArrivals: String(req.query?.includeArrivals || "0") === "1", includeDepartures: true }
      : { includeArrivals: true, includeDepartures: true };
    const effectiveScope = (!collectRequested && mode.key === "normal") ? "ALL" : requestedScope;
    const scope = resolveScope(effectiveScope, mode, collectRequested);
    const { start, end } = getBroadPakistanWindow();
    const { flights: dedupedFlights, coverageMeta } = await fetchWindowForAirports(scope.airportIds, start, end, scope.pageLimitMap, fetchPlan);
    dedupedFlights.sort((a, b) => {
      const aTime = toMillis(a.bestDep || a.bestArr || a.scheduledDep || a.scheduledArr) || 0;
      const bTime = toMillis(b.bestDep || b.bestArr || b.scheduledDep || b.scheduledArr) || 0;
      return aTime - bTime;
    });
    const flightsWithPax = dedupedFlights.map((f) => ({ ...f, estimatedPax: 0 }));
    const snapshotSummary = buildSnapshotSummary(scope, flightsWithPax, generatedAt, coverageMeta);
    const dailyRecords = buildDailyHistoryRecords(scope, snapshotSummary);
    const snapshotMeta = await saveSnapshot(scope, snapshotSummary, dailyRecords, {
      collectRequested,
      modeKey: mode.key,
      modeLabel: mode.label,
      fetchPlan
    });
    const historyMeta = await loadRollingHistory(scope);
    const responsePayload = {
      generatedAt,
      cacheSeconds: mode.cacheSeconds,
      modeMeta: {
        key: mode.key,
        label: mode.label,
        note: collectRequested ? `${mode.note} Collector run writing the saved dataset for Normal or Crisis board views.` : mode.note,
        pageDepthByAirport: mode.pageDepthByAirport,
        collectRequested,
        fetchPlan,
        dataSource: collectRequested ? "collector-live" : "live",
        collectorUrlHint: "/api/collect-normal",
        crisisCollectorUrlHint: "/api/collect-crisis"
      },
      scope: scope.key,
      scopeLabel: scope.label,
      snapshotMeta,
      coverageMeta,
      historyMeta,
      filtersMeta: {
        airports: ["ISB", "LHE", "KHI", "ALL"],
        airlines: [...new Set(dedupedFlights.map((f) => f.airline).filter(Boolean))].sort(),
        statuses: ["On Time", "Delayed", "Cancelled", "In Air", "Departed", "Arrived", "Diverted", "Scheduled"],
        directions: ["Both", "Departure", "Arrival"]
      },
      flights: dedupedFlights,
      warnings: []
    };
    const latestBoardMeta = await saveLatestBoardData(scope, responsePayload, {
      collectRequested,
      modeKey: mode.key,
      modeLabel: mode.label
    });
    if (latestBoardMeta?.pathname) {
      responsePayload.snapshotMeta = {
        ...responsePayload.snapshotMeta,
        latestBoardPath: latestBoardMeta.pathname
      };
    }
    return sendJson(200, responsePayload, mode.cacheSeconds);
  } catch (error) {
    const generatedAt = new Date().toISOString();
    const mode = resolveMode(req.query?.mode);
    return sendJson(500, {
      generatedAt,
      cacheSeconds: mode.cacheSeconds,
      modeMeta: { key: mode.key, label: mode.label, note: mode.note, pageDepthByAirport: mode.pageDepthByAirport, collectRequested: isCollectorRequest() },
      scope: "ALL",
      scopeLabel: "All airports",
      snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving unavailable because the flight refresh failed.", recentCount: null, dailyPathnames: [] },
      coverageMeta: { departures: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, arrivals: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, byAirport: {} },
      historyMeta: { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline unavailable because the flight refresh failed.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } },
      filtersMeta: { airports: ["ISB", "LHE", "KHI", "ALL"], airlines: [], statuses: [], directions: [] },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."]
    }, mode.cacheSeconds);
  }
}
