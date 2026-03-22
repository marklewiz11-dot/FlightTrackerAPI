export default async function handler(req, res) {
  const apiKey = "PASTE_YOUR_FLIGHTAWARE_KEY_HERE";

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

  function toMillis(value) {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }

  function isMeaningfullyDelayed(scheduled, estimated) {
    const s = toMillis(scheduled);
    const e = toMillis(estimated);
    if (s == null || e == null) return false;

    const diffMinutes = (e - s) / 60000;
    return diffMinutes >= 10;
  }

  function deriveArrivalStatus(f) {
    const raw = String(f.status || "").toLowerCase();

    if (f.cancelled) return "Cancelled";
    if (f.actual_in) return "Arrived";
    if (raw.includes("delay")) return "Delayed";
    if (isMeaningfullyDelayed(f.scheduled_in, f.estimated_in)) return "Delayed";

    return "Scheduled";
  }

  function deriveDepartureStatus(f) {
    const raw = String(f.status || "").toLowerCase();

    if (f.cancelled) return "Cancelled";
    if (f.actual_out) return "Departed";
    if (raw.includes("delay")) return "Delayed";
    if (isMeaningfullyDelayed(f.scheduled_out, f.estimated_out)) return "Delayed";

    return "Scheduled";
  }

  function serialiseArrival(f) {
    return {
      number: flightNumber(f),
      route: airportCode(f.origin),
      scheduledTime: f.scheduled_in || null,
      estimatedTime: f.estimated_in || null,
      actualTime: f.actual_in || null,
      status: deriveArrivalStatus(f)
    };
  }

  function serialiseDeparture(f) {
    return {
      number: flightNumber(f),
      route: airportCode(f.destination),
      scheduledTime: f.scheduled_out || null,
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

  function getPakistanTodayTomorrowBounds() {
    const now = new Date();

    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);

    const y = localParts.find(p => p.type === "year").value;
    const m = localParts.find(p => p.type === "month").value;
    const d = localParts.find(p => p.type === "day").value;

    const start = `${y}-${m}-${d}T00:00:00+05:00`;

    const startDate = new Date(`${y}-${m}-${d}T00:00:00+05:00`);
    const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    const end = endDate.toISOString().replace(".000Z", "Z");

    return { start, end };
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
    const { start, end } = getPakistanTodayTomorrowBounds();

    const arrivalsUrl =
      `${base}/airports/${airport.id}/flights/scheduled_arrivals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=2`;

    const departuresUrl =
      `${base}/airports/${airport.id}/flights/scheduled_departures?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=2`;

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
    const delayed = all.filter(f => String(f.status).toLowerCase() === "delayed").length;
    const cancelled = all.filter(f => String(f.status).toLowerCase() === "cancelled").length;

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
          warnings: ["Delayed is shown only when explicitly delayed or at least 10 minutes later than scheduled."]
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
