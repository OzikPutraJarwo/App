(function registerGgeBiplotModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before GGE biplot modules.");
  }

  const utils = app._anovaUtils;
  if (!utils) throw new Error("ANOVA utilities (_anovaUtils from crd.js) must be loaded before GGE biplot module.");

  const { formatNumber } = utils;

  // ═══════════════════════════════════════════════════════
  // Linear Algebra helpers
  // ═══════════════════════════════════════════════════════

  function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  /**
   * Singular Value Decomposition (SVD) using power iteration for 2 components.
   * Input: m×n matrix A
   * Returns { U, S, V } where U is m×2, S is [s1,s2], V is n×2
   */
  function svd2(A, maxIter = 200, tol = 1e-10) {
    const m = A.length;
    const n = A[0].length;

    function matTvec(M, v) {
      const rows = M.length;
      const cols = M[0].length;
      const result = new Array(cols).fill(0);
      for (let j = 0; j < cols; j++) {
        for (let i = 0; i < rows; i++) {
          result[j] += M[i][j] * v[i];
        }
      }
      return result;
    }

    function matvec(M, v) {
      return M.map(row => row.reduce((s, val, j) => s + val * v[j], 0));
    }

    function norm(v) {
      return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    }

    function normalize(v) {
      const len = norm(v);
      return len > 0 ? v.map(x => x / len) : v;
    }

    const Ures = [];
    const Sres = [];
    const Vres = [];

    let residual = A.map(row => [...row]);

    for (let comp = 0; comp < Math.min(2, Math.min(m, n)); comp++) {
      // Power iteration to find dominant singular triplet
      let v = new Array(n).fill(0).map(() => Math.random() - 0.5);
      v = normalize(v);
      let sigma = 0;

      for (let iter = 0; iter < maxIter; iter++) {
        const u = normalize(matvec(residual, v));
        const vNew = normalize(matTvec(residual, u));
        sigma = norm(matvec(residual, vNew));

        const diff = vNew.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
        v = vNew;
        if (diff < tol) break;
      }

      const u = normalize(matvec(residual, v));
      sigma = norm(matvec(residual, v));

      Ures.push(u);
      Sres.push(sigma);
      Vres.push(v);

      // Deflate: remove this component from the residual
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
          residual[i][j] -= sigma * u[i] * v[j];
        }
      }
    }

    // Pad to 2 components if needed
    while (Ures.length < 2) {
      Ures.push(new Array(m).fill(0));
      Sres.push(0);
      Vres.push(new Array(n).fill(0));
    }

    // Transpose U and V to column format
    const Ucols = [];
    for (let i = 0; i < m; i++) {
      Ucols.push([Ures[0][i], Ures[1][i]]);
    }
    const Vcols = [];
    for (let j = 0; j < n; j++) {
      Vcols.push([Vres[0][j], Vres[1][j]]);
    }

    return { U: Ucols, S: Sres, V: Vcols };
  }

  // ═══════════════════════════════════════════════════════
  // GGE Biplot Computation
  //
  // GGE model (Yan, 2001):
  //   Yij - µj = Σ_k λ_k * ξ_ik * η_jk + ε_ij
  //
  // Steps:
  //   1. Build G×E mean matrix from raw data
  //   2. Center by environment mean (column-centering) → GGE matrix
  //   3. Apply SVD to get PC1, PC2
  //   4. Scale coordinates by singular value partitioning
  //
  // Scaling types:
  //   - Symmetric (SVP=1): genotype & env scores scaled by √λ
  //   - Environment-focused (SVP=2): env scores absorb λ
  //   - Genotype-focused (SVP=0): genotype scores absorb λ
  // ═══════════════════════════════════════════════════════

  function computeGgeBiplot(data) {
    // Collect unique levels
    const genotypeSet = new Set();
    const envSet = new Set();

    data.forEach(row => {
      genotypeSet.add(String(row.genotype));
      envSet.add(String(row.environment));
    });

    const genotypes = [...genotypeSet].sort();
    const envs = [...envSet].sort();
    const g = genotypes.length;
    const e = envs.length;

    if (g < 2) return { error: "Need at least 2 genotypes for GGE Biplot." };
    if (e < 2) return { error: "Need at least 2 environments for GGE Biplot." };

    // Build sum and count matrices
    const sumMatrix = Array.from({ length: g }, () => new Array(e).fill(0));
    const countMatrix = Array.from({ length: g }, () => new Array(e).fill(0));

    const genoIndex = {};
    genotypes.forEach((gn, i) => { genoIndex[gn] = i; });
    const envIndex = {};
    envs.forEach((en, i) => { envIndex[en] = i; });

    data.forEach(row => {
      const gi = genoIndex[String(row.genotype)];
      const ei = envIndex[String(row.environment)];
      if (gi !== undefined && ei !== undefined) {
        sumMatrix[gi][ei] += row.value;
        countMatrix[gi][ei] += 1;
      }
    });

    // Build mean matrix
    const meanMatrix = Array.from({ length: g }, () => new Array(e).fill(0));
    let missingCells = 0;
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < e; j++) {
        if (countMatrix[i][j] > 0) {
          meanMatrix[i][j] = sumMatrix[i][j] / countMatrix[i][j];
        } else {
          missingCells++;
          meanMatrix[i][j] = NaN;
        }
      }
    }

    if (missingCells > 0) {
      // Fill missing cells with grand mean
      const allVals = [];
      for (let i = 0; i < g; i++)
        for (let j = 0; j < e; j++)
          if (!isNaN(meanMatrix[i][j])) allVals.push(meanMatrix[i][j]);
      const gm = mean(allVals);
      for (let i = 0; i < g; i++)
        for (let j = 0; j < e; j++)
          if (isNaN(meanMatrix[i][j])) meanMatrix[i][j] = gm;
    }

    // Environment means (column means)
    const envMeans = [];
    for (let j = 0; j < e; j++) {
      let s = 0;
      for (let i = 0; i < g; i++) s += meanMatrix[i][j];
      envMeans.push(s / g);
    }

    // Grand mean
    const grandMean = mean(envMeans);

    // Genotype means (row means)
    const genoMeans = [];
    for (let i = 0; i < g; i++) {
      let s = 0;
      for (let j = 0; j < e; j++) s += meanMatrix[i][j];
      genoMeans.push(s / e);
    }

    // Column-centered (GGE) matrix: Yij - µ.j
    const ggeMatrix = Array.from({ length: g }, (_, i) =>
      Array.from({ length: e }, (_, j) => meanMatrix[i][j] - envMeans[j])
    );

    // SVD
    const { U, S, V } = svd2(ggeMatrix);

    const totalSS = ggeMatrix.reduce((s, row) =>
      s + row.reduce((ss, v) => ss + v * v, 0), 0
    );

    const pc1Pct = totalSS > 0 ? (S[0] * S[0]) / totalSS * 100 : 0;
    const pc2Pct = totalSS > 0 ? (S[1] * S[1]) / totalSS * 100 : 0;

    // Compute scores for all 3 scaling types
    function getScores(scaling) {
      const genoScores = [];
      const envScores = [];

      for (let i = 0; i < g; i++) {
        if (scaling === "symmetric") {
          genoScores.push([U[i][0] * Math.sqrt(S[0]), U[i][1] * Math.sqrt(S[1])]);
        } else if (scaling === "environment") {
          genoScores.push([U[i][0], U[i][1]]);
        } else {
          genoScores.push([U[i][0] * S[0], U[i][1] * S[1]]);
        }
      }

      for (let j = 0; j < e; j++) {
        if (scaling === "symmetric") {
          envScores.push([V[j][0] * Math.sqrt(S[0]), V[j][1] * Math.sqrt(S[1])]);
        } else if (scaling === "environment") {
          envScores.push([V[j][0] * S[0], V[j][1] * S[1]]);
        } else {
          envScores.push([V[j][0], V[j][1]]);
        }
      }

      return { genoScores, envScores };
    }

    return {
      genotypes, envs, g, e,
      meanMatrix, ggeMatrix,
      envMeans, genoMeans, grandMean,
      U, S, V,
      pc1Pct, pc2Pct, totalSS,
      missingCells,
      n: data.length,
      getScores,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Canvas GGE Biplot Renderer – Shared helpers
  // ═══════════════════════════════════════════════════════

  const DEFAULT_GGE_OPTIONS = {
    titleMode: "default",
    customTitle: "",
    subtitleMode: "default",
    customSubtitle: "",
    showFooter: true,
    showLegend: true,
    showGrid: true,
    showOriginLines: true,
    width: 720,
    ratio: "1:1",
    padTop: 80,
    padRight: 80,
    padBottom: 80,
    padLeft: 80,
    fontFamily: "Segoe UI",
    titleSize: 16,
    subtitleSize: 12,
    labelSize: 12,
    axisSize: 11,
    footerSize: 11,
    markerSize: 6,
    scaling: "symmetric",
    backgroundMode: "color",
    bgColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    titleColor: "#1E293B",
    subtitleColor: "#64748B",
    textColor: "#475569",
    axisColor: "#94A3B8",
    gridColor: "#F1F5F9",
    genotypeColor: "#3B82F6",
    envColor: "#DC2626",
    polygonColor: "#94A3B8",
    aecColor: "#16A34A",
  };

  let ggePersistTimer = null;

  function getStoredGgeDefaults() {
    const analysisPrefs = typeof getStoredAnalysisUserSettings === "function"
      ? getStoredAnalysisUserSettings() : null;
    if (analysisPrefs && typeof analysisPrefs === "object" && analysisPrefs.ggeBiplotDefaults) {
      return sanitizeGgeOptions(analysisPrefs.ggeBiplotDefaults);
    }
    return sanitizeGgeOptions(DEFAULT_GGE_OPTIONS);
  }

  function persistGgeDefaults(options) {
    const safe = sanitizeGgeOptions(options);
    if (typeof updateStoredAnalysisUserSettings !== "function") return;
    if (ggePersistTimer) clearTimeout(ggePersistTimer);
    ggePersistTimer = setTimeout(() => {
      updateStoredAnalysisUserSettings({ ggeBiplotDefaults: safe }, { closeMenu: false });
      ggePersistTimer = null;
    }, 180);
  }

  function sanitizeGgeOptions(options = {}) {
    const merged = { ...DEFAULT_GGE_OPTIONS, ...options };

    const num = (v, min, max, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
    };

    merged.width = num(merged.width, 400, 2400, DEFAULT_GGE_OPTIONS.width);
    merged.padTop = num(merged.padTop, -500, 500, DEFAULT_GGE_OPTIONS.padTop);
    merged.padRight = num(merged.padRight, -500, 500, DEFAULT_GGE_OPTIONS.padRight);
    merged.padBottom = num(merged.padBottom, -500, 500, DEFAULT_GGE_OPTIONS.padBottom);
    merged.padLeft = num(merged.padLeft, -500, 500, DEFAULT_GGE_OPTIONS.padLeft);
    merged.titleSize = num(merged.titleSize, 10, 64, DEFAULT_GGE_OPTIONS.titleSize);
    merged.subtitleSize = num(merged.subtitleSize, 10, 48, DEFAULT_GGE_OPTIONS.subtitleSize);
    merged.labelSize = num(merged.labelSize, 8, 40, DEFAULT_GGE_OPTIONS.labelSize);
    merged.axisSize = num(merged.axisSize, 8, 36, DEFAULT_GGE_OPTIONS.axisSize);
    merged.footerSize = num(merged.footerSize, 8, 40, DEFAULT_GGE_OPTIONS.footerSize);
    merged.markerSize = num(merged.markerSize, 2, 20, DEFAULT_GGE_OPTIONS.markerSize);

    if (!["default", "custom", "hidden"].includes(merged.titleMode)) merged.titleMode = "default";
    if (!["default", "custom", "hidden"].includes(merged.subtitleMode)) merged.subtitleMode = "default";
    if (!["1:1", "4:3", "16:9", "auto"].includes(merged.ratio)) merged.ratio = "1:1";
    if (!["symmetric", "environment", "genotype"].includes(merged.scaling)) merged.scaling = "symmetric";
    if (!["color", "transparent"].includes(merged.backgroundMode)) merged.backgroundMode = "color";

    return merged;
  }

  function getRatioValue(ratio) {
    if (ratio === "4:3") return 4 / 3;
    if (ratio === "16:9") return 16 / 9;
    if (ratio === "1:1") return 1;
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // Drawing helpers
  // ═══════════════════════════════════════════════════════

  function createBiplotCanvas(cfg) {
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const W = Math.round(cfg.width);
    const ratioValue = getRatioValue(cfg.ratio);
    const H = ratioValue ? Math.round(W / ratioValue) : W;

    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return { canvas, ctx, W, H, dpr };
  }

  function drawBiplotBackground(ctx, W, H, cfg) {
    if (cfg.backgroundMode === "transparent") {
      ctx.clearRect(0, 0, W, H);
    } else {
      ctx.fillStyle = cfg.bgColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  function drawBiplotTitles(ctx, W, cfg, defaultTitle, defaultSubtitle) {
    const hasTitle = cfg.titleMode !== "hidden";
    const hasSubtitle = cfg.subtitleMode !== "hidden";
    const titleText = cfg.titleMode === "custom" && cfg.customTitle.trim()
      ? cfg.customTitle.trim() : defaultTitle;
    const subtitleText = cfg.subtitleMode === "custom" && cfg.customSubtitle.trim()
      ? cfg.customSubtitle.trim() : defaultSubtitle;

    let y = Math.max(22, cfg.padTop * 0.38 + 26);

    if (hasTitle) {
      ctx.fillStyle = cfg.titleColor;
      ctx.font = `bold ${cfg.titleSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(titleText, W / 2, y);
      y += cfg.titleSize + 4;
    }

    if (hasSubtitle) {
      ctx.fillStyle = cfg.subtitleColor;
      ctx.font = `${cfg.subtitleSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(subtitleText, W / 2, y);
      y += cfg.subtitleSize + 4;
    }

    return y;
  }

  function computePlotArea(W, H, cfg, allPoints, titlesBottom) {
    const plotLeft = cfg.padLeft;
    const plotRight = W - cfg.padRight;
    const plotTop = Math.max(titlesBottom + 10, cfg.padTop);
    const plotBottom = H - cfg.padBottom - (cfg.showFooter ? cfg.footerSize + 18 : 10);

    const plotW = plotRight - plotLeft;
    const plotH = plotBottom - plotTop;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allPoints.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const rangeX = Math.max(0.01, maxX - minX);
    const rangeY = Math.max(0.01, maxY - minY);
    const padFrac = 0.18;
    minX = Math.min(minX - rangeX * padFrac, -rangeX * 0.05);
    maxX = Math.max(maxX + rangeX * padFrac, rangeX * 0.05);
    minY = Math.min(minY - rangeY * padFrac, -rangeY * 0.05);
    maxY = Math.max(maxY + rangeY * padFrac, rangeY * 0.05);

    // Make axes equal scale if ratio is 1:1
    if (cfg.ratio === "1:1") {
      const dataRangeX = maxX - minX;
      const dataRangeY = maxY - minY;
      const scaleX = plotW / dataRangeX;
      const scaleY = plotH / dataRangeY;
      const sc = Math.min(scaleX, scaleY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const halfW = (plotW / sc) / 2;
      const halfH = (plotH / sc) / 2;
      minX = cx - halfW;
      maxX = cx + halfW;
      minY = cy - halfH;
      maxY = cy + halfH;
    }

    const toPixelX = (v) => plotLeft + (v - minX) / (maxX - minX) * plotW;
    const toPixelY = (v) => plotBottom - (v - minY) / (maxY - minY) * plotH;

    return { plotLeft, plotRight, plotTop, plotBottom, plotW, plotH, minX, maxX, minY, maxY, toPixelX, toPixelY };
  }

  function niceStep(range, targetTicks) {
    const rough = range / targetTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const frac = rough / pow;
    let nice;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3.5) nice = 2;
    else if (frac <= 7.5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  function formatTickVal(v) {
    if (Math.abs(v) < 1e-10) return "0";
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(1);
    return v.toFixed(2);
  }

  function drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label) {
    const { plotLeft, plotRight, plotTop, plotBottom, minX, maxX, minY, maxY, toPixelX, toPixelY } = plot;

    if (cfg.showGrid) {
      ctx.strokeStyle = cfg.gridColor;
      ctx.lineWidth = 0.5;
      const stepX = niceStep(maxX - minX, 8);
      const stepY = niceStep(maxY - minY, 8);

      for (let v = Math.ceil(minX / stepX) * stepX; v <= maxX; v += stepX) {
        const px = toPixelX(v);
        if (px >= plotLeft && px <= plotRight) {
          ctx.beginPath(); ctx.moveTo(px, plotTop); ctx.lineTo(px, plotBottom); ctx.stroke();
        }
      }
      for (let v = Math.ceil(minY / stepY) * stepY; v <= maxY; v += stepY) {
        const py = toPixelY(v);
        if (py >= plotTop && py <= plotBottom) {
          ctx.beginPath(); ctx.moveTo(plotLeft, py); ctx.lineTo(plotRight, py); ctx.stroke();
        }
      }
    }

    if (cfg.showOriginLines) {
      ctx.strokeStyle = cfg.axisColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      const ox = toPixelX(0);
      if (ox >= plotLeft && ox <= plotRight) {
        ctx.beginPath(); ctx.moveTo(ox, plotTop); ctx.lineTo(ox, plotBottom); ctx.stroke();
      }
      const oy = toPixelY(0);
      if (oy >= plotTop && oy <= plotBottom) {
        ctx.beginPath(); ctx.moveTo(plotLeft, oy); ctx.lineTo(plotRight, oy); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Tick labels
    ctx.fillStyle = cfg.textColor;
    ctx.font = `${cfg.axisSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const stepX = niceStep(maxX - minX, 8);
    for (let v = Math.ceil(minX / stepX) * stepX; v <= maxX; v += stepX) {
      const px = toPixelX(v);
      if (px >= plotLeft && px <= plotRight) ctx.fillText(formatTickVal(v), px, plotBottom + 4);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const stepY = niceStep(maxY - minY, 8);
    for (let v = Math.ceil(minY / stepY) * stepY; v <= maxY; v += stepY) {
      const py = toPixelY(v);
      if (py >= plotTop && py <= plotBottom) ctx.fillText(formatTickVal(v), plotLeft - 6, py);
    }

    // Axis labels
    ctx.fillStyle = cfg.textColor;
    ctx.font = `bold ${cfg.axisSize + 1}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(pc1Label, (plotLeft + plotRight) / 2, plotBottom + cfg.axisSize + 8);

    ctx.save();
    ctx.translate(plotLeft - cfg.axisSize - 22, (plotTop + plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pc2Label, 0, 0);
    ctx.restore();

    // Plot border
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);
  }

  function drawMarker(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawLabel(ctx, text, px, py, cfg, color, offX, offY) {
    ctx.fillStyle = color;
    ctx.font = `bold ${cfg.labelSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.textAlign = offX >= 0 ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + offX, py + offY);
  }

  function drawFooter(ctx, W, H, cfg, text) {
    if (!cfg.showFooter) return;
    const bottomY = H - Math.max(14, cfg.padBottom * 0.35);
    ctx.fillStyle = cfg.textColor;
    ctx.font = `${cfg.footerSize}px '${cfg.fontFamily}', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, bottomY);
  }

  function clipPlotArea(ctx, plot) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.plotLeft, plot.plotTop, plot.plotRight - plot.plotLeft, plot.plotBottom - plot.plotTop);
    ctx.clip();
  }

  function drawArrowhead(ctx, toX, toY, fromX, fromY, size, color) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 7), toY - size * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 7), toY - size * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }

  // ═══════════════════════════════════════════════════════
  // Individual Biplot Type Renderers
  // ═══════════════════════════════════════════════════════

  /** 1) Basic Biplot  – genotype & environment scores */
  function drawBasicBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "GGE Biplot", pc1Label + " vs " + pc2Label);
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    clipPlotArea(ctx, plot);
    const ox = plot.toPixelX(0);
    const oy = plot.toPixelY(0);

    envScores.forEach(([ex, ey], j) => {
      const px = plot.toPixelX(ex);
      const py = plot.toPixelY(ey);
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
      drawArrowhead(ctx, px, py, ox, oy, 8, cfg.envColor);
    });

    genoScores.forEach(([gx, gy], i) => {
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length} | n = ${result.n}`);
    return canvas.toDataURL("image/png");
  }

  /** 2) Which-Won-Where / Polygon Biplot */
  function drawPolygonBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "Which Won Where / Polygon", pc1Label + " vs " + pc2Label);
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    clipPlotArea(ctx, plot);
    // Convex hull
    const hull = convexHull(genoScores);

    if (hull.length >= 3) {
      ctx.strokeStyle = cfg.polygonColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(plot.toPixelX(hull[0][0]), plot.toPixelY(hull[0][1]));
      for (let k = 1; k < hull.length; k++) ctx.lineTo(plot.toPixelX(hull[k][0]), plot.toPixelY(hull[k][1]));
      ctx.closePath();
      ctx.stroke();

      // Perpendicular lines from origin to each polygon edge
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = cfg.polygonColor;
      ctx.lineWidth = 1;
      for (let k = 0; k < hull.length; k++) {
        const [x1, y1] = hull[k];
        const [x2, y2] = hull[(k + 1) % hull.length];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) continue;
        const nx = -dy / len;
        const ny = dx / len;
        const ext = Math.max(plot.maxX - plot.minX, plot.maxY - plot.minY) * 2;
        ctx.beginPath();
        ctx.moveTo(plot.toPixelX(-nx * ext), plot.toPixelY(-ny * ext));
        ctx.lineTo(plot.toPixelX(nx * ext), plot.toPixelY(ny * ext));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    envScores.forEach(([ex, ey], j) => {
      drawMarker(ctx, plot.toPixelX(ex), plot.toPixelY(ey), cfg.markerSize, cfg.envColor);
    });

    genoScores.forEach(([gx, gy], i) => {
      const isVertex = hull.some(([hx, hy]) => Math.abs(hx - gx) < 1e-10 && Math.abs(hy - gy) < 1e-10);
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), isVertex ? cfg.markerSize + 2 : cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Which-Won-Where | Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length}`);
    return canvas.toDataURL("image/png");
  }

  /** 3) Mean vs. Stability (AEC) Biplot */
  function drawMeanStabilityBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "Mean vs. Stability", "Average Environment Coordination (AEC) View");
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    // AEC abscissa direction = mean of environment vectors
    let aecX = 0, aecY = 0;
    envScores.forEach(([ex, ey]) => { aecX += ex; aecY += ey; });
    const aecLen = Math.sqrt(aecX * aecX + aecY * aecY);
    if (aecLen > 1e-10) { aecX /= aecLen; aecY /= aecLen; }

    const ext = Math.max(plot.maxX - plot.minX, plot.maxY - plot.minY) * 2;

    clipPlotArea(ctx, plot);

    // AEC abscissa (mean performance axis) — solid line with arrow
    ctx.strokeStyle = cfg.aecColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.toPixelX(-aecX * ext), plot.toPixelY(-aecY * ext));
    ctx.lineTo(plot.toPixelX(aecX * ext), plot.toPixelY(aecY * ext));
    ctx.stroke();

    // Arrow on positive end
    {
      const tipX = plot.toPixelX(aecX * ext * 0.4);
      const tipY = plot.toPixelY(aecY * ext * 0.4);
      const angle = Math.atan2(tipY - plot.toPixelY(0), tipX - plot.toPixelX(0));
      ctx.fillStyle = cfg.aecColor;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 10 * Math.cos(angle - Math.PI / 7), tipY - 10 * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(tipX - 10 * Math.cos(angle + Math.PI / 7), tipY - 10 * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    }

    // AEC ordinate (stability axis) — dashed, perpendicular
    const aecPerpX = -aecY;
    const aecPerpY = aecX;
    ctx.strokeStyle = cfg.aecColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.toPixelX(-aecPerpX * ext), plot.toPixelY(-aecPerpY * ext));
    ctx.lineTo(plot.toPixelX(aecPerpX * ext), plot.toPixelY(aecPerpY * ext));
    ctx.stroke();
    ctx.setLineDash([]);

    // Projection lines for each genotype
    genoScores.forEach(([gx, gy]) => {
      const projLen = gx * aecX + gy * aecY;
      const projX = projLen * aecX;
      const projY = projLen * aecY;
      ctx.strokeStyle = cfg.textColor;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.toPixelX(gx), plot.toPixelY(gy));
      ctx.lineTo(plot.toPixelX(projX), plot.toPixelY(projY));
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Environment vectors
    const ox = plot.toPixelX(0);
    const oy = plot.toPixelY(0);
    envScores.forEach(([ex, ey], j) => {
      const px = plot.toPixelX(ex);
      const py = plot.toPixelY(ey);
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
    });

    // Genotype markers
    genoScores.forEach(([gx, gy], i) => {
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    // Labels outside clip so they remain visible
    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Mean vs. Stability | Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length}`);
    return canvas.toDataURL("image/png");
  }

  /** 4) Discriminativeness vs. Representativeness */
  function drawDiscrimRepBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "Discriminativeness vs. Representativeness", "Environment Evaluation View");
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    // AEC abscissa
    let aecX = 0, aecY = 0;
    envScores.forEach(([ex, ey]) => { aecX += ex; aecY += ey; });
    const aecLen = Math.sqrt(aecX * aecX + aecY * aecY);
    if (aecLen > 1e-10) { aecX /= aecLen; aecY /= aecLen; }

    const ext = Math.max(plot.maxX - plot.minX, plot.maxY - plot.minY) * 2;

    clipPlotArea(ctx, plot);

    ctx.strokeStyle = cfg.aecColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.toPixelX(0), plot.toPixelY(0));
    ctx.lineTo(plot.toPixelX(aecX * ext), plot.toPixelY(aecY * ext));
    ctx.stroke();

    // Concentric circles (one per env vector length)
    envScores.forEach(([ex, ey]) => {
      const envLen = Math.sqrt(ex * ex + ey * ey);
      const radiusPx = Math.abs(plot.toPixelX(envLen) - plot.toPixelX(0));
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(plot.toPixelX(0), plot.toPixelY(0), radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Environment vectors with arrows
    const ox = plot.toPixelX(0);
    const oy = plot.toPixelY(0);
    envScores.forEach(([ex, ey], j) => {
      const px = plot.toPixelX(ex);
      const py = plot.toPixelY(ey);
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
      drawArrowhead(ctx, px, py, ox, oy, 8, cfg.envColor);
    });

    genoScores.forEach(([gx, gy], i) => {
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Disc. vs. Rep. | Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length}`);
    return canvas.toDataURL("image/png");
  }

  /** 5) Ranking Genotypes (Concentric Circles) */
  function drawRankingBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "Ranking Genotypes", "Ideal Genotype View with Concentric Circles");
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    // AEC direction
    let aecX = 0, aecY = 0;
    envScores.forEach(([ex, ey]) => { aecX += ex; aecY += ey; });
    const aecLen = Math.sqrt(aecX * aecX + aecY * aecY);
    if (aecLen > 1e-10) { aecX /= aecLen; aecY /= aecLen; }

    const ext = Math.max(plot.maxX - plot.minX, plot.maxY - plot.minY) * 2;

    clipPlotArea(ctx, plot);

    // AEC abscissa
    ctx.strokeStyle = cfg.aecColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.toPixelX(-aecX * ext), plot.toPixelY(-aecY * ext));
    ctx.lineTo(plot.toPixelX(aecX * ext), plot.toPixelY(aecY * ext));
    ctx.stroke();

    // Arrow
    {
      const tipX = plot.toPixelX(aecX * ext * 0.4);
      const tipY = plot.toPixelY(aecY * ext * 0.4);
      const angle = Math.atan2(tipY - plot.toPixelY(0), tipX - plot.toPixelX(0));
      ctx.fillStyle = cfg.aecColor;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 10 * Math.cos(angle - Math.PI / 7), tipY - 10 * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(tipX - 10 * Math.cos(angle + Math.PI / 7), tipY - 10 * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    }

    // AEC ordinate (perpendicular, dashed)
    const aecPerpX = -aecY;
    const aecPerpY = aecX;
    ctx.strokeStyle = cfg.aecColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(plot.toPixelX(-aecPerpX * ext), plot.toPixelY(-aecPerpY * ext));
    ctx.lineTo(plot.toPixelX(aecPerpX * ext), plot.toPixelY(aecPerpY * ext));
    ctx.stroke();
    ctx.setLineDash([]);

    // Ideal genotype: highest AEC abscissa projection
    let bestProj = -Infinity;
    let idealIdx = 0;
    genoScores.forEach(([gx, gy], i) => {
      const proj = gx * aecX + gy * aecY;
      if (proj > bestProj) { bestProj = proj; idealIdx = i; }
    });

    const idealProjLen = genoScores[idealIdx][0] * aecX + genoScores[idealIdx][1] * aecY;
    const idealX = idealProjLen * aecX;
    const idealY = idealProjLen * aecY;
    const idealPxX = plot.toPixelX(idealX);
    const idealPxY = plot.toPixelY(idealY);

    // Concentric circles from ideal genotype
    const distances = genoScores.map(([gx, gy]) => {
      const dx = gx - idealX;
      const dy = gy - idealY;
      return Math.sqrt(dx * dx + dy * dy);
    });

    const rings = [...new Set(distances.map(d => Math.round(d * 1000) / 1000))].sort((a, b) => a - b);
    rings.forEach(r => {
      if (r < 0.001) return;
      const radiusPx = Math.abs(plot.toPixelX(r) - plot.toPixelX(0));
      ctx.strokeStyle = cfg.polygonColor;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(idealPxX, idealPxY, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Ideal marker (ring)
    ctx.fillStyle = cfg.aecColor;
    ctx.beginPath();
    ctx.arc(idealPxX, idealPxY, cfg.markerSize + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cfg.bgColor || "#FFFFFF";
    ctx.beginPath();
    ctx.arc(idealPxX, idealPxY, cfg.markerSize, 0, Math.PI * 2);
    ctx.fill();

    // Environment vectors
    const ox = plot.toPixelX(0);
    const oy = plot.toPixelY(0);
    envScores.forEach(([ex, ey], j) => {
      const px = plot.toPixelX(ex);
      const py = plot.toPixelY(ey);
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
    });

    // Genotype markers
    genoScores.forEach(([gx, gy], i) => {
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Ranking | Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length}`);
    return canvas.toDataURL("image/png");
  }

  /** 6) Environment Comparison Biplot */
  function drawEnvComparisonBiplot(result, options) {
    const cfg = sanitizeGgeOptions(options);
    const { genotypes, envs, pc1Pct, pc2Pct } = result;
    const { genoScores, envScores } = result.getScores(cfg.scaling);

    const { canvas, ctx, W, H } = createBiplotCanvas(cfg);
    drawBiplotBackground(ctx, W, H, cfg);
    const pc1Label = `PC1 (${pc1Pct.toFixed(1)}%)`;
    const pc2Label = `PC2 (${pc2Pct.toFixed(1)}%)`;
    const titlesBottom = drawBiplotTitles(ctx, W, cfg, "Environment Comparison", "Environment Vector View");
    const allPts = [...genoScores, ...envScores];
    const plot = computePlotArea(W, H, cfg, allPts, titlesBottom);
    drawAxesAndGrid(ctx, cfg, plot, pc1Label, pc2Label);

    clipPlotArea(ctx, plot);
    const ox = plot.toPixelX(0);
    const oy = plot.toPixelY(0);

    envScores.forEach(([ex, ey], j) => {
      const px = plot.toPixelX(ex);
      const py = plot.toPixelY(ey);
      ctx.strokeStyle = cfg.envColor;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
      drawArrowhead(ctx, px, py, ox, oy, 9, cfg.envColor);
    });

    // Angles/correlations between env pairs
    for (let i = 0; i < envScores.length; i++) {
      for (let j = i + 1; j < envScores.length; j++) {
        const [ex1, ey1] = envScores[i];
        const [ex2, ey2] = envScores[j];
        const len1 = Math.sqrt(ex1 * ex1 + ey1 * ey1);
        const len2 = Math.sqrt(ex2 * ex2 + ey2 * ey2);
        if (len1 < 1e-10 || len2 < 1e-10) continue;
        const cos = (ex1 * ex2 + ey1 * ey2) / (len1 * len2);

        // Canvas angles (Y is flipped)
        const a1 = Math.atan2(-(ey1), ex1);
        const a2 = Math.atan2(-(ey2), ex2);

        const arcR = 30;
        ctx.strokeStyle = cfg.polygonColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(ox, oy, arcR, Math.min(a1, a2), Math.max(a1, a2));
        ctx.stroke();
        ctx.setLineDash([]);

        const midAngle = (a1 + a2) / 2;
        ctx.fillStyle = cfg.textColor;
        ctx.font = `${Math.max(8, cfg.labelSize - 2)}px '${cfg.fontFamily}', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`r\u2248${cos.toFixed(2)}`, ox + (arcR + 14) * Math.cos(midAngle), oy + (arcR + 14) * Math.sin(midAngle));
      }
    }

    genoScores.forEach(([gx, gy], i) => {
      drawMarker(ctx, plot.toPixelX(gx), plot.toPixelY(gy), cfg.markerSize, cfg.genotypeColor);
    });
    ctx.restore();

    envScores.forEach(([ex, ey], j) => {
      drawLabel(ctx, envs[j], plot.toPixelX(ex), plot.toPixelY(ey), cfg, cfg.envColor, ex >= 0 ? 8 : -8, -10);
    });
    genoScores.forEach(([gx, gy], i) => {
      drawLabel(ctx, genotypes[i], plot.toPixelX(gx), plot.toPixelY(gy), cfg, cfg.genotypeColor, 8, -10);
    });

    drawFooter(ctx, W, H, cfg, `Env. Comparison | Scaling: ${cfg.scaling} | G: ${genotypes.length} | E: ${envs.length}`);
    return canvas.toDataURL("image/png");
  }

  // ═══════════════════════════════════════════════════════
  // Convex Hull (Graham Scan)
  // ═══════════════════════════════════════════════════════

  function convexHull(points) {
    if (points.length < 3) return [...points];

    const pts = points.map(([x, y], i) => ({ x, y, i }));

    let pivot = pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pivot.y || (pts[i].y === pivot.y && pts[i].x < pivot.x)) pivot = pts[i];
    }

    const sorted = pts
      .filter(p => p !== pivot)
      .map(p => ({ ...p, angle: Math.atan2(p.y - pivot.y, p.x - pivot.x), dist: (p.x - pivot.x) ** 2 + (p.y - pivot.y) ** 2 }))
      .sort((a, b) => a.angle - b.angle || a.dist - b.dist);

    const stack = [pivot, sorted[0]];

    function cross(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }

    for (let i = 1; i < sorted.length; i++) {
      while (stack.length > 1 && cross(stack[stack.length - 2], stack[stack.length - 1], sorted[i]) <= 0) stack.pop();
      stack.push(sorted[i]);
    }

    return stack.map(p => [p.x, p.y]);
  }

  // ═══════════════════════════════════════════════════════
  // GGE Biplot Preview Modal
  // ═══════════════════════════════════════════════════════

  const BIPLOT_TYPES = [
    { id: "basic", label: "Basic Biplot", draw: drawBasicBiplot },
    { id: "polygon", label: "Which Won Where", draw: drawPolygonBiplot },
    { id: "meanStability", label: "Mean vs. Stability", draw: drawMeanStabilityBiplot },
    { id: "discrimRep", label: "Disc. vs. Rep.", draw: drawDiscrimRepBiplot },
    { id: "ranking", label: "Ranking Genotypes", draw: drawRankingBiplot },
    { id: "envComparison", label: "Env. Comparison", draw: drawEnvComparisonBiplot },
  ];

  function getFontFamilyOptions(selected) {
    const fonts = [
      "Segoe UI", "Arial", "Helvetica", "Verdana", "Tahoma",
      "Trebuchet MS", "Georgia", "Times New Roman", "Garamond",
      "Courier New", "Consolas",
    ];
    return fonts
      .map(f => `<option value="${escapeHtml(f)}" ${f === selected ? "selected" : ""}>${escapeHtml(f)}</option>`)
      .join("");
  }

  function getGgeSettingValue(settings, key) {
    const el = settings.querySelector(`[data-setting='${key}']`);
    if (!el) return undefined;
    if (el.type === "checkbox") return !!el.checked;
    if (el.type === "number") return Number(el.value);
    return el.value;
  }

  function collectGgeOptionsFromSettings(settings, previous = {}) {
    const keys = [
      "titleMode", "customTitle", "subtitleMode", "customSubtitle",
      "showFooter", "showLegend", "showGrid", "showOriginLines",
      "width", "ratio",
      "padTop", "padRight", "padBottom", "padLeft",
      "fontFamily", "titleSize", "subtitleSize", "labelSize", "axisSize", "footerSize", "markerSize",
      "scaling",
      "backgroundMode", "bgColor", "borderColor", "titleColor", "subtitleColor",
      "textColor", "axisColor", "gridColor",
      "genotypeColor", "envColor", "polygonColor", "aecColor",
    ];

    const next = { ...previous };
    keys.forEach(k => {
      const v = getGgeSettingValue(settings, k);
      if (v !== undefined) next[k] = v;
    });
    return sanitizeGgeOptions(next);
  }

  function syncGgeSettingsVisibility(settings, options) {
    if (!settings) return;
    const toggleRow = (name, show) => {
      const row = settings.querySelector(`[data-row='${name}']`);
      if (row) row.classList.toggle("is-hidden", !show);
    };
    toggleRow("customTitle", options.titleMode === "custom");
    toggleRow("titleSize", options.titleMode !== "hidden");
    toggleRow("customSubtitle", options.subtitleMode === "custom");
    toggleRow("subtitleSize", options.subtitleMode !== "hidden");
    toggleRow("footerSize", options.showFooter);
    toggleRow("bgColor", options.backgroundMode === "color");
  }

  function buildGgeSettingsFieldsHtml(options) {
    return `
      <div class="path-diagram-settings-scroll">
        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Scaling</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">SVP Scaling</span><select data-setting="scaling"><option value="symmetric" ${options.scaling === "symmetric" ? "selected" : ""}>Symmetric</option><option value="environment" ${options.scaling === "environment" ? "selected" : ""}>Environment-focused</option><option value="genotype" ${options.scaling === "genotype" ? "selected" : ""}>Genotype-focused</option></select></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Size, Ratio, Padding</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Width (px)</span><input data-setting="width" type="number" min="400" max="2400" step="10" value="${options.width}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Ratio</span><select data-setting="ratio"><option value="1:1" ${options.ratio === "1:1" ? "selected" : ""}>1:1</option><option value="4:3" ${options.ratio === "4:3" ? "selected" : ""}>4:3</option><option value="16:9" ${options.ratio === "16:9" ? "selected" : ""}>16:9</option><option value="auto" ${options.ratio === "auto" ? "selected" : ""}>Auto</option></select></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Top</span><input data-setting="padTop" type="number" min="-500" max="500" value="${options.padTop}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Right</span><input data-setting="padRight" type="number" min="-500" max="500" value="${options.padRight}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Bottom</span><input data-setting="padBottom" type="number" min="-500" max="500" value="${options.padBottom}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Padding Left</span><input data-setting="padLeft" type="number" min="-500" max="500" value="${options.padLeft}"></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Text & Labels</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Title</span><select data-setting="titleMode"><option value="default" ${options.titleMode === "default" ? "selected" : ""}>Show (Default)</option><option value="custom" ${options.titleMode === "custom" ? "selected" : ""}>Custom</option><option value="hidden" ${options.titleMode === "hidden" ? "selected" : ""}>Hide</option></select></label>
          <label class="path-diagram-setting-row" data-row="customTitle"><span class="path-diagram-setting-label">Custom Title</span><input data-setting="customTitle" type="text" value="${escapeHtml(options.customTitle)}" placeholder="GGE Biplot"></label>
          <label class="path-diagram-setting-row" data-row="titleSize"><span class="path-diagram-setting-label">Title Size</span><input data-setting="titleSize" type="number" min="10" max="64" value="${options.titleSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Subtitle</span><select data-setting="subtitleMode"><option value="default" ${options.subtitleMode === "default" ? "selected" : ""}>Show (Default)</option><option value="custom" ${options.subtitleMode === "custom" ? "selected" : ""}>Custom</option><option value="hidden" ${options.subtitleMode === "hidden" ? "selected" : ""}>Hide</option></select></label>
          <label class="path-diagram-setting-row" data-row="customSubtitle"><span class="path-diagram-setting-label">Custom Subtitle</span><input data-setting="customSubtitle" type="text" value="${escapeHtml(options.customSubtitle)}" placeholder="PC1 vs PC2"></label>
          <label class="path-diagram-setting-row" data-row="subtitleSize"><span class="path-diagram-setting-label">Subtitle Size</span><input data-setting="subtitleSize" type="number" min="10" max="48" value="${options.subtitleSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Footer</span><input data-setting="showFooter" type="checkbox" ${options.showFooter ? "checked" : ""}></label>
          <label class="path-diagram-setting-row" data-row="footerSize"><span class="path-diagram-setting-label">Footer Size</span><input data-setting="footerSize" type="number" min="8" max="40" value="${options.footerSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Legend</span><input data-setting="showLegend" type="checkbox" ${options.showLegend ? "checked" : ""}></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Grid</span><input data-setting="showGrid" type="checkbox" ${options.showGrid ? "checked" : ""}></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Origin Lines</span><input data-setting="showOriginLines" type="checkbox" ${options.showOriginLines ? "checked" : ""}></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Font & Markers</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Font Family</span><select data-setting="fontFamily">${getFontFamilyOptions(options.fontFamily)}</select></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Label Size</span><input data-setting="labelSize" type="number" min="8" max="40" value="${options.labelSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Axis Label Size</span><input data-setting="axisSize" type="number" min="8" max="36" value="${options.axisSize}"></label>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Marker Size</span><input data-setting="markerSize" type="number" min="2" max="20" value="${options.markerSize}"></label>
        </div>

        <div class="path-diagram-setting-group">
          <div class="path-diagram-setting-group-title">Colors</div>
          <label class="path-diagram-setting-row"><span class="path-diagram-setting-label">Background Mode</span><select data-setting="backgroundMode"><option value="color" ${options.backgroundMode === "color" ? "selected" : ""}>Custom color</option><option value="transparent" ${options.backgroundMode === "transparent" ? "selected" : ""}>Transparent</option></select></label>
          <label class="path-diagram-setting-row path-diagram-setting-color" data-row="bgColor"><span class="path-diagram-setting-label">Background</span><input data-setting="bgColor" type="color" value="${escapeHtml(options.bgColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Border</span><input data-setting="borderColor" type="color" value="${escapeHtml(options.borderColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Title</span><input data-setting="titleColor" type="color" value="${escapeHtml(options.titleColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Subtitle</span><input data-setting="subtitleColor" type="color" value="${escapeHtml(options.subtitleColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Text</span><input data-setting="textColor" type="color" value="${escapeHtml(options.textColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Axis</span><input data-setting="axisColor" type="color" value="${escapeHtml(options.axisColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Grid</span><input data-setting="gridColor" type="color" value="${escapeHtml(options.gridColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Genotype</span><input data-setting="genotypeColor" type="color" value="${escapeHtml(options.genotypeColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Environment</span><input data-setting="envColor" type="color" value="${escapeHtml(options.envColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">Polygon / Circles</span><input data-setting="polygonColor" type="color" value="${escapeHtml(options.polygonColor)}"></label>
          <label class="path-diagram-setting-row path-diagram-setting-color"><span class="path-diagram-setting-label">AEC Axis</span><input data-setting="aecColor" type="color" value="${escapeHtml(options.aecColor)}"></label>
        </div>
      </div>
    `;
  }

  function buildGgeSettingsHtml(options, toolbar = null) {
    const toolbarHtml = toolbar ? `<div class="path-diagram-settings-toolbar">${toolbar}</div>` : "";
    return `${toolbarHtml}${buildGgeSettingsFieldsHtml(options)}`;
  }

  // ═══════════════════════════════════════════════════════
  // Inline content builders (for results tab)
  // ═══════════════════════════════════════════════════════

  function buildGgeBiplotInlineContent(biplotTypeId, storeId, dataUrl, label) {
    const imgId = `gge_img_${storeId}_${biplotTypeId}`;
    return `
      <div class="gge-biplot-inline" id="gge_${storeId}_${biplotTypeId}">
        <img src="${dataUrl}" alt="${escapeHtml(label)}" class="gge-biplot-image" id="${imgId}"
             onclick="window._ggeBiplotPreview('${storeId}', '${biplotTypeId}')"
             style="cursor:pointer">
      </div>
    `;
  }

  function buildCombinedGgeContent(payload) {
    let biplotsHtml = '<div class="gge-biplot-grid">';
    BIPLOT_TYPES.forEach(bt => {
      const dataUrl = payload.dataUrls[bt.id] || "";
      biplotsHtml += `
        <div class="gge-biplot-card">
          <div class="gge-biplot-card-title">${escapeHtml(bt.label)}</div>
          ${buildGgeBiplotInlineContent(bt.id, payload.storeId, dataUrl, bt.label)}
          <div class="analysis-result-note" style="margin-top:0.3rem;font-size:0.72rem">Click to preview &amp; customize</div>
        </div>
      `;
    });
    biplotsHtml += "</div>";

    return `
      <div class="analysis-result-block">
        <div class="analysis-result-title">${payload.analysisTitle}</div>
        <div class="analysis-result-subtitle">${payload.analysisSubtitle}</div>
        ${biplotsHtml}
        ${payload.meanTableHtml}
        ${payload.summaryHtml}
        ${payload.skippedNoteHtml}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════
  // GGE Biplot Store & Preview
  // ═══════════════════════════════════════════════════════

  window._ggeBiplotStore = window._ggeBiplotStore || {};

  function syncGgeBiplotResultOutput(storeId, biplotTypeId, dataUrl) {
    const payload = window._ggeBiplotStore?.[storeId];
    if (!payload) return;
    payload.dataUrls[biplotTypeId] = dataUrl;

    const imgEl = document.getElementById(`gge_img_${storeId}_${biplotTypeId}`);
    if (imgEl) imgEl.src = dataUrl;

    if (!payload.resultTabId) return;
    const tabs = window.AnalysisApp?.state?.resultTabs;
    if (!Array.isArray(tabs)) return;
    const tab = tabs.find(t => t.id === payload.resultTabId);
    if (tab) tab.content = buildCombinedGgeContent(payload);
  }

  function renderGgeBiplotPreview(modal, storeId, biplotTypeId) {
    const payload = window._ggeBiplotStore?.[storeId];
    if (!payload) return;

    const settings = modal.querySelector("#ggeSettingsPanel");
    const image = modal.querySelector("#ggePreviewImage");
    if (!settings || !image) return;

    const options = collectGgeOptionsFromSettings(settings, payload.options || DEFAULT_GGE_OPTIONS);
    syncGgeSettingsVisibility(settings, options);
    payload.options = options;
    persistGgeDefaults(options);

    const bt = BIPLOT_TYPES.find(b => b.id === biplotTypeId);
    if (!bt) return;

    const dataUrl = bt.draw(payload.result, options);
    image.src = dataUrl;
    syncGgeBiplotResultOutput(storeId, biplotTypeId, dataUrl);
  }

  function openGgeBiplotPreview(storeId, biplotTypeId) {
    const payload = window._ggeBiplotStore?.[storeId];
    if (!payload) return;

    let modal = document.getElementById("ggeBiplotPreviewModal");
    if (modal) modal.remove();

    const options = sanitizeGgeOptions(payload.options || getStoredGgeDefaults());
    payload.options = options;

    const bt = BIPLOT_TYPES.find(b => b.id === biplotTypeId);
    if (!bt) return;

    const dataUrl = bt.draw(payload.result, options);
    payload.dataUrls[biplotTypeId] = dataUrl;
    syncGgeBiplotResultOutput(storeId, biplotTypeId, dataUrl);

    let currentTypeId = biplotTypeId;

    modal = document.createElement("div");
    modal.id = "ggeBiplotPreviewModal";
    modal.className = "modal-overlay path-diagram-modal-overlay";

    const tabsHtml = BIPLOT_TYPES.map(b =>
      `<button class="gge-preview-type-btn ${b.id === currentTypeId ? "active" : ""}" data-biplot-type="${b.id}">${escapeHtml(b.label)}</button>`
    ).join("");

    const toolbarButtons = `
      <button class="btn btn-primary path-diagram-download-btn" data-action="download">
        <span class="material-symbols-rounded">download</span> Download
      </button>
      <button class="btn btn-secondary path-diagram-reset-btn" data-action="reset">
        <span class="material-symbols-rounded">settings_backup_restore</span> Reset
      </button>
      <button class="btn btn-secondary path-diagram-close-btn" data-action="close">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;

    modal.innerHTML = `
      <div class="path-diagram-preview-modal gge-preview-modal">
        <div class="gge-preview-type-tabs">${tabsHtml}</div>
        <div class="path-diagram-preview-body">
          <div class="path-diagram-preview-canvas-wrap">
            <img src="${dataUrl}" alt="GGE Biplot" class="path-diagram-preview-image" id="ggePreviewImage">
          </div>
          <div class="path-diagram-settings" id="ggeSettingsPanel">
            ${buildGgeSettingsHtml(options, toolbarButtons)}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("active"));

    const closeModal = () => {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 250);
    };

    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal();
    });

    const settingsPanel = modal.querySelector("#ggeSettingsPanel");
    syncGgeSettingsVisibility(settingsPanel, options);

    const rerender = () => renderGgeBiplotPreview(modal, storeId, currentTypeId);
    settingsPanel.addEventListener("input", rerender);
    settingsPanel.addEventListener("change", rerender);

    // Type tab switching
    modal.querySelector(".gge-preview-type-tabs").addEventListener("click", e => {
      const btn = e.target.closest("[data-biplot-type]");
      if (!btn) return;
      const newType = btn.getAttribute("data-biplot-type");
      if (newType === currentTypeId) return;
      currentTypeId = newType;
      modal.querySelectorAll(".gge-preview-type-btn").forEach(b =>
        b.classList.toggle("active", b.getAttribute("data-biplot-type") === newType)
      );
      const bt2 = BIPLOT_TYPES.find(b => b.id === currentTypeId);
      if (bt2) {
        const url = bt2.draw(payload.result, payload.options);
        payload.dataUrls[currentTypeId] = url;
        const img = modal.querySelector("#ggePreviewImage");
        if (img) img.src = url;
        syncGgeBiplotResultOutput(storeId, currentTypeId, url);
      }
    });

    // Toolbar actions
    settingsPanel.addEventListener("click", e => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");

      if (action === "close") { closeModal(); return; }

      if (action === "download") {
        const url = payload.dataUrls[currentTypeId];
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.download = `gge-biplot-${currentTypeId}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      if (action === "reset") {
        payload.options = sanitizeGgeOptions(DEFAULT_GGE_OPTIONS);
        persistGgeDefaults(payload.options);
        settingsPanel.innerHTML = buildGgeSettingsHtml(payload.options, toolbarButtons);
        syncGgeSettingsVisibility(settingsPanel, payload.options);
        rerender();
      }
    });
  }

  window._ggeBiplotPreview = openGgeBiplotPreview;

  // ═══════════════════════════════════════════════════════
  // Render GGE Results
  // ═══════════════════════════════════════════════════════

  function renderGgeResults(result, traitName, skippedCount) {
    const { genotypes, envs, meanMatrix, genoMeans, envMeans, grandMean, pc1Pct, pc2Pct, g, e, n, missingCells } = result;

    // G×E Mean Matrix Table
    let meanTableHtml = `
      <div class="analysis-result-subtitle" style="margin-top:1.25rem">Genotype \u00d7 Environment Mean Matrix (${escapeHtml(traitName)})</div>
      <table class="analysis-anova-table">
        <thead><tr><th>Genotype</th>${envs.map(en => `<th>${escapeHtml(en)}</th>`).join("")}<th>Genotype Mean</th></tr></thead>
        <tbody>
    `;
    for (let i = 0; i < g; i++) {
      meanTableHtml += `<tr><td><b>${escapeHtml(genotypes[i])}</b></td>`;
      for (let j = 0; j < e; j++) meanTableHtml += `<td>${formatNumber(meanMatrix[i][j])}</td>`;
      meanTableHtml += `<td><b>${formatNumber(genoMeans[i])}</b></td></tr>`;
    }
    meanTableHtml += `<tr><td><b>Env Mean</b></td>`;
    for (let j = 0; j < e; j++) meanTableHtml += `<td><b>${formatNumber(envMeans[j])}</b></td>`;
    meanTableHtml += `<td><b>${formatNumber(grandMean)}</b></td></tr></tbody></table>`;

    // SVD Summary
    let summaryHtml = `
      <div class="analysis-result-subtitle" style="margin-top:1.25rem">SVD Summary</div>
      <table class="analysis-anova-table analysis-summary-table">
        <thead><tr><th>Component</th><th>Singular Value</th><th>Variance Explained (%)</th></tr></thead>
        <tbody>
          <tr><td>PC1</td><td>${formatNumber(result.S[0])}</td><td>${formatNumber(pc1Pct)}</td></tr>
          <tr><td>PC2</td><td>${formatNumber(result.S[1])}</td><td>${formatNumber(pc2Pct)}</td></tr>
          <tr><td><b>Total (PC1+PC2)</b></td><td></td><td><b>${formatNumber(pc1Pct + pc2Pct)}</b></td></tr>
        </tbody>
      </table>
      <div class="analysis-result-note" style="margin-top:0.75rem; font-style:normal">
        Genotypes: ${g} | Environments: ${e} | Observations: ${n} | Grand Mean: ${formatNumber(grandMean)}
      </div>
    `;

    const skippedNoteHtml = skippedCount > 0
      ? `<div class="analysis-result-note" style="margin-top:0.5rem">Note: ${skippedCount} rows excluded (blank or non-numeric value).</div>`
      : (missingCells > 0
        ? `<div class="analysis-result-note" style="margin-top:0.5rem">Note: ${missingCells} cell(s) in the G\u00d7E matrix had no data and were imputed with the grand mean.</div>`
        : "");

    // Draw all 6 biplot types
    const storeId = "gge_" + Date.now();
    const options = getStoredGgeDefaults();
    const dataUrls = {};
    BIPLOT_TYPES.forEach(bt => {
      try { dataUrls[bt.id] = bt.draw(result, options); }
      catch (err) { console.error(`GGE draw error (${bt.id}):`, err); dataUrls[bt.id] = ""; }
    });

    const analysisTitle = `GGE Biplot: ${escapeHtml(traitName)}`;
    const analysisSubtitle = `Genotype + Genotype \u00d7 Environment Interaction Biplot Analysis`;

    const payload = {
      storeId, result, options, dataUrls,
      analysisTitle, analysisSubtitle,
      meanTableHtml, summaryHtml, skippedNoteHtml,
    };

    window._ggeBiplotStore[storeId] = payload;
    const combinedContent = buildCombinedGgeContent(payload);

    if (typeof app.pushResultTab === "function") {
      const resultTab = app.pushResultTab({
        label: `GGE: ${traitName}`,
        title: "GGE Biplot",
        content: combinedContent,
      });
      if (resultTab?.id) payload.resultTabId = resultTab.id;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Run GGE Biplot
  // ═══════════════════════════════════════════════════════

  function runGgeBiplot(context) {
    const { assignedColumns, rows, applyFilters, applySort } = context;

    const genCol = assignedColumns["genotype"];
    const envCol = assignedColumns["environment"];
    const traitCol = assignedColumns["trait"];

    if (!genCol) { if (typeof showToast === "function") showToast("Please assign the Genotype column.", "error"); return; }
    if (!envCol) { if (typeof showToast === "function") showToast("Please assign the Environment column.", "error"); return; }
    if (!traitCol) { if (typeof showToast === "function") showToast("Please assign the Trait / Response column.", "error"); return; }

    const filteredRows = applySort(applyFilters(rows));
    const data = [];
    let skippedCount = 0;

    filteredRows.forEach(row => {
      const genVal = row[genCol.key];
      const envVal = row[envCol.key];
      const traitVal = Number(row[traitCol.key]);

      if (!genVal || !envVal || row[traitCol.key] === "" || row[traitCol.key] == null || Number.isNaN(traitVal)) {
        skippedCount++;
        return;
      }

      data.push({ genotype: String(genVal), environment: String(envVal), value: traitVal });
    });

    if (data.length < 4) {
      if (typeof showToast === "function") showToast("Not enough valid data for GGE Biplot. Need at least 4 observations.", "error");
      return;
    }

    const result = computeGgeBiplot(data);

    if (result.error) {
      const content = `
        <div class="analysis-result-block">
          <div class="analysis-result-title">GGE Biplot</div>
          <div class="analysis-result-warning">
            <span class="analysis-warning-icon">\u26a0</span> ${escapeHtml(result.error)}
          </div>
        </div>
      `;
      if (typeof app.pushResultTab === "function") {
        app.pushResultTab({ label: "GGE Biplot", title: "GGE Biplot", content });
      }
      return;
    }

    renderGgeResults(result, traitCol.label, skippedCount);
  }

  // ═══════════════════════════════════════════════════════
  // Dropzones: Genotype, Environment, Trait
  // ═══════════════════════════════════════════════════════

  function getGgeBiplotDropzones() {
    return [
      { id: "analysisGenotypeArea", role: "genotype", label: "Genotype" },
      { id: "analysisEnvironmentArea", role: "environment", label: "Environment" },
      { id: "analysisTraitArea", role: "trait", label: "Trait / Response" },
    ];
  }

  // ═══════════════════════════════════════════════════════
  // Register type
  // ═══════════════════════════════════════════════════════

  app.registerType({
    id: "gge-biplot",
    label: "GGE Biplot",
    designs: [
      {
        id: "standard-gge-biplot",
        label: "Standard GGE Biplot",
        supportedFactors: ["2"],
        run: runGgeBiplot,
        getDropzones: getGgeBiplotDropzones,
      },
    ],
  });

  // Expose globals for User Settings integration
  window.getGgeBiplotDefaultOptions = () => sanitizeGgeOptions(DEFAULT_GGE_OPTIONS);
  window.sanitizeGgeBiplotOptions = sanitizeGgeOptions;
  window.getGgeBiplotSettingsEditorHtml = (options = {}) => buildGgeSettingsHtml(sanitizeGgeOptions(options));
  window.collectGgeBiplotOptionsFromContainer = (container, previous = {}) => {
    if (!container) return sanitizeGgeOptions(previous);
    return collectGgeOptionsFromSettings(container, previous);
  };
  window.syncGgeBiplotOptionsEditorVisibility = (container, options = {}) => {
    if (!container) return;
    syncGgeSettingsVisibility(container, sanitizeGgeOptions(options));
  };
})();
