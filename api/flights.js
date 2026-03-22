export default async function handler(req, res) {
  const apiKey = "PASTE_YOUR_AERODATABOX_KEY_HERE";

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

  function movementQualityText(movement) {
    const q = Array.isArray(movement?.quality) ? movement.quality : [];
    if (q.includes("Live")) return "Live";
    if (q.includes("Approximate")) return "Approximate";
    if (q.includes("Basic")) return "Basic";
    return "Unknown";
  }

  function deriveStatus(flight, direction) {
    const raw = flight?.status || "Unknown";
    const movement = direction === "arrival" ? flight.arrival : flight.departure;

    if (!movement) return raw;

    if (movement.runwayTime?.local) {
      return direction === "arrival" ? "Arrived" : "Departed";
    }

    if (raw && raw !== "Unknown") {
      return raw;
    }

    if (movement.revisedTime?.local && movement.scheduledTime?.local) {
      return "Revised";
    }

    if (movement.predictedTime?.local && movement.scheduledTime?.local) {
      return "Predicted";
    }

    return "Unknown";
  }

  function serialiseFlight(flight, direction) {
    const movement = direction === "arrival" ? flight.arrival : flight.departure;
    const opposite = direction === "arrival" ? flight.departure : flight.arrival;

    return {
      number:
        flight?.number ||
        flight?.callSign ||
        flight?.airline?.iata && flight?.number
          ? `${flight.airline.iata}${flight.number}`
          : flight?.number ||
            flight?.callSign ||
            "—",
      airline: flight?.airline?.name || "—",
      route: opposite?.airport?.name || movement?.airport?.name || "—",
      scheduledTime: movement?.scheduledTime?.local || null,
      revisedTime: movement?.revisedTime?.local || null,
      predictedTime: movement?.predictedTime?.local || null,
      runwayTime: movement?.runwayTime?.local || null,
      terminal: movement?.terminal || null,
      gate: movement?.gate || null,
      baggageBelt: movement?.baggageBelt || null,
      aircraft: flight?.aircraft?.model || null,
      status: deriveStatus(flight, direction),
      quality: movementQualityText(movement),
      codeshare: flight?.codeshareStatus || null
    };
  }

  async function getAirport(airport) {
    const url = new URL(`${base}/flights/airports/iata/${airport.iata}`);
    url.searchParams.set("offsetMinutes", "-180");
    url.searchParams.set("durationMinutes", "960");
    url.searchParams.set("direction", "Both");
    url.searchParams.set("withCancelled", "true");
    url.searchParams.set("withCodeshared", "true");
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
    const arrivals = Array.isArray(raw.arrivals) ? raw.arrivals.map(f => serialiseFlight(f, "arrival")) : [];
    const departures = Array.isArray(raw.departures) ? raw.departures.map(f => serialiseFlight(f, "departure")) : [];
    const all = [...arrivals, ...departures];

    const delayed = all.filter(f => String(f.status).toLowerCase().includes("delay")).length;
    const cancelled = all.filter(f => {
      const s = String(f.status).toLowerCase();
      return s.includes("cancel");
    }).length;

    const warnings = [];
    if (coverage && Array.isArray(coverage)) {
      const nonOk = coverage.filter(x => x.status && !["OK", "OKPartial"].includes(x.status));
      if (nonOk.length) {
        warnings.push(`Coverage not fully live for ${airport.name}`);
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

    const delayedPct = totals.flights ? Number(((totals.delayed / totals.flights) * 100).toFixed(1)) : 0;
    const cancelledPct = totals.flights ? Number(((totals.cancelled / totals.flights) * 100).toFixed(1)) : 0;

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
      totals: { flights: 0, delayed: 0, cancelled: 0, delayedPct: 0, cancelledPct: 0 },
      warnings: [error.message || "Failed to load AeroDataBox data."]
    });
  }
}
