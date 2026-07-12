// ==========================================
// state.js — State, HistoryManager, entity id generator
// ==========================================

// ==========================================
// GLOBAL VARIABLES
// ==========================================

const chart_margin_top = 35,
  chart_margin_right = 60,
  chart_margin_bottom = 60,
  chart_margin_left = 70,
  min_tdb = -30,
  max_tdb = 99,
  color_rh = "#ef5350",
  color_h = "#8e24aa",
  color_twb = "#43a047",
  color_v = "#fb8c00",
  color_sat = "#0056b3",
  color_tdp = "#37474f";

const MINIMAP_T_MIN = min_tdb;
const MINIMAP_T_MAX = max_tdb;
const MINIMAP_W_MIN = 0;
const MINIMAP_W_MAX = 0.2;
const MINIMAP_AUTO_VISIBLE_MS = 1100;
const DEFAULT_INFO_PRECISION_DECIMALS = 2;

let minimapAutoVisibleUntil = 0;
let minimapAutoHideTimer = null;

// ==========================================
// HISTORY MANAGER (UNDO/REDO)
// ==========================================

class HistoryManager {
  constructor(maxStates = 50) {
    this.history = [];
    this.currentIndex = -1;
    this.maxStates = maxStates;
  }

  push(state) {
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(JSON.parse(JSON.stringify(state)));
    this.currentIndex++;
    if (this.history.length > this.maxStates) {
      this.history.shift();
      this.currentIndex--;
    }
    this.updateButtons();
  }

  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.updateButtons();
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.updateButtons();
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  }

  updateButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = this.currentIndex <= 0;
    if (redoBtn) redoBtn.disabled = this.currentIndex >= this.history.length - 1;
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
    this.updateButtons();
  }
}

const historyManager = new HistoryManager();

// Numeric ids stay embeddable in inline onclick handlers; the monotonic floor
// prevents collisions when several entities are created in the same millisecond.
let _lastGeneratedEntityId = 0;
function generateEntityId() {
  const id = Math.max(Date.now(), _lastGeneratedEntityId + 1);
  _lastGeneratedEntityId = id;
  return id;
}

// ==========================================
// 1. STATE & MATH ENGINE (FINAL FIX)
// ==========================================

const State = {
  chartType: "psychrometric",
  mode: "view",
  language: "en",
  points: [],
  zones: [],
  realDataZoneVisibility: {},
  realDataZoneConfigs: {},
  minimapMode: "auto",
  infoPrecisionDecimals: DEFAULT_INFO_PRECISION_DECIMALS,
  tempZone: [],
  selectedPointId: null,
  selectedZoneId: null,
  targetForManual: null,
  zoneSubMode: "manual",
  pointSubMode: "manual",
  sensors: [],
  rangePreview: [],
  realDataZoneDraft: null,
  yAxisType: "humidityRatio",
  visibility: {
    rh: true,
    h: true,
    twb: true,
    v: true,
    sat: true,
    tdp: false
  },
  viewMinH: 0,  // lower bound of visible W window (for panning, always >= 0)
  viewMinAH: 0  // lower bound of visible AH window (g/m³)
};

historyManager.push(State);
