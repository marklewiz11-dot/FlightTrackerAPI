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
  if (s.includes("arrived") || s.includes("departed") || s.includes("on time") || s.includes("early")) return "status-good";
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

function pakistanTime(value) {
  if (!value) return "—";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    return "—";
  }
}

function displayStatus(flight) {
  const status = String(flight.status || "").toLowerCase();

  if (status === "delayed" && flight.estimatedTime) {
    return `Delayed to ${pakistanTime(flight.estimatedTime)}`;
  }

  if (status === "early" && flight.estimatedTime) {
    return `Early ${pakistanTime(flight.estimatedTime)}`;
  }

  if (status === "on time") {
    return "On Time";
  }

  return flight.status || "Unknown";
}

function displayTime(flight) {
  const status = String(flight.status || "").toLowerCase();

  if ((status === "delayed" || status === "early" || status === "on time") && flight.estimatedTime) {
    return pakistanTime(flight.estimatedTime);
  }

  return pakistanTime(flight.scheduledTime);
}

function rowHtml(flight) {
  const status = displayStatus(flight);

  return `
    <tr>
      <td class="flightCol">${flight.number || "—"}</td>
      <td class="routeCol">${flight.route || "—"}</td>
      <td class="timeCol">${displayTime(flight)}</td>
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
              <th>Time</th>
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
        <div class="muted">Updated ${new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Karachi",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }).format(new Date(airport.lastUpdated))}</div>
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
    ? `Updated ${new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(data.generatedAt))} PKT`
    : "Updated just now";

  airportGrid.innerHTML = airports.map(airportCard).join("");
}

load();
