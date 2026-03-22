export default async function handler(req, res) {
  const apiKey = "hn1UO6XF9P3DrZPwMPi5ABgWXEV3wrvF";

  const base = "https://aeroapi.flightaware.com/aeroapi";
  const airport = { id: "OPIS", code: "ISB", name: "Islamabad" };

  function headers() {
    return {
      "x-apikey": apiKey,
      "accept": "application/json"
    };
  }

  function flightNumber(f) {
    return f.ident_iata || f.ident || "—";
  }

  function routeForArrival(f) {
    return f.origin_iata || f.origin || "—";
  }

  function routeForDeparture(f) {
    return f.destination_iata || f.destination || "—";
  }

  function scheduledForArrival(f) {
    return f.scheduled_in || f.estimated_in || f.actual_in || null;
  }

  function scheduledForDeparture(f) {
    return f.scheduled_out || f.estimated_out || f.actual_out || null;
  }

  function deriveArrivalStatus(f) {
    if (f.cancelled) return "Cancelled";
    if (f.actual_in) return "Arrived";
    if (f.estimated_in && f.scheduled_in && f.estimated_in !== f.scheduled_in) return "Delayed";
    if (f.status) return f.status;
    return "Scheduled";
  }

  function deriveDepartureStatus(f) {
    if (f.cancelled) return "Cancelled";
    if (f.actual_out) return "Departed";
    if (f.estimated_out && f.scheduled_out && f.estimated_out !== f.scheduled_out) return "Delayed";
    if (f.status) return f.status;
    return "Scheduled";
  }

  function serialiseArrival(f) {
    return {
      number: flightNumber(f),
      route: routeForArrival(f),
      scheduledTime: scheduledForArrival(f),
      estimatedTime: f.estimated_in || null,
      actualTime: f.actual_in || null,
      status: deriveArrivalStatus(f)
    };
  }

  function serialiseDeparture(f) {
    return {
      number: flightNumber(f),
      route: routeForDeparture(f),
      scheduledTime: scheduledForDeparture(f),
      estimatedTime: f.estimated_out || null,
      actualTime: f.actual_out || null,
      status: deriveDepartureStatus(f)
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((f) => {
      const key = [f.number, f.route, f.scheduledTime].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

    const arrivalsUrl = `${base}/airports/${airport.id}/flights/arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=1`;
    const departuresUrl = `${base}/airports/${airport.id}/flights/departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=1`;

    const [arrivalsRaw, departuresRaw] = await Promise.all([
      getJson(arrivalsUrl),
      getJson(departuresUrl)
    ]);

    const arrivals = dedupe(
      Array.isArray(arrivalsRaw.arrivals)
        ? arrivalsRaw.arrivals.map(serialiseArrival)
        : []
    );

    const departures = dedupe(
      Array.isArray(departuresRaw.departures)
        ? departuresRaw.departures.map(serialiseDeparture)
        : []
    );

    const all = [...arrivals, ...departures];
    const delayed = all.filter(f => String(f.status).toLowerCase().includes("delay")).length;
    const cancelled = all.filter(f => String(f.status).toLowerCase().includes("cancel")).length;

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      airports: [
        {
          airportCode: airport.code,
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
          warnings: []
        }
      ],
      totals: {
        flights: all.length,
        delayed,
        cancelled,
        delayedPct: all.length ? Number(((delayed / all.length) * 100).toFixed(1)) : 0,
        cancelledPct: all.length ? Number(((cancelled / all.length) * 100).toFixed(1)) : 0
      },
      warnings: ["Testing mode: Islamabad only to reduce FlightAware quota usage."]
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
      warnings: [error.message || "Failed to load FlightAware data."]
    });
  }
}
