// ==========================================
// iot.js — Sensor time-series logging & live DSS alerts (Fase 5)
// ==========================================

// Separate, independent IndexedDB database from persist.js's "workspace" store
// — sensor logs are an additive, optional feature and must never risk the
// tested app-state persistence path (no shared version/upgrade transaction).
const SENSOR_LOG_DB_NAME = "psychrometric-mollier-sensor-log";
const SENSOR_LOG_STORE = "readings";
let sensorLogDbPromise = null;

function openSensorLogDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (sensorLogDbPromise) return sensorLogDbPromise;

  sensorLogDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(SENSOR_LOG_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SENSOR_LOG_STORE)) {
        const store = db.createObjectStore(SENSOR_LOG_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("bySensor", "sensorId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return sensorLogDbPromise;
}

async function appendSensorReading(sensor) {
  const db = await openSensorLogDb();
  if (!db) return;

  const record = {
    sensorId: String(sensor.id),
    sensorName: sensor.name,
    t: sensor.t,
    w: sensor.w,
    timestamp: new Date().toISOString(),
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(SENSOR_LOG_STORE, "readwrite");
    tx.objectStore(SENSOR_LOG_STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSensorReadings(sensorId) {
  const db = await openSensorLogDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SENSOR_LOG_STORE, "readonly");
    const request = tx.objectStore(SENSOR_LOG_STORE).index("bySensor").getAll(String(sensorId));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    request.onerror = () => reject(request.error);
  });
}

async function getSensorLogSummaries() {
  const db = await openSensorLogDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SENSOR_LOG_STORE, "readonly");
    const request = tx.objectStore(SENSOR_LOG_STORE).getAll();
    request.onsuccess = () => {
      const bySensor = new Map();
      (request.result || []).forEach((r) => {
        if (!bySensor.has(r.sensorId)) bySensor.set(r.sensorId, { sensorId: r.sensorId, sensorName: r.sensorName, count: 0 });
        bySensor.get(r.sensorId).count++;
      });
      resolve([...bySensor.values()]);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearSensorLog(sensorId) {
  const db = await openSensorLogDb();
  if (!db) return;
  const rows = await getSensorReadings(sensorId);
  const tx = db.transaction(SENSOR_LOG_STORE, "readwrite");
  const store = tx.objectStore(SENSOR_LOG_STORE);
  rows.forEach((r) => store.delete(r.id));
  await new Promise((resolve) => { tx.oncomplete = resolve; });
}

// ==========================================
// Toast notifications (real-time DSS alerts)
// ==========================================

function getDssToastContainer() {
  let el = document.getElementById("dss-toast-container");
  if (!el) {
    el = document.createElement("div");
    el.id = "dss-toast-container";
    document.body.appendChild(el);
  }
  return el;
}

function showDssAlertToast(message, severity) {
  const container = getDssToastContainer();
  const toast = document.createElement("div");
  toast.className = `dss-toast dss-toast-${severity}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}

// Fires a toast the moment a live sensor (currently selected as the DSS
// advisor's data source) crosses from "ok" into "warning"/"critical", or
// escalates between those two — not on every poll, only on a severity change.
const dssLastAlertSeverityBySensor = {};

function checkDssSensorAlert(sensor) {
  if (typeof DSS === "undefined" || DSS.sourceMode !== "sensor") return;
  if (String(DSS.sourceSensorId) !== String(sensor.id)) return;
  if (!currentChartXScale || !currentChartYScale) return;

  const zone = getDssTargetZone();
  if (!zone) return;

  const Patm = currentChartPatm ?? getPressureInPa();
  const actual = { t: sensor.t, w: sensor.w, data: calculateAllProperties(sensor.t, sensor.w, Patm) };
  const rec = computeDssRecommendation(actual, zone, currentChartXScale, currentChartYScale, Patm);
  if (!rec) return;

  const prevSeverity = dssLastAlertSeverityBySensor[sensor.id];
  if (rec.severity !== "ok" && rec.severity !== prevSeverity) {
    const actionText = rec.actions.map((a) => a.text).join(" ");
    const headline = rec.severity === "critical" ? translateLiteral("Critical deviation from target zone") : translateLiteral("Outside target zone");
    showDssAlertToast(`${sensor.name}: ${headline}${actionText ? " — " + actionText : ""}`, rec.severity);
  }
  dssLastAlertSeverityBySensor[sensor.id] = rec.severity;
}

// Called from features.js's fetchSensorData() right after a successful poll.
function onSensorReadingLogged(sensor) {
  appendSensorReading(sensor).catch(() => {});
  checkDssSensorAlert(sensor);
}
