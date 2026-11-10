// ==========================================
// persist.js — IndexedDB persistence, app bootstrap, keyboard shortcuts
// ==========================================

const LOCAL_DB_NAME = "psychrometric-mollier";
const LOCAL_DB_STORE = "workspace";
const LOCAL_DB_KEY = "app-state";
let localDbPromise = null;
let persistTimer = null;
let isHydratingPersistedState = false;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function openLocalDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (localDbPromise) return localDbPromise;

  localDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_DB_STORE)) {
        db.createObjectStore(LOCAL_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return localDbPromise;
}

function captureSettingsSnapshot() {
  const infoFields = getSelectedInfoFields();
  return {
    language: State.language,
    realDataZoneVisibility: cloneValue(State.realDataZoneVisibility),
    chartType: State.chartType,
    yAxisType: State.yAxisType,
    pressure: getInputValue("pressure"),
    pressureUnit: getInputValue("pressure-unit"),
    minTemp: getInputValue("minTemp"),
    maxTemp: getInputValue("maxTemp"),
    maxHum: getInputValue("maxHum"),
    maxAbsHum: getInputValue("maxAbsHum"),
    minHum: getInputValue("minHum"),
    minAbsHum: getInputValue("minAbsHum"),
    showInfoPanel: getCheckboxValue("set-show-info-panel"),
    infoPrecisionDecimals: getInfoPrecisionDecimals(),
    infoPrecisionOffset: getInfoPrecisionDecimals() - DEFAULT_INFO_PRECISION_DECIMALS,
    infoFields: infoFields.join("|"),
    infoPrimary: infoFields[0] || "",
    infoSecondary: infoFields[1] || "",
    minimapMode: normalizeMinimapMode(State.minimapMode),
    showLegend: getCheckboxValue("set-show-legend"),
    labelInterval: getInputValue("set-line-label-step"),
    showRh: getCheckboxValue("set-show-rh"),
    showH: getCheckboxValue("set-show-h"),
    showTwb: getCheckboxValue("set-show-twb"),
    showV: getCheckboxValue("set-show-v"),
    showSat: getCheckboxValue("set-show-sat"),
    showTdp: getCheckboxValue("set-show-tdp"),
  };
}

function captureDataSnapshot() {
  return {
    points: State.points.map((point) => ({
      name: point.name,
      color: point.color,
      t: point.t,
      w: point.w,
      isSensor: !!point.isSensor,
      ...(point.sensorId ? { sensorId: point.sensorId } : {}),
      ...(point.source ? { source: cloneValue(point.source) } : {}),
    })),
    zones: State.zones.map((zone) => ({
      name: zone.name,
      color: zone.color,
      points: zone.points.map((point) => ({
        t: point.t,
        w: point.w,
        ...(point.source ? { source: cloneValue(point.source) } : {}),
      })),
      ...(zone.source ? { source: cloneValue(zone.source) } : {}),
    })),
    sensors: State.sensors.map((sensor) => ({
      id: sensor.id,
      name: sensor.name,
      url: sensor.url,
      tdbField: sensor.tdbField,
      wField: sensor.wField,
      intervalSec: sensor.intervalSec,
      running: !!_sensorIntervals[sensor.id],
    })),
  };
}

function captureRuntimeSnapshot() {
  return {
    mode: State.mode,
    pointSubMode: State.pointSubMode,
    zoneSubMode: State.zoneSubMode,
    viewMinH: State.viewMinH,
    viewMinAH: State.viewMinAH,
  };
}

// v3 snapshots are a strict subset of v4 (v4 adds point.source, point.sensorId
// and data.sensors), so both hydrate safely; anything else is discarded.
const PERSISTED_SNAPSHOT_VERSION = 4;
const MIN_SUPPORTED_SNAPSHOT_VERSION = 3;

function buildPersistedSnapshot() {
  return {
    version: PERSISTED_SNAPSHOT_VERSION,
    settings: captureSettingsSnapshot(),
    data: captureDataSnapshot(),
    runtime: captureRuntimeSnapshot(),
  };
}

async function writePersistedSnapshot(snapshot) {
  const db = await openLocalDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readwrite");
    tx.objectStore(LOCAL_DB_STORE).put(snapshot, LOCAL_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readPersistedSnapshot() {
  const db = await openLocalDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readonly");
    const request = tx.objectStore(LOCAL_DB_STORE).get(LOCAL_DB_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function clearPersistedSnapshot() {
  const db = await openLocalDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readwrite");
    tx.objectStore(LOCAL_DB_STORE).delete(LOCAL_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function queuePersistedStateSave() {
  if (isHydratingPersistedState) return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    writePersistedSnapshot(buildPersistedSnapshot()).catch(() => {});
  }, 180);
}

const DEFAULT_SETTINGS_SNAPSHOT = cloneValue(captureSettingsSnapshot());
const DEFAULT_RUNTIME_SNAPSHOT = cloneValue(captureRuntimeSnapshot());

function restorePersistedSensors(sensors) {
  if (!Array.isArray(sensors) || sensors.length === 0) return;

  State.sensors = sensors
    .filter((sensor) => sensor && sensor.id && sensor.url)
    .map((sensor) => ({
      id: sensor.id,
      name: sensor.name || "Sensor",
      url: sensor.url,
      tdbField: sensor.tdbField || "tdb",
      wField: sensor.wField || "w",
      intervalSec: Math.max(1, parseFloat(sensor.intervalSec) || 5),
      status: "stopped",
      t: null,
      w: null,
      lastUpdate: null,
    }));

  sensors.forEach((sensor) => {
    if (sensor && sensor.id && sensor.running) startSensor(sensor.id);
  });
  renderSensorList();
}

function resetWorkingCollections() {
  Object.keys(_sensorIntervals).forEach((sensorId) => {
    clearInterval(_sensorIntervals[sensorId]);
    delete _sensorIntervals[sensorId];
  });
  State.points = [];
  State.zones = [];
  State.tempZone = [];
  State.rangePreview = [];
  State.sensors = [];
  State.selectedPointId = null;
  State.selectedZoneId = null;
}

async function initializeApp() {
  isHydratingPersistedState = true;
  State.language = getStoredLanguage();
  setRealDataZoneVisibilityMap(State.realDataZoneVisibility);
  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = State.language;
  }
  renderCursorFieldSettings(DEFAULT_CURSOR_FIELDS);
  setSettingsTab("general");
  setMinimapMode(State.minimapMode, { redraw: false });
  applyLanguage();
  try {
    const rawSnapshot = await readPersistedSnapshot();
    const snapshot = rawSnapshot
      && Number.isInteger(rawSnapshot.version)
      && rawSnapshot.version >= MIN_SUPPORTED_SNAPSHOT_VERSION
      && rawSnapshot.version <= PERSISTED_SNAPSHOT_VERSION
      ? rawSnapshot
      : null;
    if (rawSnapshot && !snapshot) {
      console.warn(`Ignoring persisted snapshot with unsupported version: ${rawSnapshot.version}`);
    }
    if (snapshot?.settings) {
      applyImportedSettings(snapshot.settings);
    }
    await loadRealDataCatalog();
    resetWorkingCollections();
    if (snapshot?.data) {
      applyImportedData(snapshot.data.points || [], snapshot.data.zones || []);
      restorePersistedSensors(snapshot.data.sensors);
    } else {
      updateLists();
    }
    State.viewMinH = snapshot?.runtime?.viewMinH ?? DEFAULT_RUNTIME_SNAPSHOT.viewMinH;
    State.viewMinAH = snapshot?.runtime?.viewMinAH ?? DEFAULT_RUNTIME_SNAPSHOT.viewMinAH;
    setMode(snapshot?.runtime?.mode || DEFAULT_RUNTIME_SNAPSHOT.mode);
    setPointSubMode(snapshot?.runtime?.pointSubMode || DEFAULT_RUNTIME_SNAPSHOT.pointSubMode);
    setZoneSubMode(snapshot?.runtime?.zoneSubMode || DEFAULT_RUNTIME_SNAPSHOT.zoneSubMode);
    updateZonePtCount();
    drawChart();
    scheduleAnimatedTabRefresh();
  } catch (_) {
    await loadRealDataCatalog();
    updateLists();
    drawChart();
    scheduleAnimatedTabRefresh();
  } finally {
    isHydratingPersistedState = false;
  }
}

async function resetLocalState() {
  const confirmed = window.confirm(translateLiteral("Reset all local settings, points, and zones to their defaults?"));
  if (!confirmed) return;

  isHydratingPersistedState = true;
  try {
    await clearPersistedSnapshot();
    resetWorkingCollections();
    State.viewMinH = DEFAULT_RUNTIME_SNAPSHOT.viewMinH;
    State.viewMinAH = DEFAULT_RUNTIME_SNAPSHOT.viewMinAH;
    applyImportedSettings(DEFAULT_SETTINGS_SNAPSHOT);
    updateLists();
    setMode(DEFAULT_RUNTIME_SNAPSHOT.mode);
    setPointSubMode(DEFAULT_RUNTIME_SNAPSHOT.pointSubMode);
    setZoneSubMode(DEFAULT_RUNTIME_SNAPSHOT.zoneSubMode);
    updateZonePtCount();
    drawChart();
    scheduleAnimatedTabRefresh();
  } finally {
    isHydratingPersistedState = false;
  }
}

initializeApp();
initializeAnimatedTabObservers();

document.fonts?.ready?.then(() => scheduleAnimatedTabRefresh());

// === KEYBOARD SHORTCUTS ===

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
    event.preventDefault();
    undoAction();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "y" || (event.key === "z" && event.shiftKey))) {
    event.preventDefault();
    redoAction();
  }
});
