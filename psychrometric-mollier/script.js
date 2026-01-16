// ==========================================
// GLOBAL VARIABLES
// ==========================================

const chart_margin_top = 35,
  chart_margin_right = 60,
  chart_margin_bottom = 60,
  chart_margin_left = 70,
  min_tdb = -100,
  max_tdb = 99,
  color_rh = "#ef5350",
  color_h = "#8e24aa",
  color_twb = "#43a047",
  color_v = "#fb8c00",
  color_sat = "#0056b3";

// ==========================================
// 1. STATE & MATH ENGINE (FINAL FIX)
// ==========================================

const State = {
  chartType: "psychrometric", // 'psychrometric' atau 'mollier'
  mode: "view",
  points: [],
  zones: [],
  tempZone: [],
  selectedPointId: null,
  selectedZoneId: null,
  targetForManual: null,
  zoneSubMode: "manual", // 'manual' atau 'range'
  pointSubMode: "manual",
  rangePreview: [], // Menyimpan 4 titik sementara dari slider
  yAxisType: "humidityRatio",
};

const Psychro = {
  R_DA: 287.058, // Gas constant for dry air (J/kg·K)

  // Core Formulas
  getSatVapPres: (t) => 610.94 * Math.exp((17.625 * t) / (t + 243.04)),
  getTempFromSatPres: (Pws) =>
    (243.04 * Math.log(Pws / 610.94)) / (17.625 - Math.log(Pws / 610.94)),
  getPwFromW: (W, Patm) => (W * Patm) / (0.62198 + W),
  getWFromPw: (Pw, Patm) => (Patm - Pw <= 0 ? 0 : (0.62198 * Pw) / (Patm - Pw)),
  getEnthalpy: (t, W) => 1.006 * t + W * (2501 + 1.86 * t),
  getSpecificVolume: (t, W, Patm) =>
    (287.058 * (t + 273.15) * (1 + 1.6078 * W)) / Patm,
  getDewPoint: (Pw) =>
    Pw <= 0
      ? -273.15
      : (243.04 * Math.log(Pw / 610.94)) / (17.625 - Math.log(Pw / 610.94)),

  getTwbFromState: (Tdb, W, Patm) => {
    let low = -20,
      high = Tdb,
      Twb = Tdb;
    for (let i = 0; i < 20; i++) {
      Twb = (low + high) / 2;
      const Pws = Psychro.getSatVapPres(Twb);
      const Ws = Psychro.getWFromPw(Pws, Patm);
      const num = (2501 - 2.326 * Twb) * Ws - 1.006 * (Tdb - Twb);
      const den = 2501 + 1.86 * Tdb - 4.186 * Twb;
      const W_calc = num / den;
      if (W_calc > W) high = Twb;
      else low = Twb;
    }
    return Twb;
  },

  // --- TAMBAHKAN FUNGSI INI ---
  // Mencari Tdb pada Volume (v) dan Humidity Ratio (W) tertentu
  // Rumus: T = (v * P) / (R_da * (1 + 1.6078 * W)) - 273.15
  getTdbFromVolLine: (v, W, Patm) => {
    return (v * Patm) / (287.058 * (1 + 1.6078 * W)) - 273.15;
  },

  // --- SOLVER MANUAL INPUT (FIXED for Volume) ---
  solveRobust: (type1, val1, type2, val2, Patm) => {
    // 1. Normalisasi: Pastikan Tdb atau W ada di parameter 1
    if (type2 === "Tdb" || type2 === "W") {
      [type1, type2] = [type2, type1];
      [val1, val2] = [val2, val1];
    }

    // KASUS A: Dry Bulb (Tdb) diketahui
    if (type1 === "Tdb") {
      const t = val1;

      // 1. Tdb + W (Langsung)
      if (type2 === "W") return { t, w: val2 };

      // 2. Tdb + RH
      if (type2 === "RH") {
        const Pws = Psychro.getSatVapPres(t);
        const w = Psychro.getWFromPw(Pws * (val2 / 100), Patm);
        return { t, w };
      }

      // 3. Tdb + Volume (v) -> RUMUS LANGSUNG (BARU)
      // Rumus: v = R_da * T_k * (1 + 1.6078 * W) / P
      // Diubah menjadi: W = [ (v * P) / (R_da * T_k) - 1 ] / 1.6078
      if (type2 === "v") {
        const Tk = t + 273.15;
        const numerator = (val2 * Patm) / (Psychro.R_DA * Tk) - 1;
        const w = numerator / 1.6078;
        return { t, w };
      }

      // 4. Iterasi W untuk parameter lain (h, Twb)
      let wLow = 0,
        wHigh = 0.15,
        wMid = 0;
      for (let i = 0; i < 40; i++) {
        wMid = (wLow + wHigh) / 2;
        let calc = 0;
        if (type2 === "h") calc = Psychro.getEnthalpy(t, wMid);
        else if (type2 === "Twb") calc = Psychro.getTwbFromState(t, wMid, Patm);

        if (calc > val2) wHigh = wMid;
        else wLow = wMid;
      }
      return { t, w: wMid };
    }

    // KASUS B: Humidity Ratio (W) diketahui
    if (type1 === "W") {
      const w = val1;
      let tLow = -50,
        tHigh = 100,
        tMid = 0;

      // Iterasi Tdb
      for (let i = 0; i < 40; i++) {
        tMid = (tLow + tHigh) / 2;
        let calc = 0;

        if (type2 === "RH") {
          const Pws = Psychro.getSatVapPres(tMid);
          const Pw = Psychro.getPwFromW(w, Patm);
          calc = (Pw / Pws) * 100;
          if (calc < val2) tHigh = tMid;
          else tLow = tMid; // Inverse
          continue;
        } else if (type2 === "h") calc = Psychro.getEnthalpy(tMid, w);
        else if (type2 === "Twb") calc = Psychro.getTwbFromState(tMid, w, Patm);
        else if (type2 === "v") calc = Psychro.getSpecificVolume(tMid, w, Patm);

        // h, Twb, dan v naik saat T naik
        if (calc > val2) tHigh = tMid;
        else tLow = tMid;
      }
      return { t: tMid, w };
    }

    // KASUS C: Fallback Iterasi Global (misal h + RH)
    let tLow = -20,
      tHigh = 100,
      tMid = 0;
    for (let i = 0; i < 50; i++) {
      tMid = (tLow + tHigh) / 2;

      let wL = 0,
        wH = 0.15,
        wM = 0;
      for (let j = 0; j < 15; j++) {
        wM = (wL + wH) / 2;
        let v1Calc = 0;
        // Hitung v1Calc berdasarkan jenis parameter 1
        if (type1 === "h") v1Calc = Psychro.getEnthalpy(tMid, wM);
        else if (type1 === "Twb")
          v1Calc = Psychro.getTwbFromState(tMid, wM, Patm);
        else if (type1 === "v")
          v1Calc = Psychro.getSpecificVolume(tMid, wM, Patm); // Tambahan support v

        if (v1Calc > val1) wH = wM;
        else wL = wM;
      }
      let wGuess = wM;

      let v2Calc = 0;
      if (type2 === "RH") {
        const Pws = Psychro.getSatVapPres(tMid);
        const Pw = Psychro.getPwFromW(wGuess, Patm);
        v2Calc = (Pw / Pws) * 100;
      } else if (type2 === "v") {
        v2Calc = Psychro.getSpecificVolume(tMid, wGuess, Patm);
      }

      if (type2 === "RH") {
        if (v2Calc < val2) tHigh = tMid;
        else tLow = tMid;
      } else {
        if (v2Calc > val2) tHigh = tMid;
        else tLow = tMid;
      }
    }
    return { t: tMid, w: 0.01 };
  },

  // Line Helpers
  getWFromTwbLine: (Tdb, Twb, Patm) => {
    const Pws = Psychro.getSatVapPres(Twb);
    const Ws = Psychro.getWFromPw(Pws, Patm);
    return (
      ((2501 - 2.326 * Twb) * Ws - 1.006 * (Tdb - Twb)) /
      (2501 + 1.86 * Tdb - 4.186 * Twb)
    );
  },
  getTdbFromTwbZeroW: (Twb, Patm) => {
    const Pws = Psychro.getSatVapPres(Twb);
    const Ws = Psychro.getWFromPw(Pws, Patm);
    return ((2501 - 2.326 * Twb) * Ws + 1.006 * Twb) / 1.006;
  },
  getWFromEnthalpyLine: (t, h) => (h - 1.006 * t) / (2501 + 1.86 * t),
  getWFromVolLine: (t, v, Patm) =>
    ((v * Patm) / (287.058 * (t + 273.15)) - 1) / 1.6078,
  solveIntersectionWithSaturation: (type, targetVal, Patm, minT, maxT) => {
    let low = minT - 20,
      high = maxT + 20,
      mid = 0;
    for (let i = 0; i < 20; i++) {
      mid = (low + high) / 2;
      const Pws = Psychro.getSatVapPres(mid);
      const Wsat = Psychro.getWFromPw(Pws, Patm);
      let val =
        type === "enthalpy"
          ? Psychro.getEnthalpy(mid, Wsat)
          : Psychro.getSpecificVolume(mid, Wsat, Patm);
      if (val > targetVal) high = mid;
      else low = mid;
    }
    return mid;
  },
};

function getFrostPoint(Pw) {
  // Magnus-type equation for ice
  const lnRatio = Math.log(Pw / 611.2);
  return (272.62 * lnRatio) / (22.46 - lnRatio);
}


function calculateAllProperties(t, w, Patm) {
  const Pws = Psychro.getSatVapPres(t);
  const Pw = Psychro.getPwFromW(w, Patm);
  const Wsat = Psychro.getWFromPw(Pws, Patm);
  const vpdVal = Pws - Pw;
  const hdVal = Wsat - w;
  const v = Psychro.getSpecificVolume(t, w, Patm);
  const ahVal = (w / v) * 1000;
  const Tdp = Psychro.getDewPoint(Pw);
  const Tf = Tdp >= 0 ? Tdp : getFrostPoint(Pw);

  return {
    Tdb: t,
    W: w,
    RH: (Pw / Pws) * 100,
    Twb: Psychro.getTwbFromState(t, w, Patm),
    Tdp: Tdp,
    h: Psychro.getEnthalpy(t, w),
    v: Psychro.getSpecificVolume(t, w, Patm),
    rho: (1 + w) / Psychro.getSpecificVolume(t, w, Patm),
    Pw: Pw,
    Pws: Pws,
    mu: (w / Psychro.getWFromPw(Pws, Patm)) * 100,
    cp: 1.006 + 1.86 * w,
    Wsat: Wsat,
    VPD: vpdVal,
    HD: hdVal,
    AH: ahVal,
    PD: t - Psychro.getTwbFromState(t, w, Patm),
    VMR: (Pw / (Patm - Pw)) * 1000000,
    Dvs: 1000 * Pws / (461.5 * (t + 273.15)),
    Tf: Tf,
  };
}

// ==========================================
// 2. UI HANDLERS
// ==========================================

function changeChartType(type) {
  State.chartType = type;
  drawChart();

  // Update label sumbu sesuai tipe chart
  updateAxisLabels();

  if (State.chartType === "psychrometric") {
    document
      .querySelector(".chart-type .psychrometric")
      .classList.add("active");
    document.querySelector(".chart-type .mollier").classList.remove("active");
  } else {
    document.querySelector(".chart-type .mollier").classList.add("active");
    document
      .querySelector(".chart-type .psychrometric")
      .classList.remove("active");
  }
}

function updateAxisLabels() {
  const axisLabelX = document.querySelector(".axis-label.x");
  const axisLabelY = document.querySelector(".axis-label.y");

  if (State.chartType === "psychrometric") {
    if (axisLabelX) axisLabelX.textContent = "Dry Bulb Temperature (°C)";
    if (axisLabelY) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelY.textContent = "Absolute Humidity (g/m³)";
      } else {
        axisLabelY.textContent = "Humidity Ratio (kg/kg')";
      }
    }
  } else {
    // Mollier chart
    if (axisLabelX) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelX.textContent = "Absolute Humidity (g/m³)";
      } else {
        axisLabelX.textContent = "Humidity Ratio (kg/kg')";
      }
    }
    if (axisLabelY) axisLabelY.textContent = "Dry Bulb Temperature (°C)";
  }
}

function changeYAxisType(type) {
  State.yAxisType = type;
  drawChart();

  updateAxisLabels();

  if (State.yAxisType === "humidityRatio") {
    document.querySelector(".yAxis-type .humidityRatio").classList.add("active");
    document.querySelector(".yAxis-type .absoluteHumidity").classList.remove("active");
    document.querySelector(".input-item.ratio").classList.remove("none");
    document.querySelector(".input-item.absolute").classList.add("none");
  } else {
    document.querySelector(".yAxis-type .absoluteHumidity").classList.add("active");
    document.querySelector(".yAxis-type .humidityRatio").classList.remove("active");
    document.querySelector(".input-item.ratio").classList.add("none");
    document.querySelector(".input-item.absolute").classList.remove("none");
  }
}

function syncHumidityInputs(source) {
  const Patm = parseFloat(document.getElementById("pressure").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const elMaxHum = document.getElementById("maxHum");
  const elMaxAbsHum = document.getElementById("maxAbsHum");

  if (source === 'ratio') {
    const valW = parseFloat(elMaxHum.value);
    if (!isNaN(valW)) {
      const valAH = calculateAbsoluteHumidity(maxT, valW, Patm);
      elMaxAbsHum.value = valAH.toFixed(3);
    }
  } else if (source === 'absolute') {
    const valAH = parseFloat(elMaxAbsHum.value);
    if (!isNaN(valAH)) {
      const valW = getWFromAbsoluteHumidity(maxT, valAH, Patm);
      elMaxHum.value = valW.toFixed(4);
    }
  }

  // Gambar ulang chart dengan nilai baru
  drawChart();
}

// Konfigurasi batas slider untuk tiap parameter
const RangeConfigs = {
  RH: { min: 0, max: 100, step: 1, defMin: 30, defMax: 70 },
  Twb: { min: -10, max: 50, step: 0.5, defMin: 15, defMax: 25 },
  h: { min: 0, max: 150, step: 1, defMin: 40, defMax: 80 },
  v: { min: 0.75, max: 1.05, step: 0.01, defMin: 0.8, defMax: 0.9 },
};

function setupRangeDefaults() {
  const type = document.getElementById("rangeParamType").value;
  const cfg = RangeConfigs[type];

  // Update atribut slider input HTML
  ["min", "max"].forEach((suffix) => {
    const elSlider = document.getElementById("sliderP2" + suffix);
    const elInput = document.getElementById("rangeP2" + suffix);

    elSlider.min = cfg.min;
    elSlider.max = cfg.max;
    elSlider.step = cfg.step;
    elInput.step = cfg.step;

    // Set default values saat ganti tipe
    if (suffix === "min") {
      elSlider.value = cfg.defMin;
      elInput.value = cfg.defMin;
    } else {
      elSlider.value = cfg.defMax;
      elInput.value = cfg.defMax;
    }
  });

  updateRangeZone();
}

function validateRangeInputs(minId, maxId, type = "Tdb") {
  const minInput = document.getElementById(minId);
  const maxInput = document.getElementById(maxId);
  const minSlider = document.getElementById(minId.replace("range", "slider"));
  const maxSlider = document.getElementById(maxId.replace("range", "slider"));

  let minVal = parseFloat(minInput.value);
  let maxVal = parseFloat(maxInput.value);

  // Urutan min ≤ max
  if (minVal > maxVal) minVal = maxVal;
  if (maxVal < minVal) maxVal = minVal;

  // Tentukan batas berdasarkan tipe
  let minLimit, maxLimit;

  if (type === "Tdb") {
    minLimit = parseFloat(document.getElementById("minTemp").value);
    maxLimit = parseFloat(document.getElementById("maxTemp").value);
  } else {
    const cfg = RangeConfigs[type];
    minLimit = cfg.min;
    maxLimit = cfg.max;
  }

  // Clamp ke batas yang benar
  minVal = Math.max(minLimit, Math.min(minVal, maxLimit));
  maxVal = Math.max(minLimit, Math.min(maxVal, maxLimit));

  minInput.value = minVal;
  maxInput.value = maxVal;

  if (minSlider) {
    minSlider.value = minVal;
    minSlider.min = minLimit;
    minSlider.max = maxLimit;
  }

  if (maxSlider) {
    maxSlider.value = maxVal;
    maxSlider.min = minLimit;
    maxSlider.max = maxLimit;
  }
}

// Panggil ini sekali saat init atau saat masuk mode range
// (Tambahkan panggilan ini di dalam setZoneSubMode)

// Mengatur Sub-Mode (Manual vs Range)
function setZoneSubMode(subMode) {
  State.zoneSubMode = subMode;
  document.querySelectorAll(".z-tab").forEach((t) => {
    t.style.background = "rgba(255,255,255,0.5)";
    t.style.color = "#1565c0";
    t.classList.remove("active");
  });
  document.querySelector(".zone-tabs #tab-" + subMode).style.background =
    "#2196f3";
  document.querySelector(".zone-tabs #tab-" + subMode).style.color = "white";
  document.querySelector(".zone-tabs #tab-" + subMode).classList.add("active");

  document.getElementById("zone-manual-ui").style.display =
    subMode === "manual" ? "block" : "none";
  document.getElementById("zone-input-ui").style.display =
    subMode === "input" ? "block" : "none";
  document.getElementById("zone-range-ui").style.display =
    subMode === "range" ? "block" : "none";

  if (subMode !== "manual") {
    cancelZone();
  }

  if (subMode === "range") {
    State.tempZone = [];
    updateZonePtCount();
    setupRangeDefaults();
  } else {
    State.rangePreview = [];
    drawChart();
  }
}

function setPointSubMode(subMode) {
  State.pointSubMode = subMode;
  document.querySelectorAll(".p-tab").forEach((t) => {
    t.style.background = "rgba(255,255,255,0.5)";
    t.style.color = "#1565c0";
    t.classList.remove("active");
  });
  document.querySelector(".point-tabs #tab-" + subMode).style.background =
    "#2196f3";
  document.querySelector(".point-tabs #tab-" + subMode).style.color = "white";
  document.querySelector(".point-tabs #tab-" + subMode).classList.add("active");

  document.getElementById("point-manual-ui").style.display =
    subMode === "manual" ? "block" : "none";
  document.getElementById("point-input-ui").style.display =
    subMode === "input" ? "block" : "none";
}

// Sinkronisasi Slider <-> Input Angka
function syncRange(id) {
  const slider = document.getElementById("slider" + id);
  const input = document.getElementById("range" + id);

  input.value = slider.value;

  // Panggil validasi berdasarkan tipe input
  if (id.includes("Tmin") || id.includes("Tmax")) {
    validateRangeInputs("rangeTmin", "rangeTmax", "Tdb");
  } else if (id.includes("P2min") || id.includes("P2max")) {
    const type = document.getElementById("rangeParamType").value;
    validateRangeInputs("rangeP2min", "rangeP2max", type);
  }

  updateRangeZone();
}

// Fungsi Sinkronisasi Batas Slider Zone dengan Global Chart Settings
function syncZoneRangeLimits(globalMin, globalMax) {
  const ids = ["rangeTmin", "sliderTmin", "rangeTmax", "sliderTmax"];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    // 1. Update batas slider (HTML attributes)
    el.min = globalMin;
    el.max = globalMax;

    // 2. Koreksi nilai jika saat ini nilainya di luar batas baru
    let val = parseFloat(el.value);
    if (val < globalMin) el.value = globalMin;
    if (val > globalMax) el.value = globalMax;
  });

  // Update preview jika sedang dalam mode range
  if (State.zoneSubMode === "range") {
    // Kita panggil updateRangeZone agar polygon preview menyesuaikan diri
    // Tapi kita panggil secara 'silent' agar tidak loop infinite drawChart
    // Cukup update variable State.rangePreview nya saja lewat logika di dalamnya
    // Namun, cara teraman adalah membiarkan drawChart menanganinya di frame berikutnya
    // atau cukup biarkan visual slidernya berubah.
  }
}

// Menghitung 4 Titik Sudut berdasarkan Range
// Menghitung Polygon Zona dengan Sisi Melengkung (RH Curve)
function updateRangeZone() {
  // Validasi semua input range terlebih dahulu
  validateRangeInputs("rangeTmin", "rangeTmax", "Tdb");
  const type = document.getElementById("rangeParamType").value;
  validateRangeInputs("rangeP2min", "rangeP2max", type);

  // 1. Sync Inputs Tdb
  ["Tmin", "Tmax"].forEach((k) => {
    const val = parseFloat(document.getElementById("range" + k).value);
    document.getElementById("slider" + k).value = val;
  });

  // 2. Sync Inputs Parameter 2
  ["P2min", "P2max"].forEach((k) => {
    const val = parseFloat(document.getElementById("range" + k).value);
    document.getElementById("slider" + k).value = val;
  });

  const tMin = parseFloat(document.getElementById("rangeTmin").value);
  const tMax = parseFloat(document.getElementById("rangeTmax").value);

  const pType = document.getElementById("rangeParamType").value;
  const pMin = parseFloat(document.getElementById("rangeP2min").value);
  const pMax = parseFloat(document.getElementById("rangeP2max").value);
  const Patm = parseFloat(document.getElementById("pressure").value);

  if (tMin >= tMax || pMin >= pMax) {
    State.rangePreview = [];
    drawChart();
    return;
  }

  const polyPoints = [];
  const step = 0.5;

  // Helper untuk membatasi W agar tidak tembus Saturation Line
  const getClampedW = (t, type, val) => {
    const res = Psychro.solveRobust("Tdb", t, type, val, Patm);
    if (isNaN(res.w)) return null;

    // Hitung W max pada RH 100% di suhu ini
    const Pws = Psychro.getSatVapPres(t);
    const Wmax = Psychro.getWFromPw(Pws, Patm);

    // Jika hasil hitungan melebihi batas jenuh, paksa ke batas jenuh
    if (res.w > Wmax) res.w = Wmax;

    return res.w;
  };

  // A. Garis Bawah (Param Min)
  for (let t = tMin; t <= tMax; t += step) {
    const w = getClampedW(t, pType, pMin);
    if (w !== null) polyPoints.push({ t: t, w: w });
  }
  // Sudut Kanan Bawah
  const wBR = getClampedW(tMax, pType, pMin);
  if (wBR !== null) polyPoints.push({ t: tMax, w: wBR });

  // B. Garis Atas (Param Max) - Balik Arah
  for (let t = tMax; t >= tMin; t -= step) {
    const w = getClampedW(t, pType, pMax);
    if (w !== null) polyPoints.push({ t: t, w: w });
  }
  // Sudut Kiri Atas
  const wTL = getClampedW(tMin, pType, pMax);
  if (wTL !== null) polyPoints.push({ t: tMin, w: wTL });

  State.rangePreview = polyPoints;
  drawChart();
}

function setMode(mode) {
  State.mode = mode;
  document
    .querySelectorAll(".toolbar .tool-btn")
    .forEach((b) => b.classList.remove("active"));
  if (document.getElementById("btn-" + mode))
    document.getElementById("btn-" + mode).classList.add("active");

  const zoneCtrl = document.getElementById("zone-controls");
  zoneCtrl.style.display = mode === "zone" ? "block" : "none";

  const pointCtrl = document.getElementById("point-controls");
  pointCtrl.style.display = mode === "point" ? "block" : "none";

  // TAMBAHAN: Init submode jika masuk ke zone
  if (mode === "zone") {
    if (!State.zoneSubMode) setZoneSubMode("manual");
    else setZoneSubMode(State.zoneSubMode);
  }

  // Clear temp data jika keluar mode zone
  if (mode !== "zone") {
    cancelZone();
    State.rangePreview = [];
  }
  drawChart();
}

function updateZonePtCount() {
  document.getElementById("zonePtCount").innerText =
    State.tempZone.length + " pts";
}

// --- MANUAL INPUT HANDLER ---
function openManualModal(target) {
  State.targetForManual = target;
  document.getElementById("modalTitle").innerText =
    target === "point" ? "Add Manual Point" : "Add Zone Vertex";
  document.getElementById("manualModal").style.display = "flex";
}

function submitManualInput(target) {
  State.targetForManual = target;
  const p1Type = document.getElementById("p1Type-" + target).value;
  const p1Val = parseFloat(document.getElementById("p1Val-" + target).value);
  const p2Type = document.getElementById("p2Type-" + target).value;
  const p2Val = parseFloat(document.getElementById("p2Val-" + target).value);
  const Patm = parseFloat(document.getElementById("pressure").value);

  if (isNaN(p1Val) || isNaN(p2Val)) {
    alert("Please enter valid numbers");
    return;
  }
  if (p1Type === p2Type) {
    alert("Parameters must be different");
    return;
  }

  const res = Psychro.solveRobust(p1Type, p1Val, p2Type, p2Val, Patm);

  if (isNaN(res.t) || isNaN(res.w)) {
    alert("Calculation error. Values might be out of range.");
    return;
  }

  if (State.targetForManual === "point") {
    addPoint(res.t, res.w);
  } else if (State.targetForManual === "zone") {
    if (State.mode !== "zone") setMode("zone");
    State.tempZone.push({ t: res.t, w: res.w });
    updateZonePtCount();
    drawChart();
  }
}

// --- LIST & CRUD ---
function updateLists() {
  // 1. RENDER POINTS
  const pl = document.getElementById("list-points");
  document.getElementById("count-points").innerText = State.points.length;

  pl.innerHTML =
    State.points
      .map(
        (p, i) => `
        <div class="list-item ${
          p.id === State.selectedPointId ? "active" : ""
        }">
            <div class="item-header" onclick="selectPoint(${p.id})">
                <div class="id-circle" style="background-color: ${p.color || '#ff0000'}">${i + 1}</div>
                
                <div class="item-name">${p.name}</div>
                <div class="item-actions">
                    <div class="icon-btn" onclick="openEditModal('point', ${
                      p.id
                    })">
                      <span class="material-symbols-rounded"> edit_square </span>
                    </div>
                    <div class="icon-btn btn-delete" onclick="deletePoint(event, ${
                      p.id
                    })">
                      <span class="material-symbols-rounded"> delete </span>
                    </div>
                </div>
            </div>
            <div class="item-details">${generateHTMLGrid(p.data)}</div>
        </div>`
      )
      .join("") ||
    `
      <div style="font-size:10px;text-align:center;color:#999;padding:10px">No points</div>
      <style>
        .marked-point {display:none}
      </style>
    `;

  // 2. RENDER ZONES (Update onclick ke openEditModal)
  const zl = document.getElementById("list-zones");
  document.getElementById("count-zones").innerText = State.zones.length;

  zl.innerHTML =
    State.zones
      .map(
        (z, i) => `
        <div class="list-item ${
          z.id === State.selectedZoneId ? "active" : ""
        }" onclick="selectZone(${z.id})" style="border-left:4px solid ${
          z.color
        }">
            <div class="item-header">
                <div class="id-circle" style="background:${z.color}">${
          i + 1
        }</div>
                <div class="item-name">${z.name}</div>
                <div class="item-actions">
                    <div class="icon-btn" onclick="openEditModal('zone', ${
                      z.id
                    })">
                      <span class="material-symbols-rounded"> edit_square </span>
                    </div>
                    <div class="icon-btn btn-delete" onclick="deleteZone(event, ${
                      z.id
                    })">
                      <span class="material-symbols-rounded"> delete </span>
                    </div>
                </div>
            </div>
        </div>`
      )
      .join("") ||
    `
      <div style="font-size:10px;text-align:center;color:#999;padding:10px">No zones</div> 
      <style>
        .comfort-zone {display:none}
      </style>
    `;
}

function addPoint(t, w) {
  const Patm = parseFloat(document.getElementById("pressure").value);
  const data = calculateAllProperties(t, w, Patm);

  // PERUBAHAN: Tambahkan property 'name'
  const pt = {
    id: Date.now(),
    // name: `Point ${State.points.length + 1}`,
    name: `Point`,
    color: "#cc1919",
    t,
    w,
    data,
  };

  State.points.push(pt);
  selectPoint(pt.id);
}

function clearSelections() {
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

function selectPoint(id) {
  let element = this.event.target;
  let parent = element.closest('.active');
  if (parent) {
    clearSelections();
    return;
  }
  State.selectedPointId = id;
  State.selectedZoneId = null;
  updateLists();
  drawChart();
}

function selectZone(id) {
  let element = this.event.target;
  let parent = element.closest('.active');
  if (parent) {
    clearSelections();
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
  updateLists();
  drawChart();
}

function deleteZone(e, id) {
  e.stopPropagation();
  State.zones = State.zones.filter((z) => z.id !== id);
  updateLists();
  drawChart();
}

// --- UNIFIED EDIT MODAL ---

function openEditModal(type, id) {
  // Stop propagasi agar tidak men-trigger select item di background
  if (window.event) window.event.stopPropagation();

  document.getElementById("editId").value = id;
  document.getElementById("editType").value = type;

  const colorContainer = document.getElementById("colorContainer");
  const nameInput = document.getElementById("editName");
  const colorInput = document.getElementById("editColor");

  if (type === "point") {
    const p = State.points.find((item) => item.id === id);
    if (!p) return;
    document.getElementById("editModalTitle").innerText = "Edit Point";
    nameInput.value = p.name;
    colorInput.value = p.color || "#ff0000";
    colorContainer.style.display = "block";
  } else if (type === "zone") {
    const z = State.zones.find((item) => item.id === id);
    if (!z) return;
    document.getElementById("editModalTitle").innerText = "Edit Zone";
    nameInput.value = z.name;
    colorInput.value = z.color;
    colorContainer.style.display = "block";
  }

  document.querySelector(".editModal").style.display = "grid";
  document.querySelector(".editModal").style.opacity = "1";
}

function saveSettings() {
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

  updateLists();
  drawChart();
}

function finishZone() {
  let finalPoints = [];

  // Cek kita sedang pakai mode apa
  if (State.zoneSubMode === "range") {
    if (State.rangePreview.length < 3) {
      alert("Invalid Range Zone");
      return;
    }
    finalPoints = [...State.rangePreview]; // Copy dari preview
  } else {
    // Mode Manual
    if (State.tempZone.length < 3) {
      alert("Min 3 points required.");
      return;
    }
    finalPoints = [...State.tempZone];
  }

  // Simpan Zone
  State.zones.push({
    id: Date.now(),
    // name: `Zone ${State.zones.length + 1}`,
    name: `Zone`,
    color: "#19cc2e",
    points: finalPoints,
  });

  // Reset
  State.tempZone = [];
  State.rangePreview = [];
  updateLists();
  drawChart();

  // Update counter text manual jadi 0
  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = "0 pts";
}

function cancelZone() {
  State.tempZone = [];
  State.rangePreview = [];
  // Jika sedang di mode range, kembalikan posisi preview ke current slider
  if (State.zoneSubMode === "range") updateRangeZone();

  drawChart();
  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = "0 pts";
}

function clearAllData() {
  if (confirm("Clear all?")) {
    State.points = [];
    State.zones = [];
    State.tempZone = [];
    updateLists();
    drawChart();
    updateZonePtCount();
  }
}

// ==========================================
// 3. CHART RENDERING
// ==========================================

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

// 1. Layer Grid (Paling Bawah - agar garis grid ada di belakang kurva)
const gridLayer = svg.append("g"); 

// 2. Layer Kurva & Data
const linesLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "lines-layer");
const zoneLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "zones-layer");
const labelLayer = svg.append("g");

// 3. Layer Axis/Border (Paling Atas - agar garis tepi menimpa kurva)
const axesLayer = svg.append("g");

const overlay = svg
  .append("rect")
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "transparent")
  .style("pointer-events", "all");

  const pointLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "points-layer");

// FUNGSI KONVERSI ABSOLUTE HUMIDITY

// Fungsi untuk menghitung Absolute Humidity (g/m³) dari t, w, dan Patm
function calculateAbsoluteHumidity(t, w, Patm) {
  const v = Psychro.getSpecificVolume(t, w, Patm); // m³/kg udara kering
  // Absolute Humidity = massa uap air (kg) / volume udara basah (m³)
  // AH = w / v, dengan satuan kg/m³, dikonversi ke g/m³
  return (w / v) * 1000; // g/m³
}

// Fungsi untuk menghitung W dari Absolute Humidity
function getWFromAbsoluteHumidity(t, ah, Patm) {
  // AH (g/m³) -> w (kg/kg')
  // v = (1 + w) * R_da * T_k / P_atm
  // AH = w / v * 1000
  // Kita selesaikan dengan iterasi
  let wLow = 0;
  let wHigh = 0.1; // Batas atas reasonable
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

// UPDATE FUNGSI RENDERING CHART

// Fungsi untuk mendapatkan nilai Y berdasarkan tipe sumbu Y
function getYValue(t, w, Patm) {
  if (State.yAxisType === "absoluteHumidity") {
    return calculateAbsoluteHumidity(t, w, Patm);
  }
  return w; // humidityRatio
}

// Fungsi untuk mengubah koordinat mouse ke t dan w dengan memperhitungkan tipe sumbu Y
function getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm) {
  let t, w;

  if (State.chartType === "psychrometric") {
    t = x.invert(mx);

    if (State.yAxisType === "absoluteHumidity") {
      const ah = y.invert(my);
      // Cari w yang sesuai dengan AH ini
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      // Batasi w agar tidak negatif
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = y.invert(my);
    }
  } else {
    // Mollier chart
    if (State.yAxisType === "absoluteHumidity") {
      const ah = x.invert(mx);
      t = y.invert(my);
      // Cari w yang sesuai
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = x.invert(mx);
      t = y.invert(my);
    }
  }

  // Batasi nilai dalam range
  t = Math.max(minT, Math.min(maxT, t));
  w = Math.max(0, Math.min(maxH, w));

  return { t, w };
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

  // Ambil nilai
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(maxTInput.value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const Patm = parseFloat(document.getElementById("pressure").value);

  syncZoneRangeLimits(minT, maxT);

  // Tentukan skala berdasarkan tipe chart
  let x, y;
  if (State.chartType === "psychrometric") {
    // Psychrometric: x = DBT, y = Humidity (Ratio atau Absolute)
    x = d3.scaleLinear().domain([minT, maxT]).range([0, w]);

    if (State.yAxisType === "absoluteHumidity") {
      // Hitung range untuk Absolute Humidity
      // Cari nilai maksimum AH dalam rentang yang ditampilkan
      let maxAH = 0;

      // Cek di beberapa titik untuk mendapatkan AH maksimum
      // Di suhu maksimum dengan RH 100% akan memberikan AH tertinggi
      const tStep = (maxT - minT) / 50;
      for (let t = minT; t <= maxT; t += tStep) {
        const Pws = Psychro.getSatVapPres(t);
        const Wsat = Psychro.getWFromPw(Pws, Patm);
        if (Wsat <= maxH) {
          const ah = calculateAbsoluteHumidity(t, Wsat, Patm);
          if (ah > maxAH) maxAH = ah;
        }
      }

      // Tambahkan margin 10%
      maxAH = maxAH * 1.1;
      y = d3.scaleLinear().domain([0, maxAH]).range([h, 0]);
    } else {
      y = d3.scaleLinear().domain([0, maxH]).range([h, 0]);
    }
  } else {
    // Mollier: x = Humidity, y = DBT
    if (State.yAxisType === "absoluteHumidity") {
      let maxAH = 0;
      const tStep = (maxT - minT) / 50;
      for (let t = minT; t <= maxT; t += tStep) {
        const Pws = Psychro.getSatVapPres(t);
        const Wsat = Psychro.getWFromPw(Pws, Patm);
        if (Wsat <= maxH) {
          const ah = calculateAbsoluteHumidity(t, Wsat, Patm);
          if (ah > maxAH) maxAH = ah;
        }
      }
      maxAH = maxAH * 1.1;
      x = d3.scaleLinear().domain([0, maxAH]).range([0, w]);
    } else {
      x = d3.scaleLinear().domain([0, maxH]).range([0, w]);
    }
    y = d3.scaleLinear().domain([minT, maxT]).range([h, 0]);
  }

  // Update fungsi line untuk menggunakan tipe Y yang benar
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

  // Update label sumbu Y
  updateAxisLabels();

  // GRID & AXES
  gridLayer.selectAll("*").remove();

  // Grid X (Vertikal)
  gridLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(
      d3.axisBottom(x).ticks(10).tickSize(-h).tickFormat("") // Kosongkan teks agar tidak duplikat/tebal
    )
    .call((g) => g.select(".domain").remove()) // Hapus garis border di layer grid (biar tidak dobel)
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5); // Opsional: buat grid sedikit transparan

  // Grid Y (Horizontal)
  gridLayer
    .append("g")
    .call(
      d3.axisLeft(y).ticks(10).tickSize(-w).tickFormat("") // Kosongkan teks
    )
    .call((g) => g.select(".domain").remove()) // Hapus garis border di layer grid
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5);

  // 2. GAMBAR AXIS & BORDER (Di Layer Depan)
  axesLayer.selectAll("*").remove();

  // Axis X (Border Bawah & Angka)
  axesLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(10)); // Tick size default, border (.domain) akan muncul

  // Axis Y (Border Kiri & Angka)
  axesLayer.append("g").call(d3.axisLeft(y).ticks(10));

  // Tambahan: Border Atas dan Kanan (agar chart tertutup kotak sempurna)
  // axesLayer
  //   .append("rect")
  //   .attr("width", w)
  //   .attr("height", h)
  //   .attr("fill", "none")
  //   .attr("stroke", "black")
  //   .style("pointer-events", "none");

  // LABEL SUMBU (Tetap di axesLayer agar paling atas)
  if (State.chartType === "psychrometric") {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text("Dry Bulb Temperature (°C)");
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? "Absolute Humidity (g/m³)"
          : "Humidity Ratio (kg/kg')"
      );
  } else {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? "Absolute Humidity (g/m³)"
          : "Humidity Ratio (kg/kg')"
      );
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text("Dry Bulb Temperature (°C)");
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

  // ZONES - render dengan koordinat yang sesuai
  zoneLayer.selectAll("*").remove();
  State.zones.forEach((z) => {
    // Konversi titik zona ke koordinat yang benar
    const polyStr = z.points
      .map((p) => {
        if (State.chartType === "psychrometric") {
          return [x(p.t), y(getYValue(p.t, p.w, Patm))].join(",");
        } else {
          return [x(getYValue(p.t, p.w, Patm)), y(p.t)].join(",");
        }
      })
      .join(" ");

    const rgb = hexToRgb(z.color);
    const poly = zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "user-zone")
      .attr("fill", `rgba(${rgb.r},${rgb.g},${rgb.b}, 0.3)`)
      .attr("stroke", z.color)
      .on("click", (e) => {
        e.stopPropagation();
        selectZone(z.id);
      });

    if (z.id === State.selectedZoneId) poly.classed("selected", true);

    // Hitung posisi tengah untuk label
    const cx =
      State.chartType === "psychrometric"
        ? d3.mean(z.points, (p) => x(p.t))
        : d3.mean(z.points, (p) => x(p.w));
    const cy =
      State.chartType === "psychrometric"
        ? d3.mean(z.points, (p) => y(p.w))
        : d3.mean(z.points, (p) => y(p.t));

    zoneLayer
      .append("text")
      .attr("x", cx)
      .attr("y", cy)
      .attr("text-anchor", "middle")
      .attr("fill", z.color)
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text(z.name)
      .style("pointer-events", "none");
  });

  // TEMP ZONES (Manual)
  if (State.tempZone.length > 0) {
    const path =
      State.chartType === "psychrometric"
        ? d3.line()(State.tempZone.map((p) => [x(p.t), y(p.w)]))
        : d3.line()(State.tempZone.map((p) => [x(p.w), y(p.t)]));

    zoneLayer.append("path").attr("d", path).attr("class", "temp-zone-line");

    State.tempZone.forEach((p) => {
      const cx = State.chartType === "psychrometric" ? x(p.t) : x(p.w);
      const cy = State.chartType === "psychrometric" ? y(p.w) : y(p.t);
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
        if (State.chartType === "psychrometric") {
          return [x(p.t), y(p.w)].join(",");
        } else {
          return [x(p.w), y(p.t)].join(",");
        }
      })
      .join(" ");

    zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "temp-zone-poly");
  }

  // POINTS - render dengan koordinat yang sesuai
  pointLayer.selectAll("*").remove();
  State.points.forEach((p) => {
    let cx, cy;

    if (State.chartType === "psychrometric") {
      cx = x(p.t);
      cy = y(getYValue(p.t, p.w, Patm));
    } else {
      cx = x(getYValue(p.t, p.w, Patm));
      cy = y(p.t);
    }

    const isSelected = p.id === State.selectedPointId;

    const pointGroup = pointLayer
      .append("g")
      .attr("class", "point-group")
      .on("click", (e) => {
        e.stopPropagation();
        selectPoint(p.id);
      });

    pointGroup
      .append("circle")
      .attr("class", isSelected ? "user-point selected" : "user-point")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 6)
      .attr("fill", p.color || "#ff0000");

    // Posisi label
    const labelX = cx > w * 0.8 ? cx - 15 : cx + 10;
    const labelY = cy < h * 0.2 ? cy + 15 : cy - 5;

    pointGroup
      .append("text")
      .attr("class", isSelected ? "point-label selected" : "point-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .text(p.name)
      .style("pointer-events", "none")
      .style("text-anchor", cx > w * 0.8 ? "end" : "start")
      .attr("onclick", "selectPoint(" + p.id + ")");
  });

  // Interaksi mouse - sesuaikan dengan tipe chart
  overlay
    .on("mousemove", (e) => handleMouseMove(e, x, y, minT, maxT, maxH, Patm))
    .on("mouseout", () => {
      document.getElementById("info-panel").style.display = "none";
    })
    .on("click", (e) => handleChartClick(e, x, y, minT, maxT, maxH, Patm));

  // ================= LEGEND =================
  const legG = axesLayer.append("g").attr("class", "chart-legend");

  // Tentukan posisi legend berdasarkan chart type
  if (State.chartType === "psychrometric") {
    // Psychrometric: legend di kiri atas
    legG.attr("transform", `translate(10, 10)`);
  } else {
    // Mollier: legend di kanan bawah
    legG.attr("transform", `translate(${w - 130}, ${h - 115})`); // Ganti width dengan w
  }

  // Gambar Kotak Background
  legG
    .append("rect")
    .attr("class", "legend-box")
    .attr("width", 120)
    .attr("height", 105)
    .attr("rx", 1);

  // Data Item Legend
  const legItems = [
    { c: color_rh, t: "Rel. Humidity", d: "0" },
    { c: color_h, t: "Enthalpy", d: "0" },
    { c: color_twb, t: "Wet Bulb Temp", d: "4" },
    { c: color_v, t: "Spec. Volume", d: "0" },
    { c: color_sat, t: "Saturation", d: "0"},
  ];

  legG
    .append("text")
    .text("Legend")
    .attr("class", "legend-title")
    .attr("x", "10")
    .attr("y", "17.5")

  // Render Item Legend
  legItems.forEach((item, i) => {
    const ly = 33 + i * 15;
    legG
      .append("line")
      .attr("x1", 10)
      .attr("x2", 30)
      .attr("y1", ly)
      .attr("y2", ly)
      .attr("stroke", item.c)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", item.d);
    legG
      .append("text")
      .attr("class", "legend-text")
      .attr("x", 35)
      .attr("y", ly + 4)
      .text(item.t);
  });
}

// Update fungsi handleMouseMove untuk Mollier
function handleMouseMove(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());

  // Gunakan fungsi baru untuk mendapatkan t dan w
  const { t, w } = getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm);

  // Boundary check
  if (t < minT || t > maxT || w < 0 || w > maxH) {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const d = calculateAllProperties(t, w, Patm);
  const panel = document.getElementById("info-panel");

  panel.style.display = "block";
  document.getElementById("tooltip-grid").innerHTML = generateHTMLGrid(d);

  // Positioning panel info
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

  // Gunakan fungsi baru untuk mendapatkan t dan w
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
  return `

        <!-- TEMPERATURES -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> thermometer </span> Dry Bulb Temperature</span>
            <span class="det-abbr">Tdb</span>
            <span>:</span>
            <span class="det-val">${d.Tdb.toFixed(2)} °C</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> device_thermostat </span> Wet Bulb Temperature</span>
            <span class="det-abbr">Twb</span>
            <span>:</span>
            <span class="det-val">${d.Twb.toFixed(2)} °C</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> water_drop </span> Dew Point Temperature</span>
            <span class="det-abbr">Tdp</span>
            <span>:</span>
            <span class="det-val">${d.Tdp.toFixed(2)} °C</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> ac_unit </span> Frost Point Temperature</span>
            <span class="det-abbr">Tf</span>
            <span>:</span>
            <span class="det-val">${d.Tf.toFixed(2)} °C</span>
        </div>


        <!-- MOISTURE -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> water_do </span> Humidity Ratio</span>
            <span class="det-abbr">W</span>
            <span>:</span>
            <span class="det-val">${d.W.toFixed(4)} kg/kg'</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> humidity_percentage </span> Relative Humidity</span>
            <span class="det-abbr">RH</span>
            <span>:</span>
            <span class="det-val">${d.RH.toFixed(2)} %</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> water </span> Moisture Content</span>
            <span class="det-abbr">μ</span>
            <span>:</span>
            <span class="det-val">${d.mu.toFixed(2)} %</span>
        </div>


        <!-- ENERGY & THERMOPHYSICAL -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> local_fire_department </span> Enthalpy</span>
            <span class="det-abbr">h</span>
            <span>:</span>
            <span class="det-val">${d.h.toFixed(2)} kJ/kg</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> heat </span> Specific Heat Capacity</span>
            <span class="det-abbr">Cp</span>
            <span>:</span>
            <span class="det-val">${d.cp.toFixed(3)} kJ/(kg·°C)</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> open_in_full </span> Specific Volume</span>
            <span class="det-abbr">v</span>
            <span>:</span>
            <span class="det-val">${d.v.toFixed(3)} m³/kg</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> layers </span> Density</span>
            <span class="det-abbr">ρ</span>
            <span>:</span>
            <span class="det-val">${d.rho.toFixed(2)} kg/m³</span>
        </div>


        <!-- PRESSURE -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> speed </span> Vapor Partial Pressure</span>
            <span class="det-abbr">Pw</span>
            <span>:</span>
            <span class="det-val">${d.Pw.toFixed(0)} Pa</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> speed </span> Saturation Vapor Pressure</span>
            <span class="det-abbr">Pws</span>
            <span>:</span>
            <span class="det-val">${d.Pws.toFixed(0)} Pa</span>
        </div>


        <!-- DEFICITS -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> trending_down </span> Vapor Pressure Deficit</span>
            <span class="det-abbr">VPD</span>
            <span>:</span>
            <span class="det-val">${d.VPD.toFixed(2)} Pa</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> compare_arrows </span> Humidity Deficit</span>
            <span class="det-abbr">HD</span>
            <span>:</span>
            <span class="det-val">${d.HD.toFixed(4)} kg/kg'</span>
        </div>


        <!-- CONCENTRATIONS -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> salinity </span> Absolute Humidity</span>
            <span class="det-abbr">AH</span>
            <span>:</span>
            <span class="det-val">${d.AH.toFixed(2)} g/m³</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> water_drop </span> Saturation Vapor Concentration</span>
            <span class="det-abbr">Dvs</span>
            <span>:</span>
            <span class="det-val">${d.Dvs.toFixed(2)} g/m³</span>
        </div>

        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> science </span> Volume Mixing Ratio (dry)</span>
            <span class="det-abbr">VMR</span>
            <span>:</span>
            <span class="det-val">${d.VMR.toFixed(2)} ppm</span>
        </div>


        <!-- DIFFERENCE -->
        <div class="detail-row">
            <span class="det-label"><span class="material-symbols-rounded"> difference </span> Psychrometric Difference</span>
            <span class="det-abbr">PD</span>
            <span>:</span>
            <span class="det-val">${d.PD.toFixed(2)} °C</span>
        </div>
    `;
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

  // Helper function untuk menambahkan label dengan data yang lengkap
  const addLabel = (pos, text, cls, loc, tValue = null, ahValue = null) => {
    labels[loc].push({
      pos,
      text,
      class: cls,
      tValue, // Nilai T untuk referensi
      ahValue, // Nilai AH (jika mode AH)
    });
  };

  // 1. VOLUME LINES (Specific Volume)
  for (let v = 0.75; v <= 1.11; v += 0.01) {
    const ts = Psychro.solveIntersectionWithSaturation(
      "volume",
      v,
      Patm,
      minT,
      maxT
    );
    const te = (v * Patm) / 287.058 - 273.15; // T saat W=0

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
            // Untuk psychrometric dengan AH: label di bottom pada x = x(te)
            addLabel(x(te), labelText, "lbl-v", "bottom", te, ah);
          } else {
            addLabel(x(te), labelText, "lbl-v", "bottom", te);
          }
        } else {
          const tAtMaxH = Psychro.getTdbFromVolLine(v, maxH, Patm);
          if (tAtMaxH >= minT && tAtMaxH <= maxT) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(tAtMaxH, maxH, Patm);
              // Untuk psychrometric dengan AH: label di top pada x = x(tAtMaxH)
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
            // Untuk mollier dengan AH: label di left pada y = y(minT)
            addLabel(y(minT), labelText, "lbl-v", "left", minT, ah);
          } else {
            addLabel(y(minT), labelText, "lbl-v", "left", minT);
          }
        } else {
          if (State.yAxisType === "absoluteHumidity") {
            const ah = calculateAbsoluteHumidity(te, 0, Patm);
            // Untuk mollier dengan AH: label di bottom pada x = x(ah)
            addLabel(x(ah), labelText, "lbl-v", "bottom", te, ah);
          } else {
            addLabel(x(0), labelText, "lbl-v", "bottom", te);
          }
        }
      }
    }
  }

  // 2. ENTHALPY LINES
  for (let h = -20; h <= 180; h += 5) {
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

  // 3. WET BULB LINES
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

  // 4. RELATIVE HUMIDITY LINES
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((rh) => {
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

        // Jika tidak keluar di kanan, periksa ujung atas (T = maxT)
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

        // Jika tidak keluar di atas, periksa ujung kiri (W = 0 atau mendekati 0)
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

        // Jika masih tidak ditemukan, gunakan titik terakhir yang valid
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

        // Tambahkan label berdasarkan jenis exit
        if (exitPoint && exitType) {
          // PERUBAHAN UTAMA: Gunakan fungsi getYValue untuk mendapatkan nilai y yang benar
          if (State.yAxisType === "absoluteHumidity") {
            const ah = calculateAbsoluteHumidity(
              exitPoint.t,
              exitPoint.w,
              Patm
            );
            if (exitType === "top") {
              // Untuk top, gunakan posisi x berdasarkan nilai y (AH)
              addLabel(
                x(getYValue(exitPoint.t, exitPoint.w, Patm)),
                (rh * 100).toFixed(0) + "%",
                "lbl-rh",
                "top",
                exitPoint.t,
                ah
              );
            } else if (exitType === "right") {
              // Untuk right, gunakan posisi y berdasarkan temperatur
              addLabel(
                y(exitPoint.t),
                (rh * 100).toFixed(0) + "%",
                "lbl-rh",
                "right",
                exitPoint.t,
                ah
              );
            } else if (exitType === "left") {
              // Untuk left, gunakan posisi y berdasarkan temperatur
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

  // Render smart labels dengan parameter yang diperlukan
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

  // Urutkan label berdasarkan posisinya
  labelData.sort((a, b) => a.pos - b.pos);

  // Hindari tabrakan label
  for (let i = 1; i < labelData.length; i++) {
    if (labelData[i].pos < labelData[i - 1].pos + 15) {
      labelData[i].pos = labelData[i - 1].pos + 15;
    }
  }

  // Gambar label
  labelData.forEach((d) => {
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
          xPos = d.pos; // d.pos adalah x(ah) untuk specific volume, atau x(w) untuk yang lain
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
          xPos = d.pos; // d.pos adalah x(ah) untuk specific volume
          yPos = height + bottom;
          anchor = "middle";
          alignment = "hanging";
        }
      }
    } else {
      // Mode Humidity Ratio (normal)
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

    // Filter label yang berada di luar area chart
    const isVisible =
      xPos >= -20 && xPos <= width + 20 && yPos >= -20 && yPos <= height + 20;

    if (!isVisible) return;

    // Gambar teks label
    const textElem = container
      .append("text")
      .attr("class", "smart-label " + d.class)
      .attr("x", xPos)
      .attr("y", yPos)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", alignment)
      .text(d.text);

    // Rotasi untuk label di kiri (mollier)
    if (rotate) {
      textElem
        // .attr("transform", `rotate(-90, ${xPos}, ${yPos})`)
        .attr("x", xPos - 15)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle");
    }
  });
}

updateLists();
drawChart();
window.addEventListener("resize", drawChart);

// ==========================================
// 4. DOWNLOAD
// ==========================================

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

////////////////////////////////////////////////////.chart-section

const inputHandlers = {
  "set-show-legend": (event) => {
    if (event.target.checked) {
      document.querySelector(".chart-legend").classList.remove("none");
    } else {
      document.querySelector(".chart-legend").classList.add("none");
    }
  },
};

function handleInputChange(event) {
  const inputId = event.target.id;
  if (inputHandlers[inputId]) {
    inputHandlers[inputId](event);
  }
}

const inputs = document.querySelectorAll("input");
inputs.forEach((input) => {
  input.addEventListener("input", handleInputChange);
  input.addEventListener("change", handleInputChange);
});