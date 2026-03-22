function fmtPct(value) { return `${Number(value || 0).toFixed(1)}%`; }
function metric(label, value) { return `<div class="metric"><div class="metricLabel">${label}</div><div class="metricValue">${value}</div></div>`; }
function statusClass(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("cancel")) return "bad";
  if (s.includes("delay")) return "warn";
  if (s.includes("landed") || s.includes("arrived") || s.includes("departed") || s.includes("on time") || s.includes("scheduled")) return "good";
  return "neutral";
}
function safeArray(v) { return Array.isArray(v) ? v : []; }
function rowHtml(flight) {
  const number = flight.number || flight.flightNumber || flight.callsign || flight.identification?.number?.default || "—";
  const route = flight.departure?.airport?.name || flight.arrival?.airport?.name || flight.airport?.name || flight.movement?.airport?.name || flight.route || "—";
  const time = flight.departure?.scheduledTime?.local || flight.arrival?.scheduledTime?.local || flight.scheduledTime?.local || flight.time?.scheduled || flight.scheduledTime || "—";
  const shortTime = String(time).includes("T") ? String(time).slice(11, 16) : String(time).slice(0, 5);
  const status = flight.status || flight.statusText || flight.flightStatus || flight.departure?.status || flight.arrival?.status || "Unknown";
  return `<tr><td>${number}</td><td>${route}</td><td>${shortTime}</td><td><span class="status ${statusClass(status)}"><span class="dot"></span>${status}</span></td></tr>`;
}
function tableHtml(title, rows) {
  return `<div><div class="panelTitle">${title}</div><div class="tableWrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Sched</th><th>Status</th></tr></thead><tbody>${rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="4">No data returned</td></tr>`}</tbody></table></div></div>`;
}
function airportCard(airport) {
  return `<section class="airportCard"><div class="airportHead"><div><h2 class="airportName">${airport.airportName}</h2><div class="airportMeta">Arrivals ${airport.totals.arrivals} • Departures ${airport.totals.departures}</div></div><div class="muted">Updated ${new Date(airport.lastUpdated).toLocaleTimeString()}</div></div><div class="airportMetrics">${metric("Total Flights", airport.totals.flights)}${metric("Delayed", airport.totals.delayed)}${metric("Cancelled", airport.totals.cancelled)}${metric("Delayed %", fmtPct(airport.totals.delayedPct))}${metric("Cancelled %", fmtPct(airport.totals.cancelledPct))}</div><div class="split">${tableHtml("Arrivals", safeArray(airport.arrivals).slice(0,20))}${tableHtml("Departures", safeArray(airport.departures).slice(0,20))}</div></section>`;
}
async function load() {
  const airportGrid = document.getElementById("airportGrid");
  const nationalMetrics = document.getElementById("nationalMetrics");
  const warnings = document.getElementById("warnings");
  const lastUpdated = document.getElementById("lastUpdated");
  airportGrid.innerHTML = `<div class="loading">Loading live flight data…</div>`;
  const res = await fetch("/api/flights", { cache: "no-store" });
  const data = await res.json();
  const airports = safeArray(data.airports);
  const totals = data.totals || { flights: 0, delayed: 0, cancelled: 0, delayedPct: 0, cancelledPct: 0 };
  nationalMetrics.innerHTML = [metric("Total Flights", totals.flights || 0), metric("Delayed Flights", totals.delayed || 0), metric("Cancelled Flights", totals.cancelled || 0), metric("Delayed %", fmtPct(totals.delayedPct || 0)), metric("Cancelled %", fmtPct(totals.cancelledPct || 0))].join("");
  const warningItems = safeArray(data.warnings);
  warnings.innerHTML = warningItems.length ? warningItems.map(w => `<div class="notice">${w}</div>`).join("") : `<div class="notice">Live airport boards powered by AeroDataBox.</div>`;
  lastUpdated.textContent = data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : "Updated just now";
  airportGrid.innerHTML = airports.map(airportCard).join("");
}
load();
setInterval(load, 5 * 60 * 1000);
