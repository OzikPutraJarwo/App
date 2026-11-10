// ==========================================
// interaction.js — Chart zoom/pan, PNG/SVG export, input-change dispatch
// ==========================================

let _chartRedrawTimer = null;
function scheduleChartRedraw() {
  if (_chartRedrawTimer) clearTimeout(_chartRedrawTimer);
  _chartRedrawTimer = setTimeout(() => {
    _chartRedrawTimer = null;
    drawChart();
  }, 100);
}

window.addEventListener("resize", () => {
  scheduleChartRedraw();
  scheduleAnimatedTabRefresh();
});

// ===== CHART ZOOM + PAN: Ctrl+Scroll (zoom), Scroll (vertical pan), Shift+Scroll (horizontal pan) =====

const _zoomTouch = { active: false, dist0: 1, minT0: 0, maxT0: 50, maxH0: 0.030, minH0: 0 };
const _panTouch  = { active: false, lastX: 0, lastY: 0 };

// ── helpers ──────────────────────────────────────────────────────────────────

function _touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _chartInnerSize() {
  return {
    cw: chartWrapper.clientWidth  - margin.left - margin.right,
    ch: chartWrapper.clientHeight - margin.top  - margin.bottom
  };
}

// ── ZOOM ─────────────────────────────────────────────────────────────────────

function _applyChartZoom(factor, pixX, pixY) {
  if (factor <= 0 || !isFinite(factor)) return;
  const { cw, ch } = _chartInnerSize();
  if (cw <= 0 || ch <= 0) return;

  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);

  const fx = Math.max(0, Math.min(cw, pixX - margin.left)) / cw;
  const fy = Math.max(0, Math.min(ch, pixY - margin.top))  / ch;

  let t_foc, w_foc, ah_foc;
  if (State.chartType === "psychrometric") {
    t_foc = minT + fx * (maxT - minT);
    if (State.yAxisType === "absoluteHumidity") {
      ah_foc = State.viewMinAH + (1 - fy) * (maxAH - State.viewMinAH);
    } else {
      w_foc = State.viewMinH + (1 - fy) * (maxH - State.viewMinH);
    }
  } else {
    if (State.yAxisType === "absoluteHumidity") {
      ah_foc = State.viewMinAH + fx * (maxAH - State.viewMinAH);
    } else {
      w_foc = State.viewMinH + fx * (maxH - State.viewMinH);
    }
    t_foc = minT + (1 - fy) * (maxT - minT);
  }

  let newMinT  = t_foc - (t_foc - minT)          * factor;
  let newMaxT  = t_foc + (maxT - t_foc)           * factor;
  let newMinH = State.viewMinH;
  let newMaxH = maxH;
  let newMinAH = State.viewMinAH;
  let newMaxAH = maxAH;

  if (State.yAxisType === "absoluteHumidity") {
    newMinAH = ah_foc - (ah_foc - State.viewMinAH) * factor;
    newMaxAH = ah_foc + (maxAH - ah_foc) * factor;
  } else {
    newMinH = w_foc - (w_foc - State.viewMinH) * factor;
    newMaxH = w_foc + (maxH - w_foc) * factor;
  }

  const MIN_T = 2;
  const MIN_AH = 1;
  const MAX_AH = 400;
  if (newMaxT - newMinT < MIN_T) { const m = (newMinT + newMaxT) / 2; newMinT = m - MIN_T / 2; newMaxT = m + MIN_T / 2; }
  newMinT = Math.max(min_tdb, Math.min(max_tdb - MIN_T, newMinT));
  newMaxT = Math.min(max_tdb, Math.max(newMinT + MIN_T, newMaxT));

  if (State.yAxisType === "absoluteHumidity") {
    if (newMaxAH - newMinAH < MIN_AH) {
      const m = (newMinAH + newMaxAH) / 2;
      newMinAH = m - MIN_AH / 2;
      newMaxAH = m + MIN_AH / 2;
    }
    newMinAH = Math.max(0, newMinAH);
    newMaxAH = Math.max(newMinAH + MIN_AH, Math.min(MAX_AH, newMaxAH));
    State.viewMinAH = newMinAH;
    document.getElementById("maxAbsHum").value = newMaxAH.toFixed(1);
  } else {
    newMinH = Math.max(0, newMinH);
    newMaxH = Math.max(newMinH + 0.001, Math.min(0.2, newMaxH));
    State.viewMinH = newMinH;
    document.getElementById("maxHum").value  = newMaxH.toFixed(4);
  }

  document.getElementById("minTemp").value = newMinT.toFixed(1);
  document.getElementById("maxTemp").value = newMaxT.toFixed(1);
  if (State.yAxisType === "absoluteHumidity") _syncRatioFromAbsHum();
  else _syncAbsHum();
  registerMinimapZoomActivity();
  drawChart();
}

// ── PAN ──────────────────────────────────────────────────────────────────────
// vertFrac  > 0 → pan toward higher Y-axis values (more humid / hotter)
// horizFrac > 0 → pan toward higher X-axis values (hotter / more humid)

function _applyChartPan(vertFrac, horizFrac) {
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);
  const tRange = maxT - minT;
  const wRange = maxH - State.viewMinH;
  const ahRange = maxAH - State.viewMinAH;
  let changed = false;

  function panW(frac) {
    const d = frac * wRange;
    let lo = State.viewMinH + d, hi = maxH + d;
    if (lo < 0)   { hi -= lo; lo = 0; }
    if (hi > 0.2) { lo -= (hi - 0.2); hi = 0.2; lo = Math.max(0, lo); }
    State.viewMinH = lo;
    document.getElementById("maxHum").value = hi.toFixed(4);
    changed = true;
  }

  function panAH(frac) {
    const d = frac * ahRange;
    let lo = State.viewMinAH + d, hi = maxAH + d;
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > 400) { lo -= hi - 400; hi = 400; lo = Math.max(0, lo); }
    State.viewMinAH = lo;
    document.getElementById("maxAbsHum").value = hi.toFixed(1);
    _syncRatioFromAbsHum();
    changed = true;
  }

  function panT(frac) {
    const d = frac * tRange;
    let lo = minT + d, hi = maxT + d;
    if (lo < min_tdb) { hi += min_tdb - lo; lo = min_tdb; }
    if (hi > max_tdb) { lo -= hi - max_tdb; hi = max_tdb; lo = Math.max(min_tdb, lo); }
    document.getElementById("minTemp").value = lo.toFixed(1);
    document.getElementById("maxTemp").value = hi.toFixed(1);
    changed = true;
  }

  if (State.chartType === "psychrometric") {
    if (vertFrac  !== 0) {
      if (State.yAxisType === "absoluteHumidity") panAH(vertFrac);
      else panW(vertFrac);
    }
    if (horizFrac !== 0) panT(horizFrac);  // X = Tdb
  } else {
    if (vertFrac  !== 0) panT(vertFrac);   // Y = Tdb (Mollier)
    if (horizFrac !== 0) {
      if (State.yAxisType === "absoluteHumidity") panAH(horizFrac);
      else panW(horizFrac);
    }
  }

  if (changed) {
    _syncAbsHum();
    registerMinimapZoomActivity();
    drawChart();
  }
}

function _syncAbsHum() {
  try { _syncAbsHumFromRatio(); } catch (_) {}
}

// ── MOUSE WHEEL ──────────────────────────────────────────────────────────────

chartWrapper.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = chartWrapper.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;

  if (e.ctrlKey) {
    // ZOOM centred on cursor
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    _applyChartZoom(factor, px, py);
  } else {
    // PAN: normalise delta to ±8% of current range per wheel step
    // scroll up (deltaY < 0) → see higher values (step < 0 means pan toward higher data)
    const step = Math.sign(e.deltaY) * 0.08;
    if (e.shiftKey) {
      // HORIZONTAL PAN (scroll right → see higher X)
      _applyChartPan(0, step);
    } else {
      // VERTICAL PAN (scroll up → see higher Y, so negate step)
      _applyChartPan(-step, 0);
    }
  }
}, { passive: false });

// ── TOUCH: PINCH-ZOOM + 1-FINGER PAN ─────────────────────────────────────────

chartWrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    _panTouch.active = false;
    _zoomTouch.active = true;
    _zoomTouch.dist0 = _touchDist(e.touches[0], e.touches[1]);
    _zoomTouch.minT0 = parseFloat(document.getElementById("minTemp").value);
    _zoomTouch.maxT0 = parseFloat(document.getElementById("maxTemp").value);
    _zoomTouch.maxH0 = parseFloat(document.getElementById("maxHum").value);
    _zoomTouch.minH0 = State.viewMinH;
  } else if (e.touches.length === 1) {
    _zoomTouch.active = false;
    _panTouch.active = true;
    _panTouch.lastX = e.touches[0].clientX;
    _panTouch.lastY = e.touches[0].clientY;
  }
}, { passive: true });

chartWrapper.addEventListener("touchmove", (e) => {
  if (_zoomTouch.active && e.touches.length === 2) {
    e.preventDefault();
    const newDist = _touchDist(e.touches[0], e.touches[1]);
    if (_zoomTouch.dist0 < 1) return;

    // Restore initial domain so every frame zooms from the gesture start
    document.getElementById("minTemp").value = _zoomTouch.minT0;
    document.getElementById("maxTemp").value = _zoomTouch.maxT0;
    document.getElementById("maxHum").value  = _zoomTouch.maxH0;
    State.viewMinH = _zoomTouch.minH0;

    const rect = chartWrapper.getBoundingClientRect();
    const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
    const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
    _applyChartZoom(_zoomTouch.dist0 / newDist, midX, midY);

  } else if (_panTouch.active && e.touches.length === 1) {
    e.preventDefault();
    const { cw, ch } = _chartInnerSize();
    if (cw <= 0 || ch <= 0) return;

    const dx = e.touches[0].clientX - _panTouch.lastX;
    const dy = e.touches[0].clientY - _panTouch.lastY;
    _panTouch.lastX = e.touches[0].clientX;
    _panTouch.lastY = e.touches[0].clientY;

    // finger right (+dx) → content moves right → see lower X → negative horiz frac
    // finger down  (+dy) → content moves down  → see lower Y → negative vert  frac
    const horiz = -(dx / cw) * 0.5;
    const vert  = -(dy / ch) * 0.5;

    _applyChartPan(vert, horiz);
  }
}, { passive: false });

chartWrapper.addEventListener("touchend",   () => { _zoomTouch.active = false; _panTouch.active = false; }, { passive: true });
chartWrapper.addEventListener("touchcancel",() => { _zoomTouch.active = false; _panTouch.active = false; }, { passive: true });

function downloadSvgAsPng(svgSelector, fileName = 'image.png', scale = 3) {
  const originalSvg = document.querySelector(svgSelector);
  const clonedSvg = originalSvg.cloneNode(true);
  const { width, height } = originalSvg.getBoundingClientRect();
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  if (!originalSvg.getAttribute('viewBox')) {
    clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  clonedSvg.setAttribute('width', scaledWidth);
  clonedSvg.setAttribute('height', scaledHeight);

  const styleElement = document.createElement('style');
  let cssRules = '';
  [...document.styleSheets].forEach(sheet => {
    try {
      [...sheet.cssRules].forEach(rule => { cssRules += rule.cssText; });
    } catch (e) {}
  });
  styleElement.textContent = cssRules;
  clonedSvg.prepend(styleElement);

  const svgData = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = fileName;
    downloadLink.click();

    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function downloadSvgAsSvg(svgSelector, fileName = 'chart.svg') {
  const originalSvg = document.querySelector(svgSelector);
  const clonedSvg = originalSvg.cloneNode(true);

  // Add styles to SVG
  const styleElement = document.createElement('style');
  let cssRules = '';
  [...document.styleSheets].forEach(sheet => {
    try {
      [...sheet.cssRules].forEach(rule => { cssRules += rule.cssText; });
    } catch (e) {}
  });
  styleElement.textContent = cssRules;
  clonedSvg.prepend(styleElement);

  const svgData = new XMLSerializer().serializeToString(clonedSvg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

const inputHandlers = {
  "set-language": (event) => {
    setLanguage(event.target.value);
  },
  "set-show-legend": () => {
    drawChart();
  },
  "set-minimap-mode": (event) => {
    setMinimapMode(event.target.value);
  },
  "set-show-rh": (event) => {
    State.visibility.rh = event.target.checked;
    drawChart();
  },
  "set-show-h": (event) => {
    State.visibility.h = event.target.checked;
    drawChart();
  },
  "set-show-twb": (event) => {
    State.visibility.twb = event.target.checked;
    drawChart();
  },
  "set-show-v": (event) => {
    State.visibility.v = event.target.checked;
    drawChart();
  },
  "set-show-sat": (event) => {
    State.visibility.sat = event.target.checked;
    drawChart();
  },
  "set-show-tdp": (event) => {
    State.visibility.tdp = event.target.checked;
    drawChart();
  },
  "set-show-info-panel": (event) => {
    if (!event.target.checked) {
      const panel = document.getElementById("info-panel");
      if (panel) panel.style.display = "none";
    }
  },
  "set-info-precision": (event) => {
    setInfoPrecisionDecimals(event.target.value);
  },
  "set-line-label-step": () => {
    drawChart();
  },
};

function handleInputChange(event) {
  const inputId = event.target.id;
  if (inputHandlers[inputId]) {
    inputHandlers[inputId](event);
  }
  queuePersistedStateSave();
}

const inputs = document.querySelectorAll("input, select");
inputs.forEach((input) => {
  input.addEventListener("input", handleInputChange);
  input.addEventListener("change", handleInputChange);
});
