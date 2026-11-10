// ==========================================
// features.js — batch CSV, live sensor, auto-zone
// ==========================================

// ==========================================
// POINT: BATCH CSV
// ==========================================

function parseBatchCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const results = [];
  const errors = [];

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const parts = line.split(",").map(s => s.trim());
    let name, tdb, w;

    if (parts.length >= 3) {
      name = parts[0];
      tdb = parseFloat(parts[1]);
      w = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      name = null;
      tdb = parseFloat(parts[0]);
      w = parseFloat(parts[1]);
    } else {
      errors.push(formatI18n("csvExpectedColumns", { line: idx + 1 }));
      return;
    }

    if (isNaN(tdb) || isNaN(w)) {
      errors.push(formatI18n("csvNonNumeric", {
        line: idx + 1,
        tdb: parts[parts.length - 2],
        w: parts[parts.length - 1],
      }));
      return;
    }

    if (w < 0 || w > 0.5) {
      errors.push(formatI18n("csvWOutOfRange", { line: idx + 1, w }));
      return;
    }

    results.push({ name: name || formatI18n("defaultBatchPointName", { index: results.length + 1 }), t: tdb, w });
  });

  return { results, errors };
}

function previewBatchPoints() {
  const text = document.getElementById("batch-csv-input").value;
  const preview = document.getElementById("batch-parse-preview");
  preview.style.display = "block";

  if (!text.trim()) {
    preview.innerHTML = `<span style="color:#999">${formatI18n("batchPasteFirst")}</span>`;
    applyLanguage(preview);
    return;
  }

  const { results, errors } = parseBatchCSV(text);

  if (errors.length > 0) {
    preview.innerHTML = `<span style="color:#c62828">${errors.map(escapeHtml).join("<br>")}</span>`;
  } else if (results.length === 0) {
    preview.innerHTML = `<span style="color:#999">${translateLiteral("No valid rows found.")}</span>`;
  } else {
    const rows = results.slice(0, 8).map((row) => formatI18n("batchPreviewRow", {
      name: escapeHtml(row.name),
      tdb: row.t,
      w: row.w,
    })).join("<br>");
    const more = results.length > 8 ? formatI18n("batchPreviewMore", { count: results.length - 8 }) : "";
    preview.innerHTML = `<span style="color:#2e7d32">${formatI18n("batchPreviewReady", { count: results.length, rows, more })}</span>`;
  }

  applyLanguage(preview);
}

function submitBatchPoints() {
  const text = document.getElementById("batch-csv-input").value;
  if (!text.trim()) { alert(translateLiteral("No CSV data entered.")); return; }

  const { results, errors } = parseBatchCSV(text);

  if (errors.length > 0) {
    alert(formatI18n("csvErrors", { errors: errors.join("\n") }));
    return;
  }
  if (results.length === 0) { alert(translateLiteral("No valid rows found.")); return; }

  const Patm = getPressureInPa();
  const colors = ["#cc1919","#1565c0","#6a1e8e","#2e7d32","#e65100","#ad1457","#00695c","#37474f"];

  results.forEach((r, i) => {
    const props = calculateAllProperties(r.t, r.w, Patm);
    State.points.push({
      id: generateEntityId(),
      name: r.name,
      color: colors[i % colors.length],
      t: r.t,
      w: r.w,
      data: props
    });
  });

  historyManager.push(State);
  updateLists();
  drawChart();

  document.getElementById("batch-csv-input").value = "";
  const preview = document.getElementById("batch-parse-preview");
  if (preview) { preview.style.display = "none"; preview.innerHTML = ""; }
}

// ==========================================
// POINT: LIVE SENSOR
// ==========================================

function addSensorPoint() {
  const name = document.getElementById("sensor-name").value.trim();
  const url = document.getElementById("sensor-url").value.trim();
  const tdbField = document.getElementById("sensor-tdb-field").value.trim() || "tdb";
  const wField = document.getElementById("sensor-w-field").value.trim() || "w";
  const intervalSec = Math.max(1, parseFloat(document.getElementById("sensor-interval").value) || 5);

  if (!name) { alert(translateLiteral("Please enter a sensor name/ID.")); return; }
  if (!url) { alert(translateLiteral("Please enter a data URL.")); return; }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      alert(translateLiteral("Only http:// and https:// URLs are supported."));
      return;
    }
  } catch (e) {
    alert(translateLiteral("Invalid URL format."));
    return;
  }

  const sensorId = generateEntityId();
  const Patm = getPressureInPa();

  const sensor = { id: sensorId, name, url, tdbField, wField, intervalSec, status: "connecting", t: null, w: null, lastUpdate: null };
  State.sensors.push(sensor);

  State.points.push({
    id: sensorId,
    name,
    color: "#1565c0",
    t: 25,
    w: 0.01,
    data: calculateAllProperties(25, 0.01, Patm),
    isSensor: true,
    sensorId
  });

  updateLists();
  renderSensorList();
  startSensor(sensorId);

  document.getElementById("sensor-name").value = "";
  document.getElementById("sensor-url").value = "";
}

function startSensor(sensorId) {
  if (_sensorIntervals[sensorId]) clearInterval(_sensorIntervals[sensorId]);
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (!sensor) return;
  const poll = () => fetchSensorData(sensorId);
  poll();
  _sensorIntervals[sensorId] = setInterval(poll, sensor.intervalSec * 1000);
  sensor.status = "polling";
  renderSensorList();
}

function stopSensor(sensorId) {
  if (_sensorIntervals[sensorId]) { clearInterval(_sensorIntervals[sensorId]); delete _sensorIntervals[sensorId]; }
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (sensor) { sensor.status = "stopped"; renderSensorList(); }
}

function removeSensor(sensorId) {
  stopSensor(sensorId);
  State.sensors = State.sensors.filter(s => s.id !== sensorId);
  State.points = State.points.filter(p => p.sensorId !== sensorId);
  updateLists();
  renderSensorList();
  drawChart();
}

async function fetchSensorData(sensorId) {
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (!sensor) return;

  try {
    const response = await fetch(sensor.url, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(formatI18n("invalidHttpRange", { status: response.status }));

    const raw = await response.json();

    const getVal = (obj, path) => path.includes(".")
      ? path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj)
      : obj[path];

    const tdb = parseFloat(getVal(raw, sensor.tdbField));
    const w = parseFloat(getVal(raw, sensor.wField));

    if (isNaN(tdb) || isNaN(w)) {
      throw new Error(formatI18n("sensorFieldsNotNumeric", { tdbField: sensor.tdbField, wField: sensor.wField }));
    }
    if (w < 0 || w > 0.5 || tdb < -100 || tdb > 200) {
      throw new Error(formatI18n("sensorOutOfRange"));
    }

    sensor.t = tdb;
    sensor.w = w;
    sensor.lastUpdate = new Date();
    sensor.status = "live";

    const Patm = getPressureInPa();
    const idx = State.points.findIndex(p => p.sensorId === sensorId);
    if (idx !== -1) {
      State.points[idx].t = tdb;
      State.points[idx].w = w;
      State.points[idx].data = calculateAllProperties(tdb, w, Patm);
    }

    // Time-series logging + live DSS alert check (Fase 5), defined in iot.js
    // which loads after this file — safe, only invoked from this async
    // callback long after the full page (and iot.js) has loaded.
    if (typeof onSensorReadingLogged === "function") onSensorReadingLogged(sensor);

    renderSensorList();
    updateLists();
    drawChart();

  } catch (e) {
    sensor.status = formatI18n("sensorErrorPrefix", { message: e.message.substring(0, 50) });
    renderSensorList();
  }
}

function renderSensorList() {
  const panel = document.getElementById("sensor-list-panel");
  if (!panel) return;

  if (State.sensors.length === 0) {
    panel.innerHTML = `<div style="font-size:11px;color:#999;text-align:center;padding:6px;">No sensors added.</div>`;
    applyLanguage(panel);
    return;
  }

  panel.innerHTML = State.sensors.map(s => {
    const statusClass = s.status === "live" ? "status-live" : s.status === "polling" || s.status === "connecting" ? "status-polling" : s.status === "stopped" ? "status-stopped" : "status-error";
    const isRunning = !!_sensorIntervals[s.id];
    const tsStr = s.lastUpdate ? s.lastUpdate.toLocaleTimeString() : "";
    const dataStr = s.t !== null
      ? formatI18n("sensorDataString", { tdb: s.t.toFixed(1), w: s.w.toFixed(4) })
      : translateLiteral("Waiting for data…");
    return `
      <div class="sensor-item">
        <div class="sensor-item-header">
          <span class="sensor-status-dot ${statusClass}"></span>
          <span class="sensor-name">${escapeHtml(s.name)}</span>
          <div class="sensor-actions">
            ${isRunning
              ? `<div class="icon-btn" onclick="stopSensor(${s.id})" title="Pause"><span class="material-symbols-rounded">pause</span></div>`
              : `<div class="icon-btn" onclick="startSensor(${s.id})" title="Resume"><span class="material-symbols-rounded">play_arrow</span></div>`}
            <div class="icon-btn btn-delete" onclick="removeSensor(${s.id})" title="Remove"><span class="material-symbols-rounded">delete</span></div>
          </div>
        </div>
        <div class="sensor-item-detail">${dataStr}${tsStr ? " \u2502 " + tsStr : ""}<br><span style="color:#aaa">${escapeHtml(getSensorStatusLabel(s.status))}</span></div>
      </div>`;
  }).join("");

  applyLanguage(panel);
}

// ==========================================
// ZONE: AUTO ZONE BY TARGET PARAMETER
// ==========================================

function getWForAutoZoneParam(t, paramType, val, Patm) {
  switch (paramType) {
    case "RH": {
      const Pws = Psychro.getSatVapPres(t);
      return Psychro.getWFromPw(Pws * (val / 100), Patm);
    }
    case "VPD": {
      const Pws = Psychro.getSatVapPres(t);
      const Pw = Pws - val * 1000; // val in kPa, Pws in Pa
      if (Pw <= 0) return null;
      return Psychro.getWFromPw(Pw, Patm);
    }
    case "W": return val;
    case "h": {
      const w = Psychro.getWFromEnthalpyLine(t, val);
      return (w >= 0) ? w : null;
    }
    case "Twb": {
      const w = Psychro.getWFromTwbLine(t, val, Patm);
      return (w >= 0) ? w : null;
    }
    case "Tdp": {
      // Dew point → partial pressure → humidity ratio (independent of t)
      const Pws_dp = Psychro.getSatVapPres(val);
      return Psychro.getWFromPw(Pws_dp, Patm);
    }
    default: return null;
  }
}

function generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH) {
  const tStep = 0.5;
  const upper = [];
  const lower = [];

  for (let t = minT; t <= maxT + 0.01; t += tStep) {
    const wHigh = getWForAutoZoneParam(t, paramType, maxVal, Patm);
    if (wHigh !== null && wHigh >= 0 && wHigh <= maxH * 1.05) {
      upper.push({ t, w: Math.min(wHigh, maxH) });
    }
    const wLow = getWForAutoZoneParam(t, paramType, minVal, Patm);
    if (wLow !== null && wLow >= 0 && wLow <= maxH * 1.05) {
      lower.push({ t, w: Math.min(wLow, maxH) });
    }
  }

  if (upper.length < 2 && lower.length < 2) return [];
  // For params where w is independent of t (W, Tdp), supplement with t-range boundaries
  if (paramType === "W" || paramType === "Tdp") {
    return [
      { t: minT, w: maxVal <= maxH ? maxVal : maxH },
      { t: maxT, w: maxVal <= maxH ? maxVal : maxH },
      { t: maxT, w: minVal },
      { t: minT, w: minVal }
    ];
  }
  return [...upper, ...lower.slice().reverse()];
}

function previewAutoZone() {
  const paramType = document.getElementById("auto-zone-param").value;
  const minVal = parseFloat(document.getElementById("auto-zone-min").value);
  const maxVal = parseFloat(document.getElementById("auto-zone-max").value);

  if (isNaN(minVal) || isNaN(maxVal) || minVal >= maxVal) {
    State.rangePreview = [];
    drawChart();
    return;
  }

  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);

  State.rangePreview = generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH);
  drawChart();
}

function submitAutoZone() {
  const paramType = document.getElementById("auto-zone-param").value;
  const minVal = parseFloat(document.getElementById("auto-zone-min").value);
  const maxVal = parseFloat(document.getElementById("auto-zone-max").value);

  if (isNaN(minVal) || isNaN(maxVal)) { alert(translateLiteral("Enter valid min and max values.")); return; }
  if (minVal >= maxVal) { alert(translateLiteral("Min must be less than max.")); return; }

  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);

  const points = generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH);
  if (points.length < 3) { alert(translateLiteral("Could not generate a valid zone. Check parameter values and chart bounds.")); return; }

  const labels = { RH: "RH", VPD: "VPD", W: "W", h: "h", Twb: "Twb", Tdp: "Tdp" };
  const zone = {
    id: generateEntityId(),
    name: `Auto ${labels[paramType]} ${minVal}\u2013${maxVal}`,
    color: "#7b1fa2",
    points,
    source: { kind: "auto-zone", paramType, minVal, maxVal, minT, maxT, maxH },
  };

  State.zones.push(zone);
  State.rangePreview = [];
  historyManager.push(State);
  updateLists();
  drawChart();
}

// ==========================================
// ZONE / GEOMETRY HELPERS
// ==========================================

function isPointInPolygon(t, w, polygonPoints) {
  let inside = false;
  const n = polygonPoints.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygonPoints[i].t, yi = polygonPoints[i].w;
    const xj = polygonPoints[j].t, yj = polygonPoints[j].w;
    if (((yi > w) !== (yj > w)) && (t < (xj - xi) * (w - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Full drawChart() tears down and rebuilds the whole SVG, so high-frequency
// triggers (resize drag, number-input spinners) are coalesced behind a short
// trailing debounce.
