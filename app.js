const DEFAULT_CACHE_SECONDS = 300;

let state = {
  raw: null,
  day: "today",
  direction: "Both",
  airport: "All",
  airline: "All",
  status: "All",
  timezoneMode: "PKT",
  cacheSeconds: DEFAULT_CACHE_SECONDS,
  cacheRemaining: DEFAULT_CACHE_SECONDS,
  refreshPaused: false,
  activeTab: "flights"
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

const HUB_NAMES = {
  DOH: "Doha",
  DXB: "Dubai",
  DWC: "Dubai World Central",
  AUH: "Abu Dhabi",
  SHJ: "Sharjah",
  IST: "Istanbul",
  SAW: "Sabiha Gokcen",
  JED: "Jeddah",
  RUH: "Riyadh",
  BAH: "Bahrain",
  KWI: "Kuwait",
  BKK: "Bangkok",
  MCT: "Muscat",
  MED: "Madinah",
  KUL: "Kuala Lumpur"
};

const PAKISTAN_AIRPORT_NAMES = {
  ISB: "Islamabad",
  LHE: "Lahore",
  KHI: "Karachi"
};

function getTimeZoneInfo() {
  if (state.timezoneMode === "UK") {
    return {
      label: "UK time",
      zone: "Europe/London"
    };
  }

  return {
    label: "Pakistan time",
    zone: "Asia/Karachi"
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

function toMillis(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel")) return "status-bad";
  if (s.includes("delay")) return "status-warn";
  if (s.includes("arrived") || s.includes("departed") || s.includes("landed") || s.includes("on time")) return "status-good";
  return "status-neutral";
}

function kpiPercent(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function renderKpis(summary) {
  const total = summary.totalFlights || 0;
  const cancelled = summary.cancelled || 0;
  const cancelledPct = kpiPercent(cancelled, total);

  const el = document.getElementById("kpis");
  el.innerHTML = `
    <div class="kpi">
      <div class="kpiLabel">Total Flights</div>
      <div class="kpiValue">${total}</div>
    </div>
    <div class="kpi ${cancelled > 0 ? "kpiDanger" : ""}">
      <div class="kpiLabel">Cancelled</div>
      <div class="kpiValue">
        ${cancelled}
        <span class="kpiSubValue">${cancelledPct}</span>
      </div>
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
      <div class="kpiLabel">Pre dep Delays</div>
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
  return row.actualDep || row.estimatedDep || row.scheduledDep || null;
}

function bestArrTime(row) {
  return row.actualArr || row.estimatedArr || row.scheduledArr || null;
}

function displayTime(value) {
  if (!value) return "—";
  return zonedDateParts(value).time;
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

  return rows.filter((row) => {
    const primary = row.direction === "Departure" ? row.scheduledDep : row.scheduledArr;
    if (!primary) return false;
    const date = zonedDateParts(primary).date;

    if (state.day === "today") return date === today;
    if (state.day === "tomorrow") return date === tomorrow;
    return true;
  });
}

function applyFilters(rows) {
  let out = [...rows];

  out = todayTomorrowFilter(out);

  if (state.direction !== "Both") {
    out = out.filter((r) => r.direction === state.direction);
  }

  if (state.airport !== "All") {
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
    tbody.innerHTML = `<tr><td colspan="11">No flights match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td class="flightCell">${row.number}</td>
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

function renderAirlines(rows) {
  const tbody = document.getElementById("airlineRows");

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">No airline data for the current filters.</td></tr>`;
    return;
  }

  const map = new Map();

  rows.forEach((row) => {
    const key = row.airline || "Unknown";
    if (!map.has(key)) {
      map.set(key, {
        airline: key,
        total: 0,
        onTime: 0,
        delayed: 0,
        cancelled: 0,
        diverted: 0,
        delayTotal: 0,
        delayCount: 0
      });
    }

    const item = map.get(key);
    item.total += 1;

    if (row.status === "Cancelled") item.cancelled += 1;
    else if (row.diverted || row.status === "Diverted") item.diverted += 1;
    else if ((row.delayMinutes || 0) > 0 || row.status === "Delayed") item.delayed += 1;
    else item.onTime += 1;

    if ((row.delayMinutes || 0) > 0) {
      item.delayTotal += row.delayMinutes;
      item.delayCount += 1;
    }
  });

  const list = [...map.values()].sort((a, b) => b.total - a.total);

  tbody.innerHTML = list.map((item) => `
    <tr>
      <td class="flightCell">${item.airline}</td>
      <td>${item.total}</td>
      <td class="goodText">${item.onTime}</td>
      <td class="warnText">${item.delayed}</td>
      <td class="badText">${item.cancelled}</td>
      <td>${item.diverted}</td>
      <td>${item.delayCount ? `${Math.round(item.delayTotal / item.delayCount)}m` : "—"}</td>
    </tr>
  `).join("");
}

function aggregateAirportCards(rows) {
  const pakistanMap = new Map();
  const hubMap = new Map();

  rows.forEach((row) => {
    const pkCode = row.airportCode || "—";
    if (!pakistanMap.has(pkCode)) {
      pakistanMap.set(pkCode, {
        code: pkCode,
        name: PAKISTAN_AIRPORT_NAMES[pkCode] || pkCode,
        arrivals: 0,
        departures: 0,
        disrupted: 0
      });
    }
    const pk = pakistanMap.get(pkCode);
    if (row.direction === "Arrival") pk.arrivals += 1;
    if (row.direction === "Departure") pk.departures += 1;
    if (row.status === "Cancelled" || row.status === "Diverted" || (row.delayMinutes || 0) >= 60) pk.disrupted += 1;

    const hubCode = row.direction === "Departure" ? row.destination : row.origin;
    if (!hubCode || hubCode === "—") return;

    if (!hubMap.has(hubCode)) {
      hubMap.set(hubCode, {
        code: hubCode,
        name: HUB_NAMES[hubCode] || hubCode,
        arrivals: 0,
        departures: 0,
        disrupted: 0
      });
    }

    const hub = hubMap.get(hubCode);
    if (row.direction === "Departure") hub.departures += 1;
    if (row.direction === "Arrival") hub.arrivals += 1;
    if (row.status === "Cancelled" || row.status === "Diverted" || (row.delayMinutes || 0) >= 60) hub.disrupted += 1;
  });

  const pakistanCards = ["ISB", "LHE", "KHI"].map((code) => pakistanMap.get(code) || {
    code,
    name: PAKISTAN_AIRPORT_NAMES[code] || code,
    arrivals: 0,
    departures: 0,
    disrupted: 0
  });

  const hubCards = [...hubMap.values()]
    .filter((x) => !["ISB", "LHE", "KHI"].includes(x.code))
    .sort((a, b) => {
      const bScore = b.disrupted * 100 + b.arrivals + b.departures;
      const aScore = a.disrupted * 100 + a.arrivals + a.departures;
      return bScore - aScore;
    })
    .slice(0, 12);

  return { pakistanCards, hubCards };
}

function renderAirportCards(rows) {
  const pkEl = document.getElementById("pakistanAirportCards");
  const hubEl = document.getElementById("hubAirportCards");
  const { pakistanCards, hubCards } = aggregateAirportCards(rows);

  pkEl.innerHTML = pakistanCards.map((card) => `
    <div class="airportCard ${card.disrupted > 0 ? "airportCardAlert" : ""}">
      <div class="airportCodeRow">
        <div class="airportCode">${card.code}</div>
        ${card.disrupted > 0 ? `<div class="airportAlertDot">• ${card.disrupted}</div>` : ""}
      </div>
      <div class="airportName">${card.name}</div>
      <div class="airportStats">
        <div>Arr <strong>${card.arrivals}</strong></div>
        <div>Dep <strong>${card.departures}</strong></div>
      </div>
    </div>
  `).join("");

  if (!hubCards.length) {
    hubEl.innerHTML = `<div class="emptyBlock">No hub data in the current filters.</div>`;
    return;
  }

  hubEl.innerHTML = hubCards.map((card) => `
    <div class="airportCard ${card.disrupted > 0 ? "airportCardAlert" : ""}">
      <div class="airportCodeRow">
        <div class="airportCode">${card.code}</div>
        ${card.disrupted > 0 ? `<div class="airportAlertDot">• ${card.disrupted}</div>` : ""}
      </div>
      <div class="airportName">${card.name}</div>
      <div class="airportStats">
        <div>Arr <strong>${card.arrivals}</strong></div>
        <div>Dep <strong>${card.departures}</strong></div>
      </div>
    </div>
  `).join("");
}

function disruptionPriority(row) {
  if (row.status === "Cancelled") return 4;
  if (row.status === "Diverted") return 3;
  if ((row.delayMinutes || 0) >= 120) return 2;
  if ((row.delayMinutes || 0) >= 60) return 1;
  return 0;
}

function disruptionLabel(row) {
  if (row.status === "Cancelled") return "Cancelled";
  if (row.status === "Diverted") return "Diverted";
  if ((row.delayMinutes || 0) >= 60) return `Delayed ${row.delayMinutes}m`;
  return row.status || "Operational";
}

function renderDisruptionFeed(rows) {
  const el = document.getElementById("disruptionFeed");
  const disruptions = [...rows]
    .filter((row) => disruptionPriority(row) > 0)
    .sort((a, b) => {
      const priority = disruptionPriority(b) - disruptionPriority(a);
      if (priority !== 0) return priority;
      return toMillis(bestDepTime(a) || bestArrTime(a)) - toMillis(bestDepTime(b) || bestArrTime(b));
    })
    .slice(0, 6);

  if (!disruptions.length) {
    el.innerHTML = `<div class="feedEmpty">No major disruptions in the current filtered view.</div>`;
    return;
  }

  el.innerHTML = disruptions.map((row) => {
    const timeValue = displayTime(bestDepTime(row) || bestArrTime(row));
    const route = `${row.origin || "—"} → ${row.destination || "—"}`;
    return `
      <div class="feedRow">
        <div class="feedTime">${timeValue}</div>
        <div class="feedFlight">${row.number}</div>
        <div class="feedRoute">${route}</div>
        <div class="feedStatus ${row.status === "Cancelled" ? "badText" : "warnText"}">• ${disruptionLabel(row)}</div>
      </div>
    `;
  }).join("");
}

function setActiveTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tabPanel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`);
  });
}

function refreshView() {
  if (!state.raw) return;
  const rows = applyFilters(state.raw.flights || []);
  renderRows(rows);
  renderAirlines(rows);
  renderAirportCards(rows);
  renderDisruptionFeed(rows);
}

function updateCacheUi() {
  const total = Math.max(1, state.cacheSeconds || DEFAULT_CACHE_SECONDS);
  const remaining = Math.max(0, state.cacheRemaining);
  const pct = (remaining / total) * 100;

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  const countdown = document.getElementById("cacheCountdown");
  const fill = document.getElementById("cacheBarFill");
  const pauseBtn = document.getElementById("pauseRefreshBtn");

  if (countdown) countdown.textContent = `${minutes}:${seconds}`;
  if (fill) fill.style.width = `${pct}%`;
  if (pauseBtn) pauseBtn.textContent = state.refreshPaused ? "▶" : "❚❚";
}

function startCacheTimer() {
  state.cacheRemaining = state.cacheSeconds || DEFAULT_CACHE_SECONDS;
  updateCacheUi();

  if (window.cacheTimer) clearInterval(window.cacheTimer);

  window.cacheTimer = setInterval(() => {
    if (state.refreshPaused) {
      updateCacheUi();
      return;
    }

    state.cacheRemaining -= 1;

    if (state.cacheRemaining <= 0) {
      state.cacheRemaining = 0;
      updateCacheUi();
      load(true);
      return;
    }

    updateCacheUi();
  }, 1000);
}

async function load(isBackground = false) {
  const res = await fetch("/api/flights", { cache: "no-store" });
  const data = await res.json();
  state.raw = data;
  state.cacheSeconds = Number(data.cacheSeconds || DEFAULT_CACHE_SECONDS);
  state.cacheRemaining = state.cacheSeconds;

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

  document.getElementById("cacheInfo").textContent = `Cache updated ${updated} PKT`;

  refreshView();

  if (!isBackground) {
    startCacheTimer();
  } else {
    updateCacheUi();
  }
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

function buildInstructions() {
  return `
    <p><strong>What changed</strong></p>
    <ul>
      <li>Refresh now and pause controls have been added to the cache area.</li>
      <li>Cancelled KPI now shows a percentage and highlights red when cancellations exist.</li>
      <li>A disruption feed has been added above the filters.</li>
      <li>Flights, Airlines and Airports tabs are now available.</li>
    </ul>

    <p><strong>Airports tab</strong></p>
    <ul>
      <li>Pakistan airport cards show the airport being tracked in the API response.</li>
      <li>Hub cards are built from origin and destination data in the current filtered rows.</li>
    </ul>

    <p><strong>Important note</strong></p>
    <p>This front end is now closer to the UAE style board. The current uploaded backend in this chat is still the simpler testing version, so richer airport and airline views depend on swapping back to your fuller multi airport API build.</p>
  `;
}

function buildCrisisReadout() {
  const rows = applyFilters((state.raw && state.raw.flights) || []);
  const cancelled = rows.filter((r) => r.status === "Cancelled");
  const delayed = rows.filter((r) => (r.delayMinutes || 0) >= 60 || r.status === "Delayed");
  const diverted = rows.filter((r) => r.status === "Diverted" || r.diverted);
  const severe = delayed.sort((a, b) => (b.delayMinutes || 0) - (a.delayMinutes || 0)).slice(0, 8);

  return `
    <p><strong>Current filtered board:</strong> ${rows.length} flights.</p>
    <p><strong>Disruption picture:</strong> ${cancelled.length} cancelled, ${diverted.length} diverted, ${delayed.length} delayed over concern threshold.</p>

    <p><strong>Most severe rows:</strong></p>
    <ul>
      ${
        severe.length
          ? severe.map((r) => `<li>${r.number} ${r.airline} ${r.origin} → ${r.destination} ${disruptionLabel(r)}</li>`).join("")
          : "<li>No severe disruption rows in the current view.</li>"
      }
    </ul>
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

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("seg")) {
    document.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.day = e.target.dataset.day;
    refreshView();
  }

  if (e.target.classList.contains("timeBtn")) {
    document.querySelectorAll(".timeBtn").forEach((x) => x.classList.remove("active"));
    e.target.classList.add("active");
    state.timezoneMode = e.target.dataset.tz;
    refreshView();
  }

  if (e.target.classList.contains("tab")) {
    setActiveTab(e.target.dataset.tab);
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

document.getElementById("refreshNowBtn").addEventListener("click", () => {
  load(true);
});

document.getElementById("pauseRefreshBtn").addEventListener("click", () => {
  state.refreshPaused = !state.refreshPaused;
  updateCacheUi();
});

document.getElementById("exportBtn").addEventListener("click", exportRows);

document.getElementById("resetFilters").addEventListener("click", () => {
  state.day = "today";
  state.direction = "Both";
  state.airport = "All";
  state.airline = "All";
  state.status = "All";

  document.querySelectorAll(".seg").forEach((x) => {
    x.classList.toggle("active", x.dataset.day === "today");
  });

  document.getElementById("directionFilter").value = "Both";
  document.getElementById("airportFilter").value = "All";
  document.getElementById("airlineFilter").value = "All";
  document.getElementById("statusFilter").value = "All";

  refreshView();
});

document.getElementById("instructionsBtn").addEventListener("click", openInstructions);
document.getElementById("closeInstructionsBtn").addEventListener("click", closeInstructions);
document.getElementById("crisisBtn").addEventListener("click", openCrisis);
document.getElementById("closeCrisisBtn").addEventListener("click", closeCrisis);
document.getElementById("airlineStatusBtn").addEventListener("click", openAirlineStatus);
document.getElementById("closeAirlineStatusBtn").addEventListener("click", closeAirlineStatus);

document.getElementById("instructionsModal").addEventListener("click", (e) => {
  if (e.target.id === "instructionsModal") closeInstructions();
});

document.getElementById("crisisModal").addEventListener("click", (e) => {
  if (e.target.id === "crisisModal") closeCrisis();
});

document.getElementById("airlineStatusModal").addEventListener("click", (e) => {
  if (e.target.id === "airlineStatusModal") closeAirlineStatus();
});

load().then(startCacheTimer);
