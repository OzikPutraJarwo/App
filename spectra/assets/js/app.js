// ── Toast Notification ──────────────────────────────────────
function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const iconMap = {
    success: "check_circle",
    error: "error",
    warning: "warning",
    info: "info",
  };
  const titleMap = {
    success: "Success",
    error: "Error",
    warning: "Warning",
    info: "Info",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon"><span class="material-symbols-rounded">${iconMap[type] || "info"}</span></span>
    <div class="toast-body">
      <div class="toast-title">${titleMap[type] || "Info"}</div>
      <span class="toast-msg">${message}</span>
    </div>
    <button class="toast-close" aria-label="Close"><span class="material-symbols-rounded">close</span></button>
  `;
  container.appendChild(toast);

  // Close button
  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.classList.remove("toast-show");
    toast.addEventListener("transitionend", () => toast.remove());
    setTimeout(() => toast.remove(), 400);
  });

  // trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("toast-show"));

  setTimeout(() => {
    toast.classList.remove("toast-show");
    toast.addEventListener("transitionend", () => toast.remove());
    // fallback removal
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/Privo/Advanta-v3/sw.js")
      .then(reg => console.log("SW registered", reg))
      .catch(err => console.log("SW failed", err));
  });

  // Listen for messages from SW (e.g. notification click)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.action === "open-reminders") {
      window.focus();
      if (typeof switchPage === "function") switchPage("reminder");
    }
  });
}

// Loading & Caching Helpers
const CACHE_VERSION = 1;
const PERSISTENT_DB_NAME = "advanta_persistent_cache";
const PERSISTENT_DB_VERSION = 1;
const PERSISTENT_STORE_CACHE = "cache";

let _persistentDbPromise = null;

function openPersistentCacheDb() {
  if (_persistentDbPromise) return _persistentDbPromise;
  _persistentDbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const req = indexedDB.open(PERSISTENT_DB_NAME, PERSISTENT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PERSISTENT_STORE_CACHE)) {
        db.createObjectStore(PERSISTENT_STORE_CACHE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open persistent DB"));
  });

  return _persistentDbPromise;
}

async function loadPersistentCache(name) {
  try {
    const db = await openPersistentCacheDb();
    const key = getCacheKey(name);

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PERSISTENT_STORE_CACHE, "readonly");
      const store = tx.objectStore(PERSISTENT_STORE_CACHE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (!row || row.version !== CACHE_VERSION) {
          resolve(null);
          return;
        }
        resolve(row.data || null);
      };
      req.onerror = () => reject(req.error || new Error("Failed reading persistent cache"));
    });
  } catch (error) {
    console.warn("Failed to load persistent cache:", name, error);
    return null;
  }
}

async function savePersistentCache(name, data) {
  try {
    const db = await openPersistentCacheDb();
    const payload = {
      id: getCacheKey(name),
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(PERSISTENT_STORE_CACHE, "readwrite");
      tx.objectStore(PERSISTENT_STORE_CACHE).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed writing persistent cache"));
    });
  } catch (error) {
    console.warn("Failed to save persistent cache:", name, error);
  }
}

async function getPersistentCachePayload(name) {
  try {
    const db = await openPersistentCacheDb();
    const key = getCacheKey(name);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PERSISTENT_STORE_CACHE, "readonly");
      const store = tx.objectStore(PERSISTENT_STORE_CACHE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row && row.version === CACHE_VERSION ? row.data : null);
      };
      req.onerror = () => reject(req.error || new Error("Failed reading persistent payload"));
    });
  } catch (error) {
    return null;
  }
}

async function clearPersistentCache() {
  try {
    const db = await openPersistentCacheDb();
    const user = getCurrentUser?.();
    const userKey = user?.email || "anonymous";
    const prefix = `advanta_cache_v${CACHE_VERSION}_`;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(PERSISTENT_STORE_CACHE, "readwrite");
      const store = tx.objectStore(PERSISTENT_STORE_CACHE);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const key = String(cursor.key || "");
        if (key.startsWith(prefix) && key.endsWith(`_${userKey}`)) {
          cursor.delete();
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error || new Error("Failed clearing persistent cache"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed clearing persistent cache"));
    });
  } catch (error) {
    console.warn("Failed to clear persistent cache:", error);
  }
}

async function requestPersistentStorage() {
  if (!(navigator.storage && navigator.storage.persist)) return false;

  try {
    const already = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;
    if (already) return true;
    return await navigator.storage.persist();
  } catch (error) {
    console.warn("Failed requesting persistent storage:", error);
    return false;
  }
}

function getCacheKey(name) {
  const user = getCurrentUser?.();
  const userKey = user?.email || "anonymous";
  return `advanta_cache_v${CACHE_VERSION}_${name}_${userKey}`;
}

/**
 * Load cache from IndexedDB (primary). Falls back to localStorage for migration.
 * Returns the cached data or null. Always async.
 */
async function loadLocalCache(name) {
  // Primary: IndexedDB persistent store
  try {
    const persistent = await loadPersistentCache(name);
    if (persistent) return persistent;
  } catch (error) {
    console.warn("Failed to load persistent cache:", name, error);
  }

  // Migration fallback: read from old localStorage, migrate, then remove
  try {
    const raw = localStorage.getItem(getCacheKey(name));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === CACHE_VERSION && parsed.data) {
        // Migrate to IndexedDB then remove localStorage entry
        savePersistentCache(name, parsed.data).catch(() => {});
        try { localStorage.removeItem(getCacheKey(name)); } catch (_e) { /* ignore */ }
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn("Failed to load legacy localStorage cache:", name, error);
  }

  return null;
}

/**
 * Save cache to IndexedDB (primary storage).
 * Fires async — callers should await if they need confirmation.
 */
async function saveLocalCache(name, data) {
  try {
    let payloadData = data;
    if (name === "trials") {
      payloadData = _compactTrialSnapshot(data);
    }

    await savePersistentCache(name, payloadData);

    // Remove old localStorage entry to free browser quota
    try { localStorage.removeItem(getCacheKey(name)); } catch (_e) { /* ignore */ }
  } catch (error) {
    console.warn("Failed to save cache:", name, error);
  }
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(value >= 10 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

function estimateStringBytes(text = "") {
  return text.length * 2;
}

function estimateObjectBytes(data) {
  try {
    return estimateStringBytes(JSON.stringify(data || null));
  } catch (error) {
    return 0;
  }
}

async function getCacheDomainUsage() {
  const names = ["trials", "inventory", "library", "userSettings"];
  const result = {
    domains: {},
    totalBytes: 0,
  };

  for (const name of names) {
    const persistentData = await getPersistentCachePayload(name);
    const bytes = persistentData ? estimateObjectBytes(persistentData) : 0;

    result.domains[name] = { bytes };
    result.totalBytes += bytes;
  }

  return result;
}

function _compactTrialSnapshot(trialsData) {
  if (!trialsData || !Array.isArray(trialsData.trials)) return trialsData;

  const compacted = {
    ...trialsData,
    trials: trialsData.trials.map((trial) => {
      const next = { ...trial };

      // Drop empty response buckets.
      if (next.responses && typeof next.responses === "object") {
        const filtered = {};
        Object.entries(next.responses).forEach(([areaIdx, areaObj]) => {
          if (areaObj && Object.keys(areaObj).length > 0) filtered[areaIdx] = areaObj;
        });
        next.responses = filtered;
      }

      if (next.agronomyResponses && typeof next.agronomyResponses === "object") {
        const filteredAgro = {};
        Object.entries(next.agronomyResponses).forEach(([areaIdx, areaObj]) => {
          if (areaObj && Object.keys(areaObj).length > 0) filteredAgro[areaIdx] = areaObj;
        });
        next.agronomyResponses = filteredAgro;
      }

      return next;
    }),
  };

  return compacted;
}

async function compactLocalCacheData() {
  const domainNames = ["trials", "inventory", "library"];
  let changed = false;

  for (const name of domainNames) {
    const current = await getPersistentCachePayload(name);
    if (!current) continue;

    let compacted = current;
    if (name === "trials") {
      compacted = _compactTrialSnapshot(current);
    }

    const beforeBytes = estimateObjectBytes(current);
    const afterBytes = estimateObjectBytes(compacted);

    await savePersistentCache(name, compacted);
    changed = changed || afterBytes <= beforeBytes;
  }

  return changed;
}

async function refreshStorageHealthCard() {
  const card = document.getElementById("storageHealthCard");
  if (!card) return;

  const bodyEl = card.querySelector(".optimization-card-body");
  const persistBtn = card.querySelector(".storage-btn-persistent");
  if (!bodyEl) return;

  bodyEl.innerHTML = `<div class="optimization-file-count">
    <span class="material-symbols-rounded spin-slow">progress_activity</span>
    <span>Checking storage usage…</span>
  </div>`;

  try {
    const estimate = navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null;
    const persisted = navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : false;

    const usage = estimate?.usage || 0;
    const quota = estimate?.quota || 0;
    const usagePct = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0;
    const domainUsage = await getCacheDomainUsage();

    const domainsHtml = ["trials", "inventory", "library", "userSettings"].map((name) => {
      const entry = domainUsage.domains[name] || { bytes: 0 };
      const label = name === "userSettings" ? "User Settings" : name.charAt(0).toUpperCase() + name.slice(1);
      return `
        <div class="storage-domain-item">
          <div class="storage-domain-title">${label}</div>
          <div class="storage-domain-meta">
            <span>${formatBytes(entry.bytes)}</span>
          </div>
        </div>
      `;
    }).join("");

    bodyEl.innerHTML = `
      <div class="storage-health-grid">
        <div class="storage-health-item">
          <span class="storage-health-label">Used</span>
          <span class="storage-health-value">${formatBytes(usage)}</span>
        </div>
        <div class="storage-health-item">
          <span class="storage-health-label">Quota</span>
          <span class="storage-health-value">${formatBytes(quota)}</span>
        </div>
        <div class="storage-health-item">
          <span class="storage-health-label">Usage</span>
          <span class="storage-health-value">${usagePct}%</span>
        </div>
        <div class="storage-health-item">
          <span class="storage-health-label">Persistent</span>
          <span class="storage-health-value ${persisted ? "ok" : "warn"}">${persisted ? "Enabled" : "Not granted"}</span>
        </div>
      </div>
      <div class="load-data-progress-bar" style="margin-top:8px;"><div class="load-data-progress-fill" style="width:${usagePct}%"></div></div>
      <div class="storage-domain-list">
        <div class="storage-domain-header">Cache by Domain</div>
        ${domainsHtml}
        <div class="storage-domain-summary">Domain Total: ${formatBytes(domainUsage.totalBytes)}</div>
      </div>
    `;

    if (persistBtn) {
      persistBtn.disabled = persisted;
      persistBtn.innerHTML = persisted
        ? '<span class="material-symbols-rounded">check_circle</span> Persistent Active'
        : '<span class="material-symbols-rounded">lock</span> Enable Persistent';
    }
  } catch (error) {
    console.warn("Failed reading storage estimate:", error);
    bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--error">
      <span class="material-symbols-rounded">error</span>
      <span>Failed to read storage status</span>
    </div>`;
  }
}

async function requestPersistentStorageFromUi() {
  const granted = await requestPersistentStorage();
  if (granted) {
    showToast("Persistent storage enabled for long-term local data.", "success");
  } else {
    showToast("Persistent storage not granted by browser.", "warning");
  }
  await refreshStorageHealthCard();
}

async function compactLocalCacheFromUi() {
  const card = document.getElementById("storageHealthCard");
  const compactBtn = card?.querySelector(".storage-btn-compact");
  if (compactBtn) compactBtn.disabled = true;

  try {
    await compactLocalCacheData();
    showToast("Local cache compacted. Primary data remains in persistent storage.", "success", 3800);
  } catch (error) {
    console.error("Compact cache failed:", error);
    showToast("Failed to compact cache.", "error");
  } finally {
    if (compactBtn) compactBtn.disabled = false;
    await refreshStorageHealthCard();
  }
}

async function clearAllDataFromUi() {
  const confirmed = confirm(
    "This will delete all local data (trials, inventory, library, settings, etc.).\n" +
    "You will remain logged in.\n\n" +
    "Continue?"
  );
  if (!confirmed) return;

  const card = document.getElementById("storageHealthCard");
  const clearBtn = card?.querySelector(".storage-btn-clear-all");
  if (clearBtn) clearBtn.disabled = true;

  try {
    // Clear all local and persistent cache
    clearLocalCache();
    
    // Reset state variables
    if (typeof trialState !== 'undefined' && trialState) {
      trialState.trials = [];
    }
    if (typeof inventoryState !== 'undefined' && inventoryState) {
      inventoryState.items = {
        crops: [],
        entries: {},
        locations: [],
        parameters: [],
        agronomy: [],
      };
      inventoryState.loaded = false;
    }
    if (typeof libraryState !== 'undefined' && libraryState) {
      libraryState.items = [];
      libraryState.loaded = false;
    }
    if (typeof loadDataBgState !== 'undefined' && loadDataBgState) {
      loadDataBgState.loadingTrials = {};
      loadDataBgState.updateFlags = {};
      loadDataBgState.lastUpdateCheckAt = null;
    }

    showToast("All local data cleared successfully. Reloading...", "success");
    
    // Delay reload to allow toast display
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error("Clear all data failed:", error);
    showToast("Failed to clear data. Please try again.", "error");
  } finally {
    if (clearBtn) clearBtn.disabled = false;
  }
}

function renderStorageHealthCard() {
  const container = document.getElementById("storageHealthContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="optimization-card" id="storageHealthCard">
      <div class="optimization-card-header">
        <span class="material-symbols-rounded optimization-card-icon">hard_drive</span>
        <span class="optimization-card-title">Storage Health</span>
      </div>
      <div class="optimization-card-body">
        <div class="optimization-file-count">
          <span class="material-symbols-rounded spin-slow">progress_activity</span>
          <span>Checking storage usage…</span>
        </div>
      </div>
      <div class="optimization-card-footer" style="display:flex; gap:8px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="refreshStorageHealthCard()">
          <span class="material-symbols-rounded">refresh</span> Refresh
        </button>
        <button type="button" class="btn btn-secondary btn-sm storage-btn-persistent" onclick="requestPersistentStorageFromUi()">
          <span class="material-symbols-rounded">lock</span> Enable Persistent
        </button>
        <button type="button" class="btn btn-secondary btn-sm storage-btn-compact" onclick="compactLocalCacheFromUi()">
          <span class="material-symbols-rounded">compress</span> Compact Local Cache
        </button>
        <button type="button" class="btn btn-secondary btn-sm storage-btn-clear-all" onclick="clearAllDataFromUi()" style="color: #ef4444; margin-left: auto;">
          <span class="material-symbols-rounded">delete_sweep</span> Clear All Data
        </button>
      </div>
    </div>
  `;

  refreshStorageHealthCard().catch(() => {});
}

function clearLocalCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(`advanta_cache_v${CACHE_VERSION}_`)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("Failed to clear cache:", error);
  }

  if (typeof clearPersistentCache === "function") {
    clearPersistentCache().catch((error) => {
      console.warn("Failed clearing persistent cache:", error);
    });
  }
}

const userSettingsState = {
  loaded: false,
  superuserActive: false,
  data: {
    appearance: {
      inventoryViewMode: "grid",
      inventoryCategoryViews: {
        trials: "default",
        library: "default",
        reminders: "default",
        crops: "default",
        locations: "default",
        parameters: "default",
        agronomy: "default",
      },
    },
    analysis: {
      visibleColumns: [],
      sectionLayout: "horizontal",
      sectionFocus: "balanced",
      pathDiagramDefaults: {},
      ggeBiplotDefaults: {},
    },
    authority: {
      hiddenSelectors: [],
      superuserActive: false,
      reloginMinutes: 45,
    },
    notifications: {
      enabled: true,
      overdue: { enabled: true, timesPerDay: 1, hours: [8] },
      today: { enabled: true, timesPerDay: 1, hours: [7] },
    },
  },
};

function normalizeUserSettings(data) {
  const safe = data && typeof data === "object" ? data : {};
  const appearance = safe.appearance && typeof safe.appearance === "object"
    ? safe.appearance
    : {};

  const normalizedInventoryViewMode = appearance.inventoryViewMode === "list"
    ? "list"
    : "grid";

  const rawCategoryViews = appearance.inventoryCategoryViews && typeof appearance.inventoryCategoryViews === "object"
    ? appearance.inventoryCategoryViews
    : {};

  const normalizeCategoryView = (value) => {
    if (value === "grid" || value === "list") return value;
    return "default";
  };

  const analysis = safe.analysis && typeof safe.analysis === "object"
    ? safe.analysis
    : {};

  const normalizedLayout = analysis.sectionLayout === "vertical"
    ? "vertical"
    : "horizontal";
  const rawFocus = analysis.sectionFocus === "focus-builder"
    ? "focus-settings"
    : analysis.sectionFocus;
  const normalizedFocus = ["balanced", "focus-results", "focus-settings", "focus-dataset"]
    .includes(rawFocus)
    ? rawFocus
    : "balanced";

  const authority = safe.authority && typeof safe.authority === "object"
    ? safe.authority
    : {};

  return {
    appearance: {
      inventoryViewMode: normalizedInventoryViewMode,
      inventoryCategoryViews: {
        trials: normalizeCategoryView(rawCategoryViews.trials),
        library: normalizeCategoryView(rawCategoryViews.library),
        reminders: normalizeCategoryView(rawCategoryViews.reminders),
        crops: normalizeCategoryView(rawCategoryViews.crops),
        locations: normalizeCategoryView(rawCategoryViews.locations),
        parameters: normalizeCategoryView(rawCategoryViews.parameters),
        agronomy: normalizeCategoryView(rawCategoryViews.agronomy),
      },
    },
    analysis: {
      visibleColumns: Array.isArray(analysis.visibleColumns)
        ? analysis.visibleColumns.map((key) => String(key))
        : [],
      sectionLayout: normalizedLayout,
      sectionFocus: normalizedFocus,
      pathDiagramDefaults: analysis.pathDiagramDefaults && typeof analysis.pathDiagramDefaults === "object"
        ? { ...analysis.pathDiagramDefaults }
        : {},
      ggeBiplotDefaults: analysis.ggeBiplotDefaults && typeof analysis.ggeBiplotDefaults === "object"
        ? { ...analysis.ggeBiplotDefaults }
        : {},
    },
    authority: {
      hiddenSelectors: Array.isArray(authority.hiddenSelectors)
        ? authority.hiddenSelectors.filter((s) => typeof s === "string" && s.trim())
        : [],
      superuserActive: authority.superuserActive === true,
      reloginMinutes: Math.max(5, Math.min(120, Number(authority.reloginMinutes) || 45)),
    },
    notifications: _normalizeNotificationSettings(safe.notifications),
  };
}

function _normalizeNotificationSettings(raw) {
  const n = raw && typeof raw === "object" ? raw : {};
  const defaults = typeof NotificationsModule !== "undefined"
    ? NotificationsModule.DEFAULT_SETTINGS
    : { enabled: true, scope: "general", overdue: { enabled: true, timesPerDay: 1, hours: [8] }, today: { enabled: true, timesPerDay: 1, hours: [7] } };

  function normalizeType(src, def) {
    const s = src && typeof src === "object" ? src : {};
    const times = [1, 2, 3].includes(Number(s.timesPerDay)) ? Number(s.timesPerDay) : def.timesPerDay;
    let hours = Array.isArray(s.hours) ? s.hours.map(Number).filter((h) => h >= 0 && h < 24) : [...def.hours];
    while (hours.length < times) hours.push(hours[hours.length - 1] ?? def.hours[0]);
    while (hours.length > times) hours.pop();
    return { enabled: s.enabled !== false, timesPerDay: times, hours };
  }

  const validScopes = ["general", "per-trial", "per-location"];
  const scope = validScopes.includes(n.scope) ? n.scope : "general";

  return {
    enabled: n.enabled !== false,
    scope,
    overdue: normalizeType(n.overdue, defaults.overdue),
    today: normalizeType(n.today, defaults.today),
  };
}

function syncAuthorityStateFromSettings() {
  userSettingsState.superuserActive = userSettingsState.data?.authority?.superuserActive === true;
}

function getStoredAnalysisUserSettings() {
  return userSettingsState.data?.analysis || {};
}

function applyUserSettingsToModules() {
  const appearancePrefs = userSettingsState.data?.appearance || {};
  const analysisPrefs = userSettingsState.data?.analysis || {};
  if (typeof applyInventoryUserSettings === "function") {
    applyInventoryUserSettings(appearancePrefs);
  }
  if (typeof applyAnalysisUserSettings === "function") {
    applyAnalysisUserSettings(analysisPrefs);
  }
  if (typeof applyLibraryUserSettings === "function") {
    applyLibraryUserSettings(appearancePrefs);
  }
  applyAuthorityHiddenSelectors();
}

function saveUserSettingsLocalCache() {
  if (typeof saveLocalCache === "function") {
    saveLocalCache("userSettings", userSettingsState.data);
  }
}

function enqueueUserSettingsSync() {
  const user = getCurrentUser?.();
  if (!user || user.isGuest) return;
  if (typeof enqueueSync !== "function") return;
  if (typeof saveUserSettingsToGoogleDrive !== "function") return;

  // Superuser mode is device-local only and must never be synced to Drive.
  const payload = normalizeUserSettings({
    ...userSettingsState.data,
    authority: {
      ...(userSettingsState.data?.authority || {}),
      superuserActive: false,
    },
  });
  enqueueSync({
    label: "Sync user settings",
    fileKey: "user_settings",
    run: async () => {
      await saveUserSettingsToGoogleDrive(payload);
    },
  });
}

async function loadUserSettingsForCurrentUser(options = {}) {
  const { preferRemote = true, silent = true } = options;

  let hasApplied = false;

  try {
    const cached = typeof loadLocalCache === "function"
      ? await loadLocalCache("userSettings")
      : null;
    if (cached && typeof cached === "object") {
      userSettingsState.data = normalizeUserSettings(cached);
      syncAuthorityStateFromSettings();
      applyUserSettingsToModules();
      hasApplied = true;
    }
  } catch (error) {
    console.warn("Failed loading cached user settings:", error);
  }

  const user = getCurrentUser?.();
  const canLoadRemote =
    !!preferRemote &&
    !!user &&
    !user.isGuest &&
    typeof loadUserSettingsFromGoogleDrive === "function" &&
    typeof getAccessToken === "function" &&
    !!getAccessToken();

  if (canLoadRemote) {
    try {
      const remote = await loadUserSettingsFromGoogleDrive();
      if (remote && typeof remote === "object") {
        const localSuperuserActive = userSettingsState.data?.authority?.superuserActive === true;
        userSettingsState.data = normalizeUserSettings(remote);
        // Keep superuser mode local per-device even after remote settings are loaded.
        userSettingsState.data.authority.superuserActive = localSuperuserActive;
        syncAuthorityStateFromSettings();
        applyUserSettingsToModules();
        saveUserSettingsLocalCache();
        hasApplied = true;
      }
    } catch (error) {
      console.warn("Failed loading user settings from Drive:", error);
      if (!silent) {
        showToast("Failed to load user settings from Drive", "warning");
      }
    }
  }

  if (!hasApplied) {
    userSettingsState.data = normalizeUserSettings({});
    syncAuthorityStateFromSettings();
    applyUserSettingsToModules();
  }

  userSettingsState.loaded = true;
}

function renderUserSettingsAnalysisTab() {
  const listEl = document.getElementById("analysisSettingsColumnsList");
  if (!listEl) return;

  const options = typeof getAnalysisColumnOptionsForSettings === "function"
    ? getAnalysisColumnOptionsForSettings()
    : [];

  if (!Array.isArray(options) || options.length === 0) {
    listEl.innerHTML = '<div class="user-settings-column-item">Open Analysis to load columns</div>';
  } else {
    const savedVisible = Array.isArray(userSettingsState.data?.analysis?.visibleColumns)
      ? userSettingsState.data.analysis.visibleColumns
      : [];
    const useSaved = savedVisible.length > 0;
    const currentVisible = new Set(
      useSaved
        ? savedVisible
        : options.filter((item) => item.visible).map((item) => item.key),
    );

    listEl.innerHTML = options
      .map(
        (item) => `
          <label class="user-settings-column-item">
            <input type="checkbox" class="analysis-settings-col-checkbox" data-col-key="${escapeHtml(item.key)}" ${currentVisible.has(item.key) ? "checked" : ""}>
            <span>${escapeHtml(item.label)}</span>
          </label>
        `,
      )
      .join("");
  }

  const savedLayout = userSettingsState.data?.analysis?.sectionLayout === "vertical"
    ? "vertical"
    : "horizontal";
  const savedFocus = ["balanced", "focus-results", "focus-settings", "focus-dataset"]
    .includes(userSettingsState.data?.analysis?.sectionFocus)
    ? userSettingsState.data.analysis.sectionFocus
    : "balanced";

  const layoutInput = document.querySelector(`input[name="userSettingsAnalysisLayout"][value="${savedLayout}"]`);
  if (layoutInput) layoutInput.checked = true;

  const focusInput = document.querySelector(`input[name="userSettingsAnalysisFocus"][value="${savedFocus}"]`);
  if (focusInput) focusInput.checked = true;

  const pathDiagramDefaultsContainer = document.getElementById("userSettingsPathDiagramDefaultsUi");
  if (pathDiagramDefaultsContainer) {
    const rawDefaults = userSettingsState.data?.analysis?.pathDiagramDefaults || {};
    if (typeof window.getPathDiagramSettingsEditorHtml === "function") {
      pathDiagramDefaultsContainer.innerHTML = window.getPathDiagramSettingsEditorHtml(
        rawDefaults,
        Array.from({ length: 10 }, (_, idx) => `X${idx + 1}`),
      );

      const applyCompactVisibility = () => {
        if (typeof window.collectPathDiagramOptionsFromContainer !== "function") return;
        if (typeof window.syncPathDiagramOptionsEditorVisibility !== "function") return;
        const options = window.collectPathDiagramOptionsFromContainer(pathDiagramDefaultsContainer, rawDefaults);
        window.syncPathDiagramOptionsEditorVisibility(pathDiagramDefaultsContainer, options);
      };

      applyCompactVisibility();

      if (!pathDiagramDefaultsContainer.dataset.boundSettingsEvents) {
        pathDiagramDefaultsContainer.addEventListener("input", applyCompactVisibility);
        pathDiagramDefaultsContainer.addEventListener("change", applyCompactVisibility);
        pathDiagramDefaultsContainer.dataset.boundSettingsEvents = "1";
      }
    } else {
      pathDiagramDefaultsContainer.innerHTML = '<div class="user-settings-column-item">Open Path Analysis once to load diagram settings editor.</div>';
    }
  }

  const ggeBiplotDefaultsContainer = document.getElementById("userSettingsGgeBiplotDefaultsUi");
  if (ggeBiplotDefaultsContainer) {
    const rawGgeDefaults = userSettingsState.data?.analysis?.ggeBiplotDefaults || {};
    if (typeof window.getGgeBiplotSettingsEditorHtml === "function") {
      ggeBiplotDefaultsContainer.innerHTML = window.getGgeBiplotSettingsEditorHtml(rawGgeDefaults);

      const applyGgeVisibility = () => {
        if (typeof window.collectGgeBiplotOptionsFromContainer !== "function") return;
        if (typeof window.syncGgeBiplotOptionsEditorVisibility !== "function") return;
        const options = window.collectGgeBiplotOptionsFromContainer(ggeBiplotDefaultsContainer, rawGgeDefaults);
        window.syncGgeBiplotOptionsEditorVisibility(ggeBiplotDefaultsContainer, options);
      };

      applyGgeVisibility();

      if (!ggeBiplotDefaultsContainer.dataset.boundSettingsEvents) {
        ggeBiplotDefaultsContainer.addEventListener("input", applyGgeVisibility);
        ggeBiplotDefaultsContainer.addEventListener("change", applyGgeVisibility);
        ggeBiplotDefaultsContainer.dataset.boundSettingsEvents = "1";
      }
    } else {
      ggeBiplotDefaultsContainer.innerHTML = '<div class="user-settings-column-item">Open GGE Biplot once to load biplot settings editor.</div>';
    }
  }
}

function getEffectiveViewMode(section) {
  const cv = userSettingsState.data?.appearance?.inventoryCategoryViews?.[section];
  if (cv === "grid" || cv === "list") return cv;
  return userSettingsState.data?.appearance?.inventoryViewMode === "list" ? "list" : "grid";
}

function renderUserSettingsAppearanceTab() {
  const globalMode = userSettingsState.data?.appearance?.inventoryViewMode === "list"
    ? "list"
    : "grid";

  const categoryViews = userSettingsState.data?.appearance?.inventoryCategoryViews || {};
  const categoryKeys = ["reminders", "crops", "locations", "parameters", "agronomy"];

  const globalInput = document.querySelector(
    `input[name="userSettingsInventoryGlobalView"][value="${globalMode}"]`,
  );
  if (globalInput) globalInput.checked = true;

  const radioNameMap = {
    reminders: "userSettingsViewReminders",
    crops: "userSettingsInventoryViewCrops",
    locations: "userSettingsInventoryViewLocations",
    parameters: "userSettingsInventoryViewParameters",
    agronomy: "userSettingsInventoryViewAgronomy",
  };

  categoryKeys.forEach((key) => {
    const savedValue = categoryViews[key] === "grid" || categoryViews[key] === "list"
      ? categoryViews[key]
      : "default";
    const inputName = radioNameMap[key];
    if (!inputName) return;
    const input = document.querySelector(
      `input[name="${inputName}"][value="${savedValue}"]`,
    );
    if (input) input.checked = true;
  });
}

// ---- Notification Settings Tab ----

function _buildHourOptions(selectedHour) {
  let html = "";
  for (let h = 0; h < 24; h++) {
    const label = String(h).padStart(2, "0") + ":00";
    html += `<option value="${h}" ${h === selectedHour ? "selected" : ""}>${label}</option>`;
  }
  return html;
}

function _renderHourInputs(containerId, hours) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = hours.map((h, i) =>
    `<select class="notif-select notif-hour-select" data-hour-index="${i}">${_buildHourOptions(h)}</select>`
  ).join("");
}

function _syncHourInputsToCount(timesSelectId, hoursContainerId, currentHours) {
  const sel = document.getElementById(timesSelectId);
  const count = sel ? parseInt(sel.value, 10) : 1;
  const hrs = Array.isArray(currentHours) ? [...currentHours] : [8];
  while (hrs.length < count) hrs.push(hrs[hrs.length - 1] || 8);
  while (hrs.length > count) hrs.pop();
  _renderHourInputs(hoursContainerId, hrs);
  return hrs;
}

function renderUserSettingsNotificationsTab() {
  const settings = userSettingsState.data?.notifications || NotificationsModule.DEFAULT_SETTINGS;

  // Permission banner
  const banner = document.getElementById("notifPermissionBanner");
  if (banner) {
    const supported = NotificationsModule.isSupported();
    const denied = supported && Notification.permission === "denied";
    const needsGrant = supported && Notification.permission !== "granted";
    banner.style.display = (denied || !supported) ? "flex" : "none";
  }

  // Enable toggle
  const enabledToggle = document.getElementById("notifEnabledToggle");
  if (enabledToggle) enabledToggle.checked = settings.enabled !== false;

  const panel = document.getElementById("notifSchedulePanel");
  if (panel) panel.style.display = (settings.enabled !== false) ? "" : "none";

  // Scope
  const scopeSelect = document.getElementById("notifScope");
  if (scopeSelect) scopeSelect.value = settings.scope || "general";

  // Overdue
  const overdueEnabled = document.getElementById("notifOverdueEnabled");
  if (overdueEnabled) overdueEnabled.checked = settings.overdue?.enabled !== false;

  const overdueTimes = document.getElementById("notifOverdueTimes");
  if (overdueTimes) overdueTimes.value = String(settings.overdue?.timesPerDay || 1);
  _renderHourInputs("notifOverdueHoursInputs", settings.overdue?.hours || [8]);

  // Today
  const todayEnabled = document.getElementById("notifTodayEnabled");
  if (todayEnabled) todayEnabled.checked = settings.today?.enabled !== false;

  const todayTimes = document.getElementById("notifTodayTimes");
  if (todayTimes) todayTimes.value = String(settings.today?.timesPerDay || 1);
  _renderHourInputs("notifTodayHoursInputs", settings.today?.hours || [7]);

  // Wire interactive behaviors (only once)
  if (!panel?.dataset.notifBound) {
    if (panel) panel.dataset.notifBound = "1";

    if (enabledToggle) {
      enabledToggle.addEventListener("change", () => {
        if (panel) panel.style.display = enabledToggle.checked ? "" : "none";
      });
    }

    const reqBtn = document.getElementById("notifRequestPermBtn");
    if (reqBtn) {
      reqBtn.addEventListener("click", () => {
        NotificationsModule.requestPermission();
        setTimeout(() => renderUserSettingsNotificationsTab(), 500);
      });
    }

    if (overdueTimes) {
      overdueTimes.addEventListener("change", () => {
        const curHours = _collectHoursFrom("notifOverdueHoursInputs");
        _syncHourInputsToCount("notifOverdueTimes", "notifOverdueHoursInputs", curHours);
      });
    }

    if (todayTimes) {
      todayTimes.addEventListener("change", () => {
        const curHours = _collectHoursFrom("notifTodayHoursInputs");
        _syncHourInputsToCount("notifTodayTimes", "notifTodayHoursInputs", curHours);
      });
    }

    const testBtn = document.getElementById("notifTestBtn");
    if (testBtn) {
      testBtn.addEventListener("click", () => {
        if (!NotificationsModule.isSupported()) {
          showToast("Notifications not supported in this browser", "warning");
          return;
        }
        if (Notification.permission !== "granted") {
          NotificationsModule.requestPermission();
          showToast("Please allow notifications first", "info");
          return;
        }
        const { todayCount, overdueCount } = NotificationsModule.getReminderCounts();
        const body = `Overdue: ${overdueCount} | Today: ${todayCount}`;
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification("SPECTRA Test Notification", {
            body,
            icon: "icons/SPECTRA%20Logo.png",
            badge: "icons/SPECTRA%20Logo.png",
            tag: "spectra-test",
          });
        }).catch(() => {
          new Notification("SPECTRA Test Notification", { body, icon: "icons/SPECTRA%20Logo.png" });
        });
        showToast("Test notification sent", "success");
      });
    }
  }
}

function _collectHoursFrom(containerId) {
  const selects = document.querySelectorAll(`#${containerId} .notif-hour-select`);
  return Array.from(selects).map((s) => parseInt(s.value, 10));
}

function _collectNotificationSettings() {
  const enabled = document.getElementById("notifEnabledToggle")?.checked !== false;
  const scope = document.getElementById("notifScope")?.value || "general";

  const overdueEnabled = document.getElementById("notifOverdueEnabled")?.checked !== false;
  const overdueTimes = parseInt(document.getElementById("notifOverdueTimes")?.value, 10) || 1;
  const overdueHours = _collectHoursFrom("notifOverdueHoursInputs");

  const todayEnabled = document.getElementById("notifTodayEnabled")?.checked !== false;
  const todayTimes = parseInt(document.getElementById("notifTodayTimes")?.value, 10) || 1;
  const todayHours = _collectHoursFrom("notifTodayHoursInputs");

  return {
    enabled,
    scope,
    overdue: { enabled: overdueEnabled, timesPerDay: overdueTimes, hours: overdueHours },
    today: { enabled: todayEnabled, timesPerDay: todayTimes, hours: todayHours },
  };
}

function switchUserSettingsTab(tabKey = "analysis") {
  const safeTabKey = ["authority", "analysis", "appearance", "notifications", "optimization"].includes(tabKey)
    ? tabKey
    : "analysis";

  document.querySelectorAll(".user-settings-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === safeTabKey);
  });

  document.querySelectorAll(".user-settings-tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  const targetId = "userSettingsTab" + safeTabKey.charAt(0).toUpperCase() + safeTabKey.slice(1);
  const targetTab = document.getElementById(targetId);
  if (targetTab) targetTab.classList.add("active");

  if (safeTabKey === "optimization") {
    renderOptimizationTab();
  }

  if (safeTabKey === "authority") {
    renderAuthorityTab();
  }

  if (safeTabKey === "appearance") {
    renderUserSettingsAppearanceTab();
  }

  if (safeTabKey === "notifications") {
    renderUserSettingsNotificationsTab();
  }
}

// ===========================
// AUTHORITY / SUPERUSER MODE
// ===========================
const _AUTHORITY_KEY = "spectra123";
let _authorityStyleEl = null;

function renderAuthorityTab() {
  const passwordSection = document.getElementById("authorityPasswordSection");
  const superuserSection = document.getElementById("authoritySuperuserSection");
  const passwordInput = document.getElementById("authorityPasswordInput");
  const errorEl = document.getElementById("authorityPasswordError");
  const textarea = document.getElementById("authorityHiddenSelectorsInput");

  if (!passwordSection || !superuserSection) return;

  if (errorEl) errorEl.style.display = "none";
  if (passwordInput) passwordInput.value = "";

  if (userSettingsState.superuserActive) {
    passwordSection.style.display = "none";
    superuserSection.style.display = "";
    if (textarea) {
      const selectors = userSettingsState.data?.authority?.hiddenSelectors || [];
      textarea.value = selectors.join("\n");
    }
    const reloginInput = document.getElementById("authorityReloginMinutesInput");
    if (reloginInput) {
      reloginInput.value = userSettingsState.data?.authority?.reloginMinutes || 45;
    }
  } else {
    passwordSection.style.display = "";
    superuserSection.style.display = "none";
  }
}

function attemptAuthorityUnlock() {
  const passwordInput = document.getElementById("authorityPasswordInput");
  const errorEl = document.getElementById("authorityPasswordError");
  if (!passwordInput) return;

  const value = passwordInput.value || "";
  if (value === _AUTHORITY_KEY) {
    userSettingsState.superuserActive = true;
    userSettingsState.data = normalizeUserSettings({
      ...userSettingsState.data,
      authority: {
        ...(userSettingsState.data?.authority || {}),
        superuserActive: true,
      },
    });
    if (errorEl) errorEl.style.display = "none";

    // Reveal hidden elements while in superuser mode
    _removeAuthorityHiddenStyles();

    saveUserSettingsLocalCache();

    renderAuthorityTab();
    showToast("Superuser mode activated", "success");
  } else {
    if (errorEl) errorEl.style.display = "";
    passwordInput.focus();
  }
}

function exitSuperuserMode() {
  userSettingsState.superuserActive = false;
  userSettingsState.data = normalizeUserSettings({
    ...userSettingsState.data,
    authority: {
      ...(userSettingsState.data?.authority || {}),
      superuserActive: false,
    },
  });

  // Re-apply hidden selectors
  applyAuthorityHiddenSelectors();

  saveUserSettingsLocalCache();

  renderAuthorityTab();
  showToast("Returned to normal mode", "info");
}

function saveAuthoritySelectors() {
  const textarea = document.getElementById("authorityHiddenSelectorsInput");
  if (!textarea) return;

  const raw = textarea.value || "";
  const selectors = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  userSettingsState.data = normalizeUserSettings({
    ...userSettingsState.data,
    authority: {
      ...(userSettingsState.data?.authority || {}),
      hiddenSelectors: selectors,
    },
  });

  saveUserSettingsLocalCache();
  enqueueUserSettingsSync();
  showToast("Hidden selectors saved", "success");
}

function saveAuthorityReloginMinutes() {
  const input = document.getElementById("authorityReloginMinutesInput");
  if (!input) return;

  const mins = Math.max(5, Math.min(120, Number(input.value) || 45));
  input.value = mins;

  userSettingsState.data = normalizeUserSettings({
    ...userSettingsState.data,
    authority: {
      ...(userSettingsState.data?.authority || {}),
      reloginMinutes: mins,
    },
  });

  saveUserSettingsLocalCache();
  enqueueUserSettingsSync();

  // Re-schedule token refresh with new interval
  if (typeof scheduleTokenRefresh === "function") scheduleTokenRefresh();

  showToast(`Relogin timer set to ${mins} minutes`, "success");
}

function applyAuthorityHiddenSelectors() {
  // In superuser mode, don't hide anything
  if (userSettingsState.superuserActive) {
    _removeAuthorityHiddenStyles();
    return;
  }

  const selectors = userSettingsState.data?.authority?.hiddenSelectors || [];
  if (selectors.length === 0) {
    _removeAuthorityHiddenStyles();
    return;
  }

  // Build a single CSS rule that hides all matching selectors
  const safeSelectors = selectors.filter((s) => {
    try {
      document.querySelector(s);
      return true;
    } catch (_e) {
      return false;
    }
  });

  if (safeSelectors.length === 0) {
    _removeAuthorityHiddenStyles();
    return;
  }

  const css = safeSelectors.join(",\n") + " { display: none !important; }";

  if (!_authorityStyleEl) {
    _authorityStyleEl = document.createElement("style");
    _authorityStyleEl.id = "authority-hidden-styles";
    document.head.appendChild(_authorityStyleEl);
  }
  _authorityStyleEl.textContent = css;
}

function _removeAuthorityHiddenStyles() {
  if (_authorityStyleEl) {
    _authorityStyleEl.textContent = "";
  }
}

let _authorityEventsSetUp = false;
function setupAuthorityEvents() {
  if (_authorityEventsSetUp) return;
  _authorityEventsSetUp = true;
  const unlockBtn = document.getElementById("authorityUnlockBtn");
  const exitBtn = document.getElementById("authorityExitSuperuserBtn");
  const saveBtn = document.getElementById("authoritySaveSelectorsBtn");
  const passwordInput = document.getElementById("authorityPasswordInput");
  const reloginSaveBtn = document.getElementById("authorityReloginSaveBtn");

  if (unlockBtn) {
    unlockBtn.addEventListener("click", attemptAuthorityUnlock);
  }
  if (exitBtn) {
    exitBtn.addEventListener("click", exitSuperuserMode);
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", saveAuthoritySelectors);
  }
  if (reloginSaveBtn) {
    reloginSaveBtn.addEventListener("click", saveAuthorityReloginMinutes);
  }
  if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        attemptAuthorityUnlock();
      }
    });
  }
}

const OPTIMIZATION_CATEGORIES = ["Parameters", "Agronomy", "Locations"];

async function renderOptimizationTab() {
  renderStorageHealthCard();

  const container = document.getElementById("optimizationCategoriesList");
  if (!container) return;

  container.innerHTML = OPTIMIZATION_CATEGORIES.map((cat) => `
    <div class="optimization-card" id="optimizeCard_${cat}">
      <div class="optimization-card-header">
        <span class="material-symbols-rounded optimization-card-icon">folder</span>
        <span class="optimization-card-title">${escapeHtml(cat)}</span>
      </div>
      <div class="optimization-card-body">
        <div class="optimization-file-count">
          <span class="material-symbols-rounded spin-slow">progress_activity</span>
          <span>Scanning files…</span>
        </div>
      </div>
      <div class="optimization-card-footer">
        <button type="button" class="btn btn-secondary btn-sm" disabled onclick="optimizeInventoryCategory('${cat}')">
          <span class="material-symbols-rounded">compress</span> Optimize
        </button>
      </div>
    </div>
  `).join("");

  for (const cat of OPTIMIZATION_CATEGORIES) {
    await scanOptimizationCategory(cat);
  }

  // Render trial optimization cards
  renderTrialOptimizationCards();
}

async function scanOptimizationCategory(category) {
  const card = document.getElementById(`optimizeCard_${category}`);
  if (!card) return;

  const bodyEl = card.querySelector(".optimization-card-body");
  const btn = card.querySelector(".optimization-card-footer button");

  try {
    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    if (!parentFolderId) {
      bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--error">
        <span class="material-symbols-rounded">error</span>
        <span>Drive folder not found. Sign in first.</span>
      </div>`;
      return;
    }

    const response = await gapi.client.drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType='application/json' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    const fileCount = files.length;

    if (fileCount <= 1) {
      bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--ok">
        <span class="material-symbols-rounded">check_circle</span>
        <span>${fileCount === 0 ? "No files" : "1 file"} — already optimized</span>
      </div>`;
      btn.disabled = true;
    } else {
      bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--warn">
        <span class="material-symbols-rounded">inventory_2</span>
        <span>${fileCount} individual files</span>
      </div>`;
      btn.disabled = false;
    }
  } catch (error) {
    console.error(`Error scanning ${category}:`, error);
    bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--error">
      <span class="material-symbols-rounded">error</span>
      <span>Failed to scan files</span>
    </div>`;
  }
}

async function optimizeInventoryCategory(category) {
  const card = document.getElementById(`optimizeCard_${category}`);
  if (!card) return;

  const bodyEl = card.querySelector(".optimization-card-body");
  const btn = card.querySelector(".optimization-card-footer button");
  btn.disabled = true;

  bodyEl.innerHTML = `<div class="optimization-file-count">
    <span class="material-symbols-rounded spin-slow">progress_activity</span>
    <span>Loading all files…</span>
  </div>`;

  try {
    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    if (!parentFolderId) throw new Error("Folder not found");

    const response = await gapi.client.drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType='application/json' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    if (files.length <= 1) {
      showToast(`${category} is already optimized`, "info");
      await scanOptimizationCategory(category);
      return;
    }

    // Load all file contents
    const allItems = [];
    let loaded = 0;
    for (const file of files) {
      try {
        const content = await getFileContent(file.id);
        if (Array.isArray(content)) {
          allItems.push(...content);
        } else if (content && typeof content === "object") {
          allItems.push(content);
        }
        loaded++;
        bodyEl.innerHTML = `<div class="optimization-file-count">
          <span class="material-symbols-rounded spin-slow">progress_activity</span>
          <span>Loaded ${loaded} / ${files.length} files…</span>
        </div>`;
      } catch (err) {
        console.error(`Error loading file ${file.name}:`, err);
      }
    }

    if (allItems.length === 0) {
      showToast(`No items found in ${category}`, "warning");
      await scanOptimizationCategory(category);
      return;
    }

    // Upload consolidated file
    bodyEl.innerHTML = `<div class="optimization-file-count">
      <span class="material-symbols-rounded spin-slow">progress_activity</span>
      <span>Uploading consolidated file…</span>
    </div>`;

    await upsertJsonFileInFolder("_consolidated.json", parentFolderId, allItems);

    // Delete old individual files
    bodyEl.innerHTML = `<div class="optimization-file-count">
      <span class="material-symbols-rounded spin-slow">progress_activity</span>
      <span>Removing old files…</span>
    </div>`;

    const token = getAccessToken();
    let deleted = 0;
    for (const file of files) {
      try {
        const resp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        if (resp.ok || resp.status === 204) deleted++;
        bodyEl.innerHTML = `<div class="optimization-file-count">
          <span class="material-symbols-rounded spin-slow">progress_activity</span>
          <span>Removed ${deleted} / ${files.length} old files…</span>
        </div>`;
      } catch (err) {
        console.error(`Error deleting file ${file.name}:`, err);
      }
    }

    showToast(`${category} optimized: ${allItems.length} items consolidated into 1 file`, "success");
    await scanOptimizationCategory(category);
  } catch (error) {
    console.error(`Error optimizing ${category}:`, error);
    showToast(`Failed to optimize ${category}`, "error");
    bodyEl.innerHTML = `<div class="optimization-file-count optimization-file-count--error">
      <span class="material-symbols-rounded">error</span>
      <span>Optimization failed</span>
    </div>`;
    btn.disabled = false;
  }
}

// === Trial Optimization (per-trial, persistent state) ===

// Persistent state that survives navigation/modal close — resets only on page refresh
const _trialOptState = {
  selectedTrialId: null,
  // Keyed by trialId → { obs, agro, orphanObs, orphanAgro, structure }
  // Each entry: { status: 'idle'|'scanning'|'done'|'error', html: '', btnDisabled: true }
  cache: {},
};

const _orphanPhotoPreviewCache = {};

function _getTrialOptCache(trialId) {
  if (!_trialOptState.cache[trialId]) {
    _trialOptState.cache[trialId] = {
      obs:        { status: "idle", html: "", btnDisabled: true },
      agro:       { status: "idle", html: "", btnDisabled: true },
      orphanObs:  { status: "idle", html: "", btnDisabled: true },
      orphanAgro: { status: "idle", html: "", btnDisabled: true },
      structure:  { status: "idle", html: "", btnDisabled: true },
    };
  }
  return _trialOptState.cache[trialId];
}

function renderTrialOptimizationCards() {
  // Populate trial dropdown
  const select = document.getElementById("trialOptTrialSelect");
  if (select) {
    const trials = trialState.trials || [];
    const currentVal = _trialOptState.selectedTrialId || "";
    select.innerHTML = '<option value="">Select a trial…</option>' +
      trials.map(t => `<option value="${t.id}" ${t.id === currentVal ? "selected" : ""}>${escapeHtml(t.name || t.id)}</option>`).join("");
  }

  const container = document.getElementById("optimizationTrialList");
  if (!container) return;

  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) {
    container.innerHTML = `<div class="optimization-file-count" style="padding:1rem 0;color:var(--text-secondary);">
      <span class="material-symbols-rounded">info</span>
      <span>Select a trial above to view optimization options.</span>
    </div>`;
    return;
  }

  const c = _getTrialOptCache(trialId);

  const cards = [
    { key: "obs",        icon: "photo_camera",  title: "Observation Photo Optimization",     scanFn: "scanTrialObsPhotos",     optFn: "optimizeTrialObsPhotos",     btnLabel: "Optimize" },
    { key: "agro",       icon: "agriculture",    title: "Agronomy Photo Optimization",        scanFn: "scanTrialAgroPhotos",    optFn: "optimizeTrialAgroPhotos",    btnLabel: "Optimize" },
    { key: "orphanObs",  icon: "broken_image",   title: "Orphaned Observation Photos",        scanFn: "scanOrphanObsPhotos",    optFn: "deleteOrphanObsPhotos",      btnLabel: "Delete Orphans" },
    { key: "orphanAgro", icon: "hide_image",     title: "Orphaned Agronomy Photos",           scanFn: "scanOrphanAgroPhotos",   optFn: "deleteOrphanAgroPhotos",     btnLabel: "Delete Orphans" },
    { key: "structure",  icon: "account_tree",   title: "File Structure (Per-Rep)",            scanFn: "scanTrialStructure",     optFn: "optimizeTrialStructure",     btnLabel: "Consolidate" },
  ];

  container.innerHTML = cards.map(cd => {
    const st = c[cd.key];
    const bodyHtml = st.status === "idle"
      ? `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Scanning…</span></div>`
      : st.html;
    return `
      <div class="optimization-card" id="trialOpt_${cd.key}">
        <div class="optimization-card-header">
          <span class="material-symbols-rounded optimization-card-icon">${cd.icon}</span>
          <span class="optimization-card-title">${cd.title}</span>
        </div>
        <div class="optimization-card-body">${bodyHtml}</div>
        <div class="optimization-card-footer" style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm trialopt-action-btn" ${st.btnDisabled ? "disabled" : ""} onclick="${cd.optFn}()">
            <span class="material-symbols-rounded">compress</span> ${cd.btnLabel}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="refreshTrialOptCard('${cd.key}','${cd.scanFn}')">
            <span class="material-symbols-rounded">refresh</span> Refresh
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Hydrate orphan photo previews when cards are re-rendered from cache.
  container.querySelectorAll('.optimization-card-body').forEach((body) => {
    if (body.querySelector('img[data-orphan-photo-fileid]')) {
      _hydrateOrphanPhotoPreviews(body).catch(() => {});
    }
  });

  // Auto-scan cards that are still idle
  for (const cd of cards) {
    if (c[cd.key].status === "idle") {
      window[cd.scanFn]();
    }
  }
}

function onTrialOptSelectChange() {
  const select = document.getElementById("trialOptTrialSelect");
  _trialOptState.selectedTrialId = select ? select.value || null : null;
  renderTrialOptimizationCards();
}

// Helper: update a single optimization card's body and button state
function _updateTrialOptCard(key, html, btnDisabled) {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  const c = _getTrialOptCache(trialId);
  c[key].html = html;
  c[key].btnDisabled = btnDisabled;

  const card = document.getElementById(`trialOpt_${key}`);
  if (card) {
    const body = card.querySelector(".optimization-card-body");
    const btn = card.querySelector(".trialopt-action-btn");
    if (body) body.innerHTML = html;
    if (btn) btn.disabled = btnDisabled;

    if (body && body.querySelector('img[data-orphan-photo-fileid]')) {
      _hydrateOrphanPhotoPreviews(body).catch(() => {});
    }
  }
}

function refreshTrialOptCard(key, scanFn) {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  const c = _getTrialOptCache(trialId);
  c[key].status = "idle";
  c[key].html = "";
  c[key].btnDisabled = true;

  const card = document.getElementById(`trialOpt_${key}`);
  if (card) {
    const body = card.querySelector(".optimization-card-body");
    const btn = card.querySelector(".trialopt-action-btn");
    if (body) body.innerHTML = `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Scanning…</span></div>`;
    if (btn) btn.disabled = true;
  }
  window[scanFn]();
}

function _setTrialOptStatus(key, status) {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _getTrialOptCache(trialId)[key].status = status;
}

// ── Per-trial response files helper ──

async function _getTrialResponseFilesForTrial(trialId) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolder = await findFolder(trialId, rootFolderId);
  if (!trialFolder) return { obsFiles: [], agroFiles: [], trialFolderId: null };

  const result = { obsFiles: [], agroFiles: [], trialFolderId: trialFolder.id };

  const respFolder = await findFolder("responses", trialFolder.id);
  if (respFolder) {
    const filesResp = await gapi.client.drive.files.list({
      q: `'${respFolder.id}' in parents and mimeType='application/json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });
    for (const file of (filesResp.result.files || [])) {
      result.obsFiles.push({ trialFolderId: trialFolder.id, responseFolderId: respFolder.id, fileId: file.id, fileName: file.name });
    }
  }

  const agroFolder = await findFolder("agronomy", trialFolder.id);
  if (agroFolder) {
    const agroFilesResp = await gapi.client.drive.files.list({
      q: `'${agroFolder.id}' in parents and mimeType='application/json' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });
    for (const file of (agroFilesResp.result.files || [])) {
      result.agroFiles.push({ trialFolderId: trialFolder.id, responseFolderId: agroFolder.id, fileId: file.id, fileName: file.name });
    }
  }

  return result;
}

// ── Scan & Optimize: Observation Photos (inline→binary) ──

async function scanTrialObsPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _setTrialOptStatus("obs", "scanning");

  try {
    const { obsFiles } = await _getTrialResponseFilesForTrial(trialId);
    let total = 0;
    for (const f of obsFiles) {
      try {
        const data = await getFileContent(f.fileId);
        if (data && typeof data === "object") total += _countInlinePhotos(data);
      } catch (_) {}
    }
    const html = total === 0
      ? `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No inline photos — already optimized</span></div>`
      : `<div class="optimization-file-count optimization-file-count--warn"><span class="material-symbols-rounded">photo_library</span><span>${total} inline photo${total !== 1 ? "s" : ""} in ${obsFiles.length} file${obsFiles.length !== 1 ? "s" : ""}</span></div>`;
    _setTrialOptStatus("obs", "done");
    _updateTrialOptCard("obs", html, total === 0);
  } catch (err) {
    _setTrialOptStatus("obs", "error");
    _updateTrialOptCard("obs", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Scan failed</span></div>`, true);
  }
}

async function optimizeTrialObsPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _updateTrialOptCard("obs", `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Optimizing…</span></div>`, true);

  try {
    const { obsFiles, trialFolderId } = await _getTrialResponseFilesForTrial(trialId);
    const photosFolderId = await getOrCreateFolder("photos", trialFolderId);
    let totalConverted = 0;

    for (let i = 0; i < obsFiles.length; i++) {
      const f = obsFiles[i];
      let data;
      try { data = await getFileContent(f.fileId); } catch (_) { continue; }
      if (!data || typeof data !== "object") continue;
      if (_countInlinePhotos(data) === 0) continue;

      const converted = await _extractInlinePhotos(data, photosFolderId);
      if (converted > 0) {
        await _reuploadJsonFile(f.fileId, f.fileName, data);
        totalConverted += converted;
      }
    }

    const html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>${totalConverted} photo${totalConverted !== 1 ? "s" : ""} converted to WebP</span></div>`;
    _setTrialOptStatus("obs", "done");
    _updateTrialOptCard("obs", html, true);
    showToast(`Observation photo optimization: ${totalConverted} converted`, "success");
  } catch (err) {
    _setTrialOptStatus("obs", "error");
    _updateTrialOptCard("obs", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Optimization failed</span></div>`, false);
  }
}

// ── Scan & Optimize: Agronomy Photos (inline→binary) ──

async function scanTrialAgroPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _setTrialOptStatus("agro", "scanning");

  try {
    const { agroFiles } = await _getTrialResponseFilesForTrial(trialId);
    let total = 0;
    for (const f of agroFiles) {
      try {
        const data = await getFileContent(f.fileId);
        if (data && typeof data === "object") total += _countInlinePhotos(data);
      } catch (_) {}
    }
    const html = total === 0
      ? `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No inline photos — already optimized</span></div>`
      : `<div class="optimization-file-count optimization-file-count--warn"><span class="material-symbols-rounded">agriculture</span><span>${total} inline photo${total !== 1 ? "s" : ""} in ${agroFiles.length} file${agroFiles.length !== 1 ? "s" : ""}</span></div>`;
    _setTrialOptStatus("agro", "done");
    _updateTrialOptCard("agro", html, total === 0);
  } catch (err) {
    _setTrialOptStatus("agro", "error");
    _updateTrialOptCard("agro", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Scan failed</span></div>`, true);
  }
}

async function optimizeTrialAgroPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _updateTrialOptCard("agro", `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Optimizing…</span></div>`, true);

  try {
    const { agroFiles, trialFolderId } = await _getTrialResponseFilesForTrial(trialId);
    const agroPhotosFolderId = await getOrCreateFolder("agronomy-photos", trialFolderId);
    let totalConverted = 0;

    for (const f of agroFiles) {
      let data;
      try { data = await getFileContent(f.fileId); } catch (_) { continue; }
      if (!data || typeof data !== "object") continue;
      if (_countInlinePhotos(data) === 0) continue;

      const converted = await _extractInlinePhotos(data, agroPhotosFolderId);
      if (converted > 0) {
        await _reuploadJsonFile(f.fileId, f.fileName, data);
        totalConverted += converted;
      }
    }

    const html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>${totalConverted} photo${totalConverted !== 1 ? "s" : ""} converted to WebP</span></div>`;
    _setTrialOptStatus("agro", "done");
    _updateTrialOptCard("agro", html, true);
    showToast(`Agronomy photo optimization: ${totalConverted} converted`, "success");
  } catch (err) {
    _setTrialOptStatus("agro", "error");
    _updateTrialOptCard("agro", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Optimization failed</span></div>`, false);
  }
}

// ── Orphaned Photo Detection ──

// Filter to authoritative (consolidated) response files only.
// If a consolidated file ({area}~responses.json) exists for an area,
// skip any individual files for that same area (they're stale).
function _filterAuthoritativeFiles(files, consolidatedPattern) {
  const consolidated = files.filter(f => consolidatedPattern.test(f.fileName));
  if (consolidated.length === 0) return files; // no consolidated → use everything

  const coveredAreas = new Set(consolidated.map(f => f.fileName.split("~")[0]));
  const nonStaleIndividuals = files.filter(f => {
    if (consolidatedPattern.test(f.fileName)) return false; // already in consolidated set
    const area = f.fileName.split(/[~_]/)[0];
    return !coveredAreas.has(area); // only keep if area NOT covered by consolidated
  });
  return [...consolidated, ...nonStaleIndividuals];
}

async function _getReferencedPhotoFileIds(jsonFiles) {
  const ids = new Set();
  let errors = 0;
  for (const f of jsonFiles) {
    try {
      const data = await getFileContent(f.fileId);
      if (data && typeof data === "object") _collectPhotoFileIds(data, ids);
    } catch (_) { errors++; }
  }
  return { ids, errors };
}

// Targeted: only collect fileId from objects inside .photos arrays
function _collectPhotoFileIds(obj, ids) {
  if (typeof obj !== "object" || obj === null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) _collectPhotoFileIds(item, ids);
    return;
  }
  // If this object has a .photos array, extract photo fileIds from it
  if (Array.isArray(obj.photos)) {
    for (const p of obj.photos) {
      if (p && typeof p === "object" && p.fileId) {
        ids.add(p.fileId);
      }
    }
  }
  // Recurse into all nested object/array values
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      _collectPhotoFileIds(val, ids);
    }
  }
}

function _renderOrphanList(orphans) {
  const maxShow = 20;
  const shown = orphans.slice(0, maxShow);
  let html = `<div class="orphan-photo-list" style="margin-top:8px;max-height:200px;overflow-y:auto;font-size:0.82rem;color:var(--text-secondary);">`;
  html += shown.map(p => {
    const sizeKB = p.size ? `(${(Number(p.size) / 1024).toFixed(1)} KB)` : "";
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
      <div style="width:38px;height:38px;border-radius:6px;overflow:hidden;flex:0 0 38px;background:var(--bg-tertiary);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;">
        <img data-orphan-photo-fileid="${escapeHtml(p.id)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">
      </div>
      <div style="min-width:0;display:flex;flex-direction:column;gap:1px;">
        <span style="word-break:break-all;color:var(--text-primary);">${escapeHtml(p.name)}</span>
        <span style="font-size:0.74rem;color:var(--text-secondary);">${sizeKB || "Unknown size"}</span>
      </div>
    </div>`;
  }).join("");
  if (orphans.length > maxShow) {
    html += `<div style="padding:2px 0;font-style:italic;">…and ${orphans.length - maxShow} more</div>`;
  }
  html += `</div>`;
  return html;
}

async function _hydrateOrphanPhotoPreviews(container) {
  if (!container) return;

  const imgs = container.querySelectorAll('img[data-orphan-photo-fileid]');
  if (!imgs.length) return;

  let token = typeof getAccessToken === "function" ? getAccessToken() : "";
  if (!token) return;

  const BATCH_SIZE = 20;
  const imgList = Array.from(imgs);

  async function hydrateImg(img) {
    const fileId = img.dataset.orphanPhotoFileid;
    if (!fileId) return;

    if (_orphanPhotoPreviewCache[fileId]) {
      img.src = _orphanPhotoPreviewCache[fileId];
      return;
    }

    try {
      let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if ((resp.status === 401 || resp.status === 403) && typeof getAccessToken === "function") {
        token = getAccessToken();
        if (!token) return;
        resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!resp.ok) return;

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      _orphanPhotoPreviewCache[fileId] = url;
      img.src = url;
    } catch (_) {
      // Keep graceful fallback: text-only row still identifies orphan file.
    }
  }

  for (let i = 0; i < imgList.length; i += BATCH_SIZE) {
    const batch = imgList.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(hydrateImg));
  }
}

async function _listDrivePhotos(folderId) {
  if (!folderId) return [];
  const resp = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id, name, size)",
    pageSize: 1000,
  });
  return resp.result.files || [];
}

async function scanOrphanObsPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _setTrialOptStatus("orphanObs", "scanning");

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFolder = await findFolder(trialId, rootFolderId);
    if (!trialFolder) { _setTrialOptStatus("orphanObs", "done"); _updateTrialOptCard("orphanObs", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No trial folder found</span></div>`, true); return; }

    const photosFolder = await findFolder("photos", trialFolder.id);
    if (!photosFolder) { _setTrialOptStatus("orphanObs", "done"); _updateTrialOptCard("orphanObs", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No photos folder</span></div>`, true); return; }

    const drivePhotos = await _listDrivePhotos(photosFolder.id);
    if (drivePhotos.length === 0) { _setTrialOptStatus("orphanObs", "done"); _updateTrialOptCard("orphanObs", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>Photos folder is empty</span></div>`, true); return; }

    const { obsFiles } = await _getTrialResponseFilesForTrial(trialId);
    // Use only authoritative (consolidated) files to avoid stale individual files
    const authFiles = _filterAuthoritativeFiles(obsFiles, /^\d+~responses\.json$/);
    const { ids: referencedIds, errors: readErrors } = await _getReferencedPhotoFileIds(authFiles);

    const orphans = drivePhotos.filter(p => !referencedIds.has(p.id));
    _getTrialOptCache(trialId)._orphanObsList = orphans;

    let html;
    const errNote = readErrors > 0 ? ` (${readErrors} file${readErrors !== 1 ? "s" : ""} failed to read)` : "";
    if (orphans.length === 0) {
      html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No orphaned photos — ${drivePhotos.length} file${drivePhotos.length !== 1 ? "s" : ""} all referenced (${referencedIds.size} refs in ${authFiles.length} JSON${authFiles.length !== 1 ? "s" : ""})${errNote}</span></div>`;
    } else {
      html = `<div class="optimization-file-count optimization-file-count--warn"><span class="material-symbols-rounded">broken_image</span><span>${orphans.length} orphaned photo${orphans.length !== 1 ? "s" : ""} of ${drivePhotos.length} total (${referencedIds.size} refs in ${authFiles.length} JSON${authFiles.length !== 1 ? "s" : ""})${errNote}</span></div>`
        + _renderOrphanList(orphans);
    }
    _setTrialOptStatus("orphanObs", "done");
    _updateTrialOptCard("orphanObs", html, orphans.length === 0);
  } catch (err) {
    console.error("scanOrphanObsPhotos error:", err);
    _setTrialOptStatus("orphanObs", "error");
    _updateTrialOptCard("orphanObs", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Scan failed: ${escapeHtml(err.message || "Unknown error")}</span></div>`, true);
  }
}

async function deleteOrphanObsPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) { showToast("No trial selected", "error"); return; }
  const orphans = (_getTrialOptCache(trialId)._orphanObsList || []).slice();
  if (orphans.length === 0) { showToast("No orphans to delete — try refreshing the scan first", "info"); return; }

  _updateTrialOptCard("orphanObs", `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Queuing deletion of ${orphans.length} orphaned photos…</span></div>`, true);

  enqueueSync({
    label: `Delete ${orphans.length} orphaned obs photos`,
    run: async () => {
      let deleted = 0;
      for (const p of orphans) {
        try {
          await deleteDriveFileById(p.id);
          deleted++;
        } catch (e) {
          console.warn(`Failed to delete orphan ${p.name}:`, e);
        }
      }
      _getTrialOptCache(trialId)._orphanObsList = [];
      const html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>${deleted} orphaned photo${deleted !== 1 ? "s" : ""} deleted</span></div>`;
      _setTrialOptStatus("orphanObs", "done");
      _updateTrialOptCard("orphanObs", html, true);
      showToast(`Deleted ${deleted} orphaned observation photos`, "success");
    },
  });
}

async function scanOrphanAgroPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _setTrialOptStatus("orphanAgro", "scanning");

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFolder = await findFolder(trialId, rootFolderId);
    if (!trialFolder) { _setTrialOptStatus("orphanAgro", "done"); _updateTrialOptCard("orphanAgro", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No trial folder found</span></div>`, true); return; }

    const agroPhotosFolder = await findFolder("agronomy-photos", trialFolder.id);
    if (!agroPhotosFolder) { _setTrialOptStatus("orphanAgro", "done"); _updateTrialOptCard("orphanAgro", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No agronomy-photos folder</span></div>`, true); return; }

    const drivePhotos = await _listDrivePhotos(agroPhotosFolder.id);
    if (drivePhotos.length === 0) { _setTrialOptStatus("orphanAgro", "done"); _updateTrialOptCard("orphanAgro", `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>Agronomy photos folder is empty</span></div>`, true); return; }

    const { agroFiles } = await _getTrialResponseFilesForTrial(trialId);
    const authFiles = _filterAuthoritativeFiles(agroFiles, /^\d+~agronomy\.json$/);
    const { ids: referencedIds, errors: readErrors } = await _getReferencedPhotoFileIds(authFiles);

    const orphans = drivePhotos.filter(p => !referencedIds.has(p.id));
    _getTrialOptCache(trialId)._orphanAgroList = orphans;

    let html;
    const errNote = readErrors > 0 ? ` (${readErrors} file${readErrors !== 1 ? "s" : ""} failed to read)` : "";
    if (orphans.length === 0) {
      html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>No orphaned photos — ${drivePhotos.length} file${drivePhotos.length !== 1 ? "s" : ""} all referenced (${referencedIds.size} refs in ${authFiles.length} JSON${authFiles.length !== 1 ? "s" : ""})${errNote}</span></div>`;
    } else {
      html = `<div class="optimization-file-count optimization-file-count--warn"><span class="material-symbols-rounded">hide_image</span><span>${orphans.length} orphaned photo${orphans.length !== 1 ? "s" : ""} of ${drivePhotos.length} total (${referencedIds.size} refs in ${authFiles.length} JSON${authFiles.length !== 1 ? "s" : ""})${errNote}</span></div>`
        + _renderOrphanList(orphans);
    }
    _setTrialOptStatus("orphanAgro", "done");
    _updateTrialOptCard("orphanAgro", html, orphans.length === 0);
  } catch (err) {
    console.error("scanOrphanAgroPhotos error:", err);
    _setTrialOptStatus("orphanAgro", "error");
    _updateTrialOptCard("orphanAgro", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Scan failed: ${escapeHtml(err.message || "Unknown error")}</span></div>`, true);
  }
}

async function deleteOrphanAgroPhotos() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) { showToast("No trial selected", "error"); return; }
  const orphans = (_getTrialOptCache(trialId)._orphanAgroList || []).slice();
  if (orphans.length === 0) { showToast("No orphans to delete — try refreshing the scan first", "info"); return; }

  _updateTrialOptCard("orphanAgro", `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Queuing deletion of ${orphans.length} orphaned photos…</span></div>`, true);

  enqueueSync({
    label: `Delete ${orphans.length} orphaned agro photos`,
    run: async () => {
      let deleted = 0;
      for (const p of orphans) {
        try {
          await deleteDriveFileById(p.id);
          deleted++;
        } catch (e) {
          console.warn(`Failed to delete orphan ${p.name}:`, e);
        }
      }
      _getTrialOptCache(trialId)._orphanAgroList = [];
      const html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>${deleted} orphaned photo${deleted !== 1 ? "s" : ""} deleted</span></div>`;
      _setTrialOptStatus("orphanAgro", "done");
      _updateTrialOptCard("orphanAgro", html, true);
      showToast(`Deleted ${deleted} orphaned agronomy photos`, "success");
    },
  });
}

// ── File Structure (Per-Rep) — per-trial ──

async function scanTrialStructure() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _setTrialOptStatus("structure", "scanning");

  try {
    const { obsFiles } = await _getTrialResponseFilesForTrial(trialId);
    const consolidatedFiles = obsFiles.filter(f => f.fileName.match(/^\d+~responses\.json$/));
    let perSampleKeys = 0, totalKeys = 0;

    for (const f of consolidatedFiles) {
      try {
        const data = await getFileContent(f.fileId);
        if (!data || typeof data !== "object") continue;
        for (const paramId of Object.keys(data)) {
          const paramData = data[paramId];
          if (!paramData || typeof paramData !== "object") continue;
          for (const key of Object.keys(paramData)) {
            totalKeys++;
            const parts = key.split("_");
            if (parts.length >= 3) {
              const potentialSample = Number(parts[parts.length - 1]);
              if (!isNaN(potentialSample) && potentialSample >= 0) perSampleKeys++;
            }
          }
        }
      } catch (_) {}
    }

    const html = perSampleKeys === 0
      ? `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>All ${totalKeys} keys are per-rep — already optimized</span></div>`
      : `<div class="optimization-file-count optimization-file-count--warn"><span class="material-symbols-rounded">account_tree</span><span>${perSampleKeys} per-sample keys found (of ${totalKeys} total)</span></div>`;
    _setTrialOptStatus("structure", "done");
    _updateTrialOptCard("structure", html, perSampleKeys === 0);
  } catch (err) {
    _setTrialOptStatus("structure", "error");
    _updateTrialOptCard("structure", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Scan failed</span></div>`, true);
  }
}

async function optimizeTrialStructure() {
  const trialId = _trialOptState.selectedTrialId;
  if (!trialId) return;
  _updateTrialOptCard("structure", `<div class="optimization-file-count"><span class="material-symbols-rounded spin-slow">progress_activity</span><span>Consolidating…</span></div>`, true);

  try {
    const { obsFiles } = await _getTrialResponseFilesForTrial(trialId);
    const consolidatedFiles = obsFiles.filter(f => f.fileName.match(/^\d+~responses\.json$/));
    let totalMerged = 0;

    for (const f of consolidatedFiles) {
      let data;
      try { data = await getFileContent(f.fileId); } catch (_) { continue; }
      if (!data || typeof data !== "object") continue;

      let fileMerged = 0;
      for (const paramId of Object.keys(data)) {
        const paramData = data[paramId];
        if (!paramData || typeof paramData !== "object") continue;

        const mergedKeys = {};
        const keysToDelete = [];

        for (const key of Object.keys(paramData)) {
          const parts = key.split("_");
          if (parts.length < 3) continue;
          const potentialSample = Number(parts[parts.length - 1]);
          if (isNaN(potentialSample) || potentialSample < 0) continue;

          const repKey = parts.slice(0, -1).join("_");
          if (!mergedKeys[repKey]) {
            mergedKeys[repKey] = paramData[repKey] || { value: "", photos: [], timestamp: "" };
          }

          const sampleData = paramData[key];
          if (sampleData.value && (!mergedKeys[repKey].value || sampleData.timestamp > (mergedKeys[repKey].timestamp || ""))) {
            mergedKeys[repKey].value = sampleData.value;
          }
          if (Array.isArray(sampleData.photos) && sampleData.photos.length > 0) {
            mergedKeys[repKey].photos = [...(mergedKeys[repKey].photos || []), ...sampleData.photos];
          }
          if (sampleData.timestamp && sampleData.timestamp > (mergedKeys[repKey].timestamp || "")) {
            mergedKeys[repKey].timestamp = sampleData.timestamp;
          }
          keysToDelete.push(key);
          fileMerged++;
        }

        for (const repKey of Object.keys(mergedKeys)) paramData[repKey] = mergedKeys[repKey];
        for (const key of keysToDelete) { if (!mergedKeys[key]) delete paramData[key]; }
      }

      if (fileMerged > 0) {
        await _reuploadJsonFile(f.fileId, f.fileName, data);
        totalMerged += fileMerged;
      }
    }

    const html = `<div class="optimization-file-count optimization-file-count--ok"><span class="material-symbols-rounded">check_circle</span><span>${totalMerged} per-sample keys merged to per-rep</span></div>`;
    _setTrialOptStatus("structure", "done");
    _updateTrialOptCard("structure", html, true);
    showToast(`Structure optimization: ${totalMerged} keys consolidated`, "success");
  } catch (err) {
    _setTrialOptStatus("structure", "error");
    _updateTrialOptCard("structure", `<div class="optimization-file-count optimization-file-count--error"><span class="material-symbols-rounded">error</span><span>Optimization failed</span></div>`, false);
  }
}

// ── Shared helpers ──

function _countInlinePhotos(data) {
  let count = 0;
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if (Array.isArray(val.photos)) {
        count += val.photos.filter(p => typeof p === "string" && p.startsWith("data:")).length;
      } else {
        count += _countInlinePhotos(val);
      }
    }
  }
  return count;
}

async function _extractInlinePhotos(data, photosFolderId) {
  let converted = 0;
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if (Array.isArray(val.photos)) {
        for (let i = 0; i < val.photos.length; i++) {
          const photo = val.photos[i];
          if (typeof photo === "string" && photo.startsWith("data:")) {
            try {
              const { blob, width, height } = await compressPhotoToWebP(photo);
              const photoId = crypto.randomUUID();
              const fileName = `${photoId}.webp`;
              const fileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");
              val.photos[i] = {
                photoId,
                fileId,
                width,
                height,
                timestamp: val.timestamp || new Date().toISOString(),
              };
              converted++;
            } catch (e) {
              console.warn("Failed to convert photo:", e);
            }
          }
        }
      } else {
        converted += await _extractInlinePhotos(val, photosFolderId);
      }
    }
  }
  return converted;
}

async function _reuploadJsonFile(fileId, fileName, data) {
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";
  const metadata = { name: fileName, mimeType: "application/json" };
  const body = delimiter + "Content-Type: application/json\r\n\r\n" + JSON.stringify(metadata) +
    delimiter + "Content-Type: application/json\r\n\r\n" + JSON.stringify(data, null, 2) + closeDelimiter;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`,
    method: "PATCH",
    params: { uploadType: "multipart" },
    headers: { "Content-Type": 'multipart/related; boundary="' + boundary + '"' },
    body,
  });
}

function updateStoredAnalysisUserSettings(patch = {}, options = {}) {
  const { closeMenu = false } = options;

  userSettingsState.data = normalizeUserSettings({
    ...userSettingsState.data,
    analysis: {
      ...(userSettingsState.data?.analysis || {}),
      ...patch,
    },
  });

  if (typeof applyAnalysisUserSettings === "function") {
    applyAnalysisUserSettings(userSettingsState.data.analysis);
  }

  saveUserSettingsLocalCache();
  enqueueUserSettingsSync();

  const modal = document.getElementById("userSettingsModal");
  if (modal?.classList.contains("active")) {
    renderUserSettingsAnalysisTab();
  }

  if (closeMenu && typeof closeUserSettingsModal === "function") {
    closeUserSettingsModal();
  }
}

function openUserSettingsModal(activeTab = null) {
  const modal = document.getElementById("userSettingsModal");
  const dropdown = document.getElementById("userDropdown");
  const trigger = document.getElementById("userMenuTrigger");
  if (!modal) return;

  if (dropdown) dropdown.classList.remove("active");
  if (trigger) trigger.classList.remove("active");

  const firstNavTab = document.querySelector(".user-settings-nav .user-settings-nav-item")?.dataset.settingsTab;
  const targetTab = activeTab || firstNavTab || "analysis";

  renderUserSettingsAppearanceTab();
  renderUserSettingsAnalysisTab();
  renderUserSettingsNotificationsTab();
  switchUserSettingsTab(targetTab);
  modal.classList.remove("hidden");
  modal.classList.add("active");
  lockBodyScroll();
}

function closeUserSettingsModal() {
  const modal = document.getElementById("userSettingsModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.classList.add("hidden");
  unlockBodyScroll();
}

async function saveUserSettingsFromModal() {
  const analysisCheckboxes = Array.from(
    document.querySelectorAll("#analysisSettingsColumnsList .analysis-settings-col-checkbox"),
  );

  const selectedAnalysisKeys = analysisCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => String(checkbox.dataset.colKey || ""))
    .filter(Boolean);

  if (analysisCheckboxes.length > 0 && selectedAnalysisKeys.length === 0) {
    showToast("At least one Analysis column must be visible", "warning");
    return;
  }

  const checkedLayout = document.querySelector('input[name="userSettingsAnalysisLayout"]:checked')?.value;
  const checkedFocus = document.querySelector('input[name="userSettingsAnalysisFocus"]:checked')?.value;
  const pathDiagramDefaultsContainer = document.getElementById("userSettingsPathDiagramDefaultsUi");

  const sectionLayout = checkedLayout === "vertical" ? "vertical" : "horizontal";
  const sectionFocus = ["balanced", "focus-results", "focus-settings", "focus-dataset"]
    .includes(checkedFocus)
    ? checkedFocus
    : "balanced";

  let parsedPathDiagramDefaults = userSettingsState.data?.analysis?.pathDiagramDefaults || {};
  if (
    pathDiagramDefaultsContainer
    && typeof window.collectPathDiagramOptionsFromContainer === "function"
    && typeof window.sanitizePathDiagramOptions === "function"
  ) {
    parsedPathDiagramDefaults = window.sanitizePathDiagramOptions(
      window.collectPathDiagramOptionsFromContainer(pathDiagramDefaultsContainer, parsedPathDiagramDefaults),
    );
  }

  const ggeBiplotDefaultsContainer = document.getElementById("userSettingsGgeBiplotDefaultsUi");
  let parsedGgeBiplotDefaults = userSettingsState.data?.analysis?.ggeBiplotDefaults || {};
  if (
    ggeBiplotDefaultsContainer
    && typeof window.collectGgeBiplotOptionsFromContainer === "function"
    && typeof window.sanitizeGgeBiplotOptions === "function"
  ) {
    parsedGgeBiplotDefaults = window.sanitizeGgeBiplotOptions(
      window.collectGgeBiplotOptionsFromContainer(ggeBiplotDefaultsContainer, parsedGgeBiplotDefaults),
    );
  }

  const selectedInventoryGlobalView = document.querySelector(
    'input[name="userSettingsInventoryGlobalView"]:checked',
  )?.value;
  const inventoryViewMode = selectedInventoryGlobalView === "list" ? "list" : "grid";

  const readCategoryInventoryView = (inputName) => {
    const value = document.querySelector(`input[name="${inputName}"]:checked`)?.value;
    if (value === "grid" || value === "list") return value;
    return "default";
  };

  const inventoryCategoryViews = {
    reminders: readCategoryInventoryView("userSettingsViewReminders"),
    crops: readCategoryInventoryView("userSettingsInventoryViewCrops"),
    locations: readCategoryInventoryView("userSettingsInventoryViewLocations"),
    parameters: readCategoryInventoryView("userSettingsInventoryViewParameters"),
    agronomy: readCategoryInventoryView("userSettingsInventoryViewAgronomy"),
  };

  userSettingsState.data = normalizeUserSettings({
    ...userSettingsState.data,
    appearance: {
      ...(userSettingsState.data?.appearance || {}),
      inventoryViewMode,
      inventoryCategoryViews,
    },
    analysis: {
      ...(userSettingsState.data?.analysis || {}),
      visibleColumns: selectedAnalysisKeys,
      sectionLayout,
      sectionFocus,
      pathDiagramDefaults: parsedPathDiagramDefaults,
      ggeBiplotDefaults: parsedGgeBiplotDefaults,
    },
    notifications: _collectNotificationSettings(),
  });

  if (typeof applyAnalysisUserSettings === "function") {
    applyAnalysisUserSettings(userSettingsState.data.analysis);
  }
  if (typeof applyInventoryUserSettings === "function") {
    applyInventoryUserSettings(userSettingsState.data.appearance || {});
  }
  if (typeof renderObservationReminders === "function") renderObservationReminders();
  if (typeof renderAgronomyReminders === "function") renderAgronomyReminders();

  saveUserSettingsLocalCache();
  enqueueUserSettingsSync();
  closeUserSettingsModal();
  showToast("User settings saved", "success");
}

// Show/hide loading spinner
function showLoading(show) {
  const spinner = document.getElementById("loadingSpinner");
  if (show) {
    spinner.classList.add("active");
    setLoadingProgress(0, "Loading...");
  } else {
    spinner.classList.remove("active");
  }
}

function setLoadingProgress(percent, message) {
  const bar = document.getElementById("loadingProgressBar");
  const text = document.getElementById("loadingProgressText");
  const pct = document.getElementById("loadingProgressPercent");
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

  if (bar) bar.style.width = `${safePercent}%`;
  if (text && message) text.textContent = message;
  if (pct) pct.textContent = `${safePercent}%`;
}

// Show success message
function showSuccessMessage(message) {
  console.log("Success:", message);
  // You can add a toast notification here in the future
}

// Show error message
function showErrorMessage(message) {
  console.error("Error:", message);
  showAlert(message, "error");
}

// Show generic alert modal
function showAlert(message, type = "info", title = null) {
  const modal = document.getElementById("alertModal");
  const titleEl = document.getElementById("alertModalTitle");
  const msgEl = document.getElementById("alertModalMessage");
  const btnEl = document.getElementById("alertModalBtn");
  const iconEl = document.getElementById("alertModalIcon");
  const headerEl = document.getElementById("alertModalHeader");
  
  if (!modal) return;
  
  // Set title
  if (title) {
    titleEl.textContent = title;
  } else {
    titleEl.textContent = type === "error" ? "Error" : type === "success" ? "Success" : "Message";
  }
  
  // Set message
  msgEl.textContent = message;
  
  // Set icon and styling
  headerEl.style.background = 
    type === "error" ? "var(--danger-soft)" :
    type === "success" ? "var(--success-soft)" :
    type === "warning" ? "var(--warning-soft)" :
    "var(--info-soft)";
  
  iconEl.style.color =
    type === "error" ? "var(--danger)" :
    type === "success" ? "var(--success)" :
    type === "warning" ? "var(--warning)" :
    "var(--info)";
  
  iconEl.textContent =
    type === "error" ? "error" :
    type === "success" ? "check_circle" :
    type === "warning" ? "warning" :
    "info";
  
  // Close previous listeners and add new one
  const oldBtn = btnEl.cloneNode(true);
  btnEl.parentNode.replaceChild(oldBtn, btnEl);
  oldBtn.addEventListener("click", () => {
    modal.classList.remove("active");
    unlockBodyScroll();
  });
  
  // Show modal
  modal.classList.add("active");
  lockBodyScroll();
}

// ===========================
// Sync Queue Manager
// ===========================
const syncState = {
  status: "synced",
  queue: [],
  processing: false,
  lastError: null,
};

function enqueueSync(task) {
  // Deduplication: if a pending task with the same fileKey exists, update it in-place
  // so we don't upload the same file multiple times when navigating quickly
  if (task.fileKey) {
    const existing = syncState.queue.find(
      (item) => item.status === "pending" && item.fileKey === task.fileKey
    );
    if (existing) {
      existing.run = task.run;
      existing.label = task.label;
      existing.createdAt = new Date().toISOString();
      updateSyncUI();
      return;
    }
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    label: task.label,
    fileKey: task.fileKey || null,
    run: task.run,
    status: "pending",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    error: null,
  };

  syncState.queue.push(entry);
  updateSyncUI();
  processSyncQueue();
}

async function processSyncQueue() {
  if (syncState.processing) return;
  syncState.processing = true;

  while (syncState.queue.some((item) => item.status === "pending")) {
    const next = syncState.queue.find((item) => item.status === "pending");
    if (!next) break;

    next.status = "syncing";
    next.startedAt = Date.now();
    syncState.status = "syncing";
    updateSyncUI();

    try {
      await next.run();
      next.status = "success";
      next.finishedAt = Date.now();
      next.durationMs =
        typeof next.startedAt === "number"
          ? Math.max(0, next.finishedAt - next.startedAt)
          : null;
      next.error = null;
      syncState.lastError = null;
    } catch (error) {
      next.status = "error";
      next.finishedAt = Date.now();
      next.durationMs =
        typeof next.startedAt === "number"
          ? Math.max(0, next.finishedAt - next.startedAt)
          : null;
      next.error = error?.message || "Unknown error";
      syncState.lastError = next.error;
      syncState.status = "error";

      if (typeof handleAuthExpiredError === "function") {
        const handled = handleAuthExpiredError(error, "Sync session expired");
        if (handled) {
          updateSyncUI();
          break;
        }
      }

      // Check if it's an authentication error
      if (error?.message?.includes("401") || error?.message?.includes("unauthorized") || error?.message?.includes("Invalid Credentials")) {
        next.error = next.error + " - [Requires re-login]";
        // Show alert with login option
        showSyncErrorAlert(next.error, error);
      }

      updateSyncUI();
      continue;
    }

    updateSyncUI();
  }

  const hasError = syncState.queue.some((item) => item.status === "error");
  const hasPending = syncState.queue.some(
    (item) => item.status === "pending" || item.status === "syncing",
  );

  if (hasPending) {
    syncState.status = "syncing";
  } else if (hasError) {
    syncState.status = "error";
  } else {
    syncState.status = "synced";
  }

  syncState.processing = false;
  updateSyncUI();
}

function updateSyncUI() {
  const btn = document.getElementById("syncStatusBtn");
  const badge = document.getElementById("syncQueueCount");
  const panel = document.getElementById("syncQueueList");
  const iconSpan = btn?.querySelector(".material-symbols-rounded");

  if (btn && badge && iconSpan) {
    btn.classList.remove("syncing", "error", "synced");
    if (syncState.status === "syncing") {
      btn.classList.add("syncing");
      iconSpan.textContent = "cached";
      btn.setAttribute("aria-label", "Syncing...");
      btn.setAttribute("title", "Syncing...");
    } else if (syncState.status === "error") {
      btn.classList.add("error");
      iconSpan.textContent = "error";
      btn.setAttribute("aria-label", "Sync error");
      btn.setAttribute("title", "Sync error - Click to retry or re-login");
    } else {
      btn.classList.add("synced");
      iconSpan.textContent = "check_circle";
      btn.setAttribute("aria-label", "All synced");
      btn.setAttribute("title", "All synced");
    }

    const pendingCount = syncState.queue.filter(
      (item) => item.status === "pending" || item.status === "syncing",
    ).length;
    badge.textContent = String(pendingCount);
    badge.classList.toggle("hidden", pendingCount <= 0);
  }

  if (panel) {
    if (syncState.queue.length === 0) {
      panel.innerHTML =
        '<div class="sync-item"><span>No sync activity yet</span><span class="sync-item-status">Idle</span></div>';
      return;
    }

    panel.innerHTML = [...syncState.queue]
      .reverse()
      .map((item) => {
        const statusClass =
          item.status === "success"
            ? "success"
            : item.status === "error"
              ? "error"
              : item.status === "syncing"
                ? "syncing"
                : "pending";
        const statusLabel =
          item.status === "success"
            ? `<span class="material-symbols-rounded" style="color:var(--success)">check_circle</span>`
            : item.status === "error"
              ? `<span class="material-symbols-rounded" style="color:var(--danger)">error</span>`
              : item.status === "syncing"
                ? `<span class="spinner-sm"></span>`
                : `<span class="material-symbols-rounded" style="color:var(--text-tertiary)">schedule</span>`;
        const errorHint =
          item.status === "error" && item.error ? ` - ${item.error}` : "";
        const syncDurationHint =
          item.status === "success" && typeof item.durationMs === "number"
            ? ` <span class="sync-item-duration">(${(item.durationMs / 1000).toFixed(2)}s)</span>`
            : "";
        return `
                    <div class="sync-item">
                      <span class="sync-item-status ${statusClass}">${statusLabel}</span>
                      <span>${item.label}${syncDurationHint}${errorHint}</span>
                    </div>
                `;
      })
      .join("");
  }
}

let _syncUISetUp = false;
function setupSyncUI() {
  if (_syncUISetUp) return;
  _syncUISetUp = true;
  const btn = document.getElementById("syncStatusBtn");
  const panel = document.getElementById("syncPanel");
  const closeBtn = document.getElementById("syncPanelClose");

  if (btn && panel) {
    btn.addEventListener("click", () => {
      panel.classList.toggle("active");
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.classList.remove("active");
    });
  }

  updateSyncUI();
}

window.addEventListener("beforeunload", (event) => {
  const hasPending = syncState.queue.some(
    (item) => item.status === "pending" || item.status === "syncing",
  );
  if (hasPending) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function isRunTrialVisible() {
  const interfaceEl = document.getElementById("runTrialInterface");
  return (
    document.body.classList.contains("run-trial-active") ||
    (interfaceEl && !interfaceEl.classList.contains("hidden"))
  );
}

// Show specific view
function showView(viewName) {
  // Hide all views
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("active");
  });

  // Show selected view
  if (viewName === "login") {
    document.getElementById("loginView").classList.add("active");
    clearNavActiveState();
  } else if (viewName === "app") {
    document.getElementById("appView").classList.add("active");
    const activePage = document.querySelector(".page-content.active");
    const activePageName =
      activePage?.id === "inventoryContent"
        ? "inventory"
        : activePage?.id === "trialContent"
          ? "trial"
          : activePage?.id === "libraryContent"
            ? "library"
            : "dashboard";
    syncNavActiveState(activePageName);
  }
}

// Switch page content
function switchPage(pageName, options = {}) {
  const trialEditor = document.getElementById("trialEditor");
  const isTrialEditorOpen = Boolean(trialEditor?.classList.contains("active"));

  if (!options.skipTrialConfirm && isTrialEditorOpen) {
    const requestClose = typeof requestCloseTrialEditor === "function"
      ? requestCloseTrialEditor
      : (callback) => {
          if (typeof closeTrialModal === "function") closeTrialModal();
          if (typeof callback === "function") callback();
        };

    requestClose(() => switchPage(pageName, { ...options, skipTrialConfirm: true }));
    return;
  }

  if (pageName !== "analysis") {
    if (typeof exitAnalysisFullscreenMode === "function") exitAnalysisFullscreenMode();
  }

  // Hide all page contents
  document.querySelectorAll(".page-content").forEach((content) => {
    content.classList.remove("active");
  });

  // Show selected page
  const pageMap = {
    dashboard: "dashboardContent",
    inventory: "inventoryContent",
    trial: "trialContent",
    analysis: "analysisContent",
    library: "libraryContent",
    reminder: "reminderContent",
  };

  if (pageMap[pageName]) {
    document.getElementById(pageMap[pageName]).classList.add("active");
  }

  // Update page title
  const titleMap = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    trial: "Trial",
    analysis: "Data Analysis",
    library: "Library",
    reminder: "Reminder",
  };

  if (titleMap[pageName]) {
    document.getElementById("pageTitle").textContent = titleMap[pageName];
  }

  syncNavActiveState(pageName);

  if (pageName === "analysis") {
    if (typeof enterAnalysisFullscreenMode === "function") enterAnalysisFullscreenMode();
    if (typeof initAnalysis === "function") initAnalysis();
  }

  if (pageName === "library") {
    if (typeof ensureLibrarySectionLoaded === "function") {
      ensureLibrarySectionLoaded();
    } else if (typeof lazyLoadLibraryFromDrive === "function") {
      lazyLoadLibraryFromDrive();
    }
  }
}

// Helper function to navigate to a view
function navigateToView(item) {
  const view = item.dataset.view;
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (view === "external") {
    const href = (item.getAttribute("href") || "").trim();
    const dataUrl = (item.dataset.url || "").trim();
    const targetUrl = dataUrl || href;

    if (targetUrl && targetUrl !== "#") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }

    closeMobileSidebar();
    return;
  }

  if (item.classList.contains("nav-parent")) {
    const group = item.closest(".nav-group");
    if (group) group.classList.remove("collapsed");
    item.setAttribute("aria-expanded", "true");
  }

  // Remove active from all nav items
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");

  switchPage(view);

  // Auto-select first subitem if has submenu
  if (view === "inventory") {
    const firstSub = document.querySelector(
      '.nav-subitem[data-parent="inventory"]',
    );
    if (firstSub) {
      // clear subitem active across all parents then activate first
      document.querySelectorAll('.nav-subitem').forEach((s) => s.classList.remove('active'));
      const category = firstSub.dataset.category;
      firstSub.classList.add('active');
      switchCategory(category);
      syncInventoryNavState(category);
    }
  } else if (view === "trial") {
    // Unified trial view - just render trials (no subnav)
    if (typeof renderTrials === "function") renderTrials();
    if (typeof initializeRunTrial === "function") initializeRunTrial();
  } else if (view === "reminder") {
    const firstSub = document.querySelector(
      '.nav-subitem[data-parent="reminder"]',
    );
    if (firstSub) {
      // clear subitem active across all parents then activate first
      document.querySelectorAll('.nav-subitem').forEach((s) => s.classList.remove('active'));
      firstSub.classList.add('active');
      const tab = firstSub.dataset.reminderTab;
      switchReminderTab(tab);
    }
  } else if (view === "library") {
    const firstSub = document.querySelector(
      '.nav-subitem[data-parent="library"]',
    );
    if (firstSub) {
      document.querySelectorAll('.nav-subitem').forEach((s) => s.classList.remove('active'));
      firstSub.classList.add('active');
      const section = firstSub.dataset.librarySection || "files";
      if (typeof switchLibrarySection === "function") {
        switchLibrarySection(section);
      }
      syncLibraryNavState(section);
    }
  }

  // Close mobile sidebar after navigation
  closeMobileSidebar();
}

// Helper function to navigate to a sub-view
function navigateToSubView(item) {
  const parent = item.dataset.parent;
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const group = item.closest(".nav-group");
  if (group) group.classList.remove("collapsed");

  // Remove active from all nav subitems (across parents)
  document.querySelectorAll(`.nav-subitem`).forEach((sub) =>
    sub.classList.remove("active"),
  );
  item.classList.add("active");

  if (parent === "inventory") {
    const category = item.dataset.category;
    switchPage("inventory");
    switchCategory(category);
    syncInventoryNavState(category);
  }

  if (parent === "trial") {
    const tab = item.dataset.trialTab;
    switchPage("trial");
    switchTrialTab(tab);
  }

  if (parent === "reminder") {
    const tab = item.dataset.reminderTab;
    switchPage("reminder");
    switchReminderTab(tab);
  }

  if (parent === "library") {
    const section = item.dataset.librarySection || "files";
    switchPage("library");
    if (typeof switchLibrarySection === "function") {
      switchLibrarySection(section);
    }
    syncLibraryNavState(section);
  }

  closeMobileSidebar();
}

// Show exit run trial confirmation modal
function showExitRunTrialConfirmation(onConfirm) {
  const modal = document.getElementById("exitRunTrialModal");
  if (modal) {
    modal.classList.add("active");
    lockBodyScroll();
    window.pendingNavigation = onConfirm;
  }
}

function clearNavActiveState() {
  document
    .querySelectorAll(
      ".nav-item, .nav-subitem",
    )
    .forEach((item) => item.classList.remove("active"));
}

function syncNavActiveState(pageName) {
  // Clear subitem active states globally first
  document.querySelectorAll('.nav-subitem').forEach((it) => it.classList.remove('active'));
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === pageName);
  });

  if (pageName === "inventory") {
    const category = inventoryState?.currentCategory || "crops";
    syncInventoryNavState(category);
    return;
  }

  if (pageName === "trial") {
    // Unified trial view - no subitems to sync
    return;
  }

  if (pageName === "reminder") {
    const activeReminderTab =
      document.querySelector('.nav-subitem[data-parent="reminder"].active')?.dataset.reminderTab ||
      "observation";
    syncReminderNavState(activeReminderTab);
    return;
  }

  if (pageName === "library") {
    const activeSection = (typeof libraryState !== "undefined" && libraryState?.section)
      ? libraryState.section
      : "files";
    syncLibraryNavState(activeSection);
    return;
  }

  document
    .querySelectorAll(".nav-subitem")
    .forEach((item) => item.classList.remove("active"));
}

function syncInventoryNavState(category) {
  document
    .querySelectorAll('.nav-subitem[data-parent="inventory"]')
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.category === category);
    });
  document
    .querySelectorAll('.nav-subitem[data-parent="trial"]')
    .forEach((item) => item.classList.remove("active"));
  // also clear reminder subitems
  document
    .querySelectorAll('.nav-subitem[data-parent="reminder"]')
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll('.nav-subitem[data-parent="library"]')
    .forEach((item) => item.classList.remove("active"));
}

function syncReminderNavState(tabName) {
  document
    .querySelectorAll('.nav-subitem[data-parent="reminder"]')
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.reminderTab === tabName);
    });
  // Clear other parents' subitems
  document
    .querySelectorAll('.nav-subitem[data-parent="inventory"]')
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll('.nav-subitem[data-parent="trial"]')
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll('.nav-subitem[data-parent="library"]')
    .forEach((item) => item.classList.remove("active"));
}

function syncLibraryNavState(sectionName) {
  document
    .querySelectorAll('.nav-subitem[data-parent="library"]')
    .forEach((item) => {
      item.classList.toggle("active", item.dataset.librarySection === sectionName);
    });
  document
    .querySelectorAll('.nav-subitem[data-parent="inventory"]')
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll('.nav-subitem[data-parent="trial"]')
    .forEach((item) => item.classList.remove("active"));
  document
    .querySelectorAll('.nav-subitem[data-parent="reminder"]')
    .forEach((item) => item.classList.remove("active"));
}

// Initialize app
async function initializeApp() {
  const isGuest = getCurrentUser()?.isGuest;

  try {
    showLoading(true);
    setLoadingProgress(5, "Preparing your workspace...");

    // Ask browser to keep app storage persistent (reduces eviction risk on large datasets).
    requestPersistentStorage().catch(() => {});

    // Update user info
    const user = getCurrentUser();
    if (user) {
      const initials = user.name
        .split(" ")
        .map((n) => n.charAt(0))
        .join("")
        .toUpperCase();

      // Update topbar user
      const userNameEl = document.getElementById("userName");
      const userEmailEl = document.getElementById("userEmail");
      const userAvatar = document.getElementById("userAvatar");
      if (userNameEl) userNameEl.textContent = user.name;
      if (userEmailEl) userEmailEl.textContent = user.isGuest ? "Local data only" : (user.email || "");
      if (userAvatar) {
        if (user.picture) {
          userAvatar.style.backgroundImage = `url('${user.picture}')`;
          userAvatar.textContent = "";
          userAvatar.classList.add("has-image");
        } else {
          userAvatar.style.backgroundImage = "";
          userAvatar.textContent = initials;
          userAvatar.classList.remove("has-image");
        }
      }

      // Update user dropdown in topbar
      const userDropdownName = document.getElementById("userDropdownName");
      const userDropdownEmail = document.getElementById("userDropdownEmail");

      if (userDropdownName) userDropdownName.textContent = user.name;
      if (userDropdownEmail) userDropdownEmail.textContent = user.isGuest ? "Guest · Local data only" : user.email;
    }

    // Initialize Drive structure (skip for guest)
    if (!isGuest) {
      setLoadingProgress(12, "Preparing...");
      await initializeDriveStructure();
    }

    // Initialize Trials FIRST (silent background loading)
    setLoadingProgress(20, "Loading cached data...");
    initializeTrials({
      onProgress: (p, msg) => {
        // Silent background sync - no UI updates
      },
    });

    // Initialize Inventory (silent background loading)
    setLoadingProgress(40, "Loading cached data...");
    initializeInventory({
      onProgress: (p, msg) => {
        // Silent background sync - no UI updates
      },
    });

    // Initialize Library (silent background loading, skip for guest)
    if (!isGuest) {
      setLoadingProgress(80, "Loading cached data...");
      initializeLibrary({
        onProgress: (p, msg) => {
          // Silent background sync - no UI updates
        },
      });
    }

    // Load user settings last
    setLoadingProgress(92, "Loading user settings...");
    await loadUserSettingsForCurrentUser({ preferRemote: !isGuest, silent: true });

    // Setup event listeners
    setupEventListeners();
    setupDataTransferEvents();
    setupSyncUI();
    setupAuthorityEvents();

    // Hide sync button for guests
    const syncBtn = document.getElementById("syncStatusBtn");
    if (syncBtn) syncBtn.classList.toggle("hidden", !!isGuest);
    
    const loadDataBtn = document.getElementById("loadDataBtn");
    if (loadDataBtn) loadDataBtn.classList.toggle("hidden", !!isGuest);

    if (!isGuest) {
      // Periodic update signal for already-loaded trial data.
      setInterval(() => {
        checkLoadedTrialUpdates({ silent: true }).catch(() => {});
      }, 10 * 60 * 1000);
    }

    setLoadingProgress(100, "Ready");
    showView("app");
    showLoading(false);
    
    // Ensure nav state is synced to dashboard (clear any leftover subitem active states from initialization)
    syncNavActiveState("dashboard");
    
    console.log("App initialized successfully");
  } catch (error) {
    console.error("Error initializing app:", error);

    if (typeof handleAuthExpiredError === "function") {
      const handled = handleAuthExpiredError(error, "Session expired");
      if (handled) {
        showLoading(false);
        return;
      }
    }

    showLoading(false);
    alert("Error initializing app: " + error.message);
  }
}

// Setup event listeners
let _appEventsSetUp = false;
function setupEventListeners() {
  if (_appEventsSetUp) return;
  _appEventsSetUp = true;
  // Mobile menu toggle
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  function openMobileSidebar() {
    if (!sidebar) return;
    sidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
    lockBodyScroll();
  }

  window.closeMobileSidebar = function closeMobileSidebar() {
    if (!sidebar || !sidebar.classList.contains("open")) return;
    sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
    unlockBodyScroll();
  }

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      if (document.body.classList.contains("run-trial-active")) return;
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) {
        if (sidebar.classList.contains("open")) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      } else {
        document.body.classList.toggle("sidebar-collapsed");
      }
    });
  }

  if (sidebarOverlay && sidebar) {
    sidebarOverlay.addEventListener("click", () => {
      closeMobileSidebar();
    });
  }

  // User dropdown menu
  const userMenuTrigger = document.getElementById("userMenuTrigger");
  const userDropdown = document.getElementById("userDropdown");

  if (userMenuTrigger && userDropdown) {
    userMenuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("active");
      userMenuTrigger.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !userDropdown.contains(e.target) &&
        !userMenuTrigger.contains(e.target)
      ) {
        userDropdown.classList.remove("active");
        userMenuTrigger.classList.remove("active");
      }
    });
  }

  // User logout button (in dropdown)
  const userLogoutBtn = document.getElementById("userLogoutBtn");
  if (userLogoutBtn) {
    userLogoutBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to logout?")) {
        logout();
      }
    });
  }

  const userSettingsBtn = document.getElementById("userSettingsBtn");
  if (userSettingsBtn) {
    userSettingsBtn.addEventListener("click", () => {
      openUserSettingsModal();
    });
  }

  const userSettingsCloseBtn = document.getElementById("userSettingsCloseBtn");
  const userSettingsCancelBtn = document.getElementById("userSettingsCancelBtn");
  const userSettingsSaveBtn = document.getElementById("userSettingsSaveBtn");
  const userSettingsModal = document.getElementById("userSettingsModal");
  const analysisSettingsSelectAllBtn = document.getElementById("analysisSettingsSelectAllBtn");
  const analysisSettingsClearAllBtn = document.getElementById("analysisSettingsClearAllBtn");

  if (userSettingsCloseBtn) {
    userSettingsCloseBtn.addEventListener("click", closeUserSettingsModal);
  }
  if (userSettingsCancelBtn) {
    userSettingsCancelBtn.addEventListener("click", closeUserSettingsModal);
  }
  if (userSettingsSaveBtn) {
    userSettingsSaveBtn.addEventListener("click", () => {
      saveUserSettingsFromModal();
    });
  }
  if (userSettingsModal) {
    userSettingsModal.addEventListener("click", (event) => {
      if (event.target === userSettingsModal) {
        closeUserSettingsModal();
      }
    });
  }

  document.querySelectorAll(".user-settings-nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      switchUserSettingsTab(button.dataset.settingsTab || "analysis");
    });
  });

  if (analysisSettingsSelectAllBtn) {
    analysisSettingsSelectAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll("#analysisSettingsColumnsList .analysis-settings-col-checkbox")
        .forEach((checkbox) => {
          checkbox.checked = true;
        });
    });
  }

  if (analysisSettingsClearAllBtn) {
    analysisSettingsClearAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll("#analysisSettingsColumnsList .analysis-settings-col-checkbox")
        .forEach((checkbox, index) => {
          checkbox.checked = index === 0;
        });
    });
  }

  // Navigation - Main items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Check if in run trial mode
      const isInRunTrialMode = isRunTrialVisible();
      if (isInRunTrialMode) {
        showExitRunTrialConfirmation(() => {
          navigateToView(item);
        });
        return;
      }

      const trialEditor = document.getElementById("trialEditor");
      const isTrialEditorOpen = Boolean(trialEditor && trialEditor.classList.contains("active"));
      if (isTrialEditorOpen && typeof requestCloseTrialEditor === "function") {
        requestCloseTrialEditor(() => {
          navigateToView(item);
        });
        return;
      }
      
      navigateToView(item);
    });
  });

  // Sidebar submenus
  document.querySelectorAll(".nav-subitem").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Check if in run trial mode
      const isInRunTrialMode = isRunTrialVisible();
      if (isInRunTrialMode) {
        showExitRunTrialConfirmation(() => {
          navigateToSubView(item);
        });
        return;
      }

      const trialEditor = document.getElementById("trialEditor");
      const isTrialEditorOpen = Boolean(trialEditor && trialEditor.classList.contains("active"));
      if (isTrialEditorOpen && typeof requestCloseTrialEditor === "function") {
        requestCloseTrialEditor(() => {
          navigateToSubView(item);
        });
        return;
      }
      
      navigateToSubView(item);
    });
  });

  document.querySelectorAll(".nav-caret").forEach((caret) => {
    caret.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const group = caret.closest(".nav-group");
      if (!group) return;
      group.classList.toggle("collapsed");
      const parent = group.querySelector(".nav-parent");
      if (parent) {
        parent.setAttribute(
          "aria-expanded",
          String(!group.classList.contains("collapsed")),
        );
      }
    });
  });

  // Exit Run Trial Modal handlers
  const exitRunTrialModal = document.getElementById("exitRunTrialModal");
  const exitRunTrialCancelBtn = document.getElementById("exitRunTrialCancelBtn");
  const exitRunTrialConfirmBtn = document.getElementById("exitRunTrialConfirmBtn");
  
  if (exitRunTrialCancelBtn) {
    exitRunTrialCancelBtn.addEventListener("click", () => {
      exitRunTrialModal.classList.remove("active");
      unlockBodyScroll();
    });
  }
  
  if (exitRunTrialConfirmBtn) {
    exitRunTrialConfirmBtn.addEventListener("click", async () => {
      exitRunTrialModal.classList.remove("active");
      unlockBodyScroll();
      
      // Auto-save progress before exiting
      if (typeof saveRunTrialProgress === "function") {
        await saveRunTrialProgress();
      }
      
      // Exit run trial mode
      if (typeof exitRunTrial === "function") {
        exitRunTrial();
      }
      
      // Execute pending navigation if any
      if (window.pendingNavigation) {
        window.pendingNavigation();
        window.pendingNavigation = null;
      }
    });
  }

  // Inventory category selection (from header buttons, if any)
  // Note: Direct category switching can be done via navigateToView with inventory subitem

  // Add item button
  document.getElementById("addItemBtn").addEventListener("click", () => {
    openAddModal();
  });

  // Initialize folder system
  if (typeof initFolderSystem === "function") {
    initFolderSystem();
  }

  // Inventory filter controls
  const invFilterCrop = document.getElementById("inventoryFilterCrop");
  const invSortBy = document.getElementById("inventorySortBy");
  if (invFilterCrop) {
    invFilterCrop.addEventListener("change", (e) => {
      inventoryState.filterCrop = e.target.value;
      renderInventoryItems();
    });
  }
  if (invSortBy) {
    invSortBy.addEventListener("change", (e) => {
      inventoryState.sortBy = e.target.value;
      renderInventoryItems();
    });
  }

  // Inventory toolbar dropdown triggers
  const invFilterBtn = document.getElementById("inventoryFilterBtn");
  if (invFilterBtn) {
    invFilterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleToolbarDropdown("inventoryFilterBtn", "inventoryFilterDropdown");
    });
  }
  const invIoBtn = document.getElementById("inventoryIoBtn");
  if (invIoBtn) {
    invIoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleToolbarDropdown("inventoryIoBtn", "inventoryIoDropdown");
    });
  }

  // Trial detail actions dropdown trigger
  const trialActionsBtn = document.getElementById("trialDetailActionsBtn");
  if (trialActionsBtn) {
    trialActionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleToolbarDropdown("trialDetailActionsBtn", "trialDetailActionsDropdown");
    });
  }

  // Add trial button
  const addTrialBtn = document.getElementById("addTrialBtn");
  if (addTrialBtn) {
    addTrialBtn.addEventListener("click", () => {
      openAddTrialModal();
    });
  }

  // Modal controls
  document
    .getElementById("modalCancelBtn")
    .addEventListener("click", closeModal);
  document.getElementById("modalSaveBtn").addEventListener("click", saveItem);

  document.querySelectorAll(".modal-close").forEach((btn) => {
    if (btn.id === "trialModalClose") {
      btn.addEventListener("click", () => {
        if (typeof requestCloseTrialEditor === "function") {
          requestCloseTrialEditor();
        } else {
          closeTrialModal();
        }
      });
    } else {
      btn.addEventListener("click", closeModal);
    }
  });

  // Trial modal controls
  const trialModalCancelBtn = document.getElementById("trialModalCancelBtn");
  if (trialModalCancelBtn) {
    trialModalCancelBtn.addEventListener("click", () => {
      if (typeof requestCloseTrialEditor === "function") {
        requestCloseTrialEditor();
      } else {
        closeTrialModal();
      }
    });
  }
  const trialModalSaveBtn = document.getElementById("trialModalSaveBtn");
  if (trialModalSaveBtn) {
    trialModalSaveBtn.addEventListener("click", saveTrial);
  }
  const trialNextBtn = document.getElementById("trialNextBtn");
  if (trialNextBtn) {
    trialNextBtn.addEventListener("click", nextTrialSection);
  }
  const trialPrevBtn = document.getElementById("trialPrevBtn");
  if (trialPrevBtn) {
    trialPrevBtn.addEventListener("click", prevTrialSection);
  }

  // Form submit on Enter
  document.getElementById("itemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveItem();
  });

  // Make dashboard cards clickable to go to inventory
  document.querySelectorAll(".dashboard-card").forEach((card) => {
    card.addEventListener("click", () => {
      const category = card.dataset.category;
      if (category) {
        switchPage("inventory");
        switchCategory(category);
      }
    });
  });

  // "View All" trials button on dashboard
  const dashViewAllTrials = document.getElementById("dashViewAllTrials");
  if (dashViewAllTrials) {
    dashViewAllTrials.addEventListener("click", () => {
      switchPage("trial");
    });
  }

  // "View All" observation reminders button on dashboard
  const dashViewAllObs = document.getElementById("dashViewAllObsReminders");
  if (dashViewAllObs) {
    dashViewAllObs.addEventListener("click", () => {
      switchPage("reminder");
      switchReminderTab("observation");
    });
  }

  // "View All" agronomy reminders button on dashboard
  const dashViewAllAgro = document.getElementById("dashViewAllAgroReminders");
  if (dashViewAllAgro) {
    dashViewAllAgro.addEventListener("click", () => {
      switchPage("reminder");
      switchReminderTab("agronomy");
    });
  }

  // Load Data panel
  setupLoadDataPanelEvents();



  // Add reminder buttons (placeholder for coming soon functionality)
  const addObservationBtn = document.getElementById("addObservationBtn");
  if (addObservationBtn) {
    addObservationBtn.addEventListener("click", () => {
      showAlert("Observation reminders are coming soon!", "info", "Coming Soon");
    });
  }

  const addAgronomyBtn = document.getElementById("addAgronomyBtn");
  if (addAgronomyBtn) {
    addAgronomyBtn.addEventListener("click", () => {
      showAlert("Agronomy reminders are coming soon!", "info", "Coming Soon");
    });
  }
}

// Handle keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Close modal on Escape
  if (e.key === "Escape") {
    if (document.getElementById("itemModal").classList.contains("active")) {
      closeModal();
    }
    const trialEditor = document.getElementById("trialEditor");
    if (trialEditor && trialEditor.classList.contains("active")) {
      closeTrialModal();
    }
  }
});

// Switch reminder tab
function switchReminderTab(tabName) {
  // Update content visibility
  document.querySelectorAll(".reminder-tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  const contentId = tabName === "observation" ? "reminderObservationContent" : "reminderAgronomyContent";
  const content = document.getElementById(contentId);
  if (content) content.classList.add("active");

  // Render reminders for the active tab
  if (typeof renderReminders === "function") renderReminders(tabName);

  // Update sidebar subnav
  syncReminderNavState(tabName);
}

// Show sync error alert with retry/login options
function showSyncErrorAlert(errorMessage, error) {
  const isAuthError = errorMessage?.toLowerCase().includes("unauthorized") || 
                      errorMessage?.toLowerCase().includes("requires re-login") ||
                      error?.message?.includes("401");

  const title = isAuthError ? "Authentication Required" : "Sync Error";
  const message = isAuthError 
    ? "Your session has expired. Please log in again to continue syncing."
    : errorMessage || "An error occurred during sync. Please try again.";

  // Create custom alert with buttons
  showAlert(message, isAuthError ? "warning" : "error", title);
  
  // If it's auth error, add login button
  if (isAuthError) {
    const alertModal = document.getElementById("alertModal");
    if (alertModal) {
      const button = alertModal.querySelector(".alert-button");
      if (button) {
        const container = button.parentElement;
        const loginBtn = document.createElement("button");
        loginBtn.className = "btn btn-primary";
        loginBtn.textContent = "Log In Again";
        loginBtn.onclick = () => {
          // Sign out and force re-login
          gapi.auth2.getAuthInstance().signOut().then(() => {
            location.reload();
          });
        };
        container.insertBefore(loginBtn, button);
      }
    }
  }
}

// Handle responsive sidebar toggle on mobile
function setupMobileNav() {
  if (window.innerWidth <= 768) {
    // Add hamburger menu functionality if needed
  }
}

window.addEventListener("resize", setupMobileNav);

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupMobileNav();
});

// ===========================
// DATA IMPORT / EXPORT
// ===========================
const DATA_MAGIC = "ADVANTA_V3_BACKUP";
const DATA_VERSION = 1;

function showDataTransfer(title, message) {
  const overlay = document.getElementById("dataTransferOverlay");
  const titleEl = document.getElementById("dataTransferTitle");
  const msgEl = document.getElementById("dataTransferMessage");
  const bar = document.getElementById("dataTransferBar");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (bar) bar.style.width = "0%";
  if (overlay) overlay.classList.add("active");
  lockBodyScroll();
}

function updateDataTransfer(message, percent) {
  const msgEl = document.getElementById("dataTransferMessage");
  const bar = document.getElementById("dataTransferBar");
  if (msgEl && message) msgEl.textContent = message;
  if (bar && percent != null) bar.style.width = `${Math.round(percent)}%`;
}

function hideDataTransfer() {
  const overlay = document.getElementById("dataTransferOverlay");
  if (overlay) overlay.classList.remove("active");
  unlockBodyScroll();
}

// XOR-based obfuscation so the file can't be opened as plain text
function obfuscate(str) {
  const key = "AdvantaV3SecretKey2026";
  const bytes = new TextEncoder().encode(str);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return out;
}

function deobfuscate(buffer) {
  const key = "AdvantaV3SecretKey2026";
  const bytes = new Uint8Array(buffer);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return new TextDecoder().decode(out);
}

// EXPORT DATA
async function exportData() {
  showDataTransfer("Exporting Data", "Collecting all data...");
  updateDataTransfer(null, 10);

  await new Promise(r => setTimeout(r, 200));

  const payload = {
    magic: DATA_MAGIC,
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    inventory: {
      crops: inventoryState.items.crops || [],
      entries: inventoryState.items.entries || [],
      locations: inventoryState.items.locations || [],
      parameters: inventoryState.items.parameters || [],
      agronomy: inventoryState.items.agronomy || [],
    },
    trials: trialState.trials || [],
  };

  updateDataTransfer("Encoding data...", 50);
  await new Promise(r => setTimeout(r, 150));

  const json = JSON.stringify(payload);
  const encoded = obfuscate(json);

  updateDataTransfer("Preparing file...", 80);
  await new Promise(r => setTimeout(r, 150));

  const blob = new Blob([encoded], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `spectra_backup_${dateStr}.adv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateDataTransfer("Export complete!", 100);
  await new Promise(r => setTimeout(r, 600));
  hideDataTransfer();
  showAlert("Data exported successfully.", "success", "Export Complete");
}

// IMPORT DATA
function triggerImport() {
  const input = document.getElementById("importFileInput");
  if (input) {
    input.value = "";
    input.click();
  }
}

async function handleImportFile(file) {
  if (!file) return;

  showDataTransfer("Importing Data", "Reading file...");
  updateDataTransfer(null, 10);

  try {
    const buffer = await file.arrayBuffer();

    updateDataTransfer("Decoding data...", 30);
    await new Promise(r => setTimeout(r, 150));

    let json;
    try {
      json = deobfuscate(buffer);
    } catch {
      hideDataTransfer();
      showAlert("Invalid backup file. Cannot read data.", "error", "Import Failed");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(json);
    } catch {
      hideDataTransfer();
      showAlert("Corrupted backup file. Data could not be parsed.", "error", "Import Failed");
      return;
    }

    if (payload.magic !== DATA_MAGIC) {
      hideDataTransfer();
      showAlert("This file is not a valid SPECTRA backup.", "error", "Import Failed");
      return;
    }

    updateDataTransfer("Checking for duplicates...", 60);
    await new Promise(r => setTimeout(r, 200));

    // Merge & detect duplicates
    const incoming = payload.inventory || {};
    // Backward compat: map old "lines" key to "entries"
    if (incoming.lines && !incoming.entries) {
      incoming.entries = incoming.lines;
      delete incoming.lines;
    }
    const incomingTrials = payload.trials || [];

    const duplicates = [];

    // Check each category
    const categories = ["crops", "entries", "locations", "parameters", "agronomy"];
    for (const cat of categories) {
      const existing = inventoryState.items[cat] || [];
      const newItems = incoming[cat] || [];
      for (const item of newItems) {
        const dup = existing.find(e => e.id === item.id || (e.name && e.name === item.name));
        if (dup) {
          duplicates.push({
            category: cat,
            existingItem: dup,
            newItem: item,
            action: "keep_existing", // default action
          });
        }
      }
    }

    // Check trials
    for (const trial of incomingTrials) {
      const dup = trialState.trials.find(e => e.id === trial.id || (e.name && e.name === trial.name));
      if (dup) {
        duplicates.push({
          category: "trials",
          existingItem: dup,
          newItem: trial,
          action: "keep_existing",
        });
      }
    }

    hideDataTransfer();

    if (duplicates.length > 0) {
      // Show duplicate review modal
      await showDuplicateReview(duplicates, incoming, incomingTrials);
    } else {
      // No duplicates — apply directly
      await applyImport(incoming, incomingTrials, []);
    }

  } catch (error) {
    hideDataTransfer();
    console.error("Import error:", error);
    showAlert("Error importing data: " + error.message, "error", "Import Failed");
  }
}

function showDuplicateReview(duplicates, incoming, incomingTrials) {
  return new Promise((resolve) => {
    const modal = document.getElementById("duplicateReviewModal");
    const list = document.getElementById("duplicateReviewList");
    const desc = document.getElementById("duplicateReviewDesc");

    desc.textContent = `Found ${duplicates.length} duplicate(s). Choose how to handle each one.`;

    list.innerHTML = duplicates.map((dup, idx) => {
      const catLabel = dup.category.charAt(0).toUpperCase() + dup.category.slice(1);
      return `
        <div class="dup-item" id="dupItem${idx}">
          <div class="dup-item-info">
            <div class="dup-item-name">${escapeHtml(dup.newItem.name || dup.newItem.id)}</div>
            <div class="dup-item-meta">${catLabel} · ID: ${dup.newItem.id.substring(0, 12)}...</div>
          </div>
          <span class="dup-item-badge">Duplicate</span>
          <div class="dup-actions">
            <button class="btn btn-secondary dup-action-btn active" data-idx="${idx}" data-action="keep_existing" title="Keep existing, skip imported">Keep Existing</button>
            <button class="btn btn-secondary dup-action-btn" data-idx="${idx}" data-action="replace" title="Replace existing with imported">Replace</button>
            <button class="btn btn-secondary dup-action-btn" data-idx="${idx}" data-action="keep_both" title="Keep both items">Keep Both</button>
          </div>
        </div>
      `;
    }).join("");

    modal.classList.add("active");
    lockBodyScroll();

    // Handle per-item actions
    list.addEventListener("click", function handler(e) {
      const btn = e.target.closest(".dup-action-btn");
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      duplicates[idx].action = action;

      // Update active state
      const row = document.getElementById(`dupItem${idx}`);
      row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });

    // Keep All button
    document.getElementById("dupKeepAllBtn").onclick = () => {
      duplicates.forEach((d, i) => {
        d.action = "keep_existing";
        const row = document.getElementById(`dupItem${i}`);
        row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.toggle("active", b.dataset.action === "keep_existing"));
      });
    };

    // Skip All New
    document.getElementById("dupRemoveAllNewBtn").onclick = () => {
      duplicates.forEach((d, i) => {
        d.action = "keep_existing";
        const row = document.getElementById(`dupItem${i}`);
        row.querySelectorAll(".dup-action-btn").forEach(b => b.classList.toggle("active", b.dataset.action === "keep_existing"));
      });
    };

    // Apply
    document.getElementById("dupApplyBtn").onclick = async () => {
      modal.classList.remove("active");
      unlockBodyScroll();
      await applyImport(incoming, incomingTrials, duplicates);
      resolve();
    };
  });
}

async function applyImport(incoming, incomingTrials, duplicates) {
  showDataTransfer("Applying Import", "Merging data...");
  updateDataTransfer(null, 20);
  await new Promise(r => setTimeout(r, 200));

  const dupMap = {};
  for (const dup of duplicates) {
    const key = `${dup.category}_${dup.newItem.id}`;
    dupMap[key] = dup.action;
    // Also track by name for name-matched duplicates
    if (dup.newItem.name) {
      const nameKey = `${dup.category}_name_${dup.newItem.name}`;
      dupMap[nameKey] = dup.action;
    }
  }

  function getDupAction(cat, item) {
    const a = dupMap[`${cat}_${item.id}`];
    if (a) return a;
    if (item.name) {
      const b = dupMap[`${cat}_name_${item.name}`];
      if (b) return b;
    }
    return null; // no duplicate
  }

  // Merge inventory categories
  const categories = ["crops", "entries", "locations", "parameters", "agronomy"];
  for (const cat of categories) {
    const existing = inventoryState.items[cat] || [];
    const newItems = incoming[cat] || [];

    for (const item of newItems) {
      const action = getDupAction(cat, item);
      if (action === "keep_existing") continue; // skip imported
      if (action === "replace") {
        // Remove existing, add new
        const idx = existing.findIndex(e => e.id === item.id || (e.name && e.name === item.name));
        if (idx >= 0) existing.splice(idx, 1);
        existing.push(item);
      } else if (action === "keep_both") {
        // Give new item a unique id suffix
        item.id = item.id + "_imported_" + Date.now();
        existing.push(item);
      } else {
        // No duplicate — just add
        existing.push(item);
      }
    }
    inventoryState.items[cat] = existing;
  }

  updateDataTransfer("Merging trials...", 50);
  await new Promise(r => setTimeout(r, 150));

  // Merge trials
  for (const trial of incomingTrials) {
    const action = getDupAction("trials", trial);
    if (action === "keep_existing") continue;
    if (action === "replace") {
      const idx = trialState.trials.findIndex(e => e.id === trial.id || (e.name && e.name === trial.name));
      if (idx >= 0) trialState.trials.splice(idx, 1);
      trialState.trials.push(trial);
    } else if (action === "keep_both") {
      trial.id = trial.id + "_imported_" + Date.now();
      trialState.trials.push(trial);
    } else {
      trialState.trials.push(trial);
    }
  }

  updateDataTransfer("Saving to local cache...", 70);
  await new Promise(r => setTimeout(r, 150));

  // Save everything to local cache
  if (typeof saveLocalCache === "function") {
    saveLocalCache("inventory", { items: inventoryState.items });
    saveLocalCache("trials", { trials: trialState.trials });
  }

  updateDataTransfer("Updating UI...", 85);
  await new Promise(r => setTimeout(r, 150));

  // Refresh UI
  updateDashboardCounts();
  switchCategory(inventoryState.currentCategory || "crops");
  renderTrials();
  renderDashboardTrialProgress();

  // Sync to Google Drive if logged in (not guest)
  const isGuest = getCurrentUser()?.isGuest;
  if (!isGuest && typeof getAccessToken === "function" && getAccessToken()) {
    updateDataTransfer("Uploading to Google Drive...", 90);

    // Enqueue sync for all inventory items
    for (const cat of categories) {
      for (const item of inventoryState.items[cat]) {
        if (typeof enqueueSync === "function") {
          enqueueSync({
            label: `Sync ${cat}: ${item.name || item.id}`,
            run: async () => {
              await saveItemToGoogleDrive(cat, item);
            }
          });
        }
      }
    }
    // Enqueue sync for all trials
    for (const trial of trialState.trials) {
      if (typeof enqueueSync === "function") {
        enqueueSync({
          label: `Sync trial: ${trial.name || trial.id}`,
          run: async () => {
            await saveTrialToGoogleDrive(trial);
          }
        });
      }
    }
  }

  updateDataTransfer("Import complete!", 100);
  await new Promise(r => setTimeout(r, 600));
  hideDataTransfer();
  showAlert("Data imported successfully!", "success", "Import Complete");
}

// Wire up import/export buttons
let _dataTransferEventsSetUp = false;
function setupDataTransferEvents() {
  if (_dataTransferEventsSetUp) return;
  _dataTransferEventsSetUp = true;
  const exportBtn = document.getElementById("exportDataBtn");
  const importBtn = document.getElementById("importDataBtn");
  const importInput = document.getElementById("importFileInput");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.remove("active");
      exportData();
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.remove("active");
      triggerImport();
    });
  }

  if (importInput) {
    importInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });
  }
}
// ===========================
// LOAD LATEST DATA PANEL
// ===========================

// Background loading state — survives panel open/close
const loadDataBgState = {
  /** Map of trialId → { percentage, loaded, total, status: "loading"|"done"|"error", error } */
  loadingTrials: {},
  /** Whether loadAll is currently running */
  loadAllActive: false,
  loadAllLoaded: 0,
  loadAllTotal: 0,
  /** Whether refresh/update all actions are running */
  refreshAllActive: false,
  updateAllActive: false,
  updateAllDone: 0,
  updateAllTotal: 0,
  /** Map of trialId~areaIdx~type -> boolean (remote newer data available) */
  updateFlags: {},
  checkingUpdates: false,
  lastUpdateCheckAt: null,
};

function _setAreaTypeUpdateFlag(trialId, areaIndex, type, hasUpdate) {
  const key = `${trialId}~${areaIndex}~${type}`;
  if (hasUpdate) {
    loadDataBgState.updateFlags[key] = true;
  } else {
    delete loadDataBgState.updateFlags[key];
  }
}

function _hasAreaTypeUpdate(trialId, areaIndex, type) {
  return !!loadDataBgState.updateFlags[`${trialId}~${areaIndex}~${type}`];
}

function _hasTrialUpdates(trialId) {
  const prefix = `${trialId}~`;
  return Object.keys(loadDataBgState.updateFlags).some((k) => k.startsWith(prefix));
}

/**
 * Check a single trial for remote updates on its loaded areas.
 * Returns true if any area has updates available.
 */
async function checkSingleTrialUpdates(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return false;

  const loadedAreaTypes = trial._loadedAreaTypes || {};
  const areaIndexes = new Set([
    ...Object.keys(loadedAreaTypes),
    ...((trial._loadedAreas || []).map(x => String(x))),
  ]);
  if (areaIndexes.size === 0) return false;

  const user = getCurrentUser?.();
  if (!user || user.isGuest) return false;

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFolder = await findFolder(trial.id, rootFolderId);
    if (!trialFolder) return false;

    const responsesFolder = await findFolder("responses", trialFolder.id);
    const agronomyFolder = await findFolder("agronomy", trialFolder.id);

    const [respFiles, agroFiles] = await Promise.all([
      responsesFolder
        ? gapi.client.drive.files.list({
          q: `'${responsesFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        }).then(r => r.result.files || [])
        : Promise.resolve([]),
      agronomyFolder
        ? gapi.client.drive.files.list({
          q: `'${agronomyFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        }).then(r => r.result.files || [])
        : Promise.resolve([]),
    ]);

    let anyUpdate = false;
    for (const areaIdx of areaIndexes) {
      const markerObs = trial._loadSyncMarker?.[areaIdx]?.observation;
      const markerAgro = trial._loadSyncMarker?.[areaIdx]?.agronomy;
      const obsLoaded = !!loadedAreaTypes[areaIdx]?.observation || !!trial._loadedAreas?.includes(String(areaIdx));
      const agroLoaded = !!loadedAreaTypes[areaIdx]?.agronomy || !!trial._loadedAreas?.includes(String(areaIdx));

      if (obsLoaded && markerObs) {
        const hasObsUpdate = respFiles.some(f => {
          if (!_fileMatchesAreaType(f.name, areaIdx, "observation")) return false;
          return new Date(f.modifiedTime || 0).getTime() > new Date(markerObs).getTime();
        });
        _setAreaTypeUpdateFlag(trial.id, areaIdx, "observation", hasObsUpdate);
        if (hasObsUpdate) anyUpdate = true;
      }

      if (agroLoaded && markerAgro) {
        const hasAgroUpdate = agroFiles.some(f => {
          if (!_fileMatchesAreaType(f.name, areaIdx, "agronomy")) return false;
          return new Date(f.modifiedTime || 0).getTime() > new Date(markerAgro).getTime();
        });
        _setAreaTypeUpdateFlag(trial.id, areaIdx, "agronomy", hasAgroUpdate);
        if (hasAgroUpdate) anyUpdate = true;
      }
    }
    return anyUpdate;
  } catch (err) {
    console.warn("checkSingleTrialUpdates failed:", err);
    return false;
  }
}

function _isAnyTrialLoading() {
  return Object.values(loadDataBgState.loadingTrials).some((info) => info?.status === "loading");
}

function _isLoadDataBusy() {
  return loadDataBgState.loadAllActive
    || loadDataBgState.refreshAllActive
    || loadDataBgState.updateAllActive
    || loadDataBgState.checkingUpdates
    || _isAnyTrialLoading();
}

function _fileMatchesAreaType(fileName, areaIdx, type) {
  const base = String(fileName || "").replace(/\.json$/i, "");
  if (type === "observation") {
    return base.startsWith(`${areaIdx}~`) || base.startsWith(`${areaIdx}_`);
  }
  return base.startsWith(`${areaIdx}~`);
}

async function checkLoadedTrialUpdates(options = {}) {
  const { silent = true } = options;
  if (loadDataBgState.checkingUpdates) return;

  const user = getCurrentUser?.();
  if (!user || user.isGuest) return;

  const trials = (trialState?.trials || []).filter((t) => {
    const loadedAreas = Array.isArray(t._loadedAreas) ? t._loadedAreas : [];
    const typeMap = t._loadedAreaTypes || {};
    return t._responsesLoaded || loadedAreas.length > 0 || Object.keys(typeMap).length > 0;
  });
  if (trials.length === 0) return;

  loadDataBgState.checkingUpdates = true;
  _updateLoadAllUI();
  _updateLoadDataBtnAnimation();
  let anyNewUpdate = false;

  try {
    const rootFolderId = await getTrialsFolderId();

    for (const trial of trials) {
      const trialFolder = await findFolder(trial.id, rootFolderId);
      if (!trialFolder) continue;

      const responsesFolder = await findFolder("responses", trialFolder.id);
      const agronomyFolder = await findFolder("agronomy", trialFolder.id);

      const [respFiles, agroFiles] = await Promise.all([
        responsesFolder
          ? gapi.client.drive.files.list({
            q: `'${responsesFolder.id}' in parents and mimeType='application/json' and trashed=false`,
            fields: "files(id,name,modifiedTime)",
            pageSize: 1000,
          }).then((r) => r.result.files || [])
          : Promise.resolve([]),
        agronomyFolder
          ? gapi.client.drive.files.list({
            q: `'${agronomyFolder.id}' in parents and mimeType='application/json' and trashed=false`,
            fields: "files(id,name,modifiedTime)",
            pageSize: 1000,
          }).then((r) => r.result.files || [])
          : Promise.resolve([]),
      ]);

      const loadedAreaTypes = trial._loadedAreaTypes || {};
      const areaIndexes = new Set([
        ...Object.keys(loadedAreaTypes),
        ...((trial._loadedAreas || []).map((x) => String(x))),
      ]);

      for (const areaIdx of areaIndexes) {
        const markerObs = trial._loadSyncMarker?.[areaIdx]?.observation;
        const markerAgro = trial._loadSyncMarker?.[areaIdx]?.agronomy;
        const obsLoaded = !!loadedAreaTypes?.[areaIdx]?.observation || !!trial._loadedAreas?.includes(String(areaIdx));
        const agroLoaded = !!loadedAreaTypes?.[areaIdx]?.agronomy || !!trial._loadedAreas?.includes(String(areaIdx));

        if (obsLoaded && markerObs) {
          const hasObsUpdate = respFiles.some((f) => {
            if (!_fileMatchesAreaType(f.name, areaIdx, "observation")) return false;
            return new Date(f.modifiedTime || 0).getTime() > new Date(markerObs).getTime();
          });
          _setAreaTypeUpdateFlag(trial.id, areaIdx, "observation", hasObsUpdate);
          if (hasObsUpdate) anyNewUpdate = true;
        }

        if (agroLoaded && markerAgro) {
          const hasAgroUpdate = agroFiles.some((f) => {
            if (!_fileMatchesAreaType(f.name, areaIdx, "agronomy")) return false;
            return new Date(f.modifiedTime || 0).getTime() > new Date(markerAgro).getTime();
          });
          _setAreaTypeUpdateFlag(trial.id, areaIdx, "agronomy", hasAgroUpdate);
          if (hasAgroUpdate) anyNewUpdate = true;
        }
      }
    }

    loadDataBgState.lastUpdateCheckAt = new Date().toISOString();
    if (!silent && anyNewUpdate) {
      showToast("There's new trial data in Drive. Click Update in the available area.", "info", 4500);
    }

    // Refresh UI badge/status if panel is open
    const modal = document.getElementById("loadDataModal");
    if (modal?.classList.contains("active")) {
      renderLoadDataTrialList();
    }
  } catch (error) {
    console.warn("Failed checking trial updates:", error);
  } finally {
    loadDataBgState.checkingUpdates = false;
    _updateLoadAllUI();
    _updateLoadDataBtnAnimation();
  }
}

/** Helper: push progress into background state AND live-update DOM if visible */
function _updateTrialLoadUI(trialId, info) {
  loadDataBgState.loadingTrials[trialId] = info;
  _updateLoadAllUI();

  // Update area-level progress in the DOM
  const areaKey = info._areaKey; // e.g., "trialId~0"
  if (areaKey) {
    const areaRow = document.querySelector(`.load-data-area-row[data-area-key="${areaKey}"]`);
    if (!areaRow) return;

    // Toggle loading class on the row
    if (info.status === "loading") {
      areaRow.classList.add("loading");
      areaRow.classList.remove("loaded", "not-loaded", "partial");
      const icon = areaRow.querySelector(".load-data-area-icon");
      if (icon) {
        icon.className = "load-data-area-icon material-symbols-rounded loading";
        icon.textContent = "";
        // Replace with spinner if not already
        if (!areaRow.querySelector(".load-data-area-icon + .spinner-sm") && !icon.nextElementSibling?.classList.contains("spinner-sm")) {
          const spinner = document.createElement("span");
          spinner.className = "spinner-sm";
          icon.replaceWith(spinner);
        }
      }
    }

    const progressEl = areaRow.querySelector(".load-data-area-progress");
    const progressFill = areaRow.querySelector(".load-data-progress-fill");
    const progressText = areaRow.querySelector(".load-data-area-progress-text");
    const areaBtn = areaRow.querySelector(".load-data-area-btn");

    if (progressEl) progressEl.style.display = "";
    if (progressFill) progressFill.style.width = (info.percentage || 0) + "%";
    if (progressText) progressText.textContent = info.step || `${info.percentage || 0}%`;
    if (areaBtn) {
      areaBtn.disabled = true;
      areaBtn.innerHTML = `<span class="spinner-sm"></span> ${info.percentage || 0}%`;
    }
    return;
  }

  // Fallback: update trial-level element
  const itemEl = document.querySelector(`.load-data-trial-item[data-trial-id="${trialId}"]`);
  if (!itemEl) return;

  const statusEl = itemEl.querySelector(".load-data-status");
  if (info.status === "loading" && statusEl) {
    statusEl.className = "load-data-status loading";
    statusEl.innerHTML = '<span class="material-symbols-rounded">cached</span> Loading...';
  }
}

/** Helper: update the "Load All" button UI if visible */
function _updateLoadAllUI() {
  const loadBtn = document.getElementById("loadAllTrialsBtn");
  const refreshBtn = document.getElementById("refreshAllTrialsBtn");
  const trialTab = document.getElementById("loadDataTabTrial");

  const hasBusy = _isLoadDataBusy();
  const anyTrialLoading = _isAnyTrialLoading();

  if (trialTab) {
    trialTab.classList.toggle("is-busy", hasBusy);
    trialTab.classList.toggle("is-refreshing", loadDataBgState.refreshAllActive || loadDataBgState.checkingUpdates);
    trialTab.classList.toggle("is-updating", loadDataBgState.updateAllActive);
  }

  if (loadBtn) {
    if (loadDataBgState.loadAllActive) {
      loadBtn.disabled = true;
      loadBtn.classList.add("is-loading");
      loadBtn.innerHTML = `<span class="spinner-sm"></span> ${loadDataBgState.loadAllLoaded}/${loadDataBgState.loadAllTotal}`;
    } else if (anyTrialLoading) {
      loadBtn.disabled = true;
      loadBtn.classList.add("is-loading");
      loadBtn.innerHTML = '<span class="spinner-sm"></span> Loading...';
    } else {
      loadBtn.disabled = hasBusy;
      loadBtn.classList.remove("is-loading");
      loadBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">cloud_download</span> Load All';
    }
  }

  if (refreshBtn) {
    if (loadDataBgState.refreshAllActive || loadDataBgState.checkingUpdates) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add("is-loading");
      refreshBtn.innerHTML = '<span class="spinner-sm"></span> Refreshing...';
    } else {
      refreshBtn.disabled = loadDataBgState.loadAllActive || loadDataBgState.updateAllActive || anyTrialLoading;
      refreshBtn.classList.remove("is-loading");
      refreshBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">sync</span> Refresh All';
    }
  }

  _syncUpdateAllBtn();
}

/** Helper: toggle loading animation on #loadDataBtn */
function _updateLoadDataBtnAnimation() {
  const btn = document.getElementById("loadDataBtn");
  if (!btn) return;

  btn.classList.toggle("loading", _isLoadDataBusy());
}

function openLoadDataPanel(activeTab = "trial") {
  const user = getCurrentUser();
  if (!user || user.isGuest) {
    showAlert("Load data is only available for logged-in users.", "warning", "Not Available");
    return;
  }

  const modal = document.getElementById("loadDataModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  modal.classList.add("active");
  lockBodyScroll();

  // Render initial content
  renderLoadDataTrialList();

  // Check if remote data changed after local load.
  checkLoadedTrialUpdates({ silent: false }).catch(() => {});
}

function closeLoadDataPanel() {
  const modal = document.getElementById("loadDataModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.classList.add("hidden");
  unlockBodyScroll();
}

function setupLoadDataPanelEvents() {
  // Close button
  const closeBtn = document.getElementById("loadDataCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeLoadDataPanel);

  // Backdrop click
  const modal = document.getElementById("loadDataModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLoadDataPanel();
    });
  }

  // Load All Trials button
  const loadAllTrialsBtn = document.getElementById("loadAllTrialsBtn");
  if (loadAllTrialsBtn) {
    loadAllTrialsBtn.addEventListener("click", loadAllTrialResponses);
  }

  const refreshAllTrialsBtn = document.getElementById("refreshAllTrialsBtn");
  if (refreshAllTrialsBtn) {
    refreshAllTrialsBtn.addEventListener("click", refreshAllTrialUpdates);
  }

  const updateAllTrialsBtn = document.getElementById("updateAllTrialsBtn");
  if (updateAllTrialsBtn) {
    updateAllTrialsBtn.addEventListener("click", updateAllTrialData);
  }

  // Open panel button in topbar
  const loadDataBtn = document.getElementById("loadDataBtn");
  if (loadDataBtn) {
    loadDataBtn.addEventListener("click", () => openLoadDataPanel());
  }
}

// ---- Trial Tab ----

function renderLoadDataTrialList() {
  const container = document.getElementById("loadDataTrialList");
  if (!container) return;

  const trials = (trialState.trials || []).filter(t => !t.archived);
  if (trials.length === 0) {
    container.innerHTML = '<div class="load-data-summary">No active trials found.</div>';
    return;
  }

  // Preserve expanded state
  const expandedTrials = new Set();
  container.querySelectorAll(".load-data-trial-group.expanded").forEach(el => {
    expandedTrials.add(el.dataset.trialId);
  });

  container.innerHTML = trials.map(trial => {
    const trialLoadingInfo = loadDataBgState.loadingTrials[trial.id];
    const isTrialLoading = !!(trialLoadingInfo && trialLoadingInfo.status === "loading");
    const loadedAreas = Array.isArray(trial._loadedAreas) ? trial._loadedAreas : [];
    const totalAreas = (trial.areas || []).length;
    const loadedCount = loadedAreas.length;
    // Derive isLoaded from actual data — _responsesLoaded flag may be stale
    const isLoaded = !!trial._responsesLoaded || (totalAreas > 0 && loadedCount >= totalAreas);
    if (isLoaded && !trial._responsesLoaded) trial._responsesLoaded = true;
    const isPartial = !isLoaded && loadedCount > 0;

    const hasTrialUpdate = _hasTrialUpdates(trial.id);

    let statusClass, statusIcon, statusLabel;
    if (isTrialLoading) {
      statusClass = "loading";
      statusIcon = "";
      statusLabel = trialLoadingInfo?.step || "Loading...";
    } else if (isLoaded && hasTrialUpdate) {
      statusClass = "partial";
      statusIcon = "system_update_alt";
      statusLabel = "Update available";
    } else if (isLoaded) {
      statusClass = "loaded";
      statusIcon = "check_circle";
      statusLabel = "All loaded";
    } else if (isPartial && hasTrialUpdate) {
      statusClass = "partial";
      statusIcon = "system_update_alt";
      statusLabel = `${loadedCount}/${totalAreas} · Update`;
    } else if (isPartial) {
      statusClass = "partial";
      statusIcon = "downloading";
      statusLabel = `${loadedCount}/${totalAreas}`;
    } else {
      statusClass = "not-loaded";
      statusIcon = "cloud_off";
      statusLabel = "Not loaded";
    }

    const cropName = trial.cropName || "";
    const meta = [cropName, trial.trialType, `${totalAreas} area${totalAreas !== 1 ? "s" : ""}`].filter(Boolean).join(" · ");
    const isExpanded = expandedTrials.has(trial.id);

    // Render area rows
    const areaRows = (trial.areas || []).map((area, idx) => {
      const areaIdxStr = String(idx);
      const areaKey = `${trial.id}~${idx}`;
      const areaLoaded = loadedAreas.includes(areaIdxStr);
      const areaTypes = trial._loadedAreaTypes?.[areaIdxStr] || {};
      const obsLoaded = !!areaTypes.observation;
      const agroLoaded = !!areaTypes.agronomy;
      const obsHasUpdate = _hasAreaTypeUpdate(trial.id, areaIdxStr, "observation");
      const agroHasUpdate = _hasAreaTypeUpdate(trial.id, areaIdxStr, "agronomy");
      const bgInfo = loadDataBgState.loadingTrials[trial.id];
      const isAreaLoading = bgInfo && bgInfo.status === "loading" && bgInfo._areaKey === areaKey;
      const loadingType = bgInfo?._loadType || null;

      let areaStatusClass, areaIcon;
      if (isAreaLoading) {
        areaStatusClass = "loading";
        areaIcon = "";
      } else if (areaLoaded) {
        areaStatusClass = "loaded";
        areaIcon = "check_circle";
      } else if (obsLoaded || agroLoaded) {
        areaStatusClass = "partial";
        areaIcon = "downloading";
      } else {
        areaStatusClass = "not-loaded";
        areaIcon = "cloud_off";
      }

      const progressDisplay = isAreaLoading ? "" : "none";
      const progressPct = isAreaLoading ? (bgInfo.percentage || 0) : 0;
      const progressStep = isAreaLoading ? (bgInfo.step || "") : "";

      // Per-type buttons
      const obsLoadingNow = isAreaLoading && (loadingType === "observation" || loadingType === "all");
      const agroLoadingNow = isAreaLoading && (loadingType === "agronomy" || loadingType === "all");

      let obsBtnHtml, agroBtnHtml;
      if (obsLoadingNow) {
        obsBtnHtml = `<button class="load-data-type-btn" disabled><span class="spinner-sm"></span> Obs</button>`;
      } else if (obsLoaded && obsHasUpdate) {
        obsBtnHtml = `<button class="load-data-type-btn has-update" onclick="loadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'observation')" title="Update Observation"><span class="material-symbols-rounded">refresh</span> Update Obs</button>`;
      } else if (obsLoaded) {
        obsBtnHtml = `<button class="load-data-type-btn loaded" onclick="unloadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'observation')" title="Unload Observation"><span class="material-symbols-rounded">check_circle</span> Obs</button>`;
      } else {
        obsBtnHtml = `<button class="load-data-type-btn" onclick="loadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'observation')" title="Load Observation"><span class="material-symbols-rounded">cloud_download</span> Obs</button>`;
      }

      if (agroLoadingNow) {
        agroBtnHtml = `<button class="load-data-type-btn" disabled><span class="spinner-sm"></span> Agro</button>`;
      } else if (agroLoaded && agroHasUpdate) {
        agroBtnHtml = `<button class="load-data-type-btn has-update" onclick="loadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'agronomy')" title="Update Agronomy"><span class="material-symbols-rounded">refresh</span> Update Agro</button>`;
      } else if (agroLoaded) {
        agroBtnHtml = `<button class="load-data-type-btn loaded" onclick="unloadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'agronomy')" title="Unload Agronomy"><span class="material-symbols-rounded">check_circle</span> Agro</button>`;
      } else {
        agroBtnHtml = `<button class="load-data-type-btn" onclick="loadSingleAreaTypeFromPanel('${trial.id}', ${idx}, 'agronomy')" title="Load Agronomy"><span class="material-symbols-rounded">cloud_download</span> Agro</button>`;
      }

      // Full area unload button (only when something is loaded)
      const unloadAllBtn = (obsLoaded || agroLoaded) && !isAreaLoading
        ? `<button class="load-data-area-btn load-data-unload-btn" onclick="unloadSingleAreaFromPanel('${trial.id}', ${idx}, this)" title="Unload All"><span class="material-symbols-rounded">cloud_off</span> Unload Both</button>`
        : "";

      return `
        <div class="load-data-area-row ${areaStatusClass}" data-area-key="${areaKey}">
          ${areaIcon ? `<span class="load-data-area-icon material-symbols-rounded ${areaStatusClass}">${areaIcon}</span>` : `<span class="spinner-sm"></span>`}
          <span class="load-data-area-name">${escapeHtml(area.name || `Area ${idx + 1}`)}</span>
          <div class="load-data-area-progress" style="display:${progressDisplay}">
            <div class="load-data-progress-bar"><div class="load-data-progress-fill" style="width:${progressPct}%"></div></div>
            <span class="load-data-area-progress-text">${escapeHtml(progressStep)}</span>
          </div>
          <div class="load-data-type-btns">
            ${obsBtnHtml}
            ${agroBtnHtml}
          </div>
          ${unloadAllBtn}
        </div>
      `;
    }).join("");

    // Trial-level action buttons
    let trialActions = "";
    if (isLoaded) {
      trialActions = `<button class="load-data-trial-btn load-data-unload-btn" onclick="event.stopPropagation(); unloadSingleTrialFromPanel('${trial.id}', this)"><span class="material-symbols-rounded">cloud_off</span> Unload All</button>`;
    } else if (totalAreas > 0 && loadedCount < totalAreas) {
      trialActions = `<button class="load-data-trial-btn" onclick="event.stopPropagation(); loadSingleTrialFromPanel('${trial.id}', this)"><span class="material-symbols-rounded">cloud_download</span> Load All</button>`;
    }

    return `
      <div class="load-data-trial-group ${isExpanded ? "expanded" : ""}" data-trial-id="${trial.id}">
        <div class="load-data-trial-header" onclick="toggleTrialAreaList('${trial.id}')">
          <span class="material-symbols-rounded load-data-expand-icon">expand_more</span>
          <div class="load-data-trial-info">
            <div class="load-data-trial-name">${escapeHtml(trial.name)}</div>
            <div class="load-data-trial-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="load-data-status ${statusClass}">
            ${statusIcon ? `<span class="material-symbols-rounded">${statusIcon}</span>` : `<span class="spinner-sm"></span>`}
            ${statusLabel}
          </span>
          ${trialActions}
        </div>
        <div class="load-data-area-list">
          ${areaRows || '<div class="load-data-area-empty">No areas defined</div>'}
        </div>
      </div>
    `;
  }).join("");

  _updateLoadAllUI();
}

function toggleTrialAreaList(trialId) {
  const group = document.querySelector(`.load-data-trial-group[data-trial-id="${trialId}"]`);
  if (group) group.classList.toggle("expanded");
}

async function loadSingleAreaFromPanel(trialId, areaIndex, btnEl) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const areaKey = `${trialId}~${areaIndex}`;
  if (trial._loadedAreas?.includes(String(areaIndex))) return;

  // Prevent duplicates
  const bgInfo = loadDataBgState.loadingTrials[trialId];
  if (bgInfo && bgInfo.status === "loading" && bgInfo._areaKey === areaKey) return;

  _updateTrialLoadUI(trialId, { status: "loading", percentage: 0, _areaKey: areaKey, _loadType: "all", step: "Connecting..." });
  _updateLoadDataBtnAnimation();

  try {
    await loadTrialAreaFromDrive(trialId, areaIndex, (info) => {
      _updateTrialLoadUI(trialId, { status: "loading", ...info, _areaKey: areaKey, _loadType: "all" });
    });

    _setAreaTypeUpdateFlag(trialId, String(areaIndex), "observation", false);
    _setAreaTypeUpdateFlag(trialId, String(areaIndex), "agronomy", false);

    delete loadDataBgState.loadingTrials[trialId];
    renderLoadDataTrialList();
    _updateLoadDataBtnAnimation();

    if (typeof updateDashboardCounts === "function") updateDashboardCounts();
    if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
    if (typeof renderTrials === "function") renderTrials();
  } catch (err) {
    console.error(`Error loading area ${areaIndex} for trial ${trialId}:`, err);
    delete loadDataBgState.loadingTrials[trialId];
    renderLoadDataTrialList();
    _updateLoadDataBtnAnimation();
    showToast(`Error loading area: ${err.message}`, "error");
  }
}

function unloadSingleAreaFromPanel(trialId, areaIndex, btnEl) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const areaIdxStr = String(areaIndex);
  if (!trial._loadedAreas?.includes(areaIdxStr) && !trial._loadedAreaTypes?.[areaIdxStr]) return;

  // Clear area data
  if (trial.responses) delete trial.responses[areaIdxStr];
  if (trial.agronomyResponses) delete trial.agronomyResponses[areaIdxStr];
  trial._loadedAreas = (trial._loadedAreas || []).filter(a => a !== areaIdxStr);
  if (trial._loadedAreaTypes) delete trial._loadedAreaTypes[areaIdxStr];
  if (trial._loadSyncMarker) delete trial._loadSyncMarker[areaIdxStr];
  _setAreaTypeUpdateFlag(trialId, areaIdxStr, "observation", false);
  _setAreaTypeUpdateFlag(trialId, areaIdxStr, "agronomy", false);
  trial._responsesLoaded = false;

  if (typeof saveLocalCache === "function") {
    saveLocalCache("trials", { trials: trialState.trials });
  }

  renderLoadDataTrialList();
  _updateLoadDataBtnAnimation();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();
}

async function loadSingleAreaTypeFromPanel(trialId, areaIndex, type) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const areaIdxStr = String(areaIndex);
  const areaKey = `${trialId}~${areaIndex}`;

  // Already loading same target
  const hasPendingLoad = loadDataBgState.loadingTrials[trialId]?.status === "loading";
  if (hasPendingLoad) return;

  // Prevent duplicate loading
  const bgInfo = loadDataBgState.loadingTrials[trialId];
  if (bgInfo && bgInfo.status === "loading" && bgInfo._areaKey === areaKey) return;

  _updateTrialLoadUI(trialId, { status: "loading", percentage: 0, _areaKey: areaKey, _loadType: type, step: "Connecting..." });
  _updateLoadDataBtnAnimation();

  try {
    await loadTrialAreaFromDrive(trialId, areaIndex, (info) => {
      _updateTrialLoadUI(trialId, { status: "loading", ...info, _areaKey: areaKey, _loadType: type });
    }, { type, force: true });

    _setAreaTypeUpdateFlag(trialId, areaIdxStr, type, false);

    delete loadDataBgState.loadingTrials[trialId];
    renderLoadDataTrialList();
    _updateLoadDataBtnAnimation();

    if (typeof updateDashboardCounts === "function") updateDashboardCounts();
    if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
    if (typeof renderTrials === "function") renderTrials();
  } catch (err) {
    console.error(`Error loading ${type} for area ${areaIndex} of trial ${trialId}:`, err);
    delete loadDataBgState.loadingTrials[trialId];
    renderLoadDataTrialList();
    _updateLoadDataBtnAnimation();
    showToast(`Error loading ${type}: ${err.message}`, "error");
  }
}

function unloadSingleAreaTypeFromPanel(trialId, areaIndex, type) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const areaIdxStr = String(areaIndex);
  if (!trial._loadedAreaTypes?.[areaIdxStr]?.[type]) return;

  // Clear type-specific data
  if (type === "observation" && trial.responses) {
    delete trial.responses[areaIdxStr];
  } else if (type === "agronomy" && trial.agronomyResponses) {
    delete trial.agronomyResponses[areaIdxStr];
  }

  _setAreaTypeUpdateFlag(trialId, areaIdxStr, type, false);

  trial._loadedAreaTypes[areaIdxStr][type] = false;
  if (trial._loadSyncMarker?.[areaIdxStr]) delete trial._loadSyncMarker[areaIdxStr][type];

  // If neither type is loaded, remove from _loadedAreas
  const types = trial._loadedAreaTypes[areaIdxStr];
  if (!types.observation && !types.agronomy) {
    trial._loadedAreas = (trial._loadedAreas || []).filter(a => a !== areaIdxStr);
    delete trial._loadedAreaTypes[areaIdxStr];
  }
  trial._responsesLoaded = false;

  if (typeof saveLocalCache === "function") {
    saveLocalCache("trials", { trials: trialState.trials });
  }

  renderLoadDataTrialList();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();
}

async function loadSingleTrialFromPanel(trialId, btnEl) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial || trial._responsesLoaded) return;
  if (loadDataBgState.loadingTrials[trialId]?.status === "loading") return;

  const totalAreas = (trial.areas || []).length;
  if (!Array.isArray(trial._loadedAreas)) trial._loadedAreas = [];

  // Load each unloaded area sequentially
  for (let i = 0; i < totalAreas; i++) {
    if (trial._loadedAreas.includes(String(i))) continue;
    const areaKey = `${trialId}~${i}`;

    _updateTrialLoadUI(trialId, { status: "loading", percentage: 0, _areaKey: areaKey, _loadType: "all", step: "Connecting..." });
    _updateLoadDataBtnAnimation();

    try {
      await loadTrialAreaFromDrive(trialId, i, (info) => {
        _updateTrialLoadUI(trialId, { status: "loading", ...info, _areaKey: areaKey, _loadType: "all" });
      });
    } catch (err) {
      console.error(`Error loading area ${i}:`, err);
      showToast(`Error loading area: ${err.message}`, "error");
      break;
    }

    delete loadDataBgState.loadingTrials[trialId];
    renderLoadDataTrialList();
  }

  // Re-verify _responsesLoaded on the current trial object
  const currentTrial = trialState.trials.find(t => t.id === trialId);
  if (currentTrial) {
    const la = Array.isArray(currentTrial._loadedAreas) ? currentTrial._loadedAreas : [];
    const ta = (currentTrial.areas || []).length;
    if (ta > 0 && la.length >= ta && !currentTrial._responsesLoaded) {
      currentTrial._responsesLoaded = true;
    }
  }

  delete loadDataBgState.loadingTrials[trialId];
  renderLoadDataTrialList();
  _updateLoadDataBtnAnimation();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();
}

async function unloadSingleTrialFromPanel(trialId, btnEl) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  if (!trial._responsesLoaded && !(Array.isArray(trial._loadedAreas) && trial._loadedAreas.length > 0)) return;

  // Clear update flags for all areas of this trial
  const totalAreas = (trial.areas || []).length;
  for (let i = 0; i < totalAreas; i++) {
    _setAreaTypeUpdateFlag(trialId, String(i), "observation", false);
    _setAreaTypeUpdateFlag(trialId, String(i), "agronomy", false);
  }

  trial.responses = {};
  trial.agronomyResponses = {};
  trial._responsesLoaded = false;
  trial._loadedAreas = [];
  trial._loadedAreaTypes = {};
  trial._loadSyncMarker = {};

  if (typeof saveLocalCache === "function") {
    saveLocalCache("trials", { trials: trialState.trials });
  }

  renderLoadDataTrialList();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();

  showToast(`Trial "${trial.name}" data unloaded.`, "info");
}

async function loadAllTrialResponses() {
  if (loadDataBgState.loadAllActive || loadDataBgState.refreshAllActive || loadDataBgState.updateAllActive || loadDataBgState.checkingUpdates) return;

  const trials = (trialState.trials || []).filter(t => !t.archived && !t._responsesLoaded);
  if (trials.length === 0) {
    showToast("All trials are already loaded.", "info");
    return;
  }

  loadDataBgState.loadAllActive = true;
  loadDataBgState.loadAllLoaded = 0;
  loadDataBgState.loadAllTotal = trials.length;
  _updateLoadAllUI();
  _updateLoadDataBtnAnimation();

  let loaded = 0;
  for (const trial of trials) {
    if (trial._responsesLoaded) {
      loaded++;
      loadDataBgState.loadAllLoaded = loaded;
      _updateLoadAllUI();
      continue;
    }

    // Load each unloaded area
    const totalAreas = (trial.areas || []).length;
    if (!Array.isArray(trial._loadedAreas)) trial._loadedAreas = [];

    for (let i = 0; i < totalAreas; i++) {
      if (trial._loadedAreas.includes(String(i))) continue;
      const areaKey = `${trial.id}~${i}`;
      try {
        _updateTrialLoadUI(trial.id, { status: "loading", percentage: 0, _areaKey: areaKey, step: "Connecting..." });
        await loadTrialAreaFromDrive(trial.id, i, (info) => {
          _updateTrialLoadUI(trial.id, { status: "loading", ...info, _areaKey: areaKey });
        });
        delete loadDataBgState.loadingTrials[trial.id];
        renderLoadDataTrialList();
      } catch (err) {
        console.error(`Error loading area ${i} of trial ${trial.id}:`, err);
        delete loadDataBgState.loadingTrials[trial.id];
        renderLoadDataTrialList();
      }
    }

    // Re-verify _responsesLoaded on the current trial object in trialState
    // (the captured `trial` reference may be stale after background sync)
    const currentTrial = trialState.trials.find(t => t.id === trial.id);
    if (currentTrial) {
      const la = Array.isArray(currentTrial._loadedAreas) ? currentTrial._loadedAreas : [];
      const ta = (currentTrial.areas || []).length;
      if (ta > 0 && la.length >= ta && !currentTrial._responsesLoaded) {
        currentTrial._responsesLoaded = true;
      }
    }

    if ((currentTrial || trial)._responsesLoaded) loaded++;
    loadDataBgState.loadAllLoaded = loaded;
    _updateLoadAllUI();
  }

  loadDataBgState.loadAllActive = false;
  _updateLoadAllUI();
  _updateLoadDataBtnAnimation();
  renderLoadDataTrialList();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();

  showToast(`Loaded ${loaded} of ${trials.length} trial(s).`, loaded === trials.length ? "success" : "warning");
}

async function refreshAllTrialUpdates() {
  if (loadDataBgState.checkingUpdates || loadDataBgState.refreshAllActive || loadDataBgState.updateAllActive) return;

  loadDataBgState.refreshAllActive = true;
  _updateLoadAllUI();
  _updateLoadDataBtnAnimation();

  try {
    await checkLoadedTrialUpdates({ silent: false });
  } finally {
    loadDataBgState.refreshAllActive = false;
    _updateLoadAllUI();
    _updateLoadDataBtnAnimation();
    _syncUpdateAllBtn();
  }
}

async function updateAllTrialData() {
  const updateBtn = document.getElementById("updateAllTrialsBtn");
  if (loadDataBgState.updateAllActive || loadDataBgState.loadAllActive || loadDataBgState.refreshAllActive) return;

  const flagKeys = Object.keys(loadDataBgState.updateFlags);
  if (flagKeys.length === 0) return;

  // Collect unique { trialId, areaIndex, type } entries
  const tasks = flagKeys.map((key) => {
    const [trialId, areaIdx, type] = key.split("~");
    return { trialId, areaIndex: Number(areaIdx), type };
  });

  loadDataBgState.updateAllActive = true;
  loadDataBgState.updateAllDone = 0;
  loadDataBgState.updateAllTotal = tasks.length;
  _updateLoadAllUI();
  _updateLoadDataBtnAnimation();

  let done = 0;
  for (const task of tasks) {
    try {
      const areaKey = `${task.trialId}~${task.areaIndex}`;
      _updateTrialLoadUI(task.trialId, {
        status: "loading", percentage: 0, _areaKey: areaKey, _loadType: task.type, step: "Updating...",
      });

      await loadTrialAreaFromDrive(task.trialId, task.areaIndex, (info) => {
        _updateTrialLoadUI(task.trialId, { status: "loading", ...info, _areaKey: areaKey, _loadType: task.type });
      }, { type: task.type, force: true });

      _setAreaTypeUpdateFlag(task.trialId, String(task.areaIndex), task.type, false);
      delete loadDataBgState.loadingTrials[task.trialId];
    } catch (err) {
      console.error(`Error updating ${task.type} for area ${task.areaIndex} of trial ${task.trialId}:`, err);
      delete loadDataBgState.loadingTrials[task.trialId];
    }

    done++;
    loadDataBgState.updateAllDone = done;
    _updateLoadAllUI();
    renderLoadDataTrialList();
  }

  loadDataBgState.updateAllActive = false;
  loadDataBgState.updateAllDone = 0;
  loadDataBgState.updateAllTotal = 0;
  if (updateBtn) updateBtn.classList.remove("is-loading");
  _updateLoadDataBtnAnimation();
  _updateLoadAllUI();
  renderLoadDataTrialList();

  if (typeof updateDashboardCounts === "function") updateDashboardCounts();
  if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
  if (typeof renderTrials === "function") renderTrials();

  showToast(`Updated ${done} of ${tasks.length} item(s).`, done === tasks.length ? "success" : "warning");
}

function _syncUpdateAllBtn() {
  const updateBtn = document.getElementById("updateAllTrialsBtn");
  if (!updateBtn) return;

  const anyTrialLoading = _isAnyTrialLoading();
  if (loadDataBgState.updateAllActive) {
    updateBtn.style.display = "";
    updateBtn.disabled = true;
    updateBtn.classList.add("is-loading");
    updateBtn.innerHTML = `<span class="spinner-sm"></span> ${loadDataBgState.updateAllDone}/${loadDataBgState.updateAllTotal}`;
    return;
  }

  updateBtn.classList.remove("is-loading");
  const count = Object.keys(loadDataBgState.updateFlags).length;
  if (count > 0) {
    updateBtn.style.display = "";
    updateBtn.disabled = loadDataBgState.loadAllActive || loadDataBgState.refreshAllActive || loadDataBgState.checkingUpdates || anyTrialLoading;
    updateBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px">update</span> Update All (${count})`;
  } else {
    updateBtn.style.display = "none";
  }
}

// ---- Category Tabs ----

function renderLoadDataCategorySummary(category) {
  const container = document.getElementById(`loadData${category.charAt(0).toUpperCase() + category.slice(1)}Summary`);
  if (!container) return;

  const items = inventoryState.items[category] || [];
  container.innerHTML = `<span class="load-data-summary-count">${items.length}</span> ${category} item${items.length !== 1 ? "s" : ""} currently loaded.`;
}

async function refreshCategoryFromDrive(category) {
  const catDisplay = category.charAt(0).toUpperCase() + category.slice(1);
  const btn = document.getElementById(`loadCategoryBtn${catDisplay}`);
  const summaryEl = document.getElementById(`loadData${catDisplay}Summary`);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Refreshing...';
  }
  if (summaryEl) {
    summaryEl.className = "load-data-summary refreshing";
    summaryEl.innerHTML = '<span class="spinner-sm"></span> Refreshing from Google Drive...';
  }

  try {
    const items = await loadItemsFromGoogleDrive(catDisplay);
    inventoryState.items[category] = items;

    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items });
    }

    // Refresh UI
    if (typeof updateDashboardCounts === "function") updateDashboardCounts();
    if (typeof switchCategory === "function" && inventoryState.currentCategory === category) {
      switchCategory(category);
    }
    if (typeof updateCropTypeSuggestions === "function") updateCropTypeSuggestions();

    if (summaryEl) {
      summaryEl.className = "load-data-summary";
      summaryEl.innerHTML = `<span class="load-data-summary-count">${items.length}</span> ${category} item${items.length !== 1 ? "s" : ""} loaded from Drive.`;
    }

    showToast(`${catDisplay} refreshed (${items.length} items).`, "success");
  } catch (err) {
    console.error(`Error refreshing ${category}:`, err);
    if (summaryEl) {
      summaryEl.className = "load-data-summary";
      summaryEl.innerHTML = `<span style="color:var(--danger)">Error refreshing ${category}: ${escapeHtml(err.message)}</span>`;
    }
    showToast(`Error refreshing ${catDisplay}.`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">cloud_download</span> Refresh';
    }
  }
}

// ---- Library Tab ----

function renderLoadDataLibrarySummary() {
  const container = document.getElementById("loadDataLibrarySummary");
  if (!container) return;

  const count = (typeof libraryState !== "undefined" && libraryState.items) ? libraryState.items.length : 0;
  const driveLoaded = (typeof libraryState !== "undefined") && libraryState._driveLoaded;
  const source = driveLoaded ? "loaded from Drive" : "cached locally";
  container.innerHTML = `<span class="load-data-summary-count">${count}</span> library file${count !== 1 ? "s" : ""} ${source}.`;
}

async function refreshLibraryFromDrive() {
  const btn = document.getElementById("loadCategoryBtnLibrary");
  const summaryEl = document.getElementById("loadDataLibrarySummary");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span> Refreshing...';
  }
  if (summaryEl) {
    summaryEl.className = "load-data-summary refreshing";
    summaryEl.innerHTML = '<span class="spinner-sm"></span> Refreshing from Google Drive...';
  }

  try {
    if (typeof incrementalRefreshLibrary === "function") {
      await incrementalRefreshLibrary();
    } else if (typeof loadLibraryItems === "function") {
      await loadLibraryItems();
    }

    const count = libraryState.items ? libraryState.items.length : 0;
    if (summaryEl) {
      summaryEl.className = "load-data-summary";
      summaryEl.innerHTML = `<span class="load-data-summary-count">${count}</span> library file${count !== 1 ? "s" : ""} loaded from Drive.`;
    }
  } catch (err) {
    console.error("Error refreshing library:", err);
    if (summaryEl) {
      summaryEl.className = "load-data-summary";
      summaryEl.innerHTML = `<span style="color:var(--danger)">Error refreshing library: ${escapeHtml(err.message)}</span>`;
    }
    showToast("Error refreshing library.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">cloud_download</span> Refresh';
    }
  }
}