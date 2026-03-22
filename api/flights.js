export default async function handler(req, res) {
  const apiKey = "cmn1fzpdc0001k004gqkdnzkh";

  const base = "https://prod.api.market/api/v1/aedbx/aerodatabox";
  const airports = [
    { iata: "ISB", icao: "OPIS", name: "Islamabad" },
    { iata: "LHE", icao: "OPLA", name: "Lahore" },
    { iata: "KHI", icao: "OPKC", name: "Karachi" }
  ];

  async function getCoverage(icao) {
    const response = await fetch(`${base}/health/services/airports/${icao}/feeds`, {
      headers: {
        "x-magicapi-key": apiKey,
        accept: "application/json"
      }
    });

    if (!response.ok) return null;
    return response.json();
  }

  function airportLabel(airport) {
    if (!airport) return "—";
    return (
      airport.shortName ||
      airport.municipalityName ||
      airport.name ||
      airport.iata ||
      airport.icao ||
      "—"
    );
  }

  function movementQualityText(movement) {
    const q = Array.isArray(movement?.quality) ? movement.quality : [];
    if (q.includes("Live")) return "Live";
    if (q.includes("Approximate")) return "Approximate";
    if (q.includes("Basic")) return "Basic";
    return "Unknown";
  }

  function deriveStatus(flight, movement, direction) {
    const raw = flight?.status || "Unknown";

    if (movement?.runwayTime?.local) {
      return direction === "arrival" ? "Arrived" : "Departed";
    }

    if (raw && raw !== "Unknown") {
      return raw;
    }

    if (movement?.revisedTime?.local) {
      return "Revised";
    }

    if (movement?.predictedTime?.local) {
      return "Predicted";
    }

    if (movement?.scheduledTime?.local) {
      return "Scheduled";
    }

    return "Unknown";
  }

  function serialiseFlight(flight, direction) {
    const movement = direction === "arrival" ? flight?.arrival : flight?.departure;
    const opposite = direction === "arrival" ? flight?.departure : flight?.arrival;

    const scheduledTime =
      movement?.scheduledTime?.local ||
      movement?.revisedTime?.local ||
      movement?.predictedTime?.local ||
      null;

    return {
      number:
        flight?.number ||
        flight?.callSign ||
        (flight?.airline?.iata && flight?.number
          ? `${flight.airline.iata}${flight.number}`
          : null) ||
        "—",
      airline: flight?.airline?.name || "—",
      route: airportLabel(opposite?.airport),
      scheduledTime,
      revisedTime: movement?.revisedTime?.local || null,
      predictedTime: movement?.predictedTime?.local || null,
      runwayTime: movement?.runwayTime?.local || null,
      terminal: movement?.terminal || null,
      gate: movement?.gate || null,
      baggageBelt: movement?.baggageBelt || null,
      aircraft: flight?.aircraft?.model || null,
      status: deriveStatus(flight, movement, direction),
      quality: movementQualityText(movement),
      codeshare: flight?.codeshareStatus || null
    };
  }

  function dedupeFlights(list) {
    const seen = new Set();

    return list.filter((f) => {
      const key = [
        f.number || "",
        f.route || "",
        f.scheduledTime || "",
        f.status || ""
      ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function getAirport(airport) {
    const url = new URL(`${base}/flights/airports/iata/${airport.iata}`);
    url.searchParams.set("offsetMinutes", "0");
    url.searchParams.set("durationMinutes", "720");
    url.searchParams.set("direction", "Both");
    url.searchParams.set("withLeg", "true");
    url.searchParams.set("withCancelled", "true");
    url.searchParams.set("withCodeshared", "false");
    url.searchParams.set("withCargo", "true");
    url.searchParams.set("withPrivate", "false");
    url.searchParams.set("withLocation", "false");

    const [fidsRes, coverage] = await Promise.all([
      fetch(url.toString(), {
        headers: {
          "x-magicapi-key": apiKey,
          accept: "application/json"
        }
      }),
      getCoverage(airport.icao)
    ]);

    if (!fidsRes.ok) {
      const text = await fidsRes.text();
      throw new Error(`${airport.iata} failed: ${fidsRes.status} ${text}`);
    }

    const raw = await fidsRes.json();

    let arrivals = Array.isArray(raw.arrivals)
      ? raw.arrivals.map(f => serialiseFlight(f, "arrival"))
      : [];

    let departures = Array.isArray(raw.departures)
      ? raw.departures.map(f => serialiseFlight(f, "departure"))
      : [];

    arrivals = dedupeFlights(arrivals);
    departures = dedupeFlights(departures);

    const all = [...arrivals, ...departures];

    const delayed = all.filter(f => String(f.status).toLowerCase().includes("delay")).length;
    const cancelled = all.filter(f => String(f.status).toLowerCase().includes("cancel")).length;

    const warnings = [];

    if (coverage && !Array.isArray(coverage)) {
      const liveStatus = coverage?.liveFlightUpdatesFeed?.status;
      const scheduleStatus = coverage?.flightSchedulesFeed?.status;

      if (liveStatus && !["OK", "OKPartial"].includes(liveStatus)) {
        warnings.push(`Live updates limited for ${airport.name}`);
      }

      if (scheduleStatus && !["OK", "OKPartial"].includes(scheduleStatus)) {
        warnings.push(`Schedule feed limited for ${airport.name}`);
      }
    }

    return {
      airportCode: airport.iata,
      airportName: airport.name,
      lastUpdated: new Date().toISOString(),
      totals: {
        flights: all.length,
        delayed,
        cancelled,
        delayedPct: all.length ? Number(((delayed / all.length) * 100).toFixed(1)) : 0,
        cancelledPct: all.length ? Number(((cancelled / all.length) * 100).toFixed(1)) : 0,
        arrivals: arrivals.length,
        departures: departures.length
      },
      arrivals,
      departures,
      warnings
    };
  }

  try {
    const results = await Promise.allSettled(airports.map(getAirport));

    const airportBlocks = [];
    const warnings = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        airportBlocks.push(result.value);
        if (Array.isArray(result.value.warnings)) warnings.push(...result.value.warnings);
      } else {
        warnings.push(result.reason.message);
      }
    }

    const totals = airportBlocks.reduce(
      (acc, a) => {
        acc.flights += a.totals.flights;
        acc.delayed += a.totals.delayed;
        acc.cancelled += a.totals.cancelled;
        return acc;
      },
      { flights: 0, delayed: 0, cancelled: 0 }
    );

    const delayedPct = totals.flights
      ? Number(((totals.delayed / totals.flights) * 100).toFixed(1))
      : 0;

    const cancelledPct = totals.flights
      ? Number(((totals.cancelled / totals.flights) * 100).toFixed(1))
      : 0;

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      airports: airportBlocks,
      totals: { ...totals, delayedPct, cancelledPct },
      warnings
    });
  } catch (error) {
    return res.status(500).json({
      generatedAt: new Date().toISOString(),
      airports: [],
      totals: {
        flights: 0,
        delayed: 0,
        cancelled: 0,
        delayedPct: 0,
        cancelledPct: 0
      },
      warnings: [error.message || "Failed to load AeroDataBox data."]
    });
  }
}
