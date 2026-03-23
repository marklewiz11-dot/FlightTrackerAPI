export default async function handler(req, res) {
  const apiKey = "hn1UO6XF9P3DrZPwMPi5ABgWXEV3wrvF";
  const base = "https://aeroapi.flightaware.com/aeroapi";

  const AIRPORTS = {
    OPIS: { code: "ISB", name: "Islamabad" },
    OPLA: { code: "LHE", name: "Lahore" },
    OPKC: { code: "KHI", name: "Karachi" }
  };

  const airlineMap = {
    PIA: "Pakistan International Airlines",
    PK: "Pakistan International Airlines",
    U4: "PMI Air",
    PA: "Airblue",
    ABQ: "Airblue",
    ER: "SereneAir",
    SEP: "SereneAir",
    PF: "Fly Jinnah",
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
    FDB: "flydubai"
  };

  const MAJOR_AIRLINES = new Set([
    "Pakistan International Airlines",
    "Airblue",
    "SereneAir",
    "Fly Jinnah",
    "Emirates",
    "Qatar Airways",
    "Etihad Airways",
    "British Airways",
    "Turkish Airlines",
    "Saudia",
    "Oman Air",
    "flydubai"
  ]);

  function headers() {
    return {
      "x-apikey": apiKey,
      accept: "application/json"
    };
  }

  function flightNumber(f) {
    return f.ident_iata || f.ident || "—";
  }

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

  function fullAirlineName(f) {
    if (f.operator) return f.operator;
    const iata = f.operator_iata || "";
    const icao = f.operator_icao || "";
    return airlineMap[iata] || airlineMap[icao] || iata || icao || "—";
  }

  function getDepScheduled(f) {
    return f.scheduled_off || f.scheduled_out || null;
  }

  function getDepEstimated(f) {
    return f.estimated_off || f.estimated_out || null;
  }

  function getDepActual(f) {
    return f.actual_off || f.actual_out || null;
  }

  function getArrScheduled(f) {
    return f.scheduled_on || f.scheduled_in || null;
  }

  function getArrEstimated(f) {
    return f.estimated_on || f.estimated_in || null;
  }

  function getArrActual(f) {
    return f.actual_on || f.actual_in || null;
  }

  function bestDepTime(f) {
    return getDepActual(f) || getDepEstimated(f) || getDepScheduled(f);
  }

  function bestArrTime(f) {
    return getArrActual(f) || getArrEstimated(f) || getArrScheduled(f);
  }

  function getDelayMinutes(f, direction) {
    const scheduled = direction === "Arrival" ? getArrScheduled(f) : getDepScheduled(f);
    const relevant =
      direction === "Arrival"
        ? (getArrActual(f) || getArrEstimated(f))
        : (getDepActual(f) || getDepEstimated(f));

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
      diverted: Boolean(f.diverted)
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
      diverted: Boolean(f.diverted)
    };
  }

  function dedupe(list) {
    const seen = new Set();

    return list.filter((f) => {
      const key = [
        f.number,
        f.direction,
        f.airportCode,
        f.scheduledDep || f.scheduledArr || "",
        f.origin,
        f.destination
      ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getPakistanWindow(dayMode = "all") {
    const now = new Date();

    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);

    const y = localParts.find((p) => p.type === "year").value;
    const m = localParts.find((p) => p.type === "month").value;
    const d = localParts.find((p) => p.type === "day").value;

    const baseStart = new Date(`${y}-${m}-${d}T00:00:00+05:00`);

    let startDate = new Date(baseStart);
    let endDate = new Date(baseStart);

    if (dayMode === "today") {
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    } else if (dayMode === "tomorrow") {
      startDate = new Date(baseStart.getTime() + 24 * 60 * 60 * 1000);
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    } else {
      endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    }

    return {
      start: startDate.toISOString().replace(".000Z", "Z"),
      end: endDate.toISOString().replace(".000Z", "Z")
    };
  }

  async function getJson(url) {
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status} ${text}`);
    }
    return r.json();
  }

  try {
    const requestedDay = String(req.query.day || "all").toLowerCase();
    const requestedAirport = String(req.query.airport || "ALL").toUpperCase();
    const includeMinor = String(req.query.includeMinor || "true").toLowerCase() === "true";

    const { start, end } = getPakistanWindow(requestedDay);

    const airportIds =
      requestedAirport === "ALL"
        ? Object.keys(AIRPORTS)
        : Object.keys(AIRPORTS).filter((id) => AIRPORTS[id].code === requestedAirport);

    if (!airportIds.length) {
      return res.status(200).json({
        generatedAt: new Date().toISOString(),
        cacheSeconds: 60,
        filtersMeta: {
          airports: ["ALL", ...Object.values(AIRPORTS).map((a) => a.code)],
          airlines: [],
          statuses: ["On Time", "Delayed", "Cancelled", "In Air", "Departed", "Arrived", "Diverted", "Scheduled"],
          directions: ["Both", "Departure", "Arrival"]
        },
        summary: {
          totalFlights: 0,
          cancelled: 0,
          diverted: 0,
          delayed60: 0,
          preDepDelays: 0,
          avgDelayMinutes: 0
        },
        flights: [],
        warnings: [`No matching airport for value ${requestedAirport}`]
      });
    }

    const allFlights = [];

    for (const airportId of airportIds) {
      const airport = AIRPORTS[airportId];

      const arrivalsUrl =
        `${base}/airports/${airportId}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=4`;

      const departuresUrl =
        `${base}/airports/${airportId}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=4`;

      const [arrivalsRaw, departuresRaw] = await Promise.all([
        getJson(arrivalsUrl),
        getJson(departuresUrl)
      ]);

      const arrivals = dedupe(
        Array.isArray(arrivalsRaw.scheduled_arrivals)
          ? arrivalsRaw.scheduled_arrivals.map((f) => serialiseArrival(f, airport))
          : []
      );

      const departures = dedupe(
        Array.isArray(departuresRaw.scheduled_departures)
          ? departuresRaw.scheduled_departures.map((f) => serialiseDeparture(f, airport))
          : []
      );

      allFlights.push(...arrivals, ...departures);
    }

    let flights = dedupe(allFlights);

    if (!includeMinor) {
      flights = flights.filter((f) => MAJOR_AIRLINES.has(f.airline));
    }

    flights.sort((a, b) => {
      const aTime = toMillis(a.bestDep || a.bestArr || a.scheduledDep || a.scheduledArr) || 0;
      const bTime = toMillis(b.bestDep || b.bestArr || b.scheduledDep || b.scheduledArr) || 0;
      return aTime - bTime;
    });

    const cancelled = flights.filter((f) => f.status === "Cancelled").length;
    const diverted = flights.filter((f) => f.diverted).length;
    const delayed60 = flights.filter((f) => (f.delayMinutes || 0) >= 60).length;
    const preDepDelays = flights.filter(
      (f) => f.direction === "Departure" && (f.delayMinutes || 0) > 0 && !f.actualDep
    ).length;

    const avgDelay = flights.filter((f) => (f.delayMinutes || 0) > 0);
    const avgDelayMinutes = avgDelay.length
      ? Math.round(avgDelay.reduce((sum, f) => sum + (f.delayMinutes || 0), 0) / avgDelay.length)
      : 0;

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      cacheSeconds: 60,
      filtersMeta: {
        airports: ["ALL", ...Object.values(AIRPORTS).map((a) => a.code)],
        airlines: [...new Set(flights.map((f) => f.airline).filter(Boolean))].sort(),
        statuses: ["On Time", "Delayed", "Cancelled", "In Air", "Departed", "Arrived", "Diverted", "Scheduled"],
        directions: ["Both", "Departure", "Arrival"]
      },
      summary: {
        totalFlights: flights.length,
        cancelled,
        diverted,
        delayed60,
        preDepDelays,
        avgDelayMinutes
      },
      flights,
      warnings: [
        includeMinor
          ? "Pakistan major and smaller carriers shown."
          : "Major carriers only.",
        "FlightAware source. Pakistan day window."
      ]
    });
  } catch (error) {
    return res.status(500).json({
      generatedAt: new Date().toISOString(),
      cacheSeconds: 60,
      filtersMeta: {
        airports: [],
        airlines: [],
        statuses: [],
        directions: []
      },
      summary: {
        totalFlights: 0,
        cancelled: 0,
        diverted: 0,
        delayed60: 0,
        preDepDelays: 0,
        avgDelayMinutes: 0
      },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."]
    });
  }
}
