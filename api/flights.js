export default async function handler(req, res) {
  const apiKey = "hn1UO6XF9P3DrZPwMPi5ABgWXEV3wrvF";
  const base = "https://aeroapi.flightaware.com/aeroapi";
  const CACHE_SECONDS = 3600;
  const BROWSER_CACHE_SECONDS = 0;

  const AIRPORTS = {
    OPIS: { code: "ISB", name: "Islamabad" },
    OPLA: { code: "LHE", name: "Lahore" },
    OPKC: { code: "KHI", name: "Karachi" }
  };

  const airlineMap = {
    PIA: "Pakistan International Airlines",
    PK: "Pakistan International Airlines",
    PA: "Airblue",
    ABQ: "Airblue",
    ER: "SereneAir",
    SEP: "SereneAir",
    PF: "AirSial",
    SIF: "AirSial",
    "9P": "Fly Jinnah",
    FJL: "Fly Jinnah",
    EK: "Emirates",
    UAE: "Emirates",
    QR: "Qatar Airways",
    QTR: "Qatar Airways",
    EY: "Etihad Airways",
    ETD: "Etihad Airways",
    BA: "British Airways",
    BAW: "British Airways",
    TK: "Turkish Airlines",
    THY: "Turkish Airlines",
    SV: "Saudia",
    SVA: "Saudia",
    WY: "Oman Air",
    OMA: "Oman Air",
    FZ: "flydubai",
    FDB: "flydubai",
    TG: "Thai Airways",
    THA: "Thai Airways",
    G9: "Air Arabia",
    ABY: "Air Arabia",
    J9: "Jazeera Airways",
    JZR: "Jazeera Airways",
    CI: "China Airlines",
    CAL: "China Airlines"
  };

  const MAJOR_AIRLINE_PATTERNS = [
    "pakistan international", "pia", "airblue", "serene", "airsial", "air sial", "fly jinnah",
    "emirates", "qatar", "etihad", "british airways", "turkish", "saudia", "oman air",
    "flydubai", "thai", "thai airways", "air arabia", "jazeera", "jazeera airways", "china airlines"
  ];

  const MAJOR_AIRLINE_CODES = new Set([
    "PK", "PIA", "PA", "ABQ", "ER", "SEP", "PF", "SIF", "9P", "FJL",
    "EK", "UAE", "QR", "QTR", "EY", "ETD", "BA", "BAW", "TK", "THY",
    "SV", "SVA", "WY", "OMA", "FZ", "FDB", "TG", "THA", "G9", "ABY",
    "J9", "JZR", "CI", "CAL"
  ]);

  function setCacheHeaders() {
    res.setHeader("Cache-Control", `public, max-age=${BROWSER_CACHE_SECONDS}, must-revalidate`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=60`);
    res.setHeader("Vercel-CDN-Cache-Control", `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=60`);
  }

  function sendJson(statusCode, payload) {
    setCacheHeaders();
    if (payload && payload.generatedAt) {
      res.setHeader("X-Data-Generated-At", payload.generatedAt);
    }
    return res.status(statusCode).json(payload);
  }

  function headers() {
    return { "x-apikey": apiKey, accept: "application/json" };
  }

  function flightNumber(f) { return f.ident_iata || f.ident || "—"; }
  function airportCode(value) { if (!value) return "—"; if (typeof value === "string") return value; return value.code_iata || value.code_icao || value.code || value.name || "—"; }
  function toMillis(value) { if (!value) return null; const t = new Date(value).getTime(); return Number.isNaN(t) ? null : t; }

  function compareTimes(scheduled, estimateOrActual) {
    const s = toMillis(scheduled);
    const e = toMillis(estimateOrActual);
    if (s == null || e == null) return null;
    return Math.round((e - s) / 60000);
  }

  function normaliseAirlineName(name) {
    return String(name || "").toLowerCase().replace(/\b(airlines?|airways|international|corp|corporation|limited|ltd|company|co)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function fullAirlineName(f) {
    if (f.operator) return f.operator;
    const iata = String(f.operator_iata || "").toUpperCase();
    const icao = String(f.operator_icao || "").toUpperCase();
    const identIataPrefix = String(f.ident_iata || "").replace(/[0-9].*$/, "").toUpperCase();
    const identPrefix = String(f.ident || "").replace(/[0-9].*$/, "").toUpperCase();

    return airlineMap[iata] || airlineMap[icao] || airlineMap[identIataPrefix] || airlineMap[identPrefix] || iata || icao || identIataPrefix || identPrefix || "—";
  }

  function isMajorAirline(flight, sourceFlight = null) {
    const rawName = String(flight.airline || "");
    const normalised = normaliseAirlineName(rawName);
    if (MAJOR_AIRLINE_PATTERNS.some((p) => normalised.includes(p))) return true;

    const numberPrefix = String(flight.number || "").replace(/[0-9].*$/, "").toUpperCase();
    if (MAJOR_AIRLINE_CODES.has(numberPrefix)) return true;

    const src = sourceFlight || {};
    const opIata = String(src.operator_iata || "").toUpperCase();
    const opIcao = String(src.operator_icao || "").toUpperCase();
    const identIata = String(src.ident_iata || "").replace(/[0-9].*$/, "").toUpperCase();
    const ident = String(src.ident || "").replace(/[0-9].*$/, "").toUpperCase();

    return MAJOR_AIRLINE_CODES.has(opIata) || MAJOR_AIRLINE_CODES.has(opIcao) || MAJOR_AIRLINE_CODES.has(identIata) || MAJOR_AIRLINE_CODES.has(ident);
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

  async function fetchWindowForAirports(airportIds, start, end, maxPages = 3) {
    const allFlights = [];
    for (const airportId of airportIds) {
      const airport = AIRPORTS[airportId];
      const arrivalsUrl = `${base}/airports/${airportId}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const departuresUrl = `${base}/airports/${airportId}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;

      const [arrivalsRaw, departuresRaw] = await Promise.all([getJson(arrivalsUrl), getJson(departuresUrl)]);

      const arrivals = dedupe(Array.isArray(arrivalsRaw.scheduled_arrivals) ? arrivalsRaw.scheduled_arrivals.map((f) => serialiseArrival(f, airport)) : []);
      const departures = dedupe(Array.isArray(departuresRaw.scheduled_departures) ? departuresRaw.scheduled_departures.map((f) => serialiseDeparture(f, airport)) : []);
      allFlights.push(...arrivals, ...departures);
    }
    return dedupe(allFlights);
  }

  try {
    const generatedAt = new Date().toISOString();
    const { start, end } = getBroadPakistanWindow();
    const airportIds = Object.keys(AIRPORTS);
    const dedupedFlights = await fetchWindowForAirports(airportIds, start, end, 3);

    dedupedFlights.sort((a, b) => {
      const aTime = toMillis(a.bestDep || a.bestArr || a.scheduledDep || a.scheduledArr) || 0;
      const bTime = toMillis(b.bestDep || b.bestArr || b.scheduledDep || b.scheduledArr) || 0;
      return aTime - bTime;
    });

    return sendJson(200, {
      generatedAt,
      cacheSeconds: CACHE_SECONDS,
      filtersMeta: {
        airports: Object.values(AIRPORTS).map((a) => a.code),
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
      filtersMeta: { airports: [], airlines: [], statuses: [], directions: [] },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."]
    });
  }
}
