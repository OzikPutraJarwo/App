(function registerTTestModule() {
  const app = window.AnalysisApp;
  if (!app) throw new Error("AnalysisApp must be loaded before t-test module.");

  const utils = app._anovaUtils;
  if (!utils) throw new Error("ANOVA utilities (_anovaUtils from crd.js) must be loaded before t-test module.");

  const { regularizedBeta, formatNumber, computeSignificance, computeStdDev } = utils;

  // ═══════════════════════════════════════════════════════
  // T-Distribution utilities (reuse from posthoc if available)
  // ═══════════════════════════════════════════════════════

  function tDistCdf(t, df) {
    if (df <= 0 || !Number.isFinite(t)) return NaN;
    if (t === 0) return 0.5;
    const x = df / (df + t * t);
    const ibeta = regularizedBeta(x, df / 2, 0.5);
    return t > 0 ? 1 - 0.5 * ibeta : 0.5 * ibeta;
  }

  // ═══════════════════════════════════════════════════════
  // Independent Samples t-Test (two-tailed)
  //
  // Compares the means of exactly 2 groups / treatments.
  //
  // Two variants are computed:
  //   1. Equal variances assumed   (pooled / Student's t)
  //   2. Equal variances not assumed (Welch's t)
  //
  // Levene's test for equality of variances is also run so
  // the user can decide which row to interpret.
  // ═══════════════════════════════════════════════════════

  /**
   * Levene's test for equality of variances (mean-based).
   * Returns { F, df1, df2, p }.
   */
  function levenesTest(group1Values, group2Values) {
    const groups = [group1Values, group2Values];
    const k = groups.length;                       // always 2
    const N = group1Values.length + group2Values.length;

    // Deviation from group mean
    const deviations = groups.map((g) => {
      const m = g.reduce((s, v) => s + v, 0) / g.length;
      return g.map((v) => Math.abs(v - m));
    });

    const allDev = deviations.flat();
    const grandMean = allDev.reduce((s, v) => s + v, 0) / N;

    let ssB = 0;
    let ssW = 0;
    for (let i = 0; i < k; i++) {
      const ni = deviations[i].length;
      const mi = deviations[i].reduce((s, v) => s + v, 0) / ni;
      ssB += ni * Math.pow(mi - grandMean, 2);
      ssW += deviations[i].reduce((s, v) => s + Math.pow(v - mi, 2), 0);
    }

    const df1 = k - 1;          // 1
    const df2 = N - k;
    const F = df2 > 0 ? (ssB / df1) / (ssW / df2) : 0;

    // F-distribution p-value (reuse regularizedBeta)
    let p = NaN;
    if (df1 > 0 && df2 > 0 && F > 0) {
      const u = (df1 * F) / (df1 * F + df2);
      p = 1 - regularizedBeta(u, df1 / 2, df2 / 2);
    }

    return { F, df1, df2, p };
  }

  /**
   * Student's t-test (equal variances assumed — pooled).
   */
  function studentTTest(g1, g2) {
    const n1 = g1.length;
    const n2 = g2.length;
    const m1 = g1.reduce((s, v) => s + v, 0) / n1;
    const m2 = g2.reduce((s, v) => s + v, 0) / n2;

    const ss1 = g1.reduce((s, v) => s + Math.pow(v - m1, 2), 0);
    const ss2 = g2.reduce((s, v) => s + Math.pow(v - m2, 2), 0);

    const df = n1 + n2 - 2;
    const sp2 = (ss1 + ss2) / df;           // pooled variance
    const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));

    const t = se > 0 ? (m1 - m2) / se : 0;
    // Two-tailed p-value
    const p = 2 * (1 - tDistCdf(Math.abs(t), df));

    return { t, df, p, se, meanDiff: m1 - m2, sp2 };
  }

  /**
   * Welch's t-test (equal variances NOT assumed).
   */
  function welchTTest(g1, g2) {
    const n1 = g1.length;
    const n2 = g2.length;
    const m1 = g1.reduce((s, v) => s + v, 0) / n1;
    const m2 = g2.reduce((s, v) => s + v, 0) / n2;

    const s1sq = g1.reduce((s, v) => s + Math.pow(v - m1, 2), 0) / (n1 - 1);
    const s2sq = g2.reduce((s, v) => s + Math.pow(v - m2, 2), 0) / (n2 - 1);

    const se = Math.sqrt(s1sq / n1 + s2sq / n2);
    const t = se > 0 ? (m1 - m2) / se : 0;

    // Welch–Satterthwaite degrees of freedom
    const num = Math.pow(s1sq / n1 + s2sq / n2, 2);
    const den = Math.pow(s1sq / n1, 2) / (n1 - 1) + Math.pow(s2sq / n2, 2) / (n2 - 1);
    const df = den > 0 ? num / den : 0;

    const p = df > 0 ? 2 * (1 - tDistCdf(Math.abs(t), df)) : NaN;

    return { t, df, p, se, meanDiff: m1 - m2, s1sq, s2sq };
  }

  // ═══════════════════════════════════════════════════════
  // Run t-Test
  // ═══════════════════════════════════════════════════════

  function runTTest(context) {
    const { state, assignedColumns, rows, applyFilters, applySort } = context;

    // assignedColumns entries are objects: { key, label }
    const treatmentCol = assignedColumns["factor-0"] || null;
    const valueCol = assignedColumns["value"] || null;

    if (!treatmentCol || !valueCol) {
      if (typeof showToast === "function") {
        showToast("Please assign both Factor and Response columns.", "error");
      }
      return;
    }

    const treatmentLabel = treatmentCol.label || "Treatment";
    const valueLabel = valueCol.label || "Value";

    // Filter & sort rows
    const filteredRows = applySort(applyFilters(rows));

    // Build data
    const groupMap = new Map();
    let skippedCount = 0;

    filteredRows.forEach((row) => {
      const treatment = String(row[treatmentCol.key] ?? "").trim();
      const rawValue = row[valueCol.key];
      const value = Number(rawValue);

      if (!treatment || rawValue === "" || rawValue == null || Number.isNaN(value)) {
        skippedCount++;
        return;
      }

      if (!groupMap.has(treatment)) groupMap.set(treatment, []);
      groupMap.get(treatment).push(value);
    });

    const treatmentNames = [...groupMap.keys()];

    // ── Validation: exactly 2 treatments ──
    if (treatmentNames.length !== 2) {
      const msg = treatmentNames.length < 2
        ? `t-Test requires exactly 2 treatments, but only ${treatmentNames.length} was found. Please check your data.`
        : `t-Test requires exactly 2 treatments, but ${treatmentNames.length} were found (${treatmentNames.join(", ")}). Use ANOVA for more than 2 treatments.`;

      const content = `
        <div class="analysis-result-block">
          <div class="analysis-result-title">Independent Samples t-Test</div>
          <div class="analysis-result-warning">
            <span class="analysis-warning-icon">⚠</span> ${escapeHtml(msg)}
          </div>
        </div>
      `;

      if (typeof app.pushResultTab === "function") {
        app.pushResultTab({
          label: `${valueLabel} vs ${treatmentLabel}`,
          title: `t-Test / ${valueLabel}`,
          content,
        });
      }
      return;
    }

    // ── Compute ──
    const g1Name = treatmentNames[0];
    const g2Name = treatmentNames[1];
    const g1 = groupMap.get(g1Name);
    const g2 = groupMap.get(g2Name);

    // Each group needs ≥ 2 observations
    if (g1.length < 2 || g2.length < 2) {
      const content = `
        <div class="analysis-result-block">
          <div class="analysis-result-title">Independent Samples t-Test</div>
          <div class="analysis-result-warning">
            <span class="analysis-warning-icon">⚠</span> Each treatment must have at least 2 observations. ${escapeHtml(g1Name)}: n=${g1.length}, ${escapeHtml(g2Name)}: n=${g2.length}.
          </div>
        </div>
      `;
      if (typeof app.pushResultTab === "function") {
        app.pushResultTab({ label: `${valueLabel} vs ${treatmentLabel}`, title: `t-Test / ${valueLabel}`, content });
      }
      return;
    }

    const m1 = g1.reduce((s, v) => s + v, 0) / g1.length;
    const m2 = g2.reduce((s, v) => s + v, 0) / g2.length;
    const sd1 = computeStdDev(g1, m1);
    const sd2 = computeStdDev(g2, m2);

    const levene = levenesTest(g1, g2);
    const student = studentTTest(g1, g2);
    const welch = welchTTest(g1, g2);

    renderTTestResults({
      g1Name, g2Name, g1, g2, m1, m2, sd1, sd2,
      levene, student, welch,
      treatmentLabel, valueLabel, skippedCount,
    });
  }

  // ═══════════════════════════════════════════════════════
  // Render results
  // ═══════════════════════════════════════════════════════

  function renderTTestResults(r) {
    const sigStudent = computeSignificance(r.student.p);
    const sigWelch = computeSignificance(r.welch.p);
    const sigLevene = computeSignificance(r.levene.p);

    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">Independent Samples t-Test: ${escapeHtml(r.valueLabel)} versus ${escapeHtml(r.treatmentLabel)}</div>
        <div class="analysis-result-subtitle">Method: Two-sample t-test &nbsp;|&nbsp; Two-tailed</div>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Group Statistics</div>
        <table class="analysis-anova-table analysis-means-table">
          <thead>
            <tr><th>${escapeHtml(r.treatmentLabel)}</th><th>N</th><th>Mean</th><th>StDev</th><th>SE Mean</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(r.g1Name)}</td>
              <td>${r.g1.length}</td>
              <td>${formatNumber(r.m1)}</td>
              <td>${formatNumber(r.sd1)}</td>
              <td>${formatNumber(r.sd1 / Math.sqrt(r.g1.length))}</td>
            </tr>
            <tr>
              <td>${escapeHtml(r.g2Name)}</td>
              <td>${r.g2.length}</td>
              <td>${formatNumber(r.m2)}</td>
              <td>${formatNumber(r.sd2)}</td>
              <td>${formatNumber(r.sd2 / Math.sqrt(r.g2.length))}</td>
            </tr>
          </tbody>
        </table>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Levene's Test for Equality of Variances</div>
        <table class="analysis-anova-table">
          <thead><tr><th>F</th><th>DF1</th><th>DF2</th><th>P-Value</th><th>Sig.</th></tr></thead>
          <tbody>
            <tr>
              <td>${formatNumber(r.levene.F)}</td>
              <td>${r.levene.df1}</td>
              <td>${r.levene.df2}</td>
              <td>${formatNumber(r.levene.p, 6)}</td>
              <td>${sigLevene}</td>
            </tr>
          </tbody>
        </table>
        <div class="analysis-result-note" style="margin-bottom:0.4rem">
          ${r.levene.p >= 0.05
            ? "Variances are assumed equal (Levene p ≥ 0.05). Interpret the <b>Equal variances assumed</b> row."
            : "Variances are NOT equal (Levene p < 0.05). Interpret the <b>Equal variances not assumed</b> (Welch) row."}
        </div>

        <div class="analysis-result-subtitle" style="margin-top:1rem">Independent Samples Test</div>
        <table class="analysis-anova-table">
          <thead>
            <tr><th></th><th>t</th><th>DF</th><th>P-Value (2-tailed)</th><th>Mean Diff.</th><th>SE Diff.</th><th>Sig.</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Equal variances assumed</b></td>
              <td>${formatNumber(r.student.t)}</td>
              <td>${formatNumber(r.student.df, 0)}</td>
              <td>${formatNumber(r.student.p, 6)}</td>
              <td>${formatNumber(r.student.meanDiff)}</td>
              <td>${formatNumber(r.student.se)}</td>
              <td>${sigStudent}</td>
            </tr>
            <tr>
              <td><b>Equal variances not assumed</b></td>
              <td>${formatNumber(r.welch.t)}</td>
              <td>${formatNumber(r.welch.df, 2)}</td>
              <td>${formatNumber(r.welch.p, 6)}</td>
              <td>${formatNumber(r.welch.meanDiff)}</td>
              <td>${formatNumber(r.welch.se)}</td>
              <td>${sigWelch}</td>
            </tr>
          </tbody>
        </table>

        ${r.skippedCount > 0 ? `<div class="analysis-result-note" style="margin-top:0.75rem">Note: ${r.skippedCount} rows were excluded (blank or non-numeric value).</div>` : ""}
      </div>
    `;

    if (typeof app.pushResultTab === "function") {
      app.pushResultTab({
        label: `${r.valueLabel} vs ${r.treatmentLabel}`,
        title: `t-Test / ${r.valueLabel}`,
        content,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Dropzones (same as one-way CRD: 1 factor + 1 response)
  // ═══════════════════════════════════════════════════════

  function getTTestDropzones() {
    return [
      { id: "analysisFactor0Area", role: "factor-0", label: "Factor (Treatment)" },
      { id: "analysisValueArea", role: "value", label: "Response (Y)" },
    ];
  }

  // ═══════════════════════════════════════════════════════
  // Register type
  // ═══════════════════════════════════════════════════════

  app.registerType({
    id: "ttest",
    label: "t-Test",
    designs: [
      {
        id: "independent",
        label: "Independent Samples",
        supportedFactors: ["1"],
        run: runTTest,
        getDropzones: getTTestDropzones,
      },
    ],
  });
})();
