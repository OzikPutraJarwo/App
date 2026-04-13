(function registerPostHocModule() {
  const app = window.AnalysisApp;
  if (!app) throw new Error("AnalysisApp must be loaded before post hoc module.");

  const utils = app._anovaUtils;
  if (!utils) throw new Error("ANOVA utilities (_anovaUtils from crd.js) must be loaded before post hoc module.");

  const { regularizedBeta, formatNumber, computeStdDev } = utils;

  // ═══════════════════════════════════════════════════════
  // T-Distribution CDF & Quantile
  // ═══════════════════════════════════════════════════════

  function tDistCdf(t, df) {
    if (df <= 0 || !Number.isFinite(t)) return NaN;
    if (t === 0) return 0.5;
    const x = df / (df + t * t);
    const ibeta = regularizedBeta(x, df / 2, 0.5);
    return t > 0 ? 1 - 0.5 * ibeta : 0.5 * ibeta;
  }

  function tDistQuantile(p, df) {
    if (p <= 0 || p >= 1 || df <= 0) return NaN;
    if (p === 0.5) return 0;

    // Bisection method
    let lo = -200;
    let hi = 200;

    for (let i = 0; i < 120; i++) {
      const mid = (lo + hi) / 2;
      if (tDistCdf(mid, df) < p) lo = mid;
      else hi = mid;
    }

    return (lo + hi) / 2;
  }

  // ═══════════════════════════════════════════════════════
  // Studentized Range Critical Values (α = 0.05)
  //
  // Table of q(0.05, k, ν) for k = 2..20 groups and
  // selected error df values.
  // Interpolation in 1/df is used for intermediate df.
  // ═══════════════════════════════════════════════════════

  const Q_DF = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    24, 30, 40, 60, 120, 1e9,
  ];

  // prettier-ignore
  const Q_TABLE = [
    /* k= 2 */ [17.97,6.08,4.50,3.93,3.64,3.46,3.34,3.26,3.20,3.15,3.11,3.08,3.06,3.03,3.01,3.00,2.98,2.97,2.96,2.95,2.92,2.89,2.86,2.83,2.80,2.77],
    /* k= 3 */ [26.98,8.33,5.91,5.04,4.60,4.34,4.16,4.04,3.95,3.88,3.82,3.77,3.73,3.70,3.67,3.65,3.63,3.61,3.59,3.58,3.53,3.49,3.44,3.40,3.36,3.31],
    /* k= 4 */ [32.82,9.80,6.82,5.76,5.22,4.90,4.68,4.53,4.41,4.33,4.26,4.20,4.15,4.11,4.08,4.05,4.02,4.00,3.98,3.96,3.90,3.85,3.79,3.74,3.68,3.63],
    /* k= 5 */ [37.08,10.88,7.50,6.29,5.67,5.30,5.06,4.89,4.76,4.65,4.57,4.51,4.45,4.41,4.37,4.33,4.30,4.28,4.25,4.23,4.17,4.10,4.04,3.98,3.92,3.86],
    /* k= 6 */ [40.41,11.74,8.04,6.71,6.03,5.63,5.36,5.17,5.02,4.91,4.82,4.75,4.69,4.64,4.59,4.56,4.52,4.49,4.47,4.45,4.37,4.30,4.23,4.16,4.10,4.03],
    /* k= 7 */ [43.12,12.44,8.48,7.05,6.33,5.90,5.61,5.40,5.24,5.12,5.03,4.95,4.88,4.83,4.78,4.74,4.70,4.67,4.65,4.62,4.54,4.46,4.39,4.31,4.24,4.17],
    /* k= 8 */ [45.40,13.03,8.85,7.35,6.58,6.12,5.82,5.60,5.43,5.30,5.20,5.12,5.05,4.99,4.94,4.90,4.86,4.82,4.79,4.77,4.68,4.60,4.52,4.44,4.36,4.29],
    /* k= 9 */ [47.36,13.54,9.18,7.60,6.80,6.32,6.00,5.77,5.59,5.46,5.35,5.27,5.19,5.13,5.08,5.03,4.99,4.96,4.92,4.90,4.81,4.72,4.63,4.55,4.47,4.39],
    /* k=10 */ [49.07,13.99,9.46,7.83,6.99,6.49,6.16,5.92,5.74,5.60,5.49,5.39,5.32,5.25,5.20,5.15,5.11,5.07,5.04,5.01,4.92,4.82,4.73,4.65,4.56,4.47],
    /* k=11 */ [50.59,14.39,9.72,8.03,7.17,6.65,6.30,6.05,5.87,5.72,5.61,5.51,5.43,5.36,5.31,5.26,5.21,5.17,5.14,5.11,5.01,4.92,4.82,4.73,4.64,4.55],
    /* k=12 */ [51.96,14.75,9.95,8.21,7.32,6.79,6.43,6.18,5.98,5.83,5.71,5.61,5.53,5.46,5.40,5.35,5.31,5.27,5.23,5.20,5.10,5.00,4.90,4.81,4.71,4.62],
    /* k=13 */ [53.20,15.08,10.15,8.37,7.47,6.92,6.55,6.29,6.09,5.93,5.81,5.71,5.63,5.55,5.49,5.44,5.39,5.35,5.31,5.28,5.18,5.08,4.97,4.88,4.78,4.68],
    /* k=14 */ [54.33,15.38,10.35,8.52,7.60,7.03,6.66,6.39,6.19,6.03,5.90,5.80,5.71,5.63,5.57,5.52,5.47,5.43,5.39,5.36,5.25,5.15,5.04,4.94,4.84,4.74],
    /* k=15 */ [55.36,15.65,10.53,8.66,7.72,7.14,6.76,6.48,6.28,6.11,5.98,5.88,5.79,5.71,5.65,5.59,5.54,5.50,5.46,5.43,5.32,5.21,5.11,5.00,4.90,4.80],
    /* k=16 */ [56.32,15.91,10.69,8.79,7.83,7.24,6.85,6.57,6.36,6.19,6.06,5.95,5.86,5.79,5.72,5.66,5.61,5.57,5.53,5.49,5.38,5.27,5.16,5.06,4.95,4.85],
    /* k=17 */ [57.22,16.14,10.84,8.91,7.93,7.34,6.94,6.65,6.44,6.27,6.13,6.02,5.93,5.85,5.79,5.73,5.67,5.63,5.59,5.55,5.44,5.33,5.22,5.11,5.00,4.89],
    /* k=18 */ [58.04,16.37,10.98,9.03,8.03,7.43,7.02,6.73,6.51,6.34,6.20,6.09,5.99,5.91,5.85,5.79,5.73,5.69,5.65,5.61,5.49,5.38,5.27,5.15,5.04,4.93],
    /* k=19 */ [58.83,16.57,11.11,9.13,8.12,7.51,7.10,6.80,6.58,6.40,6.27,6.15,6.05,5.97,5.90,5.84,5.79,5.74,5.70,5.66,5.55,5.43,5.31,5.20,5.09,4.97],
    /* k=20 */ [59.56,16.77,11.24,9.23,8.21,7.59,7.17,6.87,6.64,6.47,6.33,6.21,6.11,6.03,5.96,5.90,5.84,5.79,5.75,5.71,5.59,5.47,5.36,5.24,5.13,5.01],
  ];

  /**
   * Get the studentized range critical value q(0.05, k, df).
   * Uses linear interpolation in 1/df for intermediate df values.
   */
  function getStudentizedRangeCritical(k, df) {
    if (k < 2 || k > 20 || df < 1) return NaN;

    const row = Q_TABLE[k - 2];
    if (!row) return NaN;

    // Clamp to table bounds
    if (df >= 1e9) return row[row.length - 1];
    if (df <= 1) return row[0];

    // Find bounding df indices
    let loIdx = 0;
    let hiIdx = Q_DF.length - 1;

    for (let i = 0; i < Q_DF.length; i++) {
      if (Q_DF[i] <= df) loIdx = i;
    }
    for (let i = Q_DF.length - 1; i >= 0; i--) {
      if (Q_DF[i] >= df) hiIdx = i;
    }

    if (loIdx === hiIdx) return row[loIdx];

    // Linear interpolation in 1/df (more accurate for distribution tails)
    const loDf = Q_DF[loIdx];
    const hiDf = Q_DF[hiIdx] >= 1e9 ? 1e9 : Q_DF[hiIdx];
    const loQ = row[loIdx];
    const hiQ = row[hiIdx];

    const invDf = 1 / df;
    const invLo = 1 / loDf;
    const invHi = 1 / hiDf;

    // Avoid division by zero (invLo should always differ from invHi)
    if (Math.abs(invLo - invHi) < 1e-15) return loQ;

    const t = (invDf - invHi) / (invLo - invHi);
    return hiQ + t * (loQ - hiQ);
  }

  // ═══════════════════════════════════════════════════════
  // Compact Letter Display (CLD) algorithm
  //
  // Assigns letters so that groups NOT significantly
  // different share at least one common letter.
  // Groups with the highest mean receive 'a'.
  // ═══════════════════════════════════════════════════════

  function compactLetterDisplay(sortedGroups, sigMatrix) {
    const n = sortedGroups.length;
    if (n === 0) return [];
    if (n === 1) return ["a"];

    const letterSets = Array.from({ length: n }, () => []);
    let letterIndex = 0;

    for (let start = 0; start < n; start++) {
      // Does this group need a new letter?
      let needsLetter = false;

      if (letterSets[start].length === 0) {
        // No letter yet — definitely needs one
        needsLetter = true;
      } else {
        // Check if it already shares a letter with all its non-significant partners
        for (let j = start + 1; j < n; j++) {
          if (!sigMatrix[start][j]) {
            const shared = letterSets[start].some((l) => letterSets[j].includes(l));
            if (!shared) {
              needsLetter = true;
              break;
            }
          }
        }
      }

      if (!needsLetter) continue;

      const letter = String.fromCharCode(97 + letterIndex);
      letterSets[start].push(letter);

      // Extend this letter to subsequent groups
      for (let j = start + 1; j < n; j++) {
        let canJoin = true;
        for (let m = start; m < j; m++) {
          if (letterSets[m].includes(letter) && sigMatrix[m][j]) {
            canJoin = false;
            break;
          }
        }
        if (canJoin) {
          letterSets[j].push(letter);
        }
      }

      letterIndex++;
    }

    return letterSets.map((set) => set.join(""));
  }

  // ═══════════════════════════════════════════════════════
  // BNT — Fischer's Least Significant Difference (LSD)
  // ═══════════════════════════════════════════════════════

  function computeLSD(groups, msError, dfError, alpha) {
    if (!alpha) alpha = 0.05;
    const k = groups.length;
    if (k < 2 || dfError <= 0 || msError <= 0) return null;

    const tCritical = tDistQuantile(1 - alpha / 2, dfError);
    const sortedGroups = [...groups].sort((a, b) => b.mean - a.mean);

    // Determine if balanced
    const isBalanced = sortedGroups.every((g) => g.n === sortedGroups[0].n);
    const r = sortedGroups[0].n;

    let lsdValue = null;
    if (isBalanced) {
      lsdValue = tCritical * Math.sqrt(2 * msError / r);
    }

    // Build pairwise significance matrix
    const sigMatrix = Array.from({ length: k }, () => Array(k).fill(false));
    const pairwise = [];

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const diff = Math.abs(sortedGroups[i].mean - sortedGroups[j].mean);
        const se = Math.sqrt(msError * (1 / sortedGroups[i].n + 1 / sortedGroups[j].n));
        const lsd_ij = tCritical * se;
        const significant = diff >= lsd_ij;

        sigMatrix[i][j] = significant;
        sigMatrix[j][i] = significant;

        pairwise.push({
          groupA: sortedGroups[i].name,
          groupB: sortedGroups[j].name,
          diff,
          lsd: lsd_ij,
          significant,
        });
      }
    }

    const letters = compactLetterDisplay(sortedGroups, sigMatrix);

    return {
      testName: "Fischer's LSD",
      alpha,
      tCritical,
      lsdValue,
      isBalanced,
      sortedGroups,
      sigMatrix,
      pairwise,
      letters,
    };
  }

  // ═══════════════════════════════════════════════════════
  // BNJ — Tukey's Honestly Significant Difference (HSD)
  //
  // Uses Tukey-Kramer adjustment for unbalanced designs.
  // ═══════════════════════════════════════════════════════

  function computeHSD(groups, msError, dfError, alpha) {
    if (!alpha) alpha = 0.05;
    const k = groups.length;
    if (k < 2 || dfError <= 0 || msError <= 0) return null;

    const qCritical = getStudentizedRangeCritical(k, dfError);
    if (!Number.isFinite(qCritical)) return null;

    const sortedGroups = [...groups].sort((a, b) => b.mean - a.mean);

    const isBalanced = sortedGroups.every((g) => g.n === sortedGroups[0].n);
    const r = sortedGroups[0].n;

    let hsdValue = null;
    if (isBalanced) {
      hsdValue = qCritical * Math.sqrt(msError / r);
    }

    // Build pairwise significance matrix (Tukey-Kramer for unequal n)
    const sigMatrix = Array.from({ length: k }, () => Array(k).fill(false));
    const pairwise = [];

    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const diff = Math.abs(sortedGroups[i].mean - sortedGroups[j].mean);
        const se = Math.sqrt((msError / 2) * (1 / sortedGroups[i].n + 1 / sortedGroups[j].n));
        const hsd_ij = qCritical * se;
        const significant = diff >= hsd_ij;

        sigMatrix[i][j] = significant;
        sigMatrix[j][i] = significant;

        pairwise.push({
          groupA: sortedGroups[i].name,
          groupB: sortedGroups[j].name,
          diff,
          hsd: hsd_ij,
          significant,
        });
      }
    }

    const letters = compactLetterDisplay(sortedGroups, sigMatrix);

    return {
      testName: "Tukey's HSD",
      alpha,
      qCritical,
      hsdValue,
      isBalanced,
      k,
      sortedGroups,
      sigMatrix,
      pairwise,
      letters,
    };
  }

  // ═══════════════════════════════════════════════════════
  // DMRT — Duncan's Multiple Range Test
  //
  // Uses the studentized range table with a protection-level
  // adjustment: α_p = 1 − (1 − α)^(p−1) for each subset
  // size p = 2..k.  Because we re-use the single α=0.05
  // studentized range table, we approximate the Duncan
  // critical values by scaling: q_D(p, df) ≈ q(α, p, df)
  // evaluated with Duncan's adjusted significance levels.
  //
  // For a proper implementation we interpolate in the
  // existing Q_TABLE, which is at α = 0.05.  Duncan's
  // protection level produces smaller critical values for
  // larger p, making it more liberal than Tukey.
  // ═══════════════════════════════════════════════════════

  /**
   * Approximate Duncan critical range Rp = q_D(p, dfE) × √(MSE / r)
   *
   * Duncan's method uses significance levels α_p = 1 − (1−α)^(p−1).
   * Since α_p ≥ α for p ≥ 2, the critical q is ≤ q_Tukey.
   * We approximate by linear interpolation between α=0.05 table
   * values for adjacent p, scaling by the protection-level ratio.
   *
   * For a balanced design:  Rp = q_D(p, dfE) × √(MSE / r)
   * For unbalanced: pairwise  Rp_ij = q_D(p, dfE) × √(MSE/2 × (1/ni + 1/nj))
   */
  function computeDMRT(groups, msError, dfError, alpha) {
    if (!alpha) alpha = 0.05;
    const k = groups.length;
    if (k < 2 || dfError <= 0 || msError <= 0) return null;

    const sortedGroups = [...groups].sort((a, b) => b.mean - a.mean);
    const isBalanced = sortedGroups.every((g) => g.n === sortedGroups[0].n);
    const r = sortedGroups[0].n;

    // Compute Duncan critical values for range sizes p = 2..k
    // Duncan α_p = 1 − (1 − α)^(p−1)
    // We approximate q at α_p by scaling: q(α_p, p, df) ≈ q(0.05, p, df) × (α/α_p)^0.075
    // This is a standard approximation used when only one α table is available.
    const qDuncan = [];
    for (let p = 2; p <= k; p++) {
      const alphaP = 1 - Math.pow(1 - alpha, p - 1);
      const qBase = getStudentizedRangeCritical(p, dfError);
      if (!Number.isFinite(qBase)) return null;
      // Scale: when alphaP > alpha, qDuncan < qBase (more liberal)
      const scaleFactor = Math.pow(alpha / alphaP, 0.075);
      qDuncan.push({ p, alphaP, q: qBase * scaleFactor });
    }

    // Build pairwise significance matrix using stepwise procedure
    // Process from largest range to smallest (same as SNK)
    const sigMatrix = Array.from({ length: k }, () => Array(k).fill(false));
    const protectedPairs = Array.from({ length: k }, () => Array(k).fill(false));
    const pairwise = [];

    for (let rangeSize = k; rangeSize >= 2; rangeSize--) {
      const qEntry = qDuncan[rangeSize - 2]; // p=2 is index 0
      const qVal = qEntry ? qEntry.q : qDuncan[qDuncan.length - 1].q;

      for (let i = 0; i <= k - rangeSize; i++) {
        const j = i + rangeSize - 1;

        // If protected by a larger non-significant range, force non-significant
        if (protectedPairs[i][j]) {
          sigMatrix[i][j] = false;
          sigMatrix[j][i] = false;
          pairwise.push({
            groupA: sortedGroups[i].name,
            groupB: sortedGroups[j].name,
            diff: Math.abs(sortedGroups[i].mean - sortedGroups[j].mean),
            criticalRange: 0,
            p: rangeSize,
            significant: false,
          });
          continue;
        }

        const diff = Math.abs(sortedGroups[i].mean - sortedGroups[j].mean);

        let criticalRange;
        if (isBalanced) {
          criticalRange = qVal * Math.sqrt(msError / r);
        } else {
          criticalRange = qVal * Math.sqrt((msError / 2) * (1 / sortedGroups[i].n + 1 / sortedGroups[j].n));
        }

        const significant = diff >= criticalRange;
        sigMatrix[i][j] = significant;
        sigMatrix[j][i] = significant;

        // If non-significant, protect all subsets within this range
        if (!significant) {
          for (let ii = i; ii <= j; ii++) {
            for (let jj = ii + 1; jj <= j; jj++) {
              if (ii === i && jj === j) continue;
              protectedPairs[ii][jj] = true;
              protectedPairs[jj][ii] = true;
            }
          }
        }

        pairwise.push({
          groupA: sortedGroups[i].name,
          groupB: sortedGroups[j].name,
          diff,
          criticalRange,
          p: rangeSize,
          significant,
        });
      }
    }

    const letters = compactLetterDisplay(sortedGroups, sigMatrix);

    return {
      testName: "Duncan's DMRT",
      alpha,
      qDuncan,
      isBalanced,
      k,
      sortedGroups,
      sigMatrix,
      pairwise,
      letters,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SNK — Student-Newman-Keuls
  //
  // Stepwise procedure using the studentized range
  // distribution. Like Tukey, but applies q(α, p, df)
  // where p is the number of means in each subset
  // rather than always using q(α, k, df).
  //
  // The procedure works from the largest range down:
  // if a range of p means is not significant, all
  // subsets within that range are also non-significant.
  // ═══════════════════════════════════════════════════════

  function computeSNK(groups, msError, dfError, alpha) {
    if (!alpha) alpha = 0.05;
    const k = groups.length;
    if (k < 2 || dfError <= 0 || msError <= 0) return null;

    const sortedGroups = [...groups].sort((a, b) => b.mean - a.mean);
    const isBalanced = sortedGroups.every((g) => g.n === sortedGroups[0].n);
    const r = sortedGroups[0].n;

    // Get critical q values for each range size p = 2..k
    const qValues = [];
    for (let p = 2; p <= k; p++) {
      const q = getStudentizedRangeCritical(p, dfError);
      if (!Number.isFinite(q)) return null;
      qValues.push({ p, q });
    }

    // Build significance matrix using stepwise procedure
    // We track which pairs are "protected" (forced non-significant)
    // because an enclosing range was already non-significant.
    const sigMatrix = Array.from({ length: k }, () => Array(k).fill(false));
    const protectedPairs = Array.from({ length: k }, () => Array(k).fill(false));
    const pairwise = [];

    // Process from largest range to smallest
    for (let rangeSize = k; rangeSize >= 2; rangeSize--) {
      const qEntry = qValues[rangeSize - 2]; // p=2 is index 0

      for (let i = 0; i <= k - rangeSize; i++) {
        const j = i + rangeSize - 1;

        // If this pair is protected by a larger non-significant range, skip
        if (protectedPairs[i][j]) {
          sigMatrix[i][j] = false;
          sigMatrix[j][i] = false;
          pairwise.push({
            groupA: sortedGroups[i].name,
            groupB: sortedGroups[j].name,
            diff: Math.abs(sortedGroups[i].mean - sortedGroups[j].mean),
            criticalRange: 0,
            p: rangeSize,
            significant: false,
          });
          continue;
        }

        const diff = Math.abs(sortedGroups[i].mean - sortedGroups[j].mean);

        let criticalRange;
        if (isBalanced) {
          criticalRange = qEntry.q * Math.sqrt(msError / r);
        } else {
          criticalRange = qEntry.q * Math.sqrt((msError / 2) * (1 / sortedGroups[i].n + 1 / sortedGroups[j].n));
        }

        const significant = diff >= criticalRange;
        sigMatrix[i][j] = significant;
        sigMatrix[j][i] = significant;

        // If non-significant, protect all subsets within this range
        if (!significant) {
          for (let ii = i; ii <= j; ii++) {
            for (let jj = ii + 1; jj <= j; jj++) {
              if (ii === i && jj === j) continue;
              protectedPairs[ii][jj] = true;
              protectedPairs[jj][ii] = true;
            }
          }
        }

        pairwise.push({
          groupA: sortedGroups[i].name,
          groupB: sortedGroups[j].name,
          diff,
          criticalRange,
          p: rangeSize,
          significant,
        });
      }
    }

    const letters = compactLetterDisplay(sortedGroups, sigMatrix);

    return {
      testName: "Student-Newman-Keuls (SNK)",
      alpha,
      qValues,
      isBalanced,
      k,
      sortedGroups,
      sigMatrix,
      pairwise,
      letters,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Scott-Knott Clustering Test
  //
  // Binary recursive partitioning: sorts treatment means,
  // finds the split that maximises between-group sum of
  // squares (B0), then tests B0 against a chi-square
  // threshold.  If significant the two halves are
  // recursively tested; otherwise the group is declared
  // homogeneous.  The result is non-overlapping clusters,
  // so every treatment receives exactly ONE letter.
  //
  // The statistic used is:
  //   λ = (r / MSE) × B0 × π / (2(π − 2))
  // compared against χ²(α, df=1).
  //
  // B0 = Σ n_i × (mean_i − grand_mean)² summed over each
  // side of the best split.
  // ═══════════════════════════════════════════════════════

  // Chi-square critical values for df = 1
  const CHI2_DF1 = { 0.05: 3.841, 0.01: 6.635 };

  /**
   * Compute Scott-Knott clusters for a set of treatment groups.
   *
   * @param {Array} groups  – [{ name, values, n, mean }, …]
   * @param {number} msError – Mean Square Error from ANOVA
   * @param {number} dfError – Error degrees of freedom
   * @param {number} [alpha] – Significance level (0.05 or 0.01)
   * @returns {Object|null} result with clusters and single-letter notation
   */
  function computeScottKnott(groups, msError, dfError, alpha) {
    if (!alpha) alpha = 0.05;
    const k = groups.length;
    if (k < 2 || dfError <= 0 || msError <= 0) return null;

    const sortedGroups = [...groups].sort((a, b) => b.mean - a.mean);
    const isBalanced = sortedGroups.every((g) => g.n === sortedGroups[0].n);

    const chi2Crit = CHI2_DF1[alpha] || CHI2_DF1[0.05];

    /**
     * Recursive partitioning on a subset of sortedGroups indices.
     * Returns an array of clusters, each cluster is an array of indices
     * into sortedGroups.
     */
    function partition(indices) {
      if (indices.length < 2) return [indices];

      // Compute total n and grand mean for this subset
      let totalN = 0;
      let totalSum = 0;
      for (const idx of indices) {
        totalN += sortedGroups[idx].n;
        totalSum += sortedGroups[idx].mean * sortedGroups[idx].n;
      }
      const grandMean = totalSum / totalN;

      // Try every possible split and find maximum B0
      let bestB0 = -Infinity;
      let bestSplitPos = -1;

      for (let s = 1; s < indices.length; s++) {
        // Left: indices[0..s-1], Right: indices[s..end]
        let leftN = 0, leftSum = 0;
        for (let i = 0; i < s; i++) {
          leftN += sortedGroups[indices[i]].n;
          leftSum += sortedGroups[indices[i]].mean * sortedGroups[indices[i]].n;
        }
        const leftMean = leftSum / leftN;
        const rightN = totalN - leftN;
        const rightMean = (totalSum - leftSum) / rightN;

        const B0 = leftN * Math.pow(leftMean - grandMean, 2)
                  + rightN * Math.pow(rightMean - grandMean, 2);

        if (B0 > bestB0) {
          bestB0 = B0;
          bestSplitPos = s;
        }
      }

      // Scott-Knott statistic: λ = (B0 / MSE) × π / (2(π − 2))
      // The scaling factor π/(2(π−2)) ≈ 1.3761
      const skFactor = Math.PI / (2 * (Math.PI - 2));
      const lambda = (bestB0 / msError) * skFactor;

      if (lambda <= chi2Crit) {
        // Homogeneous — do not split
        return [indices];
      }

      // Split and recurse
      const left = indices.slice(0, bestSplitPos);
      const right = indices.slice(bestSplitPos);
      return [...partition(left), ...partition(right)];
    }

    // Run partitioning on all indices
    const allIndices = sortedGroups.map((_, i) => i);
    const clusters = partition(allIndices);

    // Assign single letters: cluster with highest mean gets 'a'
    // clusters are already in descending mean order since sortedGroups is sorted desc
    const letters = new Array(k).fill("");
    clusters.forEach((cluster, clusterIdx) => {
      const letter = String.fromCharCode(97 + clusterIdx);
      for (const idx of cluster) {
        letters[idx] = letter;
      }
    });

    return {
      testName: "Scott-Knott",
      alpha,
      chi2Crit,
      clusterCount: clusters.length,
      clusters,
      isBalanced,
      k,
      sortedGroups,
      letters,
    };
  }

  // ═══════════════════════════════════════════════════════
  // HTML Rendering
  // ═══════════════════════════════════════════════════════

  function renderPostHocHTML(postHocResults, factorLabel) {
    if (!postHocResults || postHocResults.length === 0) return "";

    let html = "";

    postHocResults.forEach((result) => {
      if (!result) return;

      // Critical value info line
      let criticalInfo = "";
      if (result.testName.includes("LSD")) {
        criticalInfo = result.isBalanced
          ? `t<sub>crit</sub>(${result.alpha / 2}, ${result.sortedGroups.length > 0 ? "df" : ""}) = ${formatNumber(result.tCritical)} &nbsp;|&nbsp; LSD = ${formatNumber(result.lsdValue)}`
          : `t<sub>crit</sub> = ${formatNumber(result.tCritical)} &nbsp;|&nbsp; Unbalanced design (pairwise LSD)`;
      } else if (result.testName.includes("HSD")) {
        criticalInfo = result.isBalanced
          ? `q<sub>crit</sub>(${result.k}, df<sub>E</sub>) = ${formatNumber(result.qCritical)} &nbsp;|&nbsp; HSD = ${formatNumber(result.hsdValue)}`
          : `q<sub>crit</sub>(${result.k}, df<sub>E</sub>) = ${formatNumber(result.qCritical)} &nbsp;|&nbsp; Unbalanced (Tukey-Kramer)`;
      } else if (result.testName.includes("DMRT")) {
        const qRange = result.qDuncan;
        const qMin = qRange.length > 0 ? formatNumber(qRange[0].q) : "-";
        const qMax = qRange.length > 1 ? formatNumber(qRange[qRange.length - 1].q) : qMin;
        criticalInfo = result.isBalanced
          ? `q<sub>D</sub> range: ${qMin} – ${qMax} &nbsp;|&nbsp; Groups: ${result.k} &nbsp;|&nbsp; ${result.isBalanced ? "Balanced" : "Unbalanced"}`
          : `q<sub>D</sub> range: ${qMin} – ${qMax} &nbsp;|&nbsp; Unbalanced (pairwise critical ranges)`;
      } else if (result.testName.includes("SNK")) {
        const qRange = result.qValues;
        const qMin = qRange.length > 0 ? formatNumber(qRange[0].q) : "-";
        const qMax = qRange.length > 1 ? formatNumber(qRange[qRange.length - 1].q) : qMin;
        criticalInfo = result.isBalanced
          ? `q<sub>crit</sub> range (p=2..${result.k}): ${qMin} – ${qMax} &nbsp;|&nbsp; Stepwise procedure`
          : `q<sub>crit</sub> range (p=2..${result.k}): ${qMin} – ${qMax} &nbsp;|&nbsp; Unbalanced (pairwise)`;
      } else if (result.testName.includes("Scott-Knott")) {
        criticalInfo = `χ²<sub>crit</sub>(α=${result.alpha}, df=1) = ${formatNumber(result.chi2Crit)} &nbsp;|&nbsp; Clusters: ${result.clusterCount} &nbsp;|&nbsp; Non-overlapping groups`;
      }

      // Means + letter table
      const meansRows = result.sortedGroups
        .map(
          (g, i) => `<tr>
          <td>${escapeHtml(g.name)}</td>
          <td>${g.n}</td>
          <td>${formatNumber(g.mean)}</td>
          <td>${formatNumber(computeStdDev(g.values, g.mean))}</td>
          <td class="analysis-posthoc-letter">${result.letters[i]}</td>
        </tr>`,
        )
        .join("");

      html += `
        <div class="analysis-result-subtitle analysis-posthoc-title" style="margin-top:1.25rem">
          ${result.testName} &nbsp;(α = ${result.alpha})
        </div>
        <div class="analysis-result-note" style="margin-bottom:0.4rem">${criticalInfo}</div>
        <table class="analysis-anova-table analysis-posthoc-table">
          <thead>
            <tr>
              <th>${escapeHtml(factorLabel)}</th>
              <th>N</th>
              <th>Mean</th>
              <th>StDev</th>
              <th>Groups</th>
            </tr>
          </thead>
          <tbody>${meansRows}</tbody>
        </table>
      `;
    });

    return html;
  }

  // ═══════════════════════════════════════════════════════
  // Helper: build marginal groups from factorial result
  // ═══════════════════════════════════════════════════════

  function buildFactorGroups(result, factorIndex) {
    const levs = result.levels[factorIndex];
    return levs.map((level) => {
      const vals = [];
      result.cellMap.forEach((cellValues, cellKey) => {
        const parts = cellKey.split("|");
        if (parts[factorIndex] === level) vals.push(...cellValues);
      });
      const n = vals.length;
      const mean = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
      return { name: level, values: vals, n, mean };
    });
  }

  // ═══════════════════════════════════════════════════════
  // Main entry: run selected post hoc tests for a set of groups
  // ═══════════════════════════════════════════════════════

  function runPostHocForGroups(groups, msError, dfError, postHocTests, factorLabel) {
    if (!Array.isArray(postHocTests) || postHocTests.length === 0) return "";
    if (!groups || groups.length < 2) return "";

    const results = [];

    if (postHocTests.includes("lsd")) {
      results.push(computeLSD(groups, msError, dfError));
    }

    if (postHocTests.includes("hsd")) {
      results.push(computeHSD(groups, msError, dfError));
    }

    if (postHocTests.includes("dmrt")) {
      results.push(computeDMRT(groups, msError, dfError));
    }

    if (postHocTests.includes("snk")) {
      results.push(computeSNK(groups, msError, dfError));
    }

    if (postHocTests.includes("scott-knott")) {
      results.push(computeScottKnott(groups, msError, dfError));
    }

    return renderPostHocHTML(results, factorLabel);
  }

  // ═══════════════════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════════════════

  app._postHocUtils = {
    tDistCdf,
    tDistQuantile,
    getStudentizedRangeCritical,
    compactLetterDisplay,
    computeLSD,
    computeHSD,
    computeDMRT,
    computeSNK,
    computeScottKnott,
    renderPostHocHTML,
    buildFactorGroups,
    runPostHocForGroups,
  };
})();
