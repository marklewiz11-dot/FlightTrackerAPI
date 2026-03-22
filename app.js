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
  if (s.includes("arrived") || s.includes("departed") || s.includes("on time") || s.includes("early")) return "status-good";
  return "status-neutral";
}

function renderKpis(summary) {
  const el = document.getElementById("kpis");
  el.innerHTML = `
    <div class="kpi"><div class="kpiLabel">Total Flights</div><div class="kpiValue">${summary.totalFlights || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Cancelled</div><div class="kpiValue">${summary.cancelled || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Diverted</div><div class="kpiValue">${summary.diverted || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Delayed &gt;60m</div><div class="kpiValue">${summary.delayed60 || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Pre-dep Delays</div><div class="kpiValue">${summary.preDepDelays || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Avg Delay</div><div class="kpiValue">${summary.avgDelayMinutes || 0}m</div></div>
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
  if (row.status === "Delayed" && (row.estimatedDep || row.estimatedArr)) {
    const t = row.direction === "Departure"
      ? pakistanDateParts(row.estimatedDep).time
      : pakistanDateParts(row.estimatedArr).time;
    return `Delayed`;
  }
  return row.status || "Unknown";
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
    const primary = row.direction === "Departure" ? row.scheduledDep : row.scheduledArr;
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
    tbody.innerHTML = `<tr><td colspan="11">No flights match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td class="flightCell">${row.number}</td>
      <td>${row.airline || "—"}</td>
      <td>${row.origin || "—"}</td>
      <td>${row.destination || "—"}</td>
      <td class="timeCell">${displayTime(row.scheduledDep)}</td>
      <td class="timeCell">${displayTime(row.scheduledArr)}</td>
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

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
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

load();
