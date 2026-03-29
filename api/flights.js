import { createHash } from "node:crypto";

export default async function handler(req, res) {
  const apiKey = "hn1UO6XF9P3DrZPwMPi5ABgWXEV3wrvF";
  const base = "https://aeroapi.flightaware.com/aeroapi";
  const DEFAULT_CACHE_SECONDS = 3600;
  const BROWSER_CACHE_SECONDS = 0;
  const KEY_HUBS = ["DOH", "DXB", "DWC", "AUH", "IST", "SAW", "JED", "RUH", "LHR", "LGW", "MCT", "BAH", "KWI", "BKK"];
  const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || "ops";
  const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "";
  const MODE_CONFIG = {
    normal: {
      key: "normal",
      label: "Normal mode",
      cacheSeconds: 8 * 60 * 60,
      pageLimits: { OPIS: 6, OPLA: 3, OPKC: 3 },
      note: "One shared Normal dataset for all users. Everyone reads the same stored dataset until the 8 hour window expires, then the first request refreshes it and saves history."
    },
    crisis: {
      key: "crisis",
      label: "Crisis mode",
      cacheSeconds: 60 * 60,
      pageLimits: { OPIS: 12, OPLA: 6, OPKC: 6 },
      note: "1 hour live cache with materially deeper pages for crisis monitoring."
    }
  };

  const AIRPORTS = {
    OPIS: { code: "ISB", name: "Islamabad" },
    OPLA: { code: "LHE", name: "Lahore" },
    OPKC: { code: "KHI", name: "Karachi" }
  };

  const airlineMap = {
    PIA: "Pakistan International Airlines", PK: "Pakistan International Airlines",
    ABQ: "Airblue", PA: "Airblue",
    SEP: "SereneAir", ER: "SereneAir",
    SIF: "AirSial", PF: "AirSial",
    FJL: "Fly Jinnah", "9P": "Fly Jinnah",
    UAE: "Emirates", EK: "Emirates",
    QTR: "Qatar Airways", QR: "Qatar Airways",
    ETD: "Etihad Airways", EY: "Etihad Airways",
    BAW: "British Airways", BA: "British Airways",
    THY: "Turkish Airlines", TK: "Turkish Airlines",
    SVA: "Saudia", SV: "Saudia",
    OMA: "Oman Air", WY: "Oman Air",
    FDB: "flydubai", FZ: "flydubai",
    THA: "Thai Airways", TG: "Thai Airways",
    ABY: "Air Arabia", G9: "Air Arabia",
    JZR: "Jazeera Airways", J9: "Jazeera Airways",
    CAL: "China Airlines", CI: "China Airlines",
    CCA: "Air China", CA: "Air China",
    KAC: "Kuwait Airways", KU: "Kuwait Airways",
    GFA: "Gulf Air", GF: "Gulf Air",
    ALK: "SriLankan Airlines", UL: "SriLankan Airlines"
  };

  const majorAirlinePatterns = [
    "pakistan international", "pia", "airblue", "serene", "airsial", "air sial", "fly jinnah",
    "emirates", "qatar", "etihad", "british airways", "turkish", "saudia", "oman air",
    "flydubai", "thai", "thai airways", "air arabia", "jazeera", "jazeera airways", "china airlines",
    "air china", "kuwait airways", "gulf air", "srilankan airlines"
  ];

  const majorAirlineCodes = new Set([
    "PK", "PIA", "PA", "ABQ", "ER", "SEP", "PF", "SIF", "9P", "FJL",
    "EK", "UAE", "QR", "QTR", "EY", "ETD", "BA", "BAW", "TK", "THY",
    "SV", "SVA", "WY", "OMA", "FZ", "FDB", "TG", "THA", "G9", "ABY",
    "J9", "JZR", "CI", "CAL", "CA", "CCA", "KU", "KAC", "GF", "GFA",
    "UL", "ALK"
  ]);

  function setCacheHeaders(cacheSeconds = DEFAULT_CACHE_SECONDS) {
    res.setHeader("Cache-Control", `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${cacheSeconds}, must-revalidate`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${cacheSeconds}`);
    res.setHeader("Vercel-CDN-Cache-Control", `public, max-age=${cacheSeconds}`);
  }

  function sendJson(statusCode, payload, cacheSeconds = DEFAULT_CACHE_SECONDS) {
    setCacheHeaders(cacheSeconds);
    if (payload && payload.generatedAt) res.setHeader("X-Data-Generated-At", payload.generatedAt);
    return res.status(statusCode).json(payload);
  }


  function sendNoStoreJson(statusCode, payload) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    if (payload && payload.generatedAt) res.setHeader("X-Data-Generated-At", payload.generatedAt);
    return res.status(statusCode).json(payload);
  }

  function getExpectedAuthToken() {
    if (!DASHBOARD_PASSWORD) return "";
    return createHash("sha256").update(`${DASHBOARD_USERNAME}:${DASHBOARD_PASSWORD}`).digest("hex");
  }

  function isAuthorisedRequest() {
    if (!DASHBOARD_PASSWORD) {
      return { ok: false, status: 500, message: "Dashboard login is not configured. Add DASHBOARD_PASSWORD in Vercel environment variables." };
    }
    const provided = String(req.query?.auth || "").trim();
    if (!provided) {
      return { ok: false, status: 401, message: "Login required." };
    }
    const expected = getExpectedAuthToken();
    if (provided !== expected) {
      return { ok: false, status: 401, message: "Incorrect username or password." };
    }
    return { ok: true, username: DASHBOARD_USERNAME };
  }


  function getSharedPayloadPath(scopeKey, modeKey) {
    return `latest/flight-tracker/${scopeKey}/${modeKey}.json`;
  }

  function getRefreshLockPath(scopeKey, modeKey) {
    return `latest/flight-tracker/${scopeKey}/${modeKey}-lock.json`;
  }

  function getPayloadAgeSeconds(payload) {
    const generatedAt = payload?.generatedAt ? new Date(payload.generatedAt).getTime() : null;
    if (!generatedAt || Number.isNaN(generatedAt)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((Date.now() - generatedAt) / 1000));
  }

  async function getBlobSdk() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { available: false, sdk: null, reason: "Shared Normal mode needs BLOB_READ_WRITE_TOKEN." };
    }
    try {
    const mode = resolveMode(req.query?.mode);
    const scope = mode.key === "normal"
      ? resolveScope("ALL", mode)
      : resolveScope(req.query?.airport || req.query?.scope || "ALL", mode);

    if (mode.key === "normal") {
      const shared = await loadSharedNormalPayload(scope.key, mode.key);
      const latestPayload = shared.payload;
      const latestAgeSeconds = latestPayload ? getPayloadAgeSeconds(latestPayload) : Number.POSITIVE_INFINITY;
      const latestFresh = latestPayload && latestAgeSeconds < mode.cacheSeconds;

      if (latestFresh) {
        const responsePayload = {
          ...latestPayload,
          cacheSeconds: mode.cacheSeconds,
          authUser: auth.username,
          deliveryMeta: {
            key: "shared-hit",
            label: "Shared Normal dataset",
            note: `All users are reading the same stored Normal dataset until the 8 hour refresh window expires. Current dataset age: ${Math.floor(latestAgeSeconds / 60)} minute${Math.floor(latestAgeSeconds / 60) === 1 ? "" : "s"}.`
          }
        };
        return sendNoStoreJson(200, responsePayload);
      }

      if (shared.available && shared.sdk && latestPayload) {
        const existingLock = await readRefreshLock(shared.sdk, scope.key, mode.key);
        const lockAgeSeconds = existingLock?.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(existingLock.startedAt).getTime()) / 1000)) : Number.POSITIVE_INFINITY;
        if (existingLock && lockAgeSeconds < 120) {
          const responsePayload = {
            ...latestPayload,
            authUser: auth.username,
            deliveryMeta: {
              key: "shared-stale-lock",
              label: "Shared Normal dataset while refresh is in progress",
              note: "A refresh is already underway for the shared Normal dataset. Showing the last saved shared dataset for now."
            },
            warnings: ["Refresh in progress. Showing the last saved shared Normal dataset."]
          };
          return sendNoStoreJson(200, responsePayload);
        }
      }

      if (shared.available && shared.sdk) {
        await writeRefreshLock(shared.sdk, scope.key, mode.key, { startedAt: new Date().toISOString() });
      }

      try {
        const livePayload = await buildLivePayload(scope, mode, {
          key: "shared-refresh",
          label: "Shared Normal dataset refreshed now",
          note: "This request refreshed the shared Normal dataset for all users."
        });
        if (shared.available && shared.sdk) {
          await saveSharedNormalPayload(shared.sdk, scope.key, mode.key, livePayload);
          await writeRefreshLock(shared.sdk, scope.key, mode.key, { startedAt: new Date(0).toISOString(), completedAt: new Date().toISOString() });
        }
        return sendNoStoreJson(200, { ...livePayload, authUser: auth.username });
      } catch (error) {
        if (shared.available && shared.sdk) {
          await writeRefreshLock(shared.sdk, scope.key, mode.key, { startedAt: new Date(0).toISOString(), failedAt: new Date().toISOString(), message: error?.message || "Refresh failed." });
        }
        if (latestPayload) {
          return sendNoStoreJson(200, {
            ...latestPayload,
            authUser: auth.username,
            deliveryMeta: {
              key: "shared-stale-fallback",
              label: "Last saved shared Normal dataset",
              note: "The shared Normal dataset could not be refreshed, so the last saved shared dataset is being shown instead."
            },
            warnings: [...(Array.isArray(latestPayload.warnings) ? latestPayload.warnings : []), error?.message || "Normal refresh failed. Showing the last saved shared dataset."]
          });
        }
        throw error;
      }
    }

    const livePayload = await buildLivePayload(scope, mode, {
      key: "live-crisis",
      label: "Live Crisis response",
      note: "Crisis mode is using a live FlightAware response with a shorter cache and deeper page pull."
    });
    return sendJson(200, { ...livePayload, authUser: auth.username }, mode.cacheSeconds);
  } catch (error) {
    const generatedAt = new Date().toISOString();
    const mode = resolveMode(req.query?.mode);
    return sendNoStoreJson(500, {
      generatedAt,
      cacheSeconds: mode.cacheSeconds,
      modeMeta: { key: mode.key, label: mode.label, note: mode.note, pageDepthByAirport: mode.pageDepthByAirport, dataSource: mode.key === "normal" ? "shared" : "live" },
      scope: "ISB",
      scopeLabel: "Islamabad default",
      snapshotMeta: { enabled: false, saved: false, note: "Snapshot saving unavailable because the flight refresh failed.", recentCount: null, dailyPathnames: [] },
      coverageMeta: { departures: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, arrivals: { truncatedPossible: false, returnedCount: 0, note: "Coverage unavailable because the flight refresh failed." }, byAirport: {} },
      historyMeta: { enabled: false, recentSnapshots: 0, serviceDays: 0, note: "Rolling baseline unavailable because the flight refresh failed.", rollingByRouteWeekday: {}, timelineMeta: { airlineDaily: [], airlineWeekly: [] } },
      filtersMeta: { airports: ["ISB", "LHE", "KHI", "ALL"], airlines: [], statuses: [], directions: [] },
      flights: [],
      warnings: [error.message || "Failed to load FlightAware data."],
      deliveryMeta: { key: "error", label: mode.key === "normal" ? "Shared Normal dataset unavailable" : "Live refresh failed", note: error.message || "Failed to load FlightAware data." }
    });
  }
}

