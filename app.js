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
  if (s.includes("cancel")) return "bad";
  if (s.includes("delay") || s.includes("revised")) return "warn";
  if (s.includes("arrived") || s.includes("departed") || s.includes("boarding") || s.includes("gateclosed") || s.includes("enroute") || s.includes("approaching")) return "good";
  if (s.includes("expected") || s.includes("predicted")) return "neutral";
  return "neutral";
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function metricSet(totals) {
  return [
    metric("Total Flights", totals.flights || 0),
    metric("Delayed Flights", totals.delayed || 0),
    metric("Cancelled Flights", totals.cancelled || 0),
    metric("Delayed %", fmtPct(totals.delayedPct || 0)),
    metric("Cancelled %", fmtPct(totals.cancelledPct || 0))
  ].join("");
}

function shortTime(value) {
  if (!value) return "—";
  return String(value).includes("T") ? String(value).slice(11, 16) : String(value).slice(0, 5);
}

function rowHtml(flight) {
  const displayStatus =
    flight.status === "Revised" && flight.revisedTime
      ? `Delayed to ${shortTime(flight.revisedTime)}`
      : flight.status === "Predicted" && flight.predictedTime
      ? `Predicted ${shortTime(flight.predictedTime)}`
      : flight.status || "Unknown";

  const extra =
    flight.quality && flight.quality !== "Unknown"
      ? ` <span class="muted">(${flight.quality})</span>`
      : "";

  return `
    <tr>
      <td>${flight.number || "—"}</td>
      <td>${flight.route || "—"}</td>
      <td>${shortTime(flight.scheduledTime)}</td>
      <td>
        <span class="status ${statusClass(displayStatus)}">
          <span class="dot"></span>${displayStatus}${extra}
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
        ${tableHtml("Arrivals", (airport.arrivals || []).slice(0, 20))}
        ${tableHtml("Departures", (airport.departures || []).slice(0, 20))}
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
  const totals = data.totals || { flights: 0, delayed: 0, cancelled: 0, delayedPct: 0, cancelledPct: 0 };

  nationalMetrics.innerHTML = metricSet(totals);

  const warningItems = safeArray(data.warnings);
  warnings.innerHTML = warningItems.length
    ? warningItems.map(w => `<div class="notice">${w}</div>`).join("")
    : `<div class="notice">Live airport boards powered by AeroDataBox.</div>`;

  lastUpdated.textContent = data.generatedAt
    ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
    : "Updated just now";

  airportGrid.innerHTML = airports.map(airportCard).join("");
}

load();
setInterval(load, 5 * 60 * 1000);
