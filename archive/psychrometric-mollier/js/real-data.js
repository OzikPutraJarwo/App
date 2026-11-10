// ==========================================
// real-data.js — Real-data catalog loading, envelope/alpha-shape geometry, plant zones
// ==========================================

function normalizeRealDataKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\.json$/i, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getRealDataFileBase(filePath) {
  const fileName = String(filePath || "").split("/").pop() || "";
  return fileName.replace(/\.json$/i, "");
}

function humanizeRealDataFileBase(fileBase) {
  return String(fileBase || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Real Data";
}

function normalizeRealDataFilePath(value) {
  let rawPath = "";

  if (typeof value === "string") {
    rawPath = value;
  } else if (value && typeof value === "object") {
    rawPath = value.file || value.path || value.href || "";
  }

  if (!rawPath) return "";

  const trimmedPath = String(rawPath).trim();
  if (!trimmedPath.toLowerCase().endsWith(".json")) return "";
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;

  const relativePath = trimmedPath
    .replace(/^\.\//, "")
    .replace(new RegExp(`^${REAL_DATA_DIRECTORY}\/`, "i"), "");
  const normalizedPath = `${REAL_DATA_DIRECTORY}/${relativePath}`;
  const fileName = normalizedPath.split("/").pop()?.toLowerCase();

  if (!fileName) {
    return "";
  }

  return normalizedPath;
}

function normalizeRealDataVisibilityMap(value) {
  if (!value) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return normalizeRealDataVisibilityMap(JSON.parse(trimmed));
    } catch (_) {
      return trimmed.split("|").reduce((map, entry) => {
        const key = normalizeRealDataKey(entry);
        if (key) map[key] = true;
        return map;
      }, {});
    }
  }

  if (Array.isArray(value)) {
    return value.reduce((map, entry) => {
      const key = normalizeRealDataKey(entry);
      if (key) map[key] = true;
      return map;
    }, {});
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((map, [key, enabled]) => {
      const normalizedKey = normalizeRealDataKey(key);
      if (normalizedKey) map[normalizedKey] = parseBool(enabled);
      return map;
    }, {});
  }

  return {};
}

function syncRealDataVisibilityDefaults() {
  const nextVisibility = normalizeRealDataVisibilityMap(State.realDataZoneVisibility);

  if (!realDataCatalog.length) {
    State.realDataZoneVisibility = nextVisibility;
    return;
  }

  const catalogKeys = new Set(realDataCatalog.map((definition) => definition.key));

  realDataCatalog.forEach((definition) => {
    if (!(definition.key in nextVisibility)) {
      nextVisibility[definition.key] = false;
    }
  });

  Object.keys(nextVisibility).forEach((key) => {
    if (!catalogKeys.has(key)) {
      delete nextVisibility[key];
    }
  });

  State.realDataZoneVisibility = nextVisibility;
}

function normalizeRealDataCompactness(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return REAL_DATA_DEFAULT_COMPACTNESS;
  return Math.max(0, Math.min(Math.round(numericValue), 100));
}

function normalizeHexColorValue(value, fallback = REAL_DATA_DEFAULT_COLOR) {
  const normalized = String(value || "").trim();
  const shorthand = normalized.match(/^#([a-f\d]{3})$/i);
  if (shorthand) {
    return `#${shorthand[1].split("").map((char) => char + char).join("")}`.toLowerCase();
  }

  const full = normalized.match(/^#([a-f\d]{6})$/i);
  return full ? `#${full[1].toLowerCase()}` : fallback;
}

function normalizeRealDataZoneTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeRealDataZoneLabelPosition(value) {
  return String(value || "").trim().toLowerCase() === "outside"
    ? "outside"
    : REAL_DATA_DEFAULT_LABEL_POSITION;
}

function normalizeRealDataZoneLabelFont(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : REAL_DATA_DEFAULT_LABEL_FONT;
}

function normalizeRealDataZoneShowSourcePoints(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function getDefaultRealDataZoneConfig() {
  return {
    shape: REAL_DATA_DEFAULT_SHAPE,
    compactness: REAL_DATA_DEFAULT_COMPACTNESS,
    color: "",
    title: "",
    labelPosition: REAL_DATA_DEFAULT_LABEL_POSITION,
    labelFontFamily: REAL_DATA_DEFAULT_LABEL_FONT,
    showSourcePoints: false,
  };
}

function normalizeRealDataZoneConfig(value) {
  if (typeof value === "string") {
    try {
      return normalizeRealDataZoneConfig(JSON.parse(value));
    } catch (_) {
      return {
        ...getDefaultRealDataZoneConfig(),
        shape: value === "oval" ? "oval" : REAL_DATA_DEFAULT_SHAPE,
      };
    }
  }

  const defaults = getDefaultRealDataZoneConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaults };
  }

  return {
    shape: value.shape === "oval" ? "oval" : defaults.shape,
    compactness: normalizeRealDataCompactness(value.compactness ?? value.boundary ?? defaults.compactness),
    color: normalizeHexColorValue(value.color, ""),
    title: normalizeRealDataZoneTitle(value.title ?? value.name ?? value.label),
    labelPosition: normalizeRealDataZoneLabelPosition(value.labelPosition ?? value.position),
    labelFontFamily: normalizeRealDataZoneLabelFont(value.labelFontFamily ?? value.fontFamily ?? value.font),
    showSourcePoints: normalizeRealDataZoneShowSourcePoints(value.showSourcePoints ?? value.showPoints ?? value.keepPointsVisible),
  };
}

function normalizeRealDataZoneConfigMap(value) {
  if (!value) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return normalizeRealDataZoneConfigMap(JSON.parse(trimmed));
    } catch (_) {
      return {};
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((map, [key, config]) => {
    const normalizedKey = normalizeRealDataKey(key);
    if (!normalizedKey) return map;
    map[normalizedKey] = normalizeRealDataZoneConfig(config);
    return map;
  }, {});
}

function syncRealDataZoneConfigDefaults() {
  const nextConfigs = normalizeRealDataZoneConfigMap(State.realDataZoneConfigs);

  if (!realDataCatalog.length) {
    State.realDataZoneConfigs = nextConfigs;
    return;
  }

  const catalogKeys = new Set(realDataCatalog.map((definition) => definition.key));

  realDataCatalog.forEach((definition) => {
    nextConfigs[definition.key] = normalizeRealDataZoneConfig(nextConfigs[definition.key]);
  });

  Object.keys(nextConfigs).forEach((key) => {
    if (!catalogKeys.has(key)) {
      delete nextConfigs[key];
    }
  });

  State.realDataZoneConfigs = nextConfigs;
}

function setRealDataZoneConfigMap(value) {
  State.realDataZoneConfigs = normalizeRealDataZoneConfigMap(value);
}

function getRealDataZoneConfig(key) {
  const normalizedKey = normalizeRealDataKey(key);
  return normalizeRealDataZoneConfig(State.realDataZoneConfigs?.[normalizedKey]);
}

function getRealDataDefinitionByKey(key) {
  const normalizedKey = normalizeRealDataKey(key);
  return realDataCatalog.find((definition) => definition.key === normalizedKey) || null;
}

function setRealDataZoneVisibilityMap(value) {
  State.realDataZoneVisibility = normalizeRealDataVisibilityMap(value);
}

function toggleRealDataZoneVisibility(key, visible) {
  const normalizedKey = normalizeRealDataKey(key);
  if (!normalizedKey) return;

  State.realDataZoneVisibility = {
    ...State.realDataZoneVisibility,
    [normalizedKey]: !!visible,
  };

  renderRealDataZoneSettings();
  drawChart();
  queuePersistedStateSave();
}

function renderRealDataZoneSettings() {
  const container = document.getElementById("real-data-zone-list");
  if (!container) return;

  if (realDataLoadState === "loading" && !realDataCatalog.length) {
    container.innerHTML = `<div class="settings-note">${escapeHtml(translateLiteral("Loading real-data zones..."))}</div>`;
    applyLanguage(container);
    return;
  }

  if (!realDataCatalog.length) {
    const summary = realDataLoadState === "error"
      ? translateLiteral("Unable to load real-data zone files.")
      : translateLiteral("No real-data JSON files found in /real-data/.");
    const helpPrimary = translateLiteral("If your server hides folder listings, add the file names to /real-data/index.json.");
    const helpSecondary = translateLiteral("Auto-discovery needs the app to be served over HTTP with a browsable /real-data/ folder.");
    container.innerHTML = `<div class="settings-note">${escapeHtml(summary)}<br>${escapeHtml(helpPrimary)}<br>${escapeHtml(helpSecondary)}</div>`;
    applyLanguage(container);
    return;
  }

  container.innerHTML = realDataCatalog.map((definition) => {
    const inputId = `real-data-zone-${definition.key}`;
    const checked = State.realDataZoneVisibility[definition.key] !== false;

    return `
      <div class="settype-checkbox pill-check">
        <input id="${inputId}" type="checkbox" data-real-data-zone-key="${escapeHtml(definition.key)}" ${checked ? "checked" : ""}>
        <label for="${inputId}">${escapeHtml(definition.name)}</label>
      </div>
    `;
  }).join("");

  container.querySelectorAll("input[data-real-data-zone-key]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.realDataZoneKey;
      toggleRealDataZoneVisibility(key, event.currentTarget.checked);
    });
  });

  applyLanguage(container);
}

function updatePlantsCompactnessLabel() {
  const compactnessInput = document.getElementById("plants-zone-compactness");
  const compactnessLabel = document.getElementById("plants-zone-compactness-label");
  if (!compactnessInput || !compactnessLabel) return;

  compactnessLabel.textContent = `${normalizeRealDataCompactness(compactnessInput.value)}%`;
}

function getPlantsZoneDraftFromControls() {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const shapeSelect = document.getElementById("plants-zone-shape");
  const compactnessInput = document.getElementById("plants-zone-compactness");
  const titleInput = document.getElementById("plants-zone-title");
  const colorInput = document.getElementById("plants-zone-color");
  const labelPositionSelect = document.getElementById("plants-zone-label-position");
  const labelFontInput = document.getElementById("plants-zone-label-font");
  const showPointsInput = document.getElementById("plants-zone-show-points");
  const normalizedKey = normalizeRealDataKey(datasetSelect?.value);
  const definition = getRealDataDefinitionByKey(normalizedKey);

  if (!normalizedKey || !definition) {
    return null;
  }

  const config = normalizeRealDataZoneConfig({
    shape: shapeSelect?.value,
    compactness: compactnessInput?.value,
    title: titleInput?.value,
    color: colorInput?.value || definition.color || REAL_DATA_DEFAULT_COLOR,
    labelPosition: labelPositionSelect?.value,
    labelFontFamily: labelFontInput?.value,
    showSourcePoints: showPointsInput?.checked,
  });

  return {
    key: normalizedKey,
    ...config,
  };
}

function syncPlantsZoneSelection() {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const shapeSelect = document.getElementById("plants-zone-shape");
  const compactnessInput = document.getElementById("plants-zone-compactness");
  const titleInput = document.getElementById("plants-zone-title");
  const colorInput = document.getElementById("plants-zone-color");
  const labelPositionSelect = document.getElementById("plants-zone-label-position");
  const labelFontInput = document.getElementById("plants-zone-label-font");
  const showPointsInput = document.getElementById("plants-zone-show-points");
  if (!datasetSelect || !shapeSelect || !compactnessInput) return;

  const normalizedKey = normalizeRealDataKey(datasetSelect.value);
  const definition = getRealDataDefinitionByKey(normalizedKey);
  if (!definition) return;
  const config = getRealDataZoneConfig(normalizedKey);

  shapeSelect.value = config.shape;
  compactnessInput.value = config.compactness;
  if (titleInput) titleInput.value = config.title || definition.name;
  if (colorInput) colorInput.value = config.color || definition.color || REAL_DATA_DEFAULT_COLOR;
  if (labelPositionSelect) labelPositionSelect.value = config.labelPosition;
  if (labelFontInput) labelFontInput.value = config.labelFontFamily || REAL_DATA_DEFAULT_LABEL_FONT;
  if (showPointsInput) showPointsInput.checked = !!config.showSourcePoints;
  updatePlantsCompactnessLabel();
  previewPlantsZone();
}

function populatePlantsZoneDatasetSelect(preferredKey) {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const note = document.getElementById("plants-zone-note");
  if (!datasetSelect) return;

  if (!realDataCatalog.length) {
    datasetSelect.innerHTML = `<option value="">${escapeHtml(translateLiteral("No real-data plant zones are available yet."))}</option>`;
    datasetSelect.disabled = true;
    if (note) note.textContent = translateLiteral("No real-data plant zones are available yet.");
    State.realDataZoneDraft = null;
    drawChart();
    return;
  }

  datasetSelect.disabled = false;
  datasetSelect.innerHTML = realDataCatalog
    .map((definition) => `<option value="${escapeHtml(definition.key)}">${escapeHtml(definition.name)}</option>`)
    .join("");

  const selectedKey = normalizeRealDataKey(preferredKey)
    || normalizeRealDataKey(State.realDataZoneDraft?.key)
    || normalizeRealDataKey(datasetSelect.value)
    || realDataCatalog[0].key;

  datasetSelect.value = realDataCatalog.some((definition) => definition.key === selectedKey)
    ? selectedKey
    : realDataCatalog[0].key;

  if (note) {
    note.textContent = translateLiteral("Preview updates in real time. Click Apply to show this dataset on the chart.");
  }

  syncPlantsZoneSelection();
}

function previewPlantsZone() {
  updatePlantsCompactnessLabel();
  State.realDataZoneDraft = getPlantsZoneDraftFromControls();
  drawChart();
}

function applyPlantsZoneConfig() {
  const draft = getPlantsZoneDraftFromControls();
  if (!draft) {
    alert(translateLiteral("No real-data plant zones are available yet."));
    return;
  }

  const definition = getRealDataDefinitionByKey(draft.key);
  const builtZone = definition
    ? buildRealDataZone(definition, getPressureInPa(), draft)
    : null;

  if (!builtZone || !Array.isArray(builtZone.points) || builtZone.points.length < 3) {
    alert(translateLiteral("Selected plant dataset could not generate a valid zone."));
    return;
  }

  State.realDataZoneConfigs = {
    ...normalizeRealDataZoneConfigMap(State.realDataZoneConfigs),
    [draft.key]: {
      shape: draft.shape,
      compactness: draft.compactness,
      color: draft.color,
      title: draft.title,
      labelPosition: draft.labelPosition,
      labelFontFamily: draft.labelFontFamily,
      showSourcePoints: draft.showSourcePoints,
    },
  };
  State.realDataZoneVisibility = {
    ...normalizeRealDataVisibilityMap(State.realDataZoneVisibility),
    [draft.key]: false,
  };

  const finalZone = {
    id: generateEntityId(),
    name: builtZone.name,
    color: builtZone.color,
    points: builtZone.points.map((point) => ({ t: point.t, w: point.w })),
    sourcePoints: (builtZone.sourcePoints || []).map((point) => ({ t: point.t, w: point.w })),
    labelPosition: builtZone.labelPosition,
    labelFontFamily: builtZone.labelFontFamily,
    showSourcePoints: !!draft.showSourcePoints,
    realDataKey: draft.key,
    realDataShape: builtZone.shape,
    realDataCompactness: builtZone.compactness,
  };

  State.zones.push(finalZone);
  State.selectedZoneId = finalZone.id;
  State.selectedPointId = null;
  State.realDataZoneDraft = null;

  historyManager.push(State);
  renderRealDataZoneSettings();
  updateLists();
  drawChart();
  queuePersistedStateSave();
}

async function fetchRealDataJson(filePath) {
  const response = await fetch(filePath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function extractRealDataManifestFiles(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeRealDataFilePath(entry)).filter(Boolean);
  }

  if (payload && typeof payload === "object") {
    const sourceList = Array.isArray(payload.files)
      ? payload.files
      : Array.isArray(payload.datasets)
        ? payload.datasets
        : [];

    return sourceList.map((entry) => normalizeRealDataFilePath(entry)).filter(Boolean);
  }

  return [];
}

async function discoverRealDataFilesFromDirectory() {
  try {
    const response = await fetch(`${REAL_DATA_DIRECTORY}/`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
    });

    if (!response.ok) return [];

    const html = await response.text();
    if (!html) return [];

    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("a[href]"))
      .map((anchor) => anchor.getAttribute("href") || "")
      .map((href) => href.split("?")[0].split("#")[0])
      .map((href) => href.split("/").pop() || "")
      .map((fileName) => normalizeRealDataFilePath(fileName))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function getRealDataFileList() {
  const files = [];

  for (const manifestFile of REAL_DATA_MANIFEST_FILES) {
    try {
      const manifest = await fetchRealDataJson(`${REAL_DATA_DIRECTORY}/${manifestFile}`);
      files.push(...extractRealDataManifestFiles(manifest));
      if (files.length) break;
    } catch (_) {
      // Ignore missing manifest files and fall back to directory discovery.
    }
  }

  if (!files.length) {
    files.push(...await discoverRealDataFilesFromDirectory());
  }

  return Array.from(new Set(files));
}

function normalizeRealDataHumidityType(value) {
  const normalized = String(value || "RH").trim().toUpperCase();
  if (normalized === "ABSOLUTEHUMIDITY") return "AH";
  if (normalized === "HUMIDITYRATIO") return "W";
  return ["RH", "AH", "W", "VPD"].includes(normalized) ? normalized : "RH";
}

function extractRealDataDefinitions(payload, filePath) {
  let sourceDefinitions = [];

  if (Array.isArray(payload)) {
    sourceDefinitions = payload;
  } else if (payload && Array.isArray(payload.zones)) {
    sourceDefinitions = payload.zones;
  } else if (payload && typeof payload === "object") {
    sourceDefinitions = [payload.zone && typeof payload.zone === "object"
      ? { ...payload, ...payload.zone }
      : payload];
  }

  const fileBase = getRealDataFileBase(filePath);

  return sourceDefinitions
    .map((definition, index) => {
      const keyBase = normalizeRealDataKey(definition?.id || definition?.key || `${fileBase}${index ? `-${index + 1}` : ""}`);
      const rows = Array.isArray(definition?.rows) ? definition.rows : [];
      const points = Array.isArray(definition?.points) ? definition.points : [];

      return {
        key: keyBase || `real-data-${index + 1}`,
        name: String(definition?.name || definition?.zoneName || humanizeRealDataFileBase(fileBase)),
        color: typeof definition?.color === "string" && definition.color ? definition.color : REAL_DATA_DEFAULT_COLOR,
        humidityType: normalizeRealDataHumidityType(definition?.humidityType || definition?.moistureType || definition?.inputType),
        rows,
        points,
      };
    })
    .filter((definition) => definition.rows.length || definition.points.length);
}

function normalizeRealDataSourcePoints(definition, Patm) {
  const sourcePoints = definition.points.length ? definition.points : definition.rows;
  const uniquePoints = [];
  const seenPoints = new Set();

  sourcePoints.forEach((entry) => {
    let point = null;

    if (definition.points.length) {
      const t = Number(entry?.t);
      const w = Number(entry?.w);
      if (Number.isFinite(t) && Number.isFinite(w) && w >= 0) {
        point = { t, w };
      } else {
        point = getRealDataPointFromRow(entry, definition.humidityType, Patm);
      }
    } else {
      point = getRealDataPointFromRow(entry, definition.humidityType, Patm);
    }

    if (!point || !Number.isFinite(point.t) || !Number.isFinite(point.w)) return;
    if (point.w < 0 || point.w > 0.5) return;

    const dedupeKey = `${point.t.toFixed(3)}|${point.w.toFixed(6)}`;
    if (seenPoints.has(dedupeKey)) return;
    seenPoints.add(dedupeKey);
    uniquePoints.push(point);
  });

  return uniquePoints;
}

function getRealDataPointBounds(points) {
  const minT = d3.min(points, (point) => point.t);
  const maxT = d3.max(points, (point) => point.t);
  const minW = d3.min(points, (point) => point.w);
  const maxW = d3.max(points, (point) => point.w);

  return {
    minT,
    maxT,
    minW,
    maxW,
    spanT: Math.max((maxT ?? 0) - (minT ?? 0), 1e-9),
    spanW: Math.max((maxW ?? 0) - (minW ?? 0), 1e-9),
  };
}

function getRealDataEdgeKey(indexA, indexB) {
  return indexA < indexB ? `${indexA}|${indexB}` : `${indexB}|${indexA}`;
}

function getRealDataNormalizedPoints(points, bounds = getRealDataPointBounds(points)) {
  const { minT, minW, spanT, spanW } = bounds;

  return points.map((point, index) => ({
    index,
    x: (point.t - minT) / spanT,
    y: (point.w - minW) / spanW,
  }));
}

function denormalizeRealDataPoint(point, bounds) {
  return {
    t: bounds.minT + point.x * bounds.spanT,
    w: bounds.minW + point.y * bounds.spanW,
  };
}

function getRealDataBoundarySampleCount(compactness) {
  const ratio = getRealDataCompactnessRatio(compactness);
  return Math.max(8, Math.round(8 + ratio * 10));
}

function getRealDataCompactnessRatio(compactness) {
  return normalizeRealDataCompactness(compactness) / 100;
}

function getRealDataPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.abs(d3.polygonArea(points.map((point) => [point.t, point.w])));
}

function getRealDataNormalizedPolygonPoints(points, bounds) {
  return getRealDataNormalizedPoints(points, bounds).map((point) => [point.x, point.y]);
}

function getRealDataDistanceToSegmentSquared(point, segmentStart, segmentEnd) {
  const deltaX = segmentEnd[0] - segmentStart[0];
  const deltaY = segmentEnd[1] - segmentStart[1];

  if (Math.abs(deltaX) < 1e-12 && Math.abs(deltaY) < 1e-12) {
    const offsetX = point[0] - segmentStart[0];
    const offsetY = point[1] - segmentStart[1];
    return offsetX * offsetX + offsetY * offsetY;
  }

  const projection = Math.max(0, Math.min(1, (
    ((point[0] - segmentStart[0]) * deltaX + (point[1] - segmentStart[1]) * deltaY)
    / (deltaX * deltaX + deltaY * deltaY)
  )));
  const closestX = segmentStart[0] + projection * deltaX;
  const closestY = segmentStart[1] + projection * deltaY;
  const diffX = point[0] - closestX;
  const diffY = point[1] - closestY;
  return diffX * diffX + diffY * diffY;
}

function isRealDataNormalizedPointInsidePolygon(point, polygon, tolerance = 5e-4) {
  if (d3.polygonContains(polygon, point)) {
    return true;
  }

  const toleranceSquared = tolerance * tolerance;
  for (let index = 0; index < polygon.length; index += 1) {
    const segmentStart = polygon[index];
    const segmentEnd = polygon[(index + 1) % polygon.length];
    if (getRealDataDistanceToSegmentSquared(point, segmentStart, segmentEnd) <= toleranceSquared) {
      return true;
    }
  }

  return false;
}

function doesRealDataBoundaryContainPoints(boundaryPoints, sourcePoints) {
  if (!Array.isArray(boundaryPoints) || boundaryPoints.length < 3) return false;
  if (!Array.isArray(sourcePoints) || !sourcePoints.length) return true;

  const bounds = getRealDataPointBounds([...boundaryPoints, ...sourcePoints]);
  const polygon = getRealDataNormalizedPolygonPoints(boundaryPoints, bounds);

  return sourcePoints.every((point) => {
    const normalizedPoint = [
      (point.t - bounds.minT) / bounds.spanT,
      (point.w - bounds.minW) / bounds.spanW,
    ];
    return isRealDataNormalizedPointInsidePolygon(normalizedPoint, polygon);
  });
}

function scaleRealDataBoundary(points, scaleFactor, bounds = getRealDataPointBounds(points)) {
  if (!(scaleFactor > 1) || !Array.isArray(points) || points.length < 3) {
    return points.map((point) => ({ t: point.t, w: point.w }));
  }

  const normalizedPoints = getRealDataNormalizedPoints(points, bounds);
  const center = {
    x: d3.mean(normalizedPoints, (point) => point.x) ?? 0.5,
    y: d3.mean(normalizedPoints, (point) => point.y) ?? 0.5,
  };

  return normalizedPoints.map((point) => denormalizeRealDataPoint({
    x: center.x + (point.x - center.x) * scaleFactor,
    y: center.y + (point.y - center.y) * scaleFactor,
  }, bounds));
}

function clampRealDataPointToSaturation(point, Patm) {
  const saturationPressure = Psychro.getSatVapPres(point.t);
  const saturationW = Psychro.getWFromPw(saturationPressure, Patm);

  return {
    t: point.t,
    w: Math.max(0, Math.min(point.w, saturationW)),
  };
}

function clipRealDataBoundaryToSaturation(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const sampleCount = getRealDataBoundarySampleCount(compactness);
  const clippedPoints = [];

  for (let index = 0; index < points.length; index += 1) {
    const pointA = points[index];
    const pointB = points[(index + 1) % points.length];
    const segmentSteps = Math.max(2, sampleCount);

    for (let stepIndex = 0; stepIndex < segmentSteps; stepIndex += 1) {
      if (index > 0 && stepIndex === 0) continue;

      const ratio = stepIndex / (segmentSteps - 1);
      const interpolatedPoint = clampRealDataPointToSaturation({
        t: pointA.t + (pointB.t - pointA.t) * ratio,
        w: pointA.w + (pointB.w - pointA.w) * ratio,
      }, Patm);

      const previousPoint = clippedPoints[clippedPoints.length - 1];
      if (
        previousPoint
        && Math.abs(previousPoint.t - interpolatedPoint.t) < 1e-6
        && Math.abs(previousPoint.w - interpolatedPoint.w) < 1e-8
      ) {
        continue;
      }

      clippedPoints.push(interpolatedPoint);
    }
  }

  return clippedPoints.length >= 3 ? clippedPoints : [];
}

function getRealDataPointDistance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function getRealDataTriangleCircumradius(pointA, pointB, pointC) {
  const sideAB = getRealDataPointDistance(pointA, pointB);
  const sideBC = getRealDataPointDistance(pointB, pointC);
  const sideCA = getRealDataPointDistance(pointC, pointA);
  const doubleArea = Math.abs(
    (pointB.x - pointA.x) * (pointC.y - pointA.y) -
    (pointB.y - pointA.y) * (pointC.x - pointA.x)
  );

  if (doubleArea <= 1e-9) return Infinity;
  return (sideAB * sideBC * sideCA) / (2 * doubleArea);
}

function traceRealDataBoundaryLoops(boundaryEdges, normalizedPoints) {
  if (boundaryEdges.length < 3) return [];

  const adjacency = new Map();
  boundaryEdges.forEach(([indexA, indexB]) => {
    if (!adjacency.has(indexA)) adjacency.set(indexA, []);
    if (!adjacency.has(indexB)) adjacency.set(indexB, []);
    adjacency.get(indexA).push(indexB);
    adjacency.get(indexB).push(indexA);
  });

  const unusedEdges = new Set(boundaryEdges.map(([indexA, indexB]) => getRealDataEdgeKey(indexA, indexB)));
  const loops = [];

  while (unusedEdges.size) {
    const startKey = unusedEdges.values().next().value;
    const [startIndex, nextIndexRaw] = startKey.split("|").map((value) => Number(value));
    const loop = [startIndex];

    let previousIndex = startIndex;
    let currentIndex = nextIndexRaw;
    unusedEdges.delete(startKey);

    while (true) {
      loop.push(currentIndex);

      const currentNeighbors = adjacency.get(currentIndex) || [];
      const availableNeighbors = currentNeighbors.filter((neighborIndex) => {
        if (neighborIndex === previousIndex) return false;
        return unusedEdges.has(getRealDataEdgeKey(currentIndex, neighborIndex));
      });

      if (!availableNeighbors.length) {
        const closingKey = getRealDataEdgeKey(currentIndex, startIndex);
        if (currentIndex !== startIndex && unusedEdges.has(closingKey)) {
          unusedEdges.delete(closingKey);
          currentIndex = startIndex;
          continue;
        }
        break;
      }

      let nextIndex = availableNeighbors[0];

      if (availableNeighbors.length > 1) {
        const prevPoint = normalizedPoints[previousIndex];
        const currentPoint = normalizedPoints[currentIndex];
        const baseAngle = Math.atan2(currentPoint.y - prevPoint.y, currentPoint.x - prevPoint.x);

        nextIndex = availableNeighbors
          .map((neighborIndex) => {
            const neighborPoint = normalizedPoints[neighborIndex];
            let turn = Math.atan2(neighborPoint.y - currentPoint.y, neighborPoint.x - currentPoint.x) - baseAngle;
            while (turn <= 0) turn += Math.PI * 2;
            return { neighborIndex, turn };
          })
          .sort((left, right) => left.turn - right.turn)[0].neighborIndex;
      }

      unusedEdges.delete(getRealDataEdgeKey(currentIndex, nextIndex));
      previousIndex = currentIndex;
      currentIndex = nextIndex;

      if (currentIndex === startIndex) break;
    }

    if (loop.length >= 4 && loop[loop.length - 1] === startIndex) {
      loop.pop();
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function buildRealDataAlphaEnvelope(points, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  const normalizedPoints = getRealDataNormalizedPoints(points);
  const delaunay = d3.Delaunay.from(normalizedPoints, (point) => point.x, (point) => point.y);
  const nearestNeighborDistances = normalizedPoints
    .map((point, index) => {
      let minDistance = Infinity;
      for (const neighborIndex of delaunay.neighbors(index)) {
        minDistance = Math.min(minDistance, getRealDataPointDistance(point, normalizedPoints[neighborIndex]));
      }
      return minDistance;
    })
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  const medianDistance = nearestNeighborDistances.length
    ? (d3.quantileSorted(nearestNeighborDistances, 0.5) ?? nearestNeighborDistances[Math.floor(nearestNeighborDistances.length / 2)])
    : 0.04;
  const upperDistance = nearestNeighborDistances.length
    ? (d3.quantileSorted(nearestNeighborDistances, 0.9) ?? nearestNeighborDistances[nearestNeighborDistances.length - 1])
    : medianDistance;
  const compactnessRatio = getRealDataCompactnessRatio(compactness);
  const baseRadius = Math.max(upperDistance * 2.8, medianDistance * 4.6, 0.02);
  const candidateRadii = [
    baseRadius * 0.16,
    baseRadius * 0.22,
    baseRadius * 0.3,
    baseRadius * 0.42,
    baseRadius * 0.58,
    baseRadius * 0.78,
    baseRadius,
    baseRadius * 1.28,
    baseRadius * 1.7,
    baseRadius * 2.25,
    baseRadius * 3,
    baseRadius * 4,
    baseRadius * 5.5,
  ].map((radius) => Math.min(Math.max(radius, 0.01), 3));
  const candidateShapes = [];
  const seenCandidates = new Set();

  for (const alphaRadius of candidateRadii) {
    const edgeCounts = new Map();

    for (let triangleIndex = 0; triangleIndex < delaunay.triangles.length; triangleIndex += 3) {
      const indexA = delaunay.triangles[triangleIndex];
      const indexB = delaunay.triangles[triangleIndex + 1];
      const indexC = delaunay.triangles[triangleIndex + 2];
      const circumradius = getRealDataTriangleCircumradius(
        normalizedPoints[indexA],
        normalizedPoints[indexB],
        normalizedPoints[indexC]
      );

      if (!Number.isFinite(circumradius) || circumradius > alphaRadius) continue;

      [
        [indexA, indexB],
        [indexB, indexC],
        [indexC, indexA],
      ].forEach(([startIndex, endIndex]) => {
        const edgeKey = getRealDataEdgeKey(startIndex, endIndex);
        edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
      });
    }

    const boundaryEdges = Array.from(edgeCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([edgeKey]) => edgeKey.split("|").map((value) => Number(value)));
    const loops = traceRealDataBoundaryLoops(boundaryEdges, normalizedPoints);

    if (!loops.length) continue;

    const outerLoop = loops
      .map((loop) => ({
        loop,
        area: Math.abs(d3.polygonArea(loop.map((index) => [normalizedPoints[index].x, normalizedPoints[index].y]))),
      }))
      .sort((left, right) => right.area - left.area)[0]?.loop;

    if (outerLoop?.length >= 3) {
      const candidate = outerLoop.map((index) => points[index]);
      if (!doesRealDataBoundaryContainPoints(candidate, points)) {
        continue;
      }

      const candidateKey = candidate
        .map((point) => `${point.t.toFixed(4)}|${point.w.toFixed(6)}`)
        .join(";");
      if (seenCandidates.has(candidateKey)) {
        continue;
      }

      seenCandidates.add(candidateKey);
      candidateShapes.push(candidate);
    }
  }

  const hull = d3.polygonHull(points.map((point) => [point.t, point.w]));
  if (hull && hull.length >= 3) {
    const hullCandidate = hull.map(([t, w]) => ({ t, w }));
    if (doesRealDataBoundaryContainPoints(hullCandidate, points)) {
      candidateShapes.push(hullCandidate);
    }
  }

  if (!candidateShapes.length) {
    return [];
  }

  const sortedCandidates = candidateShapes
    .map((candidate) => ({ candidate, area: getRealDataPolygonArea(candidate) }))
    .sort((left, right) => left.area - right.area);
  const targetIndex = sortedCandidates.length === 1
    ? 0
    : Math.round((1 - compactnessRatio) * (sortedCandidates.length - 1));
  const loosenessScale = d3.interpolateNumber(1.32, 1.01)(compactnessRatio);
  return scaleRealDataBoundary(sortedCandidates[targetIndex].candidate, loosenessScale, getRealDataPointBounds(points));
}

function getRealDataPointFromRow(row, humidityType, Patm) {
  const t = Number(row?.tdb ?? row?.t ?? row?.temperature ?? row?.temp);
  const humidityRatio = Number(row?.w ?? row?.humidityRatio ?? row?.humidity_ratio);
  const rh = Number(row?.rh ?? row?.relativeHumidity ?? row?.relative_humidity);
  const vpd = Number(row?.vpd ?? row?.vaporPressureDeficit ?? row?.vapor_pressure_deficit);

  if (Number.isFinite(t) && Number.isFinite(humidityRatio)) {
    if (humidityRatio < 0) return null;
    return { t, w: humidityRatio };
  }

  if (Number.isFinite(t) && Number.isFinite(rh)) {
    if (rh < 0 || rh > 100) return null;
    const Pws = Psychro.getSatVapPres(t);
    const w = Psychro.getWFromPw(Pws * (rh / 100), Patm);
    return Number.isFinite(w) && w >= 0 ? { t, w } : null;
  }

  if (Number.isFinite(t) && Number.isFinite(vpd)) {
    if (vpd < 0) return null;
    const Pws = Psychro.getSatVapPres(t);
    const Pw = Pws - vpd * 1000;
    if (!Number.isFinite(Pw) || Pw <= 0 || Pw > Pws) return null;
    const w = Psychro.getWFromPw(Pw, Patm);
    return Number.isFinite(w) && w >= 0 ? { t, w } : null;
  }

  if (Number.isFinite(rh) && Number.isFinite(vpd)) {
    if (rh < 0 || rh >= 100 || vpd < 0) return null;
    const Pws = (vpd * 1000) / (1 - rh / 100);
    if (!Number.isFinite(Pws) || Pws <= 0) return null;
    const resolvedT = Psychro.getTempFromSatPres(Pws);
    const Pw = Pws * (rh / 100);
    const w = Psychro.getWFromPw(Pw, Patm);
    if (!Number.isFinite(resolvedT) || !Number.isFinite(w) || w < 0) return null;
    return { t: resolvedT, w };
  }

  if (Number.isFinite(humidityRatio) && Number.isFinite(vpd)) {
    if (humidityRatio < 0 || vpd < 0) return null;
    const Pw = Psychro.getPwFromW(humidityRatio, Patm);
    const Pws = Pw + vpd * 1000;
    if (!Number.isFinite(Pw) || !Number.isFinite(Pws) || Pws <= 0 || Pws < Pw) return null;
    const resolvedT = Psychro.getTempFromSatPres(Pws);
    if (!Number.isFinite(resolvedT)) return null;
    return { t: resolvedT, w: humidityRatio };
  }

  if (!Number.isFinite(t)) return null;

  let humidityValue;
  let w;

  if (humidityType === "AH") {
    humidityValue = Number(row?.ah ?? row?.absoluteHumidity ?? row?.absolute_humidity);
    if (!Number.isFinite(humidityValue) || humidityValue < 0) return null;
    w = getWFromAbsoluteHumidity(t, humidityValue, Patm);
  } else if (humidityType === "W") {
    humidityValue = Number(row?.w ?? row?.humidityRatio ?? row?.humidity_ratio);
    if (!Number.isFinite(humidityValue) || humidityValue < 0) return null;
    w = humidityValue;
  } else {
    humidityValue = Number(row?.rh ?? row?.relativeHumidity ?? row?.relative_humidity);
    if (!Number.isFinite(humidityValue) || humidityValue < 0 || humidityValue > 100) return null;
    const resolved = Psychro.solveRobust("Tdb", t, "RH", humidityValue, Patm);
    w = resolved?.w;
  }

  if (!Number.isFinite(w) || w < 0) return null;
  return { t, w };
}

function buildRealDataOval(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (points.length < 3) return [];

  const bounds = getRealDataPointBounds(points);
  const normalizedPoints = getRealDataNormalizedPoints(points, bounds);
  const centroid = {
    x: d3.mean(normalizedPoints, (point) => point.x) ?? 0.5,
    y: d3.mean(normalizedPoints, (point) => point.y) ?? 0.5,
  };

  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;

  normalizedPoints.forEach((point) => {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    covarianceXX += deltaX * deltaX;
    covarianceYY += deltaY * deltaY;
    covarianceXY += deltaX * deltaY;
  });

  const pointCount = Math.max(normalizedPoints.length, 1);
  covarianceXX /= pointCount;
  covarianceYY /= pointCount;
  covarianceXY /= pointCount;

  const trace = covarianceXX + covarianceYY;
  const determinant = covarianceXX * covarianceYY - covarianceXY * covarianceXY;
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
  const principalValue = trace / 2 + discriminant;

  let majorAxis;
  if (Math.abs(covarianceXY) > 1e-9) {
    majorAxis = { x: principalValue - covarianceYY, y: covarianceXY };
  } else {
    majorAxis = covarianceXX >= covarianceYY ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }

  const axisLength = Math.hypot(majorAxis.x, majorAxis.y) || 1;
  majorAxis = { x: majorAxis.x / axisLength, y: majorAxis.y / axisLength };
  const minorAxis = { x: -majorAxis.y, y: majorAxis.x };

  const projectedDistances = normalizedPoints.map((point) => {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    return {
      major: Math.abs(deltaX * majorAxis.x + deltaY * majorAxis.y),
      minor: Math.abs(deltaX * minorAxis.x + deltaY * minorAxis.y),
    };
  });

  const majorDistances = projectedDistances.map((distance) => distance.major).sort((left, right) => left - right);
  const minorDistances = projectedDistances.map((distance) => distance.minor).sort((left, right) => left - right);

  const compactnessRatio = getRealDataCompactnessRatio(compactness);
  const baseRadiusX = Math.max(d3.quantileSorted(majorDistances, 0.92) ?? d3.max(majorDistances) ?? 0.08, 0.04);
  const baseRadiusY = Math.max(d3.quantileSorted(minorDistances, 0.92) ?? d3.max(minorDistances) ?? 0.05, 0.03);
  const containmentScale = projectedDistances.reduce((maxScale, distance) => {
    const ellipseDistance = Math.hypot(distance.major / baseRadiusX, distance.minor / baseRadiusY);
    return Math.max(maxScale, ellipseDistance);
  }, 1);
  let expansion = d3.interpolateNumber(1.34, 1.01)(compactnessRatio);
  const sampleCount = Math.max(72, 72 + Math.round((1 - compactnessRatio) * 36));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const radiusX = Math.max(baseRadiusX * containmentScale * expansion, 0.04);
    const radiusY = Math.max(baseRadiusY * containmentScale * expansion, 0.03);
    const ovalPoints = Array.from({ length: sampleCount }, (_, index) => {
      const angle = (index / sampleCount) * Math.PI * 2;
      const localX = Math.cos(angle) * radiusX;
      const localY = Math.sin(angle) * radiusY;

      return denormalizeRealDataPoint({
        x: centroid.x + majorAxis.x * localX + minorAxis.x * localY,
        y: centroid.y + majorAxis.y * localX + minorAxis.y * localY,
      }, bounds);
    });
    const clippedOval = clipRealDataBoundaryToSaturation(ovalPoints, Patm, compactness);

    if (doesRealDataBoundaryContainPoints(clippedOval, points)) {
      return clippedOval;
    }

    expansion *= 1.08;
  }

  return [];
}

function buildRealDataEnvelope(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (points.length < 3) return [];

  const alphaEnvelope = buildRealDataAlphaEnvelope(points, compactness);
  if (alphaEnvelope.length >= 3) {
    const clippedAlphaEnvelope = clipRealDataBoundaryToSaturation(alphaEnvelope, Patm, compactness);
    if (doesRealDataBoundaryContainPoints(clippedAlphaEnvelope, points)) {
      return clippedAlphaEnvelope;
    }
  }

  const hull = d3.polygonHull(points.map((point) => [point.t, point.w]));
  if (hull && hull.length >= 3) {
    const hullPoints = hull.map(([t, w]) => ({ t, w }));
    const expandedHullPoints = scaleRealDataBoundary(
      hullPoints,
      d3.interpolateNumber(1.28, 1.01)(getRealDataCompactnessRatio(compactness)),
      getRealDataPointBounds(points)
    );
    const clippedHullPoints = clipRealDataBoundaryToSaturation(expandedHullPoints, Patm, compactness);
    if (doesRealDataBoundaryContainPoints(clippedHullPoints, points)) {
      return clippedHullPoints;
    }
  }

  const minT = d3.min(points, (point) => point.t);
  const maxT = d3.max(points, (point) => point.t);
  const minW = d3.min(points, (point) => point.w);
  const maxW = d3.max(points, (point) => point.w);

  if (![minT, maxT, minW, maxW].every(Number.isFinite)) return [];
  if (minT === maxT || minW === maxW) return [];

  return clipRealDataBoundaryToSaturation([
    { t: minT, w: minW },
    { t: maxT, w: minW },
    { t: maxT, w: maxW },
    { t: minT, w: maxW },
  ], Patm, compactness);
}

function getActiveRealDataZoneDraft() {
  if (State.mode !== "zone" || State.zoneSubMode !== "plants" || !State.realDataZoneDraft) {
    return null;
  }

  const normalizedKey = normalizeRealDataKey(State.realDataZoneDraft.key);
  if (!normalizedKey) return null;

  return {
    key: normalizedKey,
    ...normalizeRealDataZoneConfig(State.realDataZoneDraft),
  };
}

// Envelope/oval building runs Delaunay + alpha-shape tracing over every data
// row, so cache the geometry per definition; a WeakMap key means the cache
// dies with the definition when the catalog is reloaded.
const realDataZoneGeometryCache = new WeakMap();

function getRealDataZoneGeometry(definition, Patm, zoneConfig) {
  const cacheKey = `${Patm}|${zoneConfig.shape}|${zoneConfig.compactness}`;
  const cached = realDataZoneGeometryCache.get(definition);
  if (cached && cached.key === cacheKey) return cached.value;

  const sourcePoints = normalizeRealDataSourcePoints(definition, Patm);
  let zonePoints = [];
  if (sourcePoints.length >= 3) {
    zonePoints = zoneConfig.shape === "oval"
      ? buildRealDataOval(sourcePoints, Patm, zoneConfig.compactness)
      : definition.points.length
        ? clipRealDataBoundaryToSaturation(sourcePoints, Patm, zoneConfig.compactness)
        : buildRealDataEnvelope(sourcePoints, Patm, zoneConfig.compactness);
  }

  const value = { sourcePoints, zonePoints };
  realDataZoneGeometryCache.set(definition, { key: cacheKey, value });
  return value;
}

function buildRealDataZone(definition, Patm, configOverride) {
  const zoneConfig = normalizeRealDataZoneConfig(configOverride || State.realDataZoneConfigs?.[definition.key]);
  const { sourcePoints, zonePoints } = getRealDataZoneGeometry(definition, Patm, zoneConfig);
  if (sourcePoints.length < 3) return null;

  const zoneColor = zoneConfig.color || definition.color || REAL_DATA_DEFAULT_COLOR;
  const zoneName = zoneConfig.title || definition.name;
  if (zonePoints.length < 3) return null;

  return {
    id: `real-data-${definition.key}`,
    name: zoneName,
    color: zoneColor,
    shape: zoneConfig.shape,
    compactness: zoneConfig.compactness,
    labelPosition: zoneConfig.labelPosition,
    labelFontFamily: zoneConfig.labelFontFamily,
    sourcePoints,
    points: zonePoints,
  };
}

function getVisibleRealDataZones(Patm) {
  const draft = getActiveRealDataZoneDraft();

  return realDataCatalog
    .filter((definition) => State.realDataZoneVisibility[definition.key] !== false || draft?.key === definition.key)
    .map((definition) => buildRealDataZone(
      definition,
      Patm,
      draft?.key === definition.key ? draft : getRealDataZoneConfig(definition.key)
    ))
    .filter(Boolean);
}

async function loadRealDataCatalog() {
  realDataLoadState = "loading";
  realDataLoadError = "";
  renderRealDataZoneSettings();

  try {
    const filePaths = await getRealDataFileList();
    const nextCatalog = [];
    let hadLoadError = false;

    for (const filePath of filePaths) {
      try {
        const payload = await fetchRealDataJson(filePath);
        nextCatalog.push(...extractRealDataDefinitions(payload, filePath));
      } catch (error) {
        hadLoadError = true;
        console.warn(`Failed to load real-data file: ${filePath}`, error);
      }
    }

    realDataCatalog = nextCatalog;
    syncRealDataVisibilityDefaults();
    syncRealDataZoneConfigDefaults();
    realDataLoadState = realDataCatalog.length ? "ready" : hadLoadError ? "error" : "empty";
  } catch (error) {
    realDataCatalog = [];
    realDataLoadState = "error";
    realDataLoadError = error instanceof Error ? error.message : String(error || "");
  }

  renderRealDataZoneSettings();
  populatePlantsZoneDatasetSelect();
  drawChart();
}
