// ==========================================
// import-export.js — CSV import & export, point/zone CRUD
// ==========================================

// === EXPORT/IMPORT ===

function getCheckboxValue(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function buildKeyValueExportRows() {
  const rows = [];
  const infoFields = getSelectedInfoFields();
  rows.push(["meta.version", "1"]);
  rows.push(["settings.language", State.language]);
  rows.push(["settings.chartType", State.chartType]);
  rows.push(["settings.mode", State.mode]);
  rows.push(["settings.yAxisType", State.yAxisType]);
  rows.push(["settings.pressure", getInputValue("pressure")]);
  rows.push(["settings.pressureUnit", getInputValue("pressure-unit")]);
  rows.push(["settings.minTemp", getInputValue("minTemp")]);
  rows.push(["settings.maxTemp", getInputValue("maxTemp")]);
  rows.push(["settings.maxHum", getInputValue("maxHum")]);
  rows.push(["settings.maxAbsHum", getInputValue("maxAbsHum")]);
  rows.push(["settings.minHum", getInputValue("minHum")]);
  rows.push(["settings.minAbsHum", getInputValue("minAbsHum")]);
  rows.push(["settings.showInfoPanel", getCheckboxValue("set-show-info-panel")]);
  rows.push(["settings.infoFields", infoFields.join("|")]);
  rows.push(["settings.infoPrimary", infoFields[0] || ""]);
  rows.push(["settings.infoSecondary", infoFields[1] || ""]);
  rows.push(["settings.showLegend", getCheckboxValue("set-show-legend")]);
  rows.push(["settings.labelInterval", getInputValue("set-line-label-step")]);
  rows.push(["settings.showRh", getCheckboxValue("set-show-rh")]);
  rows.push(["settings.showH", getCheckboxValue("set-show-h")]);
  rows.push(["settings.showTwb", getCheckboxValue("set-show-twb")]);
  rows.push(["settings.showV", getCheckboxValue("set-show-v")]);
  rows.push(["settings.showSat", getCheckboxValue("set-show-sat")]);
  rows.push(["settings.showTdp", getCheckboxValue("set-show-tdp")]);

  State.points.forEach((p, i) => {
    rows.push([`points.${i}.name`, p.name || "Point"]);
    rows.push([`points.${i}.color`, p.color || "#cc1919"]);
    rows.push([`points.${i}.t`, p.t]);
    rows.push([`points.${i}.w`, p.w]);
  });

  State.zones.forEach((z, zi) => {
    rows.push([`zones.${zi}.name`, z.name || "Zone"]);
    rows.push([`zones.${zi}.color`, z.color || "#19cc2e"]);
    z.points.forEach((pt, pi) => {
      rows.push([`zones.${zi}.points.${pi}.t`, pt.t]);
      rows.push([`zones.${zi}.points.${pi}.w`, pt.w]);
    });
  });

  return rows;
}

function exportToCSV() {
  const rows = buildKeyValueExportRows();
  const csv = rows
    .map((row) => row.map((cell) => {
      const value = cell === null || cell === undefined ? "" : String(cell);
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "psychrometric-data.csv";
  link.click();
}

function openImportDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    importFromFile(file);
  };
  input.click();
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.length > 0) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((r) => [r[0], r[1]])
    .filter((r) => r[0] !== undefined && String(r[0]).trim() !== "");
}

function parseBool(value) {
  const val = String(value).trim().toLowerCase();
  return val === "true" || val === "1" || val === "yes" || val === "on";
}

function importFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  const reportImportError = (error) => {
    console.error("Import failed:", error);
    alert(translateLiteral("Could not read the selected file. Please check that it is a valid CSV export."));
  };

  if (ext === "csv") {
    const reader = new FileReader();
    reader.onerror = () => reportImportError(reader.error);
    reader.onload = () => {
      try {
        const rows = parseCSVRows(reader.result || "");
        applyImportedRows(rows);
      } catch (error) {
        reportImportError(error);
      }
    };
    reader.readAsText(file);
    return;
  }

  alert(translateLiteral("Unsupported file format. Please use CSV."));
}

function applyImportedRows(rows) {
  const settings = {};
  const points = [];
  const zones = [];

  rows.forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").replace(/^\uFEFF/, "").trim();
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
    if (!key) return;

    if (key.startsWith("settings.")) {
      settings[key.replace("settings.", "")] = value;
      return;
    }

    const pointMatch = key.match(/^points\.(\d+)\.(name|color|t|w)$/);
    if (pointMatch) {
      const idx = parseInt(pointMatch[1], 10);
      const field = pointMatch[2];
      points[idx] = points[idx] || {};
      points[idx][field] = value;
      return;
    }

    const zoneMatch = key.match(/^zones\.(\d+)\.(name|color)$/);
    if (zoneMatch) {
      const idx = parseInt(zoneMatch[1], 10);
      const field = zoneMatch[2];
      zones[idx] = zones[idx] || { points: [] };
      zones[idx][field] = value;
      return;
    }

    const zonePointMatch = key.match(/^zones\.(\d+)\.points\.(\d+)\.(t|w)$/);
    if (zonePointMatch) {
      const zIdx = parseInt(zonePointMatch[1], 10);
      const pIdx = parseInt(zonePointMatch[2], 10);
      const field = zonePointMatch[3];
      zones[zIdx] = zones[zIdx] || { points: [] };
      zones[zIdx].points[pIdx] = zones[zIdx].points[pIdx] || {};
      zones[zIdx].points[pIdx][field] = value;
    }
  });

  applyImportedSettings(settings);
  applyImportedData(points, zones);
}

function applyImportedSettings(settings) {
  if (settings.language !== undefined) {
    State.language = normalizeLanguage(settings.language);
  }
  if (settings.realDataZoneVisibility !== undefined) {
    setRealDataZoneVisibilityMap(settings.realDataZoneVisibility);
  }
  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = State.language;
  }
  if (settings.chartType) changeChartType(settings.chartType);
  if (settings.yAxisType) changeYAxisType(settings.yAxisType);

  if (settings.pressureUnit) {
    const unit = document.getElementById("pressure-unit");
    if (unit) {
      unit.value = settings.pressureUnit;
    }
  }
  if (settings.pressure !== undefined) {
    const pressureInput = document.getElementById("pressure");
    if (pressureInput) {
      pressureInput.value = settings.pressure;
      const unitValue = getInputValue("pressure-unit");
      pressureInput.step = unitValue === "kPa" ? 0.1 : 100;
    }
  }

  const minTemp = document.getElementById("minTemp");
  if (minTemp && settings.minTemp !== undefined) minTemp.value = settings.minTemp;
  const maxTemp = document.getElementById("maxTemp");
  if (maxTemp && settings.maxTemp !== undefined) maxTemp.value = settings.maxTemp;
  const maxHum = document.getElementById("maxHum");
  if (maxHum && settings.maxHum !== undefined) maxHum.value = settings.maxHum;
  const maxAbsHum = document.getElementById("maxAbsHum");
  if (maxAbsHum && settings.maxAbsHum !== undefined) maxAbsHum.value = settings.maxAbsHum;
  const minHum = document.getElementById("minHum");
  if (minHum && settings.minHum !== undefined) minHum.value = settings.minHum;
  const minAbsHum = document.getElementById("minAbsHum");
  if (minAbsHum && settings.minAbsHum !== undefined) minAbsHum.value = settings.minAbsHum;

  const checkboxMap = {
    "set-show-info-panel": settings.showInfoPanel,
    "set-show-legend": settings.showLegend,
    "set-show-rh": settings.showRh,
    "set-show-h": settings.showH,
    "set-show-twb": settings.showTwb,
    "set-show-v": settings.showV,
    "set-show-sat": settings.showSat,
    "set-show-tdp": settings.showTdp,
  };

  Object.keys(checkboxMap).forEach((id) => {
    if (checkboxMap[id] === undefined) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = parseBool(checkboxMap[id]);
    if (inputHandlers[id]) {
      inputHandlers[id]({ target: el });
    }
  });

  renderCursorFieldSettings(getImportedCursorFields(settings));
  if (settings.infoPrecisionDecimals !== undefined) {
    setInfoPrecisionDecimals(settings.infoPrecisionDecimals);
  } else if (settings.infoPrecisionOffset !== undefined) {
    setInfoPrecisionDecimals((parseInt(settings.infoPrecisionOffset, 10) || 0) + DEFAULT_INFO_PRECISION_DECIMALS);
  }
  setMinimapMode(settings.minimapMode, { redraw: false });
  const labelInterval = document.getElementById("set-line-label-step");
  if (labelInterval && settings.labelInterval !== undefined) labelInterval.value = settings.labelInterval;
  syncRealDataVisibilityDefaults();
  syncRealDataZoneConfigDefaults();
  renderRealDataZoneSettings();
  populatePlantsZoneDatasetSelect();
  drawChart();
  applyLanguage();
}

function applyImportedData(points, zones) {
  State.points = [];
  State.zones = [];

  const Patm = getPressureInPa();

  points.forEach((p) => {
    if (!p || p.t === undefined || p.w === undefined) return;
    const t = parseFloat(p.t);
    const w = parseFloat(p.w);
    if (isNaN(t) || isNaN(w)) return;
    const data = calculateAllProperties(t, w, Patm);
    State.points.push({
      id: generateEntityId(),
      name: p.name || formatI18n("defaultPointName"),
      color: p.color || "#cc1919",
      t,
      w,
      data,
      ...(p.source ? { source: cloneValue(p.source) } : {}),
      ...(p.isSensor && p.sensorId ? { isSensor: true, sensorId: p.sensorId } : {}),
    });
  });

  zones.forEach((z) => {
    if (!z || !Array.isArray(z.points)) return;
    const zonePoints = z.points
      .map((pt) => {
        const t = parseFloat(pt.t);
        const w = parseFloat(pt.w);
        if (isNaN(t) || isNaN(w)) return null;
        return { t, w, ...(pt.source ? { source: cloneValue(pt.source) } : {}) };
      })
      .filter(Boolean);

    if (zonePoints.length > 0) {
      State.zones.push({
        id: generateEntityId(),
        name: z.name || formatI18n("defaultZoneName"),
        color: z.color || "#19cc2e",
        points: zonePoints,
        ...(z.source ? { source: cloneValue(z.source) } : {}),
      });
    }
  });

  historyManager.push(State);
  updateLists();
  updateToolbarsVisibility();
  drawChart();
}

function clearSelections() {
  State.selectedPointId = null;
  State.selectedZoneId = null;
  document.querySelectorAll(".list-item.active").forEach((item) => {
    item.classList.remove("active");
  });
  document.querySelectorAll("#zones-layer polygon").forEach((zone) => {
    zone.classList.remove("selected");
  })
  document
    .querySelectorAll("#points-layer .selected")
    .forEach((selectedPoint) => {
      selectedPoint.classList.remove("selected");
    });
  document
    .querySelectorAll("#zones-layer .selected")
    .forEach((selectedZone) => {
      selectedZone.classList.remove("selected");
    });
}

function selectPoint(id, event) {
  if (event) event.stopPropagation();
  if (State.selectedPointId === id) {
    clearSelections();
    updateLists();
    drawChart();
    return;
  }
  State.selectedPointId = id;
  State.selectedZoneId = null;
  updateLists();
  drawChart();
}

function selectZone(id, event) {
  if (event) event.stopPropagation();
  if (State.selectedZoneId === id) {
    clearSelections();
    updateLists();
    drawChart();
    return;
  }
  State.selectedZoneId = id;
  State.selectedPointId = null;
  updateLists();
  drawChart();
}

function deletePoint(e, id) {
  e.stopPropagation();
  State.points = State.points.filter((p) => p.id !== id);
  if (State.selectedPointId === id) State.selectedPointId = null;
  historyManager.push(State);
  updateLists();
  drawChart();
}

function deleteZone(e, id) {
  e.stopPropagation();
  State.zones = State.zones.filter((z) => z.id !== id);
  if (State.selectedZoneId === id) State.selectedZoneId = null;
  historyManager.push(State);
  updateLists();
  drawChart();
}

// === UNIFIED EDIT MODAL ===

function openDetailModal(type, id, event) {
  if (event) event.stopPropagation();

  const detailWindow = document.getElementById("floating-detail-window");
  const titleEl = document.getElementById("detailModalTitle");
  const contentEl = document.getElementById("detailModalContent");
  if (!detailWindow || !titleEl || !contentEl) return;

  if (type === "point") {
    const point = State.points.find((item) => item.id === id);
    if (!point) return;
    titleEl.innerText = getLocalizedDisplayName(point.name, "point") || translateLiteral("Point Details");
    contentEl.innerHTML = buildPointDetailContent(point);
  } else if (type === "zone") {
    const zone = State.zones.find((item) => item.id === id);
    if (!zone) return;
    titleEl.innerText = getLocalizedDisplayName(zone.name, "zone") || translateLiteral("Zone Details");
    contentEl.innerHTML = buildZoneDetailContent(zone);
  } else {
    return;
  }

  resetPopupWindowFrame(detailWindow);
  showFloatingWindow(detailWindow);
  applyLanguage(detailWindow);
}

function openEditModal(type, id, event) {
  if (event) event.stopPropagation();
  else if (window.event) window.event.stopPropagation();

  const editWindow = document.getElementById("floating-edit-window");
  document.getElementById("editId").value = id;
  document.getElementById("editType").value = type;

  const colorContainer = document.getElementById("colorContainer");
  const nameInput = document.getElementById("editName");
  const colorInput = document.getElementById("editColor");

  if (type === "point") {
    const p = State.points.find((item) => item.id === id);
    if (!p) return;
    document.getElementById("editModalTitle").innerText = translateLiteral("Edit Point");
    nameInput.value = p.name;
    colorInput.value = p.color || "#ff0000";
    colorContainer.style.display = "block";
  } else if (type === "zone") {
    const z = State.zones.find((item) => item.id === id);
    if (!z) return;
    document.getElementById("editModalTitle").innerText = translateLiteral("Edit Zone");
    nameInput.value = z.name;
    colorInput.value = z.color;
    colorContainer.style.display = "block";
  }

  showFloatingWindow(editWindow);
  applyLanguage(editWindow);
}

function saveEditSettings() {
  const id = parseInt(document.getElementById("editId").value);
  const type = document.getElementById("editType").value;
  const newName = document.getElementById("editName").value;

  if (type === "point") {
    const newColor = document.getElementById("editColor").value;
    const p = State.points.find((item) => item.id === id);
    if (p) {
      p.name = newName;
      p.color = newColor;
    }
  } else if (type === "zone") {
    const newColor = document.getElementById("editColor").value;
    const z = State.zones.find((item) => item.id === id);
    if (z) {
      z.name = newName;
      z.color = newColor;
    }
  }

  historyManager.push(State);
  updateLists();
  drawChart();
  closeFloatingWindow("floating-edit-window");
}

function finishZone() {
  if (State.tempZone.length < 3) {
    alert(translateLiteral("Min 3 points required."));
    return;
  }

  const finalPoints = [...State.tempZone];

  State.zones.push({
    id: generateEntityId(),
    name: formatI18n("defaultZoneName"),
    color: "#19cc2e",
    points: finalPoints,
  });

  State.tempZone = [];
  State.rangePreview = [];
  historyManager.push(State);
  updateLists();
  drawChart();

  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = formatI18n("pointsCount", { count: 0 });
}

function cancelZone() {
  State.tempZone = [];
  State.rangePreview = [];
  if (State.zoneSubMode !== "plants") {
    State.realDataZoneDraft = null;
  }

  drawChart();
  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = formatI18n("pointsCount", { count: 0 });
}

function clearAllData() {
  if (confirm(translateLiteral("Clear all?"))) {
    State.points = [];
    State.zones = [];
    State.tempZone = [];
    historyManager.push(State);
    updateLists();
    drawChart();
    updateZonePtCount();
  }
}
