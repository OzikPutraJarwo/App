// ==========================================
// ui-controls.js — Chart-type/axis/pressure controls, settings tabs, zone/point sub-modes
// ==========================================

// ==========================================
// 2. UI HANDLERS
// ==========================================

function changeChartType(type) {
  State.chartType = type;
  document.querySelectorAll("#app-charttype .charttype-btn").forEach((button) => {
    button.classList.toggle("active", button.value === type);
  });
  drawChart();

  updateAxisLabels();
  scheduleAnimatedTabRefresh();
}

function updateAxisLabels() {
  const axisLabelX = document.querySelector(".axis-label.x");
  const axisLabelY = document.querySelector(".axis-label.y");

  if (State.chartType === "psychrometric") {
    if (axisLabelX) axisLabelX.textContent = translateLiteral("Dry Bulb Temperature (°C)");
    if (axisLabelY) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelY.textContent = translateLiteral("Absolute Humidity (g/m³)");
      } else {
        axisLabelY.textContent = translateLiteral("Humidity Ratio (kg/kg')");
      }
    }
  } else {
    // Mollier chart
    if (axisLabelX) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelX.textContent = translateLiteral("Absolute Humidity (g/m³)");
      } else {
        axisLabelX.textContent = translateLiteral("Humidity Ratio (kg/kg')");
      }
    }
    if (axisLabelY) axisLabelY.textContent = translateLiteral("Dry Bulb Temperature (°C)");
  }

  applyLanguage(document.getElementById("chart-wrapper"));
}

function changeYAxisType(type) {
  State.yAxisType = type;
  drawChart();

  updateAxisLabels();

  if (State.yAxisType === "humidityRatio") {
    document.querySelector(".yAxis-type .humidityRatio").classList.add("active");
    document.querySelector(".yAxis-type .absoluteHumidity").classList.remove("active");
    document.querySelector(".input-item.ratio").classList.remove("none");
    document.querySelector(".input-item.absolute").classList.add("none");
  } else {
    document.querySelector(".yAxis-type .absoluteHumidity").classList.add("active");
    document.querySelector(".yAxis-type .humidityRatio").classList.remove("active");
    document.querySelector(".input-item.ratio").classList.add("none");
    document.querySelector(".input-item.absolute").classList.remove("none");
  }
}

function syncHumidityInputs(source) {
  if (source === 'ratio') {
    _syncAbsHumFromRatio();
  } else if (source === 'absolute') {
    _syncRatioFromAbsHum();
  }

  drawChart();
}

function _syncAbsHumFromRatio() {
  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const elMaxHum = document.getElementById("maxHum");
  const elMaxAbsHum = document.getElementById("maxAbsHum");
  const valW = parseFloat(elMaxHum.value);
  if (!elMaxAbsHum || isNaN(valW)) return;
  const avgT = (minT + maxT) / 2;
  elMaxAbsHum.value = calculateAbsoluteHumidity(avgT, valW, Patm).toFixed(1);
  const elMinHum = document.getElementById("minHum");
  const elMinAbsHum = document.getElementById("minAbsHum");
  if (elMinHum && elMinAbsHum) {
    const valMinW = parseFloat(elMinHum.value) || 0;
    elMinAbsHum.value = valMinW > 0 ? calculateAbsoluteHumidity(avgT, valMinW, Patm).toFixed(1) : "0";
  }
}

function _syncRatioFromAbsHum() {
  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const elMaxHum = document.getElementById("maxHum");
  const elMaxAbsHum = document.getElementById("maxAbsHum");
  const valAH = parseFloat(elMaxAbsHum.value);
  if (!elMaxHum || isNaN(valAH)) return;
  const avgT = (minT + maxT) / 2;
  elMaxHum.value = getWFromAbsoluteHumidity(avgT, valAH, Patm).toFixed(4);
  const elMinHum = document.getElementById("minHum");
  const elMinAbsHum = document.getElementById("minAbsHum");
  if (elMinHum && elMinAbsHum) {
    const valMinAH = parseFloat(elMinAbsHum.value) || 0;
    elMinHum.value = valMinAH > 0 ? getWFromAbsoluteHumidity(avgT, valMinAH, Patm).toFixed(4) : "0";
  }
}

function updatePressureUnit() {
  const pressureInput = document.getElementById("pressure");
  const pressureUnit = document.getElementById("pressure-unit").value;
  let currentValue = parseFloat(pressureInput.value);

  if (isNaN(currentValue)) {
    currentValue = 101325;
  }

  if (pressureUnit === "kPa") {
    pressureInput.value = (currentValue / 1000).toFixed(2);
    pressureInput.step = 0.1;
  } else {
    pressureInput.value = (currentValue * 1000).toFixed(0);
    pressureInput.step = 100;
  }

  refreshForPressure();
  updateLists();
  drawChart();
}

function getPressureInPa() {
  const pressureInput = document.getElementById("pressure");
  const pressureUnit = document.getElementById("pressure-unit").value;
  let value = parseFloat(pressureInput.value);

  if (isNaN(value)) {
    value = 101325;
  }

  if (pressureUnit === "kPa") {
    return value * 1000;
  }
  return value;
}

// A state fixed by (Tdb, W) is pressure-independent, but a point the user
// defined through RH/Twb/v represents "this reading at the current pressure":
// when Patm changes it must be re-solved so it stays on its defining curve,
// and every point's cached property snapshot must be recomputed either way.
const PRESSURE_DEPENDENT_PARAMS = new Set(["RH", "Twb", "v", "Tdp", "VPD", "AH"]);

function isPressureDependentSource(source) {
  return !!source && source.kind === "params"
    && (PRESSURE_DEPENDENT_PARAMS.has(source.p1Type) || PRESSURE_DEPENDENT_PARAMS.has(source.p2Type));
}

function resolveSourceAtPressure(source, Patm) {
  const res = Psychro.solveRobust(source.p1Type, source.p1Val, source.p2Type, source.p2Val, Patm);
  return Number.isFinite(res.t) && Number.isFinite(res.w) ? res : null;
}

function refreshForPressure() {
  const Patm = getPressureInPa();

  State.points.forEach((point) => {
    if (isPressureDependentSource(point.source)) {
      const res = resolveSourceAtPressure(point.source, Patm);
      if (res) {
        point.t = res.t;
        point.w = res.w;
      }
    }
    point.data = calculateAllProperties(point.t, point.w, Patm);
  });

  State.zones.forEach((zone) => {
    const src = zone.source;
    if (src?.kind === "auto-zone") {
      const points = generateAutoZonePoints(src.paramType, src.minVal, src.maxVal, Patm, src.minT, src.maxT, src.maxH);
      if (points.length >= 3) zone.points = points;
    } else {
      zone.points.forEach((vertex) => {
        if (isPressureDependentSource(vertex.source)) {
          const res = resolveSourceAtPressure(vertex.source, Patm);
          if (res) {
            vertex.t = res.t;
            vertex.w = res.w;
          }
        }
      });
    }
  });
}

let _pressureRefreshTimer = null;
function onPressureInputChange() {
  if (_pressureRefreshTimer) clearTimeout(_pressureRefreshTimer);
  _pressureRefreshTimer = setTimeout(() => {
    _pressureRefreshTimer = null;
    refreshForPressure();
    updateLists();
    drawChart();
  }, 150);
}

function toggleAdvancedSettings() {
  const header = document.querySelector(".advanced-settings-header");
  const icon = document.getElementById("advanced-settings-icon");
  if (!header || !icon) return;
  
  header.classList.toggle("collapsed");
  
  if (header.classList.contains("collapsed")) {
    icon.textContent = "expand_more";
  } else {
    icon.textContent = "expand_less";
  }
}

function setSettingsTab(tabName) {
  const tabAlias = {
    range: "chart",
    cursor: "display",
  };
  const normalizedTab = tabAlias[tabName] || tabName;

  document.querySelectorAll("#settings-tabs .seg-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTabBtn === normalizedTab);
  });

  document.querySelectorAll(".settings-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsTab === normalizedTab);
  });

  scheduleAnimatedTabRefresh();
}

const ANIMATED_TAB_CONTAINERS = "#app-charttype, #app-modebar, .seg-control";
let animatedTabResizeObserver = null;

function ensureTabIndicator(container) {
  let indicator = container.querySelector(":scope > .tab-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "tab-indicator";
    container.prepend(indicator);
  }
  return indicator;
}

function syncAnimatedTabIndicator(container) {
  if (!container) return;

  const indicator = ensureTabIndicator(container);
  const activeButton = Array.from(container.children).find((child) =>
    child.matches?.(".modebar-btn.active, .seg-btn.active")
  );

  if (!activeButton || !activeButton.offsetWidth || !container.getClientRects().length) {
    indicator.style.opacity = "0";
    return;
  }

  indicator.style.opacity = "1";
  indicator.style.width = `${activeButton.offsetWidth}px`;
  indicator.style.height = `${activeButton.offsetHeight}px`;
  indicator.style.transform = `translate3d(${activeButton.offsetLeft}px, ${activeButton.offsetTop}px, 0)`;
  indicator.style.borderRadius = window.getComputedStyle(activeButton).borderRadius;
}

function refreshAnimatedTabs() {
  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach(syncAnimatedTabIndicator);
}

function scheduleAnimatedTabRefresh() {
  if (scheduleAnimatedTabRefresh._raf) {
    cancelAnimationFrame(scheduleAnimatedTabRefresh._raf);
  }
  scheduleAnimatedTabRefresh._raf = requestAnimationFrame(() => {
    refreshAnimatedTabs();
    scheduleAnimatedTabRefresh._raf = null;
  });
}

function initializeAnimatedTabObservers() {
  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach((container) => {
    ensureTabIndicator(container);
  });

  if (!("ResizeObserver" in window)) return;
  if (!animatedTabResizeObserver) {
    animatedTabResizeObserver = new ResizeObserver(() => {
      scheduleAnimatedTabRefresh();
    });
  }

  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach((container) => {
    if (container.dataset.tabResizeObserved === "true") return;
    animatedTabResizeObserver.observe(container);
    container.dataset.tabResizeObserved = "true";
  });
}

function setZoneSubMode(subMode) {
  const nextSubMode = ["manual", "input", "auto", "plants"].includes(subMode)
    ? subMode
    : "manual";

  State.zoneSubMode = nextSubMode;
  const icons = { manual: "ads_click", input: "edit_note", auto: "auto_awesome", plants: "local_florist" };
  const labels = { manual: "Click", input: "Input", auto: "Auto Zone", plants: "Plants" };
  const icon = document.getElementById("zone-submode-icon");
  const label = document.getElementById("zone-submode-label");
  if (icon) icon.textContent = icons[nextSubMode] || "ads_click";
  if (label) label.textContent = translateLiteral(labels[nextSubMode] || nextSubMode);

  document.getElementById("zone-manual-ui").style.display =
    nextSubMode === "manual" ? "grid" : "none";
  document.getElementById("zone-input-ui").style.display =
    nextSubMode === "input" ? "grid" : "none";
  document.getElementById("zone-auto-ui").style.display =
    nextSubMode === "auto" ? "grid" : "none";
  document.getElementById("zone-plants-ui").style.display =
    nextSubMode === "plants" ? "grid" : "none";

  if (nextSubMode !== "manual") {
    cancelZone();
  }

  if (nextSubMode === "auto") {
    State.realDataZoneDraft = null;
    State.rangePreview = [];
    previewAutoZone();
  } else if (nextSubMode === "plants") {
    State.rangePreview = [];
    populatePlantsZoneDatasetSelect();
    previewPlantsZone();
  } else {
    State.realDataZoneDraft = null;
    State.rangePreview = [];
    drawChart();
  }
  ["manual","input","auto","plants"].forEach(m => {
    const b = document.getElementById("seg-zone-" + m);
    if (b) b.classList.toggle("active", m === nextSubMode);
  });
  scheduleAnimatedTabRefresh();
}

function setPointSubMode(subMode) {
  State.pointSubMode = subMode;
  const icons = { manual: "ads_click", input: "edit_note", batch: "data_table", sensor: "sensors" };
  const labels = { manual: "Click", input: "Input", batch: "Batch CSV", sensor: "Live Sensor" };
  const icon = document.getElementById("point-submode-icon");
  const label = document.getElementById("point-submode-label");
  if (icon) icon.textContent = icons[subMode] || "ads_click";
  if (label) label.textContent = translateLiteral(labels[subMode] || subMode);

  document.getElementById("point-manual-ui").style.display =
    subMode === "manual" ? "grid" : "none";
  document.getElementById("point-input-ui").style.display =
    subMode === "input" ? "grid" : "none";
  document.getElementById("point-batch-ui").style.display =
    subMode === "batch" ? "grid" : "none";
  document.getElementById("point-sensor-ui").style.display =
    subMode === "sensor" ? "grid" : "none";
  
  if (subMode === "sensor") renderSensorList();
  ["manual","input","batch","sensor"].forEach(m => {
    const b = document.getElementById("seg-point-" + m);
    if (b) b.classList.toggle("active", m === subMode);
  });
  scheduleAnimatedTabRefresh();
}

function setMode(mode) {
  State.mode = mode;
  document
    .querySelectorAll(".toolbar .tool-btn, #app-modebar .modebar-btn")
    .forEach((b) => b.classList.remove("active"));
  if (document.getElementById("btn-" + mode))
    document.getElementById("btn-" + mode).classList.add("active");

  const exploreCtrl = document.getElementById("explore-controls");
  if (exploreCtrl) exploreCtrl.style.display = mode === "view" ? "grid" : "none";

  const zoneCtrl = document.getElementById("zone-controls");
  zoneCtrl.style.display = mode === "zone" ? "grid" : "none";

  const pointCtrl = document.getElementById("point-controls");
  pointCtrl.style.display = mode === "point" ? "grid" : "none";

  if (mode === "zone") {
    if (!State.zoneSubMode) setZoneSubMode("manual");
    else setZoneSubMode(State.zoneSubMode);
  }

  if (mode !== "zone") {
    cancelZone();
    State.rangePreview = [];
  }
  scheduleAnimatedTabRefresh();
  drawChart();
}

function updateZonePtCount() {
  document.getElementById("zonePtCount").innerText =
    formatI18n("pointsCount", { count: State.tempZone.length });
}

function openManualModal(target) {
  State.targetForManual = target;
  document.getElementById("modalTitle").innerText =
    target === "point" ? "Add Manual Point" : "Add Zone Vertex";
  document.getElementById("manualModal").style.display = "flex";
}

function submitManualInput(target) {
  State.targetForManual = target;
  const p1Type = document.getElementById("p1Type-" + target).value;
  const p1Val = parseFloat(document.getElementById("p1Val-" + target).value);
  const p2Type = document.getElementById("p2Type-" + target).value;
  const p2Val = parseFloat(document.getElementById("p2Val-" + target).value);
  const Patm = getPressureInPa();

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

  if (State.targetForManual === "point") {
    addPoint(res.t, res.w, source);
  } else if (State.targetForManual === "zone") {
    if (State.mode !== "zone") setMode("zone");
    State.tempZone.push({ t: res.t, w: res.w, source });
    updateZonePtCount();
    drawChart();
  }
}

// === LIST & CRUD ===

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}
