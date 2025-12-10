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
  mode: "view",
  points: [],
  zones: [],
  tempZone: [],
  selectedPointId: null,
  selectedZoneId: null,
  targetForManual: null,
  zoneSubMode: "manual", // 'manual' atau 'range'
  rangePreview: [], // Menyimpan 4 titik sementara dari slider
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

function calculateAllProperties(t, w, Patm) {
  const Pws = Psychro.getSatVapPres(t);
  const Pw = Psychro.getPwFromW(w, Patm);
  return {
    Tdb: t,
    W: w,
    RH: (Pw / Pws) * 100,
    Twb: Psychro.getTwbFromState(t, w, Patm),
    Tdp: Psychro.getDewPoint(Pw),
    h: Psychro.getEnthalpy(t, w),
    v: Psychro.getSpecificVolume(t, w, Patm),
    rho: (1 + w) / Psychro.getSpecificVolume(t, w, Patm),
    Pw: Pw,
    Pws: Pws,
    mu: (w / Psychro.getWFromPw(Pws, Patm)) * 100,
    cp: 1.006 + 1.86 * w,
  };
}

// ==========================================
// 2. UI HANDLERS
// ==========================================

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
  document.getElementById("tab-" + subMode).style.background = "#2196f3";
  document.getElementById("tab-" + subMode).style.color = "white";
  document.getElementById("tab-" + subMode).classList.add("active");

  document.getElementById("zone-manual-ui").style.display =
    subMode === "manual" ? "block" : "none";
  document.getElementById("zone-range-ui").style.display =
    subMode === "range" ? "block" : "none";

  if (subMode === "range") {
    State.tempZone = [];
    setupRangeDefaults(); // <--- TAMBAHAN: Reset slider saat masuk mode range
  } else {
    State.rangePreview = [];
    drawChart();
  }
}

// Sinkronisasi Slider <-> Input Angka
function syncRange(id) {
  document.getElementById("range" + id).value = document.getElementById(
    "slider" + id
  ).value;
  updateRangeZone();
}

// Fungsi Sinkronisasi Batas Slider Zone dengan Global Chart Settings
function syncZoneRangeLimits(globalMin, globalMax) {
    const ids = ['rangeTmin', 'sliderTmin', 'rangeTmax', 'sliderTmax'];
    
    ids.forEach(id => {
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
    if (State.zoneSubMode === 'range') {
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
  // ... code existing button active toggle ...
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  if (document.getElementById("btn-" + mode))
    document.getElementById("btn-" + mode).classList.add("active");

  const zoneCtrl = document.getElementById("zone-controls");
  zoneCtrl.style.display = mode === "zone" ? "block" : "none";

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

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function submitManualInput() {
  const p1Type = document.getElementById("p1Type").value;
  const p1Val = parseFloat(document.getElementById("p1Val").value);
  const p2Type = document.getElementById("p2Type").value;
  const p2Val = parseFloat(document.getElementById("p2Val").value);
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
  closeModal("manualModal");
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
        }" onclick="selectPoint(${p.id})">
            <div class="item-header">
                <div class="id-circle">${i + 1}</div>
                <div class="item-name">${p.name}</div>
                <div class="item-actions">
                    <button class="icon-btn" onclick="openEditModal('point', ${
                      p.id
                    })">⚙️</button>
                    <button class="icon-btn btn-delete" onclick="deletePoint(event, ${
                      p.id
                    })">🗑</button>
                </div>
            </div>
            <div class="item-details">${generateHTMLGrid(p.data)}</div>
        </div>`
      )
      .join("") ||
    '<div style="font-size:10px;text-align:center;color:#999;padding:10px">No points</div>';

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
                    <button class="icon-btn" onclick="openEditModal('zone', ${
                      z.id
                    })">⚙️</button>
                    <button class="icon-btn btn-delete" onclick="deleteZone(event, ${
                      z.id
                    })">🗑</button>
                </div>
            </div>
        </div>`
      )
      .join("") ||
    '<div style="font-size:10px;text-align:center;color:#999;padding:10px">No zones</div>';
}

function addPoint(t, w) {
  const Patm = parseFloat(document.getElementById("pressure").value);
  const data = calculateAllProperties(t, w, Patm);

  // PERUBAHAN: Tambahkan property 'name'
  const pt = {
    id: Date.now(),
    name: `Point ${State.points.length + 1}`, // Default Name
    t,
    w,
    data,
  };

  State.points.push(pt);
  selectPoint(pt.id);
}

function selectPoint(id) {
  State.selectedPointId = id;
  State.selectedZoneId = null;
  updateLists();
  drawChart();
}
function selectZone(id) {
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
    colorContainer.style.display = "none"; // Point tidak punya setting warna (ikut default merah)
  } else if (type === "zone") {
    const z = State.zones.find((item) => item.id === id);
    if (!z) return;
    document.getElementById("editModalTitle").innerText = "Edit Zone";
    nameInput.value = z.name;
    colorInput.value = z.color;
    colorContainer.style.display = "block";
  }

  document.getElementById("editModal").style.display = "flex";
}

function saveSettings() {
  const id = parseInt(document.getElementById("editId").value);
  const type = document.getElementById("editType").value;
  const newName = document.getElementById("editName").value;

  if (type === "point") {
    const p = State.points.find((item) => item.id === id);
    if (p) p.name = newName;
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
  closeModal("editModal");
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
    name: `Zone ${State.zones.length + 1}`,
    color: "#4caf50",
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

const axesLayer = svg.append("g");
const linesLayer = svg.append("g").attr("clip-path", "url(#chart-clip)");
const zoneLayer = svg.append("g").attr("clip-path", "url(#chart-clip)");
const pointLayer = svg.append("g").attr("clip-path", "url(#chart-clip)");
const labelLayer = svg.append("g");
const overlay = svg
  .append("rect")
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "transparent")
  .style("pointer-events", "all");

function drawChart() {
  const w = chartWrapper.clientWidth - margin.left - margin.right;
  const h = chartWrapper.clientHeight - margin.top - margin.bottom;
  if (w < 0 || h < 0) return;

  d3.select("#chart-clip rect").attr("width", w).attr("height", h);

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

  // Ambil nilai setelah divalidasi
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(maxTInput.value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const Patm = parseFloat(document.getElementById("pressure").value);

  syncZoneRangeLimits(minT, maxT);

  const x = d3.scaleLinear().domain([minT, maxT]).range([0, w]);
  const y = d3.scaleLinear().domain([0, maxH]).range([h, 0]);
  const line = d3
    .line()
    .x((d) => x(d.t))
    .y((d) => y(d.w));
  const curve = d3
    .line()
    .x((d) => x(d.t))
    .y((d) => y(d.w))
    .curve(d3.curveMonotoneX);

  // GRID & AXES
  axesLayer.selectAll("*").remove();
  axesLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(10).tickSize(-h))
    .selectAll("line")
    .attr("class", "grid-line");
  axesLayer
    .append("g")
    .call(d3.axisLeft(y).ticks(10).tickSize(-w))
    .selectAll("line")
    .attr("class", "grid-line");
  // Dry Bulb Temp (x)
  axesLayer
    .append("text")
    .attr("class", "axis-label")
    .attr("x", w / 2)
    .attr("y", h + 45)
    .text("Dry Bulb Temperature (°C)");
  // Humidity Ratio (y)
  axesLayer
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -45)
    .text("Humidity Ratio (kg/kg)");
  // // Relative Humidity (red)
  // axesLayer.append("text")
  //   .attr("x", h / 2).attr("y", -w - 35)
  //   .attr("transform", "rotate(90)")
  //   .attr("text-anchor", "end")
  //   .attr("class", "label-text rh-text")
  //   .text("Relative Humidity (%)");
  // // Enthalpy (purple)
  // axesLayer.append("text")
  //   .attr("x", 0).attr("y", -w - 35)
  //   .attr("transform", "rotate(90)")
  //   .style("text-anchor", "start")
  //   .attr("text-anchor", "end")
  //   .attr("class", "label-text h-text")
  //   .text("Enthalpy (kJ/kg)");
  // // Wet Bulb Temp (green)
  // axesLayer.append("text")
  //   .attr("x", h).attr("y", -w - 35)
  //   .attr("transform", "rotate(90)")
  //   .attr("text-anchor", "end")
  //   .attr("class", "label-text wb-text")
  //   .text("Wet Bulb Temp (°C)");
  // // Specific Volume (yellow)
  // axesLayer.append("text")
  //   .attr("class", "axis-label")
  //   .attr("x", w)
  //   .attr("y", h + 45)
  //   .attr("text-anchor", "end")
  //   .attr("class", "label-text v-text")
  //   .text("Specific Volume (m³/kg)");

  // ================= MULAI SISIPAN LEGEND =================
  const legG = axesLayer.append("g").attr("transform", `translate(10, 10)`);

  // Gambar Kotak Background
  legG
    .append("rect")
    .attr("class", "legend-box")
    .attr("width", 110)
    .attr("height", 85)
    .attr("rx", 3);

  // Data Item Legend
  const legItems = [
    { c: color_rh, t: "Rel. Humidity", d: "0" },
    { c: color_h, t: "Enthalpy", d: "0" },
    { c: color_twb, t: "Wet Bulb Temp", d: "4" },
    { c: color_v, t: "Spec. Volume", d: "0" },
    { c: color_sat, t: "Saturation", d: "0", w: 2.5 },
  ];

  // Render Item Legend
  legItems.forEach((item, i) => {
    const ly = 15 + i * 15;
    legG
      .append("line")
      .attr("x1", 10)
      .attr("x2", 30)
      .attr("y1", ly)
      .attr("y2", ly)
      .attr("stroke", item.c)
      .attr("stroke-width", item.w || 1.5)
      .attr("stroke-dasharray", item.d);
    legG
      .append("text")
      .attr("class", "legend-text")
      .attr("x", 35)
      .attr("y", ly + 4)
      .text(item.t);
  });

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
    curve
  );

  // ZONES
  zoneLayer.selectAll("*").remove();
  State.zones.forEach((z) => {
    const polyStr = z.points.map((p) => [x(p.t), y(p.w)].join(",")).join(" ");
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
    const cx = d3.mean(z.points, (p) => x(p.t));
    const cy = d3.mean(z.points, (p) => y(p.w));
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

  // TEMP ZONES (Manual or Range)
  // 1. Manual Click Mode
  if (State.tempZone.length > 0) {
    const path = d3.line()(State.tempZone.map((p) => [x(p.t), y(p.w)]));
    zoneLayer.append("path").attr("d", path).attr("class", "temp-zone-line");
    // Gambar semua titik karena ini mode manual (klik sembarang)
    State.tempZone.forEach((p) =>
      zoneLayer
        .append("circle")
        .attr("cx", x(p.t))
        .attr("cy", y(p.w))
        .attr("r", 4)
        .attr("fill", "#2196f3")
    );
  }

  // 2. Range Slider Mode
  if (State.rangePreview.length > 0) {
    // Gambar Polygon
    const polyStr = State.rangePreview
      .map((p) => [x(p.t), y(p.w)].join(","))
      .join(" ");
    zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "temp-zone-poly");

    // Gambar 4 Sudut Utama (Clamped)
    const rTmin = parseFloat(document.getElementById("rangeTmin").value);
    const rTmax = parseFloat(document.getElementById("rangeTmax").value);
    const rType = document.getElementById("rangeParamType").value;
    const rPmin = parseFloat(document.getElementById("rangeP2min").value);
    const rPmax = parseFloat(document.getElementById("rangeP2max").value);

    // Helper Clamping lokal untuk drawChart
    const solveClamped = (t, val) => {
      const res = Psychro.solveRobust("Tdb", t, rType, val, Patm);
      const Pws = Psychro.getSatVapPres(t);
      const Wmax = Psychro.getWFromPw(Pws, Patm);
      if (res.w > Wmax) res.w = Wmax;
      return res;
    };

    const corners = [
      solveClamped(rTmin, rPmin), // Kiri Bawah
      solveClamped(rTmax, rPmin), // Kanan Bawah
      solveClamped(rTmax, rPmax), // Kanan Atas
      solveClamped(rTmin, rPmax), // Kiri Atas
    ];

    corners.forEach((p) => {
      if (!isNaN(p.w)) {
        zoneLayer
          .append("circle")
          .attr("cx", x(p.t))
          .attr("cy", y(p.w))
          .attr("r", 4)
          .attr("fill", "#2196f3")
          .attr("stroke", "white")
          .attr("stroke-width", 1);
      }
    });
  }

  // POINTS
  pointLayer.selectAll("*").remove();
  State.points.forEach((p, idx) => {
    const cx = x(p.t),
      cy = y(p.w);
    if (cx < 0 || cx > w || cy < 0 || cy > h) return;
    const c = pointLayer
      .append("circle")
      .attr("class", "user-point")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 6)
      .on("click", (e) => {
        e.stopPropagation();
        selectPoint(p.id);
      });
    if (p.id === State.selectedPointId) c.classed("selected", true);
    pointLayer
      .append("text")
      .attr("x", cx + 10)
      .attr("y", cy + 3)
      .text(idx + 1)
      .attr("font-size", "10px")
      .attr("fill", "#d32f2f")
      .style("pointer-events", "none");
  });

  overlay
    .on("mousemove", (e) => handleMouseMove(e, x, y, minT, maxT, maxH, Patm))
    .on(
      "mouseout",
      () => (document.getElementById("info-panel").style.display = "none")
    )
    .on("click", (e) => handleChartClick(e, x, y, minT, maxT, maxH, Patm));
}

function handleMouseMove(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());
  const t = x.invert(mx),
    w = y.invert(my);

  // Boundary check
  if (t < minT || t > maxT || w < 0 || w > maxH) {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const d = calculateAllProperties(t, w, Patm);
  const panel = document.getElementById("info-panel");

  // Set display block dulu agar kita bisa baca width/height-nya
  panel.style.display = "block";
  document.getElementById("tooltip-grid").innerHTML = generateHTMLGrid(d);

  // --- LOGIKA POSISI BARU (X & Y FLIP) ---
  const panelW = panel.offsetWidth;
  const panelH = panel.offsetHeight;
  const wrapperW = chartWrapper.clientWidth;
  const wrapperH = chartWrapper.clientHeight;

  // Default: Kanan Bawah dari kursor
  let left = margin.left + mx + 15;
  let top = margin.top + my + 15;

  // Cek Tabrakan Kanan (Flip ke Kiri)
  if (left + panelW > wrapperW) {
    left = margin.left + mx - panelW - 15;
  }

  // Cek Tabrakan Bawah (Flip ke Atas)
  if (top + panelH > wrapperH) {
    top = margin.top + my - panelH - 15;
  }

  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function handleChartClick(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());
  const t = x.invert(mx),
    w = y.invert(my);
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
        <div class="detail-row">
            <span class="det-label">Dry Bulb Temperature</span>
            <span class="det-abbr">Tdb</span>
            <span>:</span>
            <span class="det-val">${d.Tdb.toFixed(1)} °C</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Humidity Ratio</span>
            <span class="det-abbr">W</span>
            <span>:</span>
            <span class="det-val">${d.W.toFixed(4)} kg/kg</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Relative Humidity</span>
            <span class="det-abbr">RH</span>
            <span>:</span>
            <span class="det-val">${d.RH.toFixed(1)} %</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Wet Bulb Temperature</span>
            <span class="det-abbr">Twb</span>
            <span>:</span>
            <span class="det-val">${d.Twb.toFixed(1)} °C</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Dew Point Temperature</span>
            <span class="det-abbr">Tdp</span>
            <span>:</span>
            <span class="det-val">${d.Tdp.toFixed(1)} °C</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Enthalpy</span>
            <span class="det-abbr">h</span>
            <span>:</span>
            <span class="det-val">${d.h.toFixed(1)} kJ/kg</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Specific Volume</span>
            <span class="det-abbr">v</span>
            <span>:</span>
            <span class="det-val">${d.v.toFixed(3)} c</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Density</span>
            <span class="det-abbr">ρ</span>
            <span>:</span>
            <span class="det-val">${d.rho.toFixed(2)} kg/m³</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Partial Pressure of Water Vapor</span>
            <span class="det-abbr">Pw</span>
            <span>:</span>
            <span class="det-val">${d.Pw.toFixed(0)} Pa</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Saturation Pressure of Water Vapor</span>
            <span class="det-abbr">Pws</span>
            <span>:</span>
            <span class="det-val">${d.Pws.toFixed(0)} Pa</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Moisture Content</span>
            <span class="det-abbr">μ</span>
            <span>:</span>
            <span class="det-val">${d.mu.toFixed(1)} %</span>
        </div>
        <div class="detail-row">
            <span class="det-label">Specific Heat Capacity</span>
            <span class="det-abbr">Cp</span>
            <span>:</span>
            <span class="det-val">${d.cp.toFixed(3)} kJ/(kg·°C)</span>
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

// --- RESTORED LINE DRAWING & LABELS ---
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
  curve
) {
  const labels = { right: [], top: [], bottom: [] };
  const addLabel = (pos, text, cls, loc) => {
    labels[loc].push({ pos, text, class: cls });
  };

  // 1. VOL
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
    linesG.append("path").datum(d).attr("class", "v-line").attr("d", line);

    // --- LABEL LOGIC (BARU) ---
    // Label setiap 0.05 m3/kg (0.80, 0.85, dst) agar rapi
    if (Math.round(v * 100) % 5 === 0) {
      const labelText = v.toFixed(2);

      // Cek Tabrakan Bawah (Sumbu X)
      if (te >= minT && te <= maxT) {
        addLabel(x(te), labelText, "lbl-v", "bottom");
      } else {
        // Cek Tabrakan Atas (Max Hum Ratio)
        // Jika garis volume miring ke kiri atas
        const tAtMaxH = Psychro.getTdbFromVolLine(v, maxH, Patm);
        if (tAtMaxH >= minT && tAtMaxH <= maxT) {
          addLabel(x(tAtMaxH), labelText, "lbl-v", "top");
        }
      }
    }
  }
  // 2. ENTH
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

    if (h % 10 === 0) {
      const wAtMaxT = Psychro.getWFromEnthalpyLine(maxT, h);
      if (wAtMaxT >= 0 && wAtMaxT <= maxH)
        addLabel(y(wAtMaxT), h, "lbl-h", "right");
      else if (wAtMaxT < 0 && te >= minT && te <= maxT)
        addLabel(x(te), h, "lbl-h", "bottom");
      else {
        const tAtMaxH = (h - 2501 * maxH) / (1.006 + 1.86 * maxH);
        if (tAtMaxH >= minT && tAtMaxH <= maxT)
          addLabel(x(tAtMaxH), h, "lbl-h", "top");
      }
    }
  }
  // 3. WB
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
    if (wAtMaxT >= 0 && wAtMaxT <= maxH)
      addLabel(y(wAtMaxT), wb, "lbl-wb", "right");
    else if (wAtMaxT < 0) {
      const tAtZeroW = Psychro.getTdbFromTwbZeroW(wb, Patm);
      if (tAtZeroW >= minT && tAtZeroW <= maxT)
        addLabel(x(tAtZeroW), wb, "lbl-wb", "bottom");
    }
  }
  // 4. RH
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((rh) => {
    const d = [];
    for (let t = minT; t <= maxT + 5; t += 0.25)
      d.push({ t, w: Psychro.getWFromPw(Psychro.getSatVapPres(t) * rh, Patm) });
    linesG
      .append("path")
      .datum(d)
      .attr("class", rh === 1.0 ? "saturation-line" : "rh-line")
      .attr("d", curve);
    if (rh < 1) {
      const Wmax = Psychro.getWFromPw(Psychro.getSatVapPres(maxT) * rh, Patm);
      if (Wmax <= maxH)
        addLabel(y(Wmax), (rh * 100).toFixed(0) + "%", "lbl-rh", "right");
      else {
        const Pw_target = Psychro.getPwFromW(maxH, Patm);
        const T_top = Psychro.getTempFromSatPres(Pw_target / rh);
        if (T_top >= minT && T_top <= maxT)
          addLabel(x(T_top), (rh * 100).toFixed(0) + "%", "lbl-rh", "top");
      }
    }
  });

  renderSmartLabels(labelsG, labels.right, "right", width, height);
  renderSmartLabels(labelsG, labels.bottom, "bottom", width, height);
  renderSmartLabels(labelsG, labels.top, "top", width, height);
}

function renderSmartLabels(container, labelData, position, width, height) {
  labelData.sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < labelData.length; i++)
    if (labelData[i].pos < labelData[i - 1].pos + 12)
      labelData[i].pos = labelData[i - 1].pos + 12;
  labelData.forEach((d) => {
    let x, y, anchor, alignment;
    if (position === "right") {
      x = width + 8;
      y = d.pos;
      anchor = "start";
      alignment = "middle";
      if (y > height + 20) return;
    } else if (position === "bottom") {
      x = d.pos;
      y = height + 15;
      anchor = "middle";
      alignment = "hanging";
      if (x < -10 || x > width + 10) return;
    } else if (position === "top") {
      x = d.pos;
      y = -10;
      anchor = "middle";
      alignment = "baseline";
      if (x < -10 || x > width + 10) return;
    }
    container
      .append("text")
      .attr("class", "smart-label " + d.class)
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", alignment)
      .text(d.text);
  });
}

updateLists();
drawChart();
window.addEventListener("resize", drawChart);
