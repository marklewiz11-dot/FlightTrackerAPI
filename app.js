let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "All",
  airline: "All",
  status: "All"
};

function pakistanDateParts(value) {
  const d = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d)
  };
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel")) return "status-bad";
  if (s.includes("delay")) return "status-warn";
  if (s.includes("arrived") || s.includes("departed") || s.includes("on time")) return "status-good";
  return "status-neutral";
}

function renderKpis(summary) {
  const el = document.getElementById("kpis");
  el.innerHTML = `
    <div class="kpi">
      <div class="kpiLabel">Total Flights</div>
      <div class="kpiValue">${summary.totalFlights || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpiLabel">Cancelled</div>
      <div class="kpiValue">${summary.cancelled || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpiLabel">Diverted</div>
      <div class="kpiValue">${summary.diverted || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpiLabel">Delayed >60m</div>
      <div class="kpiValue">${summary.delayed60 || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpiLabel">Pre dep delays</div>
      <div class="kpiValue">${summary.preDepDelays || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpiLabel">Avg Delay</div>
      <div class="kpiValue">${summary.avgDelayMinutes || 0}m</div>
    </div>
  `;
}

function fillSelect(id, items, includeAll = true) {
  const el = document.getElementById(id);
  const current = el.value || "All";
  const values = includeAll ? ["All", ...items] : items;
  el.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join("");
  if (values.includes(current)) el.value = current;
}

function delayText(row) {
  return row.delayMinutes ? `${row.delayMinutes}m` : "—";
}

function displayStatus(row) {
  return row.status || "Unknown";
}

function bestDepTime(row) {
  return row.actualDep || row.estimatedDep || row.scheduledDep || null;
}

function bestArrTime(row) {
  return row.actualArr || row.estimatedArr || row.scheduledArr || null;
}

function displayTime(value) {
  if (!value) return "—";
  return pakistanDateParts(value).time;
}

function todayTomorrowFilter(rows) {
  if (state.day === "all") return rows;

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(tomorrowDate);

  return rows.filter(row => {
    const primary = row.direction === "Departure"
      ? (row.scheduledDep || row.estimatedDep || row.actualDep)
      : (row.scheduledArr || row.estimatedArr || row.actualArr);

    if (!primary) return false;

    const date = pakistanDateParts(primary).date;

    if (state.day === "today") return date === today;
    if (state.day === "tomorrow") return date === tomorrow;
    return true;
  });
}

function applyFilters(rows) {
  let out = [...rows];

  out = todayTomorrowFilter(out);

  if (state.direction !== "Both") {
    out = out.filter(r => r.direction === state.direction);
  }

  if (state.airport !== "All") {
    out = out.filter(r => r.airportCode === state.airport);
  }

  if (state.airline !== "All") {
    out = out.filter(r => r.airline === state.airline);
  }

  if (state.status !== "All") {
    out = out.filter(r => r.status === state.status);
  }

  return out;
}

function renderWarnings(warnings) {
  const el = document.getElementById("warnings");
  el.innerHTML = safeArray(warnings).map(w => `<div class="notice">${w}</div>`).join("");
}

function renderRows(rows) {
  const tbody = document.getElementById("flightRows");
  document.getElementById("flightCount").textContent = rows.length;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="emptyState">No flights match the current filters.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <div class="flightCell">${row.number}</div>
        <div class="flightSub">${row.direction}</div>
      </td>
      <td>${row.airline || "—"}</td>
      <td>${row.origin || "—"}</td>
      <td>${row.destination || "—"}</td>
      <td class="timeCell">${displayTime(bestDepTime(row))}</td>
      <td class="timeCell">${displayTime(bestArrTime(row))}</td>
      <td>
        <span class="statusPill ${statusClass(row.status)}">
          <span class="statusDot"></span>${displayStatus(row)}
        </span>
      </td>
      <td class="delayCell">${delayText(row)}</td>
      <td>${row.aircraft || "—"}</td>
      <td>${row.type || "—"}</td>
      <td>${row.diverted ? "Yes" : "—"}</td>
    </tr>
  `).join("");
}

function refreshClock() {
  const el = document.getElementById("clockInfo");
  if (!el) return;

  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  el.textContent = `PKT ${time}`;
}

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
}

function resetFilters() {
  state.day = "today";
  state.direction = "Both";
  state.airport = "All";
  state.airline = "All";
  state.status = "All";

  document.querySelectorAll(".seg").forEach(x => {
    x.classList.toggle("active", x.dataset.day === "today");
  });

  document.getElementById("directionFilter").value = "Both";
  document.getElementById("airportFilter").value = "All";
  document.getElementById("airlineFilter").value = "All";
  document.getElementById("statusFilter").value = "All";

  refreshView();
}

function exportRows() {
  if (!state.raw) return;

  const rows = applyFilters(state.raw.flights || []);
  const headers = ["Flight", "Airline", "Origin", "Destination", "Departure", "Arrival", "Status", "Delay", "Aircraft", "Type", "Diverted"];

  const lines = rows.map(row => [
    row.number || "",
    row.airline || "",
    row.origin || "",
    row.destination || "",
    displayTime(bestDepTime(row)),
    displayTime(bestArrTime(row)),
    row.status || "",
    delayText(row),
    row.aircraft || "",
    row.type || "",
    row.diverted ? "Yes" : ""
  ]);

  const csv = [headers, ...lines]
    .map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pakistan-flight-board.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function load() {
  const res = await fetch("/api/flights", { cache: "no-store" });
  const data = await res.json();
  state.raw = data;

  renderKpis(data.summary || {});
  renderWarnings(data.warnings || []);

  fillSelect("airportFilter", safeArray(data.filtersMeta?.airports || []));
  fillSelect("airlineFilter", safeArray(data.filtersMeta?.airlines || []));
  fillSelect("statusFilter", safeArray(data.filtersMeta?.statuses || []));
  fillSelect("directionFilter", safeArray(data.filtersMeta?.directions || []), false);

  const updated = data.generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(data.generatedAt))
    : "—";

  document.getElementById("cacheInfo").textContent = `Cache: just now • ${updated} PKT`;

  refreshView();
  refreshClock();
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("seg")) {
    document.querySelectorAll(".seg").forEach(x => x.classList.remove("active"));
    e.target.classList.add("active");
    state.day = e.target.dataset.day;
    refreshView();
  }
});

document.getElementById("directionFilter").addEventListener("change", (e) => {
  state.direction = e.target.value;
  refreshView();
});

document.getElementById("airportFilter").addEventListener("change", (e) => {
  state.airport = e.target.value;
  refreshView();
});

document.getElementById("airlineFilter").addEventListener("change", (e) => {
  state.airline = e.target.value;
  refreshView();
});

document.getElementById("statusFilter").addEventListener("change", (e) => {
  state.status = e.target.value;
  refreshView();
});

document.getElementById("resetFilters").addEventListener("click", resetFilters);
document.getElementById("exportBtn").addEventListener("click", exportRows);

setInterval(refreshClock, 1000 * 30);

load();
