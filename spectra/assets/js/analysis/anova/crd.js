(function registerAnovaCrdModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before ANOVA modules.");
  }

  // ═══════════════════════════════════════════════════════
  // Shared math utilities
  // ═══════════════════════════════════════════════════════

  function betaContinuedFraction(a, b, x) {
    const maxIterations = 200;
    const epsilon = 1e-14;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const doubleIteration = 2 * iteration;
      let aa = (iteration * (b - iteration) * x) / ((qam + doubleIteration) * (a + doubleIteration));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      h *= d * c;

      aa = -((a + iteration) * (qab + iteration) * x) / ((a + doubleIteration) * (qap + doubleIteration));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < epsilon) break;
    }

    return h;
  }

  function naturalLogGamma(z) {
    const g = 7;
    const coefficients = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];

    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - naturalLogGamma(1 - z);
    }

    let adjustedZ = z - 1;
    let x = coefficients[0];
    for (let index = 1; index < g + 2; index += 1) {
      x += coefficients[index] / (adjustedZ + index);
    }
    const t = adjustedZ + g + 0.5;

    return 0.5 * Math.log(2 * Math.PI) + (adjustedZ + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function regularizedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    const logBeta = naturalLogGamma(a) + naturalLogGamma(b) - naturalLogGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - logBeta);

    if (x < (a + 1) / (a + b + 2)) {
      return (front * betaContinuedFraction(a, b, x)) / a;
    }

    return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
  }

  function fDistributionCdf(x, df1, df2) {
    if (x <= 0) return 0;
    const u = (df1 * x) / (df1 * x + df2);
    return regularizedBeta(u, df1 / 2, df2 / 2);
  }

  function formatNumber(value, decimals = 4) {
    if (value == null || Number.isNaN(value)) return "-";
    return Number(value).toFixed(decimals);
  }

  function computeSignificance(p) {
    if (Number.isNaN(p)) return "";
    if (p < 0.001) return "***";
    if (p < 0.01) return "**";
    if (p < 0.05) return "*";
    return "ns";
  }

  function computeStdDev(values, mean) {
    if (values.length < 2) return 0;
    const ss = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
    return Math.sqrt(ss / (values.length - 1));
  }

  // Export math utilities for other ANOVA modules (RCBD, Latin Square, etc.)
  app._anovaUtils = {
    betaContinuedFraction,
    naturalLogGamma,
    regularizedBeta,
    fDistributionCdf,
    formatNumber,
    computeSignificance,
    computeStdDev,
  };

  // ═══════════════════════════════════════════════════════
  // One-way CRD (1 factor)
  // ═══════════════════════════════════════════════════════

  function computeAnovaCrdOneWay(data) {
    const groupMap = new Map();
    data.forEach(({ treatment, value }) => {
      if (!groupMap.has(treatment)) groupMap.set(treatment, []);
      groupMap.get(treatment).push(value);
    });

    const groups = [...groupMap.entries()].map(([name, values]) => ({
      name,
      values,
      n: values.length,
      mean: values.reduce((s, v) => s + v, 0) / values.length,
    }));

    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;
    const a = groups.length;

    const ssTreatment = groups.reduce((s, g) => s + g.n * Math.pow(g.mean - grandMean, 2), 0);
    const ssError = groups.reduce(
      (s, g) => s + g.values.reduce((is, v) => is + Math.pow(v - g.mean, 2), 0), 0,
    );
    const ssTotal = ssTreatment + ssError;

    const dfTreatment = a - 1;
    const dfError = N - a;
    const dfTotal = N - 1;

    const msTreatment = dfTreatment > 0 ? ssTreatment / dfTreatment : 0;
    const msError = dfError > 0 ? ssError / dfError : 0;
    const fValue = msError > 0 ? msTreatment / msError : 0;
    const pValue = dfTreatment > 0 && dfError > 0
      ? 1 - fDistributionCdf(fValue, dfTreatment, dfError) : NaN;

    return {
      groups, N, grandMean,
      ssTreatment, ssError, ssTotal,
      dfTreatment, dfError, dfTotal,
      msTreatment, msError, fValue, pValue,
    };
  }

  function renderOneWayResults(result, skippedCount, treatmentLabel, valueLabel, postHocTests) {
    const sig = computeSignificance(result.pValue);
    const rSq = result.ssTotal > 0 ? (result.ssTreatment / result.ssTotal) * 100 : 0;
    const rSqAdj = result.ssTotal > 0 && result.dfTotal > 0
      ? (1 - (result.ssError / result.dfError) / (result.ssTotal / result.dfTotal)) * 100 : 0;
    const cv = Math.abs(result.grandMean) > 1e-12
      ? (Math.sqrt(result.msError) / Math.abs(result.grandMean)) * 100
      : NaN;

    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">One-way ANOVA: ${escapeHtml(valueLabel)} versus ${escapeHtml(treatmentLabel)}</div>
        <div class="analysis-result-subtitle">Method: Completely Randomized Design &nbsp;|&nbsp; Factor: 1 &nbsp;|&nbsp; Significance: ${sig}</div>

        <table class="analysis-anova-table">
          <thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th></tr></thead>
          <tbody>
            <tr>
              <td>${escapeHtml(treatmentLabel)}</td>
              <td>${result.dfTreatment}</td>
              <td>${formatNumber(result.ssTreatment)}</td>
              <td>${formatNumber(result.msTreatment)}</td>
              <td>${formatNumber(result.fValue)}</td>
              <td>${formatNumber(result.pValue, 6)}</td>
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

        <div class="analysis-result-subtitle" style="margin-top:1rem">Means</div>
        <table class="analysis-anova-table analysis-means-table">
          <thead><tr><th>${escapeHtml(treatmentLabel)}</th><th>N</th><th>Mean</th><th>StDev</th></tr></thead>
          <tbody>
            ${result.groups.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td>${g.n}</td><td>${formatNumber(g.mean)}</td><td>${formatNumber(computeStdDev(g.values, g.mean))}</td></tr>`).join("")}
          </tbody>
        </table>

        ${typeof app._postHocUtils?.runPostHocForGroups === "function"
          ? app._postHocUtils.runPostHocForGroups(result.groups, result.msError, result.dfError, postHocTests || [], treatmentLabel)
          : ""}

        ${skippedCount > 0 ? `<div class="analysis-result-note">Note: ${skippedCount} rows were excluded (blank or non-numeric value).</div>` : ""}
      </div>
    `;

    if (typeof app.pushResultTab === "function") {
      app.pushResultTab({
        label: `${valueLabel} vs ${treatmentLabel}`,
        title: `CRD / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Factorial CRD (multi-factor: 2+ factors)
  // ═══════════════════════════════════════════════════════

  function computeAnovaCrdFactorial(data, factorNames) {
    const factorCount = factorNames.length;
    const N = data.length;
    const grandMean = data.reduce((s, d) => s + d.value, 0) / N;

    // Build cell map: key = "A|B|..." → values[]
    const cellMap = new Map();
    data.forEach((d) => {
      const cellKey = d.factors.join("|");
      if (!cellMap.has(cellKey)) cellMap.set(cellKey, []);
      cellMap.get(cellKey).push(d.value);
    });

    // Get unique levels for each factor
    const levels = factorNames.map((_, fi) => {
      const unique = [...new Set(data.map((d) => d.factors[fi]))];
      unique.sort();
      return unique;
    });

    // Compute factor marginal means
    const factorMeans = factorNames.map((_, fi) => {
      const meansMap = new Map();
      levels[fi].forEach((level) => {
        const vals = data.filter((d) => d.factors[fi] === level).map((d) => d.value);
        meansMap.set(level, vals.reduce((s, v) => s + v, 0) / vals.length);
      });
      return meansMap;
    });

    // Compute cell means
    const cellMeans = new Map();
    cellMap.forEach((values, key) => {
      cellMeans.set(key, values.reduce((s, v) => s + v, 0) / values.length);
    });

    // SS Total
    const ssTotal = data.reduce((s, d) => s + Math.pow(d.value - grandMean, 2), 0);

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

    // SS Error (within cells)
    let ssError = 0;
    cellMap.forEach((values, key) => {
      const cm = cellMeans.get(key);
      values.forEach((v) => {
        ssError += Math.pow(v - cm, 2);
      });
    });

    // SS Interaction (for 2 factors)
    const interactions = [];
    if (factorCount === 2) {
      // Two-way interaction A×B
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

      const dfAB = (levels[0].length - 1) * (levels[1].length - 1);
      interactions.push({
        label: `${factorNames[0]} × ${factorNames[1]}`,
        ss: ssAB,
        df: dfAB,
      });
    } else if (factorCount === 3) {
      // Three-factor: compute 2-way interactions and 3-way interaction
      // A×B, A×C, B×C, A×B×C
      const pairs = [[0, 1], [0, 2], [1, 2]];
      let ssAllInteractions = ssTotal - ssMainEffects.reduce((s, v) => s + v, 0) - ssError;

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
        const dfIJ = (levels[fi].length - 1) * (levels[fj].length - 1);
        interactions.push({
          label: `${factorNames[fi]} × ${factorNames[fj]}`,
          ss: ssIJ,
          df: dfIJ,
        });
      });

      // 3-way interaction: residual from model
      const ssThreeWay = ssAllInteractions - interactions.reduce((s, i) => s + i.ss, 0);
      const dfThreeWay = levels.reduce((p, l) => p * (l.length - 1), 1);
      interactions.push({
        label: `${factorNames[0]} × ${factorNames[1]} × ${factorNames[2]}`,
        ss: Math.max(0, ssThreeWay),
        df: dfThreeWay,
      });
    }

    // Degrees of freedom
    const dfMainEffects = levels.map((l) => l.length - 1);
    const dfError = N - cellMap.size;
    const dfTotal = N - 1;

    // Compute F-values and p-values
    const msError = dfError > 0 ? ssError / dfError : 0;

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
      N, grandMean, levels, factorNames, factorMeans,
      mainEffects: mainEffectResults,
      interactions: interactionResults,
      ssError, dfError, msError,
      ssTotal, dfTotal,
      cellMap, cellMeans,
    };
  }

  function renderFactorialResults(result, skippedCount, factorLabels, valueLabel, postHocTests) {
    const factorDesc = factorLabels.join(" × ");

    // Build ANOVA table rows
    let anovaRows = "";
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
      ...result.mainEffects.map((me) => `${me.label}: ${computeSignificance(me.p)}`),
      ...result.interactions.map((inter) => `${inter.label}: ${computeSignificance(inter.p)}`),
    ];

    // Model summary
    const ssModel = result.ssTotal - result.ssError;
    const rSq = result.ssTotal > 0 ? (ssModel / result.ssTotal) * 100 : 0;
    const dfModel = result.dfTotal - result.dfError;
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
        <div class="analysis-result-title">Factorial ANOVA: ${escapeHtml(valueLabel)} versus ${escapeHtml(factorDesc)}</div>
        <div class="analysis-result-subtitle">Method: Completely Randomized Design &nbsp;|&nbsp; Factors: ${result.factorNames.length} &nbsp;|&nbsp; ${sigParts.join(" &nbsp;|&nbsp; ")}</div>

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
        label: `${valueLabel} vs ${factorDesc}`,
        title: `CRD Factorial / ${valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Entry point
  // ═══════════════════════════════════════════════════════

  function runAnovaCrd(context) {
    const { assignedColumns, factorCount, postHocTests, rows, applyFilters, applySort } = context;
    const numFactors = Number(factorCount) || 1;
    const preparedRows = applySort(applyFilters(rows));

    if (numFactors === 1) {
      // Single-factor CRD
      const treatmentCol = assignedColumns["treatment"] || assignedColumns["factor-0"];
      const valueCol = assignedColumns["value"];

      if (!treatmentCol || !valueCol) {
        if (typeof showToast === "function") showToast("Please assign both Treatment and Value columns.", "error");
        return;
      }

      const data = [];
      let skippedCount = 0;

      preparedRows.forEach((row) => {
        const treatment = String(row[treatmentCol.key] ?? "").trim();
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (!treatment || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ treatment, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      const distinctGroups = new Set(data.map((d) => d.treatment));
      if (distinctGroups.size < 2) {
        if (typeof showToast === "function") showToast("At least 2 treatment groups are required.", "error");
        return;
      }

      const result = computeAnovaCrdOneWay(data);
      renderOneWayResults(result, skippedCount, treatmentCol.label || "Treatment", valueCol.label || "Value", postHocTests);
    } else {
      // Multi-factor (factorial) CRD
      const factorCols = [];
      for (let i = 0; i < numFactors; i++) {
        const col = assignedColumns[`factor-${i}`];
        if (!col) {
          if (typeof showToast === "function") showToast(`Please assign Factor ${String.fromCharCode(65 + i)} column.`, "error");
          return;
        }
        factorCols.push(col);
      }

      const valueCol = assignedColumns["value"];
      if (!valueCol) {
        if (typeof showToast === "function") showToast("Please assign Value column.", "error");
        return;
      }

      const data = [];
      let skippedCount = 0;

      preparedRows.forEach((row) => {
        const factors = factorCols.map((fc) => String(row[fc.key] ?? "").trim());
        const rawValue = row[valueCol.key];
        const numericValue = Number(rawValue);

        if (factors.some((f) => !f) || rawValue === "" || rawValue == null || Number.isNaN(numericValue)) {
          skippedCount += 1;
          return;
        }
        data.push({ factors, value: numericValue });
      });

      if (data.length < 3) {
        if (typeof showToast === "function") showToast("Not enough valid numeric data for ANOVA.", "error");
        return;
      }

      // Check at least 2 levels per factor
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
      const result = computeAnovaCrdFactorial(data, factorLabels);
      renderFactorialResults(result, skippedCount, factorLabels, valueCol.label || "Value", postHocTests);
    }
  }

  function getCrdDropzones(factorCount) {
    const n = Number(factorCount) || 1;

    if (n === 1) {
      return [
        { id: "analysisTreatmentArea", role: "treatment", label: "Treatment" },
        { id: "analysisValueArea", role: "value", label: "Response (Y)" },
      ];
    }

    const zones = [];
    for (let i = 0; i < n; i++) {
      const letter = String.fromCharCode(65 + i);
      zones.push({
        id: `analysisFactor${letter}Area`,
        role: `factor-${i}`,
        label: `Factor ${letter}`,
      });
    }
    zones.push({ id: "analysisValueArea", role: "value", label: "Response (Y)" });
    return zones;
  }

  app.registerType({
    id: "anova",
    label: "ANOVA & Post Hoc",
    designs: [
      {
        id: "crd",
        label: "Completely Randomized Design",
        supportedFactors: ["1", "2", "3"],
        run: runAnovaCrd,
        getDropzones: getCrdDropzones,
      },
    ],
  });
})();
