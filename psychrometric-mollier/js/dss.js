// ==========================================
// dss.js — Rule-based DSS advisor (Fase 4)
// ==========================================

// Ephemeral, not persisted — a fresh session always starts with no target
// zone selected, same as the other floating-window tools (Playback).
const DSS = {
  targetZoneId: "",
  sourceMode: "hover", // "hover" | "sensor" | "playback"
  sourceSensorId: "",
  thresholds: {
    warningDeltaT: 2,      // °C
    criticalDeltaT: 5,     // °C
    warningDeltaW: 0.0015, // kg/kg'
    criticalDeltaW: 0.004, // kg/kg'
  },
};

let dssHoverPoint = null; // {t, w, data} — kept live by render.js's handleMouseMove hook

function onDssHoverUpdate(point) {
  dssHoverPoint = point;
  if (DSS.sourceMode !== "hover") return;
  refreshDssPanel();
  if (currentChartXScale && currentChartYScale) {
    dssLayer.selectAll("*").remove();
    if (typeof renderDssOverlay === "function") {
      renderDssOverlay(dssLayer, currentChartXScale, currentChartYScale, currentChartPatm);
    }
  }
}

function getDssActualPoint() {
  if (DSS.sourceMode === "sensor") {
    if (!DSS.sourceSensorId) return null;
    const sensor = State.sensors.find((s) => String(s.id) === String(DSS.sourceSensorId));
    if (!sensor || !Number.isFinite(sensor.t) || !Number.isFinite(sensor.w)) return null;
    return { t: sensor.t, w: sensor.w, data: calculateAllProperties(sensor.t, sensor.w, getPressureInPa()) };
  }

  if (DSS.sourceMode === "playback") {
    if (typeof Playback === "undefined" || !Playback.rows.length) return null;
    const row = Playback.rows[Playback.index];
    return row ? { t: row.t, w: row.w, data: row.data } : null;
  }

  return dssHoverPoint;
}

function getDssTargetZone() {
  if (!DSS.targetZoneId) return null;

  const userZone = State.zones.find((z) => String(z.id) === String(DSS.targetZoneId));
  if (userZone) return userZone;

  if (typeof getVisibleRealDataZones === "function") {
    const realDataZones = getVisibleRealDataZones(getPressureInPa());
    const found = realDataZones.find((z) => String(z.id) === String(DSS.targetZoneId));
    if (found) return found;
  }

  return null;
}

// Nearest point on a polygon's perimeter to a pixel, via per-edge projection.
function nearestPointOnPolygonPixels(actualPx, polygonPx) {
  let best = null;
  const n = polygonPx.length;
  for (let i = 0; i < n; i++) {
    const a = polygonPx[i];
    const b = polygonPx[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let candidate;
    if (lenSq < 1e-9) {
      candidate = { x: a.x, y: a.y };
    } else {
      let frac = ((actualPx.x - a.x) * dx + (actualPx.y - a.y) * dy) / lenSq;
      frac = Math.max(0, Math.min(1, frac));
      candidate = { x: a.x + frac * dx, y: a.y + frac * dy };
    }
    const dist = Math.hypot(candidate.x - actualPx.x, candidate.y - actualPx.y);
    if (!best || dist < best.dist) best = { x: candidate.x, y: candidate.y, dist };
  }
  return best;
}

function classifyDssSeverity(deltaT, deltaW) {
  const magT = Math.abs(deltaT), magW = Math.abs(deltaW);
  if (magT >= DSS.thresholds.criticalDeltaT || magW >= DSS.thresholds.criticalDeltaW) return "critical";
  if (magT >= DSS.thresholds.warningDeltaT || magW >= DSS.thresholds.warningDeltaW) return "warning";
  return "info";
}

function buildDssActions(deltaT, deltaW) {
  const actions = [];
  const tDeadband = 0.3;   // °C — ignore negligible overshoot to avoid noisy flip-flopping
  const wDeadband = 0.0003; // kg/kg'

  if (deltaT > tDeadband) {
    actions.push({ type: "heating", text: `${translateLiteral("Increase air temperature")} ~${deltaT.toFixed(1)}°C (${translateLiteral("heating / reduce night ventilation")}).` });
  } else if (deltaT < -tDeadband) {
    actions.push({ type: "cooling", text: `${translateLiteral("Decrease air temperature")} ~${Math.abs(deltaT).toFixed(1)}°C (${translateLiteral("ventilation / evaporative cooling / shading")}).` });
  }

  if (deltaW > wDeadband) {
    actions.push({ type: "humidify", text: `${translateLiteral("Increase humidity")} (${translateLiteral("fogging/misting")}) — ${translateLiteral("raise humidity ratio")} ~${(deltaW * 1000).toFixed(2)} g/kg.` });
  } else if (deltaW < -wDeadband) {
    actions.push({ type: "dehumidify", text: `${translateLiteral("Decrease humidity")} (${translateLiteral("ventilation/dehumidification")}) — ${translateLiteral("lower humidity ratio")} ~${(Math.abs(deltaW) * 1000).toFixed(2)} g/kg.` });
  }

  return actions;
}

// Core advisor: compares an actual (t,w) reading against a target zone
// polygon. The "nearest point" is computed in screen-pixel space (via the
// current chart scales) rather than raw (°C, kg/kg) space, because those two
// axes have wildly different numeric ranges — pixel space is exactly what a
// user visually perceives as "closest", and it's a natural byproduct of the
// same chartXY/getTandWFromCoords pair already used for chart interaction.
function computeDssRecommendation(actual, zone, x, y, Patm) {
  if (!actual || !zone || !Array.isArray(zone.points) || zone.points.length < 3) return null;

  const inside = isPointInPolygon(actual.t, actual.w, zone.points);
  if (inside) {
    return { inside: true, deltaT: 0, deltaW: 0, severity: "ok", actions: [], nearest: { t: actual.t, w: actual.w } };
  }

  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);

  const zonePx = zone.points.map((p) => chartXY(p.t, p.w, x, y, Patm));
  const actualPx = chartXY(actual.t, actual.w, x, y, Patm);
  const nearestPx = nearestPointOnPolygonPixels(actualPx, zonePx);
  const nearest = getTandWFromCoords(nearestPx.x, nearestPx.y, x, y, minT, maxT, maxH, Patm);

  const deltaT = nearest.t - actual.t;
  const deltaW = nearest.w - actual.w;
  const severity = classifyDssSeverity(deltaT, deltaW);
  const actions = buildDssActions(deltaT, deltaW);

  return { inside: false, deltaT, deltaW, severity, actions, nearest };
}

function openDssWindow() {
  syncDssZoneSelect();
  syncDssSensorSelect();
  showFloatingWindow("floating-dss-window");
  refreshDssPanel();
}

function syncDssZoneSelect() {
  const select = document.getElementById("dss-zone-select");
  if (!select) return;
  const current = DSS.targetZoneId || "";

  const userZoneOptions = State.zones
    .map((zone, index) => `<option value="${zone.id}">${escapeHtml(getLocalizedDisplayName(zone.name, "zone", index + 1))}</option>`)
    .join("");

  const realDataZones = typeof getVisibleRealDataZones === "function" ? getVisibleRealDataZones(getPressureInPa()) : [];
  const realDataOptions = realDataZones
    .map((zone) => `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`)
    .join("");

  select.innerHTML = `<option value="">${escapeHtml(translateLiteral("None"))}</option>`
    + (userZoneOptions ? `<optgroup label="${escapeHtml(translateLiteral("My zones"))}">${userZoneOptions}</optgroup>` : "")
    + (realDataOptions ? `<optgroup label="${escapeHtml(translateLiteral("Plant envelopes"))}">${realDataOptions}</optgroup>` : "");

  const stillExists = [...select.options].some((o) => o.value === current);
  select.value = stillExists ? current : "";
  DSS.targetZoneId = select.value;
}

function syncDssSensorSelect() {
  const select = document.getElementById("dss-sensor-select");
  if (!select) return;
  const current = DSS.sourceSensorId || "";
  const opts = State.sensors.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  select.innerHTML = opts || `<option value="" disabled>${escapeHtml(translateLiteral("No sensors added."))}</option>`;
  const stillExists = State.sensors.some((s) => String(s.id) === String(current));
  select.value = stillExists ? current : "";
  DSS.sourceSensorId = select.value;
}

function setDssZone(zoneId) {
  DSS.targetZoneId = zoneId || "";
  refreshDssOverlayAndPanel();
}

function setDssSourceMode(mode) {
  DSS.sourceMode = mode;
  const sensorRow = document.getElementById("dss-sensor-row");
  if (sensorRow) sensorRow.style.display = mode === "sensor" ? "" : "none";
  if (mode === "sensor") syncDssSensorSelect();

  ["hover", "sensor", "playback"].forEach((m) => {
    const btn = document.getElementById("seg-dss-" + m);
    if (btn) btn.classList.toggle("active", m === mode);
  });

  refreshDssOverlayAndPanel();
}

function setDssSensor(sensorId) {
  DSS.sourceSensorId = sensorId || "";
  refreshDssOverlayAndPanel();
}

function updateDssThresholds() {
  const warningDeltaT = parseFloat(document.getElementById("dss-warning-deltat")?.value);
  const criticalDeltaT = parseFloat(document.getElementById("dss-critical-deltat")?.value);
  const warningDeltaWgkg = parseFloat(document.getElementById("dss-warning-deltaw")?.value);
  const criticalDeltaWgkg = parseFloat(document.getElementById("dss-critical-deltaw")?.value);

  if (Number.isFinite(warningDeltaT)) DSS.thresholds.warningDeltaT = warningDeltaT;
  if (Number.isFinite(criticalDeltaT)) DSS.thresholds.criticalDeltaT = criticalDeltaT;
  if (Number.isFinite(warningDeltaWgkg)) DSS.thresholds.warningDeltaW = warningDeltaWgkg / 1000;
  if (Number.isFinite(criticalDeltaWgkg)) DSS.thresholds.criticalDeltaW = criticalDeltaWgkg / 1000;

  refreshDssOverlayAndPanel();
}

function refreshDssOverlayAndPanel() {
  refreshDssPanel();
  if (currentChartXScale && currentChartYScale) {
    dssLayer.selectAll("*").remove();
    if (typeof renderDssOverlay === "function") {
      renderDssOverlay(dssLayer, currentChartXScale, currentChartYScale, currentChartPatm);
    }
  }
}

const DSS_SEVERITY_LABEL = { ok: "In target zone", info: "Near boundary", warning: "Outside target zone", critical: "Critical deviation" };

function renderDssSeverityBadge(severity) {
  return `<span class="dss-badge dss-badge-${severity}">${escapeHtml(translateLiteral(DSS_SEVERITY_LABEL[severity] || severity))}</span>`;
}

function refreshDssPanel() {
  const panel = document.getElementById("dss-recommendation-panel");
  if (!panel) return;

  const zone = getDssTargetZone();
  if (!zone) {
    panel.innerHTML = `<p class="panel-desc">${escapeHtml(translateLiteral("Select a target zone to get recommendations."))}</p>`;
    return;
  }

  const actual = getDssActualPoint();
  if (!actual) {
    const hint = DSS.sourceMode === "sensor"
      ? translateLiteral("Waiting for sensor data…")
      : DSS.sourceMode === "playback"
        ? translateLiteral("Select a playback dataset first.")
        : translateLiteral("Hover over the chart to inspect a condition.");
    panel.innerHTML = `<p class="panel-desc">${escapeHtml(hint)}</p>`;
    return;
  }

  const x = currentChartXScale, y = currentChartYScale;
  if (!x || !y) {
    panel.innerHTML = `<p class="panel-desc">${escapeHtml(translateLiteral("Chart not ready yet."))}</p>`;
    return;
  }

  const rec = computeDssRecommendation(actual, zone, x, y, currentChartPatm);
  if (!rec) {
    panel.innerHTML = `<p class="panel-desc">${escapeHtml(translateLiteral("Could not evaluate the selected zone."))}</p>`;
    return;
  }

  const actionsHtml = rec.actions.length
    ? `<div class="dss-actions-list">${rec.actions.map((a) => `<div class="dss-action-row dss-action-${a.type}">${escapeHtml(a.text)}</div>`).join("")}</div>`
    : `<p class="panel-desc">${escapeHtml(translateLiteral("Condition is within the target zone — no action needed."))}</p>`;

  panel.innerHTML = `
    <div class="dss-current-row">
      <span>Tdb ${actual.t.toFixed(1)}°C · W ${actual.w.toFixed(4)} kg/kg' · VPD ${(actual.data.VPD / 1000).toFixed(2)} kPa</span>
      ${renderDssSeverityBadge(rec.severity)}
    </div>
    <div class="dss-delta-row">
      <span>&Delta;Tdb: <strong>${rec.deltaT >= 0 ? "+" : ""}${rec.deltaT.toFixed(1)}°C</strong></span>
      <span>&Delta;W: <strong>${rec.deltaW >= 0 ? "+" : ""}${(rec.deltaW * 1000).toFixed(2)} g/kg</strong></span>
    </div>
    ${actionsHtml}`;
}

// Called from render.js's drawChart() (full redraw) and from the lightweight
// hover-update path (no full redraw) — callers are responsible for clearing
// the layer first, matching the convention established by playback.js.
function renderDssOverlay(layer, x, y, Patm) {
  const zone = getDssTargetZone();
  const actual = getDssActualPoint();
  if (!zone || !actual) return;

  const rec = computeDssRecommendation(actual, zone, x, y, Patm);
  if (!rec) return;

  const actualPt = chartXY(actual.t, actual.w, x, y, Patm);

  if (rec.inside) {
    layer.append("circle")
      .attr("class", "dss-ok-marker")
      .attr("cx", actualPt.x).attr("cy", actualPt.y).attr("r", 9)
      .attr("fill", "none").attr("stroke", "#2e7d32").attr("stroke-width", 2.5);
    return;
  }

  const nearestPt = chartXY(rec.nearest.t, rec.nearest.w, x, y, Patm);
  const arrowColor = rec.severity === "critical" ? "#c62828" : "#ef6c00";
  const markerId = "dss-arrowhead";

  let defs = layer.select("defs");
  if (defs.empty()) defs = layer.append("defs");
  defs.html(`<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${arrowColor}"></path></marker>`);

  layer.append("line")
    .attr("class", "dss-correction-arrow")
    .attr("x1", actualPt.x).attr("y1", actualPt.y)
    .attr("x2", nearestPt.x).attr("y2", nearestPt.y)
    .attr("stroke", arrowColor).attr("stroke-width", 2.5)
    .attr("marker-end", `url(#${markerId})`);

  layer.append("circle")
    .attr("class", "dss-actual-marker")
    .attr("cx", actualPt.x).attr("cy", actualPt.y).attr("r", 6)
    .attr("fill", arrowColor).attr("stroke", "#fff").attr("stroke-width", 1.5);
}
