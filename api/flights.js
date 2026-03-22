export default async function handler(req, res) {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      generatedAt: new Date().toISOString(),
      airports: [],
      totals: { flights: 0, delayed: 0, cancelled: 0, delayedPct: 0, cancelledPct: 0 },
      warnings: ["AERODATABOX_API_KEY is missing in Vercel environment variables."]
    });
  }

  const base = "https://prod.api.market/api/v1/aedbx/aerodatabox";
  const airports = ["ISB", "LHE", "KHI"];
  const names = { ISB: "Islamabad", LHE: "Lahore", KHI: "Karachi" };

  async function getAirport(code) {
    const url = new URL(`${base}/flights/airports/iata/${code}`);
    url.searchParams.set("offsetMinutes", "-120");
    url.searchParams.set("durationMinutes", "720");
    url.searchParams.set("direction", "Both");
    url.searchParams.set("withLeg", "true");
    url.searchParams.set("withCancelled", "true");
    url.searchParams.set("withCodeshared", "false");
    url.searchParams.set("withCargo", "true");
    url.searchParams.set("withPrivate", "false");
    url.searchParams.set("withLocation", "false");

    const response = await fetch(url.toString(), {
      headers: { "x-magicapi-key": apiKey, "accept": "application/json" }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${code} failed: ${response.status} ${text}`);
    }

    const raw = await response.json();
    const arrivals = Array.isArray(raw.arrivals) ? raw.arrivals : [];
    const departures = Array.isArray(raw.departures) ? raw.departures : [];
    const all = [...arrivals, ...departures];
    const delayed = all.filter(f => JSON.stringify(f).toLowerCase().includes("delay")).length;
    const cancelled = all.filter(f => JSON.stringify(f).toLowerCase().includes("cancel")).length;

    return {
      airportCode: code,
      airportName: names[code],
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
      departures
    };
  }

  try {
    const results = await Promise.allSettled(airports.map(getAirport));
    const airportBlocks = [];
    const warnings = [];
    for (const result of results) {
      if (result.status === "fulfilled") airportBlocks.push(result.value);
      else warnings.push(result.reason.message);
    }
    const totals = airportBlocks.reduce((acc, a) => {
      acc.flights += a.totals.flights;
      acc.delayed += a.totals.delayed;
      acc.cancelled += a.totals.cancelled;
      return acc;
    }, { flights: 0, delayed: 0, cancelled: 0 });
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
