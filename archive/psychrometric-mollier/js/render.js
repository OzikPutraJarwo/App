// ==========================================
// render.js — drawChart, drawPsychroLines, chartXY, minimap
// ==========================================

// === CHART RENDERING ===

const margin = {
  top: chart_margin_top,
  right: chart_margin_right,
  bottom: chart_margin_bottom,
  left: chart_margin_left,
};
const chartWrapper = document.getElementById("chart-wrapper");
const svgContainer = d3
  .select("#chart-container")
  .append("svg")
  .attr("style", "background: #fff")
  .attr("width", "100%")
  .attr("height", "100%");
svgContainer
  .append("defs")
  .append("clipPath")
  .attr("id", "chart-clip")
  .append("rect");
const svg = svgContainer
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const gridLayer = svg.append("g"); 

const linesLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "lines-layer");
const labelLayer = svg.append("g");

const axesLayer = svg.append("g");

const overlay = svg
  .append("rect")
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "transparent")
  .style("pointer-events", "all");

const zoneLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "zones-layer");
const pointLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "points-layer");
const playbackLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "playback-layer");
const dssLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "dss-layer");

// Stashed on every full drawChart() so hover-driven updates (DSS advisor,
// Fase 4) can reposition their overlay without forcing a full redraw —
// mirrors handleMouseMove's existing no-redraw-on-hover design.
let currentChartXScale = null;
let currentChartYScale = null;
let currentChartPatm = null;
function calculateAbsoluteHumidity(t, w, Patm) {
  const v = Psychro.getSpecificVolume(t, w, Patm);
  return (w / v) * 1000;
}

function getWFromAbsoluteHumidity(t, ah, Patm) {
  let wLow = 0;
  let wHigh = 0.1;
  let wMid = 0;

  for (let i = 0; i < 50; i++) {
    wMid = (wLow + wHigh) / 2;
    const ahCalc = calculateAbsoluteHumidity(t, wMid, Patm);

    if (ahCalc > ah) {
      wHigh = wMid;
    } else {
      wLow = wMid;
    }
  }

  return wMid;
}

function getYValue(t, w, Patm) {
  if (State.yAxisType === "absoluteHumidity") {
    return calculateAbsoluteHumidity(t, w, Patm);
  }
  return w;
}

// Psychrometric and Mollier are the same renderer with x/y scale roles
// swapped (Tdb vs humidity axis); this is the single source of truth for
// mapping a (t, w) state point to screen pixel coordinates.
function chartXY(t, w, x, y, Patm) {
  const hVal = getYValue(t, w, Patm);
  return State.chartType === "psychrometric"
    ? { x: x(t), y: y(hVal) }
    : { x: x(hVal), y: y(t) };
}

function getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm) {
  let t, w;

  if (State.chartType === "psychrometric") {
    t = x.invert(mx);

    if (State.yAxisType === "absoluteHumidity") {
      const ah = y.invert(my);
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = y.invert(my);
    }
  } else {
    if (State.yAxisType === "absoluteHumidity") {
      const ah = x.invert(mx);
      t = y.invert(my);
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = x.invert(mx);
      t = y.invert(my);
    }
  }

  t = Math.max(minT, Math.min(maxT, t));
  w = Math.max(0, Math.min(maxH, w));

  return { t, w };
}

function clampMinimapValue(value, minValue, maxValue, fallbackValue) {
  const fallback = Number.isFinite(fallbackValue) ? fallbackValue : minValue;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(minValue, Math.min(maxValue, numericValue));
}

function getMinimapViewportBounds(Patm) {
  const minTempInput = parseFloat(document.getElementById("minTemp")?.value);
  const maxTempInput = parseFloat(document.getElementById("maxTemp")?.value);
  const maxHumInput = parseFloat(document.getElementById("maxHum")?.value);
  const maxAbsHumInput = parseFloat(document.getElementById("maxAbsHum")?.value);

  let minT = clampMinimapValue(minTempInput, MINIMAP_T_MIN, MINIMAP_T_MAX - 1, MINIMAP_T_MIN);
  let maxT = clampMinimapValue(maxTempInput, minT + 1, MINIMAP_T_MAX, MINIMAP_T_MAX);
  if (maxT <= minT) {
    maxT = Math.min(MINIMAP_T_MAX, minT + 1);
  }

  let minWSource = State.viewMinH;
  let maxWSource = maxHumInput;

  if (State.yAxisType === "absoluteHumidity") {
    const anchorT = (minT + maxT) / 2;
    const safePatm = Number.isFinite(Patm) ? Patm : getPressureInPa();
    minWSource = getWFromAbsoluteHumidity(anchorT, State.viewMinAH, safePatm);
    maxWSource = getWFromAbsoluteHumidity(anchorT, maxAbsHumInput, safePatm);
  }

  let minW = clampMinimapValue(minWSource, MINIMAP_W_MIN, MINIMAP_W_MAX - 0.0001, MINIMAP_W_MIN);
  let maxW = clampMinimapValue(maxWSource, minW + 0.0001, MINIMAP_W_MAX, MINIMAP_W_MAX);
  if (maxW <= minW) {
    maxW = Math.min(MINIMAP_W_MAX, minW + 0.0001);
  }

  return { minT, maxT, minW, maxW };
}

function buildMinimapPolygonPoints(points, xScale, yScale) {
  return points
    .filter((point) => point && Number.isFinite(point.t) && Number.isFinite(point.w))
    .map((point) => `${xScale(point.t)},${yScale(point.w)}`)
    .join(" ");
}

function renderChartMinimap(Patm, realDataZones = []) {
  const minimapContainer = document.getElementById("chart-minimap");
  const minimapSvgNode = document.getElementById("chart-minimap-svg");
  if (!minimapContainer || !minimapSvgNode) return;

  const wrapperRect = chartWrapper.getBoundingClientRect();
  const legendNode = chartWrapper.querySelector(".chart-legend");
  if (legendNode) {
    const legendRect = legendNode.getBoundingClientRect();
    minimapContainer.style.left = `${Math.max(0, legendRect.left - wrapperRect.left)}px`;
    minimapContainer.style.top = `${Math.max(0, legendRect.top - wrapperRect.top)}px`;
  } else {
    minimapContainer.style.left = `${chart_margin_left + 16}px`;
    minimapContainer.style.top = `${chart_margin_top + 16}px`;
  }

  // Keep minimap height aligned with legend height; only width differs.
  const visibleLegendCount = ["rh", "twb", "h", "v", "sat", "tdp"].filter((key) => State.visibility?.[key]).length;
  minimapContainer.style.height = `${30 + visibleLegendCount * 18}px`;

  const minimapMode = normalizeMinimapMode(State.minimapMode);
  if (minimapMode === "hide" || (minimapMode === "auto" && !shouldShowMinimapNow())) {
    updateMinimapVisibilityState();
    return;
  }

  const width = minimapContainer.clientWidth;
  const height = minimapContainer.clientHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 30 || height <= 30) return;

  const padding = 8;
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);

  const xMini = d3.scaleLinear().domain([MINIMAP_T_MIN, MINIMAP_T_MAX]).range([padding, padding + innerWidth]);
  const yMini = d3.scaleLinear().domain([MINIMAP_W_MIN, MINIMAP_W_MAX]).range([padding + innerHeight, padding]);

  const minimapSvg = d3
    .select(minimapSvgNode)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  const defs = minimapSvg.selectAll("defs").data([null]).join("defs");
  defs
    .selectAll("clipPath#minimap-clip")
    .data([null])
    .join("clipPath")
    .attr("id", "minimap-clip")
    .selectAll("rect")
    .data([null])
    .join("rect")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  const root = minimapSvg.selectAll("g.minimap-root").data([null]).join("g").attr("class", "minimap-root");

  root
    .selectAll("rect.minimap-plot-bg")
    .data([null])
    .join("rect")
    .attr("class", "minimap-plot-bg")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("ry", 6);

  const gridLayer = root
    .selectAll("g.minimap-grid")
    .data([null])
    .join("g")
    .attr("class", "minimap-grid")
    .attr("clip-path", "url(#minimap-clip)");

  gridLayer
    .selectAll("line.minimap-grid-x")
    .data(xMini.ticks(10))
    .join("line")
    .attr("class", "minimap-grid-x")
    .attr("x1", (value) => xMini(value))
    .attr("x2", (value) => xMini(value))
    .attr("y1", padding)
    .attr("y2", padding + innerHeight);

  gridLayer
    .selectAll("line.minimap-grid-y")
    .data(yMini.ticks(8))
    .join("line")
    .attr("class", "minimap-grid-y")
    .attr("x1", padding)
    .attr("x2", padding + innerWidth)
    .attr("y1", (value) => yMini(value))
    .attr("y2", (value) => yMini(value));

  const dataLayer = root
    .selectAll("g.minimap-data")
    .data([null])
    .join("g")
    .attr("class", "minimap-data")
    .attr("clip-path", "url(#minimap-clip)");

  const saturationPoints = [];
  for (let t = MINIMAP_T_MIN; t <= MINIMAP_T_MAX; t += 1) {
    const satW = Psychro.getWFromPw(Psychro.getSatVapPres(t), Patm);
    if (!Number.isFinite(satW)) continue;
    saturationPoints.push({
      t,
      w: clampMinimapValue(satW, MINIMAP_W_MIN, MINIMAP_W_MAX, MINIMAP_W_MIN),
    });
  }

  dataLayer
    .selectAll("path.minimap-saturation")
    .data(saturationPoints.length ? [saturationPoints] : [])
    .join("path")
    .attr("class", "minimap-saturation")
    .attr("d", d3.line().x((point) => xMini(point.t)).y((point) => yMini(point.w)));

  dataLayer
    .selectAll("polygon.minimap-real-data-zone")
    .data(realDataZones, (zone) => zone.id)
    .join("polygon")
    .attr("class", "minimap-real-data-zone")
    .attr("points", (zone) => buildMinimapPolygonPoints(zone.points || [], xMini, yMini))
    .attr("fill", (zone) => {
      const rgb = hexToRgb(zone.color || "#1b9e2a");
      return `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
    })
    .attr("stroke", (zone) => zone.color || "#1b9e2a");

  dataLayer
    .selectAll("polygon.minimap-user-zone")
    .data(State.zones, (zone) => zone.id)
    .join("polygon")
    .attr("class", "minimap-user-zone")
    .attr("points", (zone) => buildMinimapPolygonPoints(zone.points || [], xMini, yMini))
    .attr("fill", (zone) => {
      const rgb = hexToRgb(zone.color || "#19cc2e");
      return `rgba(${rgb.r},${rgb.g},${rgb.b},0.24)`;
    })
    .attr("stroke", (zone) => zone.color || "#19cc2e");

  dataLayer
    .selectAll("polyline.minimap-temp-zone")
    .data(State.tempZone.length ? [State.tempZone] : [])
    .join("polyline")
    .attr("class", "minimap-temp-zone")
    .attr("points", (points) => buildMinimapPolygonPoints(points, xMini, yMini));

  dataLayer
    .selectAll("polygon.minimap-range-preview")
    .data(State.rangePreview.length ? [State.rangePreview] : [])
    .join("polygon")
    .attr("class", "minimap-range-preview")
    .attr("points", (points) => buildMinimapPolygonPoints(points, xMini, yMini));

  dataLayer
    .selectAll("circle.minimap-point")
    .data(State.points.filter((point) => Number.isFinite(point?.t) && Number.isFinite(point?.w)), (point) => point.id)
    .join("circle")
    .attr("class", "minimap-point")
    .attr("cx", (point) => xMini(point.t))
    .attr("cy", (point) => yMini(point.w))
    .attr("r", 1.9)
    .attr("fill", (point) => point.color || "#cc1919");

  const viewport = getMinimapViewportBounds(Patm);
  const x0 = xMini(viewport.minT);
  const x1 = xMini(viewport.maxT);
  const y0 = yMini(viewport.maxW);
  const y1 = yMini(viewport.minW);

  const viewportLayer = root.selectAll("g.minimap-viewport").data([null]).join("g").attr("class", "minimap-viewport");
  viewportLayer
    .selectAll("rect.minimap-viewport-box")
    .data([null])
    .join("rect")
    .attr("class", "minimap-viewport-box")
    .attr("x", Math.min(x0, x1))
    .attr("y", Math.min(y0, y1))
    .attr("width", Math.max(2, Math.abs(x1 - x0)))
    .attr("height", Math.max(2, Math.abs(y1 - y0)));

  root
    .selectAll("rect.minimap-frame")
    .data([null])
    .join("rect")
    .attr("class", "minimap-frame")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("ry", 6);

  updateMinimapVisibilityState();
}

function drawChart() {
  const w = chartWrapper.clientWidth - margin.left - margin.right;
  const h = chartWrapper.clientHeight - margin.top - margin.bottom;
  if (w < 0 || h < 0) return;

  d3.select("#chart-clip rect").attr("width", w).attr("height", h);

  overlay
    .attr("width", w)
    .attr("height", h)
    .attr("x", 0)
    .attr("y", 0);

  // Validasi input
  const minTInput = document.getElementById("minTemp");
  if (parseFloat(minTInput.value) < min_tdb) {
    minTInput.value = min_tdb;
  }

  const maxTInput = document.getElementById("maxTemp");
  if (parseFloat(maxTInput.value) > max_tdb) {
    maxTInput.value = max_tdb;
  }

  if (parseFloat(minTInput.value) >= parseFloat(maxTInput.value)) {
    minTInput.value = parseFloat(maxTInput.value) - 1;
  }
  if (parseFloat(maxTInput.value) <= parseFloat(minTInput.value)) {
    maxTInput.value = parseFloat(minTInput.value) + 1;
  }

  if (State.yAxisType === "absoluteHumidity") _syncRatioFromAbsHum();
  else _syncAbsHumFromRatio();

  // Ambil nilai
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(maxTInput.value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const Patm = getPressureInPa();

  let x, y;
  // Clamp viewport lower bounds so they never exceed the current upper bounds.
  const minHumConfig = parseFloat(document.getElementById("minHum")?.value) || 0;
  const viewMinH = Math.min(State.viewMinH, maxH - 0.001);
  State.viewMinH = Math.max(minHumConfig, viewMinH);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);
  const minAbsHumConfig = parseFloat(document.getElementById("minAbsHum")?.value) || 0;
  const viewMinAH = Math.min(State.viewMinAH, maxAH - 0.1);
  State.viewMinAH = Math.max(minAbsHumConfig, viewMinAH);

  if (State.chartType === "psychrometric") {
    x = d3.scaleLinear().domain([minT, maxT]).range([0, w]);

    if (State.yAxisType === "absoluteHumidity") {
      y = d3.scaleLinear().domain([State.viewMinAH, maxAH]).range([h, 0]);
    } else {
      y = d3.scaleLinear().domain([State.viewMinH, maxH]).range([h, 0]);
    }
  } else {
    // Mollier: x = Humidity, y = DBT
    if (State.yAxisType === "absoluteHumidity") {
      x = d3.scaleLinear().domain([State.viewMinAH, maxAH]).range([0, w]);
    } else {
      x = d3.scaleLinear().domain([State.viewMinH, maxH]).range([0, w]);
    }
    y = d3.scaleLinear().domain([minT, maxT]).range([h, 0]);
  }

  const line =
    State.chartType === "psychrometric"
      ? d3
          .line()
          .x((d) => x(d.t))
          .y((d) => y(getYValue(d.t, d.w, Patm)))
      : d3
          .line()
          .x((d) => x(getYValue(d.t, d.w, Patm)))
          .y((d) => y(d.t));

  const curve =
    State.chartType === "psychrometric"
      ? d3
          .line()
          .x((d) => x(d.t))
          .y((d) => y(getYValue(d.t, d.w, Patm)))
          .curve(d3.curveMonotoneX)
      : d3
          .line()
          .x((d) => x(getYValue(d.t, d.w, Patm)))
          .y((d) => y(d.t))
          .curve(d3.curveMonotoneX);

  updateAxisLabels();

  gridLayer.selectAll("*").remove();

  gridLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(
      d3.axisBottom(x).ticks(10).tickSize(-h).tickFormat("")
    )
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5);

  gridLayer
    .append("g")
    .call(
      d3.axisLeft(y).ticks(10).tickSize(-w).tickFormat("")
    )
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5);

  axesLayer.selectAll("*").remove();

  axesLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(10));

  axesLayer.append("g").call(d3.axisLeft(y).ticks(10));

  // LABEL SUMBU (Tetap di axesLayer agar paling atas)
  if (State.chartType === "psychrometric") {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text(translateLiteral("Dry Bulb Temperature (°C)"));
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? translateLiteral("Absolute Humidity (g/m³)")
          : translateLiteral("Humidity Ratio (kg/kg')")
      );
  } else {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? translateLiteral("Absolute Humidity (g/m³)")
          : translateLiteral("Humidity Ratio (kg/kg')")
      );
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text(translateLiteral("Dry Bulb Temperature (°C)"));
  }

  // PSYCHRO LINES & LABELS
  linesLayer.selectAll("*").remove();
  labelLayer.selectAll("*").remove();
  drawPsychroLines(
    linesLayer,
    labelLayer,
    x,
    y,
    w,
    h,
    minT,
    maxT,
    maxH,
    Patm,
    line,
    curve,
    State.chartType
  );

  zoneLayer.selectAll("*").remove();

  const visibleRealDataZones = getVisibleRealDataZones(Patm);
  visibleRealDataZones.forEach((zone) => {
    const displayPoints = zone.points.map((point) => chartXY(point.t, point.w, x, y, Patm));
    const displaySourcePoints = (zone.sourcePoints || zone.points).map((point) => chartXY(point.t, point.w, x, y, Patm));
    const polygonPoints = displayPoints.map((point) => [point.x, point.y].join(",")).join(" ");
    const rgb = hexToRgb(zone.color);
    zoneLayer
      .append("polygon")
      .attr("points", polygonPoints)
      .attr("class", "real-data-zone")
      .attr("fill", `rgba(${rgb.r},${rgb.g},${rgb.b}, 0.18)`)
      .attr("stroke", zone.color)
      .attr("stroke-dasharray", "7 4")
      .attr("stroke-width", 1.8)
      .style("pointer-events", "none");

    zoneLayer
      .append("g")
      .attr("class", "real-data-zone-points")
      .selectAll("circle")
      .data(displaySourcePoints)
      .join("circle")
      .attr("cx", (point) => point.x)
      .attr("cy", (point) => point.y)
      .attr("r", 2.6)
      .attr("fill", zone.color)
      .attr("stroke", "rgba(255,255,255,0.95)")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.92)
      .style("pointer-events", "none");

    renderRealDataZoneLabel(zoneLayer, zone, displayPoints, w, h);
  });
  
  State.zones.forEach((z) => {
    const displayPoints = z.points.map((p) => chartXY(p.t, p.w, x, y, Patm));
    const polyStr = displayPoints.map((point) => [point.x, point.y].join(",")).join(" ");

    const rgb = hexToRgb(z.color);
    const poly = zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "user-zone")
      .attr("data-zone-id", z.id)
      .attr("fill", `rgba(${rgb.r},${rgb.g},${rgb.b}, 0.3)`)
      .attr("stroke", z.color)
      .style("pointer-events", "none");

    if (z.id === State.selectedZoneId) poly.classed("selected", true);

    if (z.showSourcePoints && Array.isArray(z.sourcePoints) && z.sourcePoints.length) {
      const displaySourcePoints = z.sourcePoints.map((point) => chartXY(point.t, point.w, x, y, Patm));

      zoneLayer
        .append("g")
        .attr("class", "user-zone-source-points")
        .selectAll("circle")
        .data(displaySourcePoints)
        .join("circle")
        .attr("cx", (point) => point.x)
        .attr("cy", (point) => point.y)
        .attr("r", 2.6)
        .attr("fill", z.color)
        .attr("stroke", "rgba(255,255,255,0.95)")
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.92)
        .style("pointer-events", "none");
    }

    renderRealDataZoneLabel(zoneLayer, {
      ...z,
      name: getLocalizedDisplayName(z.name, "zone"),
    }, displayPoints, w, h);
  });

  // TEMP ZONES (Manual)
  if (State.tempZone.length > 0) {
    const path = d3.line()(State.tempZone.map((p) => {
      const pt = chartXY(p.t, p.w, x, y, Patm);
      return [pt.x, pt.y];
    }));

    zoneLayer.append("path").attr("d", path).attr("class", "temp-zone-line");

    State.tempZone.forEach((p) => {
      const { x: cx, y: cy } = chartXY(p.t, p.w, x, y, Patm);
      zoneLayer
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 4)
        .attr("fill", "#2196f3");
    });
  }

  // TEMP ZONES (Range)
  if (State.rangePreview.length > 0) {
    const polyStr = State.rangePreview
      .map((p) => {
        const pt = chartXY(p.t, p.w, x, y, Patm);
        return [pt.x, pt.y].join(",");
      })
      .join(" ");

    zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "temp-zone-poly");
  }

  pointLayer.selectAll("*").remove();
  State.points.forEach((p) => {
    const { x: cx, y: cy } = chartXY(p.t, p.w, x, y, Patm);

    const isSelected = p.id === State.selectedPointId;

    const pointGroup = pointLayer
      .append("g")
      .attr("class", "point-group")
      .attr("data-point-id", p.id)
      .style("pointer-events", "none");

    const circle = pointGroup
      .append("circle")
      .attr("class", isSelected ? "user-point selected" : "user-point")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 6)
      .attr("fill", p.color || "#ff0000");

    // Sensor: pulsing ring
    if (p.isSensor) {
      pointGroup
        .append("circle")
        .attr("class", "sensor-pulse")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 10)
        .attr("fill", "none")
        .attr("stroke", p.color || "#1565c0")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.4);
    }

    // Posisi label
    const labelX = cx > w * 0.8 ? cx - 15 : cx + 10;
    const labelY = cy < h * 0.2 ? cy + 15 : cy - 5;

    pointGroup
      .append("text")
      .attr("class", isSelected ? "point-label selected" : "point-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .text(getLocalizedDisplayName(p.name, "point"))
      .style("pointer-events", "none")
      .style("text-anchor", cx > w * 0.8 ? "end" : "start");
  });

  // Interaksi mouse - sesuaikan dengan tipe chart
  overlay
    .on("mousemove", (e) => handleMouseMove(e, x, y, minT, maxT, maxH, Patm))
    .on("click", (e) => handleChartClick(e, x, y, minT, maxT, maxH, Patm))
    .on("contextmenu", (e) => e.preventDefault());

  // Real-data playback trajectory + current-frame marker (Fase 3), defined in
  // playback.js which loads after this file — safe since it's only called
  // once the page has fully loaded (never at drawChart's first definition time).
  playbackLayer.selectAll("*").remove();
  if (typeof renderPlaybackOverlay === "function") {
    renderPlaybackOverlay(playbackLayer, x, y, Patm);
  }

  // DSS advisor overlay (Fase 4), defined in dss.js. Scale/pressure are
  // stashed so hover updates can redraw this layer without a full drawChart.
  currentChartXScale = x;
  currentChartYScale = y;
  currentChartPatm = Patm;
  dssLayer.selectAll("*").remove();
  if (typeof renderDssOverlay === "function") {
    renderDssOverlay(dssLayer, x, y, Patm);
  }
  if (typeof refreshDssPanel === "function") {
    refreshDssPanel();
  }

  // LEGEND
  const showLegend = document.getElementById("set-show-legend").checked;
  if (showLegend) {
    const legG = axesLayer.append("g").attr("class", "chart-legend");

    const allLegItems = [
      { c: color_rh, t: "Rel. Humidity (%)", d: "0", key: "rh" },
      { c: color_h, t: "Enthalpy (kJ/kg)", d: "0", key: "h" },
      { c: color_twb, t: "Wet Bulb (\u00b0C)", d: "4", key: "twb" },
      { c: color_v, t: "Spec. Vol. (m\u00b3/kg)", d: "0", key: "v" },
      { c: color_sat, t: "Saturation", d: "0", key: "sat" },
      { c: color_tdp, t: "Dew Point (\u00b0C)", d: "0", key: "tdp" },
    ];
    
    const legItems = allLegItems.filter(item => State.visibility[item.key]);
    const legendWidth = 162;
    const rowHeight = 18;
    const legendHeight = 30 + legItems.length * rowHeight;

    if (State.chartType === "psychrometric") {
      legG.attr("transform", `translate(16, 16)`);
    } else {
      legG.attr("transform", `translate(${w - legendWidth - 16}, ${h - legendHeight - 16})`);
    }

    legG
      .append("rect")
      .attr("class", "legend-shell")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 18);

    // legG
    //   .append("text")
    //   .text("")
    //   .attr("class", "legend-eyebrow")
    //   .attr("x", 12)
    //   .attr("y", 14);

    legG
      .append("text")
      .text("Legends")
      .attr("class", "legend-title")
      .attr("x", 12)
      .attr("y", 21);

    legItems.forEach((item, i) => {
      const rowY = 27 + i * rowHeight;
      const row = legG.append("g").attr("transform", `translate(8, ${rowY})`);

      row
        .append("rect")
        .attr("class", "legend-row-bg")
        .attr("width", legendWidth - 16)
        .attr("height", 14)
        .attr("rx", 9);

      row
        .append("line")
        .attr("class", "legend-row-line")
        .attr("x1", 10)
        .attr("x2", 31)
        .attr("y1", 7)
        .attr("y2", 7)
        .attr("stroke", item.c)
        .attr("stroke-dasharray", item.d === "0" ? null : item.d);

      row
        .append("text")
        .attr("class", "legend-text")
        .attr("x", 40)
        .attr("y", 10)
        .text(item.t);
    });
  }

  renderChartMinimap(Patm, visibleRealDataZones);
  applyLanguage(document.getElementById("chart-wrapper"));
  queuePersistedStateSave();
}

function handleMouseMove(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());

  const svgElement = svg.node();
  if (State.mode === "point") {
    svgElement.style.cursor = "crosshair";
  } else if (State.mode === "zone") {
    svgElement.style.cursor = "crosshair";
  } else {
    svgElement.style.cursor = "default";
  }

  const { t, w } = getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm);

  if (t < minT || t > maxT || w < 0 || w > maxH) {
    document.getElementById("info-panel").style.display = "none";
    if (typeof onDssHoverUpdate === "function") onDssHoverUpdate(null);
    return;
  }

  if (typeof onDssHoverUpdate === "function") {
    onDssHoverUpdate({ t, w, data: calculateAllProperties(t, w, Patm) });
  }

  const showInfoPanel = document.getElementById("set-show-info-panel");
  if (showInfoPanel && !showInfoPanel.checked) {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const contextMenu = document.getElementById("context-menu");
  if (contextMenu && contextMenu.style.display === "block") {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const d = calculateAllProperties(t, w, Patm);
  const panel = document.getElementById("info-panel");
  const tooltipGrid = document.getElementById("tooltip-grid");
  const fieldCount = getSelectedInfoFields().length;

  panel.style.display = "block";
  if (tooltipGrid) {
    const columnMode = fieldCount > 10 ? "3" : "2";
    panel.dataset.columns = columnMode;
    tooltipGrid.dataset.columns = columnMode;
    tooltipGrid.dataset.density = fieldCount > 18 ? "micro" : fieldCount > 14 ? "compact" : fieldCount > 8 ? "medium" : "default";
    tooltipGrid.innerHTML = renderInfoPanelRows(d);
  }

  const panelW = panel.offsetWidth;
  const panelH = panel.offsetHeight;
  const wrapperW = chartWrapper.clientWidth;
  const wrapperH = chartWrapper.clientHeight;

  let left = margin.left + mx + 15;
  let top = margin.top + my + 15;

  if (left + panelW > wrapperW) {
    left = margin.left + mx - panelW - 15;
  }

  if (top + panelH > wrapperH) {
    top = margin.top + my - panelH - 15;
  }

  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function handleChartClick(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());

  const { t, w } = getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm);

  if (t < minT || t > maxT || w < 0 || w > maxH) return;

  if (State.mode === "point") addPoint(t, w);
  else if (State.mode === "zone") {
    State.tempZone.push({ t, w });
    updateZonePtCount();
    drawChart();
  } else {
    selectPoint(null);
    selectZone(null);
  }
}

function generateHTMLGrid(d) {
  return [
  buildDetailMetricCard("Dry Bulb Temperature (Tdb)", `${d.Tdb.toFixed(2)} °C`),
  buildDetailMetricCard("Wet Bulb Temperature (Twb)", `${d.Twb.toFixed(2)} °C`),
  buildDetailMetricCard("Dew Point Temperature (Tdp)", `${d.Tdp.toFixed(2)} °C`),
  buildDetailMetricCard("Frost Point Temperature (Tf)", `${d.Tf.toFixed(2)} °C`),
  buildDetailMetricCard("Humidity Ratio (W)", `${d.W.toFixed(4)} kg/kg'`),
  buildDetailMetricCard("Relative Humidity (RH)", `${d.RH.toFixed(2)} %`),
  buildDetailMetricCard("Moisture Content (u)", `${d.mu.toFixed(2)} %`),
  buildDetailMetricCard("Enthalpy (h)", `${d.h.toFixed(2)} kJ/kg`),
  buildDetailMetricCard("Specific Heat Capacity (Cp)", `${d.cp.toFixed(3)} kJ/(kg·°C)`),
  buildDetailMetricCard("Specific Volume (v)", `${d.v.toFixed(3)} m³/kg`),
  buildDetailMetricCard("Density (rho)", `${d.rho.toFixed(2)} kg/m³`),
  buildDetailMetricCard("Vapor Partial Pressure (Pw)", `${d.Pw.toFixed(0)} Pa`),
  buildDetailMetricCard("Saturation Vapor Pressure (Pws)", `${d.Pws.toFixed(0)} Pa`),
  buildDetailMetricCard("Vapor Pressure Deficit (VPD)", `${d.VPD.toFixed(2)} Pa`),
  buildDetailMetricCard("Humidity Deficit (HD)", `${d.HD.toFixed(4)} kg/kg'`),
  buildDetailMetricCard("Absolute Humidity (AH)", `${d.AH.toFixed(2)} g/m³`),
  buildDetailMetricCard("Saturation Vapor Concentration (Dvs)", `${d.Dvs.toFixed(2)} g/m³`),
  buildDetailMetricCard("Volume Mixing Ratio (VMR)", `${d.VMR.toFixed(2)} ppm`),
  buildDetailMetricCard("Psychrometric Difference (PD)", `${d.PD.toFixed(2)} °C`),
  buildDetailMetricCard("Saturation Humidity Ratio (Wsat)", `${d.Wsat.toFixed(4)} kg/kg'`),
  ].join("");
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function drawPsychroLines(
  linesG,
  labelsG,
  x,
  y,
  width,
  height,
  minT,
  maxT,
  maxH,
  Patm,
  line,
  curve,
  chartType
) {
  const labels = { left: [], right: [], top: [], bottom: [] };

  const addLabel = (pos, text, cls, loc, tValue = null, ahValue = null) => {
    labels[loc].push({
      pos,
      text,
      class: cls,
      tValue,
      ahValue,
    });
  };

  // 1. VOLUME LINES (Specific Volume) - Only render if visibility.v is true
  if (State.visibility.v) {
    // Dynamic range: cover full visible area (v = Ra*(T+273.15)/Patm, Ra_dry=287.058, Ra_moist bigger)
    const _vLo = Math.max(0.50, Math.floor(287.058 * (minT + 273.15) / Patm / 0.01) * 0.01 - 0.02);
    const _vHi = Math.min(2.00, Math.ceil((287.058 + 461.5 * maxH) * (maxT + 273.15) / Patm / 0.01) * 0.01 + 0.02);
    for (let v = _vLo; v <= _vHi; v = Math.round((v + 0.01) * 1000) / 1000) {
      const ts = Psychro.solveIntersectionWithSaturation(
        "volume",
        v,
        Patm,
        minT,
        maxT
      );
      const te = (v * Patm) / 287.058 - 273.15;

      const d = [
        { t: ts, w: Psychro.getWFromPw(Psychro.getSatVapPres(ts), Patm) },
      ];
      for (let t = Math.ceil(ts); t < te && t <= maxT; t += 2) {
        d.push({ t: t, w: Psychro.getWFromVolLine(t, v, Patm) });
      }
      d.push({ t: te, w: 0 });

      // Gambar garis
      linesG.append("path").datum(d).attr("class", "v-line").attr("d", line);

      // Label setiap 0.05 m3/kg
      if (Math.round(v * 100) % 5 === 0) {
        const labelText = v.toFixed(2);

        if (chartType === "psychrometric") {
          // Psychrometric: label di bottom atau top
          if (te >= minT && te <= maxT) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(te, 0, Patm);
              addLabel(x(te), labelText, "lbl-v", "bottom", te, ah);
            } else {
              addLabel(x(te), labelText, "lbl-v", "bottom", te);
            }
          } else {
            const tAtMaxH = Psychro.getTdbFromVolLine(v, maxH, Patm);
            if (tAtMaxH >= minT && tAtMaxH <= maxT) {
              if (State.yAxisType === "absoluteHumidity") {
                const ah = calculateAbsoluteHumidity(tAtMaxH, maxH, Patm);
                addLabel(x(tAtMaxH), labelText, "lbl-v", "top", tAtMaxH, ah);
              } else {
                addLabel(x(tAtMaxH), labelText, "lbl-v", "top", tAtMaxH);
              }
            }
          }
        } else {
          // Mollier: label di LEFT atau BOTTOM
          const wAtMinT = Psychro.getWFromVolLine(minT, v, Patm);
          if (wAtMinT >= 0 && wAtMinT <= maxH) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(minT, wAtMinT, Patm);
              addLabel(y(minT), labelText, "lbl-v", "left", minT, ah);
            } else {
              addLabel(y(minT), labelText, "lbl-v", "left", minT);
            }
          } else {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(te, 0, Patm);
              addLabel(x(ah), labelText, "lbl-v", "bottom", te, ah);
            } else {
              addLabel(x(0), labelText, "lbl-v", "bottom", te);
            }
          }
        }
      }
    }
  }

  // 2. ENTHALPY LINES - Only render if visibility.h is true
  if (State.visibility.h) {
    // Dynamic range: h = 1.006*T + W*(2501 + 1.86*T)
    const _hLo = Math.max(-300, Math.floor(1.006 * minT / 5) * 5 - 10);
    const _hHi = Math.min(800, Math.ceil((1.006 * maxT + maxH * (2501 + 1.86 * maxT)) / 5) * 5 + 10);
    for (let h = _hLo; h <= _hHi; h += 5) {
      const ts = Psychro.solveIntersectionWithSaturation(
        "enthalpy",
        h,
        Patm,
        minT,
        maxT
      );
      const te = h / 1.006;
      const d = [
        { t: ts, w: Psychro.getWFromPw(Psychro.getSatVapPres(ts), Patm) },
      ];
      for (let t = Math.ceil(ts); t < te && t <= maxT; t += 2)
        d.push({ t: t, w: Psychro.getWFromEnthalpyLine(t, h) });
      d.push({ t: te, w: 0 });

      linesG.append("path").datum(d).attr("class", "h-line").attr("d", line);

      // Label setiap 10 kJ/kg
      if (h % 10 === 0) {
        const wAtMaxT = Psychro.getWFromEnthalpyLine(maxT, h);

        if (chartType === "psychrometric") {
          if (wAtMaxT >= 0 && wAtMaxT <= maxH) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(maxT, wAtMaxT, Patm);
              addLabel(y(ah), h, "lbl-h", "right", maxT, ah);
            } else {
              addLabel(y(wAtMaxT), h, "lbl-h", "right", maxT);
            }
          } else if (wAtMaxT < 0 && te >= minT && te <= maxT) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(te, 0, Patm);
              addLabel(x(te), h, "lbl-h", "bottom", te, ah);
            } else {
              addLabel(x(te), h, "lbl-h", "bottom", te);
            }
          } else {
            const tAtMaxH = (h - 2501 * maxH) / (1.006 + 1.86 * maxH);
            if (tAtMaxH >= minT && tAtMaxH <= maxT) {
              if (State.yAxisType === "absoluteHumidity") {
                const ah = calculateAbsoluteHumidity(tAtMaxH, maxH, Patm);
                addLabel(x(tAtMaxH), h, "lbl-h", "top", tAtMaxH, ah);
              } else {
                addLabel(x(tAtMaxH), h, "lbl-h", "top", tAtMaxH);
              }
            }
          }
        } else {
          // Mollier: enthalpy lines miring ke kanan bawah
          if (te >= minT && te <= maxT) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(te, 0, Patm);
              addLabel(y(te), h, "lbl-h", "left", te, ah);
            } else {
              addLabel(y(te), h, "lbl-h", "left", te);
            }
          } else {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(maxT, wAtMaxT, Patm);
              addLabel(x(ah), h, "lbl-h", "top", maxT, ah);
            } else {
              addLabel(x(wAtMaxT), h, "lbl-h", "top", maxT);
            }
          }
        }
      }
    }
  }

  // 3. WET BULB LINES - Only render if visibility.twb is true
  if (State.visibility.twb) {
    for (let wb = -10; wb <= maxT + 20; wb += 5) {
      const Pws = Psychro.getSatVapPres(wb);
      const Ws = Psychro.getWFromPw(Pws, Patm);
      const d = [{ t: wb, w: Ws }];
      for (let t = wb + 1; t <= maxT + 10; t++) {
        const w = Psychro.getWFromTwbLine(t, wb, Patm);
        if (w < -0.005) break;
        d.push({ t, w });
      }

      linesG.append("path").datum(d).attr("class", "wb-line").attr("d", line);

      const wAtMaxT = Psychro.getWFromTwbLine(maxT, wb, Patm);

      if (chartType === "psychrometric") {
        if (wAtMaxT >= 0 && wAtMaxT <= maxH) {
          if (State.yAxisType === "absoluteHumidity") {
            const ah = calculateAbsoluteHumidity(maxT, wAtMaxT, Patm);
            addLabel(y(ah), wb, "lbl-wb", "right", maxT, ah);
          } else {
            addLabel(y(wAtMaxT), wb, "lbl-wb", "right", maxT);
          }
        } else if (wAtMaxT < 0) {
          const tAtZeroW = Psychro.getTdbFromTwbZeroW(wb, Patm);
          if (tAtZeroW >= minT && tAtZeroW <= maxT) {
            addLabel(x(tAtZeroW), wb, "lbl-wb", "bottom", tAtZeroW);
          }
        }
      } else {
        // Mollier: wet bulb lines
        const tAtZeroW = Psychro.getTdbFromTwbZeroW(wb, Patm);
        if (tAtZeroW >= minT && tAtZeroW <= maxT) {
          addLabel(y(tAtZeroW), wb, "lbl-wb", "left", tAtZeroW);
        } else {
          const Pws = Psychro.getSatVapPres(wb);
          const Ws = Psychro.getWFromPw(Pws, Patm);
          if (State.yAxisType === "absoluteHumidity") {
            const ah = calculateAbsoluteHumidity(wb, Ws, Patm);
            addLabel(x(ah), wb, "lbl-wb", "top", wb, ah);
          } else {
            addLabel(x(Ws), wb, "lbl-wb", "top", wb);
          }
        }
      }
    }
  }

  // 4. RELATIVE HUMIDITY LINES - Only render if visibility.rh is true
  // Saturation line (rh=1.0) is only rendered if visibility.sat is also true
  if (State.visibility.rh || State.visibility.sat) {
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((rh) => {
      // Skip saturation line if visibility.sat is false
      if (rh === 1.0 && !State.visibility.sat) return;
      
      // Skip RH lines if visibility.rh is false (but still show saturation if enabled)
      if (rh < 1.0 && !State.visibility.rh) return;
      
      const d = [];
      for (let t = minT; t <= maxT + 5; t += 0.25) {
        d.push({ t, w: Psychro.getWFromPw(Psychro.getSatVapPres(t) * rh, Patm) });
      }

      linesG
        .append("path")
        .datum(d)
        .attr("class", rh === 1.0 ? "saturation-line" : "rh-line")
        .attr("d", curve);

      if (rh < 1) {
        if (chartType === "psychrometric") {
          // Psychrometric: label di kanan atau atas
          const W_at_maxT = Psychro.getWFromPw(
            Psychro.getSatVapPres(maxT) * rh,
            Patm
          );
          if (W_at_maxT <= maxH && W_at_maxT >= 0) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(maxT, W_at_maxT, Patm);
              addLabel(
                y(ah),
                (rh * 100).toFixed(0) + "%",
                "lbl-rh",
                "right",
                maxT,
                ah
              );
            } else {
              addLabel(
                y(W_at_maxT),
                (rh * 100).toFixed(0) + "%",
                "lbl-rh",
                "right",
                maxT
              );
            }
          } else {
            const Pw_target = Psychro.getPwFromW(maxH, Patm);
            const T_at_maxH = Psychro.getTempFromSatPres(Pw_target / rh);
            if (T_at_maxH >= minT && T_at_maxH <= maxT) {
              addLabel(
                x(T_at_maxH),
                (rh * 100).toFixed(0) + "%",
                "lbl-rh",
                "top",
                T_at_maxH
              );
            }
          }
        } else {
          // Mollier: cari titik ujung garis
          let exitPoint = null;
          let exitType = null;

          // Periksa ujung kanan (W = maxH)
          const Pw_target = Psychro.getPwFromW(maxH, Patm);
          const T_at_maxH = Psychro.getTempFromSatPres(Pw_target / rh);
          if (T_at_maxH >= minT && T_at_maxH <= maxT) {
            exitPoint = { t: T_at_maxH, w: maxH };
            exitType = "right";
          }

          if (!exitPoint) {
            const W_at_maxT = Psychro.getWFromPw(
              Psychro.getSatVapPres(maxT) * rh,
              Patm
            );
            if (W_at_maxT >= 0 && W_at_maxT <= maxH) {
              exitPoint = { t: maxT, w: W_at_maxT };
              exitType = "top";
            }
          }

          if (!exitPoint) {
            let minW = Infinity;
            let minWPoint = null;
            for (let i = 0; i < d.length; i++) {
              const point = d[i];
              if (point.w > 0 && point.w < minW && point.w <= maxH) {
                minW = point.w;
                minWPoint = point;
              }
            }
            if (minWPoint && minWPoint.w <= 0.001) {
              exitPoint = minWPoint;
              exitType = "left";
            }
          }

          if (!exitPoint) {
            for (let i = d.length - 1; i >= 0; i--) {
              const point = d[i];
              if (point.w >= 0 && point.w <= maxH) {
                exitPoint = point;
                exitType = "top";
                break;
              }
            }
          }

          if (exitPoint && exitType) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(
                exitPoint.t,
                exitPoint.w,
                Patm
              );
              if (exitType === "top") {
                addLabel(
                  x(getYValue(exitPoint.t, exitPoint.w, Patm)),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "top",
                  exitPoint.t,
                  ah
                );
              } else if (exitType === "right") {
                addLabel(
                  y(exitPoint.t),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "right",
                  exitPoint.t,
                  ah
                );
              } else if (exitType === "left") {
                addLabel(
                  y(exitPoint.t),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "left",
                  exitPoint.t,
                  ah
                );
              }
            } else {
              if (exitType === "top") {
                addLabel(
                  x(exitPoint.w),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "top",
                  exitPoint.t
                );
              } else if (exitType === "right") {
                addLabel(
                  y(exitPoint.t),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "right",
                  exitPoint.t
                );
              } else if (exitType === "left") {
                addLabel(
                  y(exitPoint.t),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "left",
                  exitPoint.t
                );
              }
            }
          }
        }
      }
    });
  }

  // 5. DEW POINT LINES - Only render if visibility.tdp is true
  if (State.visibility.tdp) {
    // Draw iso-dew-point lines as labeled horizontal (psychrometric) lines at nice Tdp values
    const tdpStep = (maxT - minT) > 30 ? 10 : 5;
    const tdpStart = Math.ceil(minT / tdpStep) * tdpStep;
    for (let tdp = tdpStart; tdp < maxT; tdp += tdpStep) {
      const W_tdp = Psychro.getWFromPw(Psychro.getSatVapPres(tdp), Patm);
      if (!Number.isFinite(W_tdp) || W_tdp <= 0 || W_tdp > maxH) continue;

      const tdpLabel = `${tdp}`;
      const isAbsHum = State.yAxisType === "absoluteHumidity";
      const ahTdp = isAbsHum ? calculateAbsoluteHumidity((minT + maxT) / 2, W_tdp, Patm) : 0;

      if (chartType === "psychrometric") {
        // Horizontal line from the saturation curve (at T=tdp) rightward — never crosses saturation
        const yPos = isAbsHum ? y(ahTdp) : y(W_tdp);
        const xStart = Math.max(0, x(tdp));
        linesG
          .append("line")
          .attr("class", "tdp-line")
          .attr("y1", yPos)
          .attr("y2", yPos)
          .attr("x1", xStart)
          .attr("x2", width);

        if (isAbsHum) {
          addLabel(yPos, tdpLabel, "lbl-tdp", "right", maxT, ahTdp);
        } else {
          addLabel(yPos, tdpLabel, "lbl-tdp", "right", maxT);
        }
      } else {
        // Mollier: vertical line from top down to the saturation temperature (T=tdp)
        const xPos = isAbsHum ? x(ahTdp) : x(W_tdp);
        const yEnd = Math.min(height, y(tdp));
        linesG
          .append("line")
          .attr("class", "tdp-line")
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", yEnd);

        if (isAbsHum) {
          addLabel(xPos, tdpLabel, "lbl-tdp", "top", minT, ahTdp);
        } else {
          addLabel(xPos, tdpLabel, "lbl-tdp", "top", minT);
        }
      }
    }
  }

  if (chartType === "psychrometric") {
    renderSmartLabels(
      labelsG,
      labels.right,
      "right",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
    renderSmartLabels(
      labelsG,
      labels.bottom,
      "bottom",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
    renderSmartLabels(
      labelsG,
      labels.top,
      "top",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
  } else {
    // Mollier: gunakan left dan top saja
    renderSmartLabels(
      labelsG,
      labels.left,
      "left",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
    renderSmartLabels(
      labelsG,
      labels.top,
      "top",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
    renderSmartLabels(
      labelsG,
      labels.right,
      "right",
      width,
      height,
      chartType,
      x,
      y,
      Patm
    );
  }
}

function renderSmartLabels(
  container,
  labelData,
  position,
  width,
  height,
  chartType,
  x,
  y,
  Patm
) {
  if (labelData.length === 0) return;

  const labelInterval = (() => {
    const raw = parseInt(getInputValue("set-line-label-step"), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  })();

  const counters = new Map();
  const filteredLabelData = labelData.filter((entry) => {
    const key = entry.class || "default";
    const count = counters.get(key) || 0;
    counters.set(key, count + 1);
    return count % labelInterval === 0;
  });

  if (filteredLabelData.length === 0) return;

  filteredLabelData.sort((a, b) => a.pos - b.pos);
  const minGap = 15 + (labelInterval - 1) * 6;

  for (let i = 1; i < filteredLabelData.length; i++) {
    if (filteredLabelData[i].pos < filteredLabelData[i - 1].pos + minGap) {
      filteredLabelData[i].pos = filteredLabelData[i - 1].pos + minGap;
    }
  }

  filteredLabelData.forEach((d) => {
    let xPos, yPos, anchor, alignment;
    let rotate = false;

    const
      left = -10,
      bottom = 20;

    // Untuk mode Absolute Humidity
    if (State.yAxisType === "absoluteHumidity" && d.ahValue !== undefined) {
      if (chartType === "psychrometric") {
        // Psychrometric chart
        if (position === "right") {
          xPos = width + 8;
          yPos = d.pos; // d.pos sudah dalam piksel (y(ah))
          anchor = "start";
          alignment = "middle";
        } else if (position === "top") {
          xPos = d.pos; // d.pos adalah x(tAtMaxH)
          yPos = -10;
          anchor = "middle";
          alignment = "baseline";
        } else if (position === "left") {
          xPos = left;
          yPos = d.pos; // d.pos adalah y(ah)
          anchor = "end";
          alignment = "middle";
        } else if (position === "bottom") {
          xPos = d.pos; // d.pos adalah x(te)
          yPos = height + bottom;
          anchor = "middle";
          alignment = "hanging";
        }
      } else {
        // Mollier chart
        if (position === "right") {
          xPos = width + 8;
          yPos = d.pos; // d.pos adalah y(tValue)
          anchor = "start";
          alignment = "middle";
        } else if (position === "top") {
          xPos = d.pos;
          yPos = -10;
          anchor = "middle";
          alignment = "baseline";
        } else if (position === "left") {
          xPos = left;
          yPos = d.pos; // d.pos adalah y(tValue)
          anchor = "end";
          alignment = "middle";
          rotate = true;
        } else if (position === "bottom") {
          xPos = d.pos;
          yPos = height + bottom;
          anchor = "middle";
          alignment = "hanging";
        }
      }
    } else {
      if (position === "right") {
        xPos = width + 8;
        yPos = d.pos;
        anchor = "start";
        alignment = "middle";
      } else if (position === "bottom") {
        xPos = d.pos;
        yPos = height + bottom;
        anchor = "middle";
        alignment = "hanging";
      } else if (position === "top") {
        xPos = d.pos;
        yPos = -10;
        anchor = "middle";
        alignment = "baseline";
      } else if (position === "left") {
        xPos = left;
        yPos = d.pos;
        anchor = "end";
        alignment = "middle";
        if (chartType === "mollier") {
          rotate = true;
        }
      }
    }

    const isVisible =
      xPos >= -20 && xPos <= width + 20 && yPos >= -20 && yPos <= height + 20;

    if (!isVisible) return;

    const textElem = container
      .append("text")
      .attr("class", "smart-label " + d.class)
      .attr("x", xPos)
      .attr("y", yPos)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", alignment)
      .text(d.text);

    if (rotate) {
      textElem
        // .attr("transform", `rotate(-90, ${xPos}, ${yPos})`)
        .attr("x", xPos - 15)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle");
    }
  });
}
