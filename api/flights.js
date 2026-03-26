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

  function resolveScope(scopeParam) {
    const scope = String(scopeParam || "ISB").toUpperCase();
    if (scope === "LHE") return { key: "LHE", airportIds: ["OPLA"], pageLimitMap: { OPLA: 1 }, label: "Lahore on demand" };
    if (scope === "KHI") return { key: "KHI", airportIds: ["OPKC"], pageLimitMap: { OPKC: 1 }, label: "Karachi on demand" };
    if (scope === "ALL") return { key: "ALL", airportIds: ["OPIS", "OPLA", "OPKC"], pageLimitMap: { OPIS: 3, OPLA: 1, OPKC: 1 }, label: "All airports with Lahore and Karachi on demand depth" };
    return { key: "ISB", airportIds: ["OPIS"], pageLimitMap: { OPIS: 3 }, label: "Islamabad default" };
  }

  function buildCoverageMeta(byAirport) {
    const airportEntries = Object.entries(byAirport || {});
    const departureEntries = airportEntries.map(([airportCode, info]) => ({ airportCode, ...(info.departures || {}) }));
    const arrivalEntries = airportEntries.map(([airportCode, info]) => ({ airportCode, ...(info.arrivals || {}) }));
    const anyDepartureTruncated = departureEntries.some((item) => item.truncatedPossible);
    const anyArrivalTruncated = arrivalEntries.some((item) => item.truncatedPossible);
    return {
      byAirport,
      departures: {
        truncatedPossible: anyDepartureTruncated,
        returnedCount: departureEntries.reduce((sum, item) => sum + Number(item.returnedCount || 0), 0),
        note: anyDepartureTruncated
          ? "Additional departure pages exist beyond the configured page cap, so scheduled counts may be understated."
          : "No extra departure page was signalled by the source pull."
      },
      arrivals: {
        truncatedPossible: anyArrivalTruncated,
        returnedCount: arrivalEntries.reduce((sum, item) => sum + Number(item.returnedCount || 0), 0),
        note: anyArrivalTruncated
          ? "Additional arrival pages exist beyond the configured page cap."
          : "No extra arrival page was signalled by the source pull."
      }
    };
  }

  async function fetchWindowForAirports(airportIds, start, end, pageLimitMap) {
    const allFlights = [];
    const coverageByAirport = {};
    for (const airportId of airportIds) {
      const airport = AIRPORTS[airportId];
      const maxPages = pageLimitMap[airportId] || 1;
      const arrivalsUrl = `${base}/airports/${airportId}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const departuresUrl = `${base}/airports/${airportId}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=${maxPages}`;
      const [arrivalsResult, departuresResult] = await Promise.all([
        getJsonWithMeta(arrivalsUrl, "scheduled_arrivals"),
        getJsonWithMeta(departuresUrl, "scheduled_departures")
      ]);
      const arrivalsRaw = arrivalsResult.json;
      const departuresRaw = departuresResult.json;
      const arrivals = dedupe(Array.isArray(arrivalsRaw.scheduled_arrivals) ? arrivalsRaw.scheduled_arrivals.map((f) => serialiseArrival(f, airport)) : []);
      const departures = dedupe(Array.isArray(departuresRaw.scheduled_departures) ? departuresRaw.scheduled_departures.map((f) => serialiseDeparture(f, airport)) : []);
      coverageByAirport[airport.code] = {
        arrivals: { ...arrivalsResult.meta, maxPagesRequested: maxPages, uniqueCount: arrivals.length },
        departures: { ...departuresResult.meta, maxPagesRequested: maxPages, uniqueCount: departures.length }
      };
      allFlights.push(...arrivals, ...departures);
    }
    return { flights: dedupe(allFlights), coverageMeta: buildCoverageMeta(coverageByAirport) };
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

  async function saveSnapshot(scope, summary) {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent) {
      return { enabled: false, saved: false, note: "Snapshot saving is ready but not active. Add a private Vercel Blob store and BLOB_READ_WRITE_TOKEN to start collecting history.", recentCount: null };
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


  function buildRollingHistoryFromSnapshots(snapshots) {
    const serviceDateMap = new Map();

    for (const snapshot of snapshots) {
      const slots = Array.isArray(snapshot?.departureSlots) ? snapshot.departureSlots : [];
      for (const slot of slots) {
        if (!slot?.scheduledDep || !slot?.hub || !slot?.airline) continue;
        const routeKey = `${slot.origin || ""}|${slot.hub}|${slot.airline}`;
        const serviceDate = getPakistanDateKey(slot.scheduledDep);
        const weekday = getPakistanWeekdayKey(slot.scheduledDep);
        const dedupeKey = `${routeKey}|${serviceDate}`;
        if (!serviceDateMap.has(dedupeKey)) {
          serviceDateMap.set(dedupeKey, { routeKey, weekday, times: new Set(), usable: 0, scheduled: 0 });
        }
        const item = serviceDateMap.get(dedupeKey);
        item.scheduled += 1;
        item.times.add(getPakistanTimeKey(slot.scheduledDep));
        if (slot.usable) item.usable += 1;
      }
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

    const serviceDays = serviceDateMap.size;
    return {
      enabled: true,
      recentSnapshots: snapshots.length,
      serviceDays,
      note: serviceDays >= 3
        ? `Rolling baseline available from ${serviceDays} observed service day${serviceDays === 1 ? "" : "s"}.`
        : `History is building. ${serviceDays} observed service day${serviceDays === 1 ? "" : "s"} captured so far.`,
      rollingByRouteWeekday
    };
  }

  async function loadRollingHistory(scope) {
    const tokenPresent = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    if (!tokenPresent) {
      return { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline not available until Blob history is enabled.", rollingByRouteWeekday: {} };
    }
    try {
      const sdk = await import("@vercel/blob");
      if (!sdk?.list || !sdk?.get) {
        return { enabled: true, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline needs @vercel/blob list and get support in the project.", rollingByRouteWeekday: {} };
      }

      let cursor;
      let hasMore = true;
      const blobs = [];
      while (hasMore && blobs.length < 40) {
        const listed = await sdk.list({ prefix: `snapshots/flight-tracker/${scope.key}/`, limit: 20, cursor });
        blobs.push(...(Array.isArray(listed?.blobs) ? listed.blobs : []));
        hasMore = Boolean(listed?.hasMore) && blobs.length < 40;
        cursor = listed?.cursor;
      }

      const ordered = blobs
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 21);

      const snapshots = [];
      for (const blob of ordered) {
        const result = await sdk.get(blob.pathname, { access: "private" });
        if (!result || result.statusCode !== 200) continue;
        const text = await new Response(result.stream).text();
        snapshots.push(JSON.parse(text));
      }

      return buildRollingHistoryFromSnapshots(snapshots);
    } catch (error) {
      return { enabled: true, recentSnapshots: 0, serviceDays: 0, note: error?.message || "Rolling baseline could not be loaded.", rollingByRouteWeekday: {} };
    }
  }

  try {
    const generatedAt = new Date().toISOString();
    const requestedScope = req.query?.airport || req.query?.scope || "ISB";
    const scope = resolveScope(requestedScope);
    const { start, end } = getBroadPakistanWindow();
    const { flights: dedupedFlights, coverageMeta } = await fetchWindowForAirports(scope.airportIds, start, end, scope.pageLimitMap);
    dedupedFlights.sort((a, b) => {
      const aTime = toMillis(a.bestDep || a.bestArr || a.scheduledDep || a.scheduledArr) || 0;
      const bTime = toMillis(b.bestDep || b.bestArr || b.scheduledDep || b.scheduledArr) || 0;
      return aTime - bTime;
    });
    const flightsWithPax = dedupedFlights.map((f) => ({ ...f, estimatedPax: 0 }));
    const snapshotSummary = buildSnapshotSummary(scope, flightsWithPax, generatedAt, coverageMeta);
    const snapshotMeta = await saveSnapshot(scope, snapshotSummary);
    const historyMeta = await loadRollingHistory(scope);
    return sendJson(200, {
      generatedAt,
      cacheSeconds: CACHE_SECONDS,
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
    });
  } catch (error) {
    const generatedAt = new Date().toISOString();
    return sendJson(500, {
      generatedAt,
      cacheSeconds: CACHE_SECONDS,
      scope: "ISB",
      scopeLabel: "Islamabad default",
      snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving unavailable because the flight refresh failed.", recentCount: null },
      coverageMeta: { departures: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, arrivals: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, byAirport: {} },
      historyMeta: { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline unavailable because the flight refresh failed.", rollingByRouteWeekday: {} },
      filtersMeta: { airports: ["ISB", "LHE", "KHI", "ALL"], airlines: [], statuses: [], directions: [] },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."]
    });
  }
}
