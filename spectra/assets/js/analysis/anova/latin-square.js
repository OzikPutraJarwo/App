(function registerAnovaLatinSquareModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before ANOVA modules.");
  }

  // Reuse math utilities from CRD module
  function getUtils() {
    return app._anovaUtils || {};
  }

  function fDistributionCdf(x, df1, df2) {
    const utils = getUtils();
    if (typeof utils.fDistributionCdf === "function") return utils.fDistributionCdf(x, df1, df2);
    return 0;
  }

  function formatNumber(value, decimals = 4) {
    const utils = getUtils();
    if (typeof utils.formatNumber === "function") return utils.formatNumber(value, decimals);
    if (value == null || Number.isNaN(value)) return "-";
    return Number(value).toFixed(decimals);
  }

  function computeSignificance(p) {
    const utils = getUtils();
    if (typeof utils.computeSignificance === "function") return utils.computeSignificance(p);
    if (Number.isNaN(p)) return "";
    if (p < 0.001) return "***";
    if (p < 0.01) return "**";
    if (p < 0.05) return "*";
    return "ns";
  }

  function computeStdDev(values, mean) {
    const utils = getUtils();
    if (typeof utils.computeStdDev === "function") return utils.computeStdDev(values, mean);
    if (values.length < 2) return 0;
    const ss = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0);
    return Math.sqrt(ss / (values.length - 1));
  }

  // ═══════════════════════════════════════════════════════
  // One-way Latin Square (1 treatment + row block + column block)
  // ═══════════════════════════════════════════════════════

  function computeLatinSquareOneWay(data) {
    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

    const rowLevels = [...new Set(data.map((d) => d.row))].sort();
    const colLevels = [...new Set(data.map((d) => d.col))].sort();
    const treatmentLevels = [...new Set(data.map((d) => d.treatment))].sort();

    const r = rowLevels.length;
    const c = colLevels.length;
    const t = treatmentLevels.length;

    // Row means
    const rowMeans = new Map();
    rowLevels.forEach((rv) => {
      const vals = data.filter((d) => d.row === rv).map((d) => d.value);
      rowMeans.set(rv, vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // Column means
    const colMeans = new Map();
    colLevels.forEach((cv) => {
      const vals = data.filter((d) => d.col === cv).map((d) => d.value);
      colMeans.set(cv, vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // Treatment means & groups
    const treatmentMeans = new Map();
    const treatmentGroups = [];
    treatmentLevels.forEach((tv) => {
      const vals = data.filter((d) => d.treatment === tv).map((d) => d.value);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      treatmentMeans.set(tv, mean);
      treatmentGroups.push({ name: tv, values: vals, n: vals.length, mean });
    });

    // Sum of Squares
    // For a proper t×t Latin Square: each source has t observations per level
    const ssRow = c * rowLevels.reduce((s, rv) =>
      s + Math.pow(rowMeans.get(rv) - grandMean, 2), 0);

    const ssCol = r * colLevels.reduce((s, cv) =>
      s + Math.pow(colMeans.get(cv) - grandMean, 2), 0);

    const ssTreatment = (N / t) * treatmentLevels.reduce((s, tv) =>
      s + Math.pow(treatmentMeans.get(tv) - grandMean, 2), 0);

    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - grandMean, 2), 0);

    const ssError = Math.max(0, ssTotal - ssRow - ssCol - ssTreatment);

    // Degrees of freedom
    const dfRow = r - 1;
    const dfCol = c - 1;
    const dfTreatment = t - 1;
    const dfTotal = N - 1;
    const dfError = dfTotal - dfRow - dfCol - dfTreatment;

    // Mean squares
    const msRow = dfRow > 0 ? ssRow / dfRow : 0;
    const msCol = dfCol > 0 ? ssCol / dfCol : 0;
    const msTreatment = dfTreatment > 0 ? ssTreatment / dfTreatment : 0;
    const msError = dfError > 0 ? ssError / dfError : 0;

    // F-values
    const fRow = msError > 0 ? msRow / msError : 0;
    const fCol = msError > 0 ? msCol / msError : 0;
    const fTreatment = msError > 0 ? msTreatment / msError : 0;

    // P-values
    const pRow = dfRow > 0 && dfError > 0
      ? 1 - fDistributionCdf(fRow, dfRow, dfError) : NaN;
    const pCol = dfCol > 0 && dfError > 0
      ? 1 - fDistributionCdf(fCol, dfCol, dfError) : NaN;
    const pTreatment = dfTreatment > 0 && dfError > 0
      ? 1 - fDistributionCdf(fTreatment, dfTreatment, dfError) : NaN;

    return {
      N, grandMean,
      rowLevels, colLevels, treatmentLevels,
      treatmentGroups,
      ssRow, ssCol, ssTreatment, ssError, ssTotal,
      dfRow, dfCol, dfTreatment, dfError, dfTotal,
      msRow, msCol, msTreatment, msError,
      fRow, fCol, fTreatment,
      pRow, pCol, pTreatment,
    };
  }

  function renderLatinSquareOneWayResults(result, skippedCount, rowLabel, colLabel, treatmentLabel, valueLabel, postHocTests) {
    const sigTrt = computeSignificance(result.pTreatment);
    const sigRow = computeSignificance(result.pRow);
    const sigCol = computeSignificance(result.pCol);

    const ssModel = result.ssRow + result.ssCol + result.ssTreatment;
    const rSq = result.ssTotal > 0 ? (ssModel / result.ssTotal) * 100 : 0;
    const rSqAdj = result.ssTotal > 0 && result.dfTotal > 0 && result.dfError > 0
      ? (1 - (result.ssError / result.dfError) / (result.ssTotal / result.dfTotal)) * 100 : 0;
    const cv = Math.abs(result.grandMean) > 1e-12
      ? (Math.sqrt(result.msError) / Math.abs(result.grandMean)) * 100
      : NaN;

    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">ANOVA Latin Square: ${escapeHtml(valueLabel)} versus ${escapeHtml(treatmentLabel)}</div>
        <div class="analysis-result-subtitle">Method: Latin Square Design &nbsp;|&nbsp; Factor: 1 &nbsp;|&nbsp; Treatment: ${sigTrt} &nbsp;|&nbsp; Row: ${sigRow} &nbsp;|&nbsp; Column: ${sigCol}</div>

        <table class="analysis-anova-table">
          <thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th></tr></thead>
          <tbody>
            <tr>
              <td>${escapeHtml(rowLabel)} (Row)</td>
              <td>${result.dfRow}</td>
              <td>${formatNumber(result.ssRow)}</td>
              <td>${formatNumber(result.msRow)}</td>
              <td>${formatNumber(result.fRow)}</td>
              <td>${formatNumber(result.pRow, 6)}</td>
            </tr>
            <tr>
              <td>${escapeHtml(colLabel)} (Column)</td>
              <td>${result.dfCol}</td>
              <td>${formatNumber(result.ssCol)}</td>
              <td>${formatNumber(result.msCol)}</td>
              <td>${formatNumber(result.fCol)}</td>
              <td>${formatNumber(result.pCol, 6)}</td>
            </tr>
            <tr>
              <td>${escapeHtml(treatmentLabel)}</td>
              <td>${result.dfTreatment}</td>
              <td>${formatNumber(result.ssTreatment)}</td>
              <td>${formatNumber(result.msTreatment)}</td>
              <td>${formatNumber(result.fTreatment)}</td>
              <td>${formatNumber(result.pTreatment, 6)}</td>
            </tr>
            <tr><td>Error</td><td>${result.dfError}</td><td>${formatNumber(result.ssError)}</td><td>${formatNumber(result.msError)}</td><td></td><td></td></tr>
            <tr class="analysis-anova-total-row"><td>Total</td><td>${result.dfTotal}</td><td>${formatNumber(result.ssTotal)}</td><td></td><td></td><td></td></tr>
          </tbody>
        </table>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Model Summary</div>
        <table class="analysis-anova-table analysis-summary-table">
          <thead><tr><th>S</th><th>CV (%)</th><th>R-sq</th><th>R-sq (adj)</th></tr></thead>
          <tbody><tr>
            <td>${formatNumber(Math.sqrt(result.msError))}</td>
            <td>${formatNumber(cv, 2)}%</td>
            <td>${formatNumber(rSq, 2)}%</td>
            <td>${formatNumber(rSqAdj, 2)}%</td>
          </tr></tbody>
        </table>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Treatment Means</div>
        <table class="analysis-anova-table analysis-means-table">
          <thead><tr><th>${escapeHtml(treatmentLabel)}</th><th>N</th><th>Mean</th><th>StDev</th></tr></thead>
          <tbody>
            ${result.treatmentGroups.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td>${g.n}</td><td>${formatNumber(g.mean)}</td><td>${formatNumber(computeStdDev(g.values, g.mean))}</td></tr>`).join("")}
          </tbody>
        </table>

        ${typeof app._postHocUtils?.runPostHocForGroups === "function"
          ? app._postHocUtils.runPostHocForGroups(result.treatmentGroups, result.msError, result.dfError, postHocTests || [], treatmentLabel)
          : ""}

        ${skippedCount > 0 ? `<div class="analysis-result-note">Note: ${skippedCount} rows were excluded (blank or non-numeric value).</div>` : ""}
      </div>
    `;

    if (typeof app.pushResultTab === "function") {
      app.pushResultTab({
        label: `${valueLabel} vs ${treatmentLabel} (LSD)`,
        title: `Latin Square / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Factorial Latin Square (multi-factor + row block + column block)
  // ═══════════════════════════════════════════════════════

  function computeLatinSquareFactorial(data, factorNames) {
    const factorCount = factorNames.length;
    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

    const rowLevels = [...new Set(data.map((d) => d.row))].sort();
    const colLevels = [...new Set(data.map((d) => d.col))].sort();
    const levels = factorNames.map((_, fi) => {
      const unique = [...new Set(data.map((d) => d.factors[fi]))];
      unique.sort();
      return unique;
    });

    const r = rowLevels.length;
    const c = colLevels.length;

    // Row means
    const rowMeans = new Map();
    rowLevels.forEach((rv) => {
      const vals = data.filter((d) => d.row === rv).map((d) => d.value);
      rowMeans.set(rv, vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // Column means
    const colMeans = new Map();
    colLevels.forEach((cv) => {
      const vals = data.filter((d) => d.col === cv).map((d) => d.value);
      colMeans.set(cv, vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // Factor marginal means
    const factorMeans = factorNames.map((_, fi) => {
      const meansMap = new Map();
      levels[fi].forEach((level) => {
        const vals = data.filter((d) => d.factors[fi] === level).map((d) => d.value);
        meansMap.set(level, vals.reduce((s, v) => s + v, 0) / vals.length);
      });
      return meansMap;
    });

    // Cell map (treatment combination → values)
    const cellMap = new Map();
    data.forEach((d) => {
      const cellKey = d.factors.join("|");
      if (!cellMap.has(cellKey)) cellMap.set(cellKey, []);
      cellMap.get(cellKey).push(d.value);
    });

    // Cell means
    const cellMeans = new Map();
    cellMap.forEach((values, key) => {
      cellMeans.set(key, values.reduce((s, v) => s + v, 0) / values.length);
    });

    // SS Total
    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - grandMean, 2), 0);

    // SS Row
    const ssRow = c * rowLevels.reduce((s, rv) =>
      s + Math.pow(rowMeans.get(rv) - grandMean, 2), 0);

    // SS Column
    const ssCol = r * colLevels.reduce((s, cv) =>
      s + Math.pow(colMeans.get(cv) - grandMean, 2), 0);

    // SS for each main effect
    const ssMainEffects = factorNames.map((_, fi) => {
      let ss = 0;
      levels[fi].forEach((level) => {
        const vals = data.filter((d) => d.factors[fi] === level);
        const mean = factorMeans[fi].get(level);
        ss += vals.length * Math.pow(mean - grandMean, 2);
      });
      return ss;
    });

    // SS Interactions
    const interactions = [];
    if (factorCount === 2) {
      let ssAB = 0;
      levels[0].forEach((lA) => {
        levels[1].forEach((lB) => {
          const cellKey = `${lA}|${lB}`;
          const cm = cellMeans.get(cellKey);
          if (cm == null) return;
          const cellN = cellMap.get(cellKey)?.length || 0;
          const expectedMean = factorMeans[0].get(lA) + factorMeans[1].get(lB) - grandMean;
          ssAB += cellN * Math.pow(cm - expectedMean, 2);
        });
      });
      interactions.push({
        label: `${factorNames[0]} × ${factorNames[1]}`,
        ss: ssAB,
        df: (levels[0].length - 1) * (levels[1].length - 1),
      });
    } else if (factorCount === 3) {
      const pairs = [[0, 1], [0, 2], [1, 2]];
      pairs.forEach(([fi, fj]) => {
        let ssIJ = 0;
        levels[fi].forEach((li) => {
          levels[fj].forEach((lj) => {
            const vals = data.filter((d) => d.factors[fi] === li && d.factors[fj] === lj);
            if (vals.length === 0) return;
            const cellMean = vals.reduce((s, d) => s + d.value, 0) / vals.length;
            const expected = factorMeans[fi].get(li) + factorMeans[fj].get(lj) - grandMean;
            ssIJ += vals.length * Math.pow(cellMean - expected, 2);
          });
        });
        interactions.push({
          label: `${factorNames[fi]} × ${factorNames[fj]}`,
          ss: ssIJ,
          df: (levels[fi].length - 1) * (levels[fj].length - 1),
        });
      });

      // 3-way interaction from residual
      const dfThreeWay = levels.reduce((p, l) => p * (l.length - 1), 1);
      const allTreatmentSS = ssMainEffects.reduce((s, v) => s + v, 0) +
        interactions.reduce((s, i) => s + i.ss, 0);
      let ssWithinCell = 0;
      cellMap.forEach((values, key) => {
        const cm = cellMeans.get(key);
        values.forEach((v) => { ssWithinCell += Math.pow(v - cm, 2); });
      });
      const ssThreeWay = Math.max(0, ssTotal - ssRow - ssCol - allTreatmentSS - ssWithinCell);
      interactions.push({
        label: `${factorNames[0]} × ${factorNames[1]} × ${factorNames[2]}`,
        ss: ssThreeWay,
        df: dfThreeWay,
      });
    }

    // Degrees of freedom
    const dfRow = r - 1;
    const dfCol = c - 1;
    const dfMainEffects = levels.map((l) => l.length - 1);
    const dfInteractions = interactions.map((i) => i.df);
    const dfTotal = N - 1;

    const ssAllTreatment = ssMainEffects.reduce((s, v) => s + v, 0) +
      interactions.reduce((s, i) => s + i.ss, 0);
    const ssError = Math.max(0, ssTotal - ssRow - ssCol - ssAllTreatment);
    const dfError = dfTotal - dfRow - dfCol -
      dfMainEffects.reduce((s, v) => s + v, 0) -
      dfInteractions.reduce((s, v) => s + v, 0);

    // Mean squares & F-values for row/col blocks
    const msError = dfError > 0 ? ssError / dfError : 0;
    const msRow = dfRow > 0 ? ssRow / dfRow : 0;
    const msCol = dfCol > 0 ? ssCol / dfCol : 0;
    const fRow = msError > 0 ? msRow / msError : 0;
    const fCol = msError > 0 ? msCol / msError : 0;
    const pRow = dfRow > 0 && dfError > 0
      ? 1 - fDistributionCdf(fRow, dfRow, dfError) : NaN;
    const pCol = dfCol > 0 && dfError > 0
      ? 1 - fDistributionCdf(fCol, dfCol, dfError) : NaN;

    const mainEffectResults = factorNames.map((name, fi) => {
      const ms = dfMainEffects[fi] > 0 ? ssMainEffects[fi] / dfMainEffects[fi] : 0;
      const f = msError > 0 ? ms / msError : 0;
      const p = dfMainEffects[fi] > 0 && dfError > 0
        ? 1 - fDistributionCdf(f, dfMainEffects[fi], dfError) : NaN;
      return { label: name, ss: ssMainEffects[fi], df: dfMainEffects[fi], ms, f, p };
    });

    const interactionResults = interactions.map((inter) => {
      const ms = inter.df > 0 ? inter.ss / inter.df : 0;
      const f = msError > 0 ? ms / msError : 0;
      const p = inter.df > 0 && dfError > 0
        ? 1 - fDistributionCdf(f, inter.df, dfError) : NaN;
      return { ...inter, ms, f, p };
    });

    return {
      N, grandMean,
      rowLevels, colLevels, levels, factorNames, factorMeans,
      mainEffects: mainEffectResults,
      interactions: interactionResults,
      ssRow, dfRow, msRow, fRow, pRow,
      ssCol, dfCol, msCol, fCol, pCol,
      ssError, dfError, msError,
      ssTotal, dfTotal,
      cellMap, cellMeans,
    };
  }

  function renderLatinSquareFactorialResults(result, skippedCount, rowLabel, colLabel, factorLabels, valueLabel, postHocTests) {
    const factorDesc = factorLabels.join(" × ");

    let anovaRows = "";

    // Row block
    anovaRows += `<tr>
      <td>${escapeHtml(rowLabel)} (Row)</td>
      <td>${result.dfRow}</td>
      <td>${formatNumber(result.ssRow)}</td>
      <td>${formatNumber(result.msRow)}</td>
      <td>${formatNumber(result.fRow)}</td>
      <td>${formatNumber(result.pRow, 6)}</td>
    </tr>`;

    // Column block
    anovaRows += `<tr>
      <td>${escapeHtml(colLabel)} (Column)</td>
      <td>${result.dfCol}</td>
      <td>${formatNumber(result.ssCol)}</td>
      <td>${formatNumber(result.msCol)}</td>
      <td>${formatNumber(result.fCol)}</td>
      <td>${formatNumber(result.pCol, 6)}</td>
    </tr>`;

    // Main effects
    result.mainEffects.forEach((me) => {
      anovaRows += `<tr>
        <td>${escapeHtml(me.label)}</td>
        <td>${me.df}</td>
        <td>${formatNumber(me.ss)}</td>
        <td>${formatNumber(me.ms)}</td>
        <td>${formatNumber(me.f)}</td>
        <td>${formatNumber(me.p, 6)}</td>
      </tr>`;
    });

    // Interactions
    result.interactions.forEach((inter) => {
      anovaRows += `<tr>
        <td>${escapeHtml(inter.label)}</td>
        <td>${inter.df}</td>
        <td>${formatNumber(inter.ss)}</td>
        <td>${formatNumber(inter.ms)}</td>
        <td>${formatNumber(inter.f)}</td>
        <td>${formatNumber(inter.p, 6)}</td>
      </tr>`;
    });

    anovaRows += `<tr><td>Error</td><td>${result.dfError}</td><td>${formatNumber(result.ssError)}</td><td>${formatNumber(result.msError)}</td><td></td><td></td></tr>`;
    anovaRows += `<tr class="analysis-anova-total-row"><td>Total</td><td>${result.dfTotal}</td><td>${formatNumber(result.ssTotal)}</td><td></td><td></td><td></td></tr>`;

    // Significance summary
    const sigParts = [
      `Row: ${computeSignificance(result.pRow)}`,
      `Col: ${computeSignificance(result.pCol)}`,
      ...result.mainEffects.map((me) => `${me.label}: ${computeSignificance(me.p)}`),
      ...result.interactions.map((inter) => `${inter.label}: ${computeSignificance(inter.p)}`),
    ];

    // Model summary
    const ssModel = result.ssTotal - result.ssError;
    const rSq = result.ssTotal > 0 ? (ssModel / result.ssTotal) * 100 : 0;
    const rSqAdj = result.ssTotal > 0 && result.dfTotal > 0 && result.dfError > 0
      ? (1 - (result.ssError / result.dfError) / (result.ssTotal / result.dfTotal)) * 100 : 0;
    const cv = Math.abs(result.grandMean) > 1e-12
      ? (Math.sqrt(result.msError) / Math.abs(result.grandMean)) * 100
      : NaN;

    // Means tables per factor (with post hoc)
    let meansTables = "";
    const postHoc = app._postHocUtils;
    result.factorNames.forEach((name, fi) => {
      const levs = result.levels[fi];
      let rows = "";
      const factorGroups = [];
      levs.forEach((level) => {
        const vals = [];
        result.cellMap.forEach((cellValues, cellKey) => {
          const parts = cellKey.split("|");
          if (parts[fi] === level) vals.push(...cellValues);
        });
        const mean = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        const std = computeStdDev(vals, mean);
        rows += `<tr><td>${escapeHtml(level)}</td><td>${vals.length}</td><td>${formatNumber(mean)}</td><td>${formatNumber(std)}</td></tr>`;
        factorGroups.push({ name: level, values: vals, n: vals.length, mean });
      });
      meansTables += `
        <div class="analysis-result-subtitle" style="margin-top:1rem">Means: ${escapeHtml(name)}</div>
        <table class="analysis-anova-table analysis-means-table">
          <thead><tr><th>${escapeHtml(name)}</th><th>N</th><th>Mean</th><th>StDev</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      // Post hoc for this factor
      if (typeof postHoc?.runPostHocForGroups === "function") {
        meansTables += postHoc.runPostHocForGroups(factorGroups, result.msError, result.dfError, postHocTests || [], name);
      }
    });

    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">Factorial ANOVA Latin Square: ${escapeHtml(valueLabel)} versus ${escapeHtml(factorDesc)}</div>
        <div class="analysis-result-subtitle">Method: Latin Square Design &nbsp;|&nbsp; Factors: ${result.factorNames.length} &nbsp;|&nbsp; ${sigParts.join(" &nbsp;|&nbsp; ")}</div>

        <table class="analysis-anova-table">
          <thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th></tr></thead>
          <tbody>${anovaRows}</tbody>
        </table>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Model Summary</div>
        <table class="analysis-anova-table analysis-summary-table">
          <thead><tr><th>S</th><th>CV (%)</th><th>R-sq</th><th>R-sq (adj)</th></tr></thead>
          <tbody><tr>
            <td>${formatNumber(Math.sqrt(result.msError))}</td>
            <td>${formatNumber(cv, 2)}%</td>
            <td>${formatNumber(rSq, 2)}%</td>
            <td>${formatNumber(rSqAdj, 2)}%</td>
          </tr></tbody>
        </table>

        ${meansTables}

        ${skippedCount > 0 ? `<div class="analysis-result-note">Note: ${skippedCount} rows were excluded (blank or non-numeric value).</div>` : ""}
      </div>
    `;

    if (typeof app.pushResultTab === "function") {
      app.pushResultTab({
        label: `${valueLabel} vs ${factorDesc} (LSD)`,
        title: `Latin Square Factorial / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Entry point
  // ═══════════════════════════════════════════════════════

  function runAnovaLatinSquare(context) {
    const { assignedColumns, factorCount, postHocTests, rows, applyFilters, applySort } = context;
    const numFactors = Number(factorCount) || 1;
    const preparedRows = applySort(applyFilters(rows));

    // Row and Column blocking columns are always required
    const rowCol = assignedColumns["row-block"];
    const colCol = assignedColumns["col-block"];
    const valueCol = assignedColumns["value"];

    if (!rowCol) {
      if (typeof showToast === "function") showToast("Please assign the Row block column.", "error");
      return;
    }
    if (!colCol) {
      if (typeof showToast === "function") showToast("Please assign the Column block column.", "error");
      return;
    }
    if (!valueCol) {
      if (typeof showToast === "function") showToast("Please assign the Response (Y) column.", "error");
      return;
    }

    if (numFactors === 1) {
      // Single-factor Latin Square
      const treatmentCol = assignedColumns["treatment"] || assignedColumns["factor-0"];
      if (!treatmentCol) {
        if (typeof showToast === "function") showToast("Please assign the Treatment column.", "error");
        return;
      }

      const data = [];
      let skippedCount = 0;

      preparedRows.forEach((row) => {
        const rv = String(row[rowCol.key] ?? "").trim();
        const cv = String(row[colCol.key] ?? "").trim();
        const treatment = String(row[treatmentCol.key] ?? "").trim();
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (!rv || !cv || !treatment || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ row: rv, col: cv, treatment, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      const distinctRows = new Set(data.map((d) => d.row));
      const distinctCols = new Set(data.map((d) => d.col));
      const distinctTreatments = new Set(data.map((d) => d.treatment));

      if (distinctRows.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 row blocks are required.", "error");
        return;
      }
      if (distinctCols.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 column blocks are required.", "error");
        return;
      }
      if (distinctTreatments.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 treatment groups are required.", "error");
        return;
      }

      const result = computeLatinSquareOneWay(data);
      renderLatinSquareOneWayResults(
        result, skippedCount,
        rowCol.label || "Row",
        colCol.label || "Column",
        treatmentCol.label || "Treatment",
        valueCol.label || "Value",
        postHocTests,
      );
    } else {
      // Multi-factor Latin Square
      const factorCols = [];
      for (let i = 0; i < numFactors; i++) {
        const col = assignedColumns[`factor-${i}`];
        if (!col) {
          if (typeof showToast === "function") {
            showToast(`Please assign Factor ${String.fromCharCode(65 + i)} column.`, "error");
          }
          return;
        }
        factorCols.push(col);
      }

      const data = [];
      let skippedCount = 0;

      preparedRows.forEach((row) => {
        const rv = String(row[rowCol.key] ?? "").trim();
        const cv = String(row[colCol.key] ?? "").trim();
        const factors = factorCols.map((fc) => String(row[fc.key] ?? "").trim());
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (!rv || !cv || factors.some((f) => !f) || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ row: rv, col: cv, factors, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      const distinctRows = new Set(data.map((d) => d.row));
      const distinctCols = new Set(data.map((d) => d.col));

      if (distinctRows.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 row blocks are required.", "error");
        return;
      }
      if (distinctCols.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 column blocks are required.", "error");
        return;
      }

      for (let i = 0; i < numFactors; i++) {
        const uniqueLevels = new Set(data.map((d) => d.factors[i]));
        if (uniqueLevels.size < 2) {
          if (typeof showToast === "function") {
            showToast(`Factor ${String.fromCharCode(65 + i)} must have at least 2 levels.`, "error");
          }
          return;
        }
      }

      const factorLabels = factorCols.map((fc) => fc.label || "Factor");
      const result = computeLatinSquareFactorial(data, factorLabels);
      renderLatinSquareFactorialResults(
        result, skippedCount,
        rowCol.label || "Row",
        colCol.label || "Column",
        factorLabels,
        valueCol.label || "Value",
        postHocTests,
      );
    }
  }

  function getLatinSquareDropzones(factorCount) {
    const n = Number(factorCount) || 1;

    const zones = [
      { id: "analysisRowBlockArea", role: "row-block", label: "Row Block" },
      { id: "analysisColBlockArea", role: "col-block", label: "Column Block" },
    ];

    if (n === 1) {
      zones.push({ id: "analysisTreatmentArea", role: "treatment", label: "Treatment" });
    } else {
      for (let i = 0; i < n; i++) {
        const letter = String.fromCharCode(65 + i);
        zones.push({
          id: `analysisFactor${letter}Area`,
          role: `factor-${i}`,
          label: `Factor ${letter}`,
        });
      }
    }

    zones.push({ id: "analysisValueArea", role: "value", label: "Response (Y)" });
    return zones;
  }

  app.registerType({
    id: "anova",
    designs: [
      {
        id: "latin-square",
        label: "Latin Square Design",
        supportedFactors: ["1", "2", "3"],
        run: runAnovaLatinSquare,
        getDropzones: getLatinSquareDropzones,
      },
    ],
  });
})();
