let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "ALL",
  airline: "All",
  status: "All",
  includeMinor: true,
  timezoneMode: "PKT",
  cacheSeconds: 60,
  cacheRemaining: 60
};

function getTimeZoneInfo() {
  if (state.timezoneMode === "UK") {
    return {
      label: "UK time",
      zone: "Europe/London",
      suffix: "UK"
    };
  }

  return {
    label: "Pakistan time",
    zone: "Asia/Karachi",
    suffix: "PKT"
  };
}

function zonedDateParts(value) {
  const d = new Date(value);
  const tz = getTimeZoneInfo().zone;

  return {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
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
    <div class="kpi"><div class="kpiLabel">Total Flights</div><div class="kpiValue">${summary.totalFlights || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Cancelled</div><div class="kpiValue">${summary.cancelled || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Diverted</div><div class="kpiValue">${summary.diverted || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Delayed >60m</div><div class="kpiValue">${summary.delayed60 || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Pre dep Delays</div><div class="kpiValue">${summary.preDepDelays || 0}</div></div>
    <div class="kpi"><div class="kpiLabel">Avg Delay</div><div class="kpiValue">${summary.avgDelayMinutes || 0}m</div></div>
  `;
}

function fillSelect(id, items, includeAll = true) {
  const el = document.getElementById(id);
  const current = el.value || (includeAll ? "All" : "");
  const values = includeAll ? ["All", ...items] : items;
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join("");
  if (values.includes(current)) {
    el.value = current;
  } else if (values.length) {
    el.value = includeAll ? "All" : values[0];
  }
}

function delayText(row) {
  return row.delayMinutes ? `${row.delayMinutes}m` : "—";
}

function displayStatus(row) {
  return row.status || "Unknown";
}

function bestDepTime(row) {
  return row.bestDep || row.actualDep || row.estimatedDep || row.scheduledDep || null;
}

function bestArrTime(row) {
  return row.bestArr || row.actualArr || row.estimatedArr || row.scheduledArr || null;
}

function displayTime(value) {
  if (!value) return "—";
  return zonedDateParts(value).time;
}

function applyFilters(rows) {
  let out = [...rows];

  if (state.direction !== "Both") {
    out = out.filter((r) => r.direction === state.direction);
  }

  if (state.airport !== "ALL" && state.airport !== "All") {
    out = out.filter((r) => r.airportCode === state.airport);
  }

  if (state.airline !== "All") {
    out = out.filter((r) => r.airline === state.airline);
  }

  if (state.status !== "All") {
    out = out.filter((r) => r.status === state.status);
  }

  return out;
}

function renderWarnings(warnings) {
  const el = document.getElementById("warnings");
  el.innerHTML = safeArray(warnings).map((w) => `<div class="notice">${w}</div>`).join("");
}

function renderRows(rows) {
  const tbody = document.getElementById("flightRows");
  document.getElementById("flightCount").textContent = rows.length;
  document.getElementById("timezoneNote").textContent = getTimeZoneInfo().label;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="emptyState">No flights match the current filters.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td><div class="flightCell">${row.number}</div></td>
      <td title="${row.airline || ""}">${row.airline || "—"}</td>
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

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
}

function updateCacheUi() {
  const total = Math.max(1, state.cacheSeconds || 60);
  const remaining = Math.max(0, state.cacheRemaining);
  const pct = (remaining / total) * 100;

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  const countdown = document.getElementById("cacheCountdown");
  const fill = document.getElementById("cacheBarFill");

  if (countdown) countdown.textContent = `${minutes}:${seconds}`;
  if (fill) fill.style.width = `${pct}%`;
}

function startCacheTimer() {
  state.cacheRemaining = state.cacheSeconds || 60;
  updateCacheUi();

  if (window.cacheTimer) clearInterval(window.cacheTimer);

  window.cacheTimer = setInterval(() => {
    state.cacheRemaining -= 1;

    if (state.cacheRemaining <= 0) {
      state.cacheRemaining = 0;
      updateCacheUi();
      load();
      return;
    }

    updateCacheUi();
  }, 1000);
}

function buildBriefing() {
  const rows = applyFilters((state.raw && state.raw.flights) || []);
  const delayed = rows.filter((r) => r.status === "Delayed");
  const cancelled = rows.filter((r) => r.status === "Cancelled");
  const inAir = rows.filter((r) => r.status === "In Air");
  const arrived = rows.filter((r) => r.status === "Arrived");
  const departed = rows.filter((r) => r.status === "Departed");

  const topDelays = delayed
    .sort((a, b) => (b.delayMinutes || 0) - (a.delayMinutes || 0))
    .slice(0, 5)
    .map((r) => `<li>${r.number} ${r.airline} ${r.direction.toLowerCase()} delay ${r.delayMinutes || 0} minutes</li>`)
    .join("");

  return `
    <p><strong>Board summary:</strong> ${rows.length} flights currently shown.</p>
    <p><strong>Status overview:</strong> ${cancelled.length} cancelled, ${inAir.length} in air, ${arrived.length} arrived, ${departed.length} departed, ${delayed.length} delayed.</p>
    <p><strong>Most delayed flights:</strong></p>
    <ul>${topDelays || "<li>No material delays in current filtered view.</li>"}</ul>
    <p><strong>Time basis:</strong> ${getTimeZoneInfo().label} display.</p>
  `;
}

function openBriefing() {
  const modal = document.getElementById("briefingModal");
  const body = document.getElementById("briefingBody");
  if (!modal || !body) return;
  body.innerHTML = buildBriefing();
  modal.classList.remove("hidden");
}

function closeBriefing() {
  const modal = document.getElementById("briefingModal");
  if (modal) modal.classList.add("hidden");
}

async function load() {
  const url = `/api/flights?day=${encodeURIComponent(state.day)}&airport=${encodeURIComponent(state.airport)}&includeMinor=${state.includeMinor}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  state.raw = data;
  state.cacheSeconds = Number(data.cacheSeconds || 60);

  renderKpis(data.summary || {});
  renderWarnings(data.warnings || []);

  fillSelect("airportFilter", safeArray(data.filtersMeta?.airports || []), false);
  fillSelect("airlineFilter", safeArray(data.filtersMeta?.airlines || []));
  fillSelect("statusFilter", safeArray(data.filtersMeta?.statuses || []));
  fillSelect("directionFilter", safeArray(data.filtersMeta?.directions || []), false);

  if (safeArray(data.filtersMeta?.airports || []).includes(state.airport)) {
    document.getElementById("airportFilter").value = state.airport;
  } else {
    state.airport = "ALL";
    document.getElementById("airportFilter").value = "ALL";
  }

  document.getElementById("minorCarrierToggle").checked = state.includeMinor;

  const updated = data.generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(data.generatedAt))
    : "—";

  const cacheInfo = document.getElementById("cacheInfo");
  if (cacheInfo) cacheInfo.textContent = `Cache updated ${updated} PKT`;

  refreshView();
  startCacheTimer();
}

function resetFilters() {
  state.day = "today";
  state.direction = "Both";
  state.airport = "ALL";
  state.airline = "All";
  state.status = "All";
  state.includeMinor = true;

  document.querySelectorAll(".seg").forEach((x) => {
    x.classList.toggle("active", x.dataset.day === "today");
  });

  document.getElementById("directionFilter").value = "Both";
  document.getElementById("airportFilter").value = "ALL";
  document.getElementById("airlineFilter").value = "All";
  document.getElementById("statusFilter").value = "All";
  document.getElementById("minorCarrierToggle").checked = true;

  load();
}

function exportRows() {
  if (!state.raw) return;

  const rows = applyFilters(state.raw.flights || []);
  const headers = ["Flight", "Airline", "Origin", "Destination", "Departure", "Arrival", "Status", "Delay", "Aircraft", "Type", "Diverted"];

  const lines = rows.map((row) => [
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
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pakistan-flight-board.csv";
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("seg")) {
    document.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.day = e.target.dataset.day;
    load();
  }

  if (e.target.classList.contains("timeBtn")) {
    document.querySelectorAll(".timeBtn").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.timezoneMode = e.target.dataset.tz;
    refreshView();
  }
});

document.getElementById("directionFilter").addEventListener("change", (e) => {
  state.direction = e.target.value;
  refreshView();
});

document.getElementById("airportFilter").addEventListener("change", (e) => {
  state.airport = e.target.value;
  load();
});

document.getElementById("airlineFilter").addEventListener("change", (e) => {
  state.airline = e.target.value;
  refreshView();
});

document.getElementById("statusFilter").addEventListener("change", (e) => {
  state.status = e.target.value;
  refreshView();
});

document.getElementById("minorCarrierToggle").addEventListener("change", (e) => {
  state.includeMinor = e.target.checked;
  load();
});

const resetBtn = document.getElementById("resetFilters");
if (resetBtn) resetBtn.addEventListener("click", resetFilters);

const exportBtn = document.getElementById("exportBtn");
if (exportBtn) exportBtn.addEventListener("click", exportRows);

const briefingBtn = document.getElementById("briefingBtn");
if (briefingBtn) briefingBtn.addEventListener("click", openBriefing);

const closeBriefingBtn = document.getElementById("closeBriefingBtn");
if (closeBriefingBtn) closeBriefingBtn.addEventListener("click", closeBriefing);

const printBriefingBtn = document.getElementById("printBriefingBtn");
if (printBriefingBtn) printBriefingBtn.addEventListener("click", () => window.print());

const briefingModal = document.getElementById("briefingModal");
if (briefingModal) {
  briefingModal.addEventListener("click", (e) => {
    if (e.target.id === "briefingModal") closeBriefing();
  });
}

load();
