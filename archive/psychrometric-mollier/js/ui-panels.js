// ==========================================
// ui-panels.js — Info panel, cursor fields, lists/cards, context menu, floating windows
// ==========================================

const DEFAULT_CURSOR_FIELDS = ["tdb", "ah"];

function normalizeInfoPrecisionDecimals(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INFO_PRECISION_DECIMALS;
  return Math.max(0, Math.min(6, parsed));
}

function getInfoPrecisionDecimals() {
  return normalizeInfoPrecisionDecimals(State.infoPrecisionDecimals);
}

function fmtInfo(value) {
  return value.toFixed(getInfoPrecisionDecimals());
}

const CURSOR_FIELD_DEFINITIONS = [
  { key: "tdb", label: "Dry Bulb Temperature", shortLabel: "Tdb", formatValue: (data) => `${fmtInfo(data.Tdb, 1)} °C` },
  { key: "ah", label: "Absolute Humidity", shortLabel: "AH", formatValue: (data) => `${fmtInfo(data.AH, 1)} g/m³` },
  { key: "twb", label: "Wet Bulb Temperature", shortLabel: "Twb", formatValue: (data) => `${fmtInfo(data.Twb, 1)} °C` },
  { key: "tdp", label: "Dew Point Temperature", shortLabel: "Tdp", formatValue: (data) => `${fmtInfo(data.Tdp, 1)} °C` },
  { key: "tf", label: "Frost Point Temperature", shortLabel: "Tf", formatValue: (data) => `${fmtInfo(data.Tf, 1)} °C` },
  { key: "w", label: "Humidity Ratio", shortLabel: "W", formatValue: (data) => `${fmtInfo(data.W, 4)} kg/kg'` },
  { key: "rh", label: "Relative Humidity", shortLabel: "RH", formatValue: (data) => `${fmtInfo(data.RH, 1)} %` },
  { key: "mu", label: "Moisture Content", shortLabel: "u", formatValue: (data) => `${fmtInfo(data.mu, 1)} %` },
  { key: "h", label: "Enthalpy", shortLabel: "h", formatValue: (data) => `${fmtInfo(data.h, 1)} kJ/kg` },
  { key: "cp", label: "Specific Heat Capacity", shortLabel: "Cp", formatValue: (data) => `${fmtInfo(data.cp, 3)} kJ/(kg·°C)` },
  { key: "v", label: "Specific Volume", shortLabel: "v", formatValue: (data) => `${fmtInfo(data.v, 3)} m3/kg` },
  { key: "rho", label: "Density", shortLabel: "rho", formatValue: (data) => `${fmtInfo(data.rho, 2)} kg/m³` },
  { key: "pw", label: "Vapor Partial Pressure", shortLabel: "Pw", formatValue: (data) => `${fmtInfo(data.Pw, 0)} Pa` },
  { key: "pws", label: "Saturation Vapor Pressure", shortLabel: "Pws", formatValue: (data) => `${fmtInfo(data.Pws, 0)} Pa` },
  { key: "vpd", label: "Vapor Pressure Deficit", shortLabel: "VPD", formatValue: (data) => `${fmtInfo(data.VPD, 1)} Pa` },
  { key: "hd", label: "Humidity Deficit", shortLabel: "HD", formatValue: (data) => `${fmtInfo(data.HD, 4)} kg/kg'` },
  { key: "wsat", label: "Saturation Humidity Ratio", shortLabel: "Wsat", formatValue: (data) => `${fmtInfo(data.Wsat, 4)} kg/kg'` },
  { key: "dvs", label: "Saturation Vapor Concentration", shortLabel: "Dvs", formatValue: (data) => `${fmtInfo(data.Dvs, 1)} g/m³` },
  { key: "vmr", label: "Volume Mixing Ratio", shortLabel: "VMR", formatValue: (data) => `${fmtInfo(data.VMR, 1)} ppm` },
  { key: "pd", label: "Psychrometric Difference", shortLabel: "PD", formatValue: (data) => `${fmtInfo(data.PD, 1)} °C` },
];

const CURSOR_FIELD_MAP = CURSOR_FIELD_DEFINITIONS.reduce((accumulator, definition) => {
  accumulator[definition.key] = definition;
  return accumulator;
}, {});

function normalizeCursorFields(fields) {
  const validKeys = new Set(CURSOR_FIELD_DEFINITIONS.map((definition) => definition.key));
  const source = Array.isArray(fields) ? fields : String(fields || "").split("|");
  const normalized = [];
  const seen = new Set();

  source.forEach((field) => {
    const key = String(field || "").trim().toLowerCase();
    if (!validKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized.length ? normalized : [...DEFAULT_CURSOR_FIELDS];
}

function getImportedCursorFields(settings = {}) {
  if (settings.infoFields !== undefined) {
    return normalizeCursorFields(String(settings.infoFields).split("|"));
  }

  const legacyFields = [];
  if (settings.infoPrimary) legacyFields.push(settings.infoPrimary);
  if (settings.infoSecondary) legacyFields.push(settings.infoSecondary);
  return normalizeCursorFields(legacyFields);
}

function getSelectedInfoFields() {
  const checked = Array.from(document.querySelectorAll("#cursor-fields-list .cursor-field-toggle:checked"))
    .map((input) => String(input.value || "").trim().toLowerCase());

  return checked.length ? checked : [...DEFAULT_CURSOR_FIELDS];
}

function renderCursorFieldSettings(selectedFields = DEFAULT_CURSOR_FIELDS) {
  const container = document.getElementById("cursor-fields-list");
  if (!container) return;

  const selected = normalizeCursorFields(selectedFields);
  const orderedKeys = [
    ...selected,
    ...CURSOR_FIELD_DEFINITIONS.map((definition) => definition.key).filter((key) => !selected.includes(key)),
  ];

  container.innerHTML = orderedKeys.map((key) => {
    const definition = CURSOR_FIELD_MAP[key];
    const selectedIndex = selected.indexOf(key);
    const checked = selectedIndex !== -1;
    return `
      <div class="cursor-field-row ${checked ? "selected" : ""}">
        <label class="cursor-field-main" for="cursor-field-${definition.key}">
          <input
            class="cursor-field-toggle"
            type="checkbox"
            id="cursor-field-${definition.key}"
            value="${definition.key}"
            ${checked ? "checked" : ""}
            onchange="toggleCursorField('${definition.key}', this.checked)">
          <span class="cursor-field-copy">
            <strong>${escapeHtml(definition.shortLabel)}</strong>
            <em>${escapeHtml(definition.label)}</em>
          </span>
        </label>
        <div class="cursor-field-sort">
          <button type="button" class="cursor-sort-btn" onclick="moveCursorField('${definition.key}', -1)" ${checked && selectedIndex > 0 ? "" : "disabled"} title="Move up">
            <span class="material-symbols-rounded">keyboard_arrow_up</span>
          </button>
          <button type="button" class="cursor-sort-btn" onclick="moveCursorField('${definition.key}', 1)" ${checked && selectedIndex < selected.length - 1 ? "" : "disabled"} title="Move down">
            <span class="material-symbols-rounded">keyboard_arrow_down</span>
          </button>
        </div>
      </div>`;
  }).join("");

  applyLanguage(container);
}

function toggleCursorField(key, checked) {
  let selected = getSelectedInfoFields();

  if (checked) {
    if (!selected.includes(key)) selected.push(key);
  } else {
    const next = selected.filter((field) => field !== key);
    selected = next.length ? next : selected;
  }

  renderCursorFieldSettings(selected);
  queuePersistedStateSave();
}

function moveCursorField(key, direction) {
  const selected = getSelectedInfoFields();
  const index = selected.indexOf(key);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= selected.length) return;

  [selected[index], selected[targetIndex]] = [selected[targetIndex], selected[index]];
  renderCursorFieldSettings(selected);
  queuePersistedStateSave();
}

function setInfoPrecisionDecimals(decimals) {
  State.infoPrecisionDecimals = normalizeInfoPrecisionDecimals(decimals);
  const el = document.getElementById("set-info-precision");
  if (el) el.value = String(State.infoPrecisionDecimals);
  updateLists();
  queuePersistedStateSave();
}

function normalizeMinimapMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["auto", "show", "hide"].includes(mode) ? mode : "auto";
}

function shouldShowMinimapNow() {
  const mode = normalizeMinimapMode(State.minimapMode);
  if (mode === "show") return true;
  if (mode === "hide") return false;
  return Date.now() < minimapAutoVisibleUntil;
}

function updateMinimapVisibilityState() {
  const container = document.getElementById("chart-minimap");
  if (!container) return;
  container.classList.toggle("is-visible", shouldShowMinimapNow());
}

function registerMinimapZoomActivity() {
  if (normalizeMinimapMode(State.minimapMode) !== "auto") return;

  minimapAutoVisibleUntil = Date.now() + MINIMAP_AUTO_VISIBLE_MS;
  updateMinimapVisibilityState();

  if (minimapAutoHideTimer) {
    window.clearTimeout(minimapAutoHideTimer);
  }

  minimapAutoHideTimer = window.setTimeout(() => {
    minimapAutoHideTimer = null;
    updateMinimapVisibilityState();
  }, MINIMAP_AUTO_VISIBLE_MS + 40);
}

function setMinimapMode(mode, options = {}) {
  State.minimapMode = normalizeMinimapMode(mode);

  const minimapModeInput = document.getElementById("set-minimap-mode");
  if (minimapModeInput) {
    minimapModeInput.value = State.minimapMode;
  }

  if (State.minimapMode !== "auto") {
    minimapAutoVisibleUntil = 0;
    if (minimapAutoHideTimer) {
      window.clearTimeout(minimapAutoHideTimer);
      minimapAutoHideTimer = null;
    }
  } else if (!options.keepAutoVisible) {
    minimapAutoVisibleUntil = 0;
  }

  updateMinimapVisibilityState();
  if (options.redraw === false) return;
  drawChart();
}

function getInfoFieldMeta(field, data) {
  const axisX = State.chartType === "psychrometric"
    ? { label: "Tdb", value: `${fmtInfo(data.Tdb, 1)} °C` }
    : State.yAxisType === "absoluteHumidity"
      ? { label: "AH", value: `${fmtInfo(data.AH, 1)} g/m³` }
      : { label: "W", value: `${fmtInfo(data.W, 4)} kg/kg'` };

  const axisY = State.chartType === "psychrometric"
    ? State.yAxisType === "absoluteHumidity"
      ? { label: "AH", value: `${fmtInfo(data.AH, 1)} g/m³` }
      : { label: "W", value: `${fmtInfo(data.W, 4)} kg/kg'` }
    : { label: "Tdb", value: `${fmtInfo(data.Tdb, 1)} °C` };

  const fieldMap = {
    "axis-x": axisX,
    "axis-y": axisY,
  };

  CURSOR_FIELD_DEFINITIONS.forEach((definition) => {
    fieldMap[definition.key] = {
      label: definition.shortLabel,
      value: definition.formatValue(data),
    };
  });

  return fieldMap[field] || fieldMap["axis-x"];
}

function renderInfoPanelRows(data) {
  return getSelectedInfoFields()
    .map((field) => {
      const meta = getInfoFieldMeta(field, data);
      return `
        <div class="info-mini-row">
          <span class="info-mini-key">${escapeHtml(meta.label)}</span>
          <span class="info-mini-val">${escapeHtml(meta.value)}</span>
        </div>`;
    })
    .join("");
}

function buildDetailMetricCard(label, value) {
  return `
    <div class="detail-row">
      <span class="det-abbr">${escapeHtml(translateLiteral(label))}</span>
      <span class="det-val">${escapeHtml(value)}</span>
    </div>`;
}

function buildStatCell(label, value) {
  return `
    <div class="item-stat">
      <span class="item-stat-label">${escapeHtml(label)}</span>
      <strong class="item-stat-value">${escapeHtml(value)}</strong>
    </div>`;
}

function buildEmptyState(icon, title, caption) {
  return `
    <div class="list-empty">
      <span class="material-symbols-rounded">${icon}</span>
      <div class="list-empty-title">${escapeHtml(title)}</div>
      <div class="list-empty-caption">${escapeHtml(caption)}</div>
    </div>`;
}

function getZoneDisplayPoints(zone) {
  const Patm = getPressureInPa();
  return zone.points.map((point) => {
    const data = calculateAllProperties(point.t, point.w, Patm);
    return {
      raw: point,
      data,
      x: State.chartType === "psychrometric"
        ? point.t
        : (State.yAxisType === "absoluteHumidity" ? data.AH : point.w),
      y: State.chartType === "psychrometric"
        ? (State.yAxisType === "absoluteHumidity" ? data.AH : point.w)
        : point.t,
    };
  });
}

function estimatePolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function isPointInsideDisplayPolygon(x, y, polygonPoints) {
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getDistanceToSegment(x, y, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (!lengthSquared) {
    return Math.hypot(x - start.x, y - start.y);
  }

  const projection = ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const projectedX = start.x + deltaX * clampedProjection;
  const projectedY = start.y + deltaY * clampedProjection;
  return Math.hypot(x - projectedX, y - projectedY);
}

function findZoneLabelPosition(displayPoints) {
  if (!Array.isArray(displayPoints) || displayPoints.length === 0) {
    return { x: 0, y: 0 };
  }
  if (displayPoints.length < 3) {
    return { x: displayPoints[0].x, y: displayPoints[0].y };
  }

  const centroidTuple = d3.polygonCentroid(displayPoints.map((point) => [point.x, point.y]));
  const centroid = {
    x: centroidTuple[0],
    y: centroidTuple[1],
  };

  if (Number.isFinite(centroid.x) && Number.isFinite(centroid.y)
      && isPointInsideDisplayPolygon(centroid.x, centroid.y, displayPoints)) {
    return centroid;
  }

  const bounds = displayPoints.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    maxX: Math.max(acc.maxX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxY: Math.max(acc.maxY, point.y),
  }), {
    minX: displayPoints[0].x,
    maxX: displayPoints[0].x,
    minY: displayPoints[0].y,
    maxY: displayPoints[0].y,
  });

  const centerX = Number.isFinite(centroid.x) ? centroid.x : (bounds.minX + bounds.maxX) / 2;
  const centerY = Number.isFinite(centroid.y) ? centroid.y : (bounds.minY + bounds.maxY) / 2;
  let bestPoint = null;
  let bestScore = -Infinity;
  const steps = 18;

  for (let xStep = 0; xStep <= steps; xStep++) {
    for (let yStep = 0; yStep <= steps; yStep++) {
      const x = bounds.minX + ((bounds.maxX - bounds.minX) * xStep) / steps;
      const y = bounds.minY + ((bounds.maxY - bounds.minY) * yStep) / steps;
      if (!isPointInsideDisplayPolygon(x, y, displayPoints)) continue;

      let edgeDistance = Infinity;
      for (let i = 0; i < displayPoints.length; i++) {
        const start = displayPoints[i];
        const end = displayPoints[(i + 1) % displayPoints.length];
        edgeDistance = Math.min(edgeDistance, getDistanceToSegment(x, y, start, end));
      }

      const centroidDistance = Math.hypot(x - centerX, y - centerY);
      const score = edgeDistance - centroidDistance * 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  if (bestPoint) {
    return bestPoint;
  }

  for (const point of displayPoints) {
    const midpoint = {
      x: (point.x + centerX) / 2,
      y: (point.y + centerY) / 2,
    };
    if (isPointInsideDisplayPolygon(midpoint.x, midpoint.y, displayPoints)) {
      return midpoint;
    }
  }

  return { x: displayPoints[0].x, y: displayPoints[0].y };
}

function getDisplayPolygonBounds(displayPoints) {
  return displayPoints.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
}

function getRealDataZoneLabelPlacement(displayPoints, labelPosition, chartWidth, chartHeight) {
  const insidePoint = findZoneLabelPosition(displayPoints);
  if (normalizeRealDataZoneLabelPosition(labelPosition) !== "outside") {
    return {
      x: insidePoint.x,
      y: insidePoint.y,
      textAnchor: "middle",
      dominantBaseline: "middle",
      connector: null,
    };
  }

  const bounds = getDisplayPolygonBounds(displayPoints);
  const centerY = Math.min(
    chartHeight - REAL_DATA_LABEL_EDGE_PADDING,
    Math.max(REAL_DATA_LABEL_EDGE_PADDING, (bounds.minY + bounds.maxY) / 2)
  );
  const rightSpace = chartWidth - bounds.maxX;
  const leftSpace = bounds.minX;

  if (rightSpace >= leftSpace) {
    const x = Math.min(chartWidth - REAL_DATA_LABEL_EDGE_PADDING, bounds.maxX + REAL_DATA_LABEL_OUTSIDE_OFFSET);
    return {
      x,
      y: centerY,
      textAnchor: "start",
      dominantBaseline: "middle",
      connector: [
        { x: bounds.maxX + 4, y: centerY },
        { x: x - 6, y: centerY },
      ],
    };
  }

  const x = Math.max(REAL_DATA_LABEL_EDGE_PADDING, bounds.minX - REAL_DATA_LABEL_OUTSIDE_OFFSET);
  return {
    x,
    y: centerY,
    textAnchor: "end",
    dominantBaseline: "middle",
    connector: [
      { x: bounds.minX - 4, y: centerY },
      { x: x + 6, y: centerY },
    ],
  };
}

function renderRealDataZoneLabel(zoneLayer, zone, displayPoints, chartWidth, chartHeight) {
  const placement = getRealDataZoneLabelPlacement(displayPoints, zone.labelPosition, chartWidth, chartHeight);

  if (placement.connector) {
    zoneLayer
      .append("line")
      .attr("x1", placement.connector[0].x)
      .attr("y1", placement.connector[0].y)
      .attr("x2", placement.connector[1].x)
      .attr("y2", placement.connector[1].y)
      .attr("stroke", zone.color)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.9)
      .style("pointer-events", "none");
  }

  zoneLayer
    .append("text")
    .attr("x", placement.x)
    .attr("y", placement.y)
    .attr("text-anchor", placement.textAnchor)
    .attr("dominant-baseline", placement.dominantBaseline)
    .attr("fill", zone.color)
    .attr("font-family", zone.labelFontFamily || REAL_DATA_DEFAULT_LABEL_FONT)
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .attr("paint-order", "stroke")
    .attr("stroke", "rgba(255,255,255,0.92)")
    .attr("stroke-width", 3)
    .attr("stroke-linejoin", "round")
    .text(zone.name)
    .style("pointer-events", "none");
}

function formatZoneArea(area) {
  if (!isFinite(area)) return "—";
  const decimals = area < 0.1 ? 4 : area < 10 ? 3 : 2;
  const unit = State.yAxisType === "absoluteHumidity" ? "°C·g/m³" : "°C·kg/kg'";
  return `${area.toFixed(decimals)} ${unit}`;
}

function buildVertexMarkup(displayPoints) {
  return displayPoints.map((point, vertexIndex) => {
    const axisX = getInfoFieldMeta("axis-x", point.data);
    const axisY = getInfoFieldMeta("axis-y", point.data);
    return `
      <div class="vertex-chip">
        <span>P${vertexIndex + 1}</span>
        <strong>${escapeHtml(axisX.value)}</strong>
        <em>${escapeHtml(axisY.value)}</em>
      </div>`;
  }).join("");
}

function buildPointDetailContent(point) {
  const data = point.data || calculateAllProperties(point.t, point.w, getPressureInPa());
  return `
    <div class="detail-popup-section">
      <div class="detail-popup-title">Properties</div>
      <div class="detail-sheet detail-sheet-two-col">${generateHTMLGrid(data)}</div>
    </div>`;
}

function buildZoneDetailContent(zone) {
  const displayPoints = getZoneDisplayPoints(zone);
  const axisValuesX = displayPoints.map((point) => point.x);
  const axisValuesY = displayPoints.map((point) => point.y);
  const temps = zone.points.map((point) => point.t);
  const area = estimatePolygonArea(displayPoints);
  const yUnit = State.yAxisType === "absoluteHumidity" ? "g/m³" : "kg/kg'";
  const vertices = buildVertexMarkup(displayPoints);

  return `
    <div class="detail-popup-section">
      <div class="detail-popup-title">Summary</div>
      <div class="detail-sheet detail-sheet-two-col">
        ${buildDetailMetricCard("Vertices", String(zone.points.length))}
        ${buildDetailMetricCard("Area", formatZoneArea(area))}
        ${buildDetailMetricCard("Temp Range", `${Math.min(...temps).toFixed(1)}-${Math.max(...temps).toFixed(1)} °C`)}
        ${buildDetailMetricCard("Axis Span", `${Math.min(...axisValuesX).toFixed(2)}-${Math.max(...axisValuesX).toFixed(2)} / ${Math.min(...axisValuesY).toFixed(2)}-${Math.max(...axisValuesY).toFixed(2)} ${State.chartType === "psychrometric" ? yUnit : "°C"}`)}
      </div>
    </div>
    <div class="detail-popup-section">
      <div class="detail-popup-title">Vertices</div>
      <div class="vertex-list detail-sheet-two-col">${vertices}</div>
    </div>`;
}

function buildPointCard(point, index) {
  const data = point.data || calculateAllProperties(point.t, point.w, getPressureInPa());
  const tdb = getInfoFieldMeta("tdb", data);
  const w = getInfoFieldMeta("w", data);
  const displayName = getLocalizedDisplayName(point.name, "point", index + 1);

  return `
    <article class="list-item ${point.id === State.selectedPointId ? "active" : ""}" style="--item-accent:${escapeHtml(point.color || "#cc1919")}">
      <div class="item-header" onclick="selectPoint(${point.id}, event)">
        <div class="item-head-main">
          <div class="id-circle" style="background-color:${escapeHtml(point.color || "#cc1919")}">${index + 1}</div>
          <div class="item-title-group">
            <div class="item-name">${escapeHtml(displayName)}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="openDetailModal('point', ${point.id}, event)" title="View details">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="icon-btn" type="button" onclick="openEditModal('point', ${point.id}, event)" title="Edit point">
            <span class="material-symbols-rounded">edit_square</span>
          </button>
          <button class="icon-btn btn-delete" type="button" onclick="deletePoint(event, ${point.id})" title="Delete point">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
      <div class="item-body item-body-collapsible ${point.id === State.selectedPointId ? "show" : ""}">
        <div class="item-stat-grid">
          ${buildStatCell(tdb.label, tdb.value)}
          ${buildStatCell(w.label, w.value)}
        </div>
      </div>
    </article>`;
}

function buildZoneCard(zone, index) {
  const subtitle = formatI18n("verticesCount", { count: zone.points.length });
  const displayName = getLocalizedDisplayName(zone.name, "zone", index + 1);

  return `
    <article class="list-item ${zone.id === State.selectedZoneId ? "active" : ""}" style="--item-accent:${escapeHtml(zone.color || "#19cc2e")}" onclick="selectZone(${zone.id}, event)">
      <div class="item-header">
        <div class="item-head-main">
          <div class="id-circle" style="background:${escapeHtml(zone.color || "#19cc2e")}">${index + 1}</div>
          <div class="item-title-group">
            <div class="item-name">${escapeHtml(displayName)}</div>
            <div class="item-subtitle">${escapeHtml(subtitle)}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="openDetailModal('zone', ${zone.id}, event)" title="View details">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="icon-btn" type="button" onclick="openEditModal('zone', ${zone.id}, event)" title="Edit zone">
            <span class="material-symbols-rounded">edit_square</span>
          </button>
          <button class="icon-btn btn-delete" type="button" onclick="deleteZone(event, ${zone.id})" title="Delete zone">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
    </article>`;
}

function updateLists() {
  const pl = document.getElementById("list-points");
  document.getElementById("count-points").innerText = State.points.length;

  pl.innerHTML = State.points.length
    ? State.points.map(buildPointCard).join("")
    : `${buildEmptyState("pin_drop", "No points yet", "Add points manually, by input, in batch, or from a live sensor using the panel above.")}
      <style>.marked-point { display:none }</style>`;

  const zl = document.getElementById("list-zones");
  document.getElementById("count-zones").innerText = State.zones.length;

  zl.innerHTML = State.zones.length
    ? State.zones.map(buildZoneCard).join("")
    : buildEmptyState("add_triangle", "No zones yet", "Create a zone manually, by input, automatically, or from a plant dataset to start mapping areas.");

  updateToolbarsVisibility();
  applyLanguage(document.getElementById("app-sidebar"));
}

function updateToolbarsVisibility() {
  const toolbars = document.querySelector(".toolbars");
  if (!toolbars) return;
  const hasData = State.points.length > 0 || State.zones.length > 0;
  toolbars.classList.toggle("is-visible", hasData);
}

function addPoint(t, w, source) {
  const Patm = getPressureInPa();
  const data = calculateAllProperties(t, w, Patm);

  const pt = {
    id: generateEntityId(),
    name: formatI18n("defaultPointName"),
    color: "#cc1919",
    t,
    w,
    data,
    ...(source ? { source } : {}),
  };

  State.points.push(pt);
  historyManager.push(State);
  selectPoint(pt.id);
}

function saveStateSnapshot() {
  historyManager.push(State);
}

function undoAction() {
  const previousState = historyManager.undo();
  if (previousState) {
    Object.assign(State, previousState);
    updateLists();
    drawChart();
  }
}

function redoAction() {
  const nextState = historyManager.redo();
  if (nextState) {
    Object.assign(State, nextState);
    updateLists();
    drawChart();
  }
}

// === CONTEXT MENU ===

let contextMenuPointId = null;

function showContextMenu(event, pointId = null, zoneId = null) {
  if (event) event.preventDefault();
  // Context menu removed — no-op
}

// Legacy (unused) context menu helpers preserved below
function _showContextMenuLegacy(event, pointId = null, zoneId = null) {
  event.preventDefault();
  contextMenuPointId = pointId;

  document.getElementById("info-panel").style.display = "none";

  const menu = document.getElementById("context-menu");
  const content = document.getElementById("context-menu-content");
  
  content.innerHTML = "";

  if (pointId) {
    const point = State.points.find(p => p.id === pointId);
    if (!point) return;

    addContextMenuItem(content, "edit_square", "Edit", () => {
      hideContextMenu();
      openEditModal("point", pointId);
    });

    addContextMenuItem(content, "delete", "Delete", () => {
      hideContextMenu();
      deletePoint({stopPropagation: () => {}}, pointId);
    });
  } else if (zoneId) {
    const zone = State.zones.find(z => z.id === zoneId);
    if (!zone) return;

    addContextMenuItem(content, "edit_square", "Edit", () => {
      hideContextMenu();
      openEditModal("zone", zoneId);
    });

    addContextMenuItem(content, "delete", "Delete", () => {
      hideContextMenu();
      deleteZone({stopPropagation: () => {}}, zoneId);
    });
  } else {
    if (State.mode === "zone" && State.tempZone.length >= 3) {
      addContextMenuItem(content, "check_circle", "Finish Zone", () => {
        hideContextMenu();
        finishZone();
      });
      
      addContextMenuItem(content, "cancel", "Cancel", () => {
        hideContextMenu();
        cancelZone();
      });
      
      addContextMenuDivider(content);
    }
    
    // Explore (hover inspection)
    addContextMenuItem(content, "explore", "Explore", () => {
      hideContextMenu();
      setMode("view");
    }, State.mode === "view");

    // Point with submenu
    addContextSubmenu(content, "pin_drop", "Point", (submenu) => {
      addContextMenuItem(submenu, "ads_click", "Click", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("manual");
      }, State.mode === "point" && State.pointSubMode === "manual");

      addContextMenuItem(submenu, "edit_note", "Input", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("input");
        openFloatingInputWindow("point");
      }, State.mode === "point" && State.pointSubMode === "input");

      addContextMenuItem(submenu, "data_table", "Batch CSV", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("batch");
      }, State.mode === "point" && State.pointSubMode === "batch");

      addContextMenuItem(submenu, "sensors", "Live Sensor", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("sensor");
      }, State.mode === "point" && State.pointSubMode === "sensor");
    }, State.mode === "point");

    // Zone with submenu
    addContextSubmenu(content, "add_triangle", "Zone", (submenu) => {
      addContextMenuItem(submenu, "ads_click", "Click", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("manual");
      }, State.mode === "zone" && State.zoneSubMode === "manual");

      addContextMenuItem(submenu, "edit_note", "Input", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("input");
        openFloatingInputWindow("zone");
      }, State.mode === "zone" && State.zoneSubMode === "input");

      addContextMenuItem(submenu, "auto_awesome", "Auto Zone", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("auto");
      }, State.mode === "zone" && State.zoneSubMode === "auto");

      addContextMenuItem(submenu, "local_florist", "Plants", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("plants");
      }, State.mode === "zone" && State.zoneSubMode === "plants");
    }, State.mode === "zone");

    addContextMenuDivider(content);

    // Undo/Redo
    addContextMenuItem(content, "undo", "Undo", () => {
      hideContextMenu();
      undoAction();
    });

    addContextMenuItem(content, "redo", "Redo", () => {
      hideContextMenu();
      redoAction();
    });

    addContextMenuDivider(content);

    // Export submenu
    addContextSubmenu(content, "download", "Export to...", (submenu) => {
      addContextMenuItem(submenu, "image", "PNG", () => {
        hideContextMenu();
        downloadSvgAsPng("#chart-container svg", "chart.png", 3);
      });

      addContextMenuItem(submenu, "description", "SVG", () => {
        hideContextMenu();
        downloadSvgAsSvg("#chart-container svg", "chart.svg");
      });

      addContextMenuItem(submenu, "table_chart", "CSV", () => {
        hideContextMenu();
        exportToCSV();
      });
    });

    // Import submenu
    addContextSubmenu(content, "upload_file", "Import data", (submenu) => {
      addContextMenuItem(submenu, "upload_file", "CSV", () => {
        hideContextMenu();
        openImportDialog();
      });
    });
  }

  menu.style.left = event.clientX + "px";
  menu.style.top = event.clientY + "px";
  menu.style.display = "block";
}

function addContextMenuItem(container, icon, label, callback, isActive = false) {
  const item = document.createElement("div");
  item.className = "context-menu-item" + (isActive ? " active" : "");
  item.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span>${label}</span>`;
  item.onclick = callback;
  container.appendChild(item);
  return item;
}

function addContextMenuDivider(container) {
  const divider = document.createElement("div");
  divider.className = "context-menu-item divider";
  container.appendChild(divider);
}

function addContextMenuGroup(container, title, builder) {
  const group = document.createElement("div");
  group.className = "context-menu-group";

  const header = document.createElement("div");
  header.className = "context-menu-group-title";
  header.textContent = title;
  group.appendChild(header);

  builder(group);
  container.appendChild(group);
}

// Submenu helper (Windows-like flyout)
function addContextSubmenu(container, icon, label, builder, isActive = false) {
  const item = document.createElement("div");
  item.className = "context-menu-item has-submenu" + (isActive ? " active" : "");
  item.innerHTML = `
    <span class="material-symbols-rounded">${icon}</span>
    <span>${label}</span>
    <span class="submenu-arrow material-symbols-rounded">chevron_right</span>
  `;

  const submenu = document.createElement("div");
  submenu.className = "context-submenu";
  builder(submenu);
  item.appendChild(submenu);

  let hideTimeout = null;
  const show = () => {
    clearTimeout(hideTimeout);
    const rect = item.getBoundingClientRect();
    submenu.style.left = rect.width + "px";
    submenu.style.top = 0 + "px";
    submenu.style.display = "block";
  };
  const hide = () => {
    hideTimeout = setTimeout(() => {
      submenu.style.display = "none";
    }, 0);
  };

  item.addEventListener("mouseenter", show);
  item.addEventListener("mouseleave", hide);
  submenu.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
  submenu.addEventListener("mouseleave", hide);

  container.appendChild(item);
  return item;
}

function hideContextMenu() {
  const menu = document.getElementById("context-menu");
  if (menu) menu.style.display = "none";
}
function _hideContextMenuLegacy() {
  document.getElementById("context-menu").style.display = "none";
  contextMenuPointId = null;
}

// Floating window functions
const FLOATING_WINDOW_FADE_MS = 240;

function resolveFloatingWindow(windowOrId) {
  if (!windowOrId) return null;
  return typeof windowOrId === "string" ? document.getElementById(windowOrId) : windowOrId;
}

function getFloatingWindowDisplayType(popupWindow) {
  return popupWindow?.dataset.windowDisplay || (popupWindow?.classList.contains("floating-detail-window") ? "flex" : "block");
}

function isFloatingWindowOpen(windowOrId) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  return !!popupWindow && popupWindow.classList.contains("open") && popupWindow.style.display !== "none";
}

function resetPopupWindowFrame(popupWindow) {
  if (!popupWindow) return;
  popupWindow.style.transition = "";
  popupWindow.style.left = "50%";
  popupWindow.style.top = "50%";
  popupWindow.style.right = "";
  popupWindow.style.bottom = "";
  popupWindow.style.width = "";
  popupWindow.style.height = "";
  popupWindow.style.transform = "translate(-50%, -50%)";
}

function showFloatingWindow(windowOrId, options = {}) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  if (!popupWindow) return null;

  if (popupWindow._closeTimer) {
    clearTimeout(popupWindow._closeTimer);
    popupWindow._closeTimer = null;
  }

  popupWindow.classList.remove("closing");
  if (options.reset !== false) {
    resetPopupWindowFrame(popupWindow);
  }

  popupWindow.style.display = options.display || getFloatingWindowDisplayType(popupWindow);
  popupWindow.getBoundingClientRect();
  popupWindow.classList.add("open");

  makeWindowDraggable(popupWindow, options.headerSelector);
  scheduleAnimatedTabRefresh();
  requestAnimationFrame(() => scheduleAnimatedTabRefresh());
  return popupWindow;
}

function hideFloatingWindow(windowOrId, options = {}) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  if (!popupWindow) return;

  if (popupWindow._closeTimer) {
    clearTimeout(popupWindow._closeTimer);
    popupWindow._closeTimer = null;
  }

  const shouldReset = options.reset !== false;
  if (options.immediate) {
    popupWindow.classList.remove("open", "closing");
    popupWindow.style.display = "none";
    if (shouldReset) {
      resetPopupWindowFrame(popupWindow);
    }
    scheduleAnimatedTabRefresh();
    return;
  }

  popupWindow.classList.remove("open");
  popupWindow.classList.add("closing");
  popupWindow._closeTimer = window.setTimeout(() => {
    popupWindow.classList.remove("closing");
    popupWindow.style.display = "none";
    if (shouldReset) {
      resetPopupWindowFrame(popupWindow);
    }
    popupWindow._closeTimer = null;
    scheduleAnimatedTabRefresh();
  }, FLOATING_WINDOW_FADE_MS);
}

function openFloatingInputWindow(target) {
  const window = document.getElementById("floating-input-window");
  document.getElementById("floating-target").value = target;
  
  // Sync with toolbar values if any
  const p1Type = document.getElementById("p1Type-" + target);
  const p1Val = document.getElementById("p1Val-" + target);
  const p2Type = document.getElementById("p2Type-" + target);
  const p2Val = document.getElementById("p2Val-" + target);
  
  // Map uppercase toolbar values to lowercase floating values
  const reverseValueMap = {
    'Tdb': 't',
    'Twb': 'twb',
    'RH': 'rh',
    'W': 'w',
    'h': 'h'
  };
  
  if (p1Type) {
    const mappedValue = reverseValueMap[p1Type.value] || p1Type.value;
    const floatingP1Type = document.getElementById("floating-p1Type");
    if (floatingP1Type) floatingP1Type.value = mappedValue;
  }
  if (p1Val) {
    const floatingP1Val = document.getElementById("floating-p1Val");
    if (floatingP1Val) floatingP1Val.value = p1Val.value;
  }
  if (p2Type) {
    const mappedValue = reverseValueMap[p2Type.value] || p2Type.value;
    const floatingP2Type = document.getElementById("floating-p2Type");
    if (floatingP2Type) floatingP2Type.value = mappedValue;
  }
  if (p2Val) {
    const floatingP2Val = document.getElementById("floating-p2Val");
    if (floatingP2Val) floatingP2Val.value = p2Val.value;
  }
  
  // Show/hide Finish Zone button based on target and point count
  const finishBtn = document.getElementById("floating-finish-zone-btn");
  const btnGroup = document.getElementById("floating-input-btn-group");
  if (finishBtn && btnGroup) {
    const shouldShow = target === "zone" && State.tempZone.length >= 3;
    finishBtn.style.display = shouldShow ? "block" : "none";
    btnGroup.className = shouldShow ? "floating-btn-group cols-2" : "floating-btn-group";
  }
  
  // Position window at center with its default size
  showFloatingWindow(window);
  applyLanguage(window);
}

// Sync floating input selects with toolbar in real-time
function syncFloatingInputWithToolbar(fieldType) {
  const target = document.getElementById("floating-target").value;
  if (!target) return;
  
  const fieldMap = {
    'p1Type': 'p1Type-' + target,
    'p1Val': 'p1Val-' + target,
    'p2Type': 'p2Type-' + target,
    'p2Val': 'p2Val-' + target
  };
  
  const toolbarId = fieldMap[fieldType];
  const floatingId = 'floating-' + fieldType;
  
  const toolbarEl = document.getElementById(toolbarId);
  const floatingEl = document.getElementById(floatingId);
  
  if (toolbarEl && floatingEl) {
    // Map lowercase floating values to uppercase toolbar values
    const valueMap = {
      't': 'Tdb',
      'tdb': 'Tdb',
      'w': 'W',
      'rh': 'RH',
      'h': 'h',
      'twb': 'Twb',
      'tdp': 'Tdp',
      'v': 'v'
    };
    
    let value = floatingEl.value;
    
    // If it's a select (parameter type), map the value
    if (floatingEl.tagName === 'SELECT') {
      value = valueMap[value.toLowerCase()] || value;
    }
    
    toolbarEl.value = value;
  }
}

// Sync toolbar inputs with floating window in real-time (bidirectional)
function syncToolbarInputWithFloating(target, fieldType) {
  // Check if floating window is open
  const floatingWindow = document.getElementById("floating-input-window");
  if (!isFloatingWindowOpen(floatingWindow)) return;
  
  // Check if floating window is for this target
  const floatingTarget = document.getElementById("floating-target").value;
  if (floatingTarget !== target) return;
  
  const fieldMap = {
    'p1Type': 'p1Type-' + target,
    'p1Val': 'p1Val-' + target,
    'p2Type': 'p2Type-' + target,
    'p2Val': 'p2Val-' + target
  };
  
  const toolbarId = fieldMap[fieldType];
  const floatingId = 'floating-' + fieldType;
  
  const toolbarEl = document.getElementById(toolbarId);
  const floatingEl = document.getElementById(floatingId);
  
  if (toolbarEl && floatingEl) {
    // Map uppercase toolbar values to lowercase floating values
    const reverseValueMap = {
      'Tdb': 't',
      'Twb': 'twb',
      'RH': 'rh',
      'W': 'w',
      'h': 'h',
      'Tdp': 'tdp',
      'v': 'v'
    };
    
    let value = toolbarEl.value;
    
    // If it's a select (parameter type), map the value
    if (toolbarEl.tagName === 'SELECT') {
      value = reverseValueMap[value] || value;
    }
    
    floatingEl.value = value;
  }
}

function closeFloatingWindow(windowId) {
  hideFloatingWindow(windowId);
}

function submitFloatingInput() {
  const target = document.getElementById("floating-target").value;
  let p1Type = document.getElementById("floating-p1Type").value;
  const p1Val = parseFloat(document.getElementById("floating-p1Val").value);
  let p2Type = document.getElementById("floating-p2Type").value;
  const p2Val = parseFloat(document.getElementById("floating-p2Val").value);
  const Patm = getPressureInPa();

  // Map lowercase floating values to uppercase Psychro library values
  const valueMap = {
    't': 'Tdb',
    'tdb': 'Tdb',
    'w': 'W',
    'rh': 'RH',
    'h': 'h',
    'twb': 'Twb',
    'tdp': 'Tdp',
    'v': 'v'
  };
  
  p1Type = valueMap[p1Type.toLowerCase()] || p1Type;
  p2Type = valueMap[p2Type.toLowerCase()] || p2Type;

  if (isNaN(p1Val) || isNaN(p2Val)) {
    alert(translateLiteral("Please enter valid numbers"));
    return;
  }
  if (p1Type === p2Type) {
    alert(translateLiteral("Parameters must be different"));
    return;
  }

  const res = Psychro.solveRobust(p1Type, p1Val, p2Type, p2Val, Patm);

  if (isNaN(res.t) || isNaN(res.w)) {
    alert(translateLiteral("Calculation error. Values might be out of range."));
    return;
  }

  const source = { kind: "params", p1Type, p1Val, p2Type, p2Val };

  if (target === "point") {
    addPoint(res.t, res.w, source);
    closeFloatingWindow("floating-input-window");
  } else if (target === "zone") {
    if (State.mode !== "zone") setMode("zone");
    State.tempZone.push({ t: res.t, w: res.w, source });
    updateZonePtCount();
    
    // Show Finish Zone button if >= 3 points
    const finishBtn = document.getElementById("floating-finish-zone-btn");
    const btnGroup = document.getElementById("floating-input-btn-group");
    if (finishBtn && btnGroup) {
      const shouldShow = State.tempZone.length >= 3;
      finishBtn.style.display = shouldShow ? "block" : "none";
      btnGroup.className = shouldShow ? "floating-btn-group cols-2" : "floating-btn-group";
    }
    
    drawChart();
  }

  // Sync with toolbar
  document.getElementById("p1Type-" + target).value = p1Type;
  document.getElementById("p1Val-" + target).value = p1Val;
  document.getElementById("p2Type-" + target).value = p2Type;
  document.getElementById("p2Val-" + target).value = p2Val;
}

// Make window draggable
function makeWindowDraggable(draggableWindow, headerSelector = ".floating-window-header") {
  if (!draggableWindow || draggableWindow.dataset.draggableReady === "true") return;
  const header = draggableWindow.querySelector(headerSelector) || draggableWindow.querySelector(".floating-window-header");
  if (!header) return;
  let isDragging = false;
  let currentX, currentY, initialX, initialY;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, input, select, textarea, label, a")) return;
    isDragging = true;
    
    // Get actual position before removing transform
    const rect = draggableWindow.getBoundingClientRect();
    
    // Remove center transform first
    draggableWindow.style.transition = "none";
    draggableWindow.style.transform = "none";
    
    // Set absolute position based on current visual position
    draggableWindow.style.left = rect.left + "px";
    draggableWindow.style.top = rect.top + "px";
    
    // Calculate offset from mouse to window edge
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      e.preventDefault();
      const maxX = Math.max(12, window.innerWidth - draggableWindow.offsetWidth - 12);
      const maxY = Math.max(12, window.innerHeight - draggableWindow.offsetHeight - 12);
      currentX = Math.min(Math.max(12, e.clientX - initialX), maxX);
      currentY = Math.min(Math.max(12, e.clientY - initialY), maxY);
      draggableWindow.style.left = currentX + "px";
      draggableWindow.style.top = currentY + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    draggableWindow.style.transition = "";
    document.body.style.userSelect = "";
  });

  draggableWindow.dataset.draggableReady = "true";
  makeWindowResizable(draggableWindow);
}

function makeWindowResizable(resizableWindow) {
  if (!resizableWindow || resizableWindow.dataset.resizableReady === "true") return;

  const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  let isResizing = false;
  let resizeDirection = "";
  let startRect = null;
  let startX = 0;
  let startY = 0;

  const getMinimumWidth = () => {
    const computedMinWidth = parseFloat(window.getComputedStyle(resizableWindow).minWidth) || 0;
    return Math.min(Math.max(computedMinWidth, 260), Math.max(260, window.innerWidth - 24));
  };

  const getMinimumHeight = () => {
    const computedMinHeight = parseFloat(window.getComputedStyle(resizableWindow).minHeight) || 0;
    return Math.min(Math.max(computedMinHeight, 180), Math.max(180, window.innerHeight - 24));
  };

  directions.forEach((direction) => {
    const handle = document.createElement("span");
    handle.className = `window-resize-handle resize-${direction}`;
    handle.dataset.direction = direction;
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resizeDirection = direction;
      isResizing = true;
      const rect = resizableWindow.getBoundingClientRect();
      resizableWindow.style.transition = "none";
      resizableWindow.style.transform = "none";
      resizableWindow.style.left = rect.left + "px";
      resizableWindow.style.top = rect.top + "px";
      resizableWindow.style.width = rect.width + "px";
      resizableWindow.style.height = rect.height + "px";
      startRect = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      startX = event.clientX;
      startY = event.clientY;
      document.body.style.userSelect = "none";
    });
    resizableWindow.appendChild(handle);
  });

  document.addEventListener("mousemove", (event) => {
    if (!isResizing || !startRect) return;

    event.preventDefault();

    const viewportLeft = 12;
    const viewportTop = 12;
    const viewportRight = window.innerWidth - 12;
    const viewportBottom = window.innerHeight - 12;
    const minWidth = Math.min(getMinimumWidth(), viewportRight - viewportLeft);
    const minHeight = Math.min(getMinimumHeight(), viewportBottom - viewportTop);

    let left = startRect.left;
    let top = startRect.top;
    let right = startRect.right;
    let bottom = startRect.bottom;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (resizeDirection.includes("e")) {
      const nextRight = startRect.right + deltaX;
      right = Math.min(viewportRight, Math.max(startRect.left + minWidth, nextRight));
    }
    if (resizeDirection.includes("w")) {
      const nextLeft = startRect.left + deltaX;
      left = Math.max(viewportLeft, Math.min(startRect.right - minWidth, nextLeft));
    }
    if (resizeDirection.includes("s")) {
      const nextBottom = startRect.bottom + deltaY;
      bottom = Math.min(viewportBottom, Math.max(startRect.top + minHeight, nextBottom));
    }
    if (resizeDirection.includes("n")) {
      const nextTop = startRect.top + deltaY;
      top = Math.max(viewportTop, Math.min(startRect.bottom - minHeight, nextTop));
    }

    resizableWindow.style.left = left + "px";
    resizableWindow.style.top = top + "px";
    resizableWindow.style.width = Math.max(minWidth, right - left) + "px";
    resizableWindow.style.height = Math.max(minHeight, bottom - top) + "px";
    scheduleAnimatedTabRefresh();
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    resizeDirection = "";
    startRect = null;
    resizableWindow.style.transition = "";
    document.body.style.userSelect = "";
    scheduleAnimatedTabRefresh();
  });

  resizableWindow.dataset.resizableReady = "true";
}

// Close context menu when clicking elsewhere
document.addEventListener("click", (event) => {
  const menu = document.getElementById("context-menu");
  if (menu && !menu.contains(event.target)) {
    hideContextMenu();
  }
});
