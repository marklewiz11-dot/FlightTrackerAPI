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

  function airportCode(value) {
    if (!value) return "—";
    if (typeof value === "string") return value;
    return value.code_iata || value.code_icao || value.code || value.name || "—";
  }

  function shortTime(value) {
    if (!value) return null;
    const s = String(value);
    const m = s.match(/T(\d{2}:\d{2})/);
    return m ? m[1] : s;
  }

  function deriveArrivalStatus(f) {
    if (f.cancelled) return "Cancelled";
    if (f.actual_in) return "Arrived";
    if (f.estimated_in && f.scheduled_in && f.estimated_in !== f.scheduled_in) return "Delayed";
    return f.status || "Scheduled";
  }

  function deriveDepartureStatus(f) {
    if (f.cancelled) return "Cancelled";
    if (f.actual_out) return "Departed";
    if (f.estimated_out && f.scheduled_out && f.estimated_out !== f.scheduled_out) return "Delayed";
    return f.status || "Scheduled";
  }

  function serialiseArrival(f) {
    return {
      number: flightNumber(f),
      route: airportCode(f.origin),
      scheduledTime: f.scheduled_in || f.estimated_in || f.actual_in || null,
      status: deriveArrivalStatus(f),
      estimatedTime: f.estimated_in || null,
      actualTime: f.actual_in || null
    };
  }

  function serialiseDeparture(f) {
    return {
      number: flightNumber(f),
      route: airportCode(f.destination),
      scheduledTime: f.scheduled_out || f.estimated_out || f.actual_out || null,
      status: deriveDepartureStatus(f),
      estimatedTime: f.estimated_out || null,
      actualTime: f.actual_out || null
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
    const arrivalsUrl = `${base}/airports/${airport.id}/flights/scheduled_arrivals?max_pages=1`;
    const departuresUrl = `${base}/airports/${airport.id}/flights/scheduled_departures?max_pages=1`;

    const [arrivalsRaw, departuresRaw] = await Promise.all([
      getJson(arrivalsUrl),
      getJson(departuresUrl)
    ]);

    const arrivals = dedupe(
      Array.isArray(arrivalsRaw.scheduled_arrivals)
        ? arrivalsRaw.scheduled_arrivals.map(serialiseArrival)
        : []
    );

    const departures = dedupe(
      Array.isArray(departuresRaw.scheduled_departures)
        ? departuresRaw.scheduled_departures.map(serialiseDeparture)
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
          warnings: ["Testing mode: Islamabad only using FlightAware scheduled airport board endpoints."]
        }
      ],
      totals: {
        flights: all.length,
        delayed,
        cancelled,
        delayedPct: all.length ? Number(((delayed / all.length) * 100).toFixed(1)) : 0,
        cancelledPct: all.length ? Number(((cancelled / all.length) * 100).toFixed(1)) : 0
      },
      warnings: []
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
