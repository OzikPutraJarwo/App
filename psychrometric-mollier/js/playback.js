// ==========================================
// playback.js — Real-data time-series playback & analytics (Fase 3)
// ==========================================

// Ephemeral, not persisted to IndexedDB — a fresh session always starts with
// no dataset selected, same as the other floating-window tools.
const Playback = {
  datasetKey: null,
  rows: [],
  index: 0,
  playing: false,
  speed: 1,
  intervalId: null,
  zoneId: "",
  vpdMin: 0.4,
  vpdMax: 1.2,
  condensationDeltaC: 2,
};

const PLAYBACK_BASE_INTERVAL_MS = 500;

function resolvePlaybackPoint(entry, definition, Patm) {
  if (definition.points.length) {
    const t = Number(entry?.t);
    const w = Number(entry?.w);
    if (Number.isFinite(t) && Number.isFinite(w) && w >= 0) return { t, w };
  }
  return getRealDataPointFromRow(entry, definition.humidityType, Patm);
}

function resolvePlaybackRowsForDefinition(definition, Patm) {
  const rawEntries = definition.points.length ? definition.points : definition.rows;
  const rows = [];

  rawEntries.forEach((entry) => {
    const pt = resolvePlaybackPoint(entry, definition, Patm);
    if (!pt || !Number.isFinite(pt.t) || !Number.isFinite(pt.w) || pt.w < 0 || pt.w > 0.5) return;

    const timestamp = entry?.timestamp ? new Date(entry.timestamp) : null;
    const validTimestamp = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null;

    rows.push({
      t: pt.t,
      w: pt.w,
      timestamp: validTimestamp,
      hour: validTimestamp ? validTimestamp.getHours() + validTimestamp.getMinutes() / 60 : null,
      data: calculateAllProperties(pt.t, pt.w, Patm),
    });
  });

  return rows;
}

function openPlaybackWindow() {
  populatePlaybackDatasetSelect();
  syncPlaybackZoneSelect();
  showFloatingWindow("floating-playback-window");
}

function populatePlaybackDatasetSelect() {
  const select = document.getElementById("playback-dataset-select");
  if (!select) return;
  const current = Playback.datasetKey || "";
  const options = realDataCatalog
    .map((definition) => `<option value="${escapeHtml(definition.key)}">${escapeHtml(getLocalizedDisplayName(definition.name, "zone"))}</option>`)
    .join("");
  select.innerHTML = `<option value="">${escapeHtml(translateLiteral("Select a real-data set…"))}</option>${options}`;
  select.value = current;

  // Live sensor logs (Fase 5) are stored in a separate IndexedDB and queried
  // asynchronously; appended as an <optgroup> once resolved so the synchronous
  // real-data options above are never delayed by this lookup.
  if (typeof getSensorLogSummaries === "function") {
    getSensorLogSummaries().then((summaries) => {
      if (!summaries.length) return;
      const optgroup = document.createElement("optgroup");
      optgroup.label = translateLiteral("Live sensor logs");
      optgroup.innerHTML = summaries
        .map((s) => `<option value="sensor:${escapeHtml(s.sensorId)}">${escapeHtml(s.sensorName)} (${s.count})</option>`)
        .join("");
      select.appendChild(optgroup);
      if (current) select.value = current;
    }).catch(() => {});
  }
}

function syncPlaybackZoneSelect() {
  const select = document.getElementById("playback-zone-select");
  if (!select) return;
  const current = Playback.zoneId || "";
  const options = State.zones
    .map((zone, index) => `<option value="${zone.id}">${escapeHtml(getLocalizedDisplayName(zone.name, "zone", index + 1))}</option>`)
    .join("");
  select.innerHTML = `<option value="">${escapeHtml(translateLiteral("None"))}</option>${options}`;
  select.value = current && State.zones.some((z) => String(z.id) === String(current)) ? current : "";
  Playback.zoneId = select.value;
}

const PLAYBACK_SENSOR_KEY_PREFIX = "sensor:";

function selectPlaybackDataset(key) {
  stopPlaybackInterval();
  Playback.datasetKey = key || null;
  Playback.index = 0;
  Playback.playing = false;

  if (key && key.startsWith(PLAYBACK_SENSOR_KEY_PREFIX)) {
    Playback.rows = [];
    finalizePlaybackDatasetSelection();
    const sensorId = key.slice(PLAYBACK_SENSOR_KEY_PREFIX.length);
    if (typeof getSensorReadings !== "function") return;
    getSensorReadings(sensorId).then((readings) => {
      if (Playback.datasetKey !== key) return; // selection changed while awaiting
      const Patm = getPressureInPa();
      Playback.rows = readings
        .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.w))
        .map((r) => {
          const timestamp = new Date(r.timestamp);
          return {
            t: r.t,
            w: r.w,
            timestamp,
            hour: timestamp.getHours() + timestamp.getMinutes() / 60,
            data: calculateAllProperties(r.t, r.w, Patm),
          };
        });
      finalizePlaybackDatasetSelection();
    }).catch(() => {});
    return;
  }

  if (key) {
    const definition = getRealDataDefinitionByKey(key);
    Playback.rows = definition ? resolvePlaybackRowsForDefinition(definition, getPressureInPa()) : [];
  } else {
    Playback.rows = [];
  }
  finalizePlaybackDatasetSelection();
}

function finalizePlaybackDatasetSelection() {
  const seek = document.getElementById("playback-seek");
  const playBtn = document.getElementById("playback-play-btn");
  if (seek) {
    seek.max = String(Math.max(0, Playback.rows.length - 1));
    seek.value = String(Math.min(Playback.index, Math.max(0, Playback.rows.length - 1)));
    seek.disabled = Playback.rows.length < 2;
  }
  if (playBtn) playBtn.disabled = Playback.rows.length < 2;

  renderPlaybackPlayButton();
  renderPlaybackFrameInfo();
  renderPlaybackAnalyticsPanel();
  drawChart();
}

function setPlaybackZone(zoneId) {
  Playback.zoneId = zoneId || "";
  renderPlaybackAnalyticsPanel();
  drawChart();
}

function setPlaybackSpeed(speed) {
  Playback.speed = parseFloat(speed) || 1;
  if (Playback.playing) {
    stopPlaybackInterval();
    startPlaybackInterval();
  }
}

function updatePlaybackThresholds() {
  const vpdMin = parseFloat(document.getElementById("playback-vpd-min")?.value);
  const vpdMax = parseFloat(document.getElementById("playback-vpd-max")?.value);
  const condensationDeltaC = parseFloat(document.getElementById("playback-condensation-delta")?.value);
  if (Number.isFinite(vpdMin)) Playback.vpdMin = vpdMin;
  if (Number.isFinite(vpdMax)) Playback.vpdMax = vpdMax;
  if (Number.isFinite(condensationDeltaC)) Playback.condensationDeltaC = condensationDeltaC;
  renderPlaybackAnalyticsPanel();
}

function seekPlayback(index) {
  if (!Playback.rows.length) return;
  const i = Math.max(0, Math.min(Playback.rows.length - 1, parseInt(index, 10) || 0));
  Playback.index = i;
  renderPlaybackFrameInfo();
  drawChart();
}

function startPlaybackInterval() {
  if (Playback.rows.length < 2) return;
  const delay = Math.max(60, PLAYBACK_BASE_INTERVAL_MS / Playback.speed);
  Playback.intervalId = setInterval(advancePlaybackFrame, delay);
}

function stopPlaybackInterval() {
  if (Playback.intervalId) {
    clearInterval(Playback.intervalId);
    Playback.intervalId = null;
  }
}

function advancePlaybackFrame() {
  if (!Playback.rows.length) return;
  Playback.index = (Playback.index + 1) % Playback.rows.length;
  renderPlaybackFrameInfo();
  drawChart();
}

function togglePlaybackPlay() {
  if (Playback.rows.length < 2) return;
  Playback.playing = !Playback.playing;
  if (Playback.playing) startPlaybackInterval();
  else stopPlaybackInterval();
  renderPlaybackPlayButton();
}

function renderPlaybackPlayButton() {
  const btn = document.getElementById("playback-play-btn");
  if (!btn) return;
  btn.innerHTML = `<span class="material-symbols-rounded">${Playback.playing ? "pause" : "play_arrow"}</span>`;
}

function renderPlaybackFrameInfo() {
  const info = document.getElementById("playback-frame-info");
  const seek = document.getElementById("playback-seek");
  if (seek && seek.value !== String(Playback.index)) seek.value = String(Playback.index);
  if (!info) return;

  if (!Playback.rows.length) {
    info.textContent = translateLiteral("No dataset selected.");
    return;
  }

  const row = Playback.rows[Playback.index];
  const tsLabel = row.timestamp ? row.timestamp.toLocaleString() : `#${Playback.index + 1}`;
  const vpdKPa = row.data.VPD / 1000;
  info.textContent = `${tsLabel} — Tdb ${row.t.toFixed(1)}°C, W ${row.w.toFixed(4)} kg/kg', VPD ${vpdKPa.toFixed(2)} kPa (${Playback.index + 1}/${Playback.rows.length})`;
}

function computePlaybackAnalytics() {
  const rows = Playback.rows;
  if (!rows.length) return null;

  let tdbMin = Infinity, tdbMax = -Infinity, tdbSum = 0;
  let vpdMin = Infinity, vpdMax = -Infinity, vpdSum = 0, vpdCount = 0;
  let inZoneCount = 0;
  const zone = Playback.zoneId ? State.zones.find((z) => String(z.id) === String(Playback.zoneId)) : null;
  const riskyHours = [];

  rows.forEach((row) => {
    tdbMin = Math.min(tdbMin, row.t);
    tdbMax = Math.max(tdbMax, row.t);
    tdbSum += row.t;

    const vpdKPa = row.data.VPD / 1000;
    if (Number.isFinite(vpdKPa)) {
      vpdMin = Math.min(vpdMin, vpdKPa);
      vpdMax = Math.max(vpdMax, vpdKPa);
      vpdSum += vpdKPa;
      vpdCount++;
    }

    if (zone && isPointInPolygon(row.t, row.w, zone.points)) inZoneCount++;

    const reasons = [];
    if (Number.isFinite(vpdKPa)) {
      if (vpdKPa < Playback.vpdMin) reasons.push(translateLiteral("VPD low"));
      else if (vpdKPa > Playback.vpdMax) reasons.push(translateLiteral("VPD high"));
    }
    const dewGap = row.t - row.data.Tdp;
    if (Number.isFinite(dewGap) && dewGap < Playback.condensationDeltaC) {
      reasons.push(translateLiteral("Condensation risk"));
    }
    if (reasons.length) {
      riskyHours.push({ timestamp: row.timestamp, index: rows.indexOf(row), tdb: row.t, vpd: vpdKPa, reasons });
    }
  });

  return {
    count: rows.length,
    zoneName: zone ? getLocalizedDisplayName(zone.name, "zone") : null,
    pctInZone: zone ? (inZoneCount / rows.length) * 100 : null,
    tdbMin, tdbMax, tdbAvg: tdbSum / rows.length,
    vpdMin: vpdCount ? vpdMin : null,
    vpdMax: vpdCount ? vpdMax : null,
    vpdAvg: vpdCount ? vpdSum / vpdCount : null,
    riskyHours,
  };
}

function renderPlaybackAnalyticsPanel() {
  const panel = document.getElementById("playback-analytics-panel");
  if (!panel) return;

  const analytics = computePlaybackAnalytics();
  if (!analytics) {
    panel.innerHTML = `<p class="panel-desc">${escapeHtml(translateLiteral("Select a dataset to see time-in-zone and risk analytics."))}</p>`;
    return;
  }

  const statCell = (label, value) => `
    <div class="item-stat">
      <span class="item-stat-label">${escapeHtml(label)}</span>
      <strong class="item-stat-value">${escapeHtml(value)}</strong>
    </div>`;

  const stats = [
    statCell(translateLiteral("Rows"), String(analytics.count)),
    statCell(translateLiteral("Time in zone"), analytics.pctInZone === null
      ? translateLiteral("No zone selected")
      : `${analytics.pctInZone.toFixed(1)}% (${escapeHtml(analytics.zoneName || "")})`),
    statCell("Tdb", `${analytics.tdbMin.toFixed(1)}–${analytics.tdbMax.toFixed(1)} °C (avg ${analytics.tdbAvg.toFixed(1)})`),
    statCell("VPD", analytics.vpdAvg === null
      ? "—"
      : `${analytics.vpdMin.toFixed(2)}–${analytics.vpdMax.toFixed(2)} kPa (avg ${analytics.vpdAvg.toFixed(2)})`),
  ].join("");

  const riskyRows = analytics.riskyHours.slice(0, 60).map((risk) => {
    const label = risk.timestamp ? risk.timestamp.toLocaleString() : `#${risk.index + 1}`;
    return `
      <div class="playback-risky-row">
        <span>${escapeHtml(label)} — ${risk.tdb.toFixed(1)}°C${Number.isFinite(risk.vpd) ? `, ${risk.vpd.toFixed(2)} kPa` : ""}</span>
        <span class="playback-risky-reasons">${escapeHtml(risk.reasons.join(", "))}</span>
      </div>`;
  }).join("");

  const riskySection = analytics.riskyHours.length
    ? `<div class="playback-risky-list">${riskyRows}</div>`
    : `<p class="panel-desc">${escapeHtml(translateLiteral("No risky hours detected for the current thresholds."))}</p>`;

  panel.innerHTML = `
    <div class="playback-stat-grid">${stats}</div>
    <div class="settings-group-title">${escapeHtml(translateLiteral("Risky hours"))} (${analytics.riskyHours.length})</div>
    ${riskySection}`;
}

// Called from render.js's drawChart() once per redraw; renders the full
// trajectory (colored by time-of-day) and a pulsing marker at the current frame.
function renderPlaybackOverlay(layer, x, y, Patm) {
  const rows = Playback.rows;
  if (!rows.length) return;

  const hourColor = (hour) => {
    if (hour === null || hour === undefined) return "#9e9e9e";
    const distanceFromMidday = Math.abs(hour - 13);
    const lightness = Math.max(20, 75 - (distanceFromMidday / 13) * 45);
    return `hsl(40, 85%, ${lightness}%)`;
  };

  const trajectory = layer.append("g").attr("class", "playback-trajectory");
  for (let i = 0; i < rows.length - 1; i++) {
    const a = chartXY(rows[i].t, rows[i].w, x, y, Patm);
    const b = chartXY(rows[i + 1].t, rows[i + 1].w, x, y, Patm);
    trajectory.append("line")
      .attr("x1", a.x).attr("y1", a.y)
      .attr("x2", b.x).attr("y2", b.y)
      .attr("stroke", hourColor(rows[i].hour))
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.75);
  }

  const current = rows[Playback.index] || rows[0];
  const pt = chartXY(current.t, current.w, x, y, Patm);
  const marker = layer.append("g").attr("class", "playback-marker");
  marker.append("circle")
    .attr("class", "playback-marker-ring")
    .attr("cx", pt.x).attr("cy", pt.y).attr("r", 9)
    .attr("fill", "none").attr("stroke", "#d81b60").attr("stroke-width", 2).attr("opacity", 0.5);
  marker.append("circle")
    .attr("cx", pt.x).attr("cy", pt.y).attr("r", 6)
    .attr("fill", "#d81b60").attr("stroke", "#fff").attr("stroke-width", 1.5);
}
