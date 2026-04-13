(function registerPathAnalysisModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before path analysis modules.");
  }

  const utils = app._anovaUtils;
  if (!utils) throw new Error("ANOVA utilities (_anovaUtils from crd.js) must be loaded before path analysis module.");

  const { formatNumber } = utils;

  // ═══════════════════════════════════════════════════════
  // Linear Algebra helpers
  // ═══════════════════════════════════════════════════════

  /**
   * Invert an n×n matrix using Gauss-Jordan elimination.
   * Returns null if singular.
   */
  function invertMatrix(matrix) {
    const n = matrix.length;
    // Augment with identity
    const aug = matrix.map((row, i) => {
      const extended = [...row];
      for (let j = 0; j < n; j++) extended.push(i === j ? 1 : 0);
      return extended;
    });

    for (let col = 0; col < n; col++) {
      // Partial pivot
      let maxRow = col;
      let maxVal = Math.abs(aug[col][col]);
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > maxVal) {
          maxVal = Math.abs(aug[row][col]);
          maxRow = row;
        }
      }
      if (maxVal < 1e-14) return null; // singular

      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

      const pivot = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }

    return aug.map((row) => row.slice(n));
  }

  /**
   * Multiply matrix A (m×n) by vector v (n×1).
   * Returns array of length m.
   */
  function matVecMul(A, v) {
    return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
  }

  // ═══════════════════════════════════════════════════════
  // Statistics helpers
  // ═══════════════════════════════════════════════════════

  function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function stdDev(arr, m) {
    if (arr.length < 2) return 0;
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (arr.length - 1));
  }

  /**
   * Compute Pearson correlation between two arrays.
   */
  function pearsonR(x, y) {
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom > 0 ? num / denom : 0;
  }

  // ═══════════════════════════════════════════════════════
  // Path Analysis Computation
  //
  // Standard method (Singh & Chaudhary, 1979):
  //   [rXX] × [P] = [rXY]
  //   Path coefficients P = inv(rXX) × rXY
  //
  // Where:
  //   rXX = correlation matrix among independent variables
  //   rXY = correlations of each Xᵢ with Y
  //   P   = direct path coefficients
  //
  // Direct effect of Xᵢ on Y = Pᵢ
  // Indirect effect of Xᵢ via Xⱼ = Pⱼ × r(Xᵢ, Xⱼ)
  // Total contribution = Pᵢ × r(Xᵢ, Y)
  // Residual = √(1 − R²) where R² = Σ Pᵢ × r(Xᵢ, Y)
  // ═══════════════════════════════════════════════════════

  function computePathAnalysis(data, xNames, yName) {
    const p = xNames.length; // number of independent variables
    const n = data.length;   // observations

    // Extract arrays
    const xArrays = xNames.map((name) => data.map((d) => d[name]));
    const yArray = data.map((d) => d[yName]);

    // Means and std devs
    const xMeans = xArrays.map((arr) => mean(arr));
    const yMean = mean(yArray);
    const xSDs = xArrays.map((arr, i) => stdDev(arr, xMeans[i]));
    const ySD = stdDev(yArray, yMean);

    // Full correlation matrix (X variables + Y)
    const allArrays = [...xArrays, yArray];
    const allNames = [...xNames, yName];
    const corrMatrix = [];
    for (let i = 0; i < allArrays.length; i++) {
      const row = [];
      for (let j = 0; j < allArrays.length; j++) {
        row.push(i === j ? 1.0 : pearsonR(allArrays[i], allArrays[j]));
      }
      corrMatrix.push(row);
    }

    // rXX: p×p correlation matrix among X variables
    const rXX = [];
    for (let i = 0; i < p; i++) {
      const row = [];
      for (let j = 0; j < p; j++) {
        row.push(corrMatrix[i][j]);
      }
      rXX.push(row);
    }

    // rXY: correlations of each X with Y
    const rXY = [];
    for (let i = 0; i < p; i++) {
      rXY.push(corrMatrix[i][p]); // Y is at index p
    }

    // Invert rXX
    const rXXinv = invertMatrix(rXX);
    if (!rXXinv) {
      return { error: "Correlation matrix among independent variables is singular. Check for multicollinearity." };
    }

    // Path coefficients: P = inv(rXX) × rXY
    const pathCoeffs = matVecMul(rXXinv, rXY);

    // R² = Σ Pᵢ × rXY[i]
    let rSquared = 0;
    for (let i = 0; i < p; i++) {
      rSquared += pathCoeffs[i] * rXY[i];
    }

    // Clamp R² to [0, 1] for numerical safety
    rSquared = Math.max(0, Math.min(1, rSquared));
    const residual = Math.sqrt(1 - rSquared);

    // Direct and indirect effects table
    // For each Xi:
    //   Direct effect = Pi
    //   Indirect via Xj = Pj × r(Xi, Xj)  (for j ≠ i)
    //   Total correlation with Y = rXY[i]
    const effectsTable = [];
    for (let i = 0; i < p; i++) {
      const indirects = [];
      let totalIndirect = 0;
      for (let j = 0; j < p; j++) {
        if (j === i) continue;
        const indirectEffect = pathCoeffs[j] * corrMatrix[i][j];
        totalIndirect += indirectEffect;
        indirects.push({
          viaVariable: xNames[j],
          viaIndex: j,
          rXiXj: corrMatrix[i][j],
          pathJ: pathCoeffs[j],
          indirect: indirectEffect,
        });
      }

      effectsTable.push({
        variable: xNames[i],
        index: i,
        directEffect: pathCoeffs[i],
        indirects,
        totalIndirect,
        totalCorrelation: rXY[i],
        contribution: pathCoeffs[i] * rXY[i], // Pᵢ × r(Xᵢ, Y)
      });
    }

    return {
      n,
      p,
      xNames,
      yName,
      corrMatrix,
      allNames,
      rXX,
      rXY,
      rXXinv,
      pathCoeffs,
      rSquared,
      residual,
      effectsTable,
      xMeans,
      yMean,
      xSDs,
      ySD,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Run Path Analysis
  // ═══════════════════════════════════════════════════════

  function runPathAnalysis(context) {
    const { state, assignedColumns, rows, applyFilters, applySort, factorCount } = context;
    const numVars = Number(factorCount) || 2;

    // Collect X columns
    const xCols = [];
    for (let i = 0; i < numVars; i++) {
      const col = assignedColumns[`x-${i}`];
      if (!col) {
        if (typeof showToast === "function") showToast(`Please assign Independent Variable X${i + 1}.`, "error");
        return;
      }
      xCols.push(col);
    }

    // Y column
    const yCol = assignedColumns["y"];
    if (!yCol) {
      if (typeof showToast === "function") showToast("Please assign the Dependent Variable (Y).", "error");
      return;
    }

    // Filter rows
    const filteredRows = applySort(applyFilters(rows));

    // Build data
    const data = [];
    let skippedCount = 0;

    filteredRows.forEach((row) => {
      const yVal = Number(row[yCol.key]);
      if (row[yCol.key] === "" || row[yCol.key] == null || Number.isNaN(yVal)) {
        skippedCount++;
        return;
      }

      const entry = { [yCol.label]: yVal };
      let valid = true;

      for (const xc of xCols) {
        const xVal = Number(row[xc.key]);
        if (row[xc.key] === "" || row[xc.key] == null || Number.isNaN(xVal)) {
          valid = false;
          break;
        }
        entry[xc.label] = xVal;
      }

      if (!valid) {
        skippedCount++;
        return;
      }

      data.push(entry);
    });

    if (data.length < numVars + 1) {
      if (typeof showToast === "function") {
        showToast(`Not enough valid data for path analysis. Need at least ${numVars + 1} observations, found ${data.length}.`, "error");
      }
      return;
    }

    const xNames = xCols.map((c) => c.label);
    const yName = yCol.label;

    const result = computePathAnalysis(data, xNames, yName);

    if (result.error) {
      const content = `
        <div class="analysis-result-block">
          <div class="analysis-result-title">Path Analysis</div>
          <div class="analysis-result-warning">
            <span class="analysis-warning-icon">⚠</span> ${escapeHtml(result.error)}
          </div>
        </div>
      `;
      if (typeof app.pushResultTab === "function") {
        app.pushResultTab({ label: "Path Analysis", title: "Path Analysis", content });
      }
      return;
    }

    renderPathResults(result, skippedCount);
  }

  // ═══════════════════════════════════════════════════════
  // Canvas Path Diagram Renderer
  // ═══════════════════════════════════════════════════════

  const DIAGRAM_COLORS = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1",
  ];

  const DEFAULT_DIAGRAM_OPTIONS = {
    titleMode: "default", // default | custom | hidden
    customTitle: "",
    subtitleMode: "default", // default | custom | hidden
    customSubtitle: "",
    showFooter: true,
    showRoleTags: true,
    nameMode: "full", // full | initials
    width: 960,
    ratio: "16:9", // 16:9 | 4:3 | 1:1 | auto
    padTop: 80,
    padRight: 80,
    padBottom: 80,
    padLeft: 80,
    fontFamily: "Segoe UI",
    titleSize: 18,
    subtitleSize: 13,
    nodeSize: 14,
    tagSize: 11,
    coeffSize: 12,
    footerSize: 13,
    backgroundMode: "color", // color | transparent
    bgColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    titleColor: "#1E293B",
    subtitleColor: "#64748B",
    textColor: "#475569",
    yColor: "#1E3A5F",
    residualColor: "#94A3B8",
    corrLineColor: "#64748B",
    xColors: [...DIAGRAM_COLORS],
  };

  let pathDiagramPersistTimer = null;

  function getStoredPathDiagramDefaults() {
    const analysisPrefs = typeof getStoredAnalysisUserSettings === "function"
      ? getStoredAnalysisUserSettings()
      : null;

    if (analysisPrefs && typeof analysisPrefs === "object" && analysisPrefs.pathDiagramDefaults) {
      return sanitizeDiagramOptions(analysisPrefs.pathDiagramDefaults);
    }

    return sanitizeDiagramOptions(DEFAULT_DIAGRAM_OPTIONS);
  }

  function persistPathDiagramDefaults(options) {
    const safeOptions = sanitizeDiagramOptions(options);
    if (typeof updateStoredAnalysisUserSettings !== "function") return;

    if (pathDiagramPersistTimer) {
      clearTimeout(pathDiagramPersistTimer);
    }

    pathDiagramPersistTimer = setTimeout(() => {
      updateStoredAnalysisUserSettings({ pathDiagramDefaults: safeOptions }, { closeMenu: false });
      pathDiagramPersistTimer = null;
    }, 180);
  }

  function sanitizeDiagramOptions(options = {}) {
    const merged = {
      ...DEFAULT_DIAGRAM_OPTIONS,
      ...options,
      xColors: Array.isArray(options.xColors)
        ? DEFAULT_DIAGRAM_OPTIONS.xColors.map((fallback, index) => {
          const value = options.xColors[index];
          return typeof value === "string" && value.trim() ? value : fallback;
        })
        : [...DEFAULT_DIAGRAM_OPTIONS.xColors],
    };

    const num = (value, min, max, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    };

    merged.width = num(merged.width, 500, 2400, DEFAULT_DIAGRAM_OPTIONS.width);
    merged.padTop = num(merged.padTop, -500, 500, DEFAULT_DIAGRAM_OPTIONS.padTop);
    merged.padRight = num(merged.padRight, -500, 500, DEFAULT_DIAGRAM_OPTIONS.padRight);
    merged.padBottom = num(merged.padBottom, -500, 500, DEFAULT_DIAGRAM_OPTIONS.padBottom);
    merged.padLeft = num(merged.padLeft, -500, 500, DEFAULT_DIAGRAM_OPTIONS.padLeft);
    merged.titleSize = num(merged.titleSize, 10, 64, DEFAULT_DIAGRAM_OPTIONS.titleSize);
    merged.subtitleSize = num(merged.subtitleSize, 10, 48, DEFAULT_DIAGRAM_OPTIONS.subtitleSize);
    merged.nodeSize = num(merged.nodeSize, 10, 48, DEFAULT_DIAGRAM_OPTIONS.nodeSize);
    merged.tagSize = num(merged.tagSize, 8, 32, DEFAULT_DIAGRAM_OPTIONS.tagSize);
    merged.coeffSize = num(merged.coeffSize, 8, 40, DEFAULT_DIAGRAM_OPTIONS.coeffSize);
    merged.footerSize = num(merged.footerSize, 8, 40, DEFAULT_DIAGRAM_OPTIONS.footerSize);

    if (!["default", "custom", "hidden"].includes(merged.titleMode)) merged.titleMode = "default";
    if (!["default", "custom", "hidden"].includes(merged.subtitleMode)) merged.subtitleMode = "default";
    if (!["full", "initials"].includes(merged.nameMode)) merged.nameMode = "full";
    if (!["16:9", "4:3", "1:1", "auto"].includes(merged.ratio)) merged.ratio = "16:9";
    if (!["color", "transparent"].includes(merged.backgroundMode)) merged.backgroundMode = "color";

    return merged;
  }

  function getRatioValue(ratio) {
    if (ratio === "4:3") return 4 / 3;
    if (ratio === "1:1") return 1;
    if (ratio === "16:9") return 16 / 9;
    return null;
  }

  function makeInitialName(name) {
    const parts = String(name || "")
      .split(/[\s_\-/]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return "?";
    if (parts.length === 1) {
      const one = parts[0].replace(/[^a-zA-Z0-9]/g, "");
      return (one.slice(0, 3) || "?").toUpperCase();
    }

    return parts.map((part) => part[0]).join("").toUpperCase();
  }

  function pickNodeLabel(name, mode) {
    if (mode === "initials") return makeInitialName(name);
    return String(name || "");
  }

  function truncateText(ctx, text, maxWidth) {
    let t = text;
    while (ctx.measureText(t).width > maxWidth && t.length > 3) {
      t = t.slice(0, -1);
    }
    return t === text ? text : t + "\u2026";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawArrowhead(ctx, fromX, fromY, toX, toY, size) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawPathDiagram(result, options = {}) {
    const { xNames, yName, pathCoeffs, corrMatrix, rSquared, residual, p } = result;
    const cfg = sanitizeDiagramOptions(options);

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const W = Math.round(cfg.width);

    const ratioValue = getRatioValue(cfg.ratio);
    const dynamicH = Math.max(520, 140 + p * 110);
    const H = ratioValue ? Math.round(W / ratioValue) : dynamicH;

    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // ---- Background ----
    if (cfg.backgroundMode === "transparent") {
      ctx.clearRect(0, 0, W, H);
    } else {
      ctx.fillStyle = cfg.bgColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    const titleTop = Math.max(26, cfg.padTop * 0.38 + 30);
    const hasTitle = cfg.titleMode !== "hidden";
    const hasSubtitle = cfg.subtitleMode !== "hidden";
    const titleText = cfg.titleMode === "custom" && cfg.customTitle.trim()
      ? cfg.customTitle.trim()
      : "Path Diagram";
    const subtitleText = cfg.subtitleMode === "custom" && cfg.customSubtitle.trim()
      ? cfg.customSubtitle.trim()
      : "Standard Path Coefficient Analysis (Singh & Chaudhary)";

    let subtitleTop = titleTop;
    if (hasTitle) {
      ctx.fillStyle = cfg.titleColor;
      ctx.font = `bold ${cfg.titleSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(titleText, W / 2, titleTop);
      subtitleTop = titleTop + cfg.titleSize + 4;
    } else {
      subtitleTop = titleTop;
    }

    if (hasSubtitle) {
      ctx.font = `${cfg.subtitleSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.fillStyle = cfg.subtitleColor;
      ctx.fillText(subtitleText, W / 2, subtitleTop);
    }

    // ---- Layout constants ----
    const xBoxW = Math.max(130, Math.round(W * 0.155));
    const xBoxH = Math.max(42, Math.round(cfg.nodeSize * 2.9));
    const yBoxW = Math.max(145, Math.round(W * 0.175));
    const yBoxH = Math.max(50, Math.round(cfg.nodeSize * 3.3));
    const leftCx = cfg.padLeft + xBoxW / 2 + Math.max(8, W * 0.03);
    const rightCx = W - cfg.padRight - yBoxW / 2 - Math.max(8, W * 0.03);

    const titleBlockHeight = (hasTitle ? cfg.titleSize + 4 : 0) + (hasSubtitle ? cfg.subtitleSize + 4 : 0);
    const contentTop = cfg.padTop + Math.max(0, titleBlockHeight + 14);
    const contentBottom = H - cfg.padBottom - (cfg.showFooter ? cfg.footerSize + 22 : 10);
    const availH = contentBottom - contentTop;
    const xSpacing = p > 1 ? availH / (p - 1) : 0;
    const xStartY = p > 1 ? contentTop : (contentTop + contentBottom) / 2;
    const yCy = (contentTop + contentBottom) / 2;

    // ---- X box positions ----
    const xPos = [];
    for (let i = 0; i < p; i++) {
      xPos.push({ cx: leftCx, cy: xStartY + i * xSpacing });
    }

    // ---- Draw correlation arcs between X variables (left side) ----
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        const r = corrMatrix[i][j];
        const y1 = xPos[i].cy;
        const y2 = xPos[j].cy;
        const gap = j - i;
        const cpxOffset = 30 + gap * 22;
        const cpx = leftCx - xBoxW / 2 - cpxOffset;
        const cpy = (y1 + y2) / 2;

        ctx.strokeStyle = cfg.corrLineColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(leftCx - xBoxW / 2, y1);
        ctx.quadraticCurveTo(cpx, cpy, leftCx - xBoxW / 2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Double arrowheads
        ctx.fillStyle = cfg.corrLineColor;
        const arrowSize = 7;
        // Top arrow
        const t1 = 0.05;
        const ax1 = (1 - t1) * (1 - t1) * (leftCx - xBoxW / 2) + 2 * (1 - t1) * t1 * cpx + t1 * t1 * (leftCx - xBoxW / 2);
        const ay1 = (1 - t1) * (1 - t1) * y1 + 2 * (1 - t1) * t1 * cpy + t1 * t1 * y2;
        drawArrowhead(ctx, ax1, ay1, leftCx - xBoxW / 2, y1, arrowSize);
        // Bottom arrow
        const t2 = 0.95;
        const ax2 = (1 - t2) * (1 - t2) * (leftCx - xBoxW / 2) + 2 * (1 - t2) * t2 * cpx + t2 * t2 * (leftCx - xBoxW / 2);
        const ay2 = (1 - t2) * (1 - t2) * y1 + 2 * (1 - t2) * t2 * cpy + t2 * t2 * y2;
        drawArrowhead(ctx, ax2, ay2, leftCx - xBoxW / 2, y2, arrowSize);

        // Correlation label
        ctx.save();
        ctx.fillStyle = cfg.textColor;
        ctx.font = `${Math.max(9, cfg.tagSize)}px '${cfg.fontFamily}', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lblX = cpx - 8;
        ctx.fillText(`r = ${r.toFixed(4)}`, lblX, cpy);
        ctx.restore();
      }
    }

    // ---- Draw path arrows from X to Y ----
    for (let i = 0; i < p; i++) {
      const color = cfg.xColors[i % cfg.xColors.length] || DIAGRAM_COLORS[i % DIAGRAM_COLORS.length];
      const fromX = leftCx + xBoxW / 2;
      const fromY = xPos[i].cy;
      const toX = rightCx - yBoxW / 2;
      const toY = yCy;

      // Arrow line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX - 10, toY + (fromY - toY) * 0.05);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = color;
      drawArrowhead(ctx, fromX, fromY, toX, toY, 12);

      // Path coefficient label
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const offsetX = -Math.sin(angle) * 14;
      const offsetY = Math.cos(angle) * 14;

      // Label background
      const label = `P${i + 1} = ${pathCoeffs[i].toFixed(4)}`;
      ctx.font = `bold ${cfg.coeffSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      drawRoundRect(ctx, midX + offsetX - tw / 2 - 5, midY + offsetY - 10, tw + 10, 20, 4);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX + offsetX, midY + offsetY);
    }

    // ---- Residual arrow into Y ----
    const resFromY = contentTop - 10;
    const resToY = yCy - yBoxH / 2;
    ctx.strokeStyle = cfg.residualColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(rightCx, resFromY);
    ctx.lineTo(rightCx, resToY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cfg.residualColor;
    drawArrowhead(ctx, rightCx, resFromY, rightCx, resToY, 10);

    // Residual label
    ctx.font = `bold ${cfg.coeffSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.fillStyle = cfg.subtitleColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`e = ${residual.toFixed(4)}`, rightCx, resFromY - 4);

    // ---- Draw X boxes (on top of arrows) ----
    for (let i = 0; i < p; i++) {
      const color = cfg.xColors[i % cfg.xColors.length] || DIAGRAM_COLORS[i % DIAGRAM_COLORS.length];
      const cx = xPos[i].cx;
      const cy = xPos[i].cy;

      // Shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.10)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = color;
      drawRoundRect(ctx, cx - xBoxW / 2, cy - xBoxH / 2, xBoxW, xBoxH, 10);
      ctx.fill();
      ctx.restore();

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      drawRoundRect(ctx, cx - xBoxW / 2, cy - xBoxH / 2, xBoxW, xBoxH, 10);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${cfg.nodeSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(truncateText(ctx, pickNodeLabel(xNames[i], cfg.nameMode), xBoxW - 20), cx, cy - (cfg.showRoleTags ? 8 : 0));
      ctx.font = `${cfg.tagSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      if (cfg.showRoleTags) ctx.fillText(`(X${i + 1})`, cx, cy + 10);
    }

    // ---- Draw Y box ----
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = cfg.yColor;
    drawRoundRect(ctx, rightCx - yBoxW / 2, yCy - yBoxH / 2, yBoxW, yBoxH, 12);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = cfg.yColor;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, rightCx - yBoxW / 2, yCy - yBoxH / 2, yBoxW, yBoxH, 12);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(cfg.nodeSize, 13)}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(truncateText(ctx, pickNodeLabel(yName, cfg.nameMode), yBoxW - 24), rightCx, yCy - (cfg.showRoleTags ? 9 : 0));
    ctx.font = `${Math.max(cfg.tagSize, 10)}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    if (cfg.showRoleTags) ctx.fillText("(Y)", rightCx, yCy + 11);

    if (cfg.showFooter) {
      const bottomY = H - Math.max(18, cfg.padBottom * 0.45);
      ctx.fillStyle = cfg.textColor;
      ctx.font = `${cfg.footerSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `R\u00b2 = ${rSquared.toFixed(4)}   |   Residual = ${residual.toFixed(4)}   |   n = ${result.n}`,
        W / 2, bottomY
      );
    }

    // Return data URL
    return canvas.toDataURL("image/png");
  }

  // ═══════════════════════════════════════════════════════
  // Path Diagram Preview Modal
  // ═══════════════════════════════════════════════════════

  function getPathDiagramSettingValue(settings, key) {
    const el = settings.querySelector(`[data-setting='${key}']`);
    if (!el) return undefined;
    if (el.type === "checkbox") return !!el.checked;
    if (el.type === "number") return Number(el.value);
    return el.value;
  }

  function collectPathDiagramOptionsFromSettings(settings, previous = {}) {
    const next = {
      ...previous,
      titleMode: getPathDiagramSettingValue(settings, "titleMode"),
      customTitle: getPathDiagramSettingValue(settings, "customTitle"),
      subtitleMode: getPathDiagramSettingValue(settings, "subtitleMode"),
      customSubtitle: getPathDiagramSettingValue(settings, "customSubtitle"),
      showFooter: getPathDiagramSettingValue(settings, "showFooter"),
      showRoleTags: getPathDiagramSettingValue(settings, "showRoleTags"),
      nameMode: getPathDiagramSettingValue(settings, "nameMode"),
      width: getPathDiagramSettingValue(settings, "width"),
      ratio: getPathDiagramSettingValue(settings, "ratio"),
      padTop: getPathDiagramSettingValue(settings, "padTop"),
      padRight: getPathDiagramSettingValue(settings, "padRight"),
      padBottom: getPathDiagramSettingValue(settings, "padBottom"),
      padLeft: getPathDiagramSettingValue(settings, "padLeft"),
      fontFamily: getPathDiagramSettingValue(settings, "fontFamily"),
      titleSize: getPathDiagramSettingValue(settings, "titleSize"),
      subtitleSize: getPathDiagramSettingValue(settings, "subtitleSize"),
      nodeSize: getPathDiagramSettingValue(settings, "nodeSize"),
      tagSize: getPathDiagramSettingValue(settings, "tagSize"),
      coeffSize: getPathDiagramSettingValue(settings, "coeffSize"),
      footerSize: getPathDiagramSettingValue(settings, "footerSize"),
      backgroundMode: getPathDiagramSettingValue(settings, "backgroundMode"),
      bgColor: getPathDiagramSettingValue(settings, "bgColor"),
      borderColor: getPathDiagramSettingValue(settings, "borderColor"),
      titleColor: getPathDiagramSettingValue(settings, "titleColor"),
      subtitleColor: getPathDiagramSettingValue(settings, "subtitleColor"),
      textColor: getPathDiagramSettingValue(settings, "textColor"),
      yColor: getPathDiagramSettingValue(settings, "yColor"),
      residualColor: getPathDiagramSettingValue(settings, "residualColor"),
      corrLineColor: getPathDiagramSettingValue(settings, "corrLineColor"),
      xColors: [],
    };

    const xColorInputs = settings.querySelectorAll("[data-x-color-index]");
    xColorInputs.forEach((input) => {
      next.xColors[Number(input.getAttribute("data-x-color-index"))] = input.value;
    });

    return sanitizeDiagramOptions(next);
  }

  function getFontFamilyOptions(selected) {
    const fonts = [
      "Segoe UI",
      "Arial",
      "Helvetica",
      "Verdana",
      "Tahoma",
      "Trebuchet MS",
      "Georgia",
      "Times New Roman",
      "Garamond",
      "Courier New",
      "Consolas",
    ];
    return fonts
      .map((font) => `<option value="${escapeHtml(font)}" ${font === selected ? "selected" : ""}>${escapeHtml(font)}</option>`)
      .join("");
  }

  function syncPathDiagramSettingsVisibility(settings, options) {
    if (!settings) return;

    const toggleRow = (name, show) => {
      const row = settings.querySelector(`[data-row='${name}']`);
      if (!row) return;
      row.classList.toggle("is-hidden", !show);
    };

    toggleRow("customTitle", options.titleMode === "custom");
    toggleRow("titleSize", options.titleMode !== "hidden");
    toggleRow("customSubtitle", options.subtitleMode === "custom");
    toggleRow("subtitleSize", options.subtitleMode !== "hidden");
    toggleRow("footerSize", options.showFooter);
    toggleRow("tagSize", options.showRoleTags);
    toggleRow("bgColor", options.backgroundMode === "color");
  }

  function buildPathDiagramSettingsFieldsHtml(result, options) {
    const xColorFields = result.xNames
      .map((name, index) => `
        <label class="path-diagram-setting-row path-diagram-setting-color">
          <span class="path-diagram-setting-label">${escapeHtml(name)}</span>
          <input type="color" value="${escapeHtml(options.xColors[index] || DIAGRAM_COLORS[index % DIAGRAM_COLORS.length])}" data-x-color-index="${index}">
        </label>
      `)
      .join("");

    return `
      <div class="path-diagram-settings-scroll">
        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Size, Ratio, Padding</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Width (px)</span><input data-setting="width" type="number" min="500" max="2400" step="10" value="${options.width}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Ratio</span><select data-setting="ratio"><option value="16:9" ${options.ratio === "16:9" ? "selected" : ""}>16:9</option><option value="4:3" ${options.ratio === "4:3" ? "selected" : ""}>4:3</option><option value="1:1" ${options.ratio === "1:1" ? "selected" : ""}>1:1</option><option value="auto" ${options.ratio === "auto" ? "selected" : ""}>Auto</option></select></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Top</span><input data-setting="padTop" type="number" min="-500" max="500" value="${options.padTop}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Right</span><input data-setting="padRight" type="number" min="-500" max="500" value="${options.padRight}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Bottom</span><input data-setting="padBottom" type="number" min="-500" max="500" value="${options.padBottom}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Left</span><input data-setting="padLeft" type="number" min="-500" max="500" value="${options.padLeft}"></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Text & Labels</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Title</span><select data-setting="titleMode"><option value="default" ${options.titleMode === "default" ? "selected" : ""}>Show (Default)</option><option value="custom" ${options.titleMode === "custom" ? "selected" : ""}>Custom</option><option value="hidden" ${options.titleMode === "hidden" ? "selected" : ""}>Hide</option></select></label>
          <label class="path-diagram-setting-row" data-row="customTitle"><span class="path-diagram-setting-label">Custom Title</span><input data-setting="customTitle" type="text" value="${escapeHtml(options.customTitle)}" placeholder="Path Diagram"></label>
          <label class="path-diagram-setting-row" data-row="titleSize"><span class="path-diagram-setting-label">Title Size</span><input data-setting="titleSize" type="number" min="10" max="64" value="${options.titleSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Subtitle</span><select data-setting="subtitleMode"><option value="default" ${options.subtitleMode === "default" ? "selected" : ""}>Show (Default)</option><option value="custom" ${options.subtitleMode === "custom" ? "selected" : ""}>Custom</option><option value="hidden" ${options.subtitleMode === "hidden" ? "selected" : ""}>Hide</option></select></label>
          <label class="path-diagram-setting-row" data-row="customSubtitle"><span class="path-diagram-setting-label">Custom Subtitle</span><input data-setting="customSubtitle" type="text" value="${escapeHtml(options.customSubtitle)}" placeholder="Standard Path Coefficient Analysis"></label>
          <label class="path-diagram-setting-row" data-row="subtitleSize"><span class="path-diagram-setting-label">Subtitle Size</span><input data-setting="subtitleSize" type="number" min="10" max="48" value="${options.subtitleSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Footer</span><input data-setting="showFooter" type="checkbox" ${options.showFooter ? "checked" : ""}></label>
          <label class="path-diagram-setting-row" data-row="footerSize"><span class="path-diagram-setting-label">Footer Size</span><input data-setting="footerSize" type="number" min="8" max="40" value="${options.footerSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">X/Y tags</span><input data-setting="showRoleTags" type="checkbox" ${options.showRoleTags ? "checked" : ""}></label>
          <label class="path-diagram-setting-row" data-row="tagSize"><span class="path-diagram-setting-label">Tag Size (X1/Y)</span><input data-setting="tagSize" type="number" min="8" max="32" value="${options.tagSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Parameter Names</span><select data-setting="nameMode"><option value="full" ${options.nameMode === "full" ? "selected" : ""}>Full</option><option value="initials" ${options.nameMode === "initials" ? "selected" : ""}>Initials only</option></select></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Font</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Font Family</span><select data-setting="fontFamily">${getFontFamilyOptions(options.fontFamily)}</select></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Node Name Size</span><input data-setting="nodeSize" type="number" min="10" max="48" value="${options.nodeSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Coefficient Size</span><input data-setting="coeffSize" type="number" min="8" max="40" value="${options.coeffSize}"></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Colors</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Background Mode</span><select data-setting="backgroundMode"><option value="color" ${options.backgroundMode === "color" ? "selected" : ""}>Custom color</option><option value="transparent" ${options.backgroundMode === "transparent" ? "selected" : ""}>Transparent</option></select></label>
          <label class="path-diagram-setting-row path-diagram-setting-color" data-row="bgColor"><span class="path-diagram-setting-label">Background Color</span><input data-setting="bgColor" type="color" value="${escapeHtml(options.bgColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Border</span><input data-setting="borderColor" type="color" value="${escapeHtml(options.borderColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Title</span><input data-setting="titleColor" type="color" value="${escapeHtml(options.titleColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Subtitle</span><input data-setting="subtitleColor" type="color" value="${escapeHtml(options.subtitleColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Text</span><input data-setting="textColor" type="color" value="${escapeHtml(options.textColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Y Node</span><input data-setting="yColor" type="color" value="${escapeHtml(options.yColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Residual</span><input data-setting="residualColor" type="color" value="${escapeHtml(options.residualColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Correlation Line</span><input data-setting="corrLineColor" type="color" value="${escapeHtml(options.corrLineColor)}"></label>
          ${xColorFields}
        </div>
      </div>
    `;
  }

  function buildPathDiagramSettingsHtml(result, options, toolbar = null) {
    const toolbarHtml = toolbar ? `
      <div class="path-diagram-settings-toolbar">
        ${toolbar}
      </div>
    ` : "";

    return `${toolbarHtml}${buildPathDiagramSettingsFieldsHtml(result, options)}`;
  }

  function buildPathDiagramInlineContent(diagramTitle, diagramId, diagramDataUrl) {
    return `
      <div class="path-diagram-container" id="${diagramId}">
        <img src="${diagramDataUrl}" alt="Path Diagram" class="path-diagram-image"
             onclick="window._pathDiagramPreviewById('${diagramId}')"
             style="cursor:pointer">
        <div class="analysis-result-note" style="margin-top:0.6rem">Click image to open preview and custom settings.</div>
      </div>
    `;
  }

  function buildCombinedPathAnalysisContent(payload, diagramDataUrl) {
    return `
      <div class="analysis-result-block">
        <div class="analysis-result-title">${payload.analysisTitle}</div>
        <div class="analysis-result-subtitle">${payload.analysisMethodSubtitle}</div>

        ${buildPathDiagramInlineContent(payload.diagramTitle, payload.diagramId, diagramDataUrl)}

        ${payload.corrHtml}
        ${payload.effectsHtml}
        ${payload.summaryHtml}
        ${payload.skippedNoteHtml}
      </div>
    `;
  }

  function syncPathDiagramResultOutput(diagramId, dataUrl) {
    const payload = window._pathDiagramStore?.[diagramId];
    if (!payload) return;

    const resultImage = document.querySelector(`#${diagramId} .path-diagram-image`);
    if (resultImage) {
      resultImage.src = dataUrl;
    }

    if (!payload.resultTabId || !payload.diagramTitle) return;
    const tabs = window.AnalysisApp?.state?.resultTabs;
    if (!Array.isArray(tabs)) return;

    const tab = tabs.find((item) => item.id === payload.resultTabId);
    if (!tab) return;

    tab.content = buildCombinedPathAnalysisContent(payload, dataUrl);
  }

  function renderPathDiagramPreview(modal, diagramId) {
    const payload = window._pathDiagramStore?.[diagramId];
    if (!payload) return;

    const settings = modal.querySelector("#pathDiagramSettingsPanel");
    const image = modal.querySelector("#pathDiagramPreviewImage");
    if (!settings || !image) return;

    const options = collectPathDiagramOptionsFromSettings(settings, payload.options || DEFAULT_DIAGRAM_OPTIONS);
    syncPathDiagramSettingsVisibility(settings, options);
    payload.options = options;
    persistPathDiagramDefaults(options);
    const dataUrl = drawPathDiagram(payload.result, options);
    payload.dataUrl = dataUrl;
    image.src = dataUrl;
    syncPathDiagramResultOutput(diagramId, dataUrl);
  }

  function openPathDiagramPreview(diagramId) {
    const payload = window._pathDiagramStore?.[diagramId];
    if (!payload) return;

    // Remove existing preview modal if any
    let modal = document.getElementById("pathDiagramPreviewModal");
    if (modal) modal.remove();

    const options = sanitizeDiagramOptions(payload.options || getStoredPathDiagramDefaults());
    payload.options = options;
    payload.dataUrl = drawPathDiagram(payload.result, options);
    syncPathDiagramResultOutput(diagramId, payload.dataUrl);

    modal = document.createElement("div");
    modal.id = "pathDiagramPreviewModal";
    modal.className = "modal-overlay path-diagram-modal-overlay";
    modal.innerHTML = `
      <div class="path-diagram-preview-modal">
        <div class="path-diagram-preview-body">
          <div class="path-diagram-preview-canvas-wrap">
            <img src="${payload.dataUrl}" alt="Path Diagram" class="path-diagram-preview-image" id="pathDiagramPreviewImage">
          </div>
          <div class="path-diagram-settings" id="pathDiagramSettingsPanel">
            ${buildPathDiagramSettingsHtml(
              payload.result,
              options,
              `
                <button class="btn btn-primary path-diagram-download-btn" data-action="download">
                  <span class="material-symbols-rounded">download</span> Download
                </button>
                <button class="btn btn-secondary path-diagram-reset-btn" data-action="reset">
                  <span class="material-symbols-rounded">settings_backup_restore</span> Reset to Default
                </button>
                <button class="btn btn-secondary path-diagram-close-btn" data-action="close">
                  <span class="material-symbols-rounded">close</span>
                </button>
              `,
            )}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Show with slight delay for transition
    requestAnimationFrame(() => {
      modal.classList.add("active");
    });

    // Close handler
    const closeModal = () => {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 250);
    };
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    const settingsPanel = modal.querySelector("#pathDiagramSettingsPanel");
    if (settingsPanel) {
      syncPathDiagramSettingsVisibility(settingsPanel, options);
      const rerender = () => renderPathDiagramPreview(modal, diagramId);
      settingsPanel.addEventListener("input", rerender);
      settingsPanel.addEventListener("change", rerender);
      settingsPanel.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;

        const action = target.getAttribute("data-action");
        if (action === "close") {
          closeModal();
          return;
        }

        if (action === "download") {
          const current = window._pathDiagramStore?.[diagramId];
          if (!current?.dataUrl) return;
          downloadPathDiagram(current.dataUrl);
          return;
        }

        if (action === "reset") {
          const current = window._pathDiagramStore?.[diagramId];
          if (!current) return;
          current.options = sanitizeDiagramOptions(DEFAULT_DIAGRAM_OPTIONS);
          persistPathDiagramDefaults(current.options);
          settingsPanel.innerHTML = buildPathDiagramSettingsHtml(
            current.result,
            current.options,
            `
              <button class="btn btn-primary path-diagram-download-btn" data-action="download">
                <span class="material-symbols-rounded">download</span> Download
              </button>
              <button class="btn btn-secondary path-diagram-reset-btn" data-action="reset">
                <span class="material-symbols-rounded">settings_backup_restore</span> Reset to Default
              </button>
              <button class="btn btn-secondary path-diagram-close-btn" data-action="close">
                <span class="material-symbols-rounded">close</span>
              </button>
            `,
          );
          syncPathDiagramSettingsVisibility(settingsPanel, current.options);
          renderPathDiagramPreview(modal, diagramId);
        }
      });
    }
  }

  function downloadPathDiagram(dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `path-diagram-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Expose globally so inline onclick handlers work across tab switches
  window._pathDiagramPreviewById = openPathDiagramPreview;
  window._pathDiagramDownload = downloadPathDiagram;
  window.getPathDiagramDefaultOptions = () => sanitizeDiagramOptions(DEFAULT_DIAGRAM_OPTIONS);
  window.sanitizePathDiagramOptions = sanitizeDiagramOptions;
  window.getPathDiagramSettingsEditorHtml = (options = {}, xNames = []) => {
    const fakeResult = {
      xNames: Array.isArray(xNames) && xNames.length > 0
        ? xNames
        : Array.from({ length: 10 }, (_, idx) => `X${idx + 1}`),
    };
    return buildPathDiagramSettingsHtml(fakeResult, sanitizeDiagramOptions(options));
  };
  window.collectPathDiagramOptionsFromContainer = (container, previous = {}) => {
    if (!container) return sanitizeDiagramOptions(previous);
    return collectPathDiagramOptionsFromSettings(container, previous);
  };
  window.syncPathDiagramOptionsEditorVisibility = (container, options = {}) => {
    if (!container) return;
    syncPathDiagramSettingsVisibility(container, sanitizeDiagramOptions(options));
  };

  // ═══════════════════════════════════════════════════════
  // Render Results
  // ═══════════════════════════════════════════════════════

  function renderPathResults(r, skippedCount) {
    const { p, allNames, corrMatrix, xNames, yName, pathCoeffs, rXY, rSquared, residual, effectsTable } = r;

    // 1) Correlation Matrix
    let corrHtml = `
      <div class="analysis-result-subtitle" style="margin-top:1rem">Correlation Matrix</div>
      <table class="analysis-anova-table">
        <thead><tr><th></th>${allNames.map((n) => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
        <tbody>
    `;
    for (let i = 0; i < allNames.length; i++) {
      corrHtml += `<tr><td><b>${escapeHtml(allNames[i])}</b></td>`;
      for (let j = 0; j < allNames.length; j++) {
        const val = corrMatrix[i][j];
        corrHtml += `<td>${formatNumber(val)}</td>`;
      }
      corrHtml += "</tr>";
    }
    corrHtml += "</tbody></table>";

    // 2) Direct & Indirect Effects Table
    let effectsHtml = `
      <div class="analysis-result-subtitle" style="margin-top:1.25rem">Direct and Indirect Effects on ${escapeHtml(yName)}</div>
      <table class="analysis-anova-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Direct Effect (P\u1d62)</th>
            ${xNames.map((n) => `<th>Indirect via ${escapeHtml(n)}</th>`).join("")}
            <th>Total Indirect</th>
            <th>r(X\u1d62, Y)</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const eff of effectsTable) {
      effectsHtml += `<tr>`;
      effectsHtml += `<td><b>${escapeHtml(eff.variable)}</b></td>`;
      effectsHtml += `<td>${formatNumber(eff.directEffect)}</td>`;

      // Indirect columns (one per X variable)
      for (let j = 0; j < p; j++) {
        if (j === eff.index) {
          effectsHtml += `<td class="analysis-path-diagonal">\u2014</td>`;
        } else {
          const ind = eff.indirects.find((x) => x.viaIndex === j);
          effectsHtml += `<td>${ind ? formatNumber(ind.indirect) : "\u2014"}</td>`;
        }
      }

      effectsHtml += `<td>${formatNumber(eff.totalIndirect)}</td>`;
      effectsHtml += `<td>${formatNumber(eff.totalCorrelation)}</td>`;
      effectsHtml += `</tr>`;
    }
    effectsHtml += "</tbody></table>";

    // 3) Summary: path coefficients, R², residual
    let summaryHtml = `
      <div class="analysis-result-subtitle" style="margin-top:1.25rem">Path Coefficients Summary</div>
      <table class="analysis-anova-table analysis-summary-table">
        <thead><tr><th>Variable</th><th>Path Coefficient (P\u1d62)</th><th>r(X\u1d62, Y)</th><th>Contribution (P\u1d62 \u00d7 r\u1d62)</th></tr></thead>
        <tbody>
    `;
    for (const eff of effectsTable) {
      summaryHtml += `<tr>
        <td>${escapeHtml(eff.variable)}</td>
        <td>${formatNumber(eff.directEffect)}</td>
        <td>${formatNumber(eff.totalCorrelation)}</td>
        <td>${formatNumber(eff.contribution)}</td>
      </tr>`;
    }
    summaryHtml += `</tbody></table>`;

    summaryHtml += `
      <div class="analysis-result-note" style="margin-top:0.75rem; font-style:normal">
        R\u00b2 = ${formatNumber(rSquared)} &nbsp;|&nbsp; Residual Effect = ${formatNumber(residual)} &nbsp;|&nbsp; n = ${r.n}
      </div>
    `;

    if (typeof app.pushResultTab === "function") {
      try {
        const diagramId = "pathDiagram_" + Date.now();
        const options = getStoredPathDiagramDefaults();
        const diagramDataUrl = drawPathDiagram(r, options);
        const analysisTitle = `Path Analysis: ${xNames.map((n) => escapeHtml(n)).join(", ")} \u2192 ${escapeHtml(yName)}`;
        const analysisMethodSubtitle = "Method: Standard Path Coefficient Analysis (Singh & Chaudhary)";
        const diagramTitle = `Path Diagram: ${xNames.map((n) => escapeHtml(n)).join(", ")} \u2192 ${escapeHtml(yName)}`;
        const skippedNoteHtml = skippedCount > 0
          ? `<div class="analysis-result-note" style="margin-top:0.75rem">Note: ${skippedCount} rows were excluded (blank or non-numeric value).</div>`
          : "";

        window._pathDiagramStore = window._pathDiagramStore || {};
        window._pathDiagramStore[diagramId] = {
          result: r,
          options,
          dataUrl: diagramDataUrl,
          diagramId,
          analysisTitle,
          analysisMethodSubtitle,
          diagramTitle,
          corrHtml,
          effectsHtml,
          summaryHtml,
          skippedNoteHtml,
        };
        const combinedContent = buildCombinedPathAnalysisContent(window._pathDiagramStore[diagramId], diagramDataUrl);

        const resultTab = app.pushResultTab({
          label: `Path: ${xNames.join(", ")} \u2192 ${yName}`,
          title: `Path Analysis`,
          content: combinedContent,
        });

        if (resultTab?.id) {
          window._pathDiagramStore[diagramId].resultTabId = resultTab.id;
        }
      } catch (err) {
        console.error("Path diagram rendering failed:", err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // Dropzones: X₁, X₂, ..., Xₙ + Y
  // ═══════════════════════════════════════════════════════

  function getPathAnalysisDropzones(factorCount) {
    const numVars = Number(factorCount) || 2;
    const zones = [];

    for (let i = 0; i < numVars; i++) {
      zones.push({
        id: `analysisX${i}Area`,
        role: `x-${i}`,
        label: `X${i + 1}`,
      });
    }

    zones.push({
      id: "analysisYArea",
      role: "y",
      label: "Y (Dependent)",
    });

    return zones;
  }

  // ═══════════════════════════════════════════════════════
  // Register type
  // ═══════════════════════════════════════════════════════

  app.registerType({
    id: "path-analysis",
    label: "Path Analysis",
    designs: [
      {
        id: "standard-path-analysis",
        label: "Standard Path Analysis",
        supportedFactors: ["2", "3", "4", "5", "6", "7", "8", "9", "10"],
        factorsLabel: "Independent Variables",
        factorsOptionLabel: (value) => `${value} Variables`,
        run: runPathAnalysis,
        getDropzones: getPathAnalysisDropzones,
      },
    ],
  });
})();
