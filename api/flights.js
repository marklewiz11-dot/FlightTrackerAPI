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

  function toMillis(value) {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }

  function compareTimes(scheduled, estimated) {
    const s = toMillis(scheduled);
    const e = toMillis(estimated);

    if (s == null || e == null) return null;

    const diffMinutes = Math.round((e - s) / 60000);

    if (diffMinutes >= 10) return { state: "delayed", diffMinutes };
    if (diffMinutes <= -10) return { state: "early", diffMinutes };
    return { state: "ontime", diffMinutes };
  }

  function deriveArrivalStatus(f) {
    const raw = String(f.status || "").toLowerCase();
    const cmp = compareTimes(f.scheduled_in, f.estimated_in);

    if (f.cancelled) return "Cancelled";
    if (f.actual_in) return "Arrived";
    if (raw.includes("cancel")) return "Cancelled";
    if (raw.includes("arriv")) return "Arrived";
    if (cmp?.state === "delayed") return "Delayed";
    if (cmp?.state === "early") return "Early";
    if (cmp?.state === "ontime") return "On Time";

    return "Scheduled";
  }

  function deriveDepartureStatus(f) {
    const raw = String(f.status || "").toLowerCase();
    const cmp = compareTimes(f.scheduled_out, f.estimated_out);

    if (f.cancelled) return "Cancelled";
    if (f.actual_out) return "Departed";
    if (raw.includes("cancel")) return "Cancelled";
    if (raw.includes("depart")) return "Departed";
    if (cmp?.state === "delayed") return "Delayed";
    if (cmp?.state === "early") return "Early";
    if (cmp?.state === "ontime") return "On Time";

    return "Scheduled";
  }

  function serialiseArrival(f) {
    const cmp = compareTimes(f.scheduled_in, f.estimated_in);
    return {
      id: `${flightNumber(f)}|ARR|${f.scheduled_in || ""}`,
      airportCode: airport.code,
      airportName: airport.name,
      direction: "Arrival",
      number: flightNumber(f),
      airline: f.operator || f.operator_iata || "—",
      origin: airportCode(f.origin),
      destination: airport.code,
      scheduledDep: null,
      scheduledArr: f.scheduled_in || null,
      estimatedDep: null,
      estimatedArr: f.estimated_in || null,
      actualDep: null,
      actualArr: f.actual_in || null,
      status: deriveArrivalStatus(f),
      delayMinutes: cmp?.state === "delayed" ? cmp.diffMinutes : 0,
      aircraft: f.aircraft_type || "—",
      type: "PAX",
      diverted: false
    };
  }

  function serialiseDeparture(f) {
    const cmp = compareTimes(f.scheduled_out, f.estimated_out);
    return {
      id: `${flightNumber(f)}|DEP|${f.scheduled_out || ""}`,
      airportCode: airport.code,
      airportName: airport.name,
      direction: "Departure",
      number: flightNumber(f),
      airline: f.operator || f.operator_iata || "—",
      origin: airport.code,
      destination: airportCode(f.destination),
      scheduledDep: f.scheduled_out || null,
      scheduledArr: null,
      estimatedDep: f.estimated_out || null,
      estimatedArr: null,
      actualDep: f.actual_out || null,
      actualArr: null,
      status: deriveDepartureStatus(f),
      delayMinutes: cmp?.state === "delayed" ? cmp.diffMinutes : 0,
      aircraft: f.aircraft_type || "—",
      type: "PAX",
      diverted: false
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((f) => {
      const key = [f.number, f.direction, f.scheduledDep || f.scheduledArr, f.origin, f.destination].join("|");
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

    const flights = [...departures, ...arrivals];

    const cancelled = flights.filter(f => f.status === "Cancelled").length;
    const diverted = flights.filter(f => f.diverted).length;
    const delayed60 = flights.filter(f => (f.delayMinutes || 0) >= 60).length;
    const preDepDelays = flights.filter(f => f.direction === "Departure" && (f.delayMinutes || 0) > 0 && !f.actualDep).length;
    const avgDelay = flights.filter(f => (f.delayMinutes || 0) > 0);
    const avgDelayMinutes = avgDelay.length
      ? Math.round(avgDelay.reduce((sum, f) => sum + (f.delayMinutes || 0), 0) / avgDelay.length)
      : 0;

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      filtersMeta: {
        airports: [airport.code],
        airlines: [...new Set(flights.map(f => f.airline).filter(Boolean))].sort(),
        statuses: ["On Time", "Delayed", "Cancelled", "Departed", "Arrived", "Scheduled", "Early"],
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
      warnings: ["Testing mode: Islamabad only. Window set to today and tomorrow in Pakistan time."]
    });
  } catch (error) {
    return res.status(500).json({
      generatedAt: new Date().toISOString(),
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
