let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "ALL",
  airline: "All",
  status: "All",
  includeMinor: false,
  timezoneMode: "PKT",
  cacheSeconds: 300,
  cacheRemaining: 300
};

const AIRLINE_STATUS_LINKS = [
  { name: "PIA", url: "https://www.piac.com.pk/", note: "Official airline site" },
  { name: "Airblue", url: "https://www.airblue.com/flightinfo/status", note: "Official flight status" },
  { name: "SereneAir", url: "https://www.sereneair.com/status", note: "Official flight status" },
  { name: "Fly Jinnah", url: "https://www.flyjinnah.com/en/Manage/Flight-Status/Check-Flight-Status", note: "Official flight status" },
  { name: "Emirates", url: "https://www.emirates.com/english/help/flight-status/", note: "Official flight status" },
  { name: "Qatar Airways", url: "https://www.qatarairways.com/en/flight-status.html", note: "Official flight status" },
  { name: "Etihad Airways", url: "https://www.etihad.com/en/manage/flight-status", note: "Official flight status" },
  { name: "British Airways", url: "https://www.britishairways.com/travel/flightstatus/public/en_gb/search/FindFlightStatusPublic", note: "Official flight status" },
  { name: "Turkish Airlines", url: "https://www.turkishairlines.com/en-int/flights/flight-status/", note: "Official flight status" },
  { name: "Saudia", url: "https://www.saudia.com/pages/travel-information/flight-status", note: "Official flight status" },
  { name: "Oman Air", url: "https://www.omanair.com/gbl/en/flight-status", note: "Official flight status" },
  { name: "flydubai", url: "https://www.flydubai.com/en/plan/timetable-and-status", note: "Official flight status" }
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

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
}

function updateCacheUi() {
  const total = Math.max(1, state.cacheSeconds || 300);
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
  state.cacheRemaining = state.cacheSeconds || 300;
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

function buildInstructions() {
  return `
    <p><strong>What this dashboard does</strong></p>
    <p>This dashboard provides a browser based operational flight board for Pakistan using the current flight API source. It is intended to support situational awareness during disruption rather than act as an official airport display.</p>

    <p><strong>Current scope</strong></p>
    <ul>
      <li>Airports covered are Islamabad, Lahore and Karachi.</li>
      <li>Day options are Today, Tomorrow and All.</li>
      <li>Times can be shown in Pakistan time or UK time using the toggle at the top.</li>
      <li>The cache timer shows when the dashboard will refresh again.</li>
      <li>The board now refreshes every 5 minutes by default.</li>
    </ul>

    <p><strong>How statuses are derived</strong></p>
    <ul>
      <li><strong>Cancelled</strong> when cancellation evidence is present.</li>
      <li><strong>Diverted</strong> when diversion evidence is present.</li>
      <li><strong>Arrived</strong> when actual arrival exists.</li>
      <li><strong>In Air</strong> when actual departure exists but actual arrival does not.</li>
      <li><strong>Departed</strong> where departure evidence is clear.</li>
      <li><strong>Delayed</strong> when estimated or actual time is materially later than scheduled.</li>
      <li><strong>On Time</strong> when scheduled and estimated times align closely.</li>
      <li><strong>Scheduled</strong> where evidence is not strong enough for a firmer status.</li>
    </ul>

    <p><strong>Assumptions</strong></p>
    <ul>
      <li>Departure and arrival cells show the best available operational time using actual first, then estimated, then scheduled.</li>
      <li>Major carrier mode uses airline name, operator code and flight prefix matching.</li>
      <li>The board is conservative and avoids guessing where evidence is weak.</li>
    </ul>

    <p><strong>Limitations</strong></p>
    <ul>
      <li>This is not an official airport or airline display.</li>
      <li>Coverage and richness depend on the underlying source data.</li>
      <li>The board count is the dashboard window count, not a complete all movement aviation picture.</li>
      <li>Use the Airline Status links for operator level updates during major disruption.</li>
    </ul>

    <p><strong>How to use it</strong></p>
    <ul>
      <li>Use filters to narrow the board by day, direction, airport, airline and status.</li>
      <li>Use Crisis for a disruption focused readout of the currently filtered board.</li>
      <li>Use Airline Status to open official airline status pages.</li>
      <li>Use Export to download the current filtered view.</li>
    </ul>
  `;
}

function buildCrisisReadout() {
  const rows = applyFilters((state.raw && state.raw.flights) || []);
  const cancelled = rows.filter((r) => r.status === "Cancelled");
  const delayed = rows.filter((r) => r.status === "Delayed");
  const diverted = rows.filter((r) => r.status === "Diverted");
  const inAir = rows.filter((r) => r.status === "In Air");

  const severeDelays = delayed
    .filter((r) => (r.delayMinutes || 0) >= 120)
    .sort((a, b) => (b.delayMinutes || 0) - (a.delayMinutes || 0))
    .slice(0, 6);

  const keyHubs = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW"];
  const outboundHubs = rows
    .filter((r) => r.direction === "Departure")
    .filter((r) => keyHubs.some((hub) => String(r.destination || "").includes(hub)))
    .sort((a, b) => new Date(bestDepTime(a) || 0).getTime() - new Date(bestDepTime(b) || 0).getTime())
    .slice(0, 8);

  return `
    <p><strong>Current filtered board:</strong> ${rows.length} flights.</p>
    <p><strong>Disruption picture:</strong> ${cancelled.length} cancelled, ${diverted.length} diverted, ${delayed.length} delayed, ${inAir.length} in air.</p>

    <p><strong>Severe delays over 120 minutes:</strong></p>
    <ul>
      ${
        severeDelays.length
          ? severeDelays.map((r) => `
              <li>${r.number} ${r.airline} departing from ${r.origin} to ${r.destination} delayed ${r.delayMinutes || 0} minutes</li>
            `).join("")
          : "<li>No current severe delays in filtered view.</li>"
      }
    </ul>

    <p><strong>Next outbound options to major hubs:</strong></p>
    <ul>
      ${
        outboundHubs.length
          ? outboundHubs.map((r) => `
              <li>${r.number} ${r.airline} departing from ${r.origin} to ${r.destination} at ${displayTime(bestDepTime(r))} showing ${r.status}</li>
            `).join("")
          : "<li>No major hub departures currently shown in filtered view.</li>"
      }
    </ul>

    <p><strong>Use:</strong> This readout is for operational awareness during travel disruption and should be read alongside official airline status pages and local decision making.</p>
  `;
}

function buildAirlineStatus() {
  return `
    <p><strong>Use these official airline pages alongside the board during disruption.</strong></p>
    <div class="linkListCompact">
      ${AIRLINE_STATUS_LINKS.map(link => `
        <a class="statusLinkCardCompact" href="${link.url}" target="_blank" rel="noopener noreferrer">
          <span class="statusLinkNameCompact">${link.name}</span>
          <span class="statusLinkNoteCompact">${link.note}</span>
        </a>
      `).join("")}
    </div>
  `;
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

function openCrisis() {
  const modal = document.getElementById("crisisModal");
  const body = document.getElementById("crisisBody");
  if (!modal || !body) return;
  body.innerHTML = buildCrisisReadout();
  modal.classList.remove("hidden");
}

function closeCrisis() {
  const modal = document.getElementById("crisisModal");
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
  state.cacheSeconds = Number(data.cacheSeconds || 300);

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

const instructionsBtn = document.getElementById("instructionsBtn");
if (instructionsBtn) instructionsBtn.addEventListener("click", openInstructions);

const closeInstructionsBtn = document.getElementById("closeInstructionsBtn");
if (closeInstructionsBtn) closeInstructionsBtn.addEventListener("click", closeInstructions);

const crisisBtn = document.getElementById("crisisBtn");
if (crisisBtn) crisisBtn.addEventListener("click", openCrisis);

const closeCrisisBtn = document.getElementById("closeCrisisBtn");
if (closeCrisisBtn) closeCrisisBtn.addEventListener("click", closeCrisis);

const airlineStatusBtn = document.getElementById("airlineStatusBtn");
if (airlineStatusBtn) airlineStatusBtn.addEventListener("click", openAirlineStatus);

const closeAirlineStatusBtn = document.getElementById("closeAirlineStatusBtn");
if (closeAirlineStatusBtn) closeAirlineStatusBtn.addEventListener("click", closeAirlineStatus);

const instructionsModal = document.getElementById("instructionsModal");
if (instructionsModal) {
  instructionsModal.addEventListener("click", (e) => {
    if (e.target.id === "instructionsModal") closeInstructions();
  });
}

const crisisModal = document.getElementById("crisisModal");
if (crisisModal) {
  crisisModal.addEventListener("click", (e) => {
    if (e.target.id === "crisisModal") closeCrisis();
  });
}

const airlineStatusModal = document.getElementById("airlineStatusModal");
if (airlineStatusModal) {
  airlineStatusModal.addEventListener("click", (e) => {
    if (e.target.id === "airlineStatusModal") closeAirlineStatus();
  });
}

load();
