(function registerAnovaRcbdModule() {
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
  // One-way RCBD (1 treatment factor + block)
  // ═══════════════════════════════════════════════════════

  function computeRcbdOneWay(data) {
    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

    // Unique blocks and treatments
    const blockLevels = [...new Set(data.map((d) => d.block))].sort();
    const treatmentLevels = [...new Set(data.map((d) => d.treatment))].sort();

    const b = blockLevels.length;
    const t = treatmentLevels.length;

    // Block means
    const blockMeans = new Map();
    blockLevels.forEach((blk) => {
      const vals = data.filter((d) => d.block === blk).map((d) => d.value);
      blockMeans.set(blk, vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // Treatment means
    const treatmentMeans = new Map();
    const treatmentGroups = [];
    treatmentLevels.forEach((trt) => {
      const vals = data.filter((d) => d.treatment === trt).map((d) => d.value);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      treatmentMeans.set(trt, mean);
      treatmentGroups.push({ name: trt, values: vals, n: vals.length, mean });
    });

    // SS Block
    const ssBlock = treatmentLevels.length * blockLevels.reduce((s, blk) => {
      return s + Math.pow(blockMeans.get(blk) - grandMean, 2);
    }, 0);

    // SS Treatment
    const ssTreatment = blockLevels.length * treatmentLevels.reduce((s, trt) => {
      return s + Math.pow(treatmentMeans.get(trt) - grandMean, 2);
    }, 0);

    // SS Total
    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - grandMean, 2), 0);

    // SS Error
    const ssError = ssTotal - ssBlock - ssTreatment;

    // Degrees of freedom
    const dfBlock = b - 1;
    const dfTreatment = t - 1;
    const dfError = (b - 1) * (t - 1);
    const dfTotal = N - 1;

    // Mean squares
    const msBlock = dfBlock > 0 ? ssBlock / dfBlock : 0;
    const msTreatment = dfTreatment > 0 ? ssTreatment / dfTreatment : 0;
    const msError = dfError > 0 ? ssError / dfError : 0;

    // F-values
    const fBlock = msError > 0 ? msBlock / msError : 0;
    const fTreatment = msError > 0 ? msTreatment / msError : 0;

    // P-values
    const pBlock = dfBlock > 0 && dfError > 0
      ? 1 - fDistributionCdf(fBlock, dfBlock, dfError) : NaN;
    const pTreatment = dfTreatment > 0 && dfError > 0
      ? 1 - fDistributionCdf(fTreatment, dfTreatment, dfError) : NaN;

    return {
      N, grandMean,
      blockLevels, treatmentLevels,
      treatmentGroups,
      ssBlock, ssTreatment, ssError, ssTotal,
      dfBlock, dfTreatment, dfError, dfTotal,
      msBlock, msTreatment, msError,
      fBlock, fTreatment,
      pBlock, pTreatment,
    };
  }

  function renderRcbdOneWayResults(result, skippedCount, blockLabel, treatmentLabel, valueLabel, postHocTests) {
    const sigTreatment = computeSignificance(result.pTreatment);
    const sigBlock = computeSignificance(result.pBlock);

    const rSq = result.ssTotal > 0
      ? ((result.ssBlock + result.ssTreatment) / result.ssTotal) * 100 : 0;
    const rSqAdj = result.ssTotal > 0 && result.dfTotal > 0 && result.dfError > 0
      ? (1 - (result.ssError / result.dfError) / (result.ssTotal / result.dfTotal)) * 100 : 0;
    const cv = Math.abs(result.grandMean) > 1e-12
      ? (Math.sqrt(result.msError) / Math.abs(result.grandMean)) * 100
      : NaN;

    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">ANOVA RCBD: ${escapeHtml(valueLabel)} versus ${escapeHtml(treatmentLabel)}</div>
        <div class="analysis-result-subtitle">Method: Randomized Complete Block Design &nbsp;|&nbsp; Factor: 1 &nbsp;|&nbsp; Treatment: ${sigTreatment} &nbsp;|&nbsp; Block: ${sigBlock}</div>

        <table class="analysis-anova-table">
          <thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th></tr></thead>
          <tbody>
            <tr>
              <td>${escapeHtml(blockLabel)}</td>
              <td>${result.dfBlock}</td>
              <td>${formatNumber(result.ssBlock)}</td>
              <td>${formatNumber(result.msBlock)}</td>
              <td>${formatNumber(result.fBlock)}</td>
              <td>${formatNumber(result.pBlock, 6)}</td>
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
        label: `${valueLabel} vs ${treatmentLabel} (RCBD)`,
        title: `RCBD / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Factorial RCBD (multi-factor + block)
  // ═══════════════════════════════════════════════════════

  function computeRcbdFactorial(data, factorNames) {
    const factorCount = factorNames.length;
    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

    // Unique levels
    const blockLevels = [...new Set(data.map((d) => d.block))].sort();
    const levels = factorNames.map((_, fi) => {
      const unique = [...new Set(data.map((d) => d.factors[fi]))];
      unique.sort();
      return unique;
    });

    const b = blockLevels.length;

    // Block means
    const blockMeans = new Map();
    blockLevels.forEach((blk) => {
      const vals = data.filter((d) => d.block === blk).map((d) => d.value);
      blockMeans.set(blk, vals.reduce((s, v) => s + v, 0) / vals.length);
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

    // SS Block
    const treatmentCombinations = cellMap.size;
    const ssBlock = treatmentCombinations * blockLevels.reduce((s, blk) => {
      return s + Math.pow(blockMeans.get(blk) - grandMean, 2);
    }, 0);

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
      const ssThreeWay = Math.max(0, ssTotal - ssBlock - allTreatmentSS -
        // estimate error as within-cell variation
        (() => {
          let sse = 0;
          cellMap.forEach((values, key) => {
            const cm = cellMeans.get(key);
            values.forEach((v) => { sse += Math.pow(v - cm, 2); });
          });
          return sse;
        })());

      interactions.push({
        label: `${factorNames[0]} × ${factorNames[1]} × ${factorNames[2]}`,
        ss: ssThreeWay,
        df: dfThreeWay,
      });
    }

    // Degrees of freedom
    const dfBlock = b - 1;
    const dfMainEffects = levels.map((l) => l.length - 1);
    const dfInteractions = interactions.map((i) => i.df);
    const dfTotal = N - 1;

    const ssAllTreatment = ssMainEffects.reduce((s, v) => s + v, 0) +
      interactions.reduce((s, i) => s + i.ss, 0);
    const ssError = Math.max(0, ssTotal - ssBlock - ssAllTreatment);
    const dfError = dfTotal - dfBlock - dfMainEffects.reduce((s, v) => s + v, 0) -
      dfInteractions.reduce((s, v) => s + v, 0);

    const msError = dfError > 0 ? ssError / dfError : 0;
    const msBlock = dfBlock > 0 ? ssBlock / dfBlock : 0;
    const fBlock = msError > 0 ? msBlock / msError : 0;
    const pBlock = dfBlock > 0 && dfError > 0
      ? 1 - fDistributionCdf(fBlock, dfBlock, dfError) : NaN;

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
      blockLevels, levels, factorNames, factorMeans,
      mainEffects: mainEffectResults,
      interactions: interactionResults,
      ssBlock, dfBlock, msBlock, fBlock, pBlock,
      ssError, dfError, msError,
      ssTotal, dfTotal,
      cellMap, cellMeans,
    };
  }

  function renderRcbdFactorialResults(result, skippedCount, blockLabel, factorLabels, valueLabel, postHocTests) {
    const factorDesc = factorLabels.join(" × ");

    let anovaRows = "";

    // Block row
    anovaRows += `<tr>
      <td>${escapeHtml(blockLabel)}</td>
      <td>${result.dfBlock}</td>
      <td>${formatNumber(result.ssBlock)}</td>
      <td>${formatNumber(result.msBlock)}</td>
      <td>${formatNumber(result.fBlock)}</td>
      <td>${formatNumber(result.pBlock, 6)}</td>
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
      `Block: ${computeSignificance(result.pBlock)}`,
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
        <div class="analysis-result-title">Factorial ANOVA RCBD: ${escapeHtml(valueLabel)} versus ${escapeHtml(factorDesc)}</div>
        <div class="analysis-result-subtitle">Method: Randomized Complete Block Design &nbsp;|&nbsp; Factors: ${result.factorNames.length} &nbsp;|&nbsp; ${sigParts.join(" &nbsp;|&nbsp; ")}</div>

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
        label: `${valueLabel} vs ${factorDesc} (RCBD)`,
        title: `RCBD Factorial / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Entry point
  // ═══════════════════════════════════════════════════════

  function runAnovaRcbd(context) {
    const { assignedColumns, factorCount, postHocTests, rows, applyFilters, applySort } = context;
    const numFactors = Number(factorCount) || 1;
    const preparedRows = applySort(applyFilters(rows));

    // Block column is always required for RCBD
    const blockCol = assignedColumns["block"];
    if (!blockCol) {
      if (typeof showToast === "function") showToast("Please assign the Block column.", "error");
      return;
    }

    const valueCol = assignedColumns["value"];
    if (!valueCol) {
      if (typeof showToast === "function") showToast("Please assign the Response (Y) column.", "error");
      return;
    }

    if (numFactors === 1) {
      // Single-factor RCBD
      const treatmentCol = assignedColumns["treatment"] || assignedColumns["factor-0"];
      if (!treatmentCol) {
        if (typeof showToast === "function") showToast("Please assign the Treatment column.", "error");
        return;
      }

      const data = [];
      let skippedCount = 0;

      preparedRows.forEach((row) => {
        const block = String(row[blockCol.key] ?? "").trim();
        const treatment = String(row[treatmentCol.key] ?? "").trim();
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (!block || !treatment || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ block, treatment, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      const distinctBlocks = new Set(data.map((d) => d.block));
      const distinctTreatments = new Set(data.map((d) => d.treatment));

      if (distinctBlocks.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 blocks are required.", "error");
        return;
      }
      if (distinctTreatments.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 treatment groups are required.", "error");
        return;
      }

      const result = computeRcbdOneWay(data);
      renderRcbdOneWayResults(
        result, skippedCount,
        blockCol.label || "Block",
        treatmentCol.label || "Treatment",
        valueCol.label || "Value",
        postHocTests,
      );
    } else {
      // Multi-factor (factorial) RCBD
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
        const block = String(row[blockCol.key] ?? "").trim();
        const factors = factorCols.map((fc) => String(row[fc.key] ?? "").trim());
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (!block || factors.some((f) => !f) || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ block, factors, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      const distinctBlocks = new Set(data.map((d) => d.block));
      if (distinctBlocks.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 blocks are required.", "error");
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
      const result = computeRcbdFactorial(data, factorLabels);
      renderRcbdFactorialResults(
        result, skippedCount,
        blockCol.label || "Block",
        factorLabels,
        valueCol.label || "Value",
        postHocTests,
      );
    }
  }

  function getRcbdDropzones(factorCount) {
    const n = Number(factorCount) || 1;

    const zones = [
      { id: "analysisBlockArea", role: "block", label: "Block" },
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
        id: "rcbd",
        label: "Randomized Complete Block Design",
        supportedFactors: ["1", "2", "3"],
        run: runAnovaRcbd,
        getDropzones: getRcbdDropzones,
      },
    ],
  });
})();
