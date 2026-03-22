function fmtPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function metric(label, value) {
  return `
    <div class="metric">
      <div class="metricLabel">${label}</div>
      <div class="metricValue">${value}</div>
    </div>
  `;
}

function statusClass(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("cancel")) return "status-bad";
  if (s.includes("delay")) return "status-warn";
  if (s.includes("arrived") || s.includes("departed")) return "status-good";
  return "status-neutral";
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function metricSet(totals) {
  return [
    metric("Total Flights", totals.flights || 0),
    metric("Delayed", totals.delayed || 0),
    metric("Cancelled", totals.cancelled || 0),
    metric("Delayed %", fmtPct(totals.delayedPct || 0)),
    metric("Cancelled %", fmtPct(totals.cancelledPct || 0))
  ].join("");
}

function shortTime(value) {
  if (!value) return "—";
  const str = String(value);
  const match = str.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : str;
}

function displayStatus(flight) {
  if (String(flight.status).toLowerCase() === "delayed" && flight.estimatedTime) {
    return `Delayed to ${shortTime(flight.estimatedTime)}`;
  }
  return flight.status || "Unknown";
}

function rowHtml(flight) {
  const status = displayStatus(flight);

  return `
    <tr>
      <td class="flightCol">${flight.number || "—"}</td>
      <td class="routeCol">${flight.route || "—"}</td>
      <td class="timeCol">${shortTime(flight.scheduledTime)}</td>
      <td>
        <span class="statusPill ${statusClass(status)}">
          <span class="dot"></span>${status}
        </span>
      </td>
    </tr>
  `;
}

function tableHtml(title, rows) {
  return `
    <div>
      <div class="panelTitle">${title}</div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Flight</th>
              <th>Route</th>
              <th>Sched</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="4">No data returned</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function airportCard(airport) {
  return `
    <section class="airportCard">
      <div class="airportHead">
        <div>
          <h2 class="airportName">${airport.airportName}</h2>
          <div class="airportMeta">Arrivals ${airport.totals.arrivals} • Departures ${airport.totals.departures}</div>
        </div>
        <div class="muted">Updated ${new Date(airport.lastUpdated).toLocaleTimeString()}</div>
      </div>

      <div class="airportMetrics">
        ${metricSet(airport.totals)}
      </div>

      ${(airport.warnings || []).length ? `<div class="notice" style="margin:0 18px 16px">${airport.warnings.join(" • ")}</div>` : ""}

      <div class="split">
        ${tableHtml("Arrivals", (airport.arrivals || []).slice(0, 24))}
        ${tableHtml("Departures", (airport.departures || []).slice(0, 24))}
      </div>
    </section>
  `;
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
  const totals = data.totals || {
    flights: 0,
    delayed: 0,
    cancelled: 0,
    delayedPct: 0,
    cancelledPct: 0
  };

  nationalMetrics.innerHTML = metricSet(totals);

  const warningItems = safeArray(data.warnings);
  warnings.innerHTML = warningItems.length
    ? warningItems.map(w => `<div class="notice">${w}</div>`).join("")
    : "";

  lastUpdated.textContent = data.generatedAt
    ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
    : "Updated just now";

  airportGrid.innerHTML = airports.map(airportCard).join("");
}

load();
