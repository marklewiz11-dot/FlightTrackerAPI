let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "ALL",
  airline: "All",
  status: "All",
  includeMinor: false,
  timezoneMode: "PKT",
  cacheSeconds: 60,
  cacheRemaining: 60
};

const AIRLINE_STATUS_LINKS = [
  { name: "Airblue", url: "https://www.airblue.com/flightinfo/status", note: "Official live flight status page" },
  { name: "SereneAir", url: "https://www.sereneair.com/status", note: "Official flight status tool" },
  { name: "Fly Jinnah", url: "https://www.flyjinnah.com/en/Manage/Flight-Status/Check-Flight-Status", note: "Official flight status page" },
  { name: "PIA", url: "https://www.piac.com.pk/", note: "Official airline site with flight status function" },
  { name: "Emirates", url: "https://www.emirates.com/english/help/flight-status/", note: "Official status page" },
  { name: "Qatar Airways", url: "https://www.qatarairways.com/en/flight-status.html", note: "Official status page" },
  { name: "Etihad Airways", url: "https://www.etihad.com/en/manage/flight-status", note: "Official status page" },
  { name: "British Airways", url: "https://www.britishairways.com/travel/flightstatus/public/en_gb/search/FindFlightStatusPublic", note: "Official status page" },
  { name: "Turkish Airlines", url: "https://www.turkishairlines.com/en-int/flights/flight-status/", note: "Official status page" },
  { name: "Saudia", url: "https://www.saudia.com/pages/travel-information/flight-status", note: "Official status page" },
  { name: "Oman Air", url: "https://www.omanair.com/gbl/en/flight-status", note: "Official status page" },
  { name: "flydubai", url: "https://www.flydubai.com/en/plan/timetable-and-status", note: "Official status page" }
];

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

function scoreAirport(rows) {
  const total = rows.length || 1;
  const bad = rows.filter(r => r.status === "Cancelled" || r.status === "Diverted").length;
  const delayed = rows.filter(r => r.status === "Delayed").length;
  const ratio = (bad * 2 + delayed) / total;

  if (ratio >= 0.45) return { label: "Severe", cls: "health-bad" };
  if (ratio >= 0.2) return { label: "Degraded", cls: "health-warn" };
  return { label: "Stable", cls: "health-good" };
}

function renderCrisisPanels(rows) {
  const crisisStats = document.getElementById("crisisStats");
  const hubOptions = document.getElementById("hubOptions");
  const airportHealth = document.getElementById("airportHealth");

  const delayed = rows.filter(r => r.status === "Delayed");
  const cancelled = rows.filter(r => r.status === "Cancelled");
  const diverted = rows.filter(r => r.status === "Diverted");
  const inAir = rows.filter(r => r.status === "In Air");
  const severe = rows.filter(r => (r.delayMinutes || 0) >= 120);

  crisisStats.innerHTML = `
    <div class="miniStat"><span class="miniStatLabel">Affected</span><span class="miniStatValue">${delayed.length + cancelled.length + diverted.length}</span></div>
    <div class="miniStat"><span class="miniStatLabel">Cancelled</span><span class="miniStatValue">${cancelled.length}</span></div>
    <div class="miniStat"><span class="miniStatLabel">Diverted</span><span class="miniStatValue">${diverted.length}</span></div>
    <div class="miniStat"><span class="miniStatLabel">In Air</span><span class="miniStatValue">${inAir.length}</span></div>
    <div class="miniStat"><span class="miniStatLabel">Delay >120m</span><span class="miniStatValue">${severe.length}</span></div>
  `;

  const hubKeywords = [
    { name: "Doha", keys: ["DOH", "Doha"] },
    { name: "Dubai", keys: ["DXB", "Dubai", "DWC"] },
    { name: "Abu Dhabi", keys: ["AUH", "Abu Dhabi"] },
    { name: "Istanbul", keys: ["IST", "Istanbul", "SAW"] },
    { name: "Jeddah", keys: ["JED", "Jeddah"] },
    { name: "Riyadh", keys: ["RUH", "Riyadh"] },
    { name: "London", keys: ["LHR", "LGW", "London"] }
  ];

  const departures = rows
    .filter(r => r.direction === "Departure")
    .sort((a, b) => {
      const at = new Date(bestDepTime(a) || 0).getTime();
      const bt = new Date(bestDepTime(b) || 0).getTime();
      return at - bt;
    });

  const hubCards = hubKeywords.map(hub => {
    const match = departures.find(r =>
      hub.keys.some(k => String(r.destination || "").toLowerCase().includes(k.toLowerCase()))
    );

    if (!match) {
      return `<div class="hubRow"><span class="hubName">${hub.name}</span><span class="hubNone">No current departure shown</span></div>`;
    }

    return `
      <div class="hubRow">
        <span class="hubName">${hub.name}</span>
        <span class="hubFlight">${match.number}</span>
        <span class="hubTime">${displayTime(bestDepTime(match))}</span>
        <span class="hubStatus ${statusClass(match.status)}">${match.status}</span>
      </div>
    `;
  }).join("");

  hubOptions.innerHTML = hubCards;

  const airports = ["ISB", "LHE", "KHI"];
  airportHealth.innerHTML = airports.map(code => {
    const airportRows = rows.filter(r => r.airportCode === code);
    const score = scoreAirport(airportRows);
    return `
      <div class="healthRow">
        <span class="healthCode">${code}</span>
        <span class="healthCount">${airportRows.length} flights</span>
        <span class="healthBadge ${score.cls}">${score.label}</span>
      </div>
    `;
  }).join("");
}

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
  renderCrisisPanels(rows);
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

function buildInstructions() {
  return `
    <p><strong>What this dashboard does</strong></p>
    <p>This dashboard provides a browser based operational flight board for Pakistan using FlightAware airport board data for Islamabad, Lahore and Karachi. It is designed to support a quick situational picture rather than act as an official airport source.</p>

    <p><strong>How the board is built</strong></p>
    <ul>
      <li>Data source is FlightAware AeroAPI.</li>
      <li>The board queries scheduled arrivals and scheduled departures for the selected Pakistan airport window.</li>
      <li>Times are displayed in either Pakistan time or UK time using the toggle at the top.</li>
      <li>The cache timer shows when the dashboard will refresh again.</li>
    </ul>

    <p><strong>Status logic</strong></p>
    <ul>
      <li><strong>Cancelled</strong> is shown when the source indicates cancellation.</li>
      <li><strong>Diverted</strong> is shown when the source indicates diversion.</li>
      <li><strong>Arrived</strong> is shown when actual arrival exists.</li>
      <li><strong>In Air</strong> is shown when actual departure exists but no actual arrival is present.</li>
      <li><strong>Delayed</strong> is shown when estimated or actual time is materially later than scheduled.</li>
      <li><strong>On Time</strong> is shown when scheduled and estimated times align closely.</li>
      <li><strong>Scheduled</strong> is used where there is not enough evidence for a stronger state.</li>
    </ul>

    <p><strong>Assumptions and limitations</strong></p>
    <ul>
      <li>The board is conservative and avoids guessing where source evidence is weak.</li>
      <li>It is intended for operational awareness and briefing support, not as the sole basis for passenger decisions.</li>
      <li>The count shown is the board window count, not a complete all movement aviation picture.</li>
      <li>Use Airline Status links for official operator level updates during major disruption.</li>
    </ul>
  `;
}

function buildAirlineStatus() {
  return `
    <p><strong>Use these official airline pages alongside the board during disruption.</strong></p>
    <div class="linkList">
      ${AIRLINE_STATUS_LINKS.map(link => `
        <a class="statusLinkCard" href="${link.url}" target="_blank" rel="noopener noreferrer">
          <span class="statusLinkName">${link.name}</span>
          <span class="statusLinkNote">${link.note}</span>
        </a>
      `).join("")}
    </div>
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

function openInstructions() {
  const modal = document.getElementById("instructionsModal");
  const body = document.getElementById("instructionsBody");
  if (!modal || !body) return;
  body.innerHTML = buildInstructions();
  modal.classList.remove("hidden");
}

function closeInstructions() {
  const modal = document.getElementById("instructionsModal");
  if (modal) modal.classList.add("hidden");
}

function openAirlineStatus() {
  const modal = document.getElementById("airlineStatusModal");
  const body = document.getElementById("airlineStatusBody");
  if (!modal || !body) return;
  body.innerHTML = buildAirlineStatus();
  modal.classList.remove("hidden");
}

function closeAirlineStatus() {
  const modal = document.getElementById("airlineStatusModal");
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
  state.includeMinor = false;

  document.querySelectorAll(".seg").forEach((x) => {
    x.classList.toggle("active", x.dataset.day === "today");
  });

  document.getElementById("directionFilter").value = "Both";
  document.getElementById("airportFilter").value = "ALL";
  document.getElementById("airlineFilter").value = "All";
  document.getElementById("statusFilter").value = "All";
  document.getElementById("minorCarrierToggle").checked = false;

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

const instructionsBtn = document.getElementById("instructionsBtn");
if (instructionsBtn) instructionsBtn.addEventListener("click", openInstructions);

const closeInstructionsBtn = document.getElementById("closeInstructionsBtn");
if (closeInstructionsBtn) closeInstructionsBtn.addEventListener("click", closeInstructions);

const airlineStatusBtn = document.getElementById("airlineStatusBtn");
if (airlineStatusBtn) airlineStatusBtn.addEventListener("click", openAirlineStatus);

const closeAirlineStatusBtn = document.getElementById("closeAirlineStatusBtn");
if (closeAirlineStatusBtn) closeAirlineStatusBtn.addEventListener("click", closeAirlineStatus);

const briefingModal = document.getElementById("briefingModal");
if (briefingModal) {
  briefingModal.addEventListener("click", (e) => {
    if (e.target.id === "briefingModal") closeBriefing();
  });
}

const instructionsModal = document.getElementById("instructionsModal");
if (instructionsModal) {
  instructionsModal.addEventListener("click", (e) => {
    if (e.target.id === "instructionsModal") closeInstructions();
  });
}

const airlineStatusModal = document.getElementById("airlineStatusModal");
if (airlineStatusModal) {
  airlineStatusModal.addEventListener("click", (e) => {
    if (e.target.id === "airlineStatusModal") closeAirlineStatus();
  });
}

load();
