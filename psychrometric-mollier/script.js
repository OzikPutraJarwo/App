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
  exploreSubMode: "hover",
  probeA: null,
  probeB: null,
  compareTarget: "A",
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
  viewMinAH: 0  // lower bound of visible AH window (g/m3)
};

historyManager.push(State);

const I18N_ATTRIBUTES = ["title", "placeholder", "aria-label", "alt"];
const I18N_TEXT_NODE_BASES = new WeakMap();
const I18N_ATTR_BASES = new WeakMap();

const I18N_LITERAL_TRANSLATIONS = {
  ko: {
    "Korean Zucchini": "애호박",
    //
    "Explore": "탐색",
    "Point": "포인트",
    "Zone": "영역",
    "Settings": "설정",
    "Data": "데이터",
    "Import CSV or Excel": "CSV 또는 Excel 가져오기",
    "PNG Image": "PNG 이미지",
    "SVG Image": "SVG 이미지",
    "CSV Data": "CSV 데이터",
    "Excel Data": "Excel 데이터",
    "General": "일반",
    "Chart": "차트",
    "Range": "범위",
    "Cursor": "커서",
    "Display": "표시",
    "Language": "언어",
    "Interface Language": "인터페이스 언어",
    "English": "영어",
    "Korean": "한국어",
    "Reset All to Default": "모두 기본값으로 재설정",
    "Real Data Zones": "실측 데이터 영역",
    "Choose which zones loaded from real data should appear on the chart.": "실측 데이터에서 불러온 영역 중 차트에 표시할 항목을 선택하세요.",
    "Loading real-data zones...": "실측 데이터 영역을 불러오는 중...",
    "No real-data JSON files found in /real-data/.": "/real-data/에서 실측 데이터 JSON 파일을 찾을 수 없습니다.",
    "Unable to load real-data zone files.": "실측 데이터 영역 파일을 불러올 수 없습니다.",
    "Auto-discovery needs the app to be served over HTTP with a browsable /real-data/ folder.": "자동 인식을 사용하려면 앱이 /real-data/ 폴더 목록에 접근할 수 있는 HTTP 환경에서 제공되어야 합니다.",
    "If your server hides folder listings, add the file names to /real-data/index.json.": "서버가 폴더 목록을 숨기면 파일 이름을 /real-data/index.json에 추가하세요.",
    "Real-Data Converter": "실측 데이터 변환기",
    "Lock / Probe": "고정 / 프로브",
    "Compare A–B": "A–B 비교",
    "Psychrometric": "사이크로메트릭",
    "Mollier": "몰리에",
    "Chart Type": "차트 유형",
    "Y-Axis Type": "Y축 유형",
    "Atmospheric Pressure": "대기압",
    "Temperature Range (°C)": "온도 범위 (°C)",
    "Minimum": "최소",
    "Maximum": "최대",
    "Max Humidity Ratio (kg/kg')": "최대 습기비 (kg/kg')",
    "Max Absolute Humidity (g/m³)": "최대 절대 습도 (g/m³)",
    "Show Info Panel": "정보 패널 표시",
    "Choose the hover fields below. Selected fields appear first, and you can reorder them with the arrow buttons.": "아래에서 호버 필드를 선택하세요. 선택된 항목이 먼저 표시되며 화살표 버튼으로 순서를 바꿀 수 있습니다.",
    "Legends & Labels": "범례 및 라벨",
    "Show Legends": "범례 표시",
    "Minimap": "미니맵",
    "Auto (Zoom Only)": "자동 (줌 시에만)",
    "Always Show": "항상 표시",
    "Hide": "숨기기",
    "Visible labels": "표시할 라벨",
    "Every line": "모든 선",
    "Every 2nd line": "2번째마다",
    "Every 3rd line": "3번째마다",
    "Every 4th line": "4번째마다",
    "Visible Lines": "표시할 선",
    "Relative Humidity": "상대 습도",
    "Rel. Humidity": "상대 습도",
    "Enthalpy": "엔탈피",
    "Wet Bulb": "습구",
    "Specific Volume": "비체적",
    "Saturation": "포화",
    "Color:": "색상:",
    "Hover": "호버",
    "Lock": "고정",
    "Move cursor over chart to inspect all psychrometric properties.": "차트 위에 커서를 올려 모든 공기선도 속성을 확인하세요.",
    "Click chart to pin a probe point.": "차트를 클릭해 프로브 지점을 고정하세요.",
    "Clear Probe": "프로브 지우기",
    "Select target A or B, then click the chart to place or replace that probe.": "A 또는 B 대상을 선택한 뒤 차트를 클릭해 해당 프로브를 배치하거나 교체하세요.",
    "Reset A": "A 초기화",
    "Reset B": "B 초기화",
    "Clear All": "전체 지우기",
    "Click": "클릭",
    "Input": "입력",
    "Auto": "자동",
    "Plants": "식물",
    "Bool": "불리언",
    "Auto Zone": "자동 영역",
    "Boolean": "불리언",
    "Plant Dataset": "작물 데이터셋",
    "Shape": "형상",
    "Polygon": "다각형",
    "Oval": "타원",
    "Boundary": "경계",
    "Loose": "느슨하게",
    "Compact": "촘촘하게",
    "Method": "방법",
    "Decimal Precision": "소수점 자릿수",
    "Digits after decimal": "소수점 이하 자릿수",
    "Choose how many digits are shown after the decimal point, then pick and sort the hover fields below.": "소수점 이하 몇 자리까지 표시할지 정한 뒤, 아래에서 호버 필드를 선택하고 순서를 바꾸세요.",
    "Single Parameter": "단일 파라미터",
    "Two Parameters": "두 개 파라미터",
    "Click on chart to define vertices (min 3 pts).": "차트를 클릭해 꼭짓점을 지정하세요. (최소 3개)",
    "Finish Zone": "영역 완료",
    "Cancel": "취소",
    "Enter parameter values to place vertices (min 3 pts).": "매개변수 값을 입력해 꼭짓점을 배치하세요. (최소 3개)",
    "1st Param": "첫 번째 파라미터",
    "2nd Param": "두 번째 파라미터",
    "Dry Bulb (°C)": "건구 온도 (°C)",
    "Wet Bulb (°C)": "습구 온도 (°C)",
    "Rel. Humidity (%)": "상대 습도 (%)",
    "Humidity Ratio (kg/kg')": "습기비 (kg/kg')",
    "Add": "추가",
    "Finish": "완료",
    "Use sliders to define a rectangular zone by parameter ranges.": "슬라이더로 파라미터 범위를 지정해 사각형 영역을 만드세요.",
    "Dry Bulb Temp": "건구 온도",
    "Min": "최소",
    "Max": "최대",
    "2nd Parameter": "두 번째 파라미터",
    "Dew Point (°C)": "이슬점 (°C)",
    "Spec. Volume (m³/kg)": "비체적 (m³/kg)",
    "Generate a zone from iso-lines of a parameter between min and max bounds.": "최소값과 최대값 사이의 등치선을 이용해 영역을 생성하세요.",
    "Auto zone can use a single parameter band or a two-parameter boundary.": "자동 영역은 단일 파라미터 밴드 또는 2개 파라미터 경계를 사용할 수 있습니다.",
    "Parameter": "파라미터",
    "Preview": "미리보기",
    "Create": "생성",
    "Configure a real-data plant zone with polygon or oval boundaries.": "실측 데이터 작물 영역을 다각형 또는 타원 경계로 설정하세요.",
    "Preview updates in real time. Click Apply to show this dataset on the chart.": "미리보기가 실시간으로 갱신됩니다. 이 데이터셋을 차트에 표시하려면 적용을 누르세요.",
    "Apply": "적용",
    "No real-data plant zones are available yet.": "아직 사용할 수 있는 실측 작물 영역이 없습니다.",
    "Boolean operation between two existing zones.": "기존 두 영역에 불리언 연산을 적용합니다.",
    "Zone A": "영역 A",
    "Zone B": "영역 B",
    "Operation": "연산",
    "Intersect (A ∩ B)": "교집합 (A ∩ B)",
    "Union (A ∪ B)": "합집합 (A ∪ B)",
    "Difference (A − B)": "차집합 (A − B)",
    "Apply": "적용",
    "Batch": "배치",
    "Sensor": "센서",
    "Click on the chart to add a point.": "차트를 클릭해 포인트를 추가하세요.",
    "Enter parameter values to place a point.": "매개변수 값을 입력해 포인트를 배치하세요.",
    "Add Point": "포인트 추가",
    "Paste CSV: name, Tdb, W or Tdb, W. Lines starting with # are ignored.": "CSV를 붙여넣으세요: name, Tdb, W 또는 Tdb, W. # 로 시작하는 줄은 무시됩니다.",
    "Add All": "모두 추가",
    "Live sensor point updated via HTTP JSON endpoint.": "HTTP JSON 엔드포인트로 갱신되는 실시간 센서 포인트입니다.",
    "Sensor Name": "센서 이름",
    "Data URL": "데이터 URL",
    "Tdb field": "Tdb 필드",
    "W field": "W 필드",
    "Interval (s)": "주기 (초)",
    "Add Sensor": "센서 추가",
    "Points": "포인트",
    "Zones": "영역",
    "Input Parameters": "입력 파라미터",
    "Point Details": "포인트 상세 정보",
    "Zone Details": "영역 상세 정보",
    "Edit Point": "포인트 편집",
    "Edit Zone": "영역 편집",
    "1st Parameter:": "첫 번째 파라미터:",
    "2nd Parameter:": "두 번째 파라미터:",
    "Edit Item": "항목 편집",
    "Name:": "이름:",
    "Save": "저장",
    "Details": "상세 정보",
    "Range Parameters": "범위 파라미터",
    "Tdb Min (°C):": "건구 최소 (°C):",
    "Tdb Max (°C):": "건구 최대 (°C):",
    "Min Value:": "최소값:",
    "Max Value:": "최대값:",
    "Properties": "속성",
    "Summary": "요약",
    "Vertices": "꼭짓점",
    "Area": "면적",
    "Temp Range": "온도 범위",
    "Axis Span": "축 범위",
    "No points yet": "아직 포인트가 없습니다",
    "Add points manually, by input, in batch, or from a live sensor using the panel above.": "위 패널에서 수동, 입력, 배치 또는 실시간 센서로 포인트를 추가하세요.",
    "No zones yet": "아직 영역이 없습니다",
    "Create a zone manually, by input, by range, automatically, or with boolean logic to start mapping areas.": "수동, 입력, 범위, 자동 또는 불리언 방식으로 영역을 만들어 맵핑을 시작하세요.",
    "View details": "상세 보기",
    "Edit point": "포인트 편집",
    "Delete point": "포인트 삭제",
    "Edit zone": "영역 편집",
    "Delete zone": "영역 삭제",
    "Move up": "위로 이동",
    "Move down": "아래로 이동",
    "Legends": "범례",
    "Wet Bulb Temp": "습구 온도",
    "Spec. Volume": "비체적",
    "Dry Bulb Temperature (°C)": "건구 온도 (°C)",
    "Absolute Humidity (g/m³)": "절대 습도 (g/m³)",
    "Dry Bulb Temperature": "건구 온도",
    "Dry Bulb Temperature (Tdb)": "건구 온도 (Tdb)",
    "Absolute Humidity": "절대 습도",
    "Wet Bulb Temperature (Twb)": "습구 온도 (Twb)",
    "Wet Bulb Temperature": "습구 온도",
    "Dew Point Temperature (Tdp)": "이슬점 온도 (Tdp)",
    "Dew Point Temperature": "이슬점 온도",
    "Frost Point Temperature (Tf)": "서리점 온도 (Tf)",
    "Frost Point Temperature": "서리점 온도",
    "Humidity Ratio (W)": "습기비 (W)",
    "Humidity Ratio": "습기비",
    "Relative Humidity (RH)": "상대 습도 (RH)",
    "Moisture Content": "수분 함량",
    "Moisture Content (u)": "수분 함량 (u)",
    "Enthalpy (h)": "엔탈피 (h)",
    "Specific Heat Capacity (Cp)": "비열 (Cp)",
    "Specific Volume (v)": "비체적 (v)",
    "Density (rho)": "밀도 (rho)",
    "Vapor Partial Pressure (Pw)": "수증기 분압 (Pw)",
    "Saturation Vapor Pressure (Pws)": "포화 수증기압 (Pws)",
    "Vapor Pressure Deficit (VPD)": "증기압 결핍 (VPD)",
    "Humidity Deficit (HD)": "습도 결핍 (HD)",
    "Absolute Humidity (AH)": "절대 습도 (AH)",
    "Saturation Vapor Concentration (Dvs)": "포화 수증기 농도 (Dvs)",
    "Volume Mixing Ratio (VMR)": "부피 혼합비 (VMR)",
    "Psychrometric Difference (PD)": "공기선도 차이 (PD)",
    "Saturation Humidity Ratio (Wsat)": "포화 습기비 (Wsat)",
    "Specific Heat Capacity": "비열",
    "Density": "밀도",
    "Vapor Partial Pressure": "수증기 분압",
    "Saturation Vapor Pressure": "포화 수증기압",
    "Vapor Pressure Deficit": "증기압 결핍",
    "Humidity Deficit": "습도 결핍",
    "Saturation Humidity Ratio": "포화 습기비",
    "Saturation Vapor Concentration": "포화 수증기 농도",
    "Volume Mixing Ratio": "부피 혼합비",
    "Psychrometric Difference": "공기선도 차이",
    "Pause": "일시중지",
    "Resume": "다시 시작",
    "Remove": "제거",
    "No sensors added.": "추가된 센서가 없습니다.",
    "Waiting for data…": "데이터 대기 중…",
    "Please enter valid numbers": "올바른 숫자를 입력하세요",
    "Parameters must be different": "파라미터는 서로 달라야 합니다",
    "Calculation error. Values might be out of range.": "계산 오류입니다. 값이 범위를 벗어났을 수 있습니다.",
    "Unsupported file format. Please use CSV or Excel.": "지원되지 않는 파일 형식입니다. CSV 또는 Excel을 사용하세요.",
    "Enter valid min and max values.": "올바른 최소값과 최대값을 입력하세요.",
    "Min must be less than max.": "최소값은 최대값보다 작아야 합니다.",
    "Could not generate a valid zone. Check parameter values and chart bounds.": "유효한 영역을 생성할 수 없습니다. 파라미터 값과 차트 범위를 확인하세요.",
    "Need at least 2 zones.": "최소 2개의 영역이 필요합니다.",
    "Select two different zones.": "서로 다른 두 영역을 선택하세요.",
    "Zone not found.": "영역을 찾을 수 없습니다.",
    "Result is empty. The zones may not overlap, or the winding direction of the clicked zones may not be compatible with this operation.": "결과가 비어 있습니다. 영역이 겹치지 않거나, 클릭한 영역의 감김 방향이 이 연산과 호환되지 않을 수 있습니다.",
    "Reset all local settings, points, and zones to their defaults?": "모든 로컬 설정, 포인트, 영역을 기본값으로 재설정할까요?",
    "Explore mode": "탐색 모드",
    "Add points": "포인트 추가",
    "Add zones": "영역 추가",
    "Undo (Ctrl+Z)": "실행 취소 (Ctrl+Z)",
    "Redo (Ctrl+Y)": "다시 실행 (Ctrl+Y)",
    "Chart settings": "차트 설정",
    "Import or export data": "데이터 가져오기 또는 내보내기",
    "Menu": "메뉴",
    "Lock probe": "프로브 고정",
    "Compare A/B": "A/B 비교",
    "Click vertices": "꼭짓점 클릭",
    "Input params": "파라미터 입력",
    "Auto zone": "자동 영역",
    "Plant zones": "식물 영역",
    "Boolean op": "불리언 연산",
    "Click to place": "클릭해 배치",
    "Batch CSV": "CSV 일괄",
    "Live sensor": "실시간 센서",
    "Live Sensor": "실시간 센서",
    "Value": "값",
    "e.g. 40": "예: 40",
    "e.g. 70": "예: 70",
    "e.g. GH-Sensor-1": "예: GH-Sensor-1",
    "connecting": "연결 중",
    "polling": "폴링 중",
    "live": "수신 중",
    "stopped": "중지됨"
  }
};

const I18N_TEMPLATES = {
  en: {
    pointsCount: "{count} points",
    verticesCount: "{count} vertices",
    defaultPointName: "Point",
    defaultZoneName: "Zone",
    defaultPointIndexed: "Point {index}",
    defaultZoneIndexed: "Zone {index}",
    defaultBatchPointName: "Pt{index}",
    compareBadgeEmpty: "{target}: —",
    compareBadgeValue: "{target}: {tdb}°C · {w}",
    csvExpectedColumns: "Line {line}: expected 2 or 3 comma-separated columns",
    csvNonNumeric: "Line {line}: non-numeric value (tdb={tdb}, w={w})",
    csvWOutOfRange: "Line {line}: W={w} out of valid range [0, 0.5]",
    batchPasteFirst: "Paste CSV data above first.",
    batchPreviewRow: "{name}: Tdb={tdb}°C, W={w}",
    batchPreviewMore: "<br>... and {count} more",
    batchPreviewReady: "✓ {count} point(s) ready:<br>{rows}{more}",
    csvErrors: "Errors in CSV:\n{errors}",
    sensorErrorPrefix: "error: {message}",
    sensorFieldsNotNumeric: "Fields \"{tdbField}\" / \"{wField}\" not found or not numeric",
    sensorOutOfRange: "Values out of physical range",
    sensorDataString: "Tdb: {tdb}°C │ W: {w} kg/kg'",
    invalidHttpRange: "HTTP {status}"
  },
  ko: {
    pointsCount: "포인트 {count}개",
    verticesCount: "꼭짓점 {count}개",
    defaultPointName: "포인트",
    defaultZoneName: "영역",
    defaultPointIndexed: "포인트 {index}",
    defaultZoneIndexed: "영역 {index}",
    defaultBatchPointName: "점{index}",
    compareBadgeEmpty: "{target}: —",
    compareBadgeValue: "{target}: {tdb}°C · {w}",
    csvExpectedColumns: "{line}번째 줄: 쉼표로 구분된 열이 2개 또는 3개여야 합니다",
    csvNonNumeric: "{line}번째 줄: 숫자가 아닌 값이 있습니다 (tdb={tdb}, w={w})",
    csvWOutOfRange: "{line}번째 줄: W={w} 값이 유효 범위 [0, 0.5]를 벗어났습니다",
    batchPasteFirst: "먼저 위에 CSV 데이터를 붙여넣으세요.",
    batchPreviewRow: "{name}: Tdb={tdb}°C, W={w}",
    batchPreviewMore: "<br>... 외 {count}개",
    batchPreviewReady: "✓ {count}개 포인트 준비 완료:<br>{rows}{more}",
    csvErrors: "CSV 오류:\n{errors}",
    sensorErrorPrefix: "오류: {message}",
    sensorFieldsNotNumeric: "필드 \"{tdbField}\" / \"{wField}\"를 찾을 수 없거나 숫자가 아닙니다",
    sensorOutOfRange: "값이 물리적 범위를 벗어났습니다",
    sensorDataString: "Tdb: {tdb}°C │ W: {w} kg/kg'",
    invalidHttpRange: "HTTP {status}"
  }
};

function normalizeLanguage(language) {
  return language === "ko" ? "ko" : "en";
}

function getStoredLanguage() {
  try {
    return normalizeLanguage(window.localStorage?.getItem("psychrometric-language"));
  } catch (_) {
    return "en";
  }
}

function getCurrentLanguage() {
  return normalizeLanguage(State.language);
}

function translateLiteral(text) {
  const base = String(text ?? "");
  if (getCurrentLanguage() === "en") return base;
  return I18N_LITERAL_TRANSLATIONS[getCurrentLanguage()]?.[base] || base;
}

function formatI18n(key, params = {}) {
  const template = I18N_TEMPLATES[getCurrentLanguage()]?.[key] ?? I18N_TEMPLATES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, token) => params[token] ?? "");
}

function getLocalizedDisplayName(name, type, fallbackIndex = null) {
  const rawName = String(name ?? "").trim();

  if (!rawName) {
    if (type === "zone") {
      return fallbackIndex == null
        ? formatI18n("defaultZoneName")
        : formatI18n("defaultZoneIndexed", { index: fallbackIndex });
    }
    return fallbackIndex == null
      ? formatI18n("defaultPointName")
      : formatI18n("defaultPointIndexed", { index: fallbackIndex });
  }

  const patterns = type === "zone"
    ? [
        { regex: /^Zone$/i, value: () => formatI18n("defaultZoneName") },
        { regex: /^Zone\s+(\d+)$/i, value: (match) => formatI18n("defaultZoneIndexed", { index: match[1] }) },
        { regex: /^영역(?:\s+(\d+))?$/u, value: (match) => match[1] ? formatI18n("defaultZoneIndexed", { index: match[1] }) : formatI18n("defaultZoneName") },
      ]
    : [
        { regex: /^Point$/i, value: () => formatI18n("defaultPointName") },
        { regex: /^Point\s+(\d+)$/i, value: (match) => formatI18n("defaultPointIndexed", { index: match[1] }) },
        { regex: /^Pt(\d+)$/i, value: (match) => formatI18n("defaultBatchPointName", { index: match[1] }) },
        { regex: /^포인트(?:\s+(\d+))?$/u, value: (match) => match[1] ? formatI18n("defaultPointIndexed", { index: match[1] }) : formatI18n("defaultPointName") },
        { regex: /^점(\d+)$/u, value: (match) => formatI18n("defaultBatchPointName", { index: match[1] }) },
      ];

  for (const pattern of patterns) {
    const match = rawName.match(pattern.regex);
    if (match) return pattern.value(match);
  }

  return rawName;
}

function translateTextNode(node) {
  const base = I18N_TEXT_NODE_BASES.get(node) ?? node.nodeValue;
  if (!I18N_TEXT_NODE_BASES.has(node)) {
    I18N_TEXT_NODE_BASES.set(node, base);
  }
  const trimmed = String(base || "").trim();
  if (!trimmed) return;
  node.nodeValue = String(base).replace(trimmed, translateLiteral(trimmed));
}

function translateElementAttribute(element, attribute) {
  let baseMap = I18N_ATTR_BASES.get(element);
  if (!baseMap) {
    baseMap = {};
    I18N_ATTR_BASES.set(element, baseMap);
  }
  if (!(attribute in baseMap)) {
    baseMap[attribute] = element.getAttribute(attribute);
  }
  const base = baseMap[attribute];
  if (base == null) return;
  element.setAttribute(attribute, translateLiteral(base));
}

function applyLanguage(root = document.body) {
  const scope = root === document ? document.body : root || document.body;
  document.documentElement.lang = getCurrentLanguage();

  const textNodes = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TITLE"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  textNodes.forEach(translateTextNode);

  const elements = [scope];
  if (scope.querySelectorAll) {
    elements.push(...scope.querySelectorAll("*"));
  }

  elements.forEach((element) => {
    if (!element?.hasAttribute) return;
    I18N_ATTRIBUTES.forEach((attribute) => {
      if (element.hasAttribute(attribute)) {
        translateElementAttribute(element, attribute);
      }
    });
  });

  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = getCurrentLanguage();
  }
}

function setLanguage(language, options = {}) {
  State.language = normalizeLanguage(language);
  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = State.language;
  }
  try {
    window.localStorage?.setItem("psychrometric-language", State.language);
  } catch (_) {
    // Ignore storage failures and keep the in-memory language.
  }
  applyLanguage();
  if (options.skipRefresh) return;
  renderCursorFieldSettings(getSelectedInfoFields());
  renderRealDataZoneSettings();
  updateLists();
  renderSensorList();
  updateZonePtCount();
  refreshCompareProbeBadges();
  syncProbeAStatus();
  drawChart();
}

function getSensorStatusLabel(status) {
  if (!status) return "";
  if (status.startsWith("error: ")) {
    return formatI18n("sensorErrorPrefix", { message: status.slice(7) });
  }
  return translateLiteral(status);
}

const _sensorIntervals = {};
const REAL_DATA_DIRECTORY = "real-data";
const REAL_DATA_MANIFEST_FILES = ["index.json", "manifest.json"];
const REAL_DATA_DEFAULT_COLOR = "#4b8b3b";
const REAL_DATA_DEFAULT_SHAPE = "polygon";
const REAL_DATA_DEFAULT_COMPACTNESS = 65;

let realDataCatalog = [];
let realDataLoadState = "loading";
let realDataLoadError = "";

const Psychro = {
  R_DA: 287.058,

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

  getTdbFromVolLine: (v, W, Patm) => {
    return (v * Patm) / (287.058 * (1 + 1.6078 * W)) - 273.15;
  },

  solveRobust: (type1, val1, type2, val2, Patm) => {
    if (type2 === "Tdb" || type2 === "W") {
      [type1, type2] = [type2, type1];
      [val1, val2] = [val2, val1];
    }

    if (type1 === "Tdb") {
      const t = val1;

      if (type2 === "W") return { t, w: val2 };

      if (type2 === "RH") {
        const Pws = Psychro.getSatVapPres(t);
        const w = Psychro.getWFromPw(Pws * (val2 / 100), Patm);
        return { t, w };
      }

      if (type2 === "v") {
        const Tk = t + 273.15;
        const numerator = (val2 * Patm) / (Psychro.R_DA * Tk) - 1;
        const w = numerator / 1.6078;
        return { t, w };
      }

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

    if (type1 === "W") {
      const w = val1;

      // Direct solution: both unknowns are fully determined
      if (type2 === "Tdb") return { t: val2, w };

      let tLow = -50,
        tHigh = 100,
        tMid = 0;

      for (let i = 0; i < 40; i++) {
        tMid = (tLow + tHigh) / 2;
        let calc = 0;

        if (type2 === "RH") {
          const Pws = Psychro.getSatVapPres(tMid);
          const Pw = Psychro.getPwFromW(w, Patm);
          calc = (Pw / Pws) * 100;
          if (calc < val2) tHigh = tMid;
          else tLow = tMid;
          continue;
        } else if (type2 === "h") calc = Psychro.getEnthalpy(tMid, w);
        else if (type2 === "Twb") calc = Psychro.getTwbFromState(tMid, w, Patm);
        else if (type2 === "v") calc = Psychro.getSpecificVolume(tMid, w, Patm);

        if (calc > val2) tHigh = tMid;
        else tLow = tMid;
      }
      return { t: tMid, w };
    }

    let tLow = -20,
      tHigh = 100,
      tMid = 0;
    let lastWGuess = 0;
    for (let i = 0; i < 50; i++) {
      tMid = (tLow + tHigh) / 2;

      let wL = 0,
        wH = 0.15,
        wM = 0;
      for (let j = 0; j < 15; j++) {
        wM = (wL + wH) / 2;
        let v1Calc = 0;
        if (type1 === "h") v1Calc = Psychro.getEnthalpy(tMid, wM);
        else if (type1 === "Twb")
          v1Calc = Psychro.getTwbFromState(tMid, wM, Patm);
        else if (type1 === "v")
          v1Calc = Psychro.getSpecificVolume(tMid, wM, Patm);

        if (v1Calc > val1) wH = wM;
        else wL = wM;
      }
      let wGuess = wM;
      lastWGuess = wGuess;

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
    return { t: tMid, w: lastWGuess };
  },

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
  document.querySelectorAll("#app-charttype .charttype-btn").forEach((button) => {
    button.classList.toggle("active", button.value === type);
  });
  drawChart();

  updateAxisLabels();
  scheduleAnimatedTabRefresh();
}

function updateAxisLabels() {
  const axisLabelX = document.querySelector(".axis-label.x");
  const axisLabelY = document.querySelector(".axis-label.y");

  if (State.chartType === "psychrometric") {
    if (axisLabelX) axisLabelX.textContent = translateLiteral("Dry Bulb Temperature (°C)");
    if (axisLabelY) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelY.textContent = translateLiteral("Absolute Humidity (g/m³)");
      } else {
        axisLabelY.textContent = translateLiteral("Humidity Ratio (kg/kg')");
      }
    }
  } else {
    // Mollier chart
    if (axisLabelX) {
      if (State.yAxisType === "absoluteHumidity") {
        axisLabelX.textContent = translateLiteral("Absolute Humidity (g/m³)");
      } else {
        axisLabelX.textContent = translateLiteral("Humidity Ratio (kg/kg')");
      }
    }
    if (axisLabelY) axisLabelY.textContent = translateLiteral("Dry Bulb Temperature (°C)");
  }

  applyLanguage(document.getElementById("chart-wrapper"));
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
  if (source === 'ratio') {
    _syncAbsHumFromRatio();
  } else if (source === 'absolute') {
    _syncRatioFromAbsHum();
  }

  drawChart();
}

function _syncAbsHumFromRatio() {
  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const elMaxHum = document.getElementById("maxHum");
  const elMaxAbsHum = document.getElementById("maxAbsHum");
  const valW = parseFloat(elMaxHum.value);
  if (!elMaxAbsHum || isNaN(valW)) return;
  const avgT = (minT + maxT) / 2;
  elMaxAbsHum.value = calculateAbsoluteHumidity(avgT, valW, Patm).toFixed(1);
  const elMinHum = document.getElementById("minHum");
  const elMinAbsHum = document.getElementById("minAbsHum");
  if (elMinHum && elMinAbsHum) {
    const valMinW = parseFloat(elMinHum.value) || 0;
    elMinAbsHum.value = valMinW > 0 ? calculateAbsoluteHumidity(avgT, valMinW, Patm).toFixed(1) : "0";
  }
}

function _syncRatioFromAbsHum() {
  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const elMaxHum = document.getElementById("maxHum");
  const elMaxAbsHum = document.getElementById("maxAbsHum");
  const valAH = parseFloat(elMaxAbsHum.value);
  if (!elMaxHum || isNaN(valAH)) return;
  const avgT = (minT + maxT) / 2;
  elMaxHum.value = getWFromAbsoluteHumidity(avgT, valAH, Patm).toFixed(4);
  const elMinHum = document.getElementById("minHum");
  const elMinAbsHum = document.getElementById("minAbsHum");
  if (elMinHum && elMinAbsHum) {
    const valMinAH = parseFloat(elMinAbsHum.value) || 0;
    elMinHum.value = valMinAH > 0 ? getWFromAbsoluteHumidity(avgT, valMinAH, Patm).toFixed(4) : "0";
  }
}

function updatePressureUnit() {
  const pressureInput = document.getElementById("pressure");
  const pressureUnit = document.getElementById("pressure-unit").value;
  let currentValue = parseFloat(pressureInput.value);

  if (isNaN(currentValue)) {
    currentValue = 101325;
  }

  if (pressureUnit === "kPa") {
    pressureInput.value = (currentValue / 1000).toFixed(2);
    pressureInput.step = 0.1;
  } else {
    pressureInput.value = (currentValue * 1000).toFixed(0);
    pressureInput.step = 100;
  }

  drawChart();
}

function getPressureInPa() {
  const pressureInput = document.getElementById("pressure");
  const pressureUnit = document.getElementById("pressure-unit").value;
  let value = parseFloat(pressureInput.value);

  if (isNaN(value)) {
    value = 101325;
  }

  if (pressureUnit === "kPa") {
    return value * 1000;
  }
  return value;
}

function toggleAdvancedSettings() {
  const header = document.querySelector(".advanced-settings-header");
  const icon = document.getElementById("advanced-settings-icon");
  if (!header || !icon) return;
  
  header.classList.toggle("collapsed");
  
  if (header.classList.contains("collapsed")) {
    icon.textContent = "expand_more";
  } else {
    icon.textContent = "expand_less";
  }
}

function setSettingsTab(tabName) {
  const tabAlias = {
    range: "chart",
    cursor: "display",
  };
  const normalizedTab = tabAlias[tabName] || tabName;

  document.querySelectorAll("#settings-tabs .seg-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTabBtn === normalizedTab);
  });

  document.querySelectorAll(".settings-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsTab === normalizedTab);
  });

  scheduleAnimatedTabRefresh();
}

const RangeConfigs = {
  RH: { min: 0, max: 100, step: 1, defMin: 30, defMax: 70 },
  Twb: { min: -10, max: 50, step: 0.5, defMin: 15, defMax: 25 },
  Tdp: { min: -10, max: 50, step: 0.5, defMin: 10, defMax: 20 },
  W: { min: 0, max: 0.03, step: 0.001, defMin: 0.005, defMax: 0.015 },
  h: { min: 0, max: 150, step: 1, defMin: 40, defMax: 80 },
  v: { min: 0.75, max: 1.05, step: 0.01, defMin: 0.8, defMax: 0.9 },
};

function setupRangeDefaults() {
  const type = document.getElementById("rangeParamType").value;
  const cfg = RangeConfigs[type];
  if (!cfg) return;

  ["min", "max"].forEach((suffix) => {
    const elSlider = document.getElementById("sliderP2" + suffix);
    const elInput = document.getElementById("rangeP2" + suffix);

    elSlider.min = cfg.min;
    elSlider.max = cfg.max;
    elSlider.step = cfg.step;
    elInput.step = cfg.step;

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

  if (!minInput || !maxInput) return;

  let minVal = parseFloat(minInput.value);
  let maxVal = parseFloat(maxInput.value);

  if (minVal > maxVal) minVal = maxVal;
  if (maxVal < minVal) maxVal = minVal;

  let minLimit, maxLimit;

  if (type === "Tdb") {
    minLimit = parseFloat(document.getElementById("minTemp").value);
    maxLimit = parseFloat(document.getElementById("maxTemp").value);
  } else {
    const cfg = RangeConfigs[type];
    if (!cfg) {
      console.warn("Unknown range type:", type);
      return;
    }
    minLimit = cfg.min;
    maxLimit = cfg.max;
  }

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

const ANIMATED_TAB_CONTAINERS = "#app-charttype, #app-modebar, .seg-control";
let animatedTabResizeObserver = null;

function ensureTabIndicator(container) {
  let indicator = container.querySelector(":scope > .tab-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "tab-indicator";
    container.prepend(indicator);
  }
  return indicator;
}

function syncAnimatedTabIndicator(container) {
  if (!container) return;

  const indicator = ensureTabIndicator(container);
  const activeButton = Array.from(container.children).find((child) =>
    child.matches?.(".modebar-btn.active, .seg-btn.active")
  );

  if (!activeButton || !activeButton.offsetWidth || !container.getClientRects().length) {
    indicator.style.opacity = "0";
    return;
  }

  indicator.style.opacity = "1";
  indicator.style.width = `${activeButton.offsetWidth}px`;
  indicator.style.height = `${activeButton.offsetHeight}px`;
  indicator.style.transform = `translate3d(${activeButton.offsetLeft}px, ${activeButton.offsetTop}px, 0)`;
  indicator.style.borderRadius = window.getComputedStyle(activeButton).borderRadius;
}

function refreshAnimatedTabs() {
  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach(syncAnimatedTabIndicator);
}

function scheduleAnimatedTabRefresh() {
  if (scheduleAnimatedTabRefresh._raf) {
    cancelAnimationFrame(scheduleAnimatedTabRefresh._raf);
  }
  scheduleAnimatedTabRefresh._raf = requestAnimationFrame(() => {
    refreshAnimatedTabs();
    scheduleAnimatedTabRefresh._raf = null;
  });
}

function initializeAnimatedTabObservers() {
  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach((container) => {
    ensureTabIndicator(container);
  });

  if (!("ResizeObserver" in window)) return;
  if (!animatedTabResizeObserver) {
    animatedTabResizeObserver = new ResizeObserver(() => {
      scheduleAnimatedTabRefresh();
    });
  }

  document.querySelectorAll(ANIMATED_TAB_CONTAINERS).forEach((container) => {
    if (container.dataset.tabResizeObserved === "true") return;
    animatedTabResizeObserver.observe(container);
    container.dataset.tabResizeObserved = "true";
  });
}

function setZoneSubMode(subMode) {
  const nextSubMode = ["manual", "input", "auto", "plants", "boolean"].includes(subMode)
    ? subMode
    : "manual";

  State.zoneSubMode = nextSubMode;
  const icons = { manual: "ads_click", input: "edit_note", auto: "auto_awesome", plants: "local_florist", boolean: "join" };
  const labels = { manual: "Click", input: "Input", auto: "Auto Zone", plants: "Plants", boolean: "Boolean" };
  const icon = document.getElementById("zone-submode-icon");
  const label = document.getElementById("zone-submode-label");
  if (icon) icon.textContent = icons[nextSubMode] || "ads_click";
  if (label) label.textContent = translateLiteral(labels[nextSubMode] || nextSubMode);

  document.getElementById("zone-manual-ui").style.display =
    nextSubMode === "manual" ? "grid" : "none";
  document.getElementById("zone-input-ui").style.display =
    nextSubMode === "input" ? "grid" : "none";
  document.getElementById("zone-auto-ui").style.display =
    nextSubMode === "auto" ? "grid" : "none";
  document.getElementById("zone-plants-ui").style.display =
    nextSubMode === "plants" ? "grid" : "none";
  document.getElementById("zone-boolean-ui").style.display =
    nextSubMode === "boolean" ? "grid" : "none";

  if (nextSubMode !== "manual") {
    cancelZone();
  }

  if (nextSubMode === "boolean") {
    State.realDataZoneDraft = null;
    State.rangePreview = [];
    populateBooleanZoneSelects();
    drawChart();
  } else if (nextSubMode === "auto") {
    State.realDataZoneDraft = null;
    syncAutoZoneMethod();
  } else if (nextSubMode === "plants") {
    State.rangePreview = [];
    populatePlantsZoneDatasetSelect();
    previewPlantsZone();
  } else {
    State.realDataZoneDraft = null;
    State.rangePreview = [];
    drawChart();
  }
  ["manual","input","auto","plants","boolean"].forEach(m => {
    const b = document.getElementById("seg-zone-" + m);
    if (b) b.classList.toggle("active", m === nextSubMode);
  });
  scheduleAnimatedTabRefresh();
}

function setPointSubMode(subMode) {
  State.pointSubMode = subMode;
  const icons = { manual: "ads_click", input: "edit_note", batch: "data_table", sensor: "sensors" };
  const labels = { manual: "Click", input: "Input", batch: "Batch CSV", sensor: "Live Sensor" };
  const icon = document.getElementById("point-submode-icon");
  const label = document.getElementById("point-submode-label");
  if (icon) icon.textContent = icons[subMode] || "ads_click";
  if (label) label.textContent = translateLiteral(labels[subMode] || subMode);

  document.getElementById("point-manual-ui").style.display =
    subMode === "manual" ? "grid" : "none";
  document.getElementById("point-input-ui").style.display =
    subMode === "input" ? "grid" : "none";
  document.getElementById("point-batch-ui").style.display =
    subMode === "batch" ? "grid" : "none";
  document.getElementById("point-sensor-ui").style.display =
    subMode === "sensor" ? "grid" : "none";
  
  if (subMode === "sensor") renderSensorList();
  ["manual","input","batch","sensor"].forEach(m => {
    const b = document.getElementById("seg-point-" + m);
    if (b) b.classList.toggle("active", m === subMode);
  });
  scheduleAnimatedTabRefresh();
}

function syncRange(id) {
  const slider = document.getElementById("slider" + id);
  const input = document.getElementById("range" + id);

  input.value = slider.value;

  if (id.includes("Tmin") || id.includes("Tmax")) {
    validateRangeInputs("rangeTmin", "rangeTmax", "Tdb");
  } else if (id.includes("P2min") || id.includes("P2max")) {
    const type = document.getElementById("rangeParamType").value;
    validateRangeInputs("rangeP2min", "rangeP2max", type);
  }

  updateRangeZone();
}

function syncZoneRangeLimits(globalMin, globalMax) {
  const ids = ["rangeTmin", "sliderTmin", "rangeTmax", "sliderTmax"];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.min = globalMin;
    el.max = globalMax;

    let val = parseFloat(el.value);
    if (val < globalMin) el.value = globalMin;
    if (val > globalMax) el.value = globalMax;
  });
}

function updateRangeZone() {
  validateRangeInputs("rangeTmin", "rangeTmax", "Tdb");
  const type = document.getElementById("rangeParamType").value;
  validateRangeInputs("rangeP2min", "rangeP2max", type);

  ["Tmin", "Tmax"].forEach((k) => {
    const val = parseFloat(document.getElementById("range" + k).value);
    document.getElementById("slider" + k).value = val;
  });

  ["P2min", "P2max"].forEach((k) => {
    const val = parseFloat(document.getElementById("range" + k).value);
    document.getElementById("slider" + k).value = val;
  });

  const tMin = parseFloat(document.getElementById("rangeTmin").value);
  const tMax = parseFloat(document.getElementById("rangeTmax").value);

  const pType = document.getElementById("rangeParamType").value;
  const pMin = parseFloat(document.getElementById("rangeP2min").value);
  const pMax = parseFloat(document.getElementById("rangeP2max").value);
  const Patm = getPressureInPa();

  if (tMin >= tMax || pMin >= pMax) {
    State.rangePreview = [];
    drawChart();
    return;
  }

  const polyPoints = [];
  const step = 0.5;

  const getClampedW = (t, type, val) => {
    const res = Psychro.solveRobust("Tdb", t, type, val, Patm);
    if (isNaN(res.w)) return null;

    const Pws = Psychro.getSatVapPres(t);
    const Wmax = Psychro.getWFromPw(Pws, Patm);

    if (res.w > Wmax) res.w = Wmax;

    return res.w;
  };

  for (let t = tMin; t <= tMax; t += step) {
    const w = getClampedW(t, pType, pMin);
    if (w !== null) polyPoints.push({ t: t, w: w });
  }
  const wBR = getClampedW(tMax, pType, pMin);
  if (wBR !== null) polyPoints.push({ t: tMax, w: wBR });

  for (let t = tMax; t >= tMin; t -= step) {
    const w = getClampedW(t, pType, pMax);
    if (w !== null) polyPoints.push({ t: t, w: w });
  }
  const wTL = getClampedW(tMin, pType, pMax);
  if (wTL !== null) polyPoints.push({ t: tMin, w: wTL });

  State.rangePreview = polyPoints;
  drawChart();
}

function getAutoZoneMethod() {
  return document.getElementById("auto-zone-method")?.value || "single";
}

function syncAutoZoneMethod() {
  const method = getAutoZoneMethod();
  const singlePanel = document.getElementById("auto-zone-single-ui");
  const doublePanel = document.getElementById("auto-zone-double-ui");

  if (singlePanel) singlePanel.style.display = method === "single" ? "grid" : "none";
  if (doublePanel) doublePanel.style.display = method === "double" ? "grid" : "none";

  State.rangePreview = [];
  if (method === "double") {
    setupRangeDefaults();
    return;
  }

  drawChart();
}

function setMode(mode) {
  State.mode = mode;
  document
    .querySelectorAll(".toolbar .tool-btn, #app-modebar .modebar-btn")
    .forEach((b) => b.classList.remove("active"));
  if (document.getElementById("btn-" + mode))
    document.getElementById("btn-" + mode).classList.add("active");

  const exploreCtrl = document.getElementById("explore-controls");
  if (exploreCtrl) exploreCtrl.style.display = mode === "view" ? "grid" : "none";

  const zoneCtrl = document.getElementById("zone-controls");
  zoneCtrl.style.display = mode === "zone" ? "grid" : "none";

  const pointCtrl = document.getElementById("point-controls");
  pointCtrl.style.display = mode === "point" ? "grid" : "none";

  if (mode === "zone") {
    if (!State.zoneSubMode) setZoneSubMode("manual");
    else setZoneSubMode(State.zoneSubMode);
  }

  if (mode !== "zone") {
    cancelZone();
    State.rangePreview = [];
  }
  scheduleAnimatedTabRefresh();
  drawChart();
}

function updateZonePtCount() {
  document.getElementById("zonePtCount").innerText =
    formatI18n("pointsCount", { count: State.tempZone.length });
}

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
  const Patm = getPressureInPa();

  if (isNaN(p1Val) || isNaN(p2Val)) {
    alert(translateLiteral("Please enter valid numbers"));
    return;
  }
  if (p1Type === p2Type) {
    alert(translateLiteral("Parameters must be different"));
    return;
  }

  const res = Psychro.solveRobust(p1Type, p1Val, p2Type, p2Val, Patm);

  if (isNaN(res.t) || isNaN(res.w)) {
    alert(translateLiteral("Calculation error. Values might be out of range."));
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

// === LIST & CRUD ===

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function normalizeRealDataKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\.json$/i, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getRealDataFileBase(filePath) {
  const fileName = String(filePath || "").split("/").pop() || "";
  return fileName.replace(/\.json$/i, "");
}

function humanizeRealDataFileBase(fileBase) {
  return String(fileBase || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Real Data";
}

function normalizeRealDataFilePath(value) {
  let rawPath = "";

  if (typeof value === "string") {
    rawPath = value;
  } else if (value && typeof value === "object") {
    rawPath = value.file || value.path || value.href || "";
  }

  if (!rawPath) return "";

  const trimmedPath = String(rawPath).trim();
  if (!trimmedPath.toLowerCase().endsWith(".json")) return "";
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;

  const relativePath = trimmedPath
    .replace(/^\.\//, "")
    .replace(new RegExp(`^${REAL_DATA_DIRECTORY}\/`, "i"), "");
  const normalizedPath = `${REAL_DATA_DIRECTORY}/${relativePath}`;
  const fileName = normalizedPath.split("/").pop()?.toLowerCase();

  if (!fileName) {
    return "";
  }

  return normalizedPath;
}

function normalizeRealDataVisibilityMap(value) {
  if (!value) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return normalizeRealDataVisibilityMap(JSON.parse(trimmed));
    } catch (_) {
      return trimmed.split("|").reduce((map, entry) => {
        const key = normalizeRealDataKey(entry);
        if (key) map[key] = true;
        return map;
      }, {});
    }
  }

  if (Array.isArray(value)) {
    return value.reduce((map, entry) => {
      const key = normalizeRealDataKey(entry);
      if (key) map[key] = true;
      return map;
    }, {});
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((map, [key, enabled]) => {
      const normalizedKey = normalizeRealDataKey(key);
      if (normalizedKey) map[normalizedKey] = parseBool(enabled);
      return map;
    }, {});
  }

  return {};
}

function syncRealDataVisibilityDefaults() {
  const nextVisibility = normalizeRealDataVisibilityMap(State.realDataZoneVisibility);

  if (!realDataCatalog.length) {
    State.realDataZoneVisibility = nextVisibility;
    return;
  }

  const catalogKeys = new Set(realDataCatalog.map((definition) => definition.key));

  realDataCatalog.forEach((definition) => {
    if (!(definition.key in nextVisibility)) {
      nextVisibility[definition.key] = false;
    }
  });

  Object.keys(nextVisibility).forEach((key) => {
    if (!catalogKeys.has(key)) {
      delete nextVisibility[key];
    }
  });

  State.realDataZoneVisibility = nextVisibility;
}

function normalizeRealDataCompactness(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return REAL_DATA_DEFAULT_COMPACTNESS;
  return Math.max(0, Math.min(Math.round(numericValue), 100));
}

function getDefaultRealDataZoneConfig() {
  return {
    shape: REAL_DATA_DEFAULT_SHAPE,
    compactness: REAL_DATA_DEFAULT_COMPACTNESS,
  };
}

function normalizeRealDataZoneConfig(value) {
  if (typeof value === "string") {
    try {
      return normalizeRealDataZoneConfig(JSON.parse(value));
    } catch (_) {
      return {
        ...getDefaultRealDataZoneConfig(),
        shape: value === "oval" ? "oval" : REAL_DATA_DEFAULT_SHAPE,
      };
    }
  }

  const defaults = getDefaultRealDataZoneConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaults };
  }

  return {
    shape: value.shape === "oval" ? "oval" : defaults.shape,
    compactness: normalizeRealDataCompactness(value.compactness ?? value.boundary ?? defaults.compactness),
  };
}

function normalizeRealDataZoneConfigMap(value) {
  if (!value) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return normalizeRealDataZoneConfigMap(JSON.parse(trimmed));
    } catch (_) {
      return {};
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((map, [key, config]) => {
    const normalizedKey = normalizeRealDataKey(key);
    if (!normalizedKey) return map;
    map[normalizedKey] = normalizeRealDataZoneConfig(config);
    return map;
  }, {});
}

function syncRealDataZoneConfigDefaults() {
  const nextConfigs = normalizeRealDataZoneConfigMap(State.realDataZoneConfigs);

  if (!realDataCatalog.length) {
    State.realDataZoneConfigs = nextConfigs;
    return;
  }

  const catalogKeys = new Set(realDataCatalog.map((definition) => definition.key));

  realDataCatalog.forEach((definition) => {
    nextConfigs[definition.key] = normalizeRealDataZoneConfig(nextConfigs[definition.key]);
  });

  Object.keys(nextConfigs).forEach((key) => {
    if (!catalogKeys.has(key)) {
      delete nextConfigs[key];
    }
  });

  State.realDataZoneConfigs = nextConfigs;
}

function setRealDataZoneConfigMap(value) {
  State.realDataZoneConfigs = normalizeRealDataZoneConfigMap(value);
}

function getRealDataZoneConfig(key) {
  const normalizedKey = normalizeRealDataKey(key);
  return normalizeRealDataZoneConfig(State.realDataZoneConfigs?.[normalizedKey]);
}

function setRealDataZoneVisibilityMap(value) {
  State.realDataZoneVisibility = normalizeRealDataVisibilityMap(value);
}

function toggleRealDataZoneVisibility(key, visible) {
  const normalizedKey = normalizeRealDataKey(key);
  if (!normalizedKey) return;

  State.realDataZoneVisibility = {
    ...State.realDataZoneVisibility,
    [normalizedKey]: !!visible,
  };

  renderRealDataZoneSettings();
  drawChart();
  queuePersistedStateSave();
}

function renderRealDataZoneSettings() {
  const container = document.getElementById("real-data-zone-list");
  if (!container) return;

  if (realDataLoadState === "loading" && !realDataCatalog.length) {
    container.innerHTML = `<div class="settings-note">${escapeHtml(translateLiteral("Loading real-data zones..."))}</div>`;
    applyLanguage(container);
    return;
  }

  if (!realDataCatalog.length) {
    const summary = realDataLoadState === "error"
      ? translateLiteral("Unable to load real-data zone files.")
      : translateLiteral("No real-data JSON files found in /real-data/.");
    const helpPrimary = translateLiteral("If your server hides folder listings, add the file names to /real-data/index.json.");
    const helpSecondary = translateLiteral("Auto-discovery needs the app to be served over HTTP with a browsable /real-data/ folder.");
    container.innerHTML = `<div class="settings-note">${escapeHtml(summary)}<br>${escapeHtml(helpPrimary)}<br>${escapeHtml(helpSecondary)}</div>`;
    applyLanguage(container);
    return;
  }

  container.innerHTML = realDataCatalog.map((definition) => {
    const inputId = `real-data-zone-${definition.key}`;
    const checked = State.realDataZoneVisibility[definition.key] !== false;

    return `
      <div class="settype-checkbox pill-check">
        <input id="${inputId}" type="checkbox" data-real-data-zone-key="${escapeHtml(definition.key)}" ${checked ? "checked" : ""}>
        <label for="${inputId}">${escapeHtml(definition.name)}</label>
      </div>
    `;
  }).join("");

  container.querySelectorAll("input[data-real-data-zone-key]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.realDataZoneKey;
      toggleRealDataZoneVisibility(key, event.currentTarget.checked);
    });
  });

  applyLanguage(container);
}

function updatePlantsCompactnessLabel() {
  const compactnessInput = document.getElementById("plants-zone-compactness");
  const compactnessLabel = document.getElementById("plants-zone-compactness-label");
  if (!compactnessInput || !compactnessLabel) return;

  compactnessLabel.textContent = `${normalizeRealDataCompactness(compactnessInput.value)}%`;
}

function getPlantsZoneDraftFromControls() {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const shapeSelect = document.getElementById("plants-zone-shape");
  const compactnessInput = document.getElementById("plants-zone-compactness");
  const normalizedKey = normalizeRealDataKey(datasetSelect?.value);

  if (!normalizedKey || !realDataCatalog.some((definition) => definition.key === normalizedKey)) {
    return null;
  }

  const config = normalizeRealDataZoneConfig({
    shape: shapeSelect?.value,
    compactness: compactnessInput?.value,
  });

  return {
    key: normalizedKey,
    ...config,
  };
}

function syncPlantsZoneSelection() {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const shapeSelect = document.getElementById("plants-zone-shape");
  const compactnessInput = document.getElementById("plants-zone-compactness");
  if (!datasetSelect || !shapeSelect || !compactnessInput) return;

  const normalizedKey = normalizeRealDataKey(datasetSelect.value);
  const config = getRealDataZoneConfig(normalizedKey);

  shapeSelect.value = config.shape;
  compactnessInput.value = config.compactness;
  updatePlantsCompactnessLabel();
  previewPlantsZone();
}

function populatePlantsZoneDatasetSelect(preferredKey) {
  const datasetSelect = document.getElementById("plants-zone-dataset");
  const note = document.getElementById("plants-zone-note");
  if (!datasetSelect) return;

  if (!realDataCatalog.length) {
    datasetSelect.innerHTML = `<option value="">${escapeHtml(translateLiteral("No real-data plant zones are available yet."))}</option>`;
    datasetSelect.disabled = true;
    if (note) note.textContent = translateLiteral("No real-data plant zones are available yet.");
    State.realDataZoneDraft = null;
    drawChart();
    return;
  }

  datasetSelect.disabled = false;
  datasetSelect.innerHTML = realDataCatalog
    .map((definition) => `<option value="${escapeHtml(definition.key)}">${escapeHtml(definition.name)}</option>`)
    .join("");

  const selectedKey = normalizeRealDataKey(preferredKey)
    || normalizeRealDataKey(State.realDataZoneDraft?.key)
    || normalizeRealDataKey(datasetSelect.value)
    || realDataCatalog[0].key;

  datasetSelect.value = realDataCatalog.some((definition) => definition.key === selectedKey)
    ? selectedKey
    : realDataCatalog[0].key;

  if (note) {
    note.textContent = translateLiteral("Preview updates in real time. Click Apply to show this dataset on the chart.");
  }

  syncPlantsZoneSelection();
}

function previewPlantsZone() {
  updatePlantsCompactnessLabel();
  State.realDataZoneDraft = getPlantsZoneDraftFromControls();
  drawChart();
}

function applyPlantsZoneConfig() {
  const draft = getPlantsZoneDraftFromControls();
  if (!draft) {
    alert(translateLiteral("No real-data plant zones are available yet."));
    return;
  }

  State.realDataZoneConfigs = {
    ...normalizeRealDataZoneConfigMap(State.realDataZoneConfigs),
    [draft.key]: {
      shape: draft.shape,
      compactness: draft.compactness,
    },
  };
  State.realDataZoneVisibility = {
    ...normalizeRealDataVisibilityMap(State.realDataZoneVisibility),
    [draft.key]: true,
  };
  State.realDataZoneDraft = draft;

  renderRealDataZoneSettings();
  drawChart();
  queuePersistedStateSave();
}

async function fetchRealDataJson(filePath) {
  const response = await fetch(filePath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function extractRealDataManifestFiles(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeRealDataFilePath(entry)).filter(Boolean);
  }

  if (payload && typeof payload === "object") {
    const sourceList = Array.isArray(payload.files)
      ? payload.files
      : Array.isArray(payload.datasets)
        ? payload.datasets
        : [];

    return sourceList.map((entry) => normalizeRealDataFilePath(entry)).filter(Boolean);
  }

  return [];
}

async function discoverRealDataFilesFromDirectory() {
  try {
    const response = await fetch(`${REAL_DATA_DIRECTORY}/`, {
      cache: "no-store",
      headers: { Accept: "text/html" },
    });

    if (!response.ok) return [];

    const html = await response.text();
    if (!html) return [];

    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("a[href]"))
      .map((anchor) => anchor.getAttribute("href") || "")
      .map((href) => href.split("?")[0].split("#")[0])
      .map((href) => href.split("/").pop() || "")
      .map((fileName) => normalizeRealDataFilePath(fileName))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function getRealDataFileList() {
  const files = [];

  for (const manifestFile of REAL_DATA_MANIFEST_FILES) {
    try {
      const manifest = await fetchRealDataJson(`${REAL_DATA_DIRECTORY}/${manifestFile}`);
      files.push(...extractRealDataManifestFiles(manifest));
      if (files.length) break;
    } catch (_) {
      // Ignore missing manifest files and fall back to directory discovery.
    }
  }

  if (!files.length) {
    files.push(...await discoverRealDataFilesFromDirectory());
  }

  return Array.from(new Set(files));
}

function normalizeRealDataHumidityType(value) {
  const normalized = String(value || "RH").trim().toUpperCase();
  if (normalized === "ABSOLUTEHUMIDITY") return "AH";
  if (normalized === "HUMIDITYRATIO") return "W";
  return ["RH", "AH", "W"].includes(normalized) ? normalized : "RH";
}

function extractRealDataDefinitions(payload, filePath) {
  let sourceDefinitions = [];

  if (Array.isArray(payload)) {
    sourceDefinitions = payload;
  } else if (payload && Array.isArray(payload.zones)) {
    sourceDefinitions = payload.zones;
  } else if (payload && typeof payload === "object") {
    sourceDefinitions = [payload.zone && typeof payload.zone === "object"
      ? { ...payload, ...payload.zone }
      : payload];
  }

  const fileBase = getRealDataFileBase(filePath);

  return sourceDefinitions
    .map((definition, index) => {
      const keyBase = normalizeRealDataKey(definition?.id || definition?.key || `${fileBase}${index ? `-${index + 1}` : ""}`);
      const rows = Array.isArray(definition?.rows) ? definition.rows : [];
      const points = Array.isArray(definition?.points) ? definition.points : [];

      return {
        key: keyBase || `real-data-${index + 1}`,
        name: String(definition?.name || definition?.zoneName || humanizeRealDataFileBase(fileBase)),
        color: typeof definition?.color === "string" && definition.color ? definition.color : REAL_DATA_DEFAULT_COLOR,
        humidityType: normalizeRealDataHumidityType(definition?.humidityType || definition?.moistureType || definition?.inputType),
        rows,
        points,
      };
    })
    .filter((definition) => definition.rows.length || definition.points.length);
}

function normalizeRealDataSourcePoints(definition, Patm) {
  const sourcePoints = definition.points.length ? definition.points : definition.rows;
  const uniquePoints = [];
  const seenPoints = new Set();

  sourcePoints.forEach((entry) => {
    let point = null;

    if (definition.points.length) {
      const t = Number(entry?.t);
      const w = Number(entry?.w);
      if (Number.isFinite(t) && Number.isFinite(w) && w >= 0) {
        point = { t, w };
      } else {
        point = getRealDataPointFromRow(entry, definition.humidityType, Patm);
      }
    } else {
      point = getRealDataPointFromRow(entry, definition.humidityType, Patm);
    }

    if (!point || !Number.isFinite(point.t) || !Number.isFinite(point.w)) return;
    if (point.w < 0 || point.w > 0.5) return;

    const dedupeKey = `${point.t.toFixed(3)}|${point.w.toFixed(6)}`;
    if (seenPoints.has(dedupeKey)) return;
    seenPoints.add(dedupeKey);
    uniquePoints.push(point);
  });

  return uniquePoints;
}

function getRealDataPointBounds(points) {
  const minT = d3.min(points, (point) => point.t);
  const maxT = d3.max(points, (point) => point.t);
  const minW = d3.min(points, (point) => point.w);
  const maxW = d3.max(points, (point) => point.w);

  return {
    minT,
    maxT,
    minW,
    maxW,
    spanT: Math.max((maxT ?? 0) - (minT ?? 0), 1e-9),
    spanW: Math.max((maxW ?? 0) - (minW ?? 0), 1e-9),
  };
}

function getRealDataEdgeKey(indexA, indexB) {
  return indexA < indexB ? `${indexA}|${indexB}` : `${indexB}|${indexA}`;
}

function getRealDataNormalizedPoints(points, bounds = getRealDataPointBounds(points)) {
  const { minT, minW, spanT, spanW } = bounds;

  return points.map((point, index) => ({
    index,
    x: (point.t - minT) / spanT,
    y: (point.w - minW) / spanW,
  }));
}

function denormalizeRealDataPoint(point, bounds) {
  return {
    t: bounds.minT + point.x * bounds.spanT,
    w: bounds.minW + point.y * bounds.spanW,
  };
}

function getRealDataBoundarySampleCount(compactness) {
  const ratio = getRealDataCompactnessRatio(compactness);
  return Math.max(8, Math.round(8 + ratio * 10));
}

function getRealDataCompactnessRatio(compactness) {
  return normalizeRealDataCompactness(compactness) / 100;
}

function getRealDataPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.abs(d3.polygonArea(points.map((point) => [point.t, point.w])));
}

function getRealDataNormalizedPolygonPoints(points, bounds) {
  return getRealDataNormalizedPoints(points, bounds).map((point) => [point.x, point.y]);
}

function getRealDataDistanceToSegmentSquared(point, segmentStart, segmentEnd) {
  const deltaX = segmentEnd[0] - segmentStart[0];
  const deltaY = segmentEnd[1] - segmentStart[1];

  if (Math.abs(deltaX) < 1e-12 && Math.abs(deltaY) < 1e-12) {
    const offsetX = point[0] - segmentStart[0];
    const offsetY = point[1] - segmentStart[1];
    return offsetX * offsetX + offsetY * offsetY;
  }

  const projection = Math.max(0, Math.min(1, (
    ((point[0] - segmentStart[0]) * deltaX + (point[1] - segmentStart[1]) * deltaY)
    / (deltaX * deltaX + deltaY * deltaY)
  )));
  const closestX = segmentStart[0] + projection * deltaX;
  const closestY = segmentStart[1] + projection * deltaY;
  const diffX = point[0] - closestX;
  const diffY = point[1] - closestY;
  return diffX * diffX + diffY * diffY;
}

function isRealDataNormalizedPointInsidePolygon(point, polygon, tolerance = 5e-4) {
  if (d3.polygonContains(polygon, point)) {
    return true;
  }

  const toleranceSquared = tolerance * tolerance;
  for (let index = 0; index < polygon.length; index += 1) {
    const segmentStart = polygon[index];
    const segmentEnd = polygon[(index + 1) % polygon.length];
    if (getRealDataDistanceToSegmentSquared(point, segmentStart, segmentEnd) <= toleranceSquared) {
      return true;
    }
  }

  return false;
}

function doesRealDataBoundaryContainPoints(boundaryPoints, sourcePoints) {
  if (!Array.isArray(boundaryPoints) || boundaryPoints.length < 3) return false;
  if (!Array.isArray(sourcePoints) || !sourcePoints.length) return true;

  const bounds = getRealDataPointBounds([...boundaryPoints, ...sourcePoints]);
  const polygon = getRealDataNormalizedPolygonPoints(boundaryPoints, bounds);

  return sourcePoints.every((point) => {
    const normalizedPoint = [
      (point.t - bounds.minT) / bounds.spanT,
      (point.w - bounds.minW) / bounds.spanW,
    ];
    return isRealDataNormalizedPointInsidePolygon(normalizedPoint, polygon);
  });
}

function scaleRealDataBoundary(points, scaleFactor, bounds = getRealDataPointBounds(points)) {
  if (!(scaleFactor > 1) || !Array.isArray(points) || points.length < 3) {
    return points.map((point) => ({ t: point.t, w: point.w }));
  }

  const normalizedPoints = getRealDataNormalizedPoints(points, bounds);
  const center = {
    x: d3.mean(normalizedPoints, (point) => point.x) ?? 0.5,
    y: d3.mean(normalizedPoints, (point) => point.y) ?? 0.5,
  };

  return normalizedPoints.map((point) => denormalizeRealDataPoint({
    x: center.x + (point.x - center.x) * scaleFactor,
    y: center.y + (point.y - center.y) * scaleFactor,
  }, bounds));
}

function clampRealDataPointToSaturation(point, Patm) {
  const saturationPressure = Psychro.getSatVapPres(point.t);
  const saturationW = Psychro.getWFromPw(saturationPressure, Patm);

  return {
    t: point.t,
    w: Math.max(0, Math.min(point.w, saturationW)),
  };
}

function clipRealDataBoundaryToSaturation(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const sampleCount = getRealDataBoundarySampleCount(compactness);
  const clippedPoints = [];

  for (let index = 0; index < points.length; index += 1) {
    const pointA = points[index];
    const pointB = points[(index + 1) % points.length];
    const segmentSteps = Math.max(2, sampleCount);

    for (let stepIndex = 0; stepIndex < segmentSteps; stepIndex += 1) {
      if (index > 0 && stepIndex === 0) continue;

      const ratio = stepIndex / (segmentSteps - 1);
      const interpolatedPoint = clampRealDataPointToSaturation({
        t: pointA.t + (pointB.t - pointA.t) * ratio,
        w: pointA.w + (pointB.w - pointA.w) * ratio,
      }, Patm);

      const previousPoint = clippedPoints[clippedPoints.length - 1];
      if (
        previousPoint
        && Math.abs(previousPoint.t - interpolatedPoint.t) < 1e-6
        && Math.abs(previousPoint.w - interpolatedPoint.w) < 1e-8
      ) {
        continue;
      }

      clippedPoints.push(interpolatedPoint);
    }
  }

  return clippedPoints.length >= 3 ? clippedPoints : [];
}

function getRealDataPointDistance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function getRealDataTriangleCircumradius(pointA, pointB, pointC) {
  const sideAB = getRealDataPointDistance(pointA, pointB);
  const sideBC = getRealDataPointDistance(pointB, pointC);
  const sideCA = getRealDataPointDistance(pointC, pointA);
  const doubleArea = Math.abs(
    (pointB.x - pointA.x) * (pointC.y - pointA.y) -
    (pointB.y - pointA.y) * (pointC.x - pointA.x)
  );

  if (doubleArea <= 1e-9) return Infinity;
  return (sideAB * sideBC * sideCA) / (2 * doubleArea);
}

function traceRealDataBoundaryLoops(boundaryEdges, normalizedPoints) {
  if (boundaryEdges.length < 3) return [];

  const adjacency = new Map();
  boundaryEdges.forEach(([indexA, indexB]) => {
    if (!adjacency.has(indexA)) adjacency.set(indexA, []);
    if (!adjacency.has(indexB)) adjacency.set(indexB, []);
    adjacency.get(indexA).push(indexB);
    adjacency.get(indexB).push(indexA);
  });

  const unusedEdges = new Set(boundaryEdges.map(([indexA, indexB]) => getRealDataEdgeKey(indexA, indexB)));
  const loops = [];

  while (unusedEdges.size) {
    const startKey = unusedEdges.values().next().value;
    const [startIndex, nextIndexRaw] = startKey.split("|").map((value) => Number(value));
    const loop = [startIndex];

    let previousIndex = startIndex;
    let currentIndex = nextIndexRaw;
    unusedEdges.delete(startKey);

    while (true) {
      loop.push(currentIndex);

      const currentNeighbors = adjacency.get(currentIndex) || [];
      const availableNeighbors = currentNeighbors.filter((neighborIndex) => {
        if (neighborIndex === previousIndex) return false;
        return unusedEdges.has(getRealDataEdgeKey(currentIndex, neighborIndex));
      });

      if (!availableNeighbors.length) {
        const closingKey = getRealDataEdgeKey(currentIndex, startIndex);
        if (currentIndex !== startIndex && unusedEdges.has(closingKey)) {
          unusedEdges.delete(closingKey);
          currentIndex = startIndex;
          continue;
        }
        break;
      }

      let nextIndex = availableNeighbors[0];

      if (availableNeighbors.length > 1) {
        const prevPoint = normalizedPoints[previousIndex];
        const currentPoint = normalizedPoints[currentIndex];
        const baseAngle = Math.atan2(currentPoint.y - prevPoint.y, currentPoint.x - prevPoint.x);

        nextIndex = availableNeighbors
          .map((neighborIndex) => {
            const neighborPoint = normalizedPoints[neighborIndex];
            let turn = Math.atan2(neighborPoint.y - currentPoint.y, neighborPoint.x - currentPoint.x) - baseAngle;
            while (turn <= 0) turn += Math.PI * 2;
            return { neighborIndex, turn };
          })
          .sort((left, right) => left.turn - right.turn)[0].neighborIndex;
      }

      unusedEdges.delete(getRealDataEdgeKey(currentIndex, nextIndex));
      previousIndex = currentIndex;
      currentIndex = nextIndex;

      if (currentIndex === startIndex) break;
    }

    if (loop.length >= 4 && loop[loop.length - 1] === startIndex) {
      loop.pop();
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function buildRealDataAlphaEnvelope(points, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  const normalizedPoints = getRealDataNormalizedPoints(points);
  const delaunay = d3.Delaunay.from(normalizedPoints, (point) => point.x, (point) => point.y);
  const nearestNeighborDistances = normalizedPoints
    .map((point, index) => {
      let minDistance = Infinity;
      for (const neighborIndex of delaunay.neighbors(index)) {
        minDistance = Math.min(minDistance, getRealDataPointDistance(point, normalizedPoints[neighborIndex]));
      }
      return minDistance;
    })
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  const medianDistance = nearestNeighborDistances.length
    ? (d3.quantileSorted(nearestNeighborDistances, 0.5) ?? nearestNeighborDistances[Math.floor(nearestNeighborDistances.length / 2)])
    : 0.04;
  const upperDistance = nearestNeighborDistances.length
    ? (d3.quantileSorted(nearestNeighborDistances, 0.9) ?? nearestNeighborDistances[nearestNeighborDistances.length - 1])
    : medianDistance;
  const compactnessRatio = getRealDataCompactnessRatio(compactness);
  const baseRadius = Math.max(upperDistance * 2.8, medianDistance * 4.6, 0.02);
  const candidateRadii = [
    baseRadius * 0.16,
    baseRadius * 0.22,
    baseRadius * 0.3,
    baseRadius * 0.42,
    baseRadius * 0.58,
    baseRadius * 0.78,
    baseRadius,
    baseRadius * 1.28,
    baseRadius * 1.7,
    baseRadius * 2.25,
    baseRadius * 3,
    baseRadius * 4,
    baseRadius * 5.5,
  ].map((radius) => Math.min(Math.max(radius, 0.01), 3));
  const candidateShapes = [];
  const seenCandidates = new Set();

  for (const alphaRadius of candidateRadii) {
    const edgeCounts = new Map();

    for (let triangleIndex = 0; triangleIndex < delaunay.triangles.length; triangleIndex += 3) {
      const indexA = delaunay.triangles[triangleIndex];
      const indexB = delaunay.triangles[triangleIndex + 1];
      const indexC = delaunay.triangles[triangleIndex + 2];
      const circumradius = getRealDataTriangleCircumradius(
        normalizedPoints[indexA],
        normalizedPoints[indexB],
        normalizedPoints[indexC]
      );

      if (!Number.isFinite(circumradius) || circumradius > alphaRadius) continue;

      [
        [indexA, indexB],
        [indexB, indexC],
        [indexC, indexA],
      ].forEach(([startIndex, endIndex]) => {
        const edgeKey = getRealDataEdgeKey(startIndex, endIndex);
        edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
      });
    }

    const boundaryEdges = Array.from(edgeCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([edgeKey]) => edgeKey.split("|").map((value) => Number(value)));
    const loops = traceRealDataBoundaryLoops(boundaryEdges, normalizedPoints);

    if (!loops.length) continue;

    const outerLoop = loops
      .map((loop) => ({
        loop,
        area: Math.abs(d3.polygonArea(loop.map((index) => [normalizedPoints[index].x, normalizedPoints[index].y]))),
      }))
      .sort((left, right) => right.area - left.area)[0]?.loop;

    if (outerLoop?.length >= 3) {
      const candidate = outerLoop.map((index) => points[index]);
      if (!doesRealDataBoundaryContainPoints(candidate, points)) {
        continue;
      }

      const candidateKey = candidate
        .map((point) => `${point.t.toFixed(4)}|${point.w.toFixed(6)}`)
        .join(";");
      if (seenCandidates.has(candidateKey)) {
        continue;
      }

      seenCandidates.add(candidateKey);
      candidateShapes.push(candidate);
    }
  }

  const hull = d3.polygonHull(points.map((point) => [point.t, point.w]));
  if (hull && hull.length >= 3) {
    const hullCandidate = hull.map(([t, w]) => ({ t, w }));
    if (doesRealDataBoundaryContainPoints(hullCandidate, points)) {
      candidateShapes.push(hullCandidate);
    }
  }

  if (!candidateShapes.length) {
    return [];
  }

  const sortedCandidates = candidateShapes
    .map((candidate) => ({ candidate, area: getRealDataPolygonArea(candidate) }))
    .sort((left, right) => left.area - right.area);
  const targetIndex = sortedCandidates.length === 1
    ? 0
    : Math.round((1 - compactnessRatio) * (sortedCandidates.length - 1));
  const loosenessScale = d3.interpolateNumber(1.32, 1.01)(compactnessRatio);
  return scaleRealDataBoundary(sortedCandidates[targetIndex].candidate, loosenessScale, getRealDataPointBounds(points));
}

function getRealDataPointFromRow(row, humidityType, Patm) {
  const t = Number(row?.tdb ?? row?.t ?? row?.temperature ?? row?.temp);
  if (!Number.isFinite(t)) return null;

  let humidityValue;
  let w;

  if (humidityType === "AH") {
    humidityValue = Number(row?.ah ?? row?.absoluteHumidity ?? row?.absolute_humidity);
    if (!Number.isFinite(humidityValue) || humidityValue < 0) return null;
    w = getWFromAbsoluteHumidity(t, humidityValue, Patm);
  } else if (humidityType === "W") {
    humidityValue = Number(row?.w ?? row?.humidityRatio ?? row?.humidity_ratio);
    if (!Number.isFinite(humidityValue) || humidityValue < 0) return null;
    w = humidityValue;
  } else {
    humidityValue = Number(row?.rh ?? row?.relativeHumidity ?? row?.relative_humidity);
    if (!Number.isFinite(humidityValue) || humidityValue < 0 || humidityValue > 100) return null;
    const resolved = Psychro.solveRobust("Tdb", t, "RH", humidityValue, Patm);
    w = resolved?.w;
  }

  if (!Number.isFinite(w) || w < 0) return null;
  return { t, w };
}

function buildRealDataOval(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (points.length < 3) return [];

  const bounds = getRealDataPointBounds(points);
  const normalizedPoints = getRealDataNormalizedPoints(points, bounds);
  const centroid = {
    x: d3.mean(normalizedPoints, (point) => point.x) ?? 0.5,
    y: d3.mean(normalizedPoints, (point) => point.y) ?? 0.5,
  };

  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;

  normalizedPoints.forEach((point) => {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    covarianceXX += deltaX * deltaX;
    covarianceYY += deltaY * deltaY;
    covarianceXY += deltaX * deltaY;
  });

  const pointCount = Math.max(normalizedPoints.length, 1);
  covarianceXX /= pointCount;
  covarianceYY /= pointCount;
  covarianceXY /= pointCount;

  const trace = covarianceXX + covarianceYY;
  const determinant = covarianceXX * covarianceYY - covarianceXY * covarianceXY;
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
  const principalValue = trace / 2 + discriminant;

  let majorAxis;
  if (Math.abs(covarianceXY) > 1e-9) {
    majorAxis = { x: principalValue - covarianceYY, y: covarianceXY };
  } else {
    majorAxis = covarianceXX >= covarianceYY ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }

  const axisLength = Math.hypot(majorAxis.x, majorAxis.y) || 1;
  majorAxis = { x: majorAxis.x / axisLength, y: majorAxis.y / axisLength };
  const minorAxis = { x: -majorAxis.y, y: majorAxis.x };

  const projectedDistances = normalizedPoints.map((point) => {
    const deltaX = point.x - centroid.x;
    const deltaY = point.y - centroid.y;
    return {
      major: Math.abs(deltaX * majorAxis.x + deltaY * majorAxis.y),
      minor: Math.abs(deltaX * minorAxis.x + deltaY * minorAxis.y),
    };
  });

  const majorDistances = projectedDistances.map((distance) => distance.major).sort((left, right) => left - right);
  const minorDistances = projectedDistances.map((distance) => distance.minor).sort((left, right) => left - right);

  const compactnessRatio = getRealDataCompactnessRatio(compactness);
  const baseRadiusX = Math.max(d3.quantileSorted(majorDistances, 0.92) ?? d3.max(majorDistances) ?? 0.08, 0.04);
  const baseRadiusY = Math.max(d3.quantileSorted(minorDistances, 0.92) ?? d3.max(minorDistances) ?? 0.05, 0.03);
  const containmentScale = projectedDistances.reduce((maxScale, distance) => {
    const ellipseDistance = Math.hypot(distance.major / baseRadiusX, distance.minor / baseRadiusY);
    return Math.max(maxScale, ellipseDistance);
  }, 1);
  let expansion = d3.interpolateNumber(1.34, 1.01)(compactnessRatio);
  const sampleCount = Math.max(72, 72 + Math.round((1 - compactnessRatio) * 36));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const radiusX = Math.max(baseRadiusX * containmentScale * expansion, 0.04);
    const radiusY = Math.max(baseRadiusY * containmentScale * expansion, 0.03);
    const ovalPoints = Array.from({ length: sampleCount }, (_, index) => {
      const angle = (index / sampleCount) * Math.PI * 2;
      const localX = Math.cos(angle) * radiusX;
      const localY = Math.sin(angle) * radiusY;

      return denormalizeRealDataPoint({
        x: centroid.x + majorAxis.x * localX + minorAxis.x * localY,
        y: centroid.y + majorAxis.y * localX + minorAxis.y * localY,
      }, bounds);
    });
    const clippedOval = clipRealDataBoundaryToSaturation(ovalPoints, Patm, compactness);

    if (doesRealDataBoundaryContainPoints(clippedOval, points)) {
      return clippedOval;
    }

    expansion *= 1.08;
  }

  return [];
}

function buildRealDataEnvelope(points, Patm, compactness = REAL_DATA_DEFAULT_COMPACTNESS) {
  if (points.length < 3) return [];

  const alphaEnvelope = buildRealDataAlphaEnvelope(points, compactness);
  if (alphaEnvelope.length >= 3) {
    const clippedAlphaEnvelope = clipRealDataBoundaryToSaturation(alphaEnvelope, Patm, compactness);
    if (doesRealDataBoundaryContainPoints(clippedAlphaEnvelope, points)) {
      return clippedAlphaEnvelope;
    }
  }

  const hull = d3.polygonHull(points.map((point) => [point.t, point.w]));
  if (hull && hull.length >= 3) {
    const hullPoints = hull.map(([t, w]) => ({ t, w }));
    const expandedHullPoints = scaleRealDataBoundary(
      hullPoints,
      d3.interpolateNumber(1.28, 1.01)(getRealDataCompactnessRatio(compactness)),
      getRealDataPointBounds(points)
    );
    const clippedHullPoints = clipRealDataBoundaryToSaturation(expandedHullPoints, Patm, compactness);
    if (doesRealDataBoundaryContainPoints(clippedHullPoints, points)) {
      return clippedHullPoints;
    }
  }

  const minT = d3.min(points, (point) => point.t);
  const maxT = d3.max(points, (point) => point.t);
  const minW = d3.min(points, (point) => point.w);
  const maxW = d3.max(points, (point) => point.w);

  if (![minT, maxT, minW, maxW].every(Number.isFinite)) return [];
  if (minT === maxT || minW === maxW) return [];

  return clipRealDataBoundaryToSaturation([
    { t: minT, w: minW },
    { t: maxT, w: minW },
    { t: maxT, w: maxW },
    { t: minT, w: maxW },
  ], Patm, compactness);
}

function getActiveRealDataZoneDraft() {
  if (State.mode !== "zone" || State.zoneSubMode !== "plants" || !State.realDataZoneDraft) {
    return null;
  }

  const normalizedKey = normalizeRealDataKey(State.realDataZoneDraft.key);
  if (!normalizedKey) return null;

  return {
    key: normalizedKey,
    ...normalizeRealDataZoneConfig(State.realDataZoneDraft),
  };
}

function buildRealDataZone(definition, Patm, configOverride) {
  const sourcePoints = normalizeRealDataSourcePoints(definition, Patm);
  if (sourcePoints.length < 3) return null;

  const zoneConfig = normalizeRealDataZoneConfig(configOverride || State.realDataZoneConfigs?.[definition.key]);
  const zonePoints = zoneConfig.shape === "oval"
    ? buildRealDataOval(sourcePoints, Patm, zoneConfig.compactness)
    : definition.points.length
      ? clipRealDataBoundaryToSaturation(sourcePoints, Patm, zoneConfig.compactness)
      : buildRealDataEnvelope(sourcePoints, Patm, zoneConfig.compactness);
  if (zonePoints.length < 3) return null;

  return {
    id: `real-data-${definition.key}`,
    name: definition.name,
    color: definition.color,
    shape: zoneConfig.shape,
    compactness: zoneConfig.compactness,
    sourcePoints,
    points: zonePoints,
  };
}

function getVisibleRealDataZones(Patm) {
  const draft = getActiveRealDataZoneDraft();

  return realDataCatalog
    .filter((definition) => State.realDataZoneVisibility[definition.key] !== false || draft?.key === definition.key)
    .map((definition) => buildRealDataZone(
      definition,
      Patm,
      draft?.key === definition.key ? draft : getRealDataZoneConfig(definition.key)
    ))
    .filter(Boolean);
}

async function loadRealDataCatalog() {
  realDataLoadState = "loading";
  realDataLoadError = "";
  renderRealDataZoneSettings();

  try {
    const filePaths = await getRealDataFileList();
    const nextCatalog = [];
    let hadLoadError = false;

    for (const filePath of filePaths) {
      try {
        const payload = await fetchRealDataJson(filePath);
        nextCatalog.push(...extractRealDataDefinitions(payload, filePath));
      } catch (error) {
        hadLoadError = true;
        console.warn(`Failed to load real-data file: ${filePath}`, error);
      }
    }

    realDataCatalog = nextCatalog;
    syncRealDataVisibilityDefaults();
    syncRealDataZoneConfigDefaults();
    realDataLoadState = realDataCatalog.length ? "ready" : hadLoadError ? "error" : "empty";
  } catch (error) {
    realDataCatalog = [];
    realDataLoadState = "error";
    realDataLoadError = error instanceof Error ? error.message : String(error || "");
  }

  renderRealDataZoneSettings();
  populatePlantsZoneDatasetSelect();
  drawChart();
}

const DEFAULT_CURSOR_FIELDS = ["tdb", "ah"];

function normalizeInfoPrecisionDecimals(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INFO_PRECISION_DECIMALS;
  return Math.max(0, Math.min(6, parsed));
}

function getInfoPrecisionDecimals() {
  return normalizeInfoPrecisionDecimals(State.infoPrecisionDecimals);
}

function fmtInfo(value) {
  return value.toFixed(getInfoPrecisionDecimals());
}

const CURSOR_FIELD_DEFINITIONS = [
  { key: "tdb", label: "Dry Bulb Temperature", shortLabel: "Tdb", formatValue: (data) => `${fmtInfo(data.Tdb, 1)} °C` },
  { key: "ah", label: "Absolute Humidity", shortLabel: "AH", formatValue: (data) => `${fmtInfo(data.AH, 1)} g/m3` },
  { key: "twb", label: "Wet Bulb Temperature", shortLabel: "Twb", formatValue: (data) => `${fmtInfo(data.Twb, 1)} °C` },
  { key: "tdp", label: "Dew Point Temperature", shortLabel: "Tdp", formatValue: (data) => `${fmtInfo(data.Tdp, 1)} °C` },
  { key: "tf", label: "Frost Point Temperature", shortLabel: "Tf", formatValue: (data) => `${fmtInfo(data.Tf, 1)} °C` },
  { key: "w", label: "Humidity Ratio", shortLabel: "W", formatValue: (data) => `${fmtInfo(data.W, 4)} kg/kg'` },
  { key: "rh", label: "Relative Humidity", shortLabel: "RH", formatValue: (data) => `${fmtInfo(data.RH, 1)} %` },
  { key: "mu", label: "Moisture Content", shortLabel: "u", formatValue: (data) => `${fmtInfo(data.mu, 1)} %` },
  { key: "h", label: "Enthalpy", shortLabel: "h", formatValue: (data) => `${fmtInfo(data.h, 1)} kJ/kg` },
  { key: "cp", label: "Specific Heat Capacity", shortLabel: "Cp", formatValue: (data) => `${fmtInfo(data.cp, 3)} kJ/(kg·°C)` },
  { key: "v", label: "Specific Volume", shortLabel: "v", formatValue: (data) => `${fmtInfo(data.v, 3)} m3/kg` },
  { key: "rho", label: "Density", shortLabel: "rho", formatValue: (data) => `${fmtInfo(data.rho, 2)} kg/m3` },
  { key: "pw", label: "Vapor Partial Pressure", shortLabel: "Pw", formatValue: (data) => `${fmtInfo(data.Pw, 0)} Pa` },
  { key: "pws", label: "Saturation Vapor Pressure", shortLabel: "Pws", formatValue: (data) => `${fmtInfo(data.Pws, 0)} Pa` },
  { key: "vpd", label: "Vapor Pressure Deficit", shortLabel: "VPD", formatValue: (data) => `${fmtInfo(data.VPD, 1)} Pa` },
  { key: "hd", label: "Humidity Deficit", shortLabel: "HD", formatValue: (data) => `${fmtInfo(data.HD, 4)} kg/kg'` },
  { key: "wsat", label: "Saturation Humidity Ratio", shortLabel: "Wsat", formatValue: (data) => `${fmtInfo(data.Wsat, 4)} kg/kg'` },
  { key: "dvs", label: "Saturation Vapor Concentration", shortLabel: "Dvs", formatValue: (data) => `${fmtInfo(data.Dvs, 1)} g/m3` },
  { key: "vmr", label: "Volume Mixing Ratio", shortLabel: "VMR", formatValue: (data) => `${fmtInfo(data.VMR, 1)} ppm` },
  { key: "pd", label: "Psychrometric Difference", shortLabel: "PD", formatValue: (data) => `${fmtInfo(data.PD, 1)} °C` },
];

const CURSOR_FIELD_MAP = CURSOR_FIELD_DEFINITIONS.reduce((accumulator, definition) => {
  accumulator[definition.key] = definition;
  return accumulator;
}, {});

function normalizeCursorFields(fields) {
  const validKeys = new Set(CURSOR_FIELD_DEFINITIONS.map((definition) => definition.key));
  const source = Array.isArray(fields) ? fields : String(fields || "").split("|");
  const normalized = [];
  const seen = new Set();

  source.forEach((field) => {
    const key = String(field || "").trim().toLowerCase();
    if (!validKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized.length ? normalized : [...DEFAULT_CURSOR_FIELDS];
}

function getImportedCursorFields(settings = {}) {
  if (settings.infoFields !== undefined) {
    return normalizeCursorFields(String(settings.infoFields).split("|"));
  }

  const legacyFields = [];
  if (settings.infoPrimary) legacyFields.push(settings.infoPrimary);
  if (settings.infoSecondary) legacyFields.push(settings.infoSecondary);
  return normalizeCursorFields(legacyFields);
}

function getSelectedInfoFields() {
  const checked = Array.from(document.querySelectorAll("#cursor-fields-list .cursor-field-toggle:checked"))
    .map((input) => String(input.value || "").trim().toLowerCase());

  return checked.length ? checked : [...DEFAULT_CURSOR_FIELDS];
}

function renderCursorFieldSettings(selectedFields = DEFAULT_CURSOR_FIELDS) {
  const container = document.getElementById("cursor-fields-list");
  if (!container) return;

  const selected = normalizeCursorFields(selectedFields);
  const orderedKeys = [
    ...selected,
    ...CURSOR_FIELD_DEFINITIONS.map((definition) => definition.key).filter((key) => !selected.includes(key)),
  ];

  container.innerHTML = orderedKeys.map((key) => {
    const definition = CURSOR_FIELD_MAP[key];
    const selectedIndex = selected.indexOf(key);
    const checked = selectedIndex !== -1;
    return `
      <div class="cursor-field-row ${checked ? "selected" : ""}">
        <label class="cursor-field-main" for="cursor-field-${definition.key}">
          <input
            class="cursor-field-toggle"
            type="checkbox"
            id="cursor-field-${definition.key}"
            value="${definition.key}"
            ${checked ? "checked" : ""}
            onchange="toggleCursorField('${definition.key}', this.checked)">
          <span class="cursor-field-copy">
            <strong>${escapeHtml(definition.shortLabel)}</strong>
            <em>${escapeHtml(definition.label)}</em>
          </span>
        </label>
        <div class="cursor-field-sort">
          <button type="button" class="cursor-sort-btn" onclick="moveCursorField('${definition.key}', -1)" ${checked && selectedIndex > 0 ? "" : "disabled"} title="Move up">
            <span class="material-symbols-rounded">keyboard_arrow_up</span>
          </button>
          <button type="button" class="cursor-sort-btn" onclick="moveCursorField('${definition.key}', 1)" ${checked && selectedIndex < selected.length - 1 ? "" : "disabled"} title="Move down">
            <span class="material-symbols-rounded">keyboard_arrow_down</span>
          </button>
        </div>
      </div>`;
  }).join("");

  applyLanguage(container);
}

function toggleCursorField(key, checked) {
  let selected = getSelectedInfoFields();

  if (checked) {
    if (!selected.includes(key)) selected.push(key);
  } else {
    const next = selected.filter((field) => field !== key);
    selected = next.length ? next : selected;
  }

  renderCursorFieldSettings(selected);
  queuePersistedStateSave();
}

function moveCursorField(key, direction) {
  const selected = getSelectedInfoFields();
  const index = selected.indexOf(key);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= selected.length) return;

  [selected[index], selected[targetIndex]] = [selected[targetIndex], selected[index]];
  renderCursorFieldSettings(selected);
  queuePersistedStateSave();
}

function setInfoPrecisionDecimals(decimals) {
  State.infoPrecisionDecimals = normalizeInfoPrecisionDecimals(decimals);
  const el = document.getElementById("set-info-precision");
  if (el) el.value = String(State.infoPrecisionDecimals);
  updateLists();
  queuePersistedStateSave();
}

function normalizeMinimapMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["auto", "show", "hide"].includes(mode) ? mode : "auto";
}

function shouldShowMinimapNow() {
  const mode = normalizeMinimapMode(State.minimapMode);
  if (mode === "show") return true;
  if (mode === "hide") return false;
  return Date.now() < minimapAutoVisibleUntil;
}

function updateMinimapVisibilityState() {
  const container = document.getElementById("chart-minimap");
  if (!container) return;
  container.classList.toggle("is-visible", shouldShowMinimapNow());
}

function registerMinimapZoomActivity() {
  if (normalizeMinimapMode(State.minimapMode) !== "auto") return;

  minimapAutoVisibleUntil = Date.now() + MINIMAP_AUTO_VISIBLE_MS;
  updateMinimapVisibilityState();

  if (minimapAutoHideTimer) {
    window.clearTimeout(minimapAutoHideTimer);
  }

  minimapAutoHideTimer = window.setTimeout(() => {
    minimapAutoHideTimer = null;
    updateMinimapVisibilityState();
  }, MINIMAP_AUTO_VISIBLE_MS + 40);
}

function setMinimapMode(mode, options = {}) {
  State.minimapMode = normalizeMinimapMode(mode);

  const minimapModeInput = document.getElementById("set-minimap-mode");
  if (minimapModeInput) {
    minimapModeInput.value = State.minimapMode;
  }

  if (State.minimapMode !== "auto") {
    minimapAutoVisibleUntil = 0;
    if (minimapAutoHideTimer) {
      window.clearTimeout(minimapAutoHideTimer);
      minimapAutoHideTimer = null;
    }
  } else if (!options.keepAutoVisible) {
    minimapAutoVisibleUntil = 0;
  }

  updateMinimapVisibilityState();
  if (options.redraw === false) return;
  drawChart();
}

function getInfoFieldMeta(field, data) {
  const axisX = State.chartType === "psychrometric"
    ? { label: "Tdb", value: `${fmtInfo(data.Tdb, 1)} °C` }
    : State.yAxisType === "absoluteHumidity"
      ? { label: "AH", value: `${fmtInfo(data.AH, 1)} g/m3` }
      : { label: "W", value: `${fmtInfo(data.W, 4)} kg/kg'` };

  const axisY = State.chartType === "psychrometric"
    ? State.yAxisType === "absoluteHumidity"
      ? { label: "AH", value: `${fmtInfo(data.AH, 1)} g/m3` }
      : { label: "W", value: `${fmtInfo(data.W, 4)} kg/kg'` }
    : { label: "Tdb", value: `${fmtInfo(data.Tdb, 1)} °C` };

  const fieldMap = {
    "axis-x": axisX,
    "axis-y": axisY,
  };

  CURSOR_FIELD_DEFINITIONS.forEach((definition) => {
    fieldMap[definition.key] = {
      label: definition.shortLabel,
      value: definition.formatValue(data),
    };
  });

  return fieldMap[field] || fieldMap["axis-x"];
}

function renderInfoPanelRows(data) {
  return getSelectedInfoFields()
    .map((field) => {
      const meta = getInfoFieldMeta(field, data);
      return `
        <div class="info-mini-row">
          <span class="info-mini-key">${escapeHtml(meta.label)}</span>
          <span class="info-mini-val">${escapeHtml(meta.value)}</span>
        </div>`;
    })
    .join("");
}

function buildDetailMetricCard(label, value) {
  return `
    <div class="detail-row">
      <span class="det-abbr">${escapeHtml(translateLiteral(label))}</span>
      <span class="det-val">${escapeHtml(value)}</span>
    </div>`;
}

function buildStatCell(label, value) {
  return `
    <div class="item-stat">
      <span class="item-stat-label">${escapeHtml(label)}</span>
      <strong class="item-stat-value">${escapeHtml(value)}</strong>
    </div>`;
}

function buildEmptyState(icon, title, caption) {
  return `
    <div class="list-empty">
      <span class="material-symbols-rounded">${icon}</span>
      <div class="list-empty-title">${escapeHtml(title)}</div>
      <div class="list-empty-caption">${escapeHtml(caption)}</div>
    </div>`;
}

function getZoneDisplayPoints(zone) {
  const Patm = getPressureInPa();
  return zone.points.map((point) => {
    const data = calculateAllProperties(point.t, point.w, Patm);
    return {
      raw: point,
      data,
      x: State.chartType === "psychrometric"
        ? point.t
        : (State.yAxisType === "absoluteHumidity" ? data.AH : point.w),
      y: State.chartType === "psychrometric"
        ? (State.yAxisType === "absoluteHumidity" ? data.AH : point.w)
        : point.t,
    };
  });
}

function estimatePolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function isPointInsideDisplayPolygon(x, y, polygonPoints) {
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getDistanceToSegment(x, y, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (!lengthSquared) {
    return Math.hypot(x - start.x, y - start.y);
  }

  const projection = ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const projectedX = start.x + deltaX * clampedProjection;
  const projectedY = start.y + deltaY * clampedProjection;
  return Math.hypot(x - projectedX, y - projectedY);
}

function findZoneLabelPosition(displayPoints) {
  if (!Array.isArray(displayPoints) || displayPoints.length === 0) {
    return { x: 0, y: 0 };
  }
  if (displayPoints.length < 3) {
    return { x: displayPoints[0].x, y: displayPoints[0].y };
  }

  const centroidTuple = d3.polygonCentroid(displayPoints.map((point) => [point.x, point.y]));
  const centroid = {
    x: centroidTuple[0],
    y: centroidTuple[1],
  };

  if (Number.isFinite(centroid.x) && Number.isFinite(centroid.y)
      && isPointInsideDisplayPolygon(centroid.x, centroid.y, displayPoints)) {
    return centroid;
  }

  const bounds = displayPoints.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    maxX: Math.max(acc.maxX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxY: Math.max(acc.maxY, point.y),
  }), {
    minX: displayPoints[0].x,
    maxX: displayPoints[0].x,
    minY: displayPoints[0].y,
    maxY: displayPoints[0].y,
  });

  const centerX = Number.isFinite(centroid.x) ? centroid.x : (bounds.minX + bounds.maxX) / 2;
  const centerY = Number.isFinite(centroid.y) ? centroid.y : (bounds.minY + bounds.maxY) / 2;
  let bestPoint = null;
  let bestScore = -Infinity;
  const steps = 18;

  for (let xStep = 0; xStep <= steps; xStep++) {
    for (let yStep = 0; yStep <= steps; yStep++) {
      const x = bounds.minX + ((bounds.maxX - bounds.minX) * xStep) / steps;
      const y = bounds.minY + ((bounds.maxY - bounds.minY) * yStep) / steps;
      if (!isPointInsideDisplayPolygon(x, y, displayPoints)) continue;

      let edgeDistance = Infinity;
      for (let i = 0; i < displayPoints.length; i++) {
        const start = displayPoints[i];
        const end = displayPoints[(i + 1) % displayPoints.length];
        edgeDistance = Math.min(edgeDistance, getDistanceToSegment(x, y, start, end));
      }

      const centroidDistance = Math.hypot(x - centerX, y - centerY);
      const score = edgeDistance - centroidDistance * 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  if (bestPoint) {
    return bestPoint;
  }

  for (const point of displayPoints) {
    const midpoint = {
      x: (point.x + centerX) / 2,
      y: (point.y + centerY) / 2,
    };
    if (isPointInsideDisplayPolygon(midpoint.x, midpoint.y, displayPoints)) {
      return midpoint;
    }
  }

  return { x: displayPoints[0].x, y: displayPoints[0].y };
}

function formatZoneArea(area) {
  if (!isFinite(area)) return "—";
  const decimals = area < 0.1 ? 4 : area < 10 ? 3 : 2;
  const unit = State.yAxisType === "absoluteHumidity" ? "°C·g/m3" : "°C·kg/kg'";
  return `${area.toFixed(decimals)} ${unit}`;
}

function buildVertexMarkup(displayPoints) {
  return displayPoints.map((point, vertexIndex) => {
    const axisX = getInfoFieldMeta("axis-x", point.data);
    const axisY = getInfoFieldMeta("axis-y", point.data);
    return `
      <div class="vertex-chip">
        <span>P${vertexIndex + 1}</span>
        <strong>${escapeHtml(axisX.value)}</strong>
        <em>${escapeHtml(axisY.value)}</em>
      </div>`;
  }).join("");
}

function renderProbeStatusCard(probe) {
  if (!probe) return "";
  const data = probe.data || calculateAllProperties(probe.t, probe.w, getPressureInPa());
  const tdb = getInfoFieldMeta("tdb", data);
  const w = getInfoFieldMeta("w", data);
  const rh = getInfoFieldMeta("rh", data);
  return `
    <div class="probe-status-card">
      <div class="probe-status-pill"><span>Tdb</span><strong>${escapeHtml(tdb.value)}</strong></div>
      <div class="probe-status-pill"><span>W</span><strong>${escapeHtml(w.value)}</strong></div>
      <div class="probe-status-pill"><span>RH</span><strong>${escapeHtml(rh.value)}</strong></div>
    </div>`;
}

function syncProbeAStatus() {
  // Lock mode removed; nothing to sync
}

function refreshCompareProbeBadges() {
  const badgeA = document.getElementById("probe-ab-a");
  const badgeB = document.getElementById("probe-ab-b");
  if (badgeA) {
    badgeA.textContent = State.probeA
      ? formatI18n("compareBadgeValue", { target: "A", tdb: State.probeA.t.toFixed(1), w: State.probeA.w.toFixed(4) })
      : formatI18n("compareBadgeEmpty", { target: "A" });
    badgeA.classList.toggle("active", State.compareTarget === "A");
  }
  if (badgeB) {
    badgeB.textContent = State.probeB
      ? formatI18n("compareBadgeValue", { target: "B", tdb: State.probeB.t.toFixed(1), w: State.probeB.w.toFixed(4) })
      : formatI18n("compareBadgeEmpty", { target: "B" });
    badgeB.classList.toggle("active", State.compareTarget === "B");
  }
}

function setCompareTarget(target) {
  State.compareTarget = target === "B" ? "B" : "A";
  refreshCompareProbeBadges();
}

function buildPointDetailContent(point) {
  const data = point.data || calculateAllProperties(point.t, point.w, getPressureInPa());
  return `
    <div class="detail-popup-section">
      <div class="detail-popup-title">Properties</div>
      <div class="detail-sheet detail-sheet-two-col">${generateHTMLGrid(data)}</div>
    </div>`;
}

function buildZoneDetailContent(zone) {
  const displayPoints = getZoneDisplayPoints(zone);
  const axisValuesX = displayPoints.map((point) => point.x);
  const axisValuesY = displayPoints.map((point) => point.y);
  const temps = zone.points.map((point) => point.t);
  const area = estimatePolygonArea(displayPoints);
  const yUnit = State.yAxisType === "absoluteHumidity" ? "g/m3" : "kg/kg'";
  const vertices = buildVertexMarkup(displayPoints);

  return `
    <div class="detail-popup-section">
      <div class="detail-popup-title">Summary</div>
      <div class="detail-sheet detail-sheet-two-col">
        ${buildDetailMetricCard("Vertices", String(zone.points.length))}
        ${buildDetailMetricCard("Area", formatZoneArea(area))}
        ${buildDetailMetricCard("Temp Range", `${Math.min(...temps).toFixed(1)}-${Math.max(...temps).toFixed(1)} °C`)}
        ${buildDetailMetricCard("Axis Span", `${Math.min(...axisValuesX).toFixed(2)}-${Math.max(...axisValuesX).toFixed(2)} / ${Math.min(...axisValuesY).toFixed(2)}-${Math.max(...axisValuesY).toFixed(2)} ${State.chartType === "psychrometric" ? yUnit : "°C"}`)}
      </div>
    </div>
    <div class="detail-popup-section">
      <div class="detail-popup-title">Vertices</div>
      <div class="vertex-list detail-sheet-two-col">${vertices}</div>
    </div>`;
}

function buildPointCard(point, index) {
  const data = point.data || calculateAllProperties(point.t, point.w, getPressureInPa());
  const tdb = getInfoFieldMeta("tdb", data);
  const w = getInfoFieldMeta("w", data);
  const displayName = getLocalizedDisplayName(point.name, "point", index + 1);

  return `
    <article class="list-item ${point.id === State.selectedPointId ? "active" : ""}" style="--item-accent:${escapeHtml(point.color || "#cc1919")}">
      <div class="item-header" onclick="selectPoint(${point.id}, event)">
        <div class="item-head-main">
          <div class="id-circle" style="background-color:${escapeHtml(point.color || "#cc1919")}">${index + 1}</div>
          <div class="item-title-group">
            <div class="item-name">${escapeHtml(displayName)}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="openDetailModal('point', ${point.id}, event)" title="View details">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="icon-btn" type="button" onclick="openEditModal('point', ${point.id}, event)" title="Edit point">
            <span class="material-symbols-rounded">edit_square</span>
          </button>
          <button class="icon-btn btn-delete" type="button" onclick="deletePoint(event, ${point.id})" title="Delete point">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
      <div class="item-body item-body-collapsible ${point.id === State.selectedPointId ? "show" : ""}">
        <div class="item-stat-grid">
          ${buildStatCell(tdb.label, tdb.value)}
          ${buildStatCell(w.label, w.value)}
        </div>
      </div>
    </article>`;
}

function buildZoneCard(zone, index) {
  const displayPoints = getZoneDisplayPoints(zone);
  const subtitle = formatI18n("verticesCount", { count: zone.points.length });
  const vertices = buildVertexMarkup(displayPoints);
  const displayName = getLocalizedDisplayName(zone.name, "zone", index + 1);

  return `
    <article class="list-item ${zone.id === State.selectedZoneId ? "active" : ""}" style="--item-accent:${escapeHtml(zone.color || "#19cc2e")}" onclick="selectZone(${zone.id}, event)">
      <div class="item-header">
        <div class="item-head-main">
          <div class="id-circle" style="background:${escapeHtml(zone.color || "#19cc2e")}">${index + 1}</div>
          <div class="item-title-group">
            <div class="item-name">${escapeHtml(displayName)}</div>
            <div class="item-subtitle">${escapeHtml(subtitle)}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="openDetailModal('zone', ${zone.id}, event)" title="View details">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="icon-btn" type="button" onclick="openEditModal('zone', ${zone.id}, event)" title="Edit zone">
            <span class="material-symbols-rounded">edit_square</span>
          </button>
          <button class="icon-btn btn-delete" type="button" onclick="deleteZone(event, ${zone.id})" title="Delete zone">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
      <div class="item-body item-body-collapsible ${zone.id === State.selectedZoneId ? "show" : ""}">
        <div class="item-details show">
          <div class="item-details-title">Vertices</div>
          <div class="vertex-list">${vertices}</div>
        </div>
      </div>
    </article>`;
}

function updateLists() {
  const pl = document.getElementById("list-points");
  document.getElementById("count-points").innerText = State.points.length;

  pl.innerHTML = State.points.length
    ? State.points.map(buildPointCard).join("")
    : `${buildEmptyState("pin_drop", "No points yet", "Add points manually, by input, in batch, or from a live sensor using the panel above.")}
      <style>.marked-point { display:none }</style>`;

  const zl = document.getElementById("list-zones");
  document.getElementById("count-zones").innerText = State.zones.length;

  zl.innerHTML = State.zones.length
    ? State.zones.map(buildZoneCard).join("")
    : buildEmptyState("add_triangle", "No zones yet", "Create a zone manually, by input, by range, automatically, or with boolean logic to start mapping areas.");

  updateToolbarsVisibility();
  applyLanguage(document.getElementById("app-sidebar"));
}

function updateToolbarsVisibility() {
  const toolbars = document.querySelector(".toolbars");
  if (!toolbars) return;
  const hasData = State.points.length > 0 || State.zones.length > 0;
  toolbars.classList.toggle("is-visible", hasData);
}

function addPoint(t, w) {
  const Patm = getPressureInPa();
  const data = calculateAllProperties(t, w, Patm);

  const pt = {
    id: Date.now(),
    name: formatI18n("defaultPointName"),
    color: "#cc1919",
    t,
    w,
    data,
  };

  State.points.push(pt);
  historyManager.push(State);
  selectPoint(pt.id);
}

function saveStateSnapshot() {
  historyManager.push(State);
}

function undoAction() {
  const previousState = historyManager.undo();
  if (previousState) {
    Object.assign(State, previousState);
    updateLists();
    drawChart();
  }
}

function redoAction() {
  const nextState = historyManager.redo();
  if (nextState) {
    Object.assign(State, nextState);
    updateLists();
    drawChart();
  }
}

// === CONTEXT MENU ===

let contextMenuPointId = null;

function showContextMenu(event, pointId = null, zoneId = null) {
  if (event) event.preventDefault();
  // Context menu removed — no-op
}

// Legacy (unused) context menu helpers preserved below
function _showContextMenuLegacy(event, pointId = null, zoneId = null) {
  event.preventDefault();
  contextMenuPointId = pointId;

  document.getElementById("info-panel").style.display = "none";

  const menu = document.getElementById("context-menu");
  const content = document.getElementById("context-menu-content");
  
  content.innerHTML = "";

  if (pointId) {
    const point = State.points.find(p => p.id === pointId);
    if (!point) return;

    addContextMenuItem(content, "edit_square", "Edit", () => {
      hideContextMenu();
      openEditModal("point", pointId);
    });

    addContextMenuItem(content, "delete", "Delete", () => {
      hideContextMenu();
      deletePoint({stopPropagation: () => {}}, pointId);
    });
  } else if (zoneId) {
    const zone = State.zones.find(z => z.id === zoneId);
    if (!zone) return;

    addContextMenuItem(content, "edit_square", "Edit", () => {
      hideContextMenu();
      openEditModal("zone", zoneId);
    });

    addContextMenuItem(content, "delete", "Delete", () => {
      hideContextMenu();
      deleteZone({stopPropagation: () => {}}, zoneId);
    });
  } else {
    if (State.mode === "zone" && State.tempZone.length >= 3) {
      addContextMenuItem(content, "check_circle", "Finish Zone", () => {
        hideContextMenu();
        finishZone();
      });
      
      addContextMenuItem(content, "cancel", "Cancel", () => {
        hideContextMenu();
        cancelZone();
      });
      
      addContextMenuDivider(content);
    }
    
    // Explore with submenu
    addContextSubmenu(content, "explore", "Explore", (submenu) => {
      addContextMenuItem(submenu, "explore", "Hover", () => {
        hideContextMenu();
        setMode("view");
        setExploreSubMode("hover");
      }, State.mode === "view" && State.exploreSubMode === "hover");

      addContextMenuItem(submenu, "push_pin", "Lock / Probe", () => {
        hideContextMenu();
        setMode("view");
        setExploreSubMode("lock");
      }, State.mode === "view" && State.exploreSubMode === "lock");

      addContextMenuItem(submenu, "compare_arrows", "Compare A\u2013B", () => {
        hideContextMenu();
        setMode("view");
        setExploreSubMode("compare");
      }, State.mode === "view" && State.exploreSubMode === "compare");
    }, State.mode === "view");

    // Point with submenu
    addContextSubmenu(content, "pin_drop", "Point", (submenu) => {
      addContextMenuItem(submenu, "ads_click", "Click", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("manual");
      }, State.mode === "point" && State.pointSubMode === "manual");

      addContextMenuItem(submenu, "edit_note", "Input", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("input");
        openFloatingInputWindow("point");
      }, State.mode === "point" && State.pointSubMode === "input");

      addContextMenuItem(submenu, "data_table", "Batch CSV", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("batch");
      }, State.mode === "point" && State.pointSubMode === "batch");

      addContextMenuItem(submenu, "sensors", "Live Sensor", () => {
        hideContextMenu();
        setMode("point");
        setPointSubMode("sensor");
      }, State.mode === "point" && State.pointSubMode === "sensor");
    }, State.mode === "point");

    // Zone with submenu
    addContextSubmenu(content, "add_triangle", "Zone", (submenu) => {
      addContextMenuItem(submenu, "ads_click", "Click", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("manual");
      }, State.mode === "zone" && State.zoneSubMode === "manual");

      addContextMenuItem(submenu, "edit_note", "Input", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("input");
        openFloatingInputWindow("zone");
      }, State.mode === "zone" && State.zoneSubMode === "input");

      addContextMenuItem(submenu, "auto_awesome", "Auto Zone", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("auto");
      }, State.mode === "zone" && State.zoneSubMode === "auto");

      addContextMenuItem(submenu, "local_florist", "Plants", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("plants");
      }, State.mode === "zone" && State.zoneSubMode === "plants");

      addContextMenuItem(submenu, "join", "Boolean", () => {
        hideContextMenu();
        setMode("zone");
        setZoneSubMode("boolean");
      }, State.mode === "zone" && State.zoneSubMode === "boolean");
    }, State.mode === "zone");

    addContextMenuDivider(content);

    // Undo/Redo
    addContextMenuItem(content, "undo", "Undo", () => {
      hideContextMenu();
      undoAction();
    });

    addContextMenuItem(content, "redo", "Redo", () => {
      hideContextMenu();
      redoAction();
    });

    addContextMenuDivider(content);

    // Export submenu
    addContextSubmenu(content, "download", "Export to...", (submenu) => {
      addContextMenuItem(submenu, "image", "PNG", () => {
        hideContextMenu();
        downloadSvgAsPng("#chart-container svg", "chart.png", 3);
      });

      addContextMenuItem(submenu, "description", "SVG", () => {
        hideContextMenu();
        downloadSvgAsSvg("#chart-container svg", "chart.svg");
      });

      addContextMenuItem(submenu, "table_chart", "CSV", () => {
        hideContextMenu();
        exportToCSV();
      });

      addContextMenuItem(submenu, "description", "Excel", () => {
        hideContextMenu();
        exportToExcel();
      });
    });

    // Import submenu
    addContextSubmenu(content, "upload_file", "Import data", (submenu) => {
      addContextMenuItem(submenu, "upload_file", "CSV / Excel", () => {
        hideContextMenu();
        openImportDialog();
      });
    });
  }

  menu.style.left = event.clientX + "px";
  menu.style.top = event.clientY + "px";
  menu.style.display = "block";
}

function addContextMenuItem(container, icon, label, callback, isActive = false) {
  const item = document.createElement("div");
  item.className = "context-menu-item" + (isActive ? " active" : "");
  item.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span>${label}</span>`;
  item.onclick = callback;
  container.appendChild(item);
  return item;
}

function addContextMenuDivider(container) {
  const divider = document.createElement("div");
  divider.className = "context-menu-item divider";
  container.appendChild(divider);
}

function addContextMenuGroup(container, title, builder) {
  const group = document.createElement("div");
  group.className = "context-menu-group";

  const header = document.createElement("div");
  header.className = "context-menu-group-title";
  header.textContent = title;
  group.appendChild(header);

  builder(group);
  container.appendChild(group);
}

// Submenu helper (Windows-like flyout)
function addContextSubmenu(container, icon, label, builder, isActive = false) {
  const item = document.createElement("div");
  item.className = "context-menu-item has-submenu" + (isActive ? " active" : "");
  item.innerHTML = `
    <span class="material-symbols-rounded">${icon}</span>
    <span>${label}</span>
    <span class="submenu-arrow material-symbols-rounded">chevron_right</span>
  `;

  const submenu = document.createElement("div");
  submenu.className = "context-submenu";
  builder(submenu);
  item.appendChild(submenu);

  let hideTimeout = null;
  const show = () => {
    clearTimeout(hideTimeout);
    const rect = item.getBoundingClientRect();
    submenu.style.left = rect.width + "px";
    submenu.style.top = 0 + "px";
    submenu.style.display = "block";
  };
  const hide = () => {
    hideTimeout = setTimeout(() => {
      submenu.style.display = "none";
    }, 0);
  };

  item.addEventListener("mouseenter", show);
  item.addEventListener("mouseleave", hide);
  submenu.addEventListener("mouseenter", () => clearTimeout(hideTimeout));
  submenu.addEventListener("mouseleave", hide);

  container.appendChild(item);
  return item;
}

function hideContextMenu() {
  const menu = document.getElementById("context-menu");
  if (menu) menu.style.display = "none";
}
function _hideContextMenuLegacy() {
  document.getElementById("context-menu").style.display = "none";
  contextMenuPointId = null;
}

// Floating window functions
const FLOATING_WINDOW_FADE_MS = 240;

function resolveFloatingWindow(windowOrId) {
  if (!windowOrId) return null;
  return typeof windowOrId === "string" ? document.getElementById(windowOrId) : windowOrId;
}

function getFloatingWindowDisplayType(popupWindow) {
  return popupWindow?.dataset.windowDisplay || (popupWindow?.classList.contains("floating-detail-window") ? "flex" : "block");
}

function isFloatingWindowOpen(windowOrId) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  return !!popupWindow && popupWindow.classList.contains("open") && popupWindow.style.display !== "none";
}

function resetPopupWindowFrame(popupWindow) {
  if (!popupWindow) return;
  popupWindow.style.transition = "";
  popupWindow.style.left = "50%";
  popupWindow.style.top = "50%";
  popupWindow.style.right = "";
  popupWindow.style.bottom = "";
  popupWindow.style.width = "";
  popupWindow.style.height = "";
  popupWindow.style.transform = "translate(-50%, -50%)";
}

function showFloatingWindow(windowOrId, options = {}) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  if (!popupWindow) return null;

  if (popupWindow._closeTimer) {
    clearTimeout(popupWindow._closeTimer);
    popupWindow._closeTimer = null;
  }

  popupWindow.classList.remove("closing");
  if (options.reset !== false) {
    resetPopupWindowFrame(popupWindow);
  }

  popupWindow.style.display = options.display || getFloatingWindowDisplayType(popupWindow);
  popupWindow.getBoundingClientRect();
  popupWindow.classList.add("open");

  makeWindowDraggable(popupWindow, options.headerSelector);
  scheduleAnimatedTabRefresh();
  requestAnimationFrame(() => scheduleAnimatedTabRefresh());
  return popupWindow;
}

function hideFloatingWindow(windowOrId, options = {}) {
  const popupWindow = resolveFloatingWindow(windowOrId);
  if (!popupWindow) return;

  if (popupWindow._closeTimer) {
    clearTimeout(popupWindow._closeTimer);
    popupWindow._closeTimer = null;
  }

  const shouldReset = options.reset !== false;
  if (options.immediate) {
    popupWindow.classList.remove("open", "closing");
    popupWindow.style.display = "none";
    if (shouldReset) {
      resetPopupWindowFrame(popupWindow);
    }
    scheduleAnimatedTabRefresh();
    return;
  }

  popupWindow.classList.remove("open");
  popupWindow.classList.add("closing");
  popupWindow._closeTimer = window.setTimeout(() => {
    popupWindow.classList.remove("closing");
    popupWindow.style.display = "none";
    if (shouldReset) {
      resetPopupWindowFrame(popupWindow);
    }
    popupWindow._closeTimer = null;
    scheduleAnimatedTabRefresh();
  }, FLOATING_WINDOW_FADE_MS);
}

function openFloatingInputWindow(target) {
  // Close range window if open
  const rangeWindow = document.getElementById("floating-range-window");
  if (rangeWindow) hideFloatingWindow(rangeWindow, { immediate: true });
  
  const window = document.getElementById("floating-input-window");
  document.getElementById("floating-target").value = target;
  
  // Sync with toolbar values if any
  const p1Type = document.getElementById("p1Type-" + target);
  const p1Val = document.getElementById("p1Val-" + target);
  const p2Type = document.getElementById("p2Type-" + target);
  const p2Val = document.getElementById("p2Val-" + target);
  
  // Map uppercase toolbar values to lowercase floating values
  const reverseValueMap = {
    'Tdb': 't',
    'Twb': 'twb',
    'RH': 'rh',
    'W': 'w',
    'h': 'h'
  };
  
  if (p1Type) {
    const mappedValue = reverseValueMap[p1Type.value] || p1Type.value;
    const floatingP1Type = document.getElementById("floating-p1Type");
    if (floatingP1Type) floatingP1Type.value = mappedValue;
  }
  if (p1Val) {
    const floatingP1Val = document.getElementById("floating-p1Val");
    if (floatingP1Val) floatingP1Val.value = p1Val.value;
  }
  if (p2Type) {
    const mappedValue = reverseValueMap[p2Type.value] || p2Type.value;
    const floatingP2Type = document.getElementById("floating-p2Type");
    if (floatingP2Type) floatingP2Type.value = mappedValue;
  }
  if (p2Val) {
    const floatingP2Val = document.getElementById("floating-p2Val");
    if (floatingP2Val) floatingP2Val.value = p2Val.value;
  }
  
  // Show/hide Finish Zone button based on target and point count
  const finishBtn = document.getElementById("floating-finish-zone-btn");
  const btnGroup = document.getElementById("floating-input-btn-group");
  if (finishBtn && btnGroup) {
    const shouldShow = target === "zone" && State.tempZone.length >= 3;
    finishBtn.style.display = shouldShow ? "block" : "none";
    btnGroup.className = shouldShow ? "floating-btn-group cols-2" : "floating-btn-group";
  }
  
  // Position window at center with its default size
  showFloatingWindow(window);
  applyLanguage(window);
}

// Sync floating input selects with toolbar in real-time
function syncFloatingInputWithToolbar(fieldType) {
  const target = document.getElementById("floating-target").value;
  if (!target) return;
  
  const fieldMap = {
    'p1Type': 'p1Type-' + target,
    'p1Val': 'p1Val-' + target,
    'p2Type': 'p2Type-' + target,
    'p2Val': 'p2Val-' + target
  };
  
  const toolbarId = fieldMap[fieldType];
  const floatingId = 'floating-' + fieldType;
  
  const toolbarEl = document.getElementById(toolbarId);
  const floatingEl = document.getElementById(floatingId);
  
  if (toolbarEl && floatingEl) {
    // Map lowercase floating values to uppercase toolbar values
    const valueMap = {
      't': 'Tdb',
      'tdb': 'Tdb',
      'w': 'W',
      'rh': 'RH',
      'h': 'h',
      'twb': 'Twb',
      'tdp': 'Tdp',
      'v': 'v'
    };
    
    let value = floatingEl.value;
    
    // If it's a select (parameter type), map the value
    if (floatingEl.tagName === 'SELECT') {
      value = valueMap[value.toLowerCase()] || value;
    }
    
    toolbarEl.value = value;
  }
}

// Sync toolbar inputs with floating window in real-time (bidirectional)
function syncToolbarInputWithFloating(target, fieldType) {
  // Check if floating window is open
  const floatingWindow = document.getElementById("floating-input-window");
  if (!isFloatingWindowOpen(floatingWindow)) return;
  
  // Check if floating window is for this target
  const floatingTarget = document.getElementById("floating-target").value;
  if (floatingTarget !== target) return;
  
  const fieldMap = {
    'p1Type': 'p1Type-' + target,
    'p1Val': 'p1Val-' + target,
    'p2Type': 'p2Type-' + target,
    'p2Val': 'p2Val-' + target
  };
  
  const toolbarId = fieldMap[fieldType];
  const floatingId = 'floating-' + fieldType;
  
  const toolbarEl = document.getElementById(toolbarId);
  const floatingEl = document.getElementById(floatingId);
  
  if (toolbarEl && floatingEl) {
    // Map uppercase toolbar values to lowercase floating values
    const reverseValueMap = {
      'Tdb': 't',
      'Twb': 'twb',
      'RH': 'rh',
      'W': 'w',
      'h': 'h',
      'Tdp': 'tdp',
      'v': 'v'
    };
    
    let value = toolbarEl.value;
    
    // If it's a select (parameter type), map the value
    if (toolbarEl.tagName === 'SELECT') {
      value = reverseValueMap[value] || value;
    }
    
    floatingEl.value = value;
  }
}

function openFloatingRangeWindow() {
  // Close input window if open
  const inputWindow = document.getElementById("floating-input-window");
  if (inputWindow) hideFloatingWindow(inputWindow, { immediate: true });
  
  const window = document.getElementById("floating-range-window");
  
  // Sync with toolbar values
  const tMin = document.getElementById("rangeTmin").value;
  const tMax = document.getElementById("rangeTmax").value;
  const paramType = document.getElementById("rangeParamType").value;
  const p2Min = document.getElementById("rangeP2min").value;
  const p2Max = document.getElementById("rangeP2max").value;
  
  document.getElementById("floating-rangeTmin").value = tMin;
  document.getElementById("floating-rangeTmax").value = tMax;
  document.getElementById("floating-rangeParamType").value = paramType;
  document.getElementById("floating-rangeP2min").value = p2Min;
  document.getElementById("floating-rangeP2max").value = p2Max;
  
  // Sync sliders
  document.getElementById("floating-sliderTmin").value = tMin;
  document.getElementById("floating-sliderTmax").value = tMax;
  document.getElementById("floating-sliderP2min").value = p2Min;
  document.getElementById("floating-sliderP2max").value = p2Max;
  
  // Setup slider limits based on paramType
  const minTemp = parseFloat(document.getElementById("minTemp").value);
  const maxTemp = parseFloat(document.getElementById("maxTemp").value);
  
  document.getElementById("floating-sliderTmin").min = minTemp;
  document.getElementById("floating-sliderTmin").max = maxTemp;
  document.getElementById("floating-sliderTmax").min = minTemp;
  document.getElementById("floating-sliderTmax").max = maxTemp;
  
  const cfgKey = paramType.charAt(0).toUpperCase() + paramType.slice(1).toLowerCase();
  const cfg = RangeConfigs[cfgKey];
  if (cfg) {
    document.getElementById("floating-sliderP2min").min = cfg.min;
    document.getElementById("floating-sliderP2min").max = cfg.max;
    document.getElementById("floating-sliderP2min").step = cfg.step;
    document.getElementById("floating-sliderP2max").min = cfg.min;
    document.getElementById("floating-sliderP2max").max = cfg.max;
    document.getElementById("floating-sliderP2max").step = cfg.step;
  }
  
  // Position window at center with its default size
  showFloatingWindow(window);
  applyLanguage(window);
}

function closeFloatingWindow(windowId) {
  hideFloatingWindow(windowId);
}

function submitFloatingInput() {
  const target = document.getElementById("floating-target").value;
  let p1Type = document.getElementById("floating-p1Type").value;
  const p1Val = parseFloat(document.getElementById("floating-p1Val").value);
  let p2Type = document.getElementById("floating-p2Type").value;
  const p2Val = parseFloat(document.getElementById("floating-p2Val").value);
  const Patm = getPressureInPa();

  // Map lowercase floating values to uppercase Psychro library values
  const valueMap = {
    't': 'Tdb',
    'tdb': 'Tdb',
    'w': 'W',
    'rh': 'RH',
    'h': 'h',
    'twb': 'Twb',
    'tdp': 'Tdp',
    'v': 'v'
  };
  
  p1Type = valueMap[p1Type.toLowerCase()] || p1Type;
  p2Type = valueMap[p2Type.toLowerCase()] || p2Type;

  if (isNaN(p1Val) || isNaN(p2Val)) {
    alert(translateLiteral("Please enter valid numbers"));
    return;
  }
  if (p1Type === p2Type) {
    alert(translateLiteral("Parameters must be different"));
    return;
  }

  const res = Psychro.solveRobust(p1Type, p1Val, p2Type, p2Val, Patm);

  if (isNaN(res.t) || isNaN(res.w)) {
    alert(translateLiteral("Calculation error. Values might be out of range."));
    return;
  }

  if (target === "point") {
    addPoint(res.t, res.w);
    closeFloatingWindow("floating-input-window");
  } else if (target === "zone") {
    if (State.mode !== "zone") setMode("zone");
    State.tempZone.push({ t: res.t, w: res.w });
    updateZonePtCount();
    
    // Show Finish Zone button if >= 3 points
    const finishBtn = document.getElementById("floating-finish-zone-btn");
    const btnGroup = document.getElementById("floating-input-btn-group");
    if (finishBtn && btnGroup) {
      const shouldShow = State.tempZone.length >= 3;
      finishBtn.style.display = shouldShow ? "block" : "none";
      btnGroup.className = shouldShow ? "floating-btn-group cols-2" : "floating-btn-group";
    }
    
    drawChart();
  }

  // Sync with toolbar
  document.getElementById("p1Type-" + target).value = p1Type;
  document.getElementById("p1Val-" + target).value = p1Val;
  document.getElementById("p2Type-" + target).value = p2Type;
  document.getElementById("p2Val-" + target).value = p2Val;
}

function applyFloatingRange() {
  const tMin = parseFloat(document.getElementById("floating-rangeTmin").value);
  const tMax = parseFloat(document.getElementById("floating-rangeTmax").value);
  const paramType = document.getElementById("floating-rangeParamType").value;
  const p2Min = parseFloat(document.getElementById("floating-rangeP2min").value);
  const p2Max = parseFloat(document.getElementById("floating-rangeP2max").value);

  // Sync with toolbar
  document.getElementById("rangeTmin").value = tMin;
  document.getElementById("rangeTmax").value = tMax;
  document.getElementById("sliderTmin").value = tMin;
  document.getElementById("sliderTmax").value = tMax;
  document.getElementById("rangeParamType").value = paramType;
  document.getElementById("rangeP2min").value = p2Min;
  document.getElementById("rangeP2max").value = p2Max;
  document.getElementById("sliderP2min").value = p2Min;
  document.getElementById("sliderP2max").value = p2Max;

  // Sync sliders in floating window
  document.getElementById("floating-sliderTmin").value = tMin;
  document.getElementById("floating-sliderTmax").value = tMax;
  document.getElementById("floating-sliderP2min").value = p2Min;
  document.getElementById("floating-sliderP2max").value = p2Max;

  // Call same validation and update functions as toolbar
  validateRangeInputs("rangeTmin", "rangeTmax", "Tdb");
  validateRangeInputs("rangeP2min", "rangeP2max", paramType);
  updateRangeZone();
}

function syncFloatingRange(id) {
  const slider = document.getElementById("floating-slider" + id);
  const input = document.getElementById("floating-range" + id);

  input.value = slider.value;

  if (id.includes("Tmin") || id.includes("Tmax")) {
    validateRangeInputs("floating-rangeTmin", "floating-rangeTmax", "Tdb");
  } else if (id.includes("P2min") || id.includes("P2max")) {
    const type = document.getElementById("floating-rangeParamType").value;
    validateRangeInputs("floating-rangeP2min", "floating-rangeP2max", type);
  }

  applyFloatingRange();
}

// Make window draggable
function makeWindowDraggable(draggableWindow, headerSelector = ".floating-window-header") {
  if (!draggableWindow || draggableWindow.dataset.draggableReady === "true") return;
  const header = draggableWindow.querySelector(headerSelector) || draggableWindow.querySelector(".floating-window-header");
  if (!header) return;
  let isDragging = false;
  let currentX, currentY, initialX, initialY;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, input, select, textarea, label, a")) return;
    isDragging = true;
    
    // Get actual position before removing transform
    const rect = draggableWindow.getBoundingClientRect();
    
    // Remove center transform first
    draggableWindow.style.transition = "none";
    draggableWindow.style.transform = "none";
    
    // Set absolute position based on current visual position
    draggableWindow.style.left = rect.left + "px";
    draggableWindow.style.top = rect.top + "px";
    
    // Calculate offset from mouse to window edge
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      e.preventDefault();
      const maxX = Math.max(12, window.innerWidth - draggableWindow.offsetWidth - 12);
      const maxY = Math.max(12, window.innerHeight - draggableWindow.offsetHeight - 12);
      currentX = Math.min(Math.max(12, e.clientX - initialX), maxX);
      currentY = Math.min(Math.max(12, e.clientY - initialY), maxY);
      draggableWindow.style.left = currentX + "px";
      draggableWindow.style.top = currentY + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    draggableWindow.style.transition = "";
    document.body.style.userSelect = "";
  });

  draggableWindow.dataset.draggableReady = "true";
  makeWindowResizable(draggableWindow);
}

function makeWindowResizable(resizableWindow) {
  if (!resizableWindow || resizableWindow.dataset.resizableReady === "true") return;

  const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  let isResizing = false;
  let resizeDirection = "";
  let startRect = null;
  let startX = 0;
  let startY = 0;

  const getMinimumWidth = () => {
    const computedMinWidth = parseFloat(window.getComputedStyle(resizableWindow).minWidth) || 0;
    return Math.min(Math.max(computedMinWidth, 260), Math.max(260, window.innerWidth - 24));
  };

  const getMinimumHeight = () => {
    const computedMinHeight = parseFloat(window.getComputedStyle(resizableWindow).minHeight) || 0;
    return Math.min(Math.max(computedMinHeight, 180), Math.max(180, window.innerHeight - 24));
  };

  directions.forEach((direction) => {
    const handle = document.createElement("span");
    handle.className = `window-resize-handle resize-${direction}`;
    handle.dataset.direction = direction;
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resizeDirection = direction;
      isResizing = true;
      const rect = resizableWindow.getBoundingClientRect();
      resizableWindow.style.transition = "none";
      resizableWindow.style.transform = "none";
      resizableWindow.style.left = rect.left + "px";
      resizableWindow.style.top = rect.top + "px";
      resizableWindow.style.width = rect.width + "px";
      resizableWindow.style.height = rect.height + "px";
      startRect = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      startX = event.clientX;
      startY = event.clientY;
      document.body.style.userSelect = "none";
    });
    resizableWindow.appendChild(handle);
  });

  document.addEventListener("mousemove", (event) => {
    if (!isResizing || !startRect) return;

    event.preventDefault();

    const viewportLeft = 12;
    const viewportTop = 12;
    const viewportRight = window.innerWidth - 12;
    const viewportBottom = window.innerHeight - 12;
    const minWidth = Math.min(getMinimumWidth(), viewportRight - viewportLeft);
    const minHeight = Math.min(getMinimumHeight(), viewportBottom - viewportTop);

    let left = startRect.left;
    let top = startRect.top;
    let right = startRect.right;
    let bottom = startRect.bottom;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (resizeDirection.includes("e")) {
      const nextRight = startRect.right + deltaX;
      right = Math.min(viewportRight, Math.max(startRect.left + minWidth, nextRight));
    }
    if (resizeDirection.includes("w")) {
      const nextLeft = startRect.left + deltaX;
      left = Math.max(viewportLeft, Math.min(startRect.right - minWidth, nextLeft));
    }
    if (resizeDirection.includes("s")) {
      const nextBottom = startRect.bottom + deltaY;
      bottom = Math.min(viewportBottom, Math.max(startRect.top + minHeight, nextBottom));
    }
    if (resizeDirection.includes("n")) {
      const nextTop = startRect.top + deltaY;
      top = Math.max(viewportTop, Math.min(startRect.bottom - minHeight, nextTop));
    }

    resizableWindow.style.left = left + "px";
    resizableWindow.style.top = top + "px";
    resizableWindow.style.width = Math.max(minWidth, right - left) + "px";
    resizableWindow.style.height = Math.max(minHeight, bottom - top) + "px";
    scheduleAnimatedTabRefresh();
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    resizeDirection = "";
    startRect = null;
    resizableWindow.style.transition = "";
    document.body.style.userSelect = "";
    scheduleAnimatedTabRefresh();
  });

  resizableWindow.dataset.resizableReady = "true";
}

// Close context menu when clicking elsewhere
document.addEventListener("click", (event) => {
  const menu = document.getElementById("context-menu");
  if (menu && !menu.contains(event.target)) {
    hideContextMenu();
  }
});

// === EXPORT/IMPORT ===

function getCheckboxValue(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function buildKeyValueExportRows() {
  const rows = [];
  const infoFields = getSelectedInfoFields();
  rows.push(["meta.version", "1"]);
  rows.push(["settings.language", State.language]);
  rows.push(["settings.chartType", State.chartType]);
  rows.push(["settings.mode", State.mode]);
  rows.push(["settings.yAxisType", State.yAxisType]);
  rows.push(["settings.pressure", getInputValue("pressure")]);
  rows.push(["settings.pressureUnit", getInputValue("pressure-unit")]);
  rows.push(["settings.minTemp", getInputValue("minTemp")]);
  rows.push(["settings.maxTemp", getInputValue("maxTemp")]);
  rows.push(["settings.maxHum", getInputValue("maxHum")]);
  rows.push(["settings.maxAbsHum", getInputValue("maxAbsHum")]);
  rows.push(["settings.minHum", getInputValue("minHum")]);
  rows.push(["settings.minAbsHum", getInputValue("minAbsHum")]);
  rows.push(["settings.showInfoPanel", getCheckboxValue("set-show-info-panel")]);
  rows.push(["settings.infoFields", infoFields.join("|")]);
  rows.push(["settings.infoPrimary", infoFields[0] || ""]);
  rows.push(["settings.infoSecondary", infoFields[1] || ""]);
  rows.push(["settings.showLegend", getCheckboxValue("set-show-legend")]);
  rows.push(["settings.labelInterval", getInputValue("set-line-label-step")]);
  rows.push(["settings.showRh", getCheckboxValue("set-show-rh")]);
  rows.push(["settings.showH", getCheckboxValue("set-show-h")]);
  rows.push(["settings.showTwb", getCheckboxValue("set-show-twb")]);
  rows.push(["settings.showV", getCheckboxValue("set-show-v")]);
  rows.push(["settings.showSat", getCheckboxValue("set-show-sat")]);
  rows.push(["settings.showTdp", getCheckboxValue("set-show-tdp")]);

  State.points.forEach((p, i) => {
    rows.push([`points.${i}.name`, p.name || "Point"]);
    rows.push([`points.${i}.color`, p.color || "#cc1919"]);
    rows.push([`points.${i}.t`, p.t]);
    rows.push([`points.${i}.w`, p.w]);
  });

  State.zones.forEach((z, zi) => {
    rows.push([`zones.${zi}.name`, z.name || "Zone"]);
    rows.push([`zones.${zi}.color`, z.color || "#19cc2e"]);
    z.points.forEach((pt, pi) => {
      rows.push([`zones.${zi}.points.${pi}.t`, pt.t]);
      rows.push([`zones.${zi}.points.${pi}.w`, pt.w]);
    });
  });

  return rows;
}

function exportToCSV() {
  const rows = buildKeyValueExportRows();
  const csv = rows
    .map((row) => row.map((cell) => {
      const value = cell === null || cell === undefined ? "" : String(cell);
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "psychrometric-data.csv";
  link.click();
}

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    alert(translateLiteral("Excel export requires XLSX library. Please ensure assets/xlsx-0.18.5.js is loaded."));
    return;
  }

  const rows = buildKeyValueExportRows();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 40 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, "psychrometric-data.xlsx");
}

function openImportDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.xlsx,.xls";
  input.onchange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    importFromFile(file);
  };
  input.click();
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.length > 0) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((r) => [r[0], r[1]])
    .filter((r) => r[0] !== undefined && String(r[0]).trim() !== "");
}

function parseBool(value) {
  const val = String(value).trim().toLowerCase();
  return val === "true" || val === "1" || val === "yes" || val === "on";
}

function importFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "csv") {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSVRows(reader.result || "");
      applyImportedRows(rows);
    };
    reader.readAsText(file);
    return;
  }

  if (ext === "xlsx" || ext === "xls") {
    if (typeof XLSX === "undefined") {
      alert(translateLiteral("Excel import requires XLSX library. Please ensure assets/xlsx-0.18.5.js is loaded."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const rows = raw
        .map((r) => [r[0], r[1]])
        .filter((r) => r[0] !== undefined && String(r[0]).trim() !== "");
      applyImportedRows(rows);
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  alert(translateLiteral("Unsupported file format. Please use CSV or Excel."));
}

function applyImportedRows(rows) {
  const settings = {};
  const points = [];
  const zones = [];

  rows.forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").replace(/^\uFEFF/, "").trim();
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
    if (!key) return;

    if (key.startsWith("settings.")) {
      settings[key.replace("settings.", "")] = value;
      return;
    }

    const pointMatch = key.match(/^points\.(\d+)\.(name|color|t|w)$/);
    if (pointMatch) {
      const idx = parseInt(pointMatch[1], 10);
      const field = pointMatch[2];
      points[idx] = points[idx] || {};
      points[idx][field] = value;
      return;
    }

    const zoneMatch = key.match(/^zones\.(\d+)\.(name|color)$/);
    if (zoneMatch) {
      const idx = parseInt(zoneMatch[1], 10);
      const field = zoneMatch[2];
      zones[idx] = zones[idx] || { points: [] };
      zones[idx][field] = value;
      return;
    }

    const zonePointMatch = key.match(/^zones\.(\d+)\.points\.(\d+)\.(t|w)$/);
    if (zonePointMatch) {
      const zIdx = parseInt(zonePointMatch[1], 10);
      const pIdx = parseInt(zonePointMatch[2], 10);
      const field = zonePointMatch[3];
      zones[zIdx] = zones[zIdx] || { points: [] };
      zones[zIdx].points[pIdx] = zones[zIdx].points[pIdx] || {};
      zones[zIdx].points[pIdx][field] = value;
    }
  });

  applyImportedSettings(settings);
  applyImportedData(points, zones);
}

function applyImportedSettings(settings) {
  if (settings.language !== undefined) {
    State.language = normalizeLanguage(settings.language);
  }
  if (settings.realDataZoneVisibility !== undefined) {
    setRealDataZoneVisibilityMap(settings.realDataZoneVisibility);
  }
  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = State.language;
  }
  if (settings.chartType) changeChartType(settings.chartType);
  if (settings.yAxisType) changeYAxisType(settings.yAxisType);

  if (settings.pressureUnit) {
    const unit = document.getElementById("pressure-unit");
    if (unit) {
      unit.value = settings.pressureUnit;
    }
  }
  if (settings.pressure !== undefined) {
    const pressureInput = document.getElementById("pressure");
    if (pressureInput) {
      pressureInput.value = settings.pressure;
      const unitValue = getInputValue("pressure-unit");
      pressureInput.step = unitValue === "kPa" ? 0.1 : 100;
    }
  }

  const minTemp = document.getElementById("minTemp");
  if (minTemp && settings.minTemp !== undefined) minTemp.value = settings.minTemp;
  const maxTemp = document.getElementById("maxTemp");
  if (maxTemp && settings.maxTemp !== undefined) maxTemp.value = settings.maxTemp;
  const maxHum = document.getElementById("maxHum");
  if (maxHum && settings.maxHum !== undefined) maxHum.value = settings.maxHum;
  const maxAbsHum = document.getElementById("maxAbsHum");
  if (maxAbsHum && settings.maxAbsHum !== undefined) maxAbsHum.value = settings.maxAbsHum;
  const minHum = document.getElementById("minHum");
  if (minHum && settings.minHum !== undefined) minHum.value = settings.minHum;
  const minAbsHum = document.getElementById("minAbsHum");
  if (minAbsHum && settings.minAbsHum !== undefined) minAbsHum.value = settings.minAbsHum;

  const checkboxMap = {
    "set-show-info-panel": settings.showInfoPanel,
    "set-show-legend": settings.showLegend,
    "set-show-rh": settings.showRh,
    "set-show-h": settings.showH,
    "set-show-twb": settings.showTwb,
    "set-show-v": settings.showV,
    "set-show-sat": settings.showSat,
    "set-show-tdp": settings.showTdp,
  };

  Object.keys(checkboxMap).forEach((id) => {
    if (checkboxMap[id] === undefined) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = parseBool(checkboxMap[id]);
    if (inputHandlers[id]) {
      inputHandlers[id]({ target: el });
    }
  });

  renderCursorFieldSettings(getImportedCursorFields(settings));
  if (settings.infoPrecisionDecimals !== undefined) {
    setInfoPrecisionDecimals(settings.infoPrecisionDecimals);
  } else if (settings.infoPrecisionOffset !== undefined) {
    setInfoPrecisionDecimals((parseInt(settings.infoPrecisionOffset, 10) || 0) + DEFAULT_INFO_PRECISION_DECIMALS);
  }
  setMinimapMode(settings.minimapMode, { redraw: false });
  const labelInterval = document.getElementById("set-line-label-step");
  if (labelInterval && settings.labelInterval !== undefined) labelInterval.value = settings.labelInterval;
  syncRealDataVisibilityDefaults();
  syncRealDataZoneConfigDefaults();
  renderRealDataZoneSettings();
  populatePlantsZoneDatasetSelect();
  drawChart();
  applyLanguage();
}

function applyImportedData(points, zones) {
  State.points = [];
  State.zones = [];

  const Patm = getPressureInPa();

  points.forEach((p) => {
    if (!p || p.t === undefined || p.w === undefined) return;
    const t = parseFloat(p.t);
    const w = parseFloat(p.w);
    if (isNaN(t) || isNaN(w)) return;
    const data = calculateAllProperties(t, w, Patm);
    State.points.push({
      id: Date.now() + Math.random(),
      name: p.name || formatI18n("defaultPointName"),
      color: p.color || "#cc1919",
      t,
      w,
      data
    });
  });

  zones.forEach((z) => {
    if (!z || !Array.isArray(z.points)) return;
    const zonePoints = z.points
      .map((pt) => {
        const t = parseFloat(pt.t);
        const w = parseFloat(pt.w);
        if (isNaN(t) || isNaN(w)) return null;
        return { t, w };
      })
      .filter(Boolean);

    if (zonePoints.length > 0) {
      State.zones.push({
        id: Date.now() + Math.random(),
        name: z.name || formatI18n("defaultZoneName"),
        color: z.color || "#19cc2e",
        points: zonePoints
      });
    }
  });

  historyManager.push(State);
  updateLists();
  updateToolbarsVisibility();
  drawChart();
}

function clearSelections() {
  State.selectedPointId = null;
  State.selectedZoneId = null;
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

function selectPoint(id, event) {
  if (event) event.stopPropagation();
  if (State.selectedPointId === id) {
    clearSelections();
    updateLists();
    drawChart();
    return;
  }
  State.selectedPointId = id;
  State.selectedZoneId = null;
  updateLists();
  drawChart();
}

function selectZone(id, event) {
  if (event) event.stopPropagation();
  if (State.selectedZoneId === id) {
    clearSelections();
    updateLists();
    drawChart();
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
  if (State.selectedPointId === id) State.selectedPointId = null;
  historyManager.push(State);
  updateLists();
  drawChart();
}

function deleteZone(e, id) {
  e.stopPropagation();
  State.zones = State.zones.filter((z) => z.id !== id);
  if (State.selectedZoneId === id) State.selectedZoneId = null;
  historyManager.push(State);
  updateLists();
  drawChart();
}

// === UNIFIED EDIT MODAL ===

function openDetailModal(type, id, event) {
  if (event) event.stopPropagation();

  const detailWindow = document.getElementById("floating-detail-window");
  const titleEl = document.getElementById("detailModalTitle");
  const contentEl = document.getElementById("detailModalContent");
  if (!detailWindow || !titleEl || !contentEl) return;

  if (type === "point") {
    const point = State.points.find((item) => item.id === id);
    if (!point) return;
    titleEl.innerText = getLocalizedDisplayName(point.name, "point") || translateLiteral("Point Details");
    contentEl.innerHTML = buildPointDetailContent(point);
  } else if (type === "zone") {
    const zone = State.zones.find((item) => item.id === id);
    if (!zone) return;
    titleEl.innerText = getLocalizedDisplayName(zone.name, "zone") || translateLiteral("Zone Details");
    contentEl.innerHTML = buildZoneDetailContent(zone);
  } else {
    return;
  }

  resetPopupWindowFrame(detailWindow);
  showFloatingWindow(detailWindow);
  applyLanguage(detailWindow);
}

function openEditModal(type, id, event) {
  if (event) event.stopPropagation();
  else if (window.event) window.event.stopPropagation();

  const editWindow = document.getElementById("floating-edit-window");
  document.getElementById("editId").value = id;
  document.getElementById("editType").value = type;

  const colorContainer = document.getElementById("colorContainer");
  const nameInput = document.getElementById("editName");
  const colorInput = document.getElementById("editColor");

  if (type === "point") {
    const p = State.points.find((item) => item.id === id);
    if (!p) return;
    document.getElementById("editModalTitle").innerText = translateLiteral("Edit Point");
    nameInput.value = p.name;
    colorInput.value = p.color || "#ff0000";
    colorContainer.style.display = "block";
  } else if (type === "zone") {
    const z = State.zones.find((item) => item.id === id);
    if (!z) return;
    document.getElementById("editModalTitle").innerText = translateLiteral("Edit Zone");
    nameInput.value = z.name;
    colorInput.value = z.color;
    colorContainer.style.display = "block";
  }

  showFloatingWindow(editWindow);
  applyLanguage(editWindow);
}

function saveEditSettings() {
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

  historyManager.push(State);
  updateLists();
  drawChart();
  closeFloatingWindow("floating-edit-window");
}

function finishZone() {
  if (State.tempZone.length < 3) {
    alert(translateLiteral("Min 3 points required."));
    return;
  }

  const finalPoints = [...State.tempZone];

  State.zones.push({
    id: Date.now(),
    name: formatI18n("defaultZoneName"),
    color: "#19cc2e",
    points: finalPoints,
  });

  State.tempZone = [];
  State.rangePreview = [];
  historyManager.push(State);
  updateLists();
  drawChart();

  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = formatI18n("pointsCount", { count: 0 });
}

function cancelZone() {
  State.tempZone = [];
  State.rangePreview = [];
  if (State.zoneSubMode !== "plants") {
    State.realDataZoneDraft = null;
  }

  drawChart();
  if (document.getElementById("zonePtCount"))
    document.getElementById("zonePtCount").innerText = formatI18n("pointsCount", { count: 0 });
}

function clearAllData() {
  if (confirm(translateLiteral("Clear all?"))) {
    State.points = [];
    State.zones = [];
    State.tempZone = [];
    historyManager.push(State);
    updateLists();
    drawChart();
    updateZonePtCount();
  }
}

// === CHART RENDERING ===

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

const gridLayer = svg.append("g"); 

const linesLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "lines-layer");
const labelLayer = svg.append("g");

const axesLayer = svg.append("g");

const overlay = svg
  .append("rect")
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("fill", "transparent")
  .style("pointer-events", "all");

const zoneLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "zones-layer");
const pointLayer = svg.append("g").attr("clip-path", "url(#chart-clip)").attr("id", "points-layer");
function calculateAbsoluteHumidity(t, w, Patm) {
  const v = Psychro.getSpecificVolume(t, w, Patm);
  return (w / v) * 1000;
}

function getWFromAbsoluteHumidity(t, ah, Patm) {
  let wLow = 0;
  let wHigh = 0.1;
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

function getYValue(t, w, Patm) {
  if (State.yAxisType === "absoluteHumidity") {
    return calculateAbsoluteHumidity(t, w, Patm);
  }
  return w;
}

function getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm) {
  let t, w;

  if (State.chartType === "psychrometric") {
    t = x.invert(mx);

    if (State.yAxisType === "absoluteHumidity") {
      const ah = y.invert(my);
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = y.invert(my);
    }
  } else {
    if (State.yAxisType === "absoluteHumidity") {
      const ah = x.invert(mx);
      t = y.invert(my);
      w = getWFromAbsoluteHumidity(t, ah, Patm);
      w = Math.max(0, Math.min(w, maxH));
    } else {
      w = x.invert(mx);
      t = y.invert(my);
    }
  }

  t = Math.max(minT, Math.min(maxT, t));
  w = Math.max(0, Math.min(maxH, w));

  return { t, w };
}

function clampMinimapValue(value, minValue, maxValue, fallbackValue) {
  const fallback = Number.isFinite(fallbackValue) ? fallbackValue : minValue;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(minValue, Math.min(maxValue, numericValue));
}

function getMinimapViewportBounds(Patm) {
  const minTempInput = parseFloat(document.getElementById("minTemp")?.value);
  const maxTempInput = parseFloat(document.getElementById("maxTemp")?.value);
  const maxHumInput = parseFloat(document.getElementById("maxHum")?.value);
  const maxAbsHumInput = parseFloat(document.getElementById("maxAbsHum")?.value);

  let minT = clampMinimapValue(minTempInput, MINIMAP_T_MIN, MINIMAP_T_MAX - 1, MINIMAP_T_MIN);
  let maxT = clampMinimapValue(maxTempInput, minT + 1, MINIMAP_T_MAX, MINIMAP_T_MAX);
  if (maxT <= minT) {
    maxT = Math.min(MINIMAP_T_MAX, minT + 1);
  }

  let minWSource = State.viewMinH;
  let maxWSource = maxHumInput;

  if (State.yAxisType === "absoluteHumidity") {
    const anchorT = (minT + maxT) / 2;
    const safePatm = Number.isFinite(Patm) ? Patm : getPressureInPa();
    minWSource = getWFromAbsoluteHumidity(anchorT, State.viewMinAH, safePatm);
    maxWSource = getWFromAbsoluteHumidity(anchorT, maxAbsHumInput, safePatm);
  }

  let minW = clampMinimapValue(minWSource, MINIMAP_W_MIN, MINIMAP_W_MAX - 0.0001, MINIMAP_W_MIN);
  let maxW = clampMinimapValue(maxWSource, minW + 0.0001, MINIMAP_W_MAX, MINIMAP_W_MAX);
  if (maxW <= minW) {
    maxW = Math.min(MINIMAP_W_MAX, minW + 0.0001);
  }

  return { minT, maxT, minW, maxW };
}

function buildMinimapPolygonPoints(points, xScale, yScale) {
  return points
    .filter((point) => point && Number.isFinite(point.t) && Number.isFinite(point.w))
    .map((point) => `${xScale(point.t)},${yScale(point.w)}`)
    .join(" ");
}

function renderChartMinimap(Patm, realDataZones = []) {
  const minimapContainer = document.getElementById("chart-minimap");
  const minimapSvgNode = document.getElementById("chart-minimap-svg");
  if (!minimapContainer || !minimapSvgNode) return;

  const wrapperRect = chartWrapper.getBoundingClientRect();
  const legendNode = chartWrapper.querySelector(".chart-legend");
  if (legendNode) {
    const legendRect = legendNode.getBoundingClientRect();
    minimapContainer.style.left = `${Math.max(0, legendRect.left - wrapperRect.left)}px`;
    minimapContainer.style.top = `${Math.max(0, legendRect.top - wrapperRect.top)}px`;
  } else {
    minimapContainer.style.left = `${chart_margin_left + 16}px`;
    minimapContainer.style.top = `${chart_margin_top + 16}px`;
  }

  // Keep minimap height aligned with legend height; only width differs.
  const visibleLegendCount = ["rh", "twb", "h", "v", "sat", "tdp"].filter((key) => State.visibility?.[key]).length;
  minimapContainer.style.height = `${30 + visibleLegendCount * 18}px`;

  const minimapMode = normalizeMinimapMode(State.minimapMode);
  if (minimapMode === "hide" || (minimapMode === "auto" && !shouldShowMinimapNow())) {
    updateMinimapVisibilityState();
    return;
  }

  const width = minimapContainer.clientWidth;
  const height = minimapContainer.clientHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 30 || height <= 30) return;

  const padding = 8;
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);

  const xMini = d3.scaleLinear().domain([MINIMAP_T_MIN, MINIMAP_T_MAX]).range([padding, padding + innerWidth]);
  const yMini = d3.scaleLinear().domain([MINIMAP_W_MIN, MINIMAP_W_MAX]).range([padding + innerHeight, padding]);

  const minimapSvg = d3
    .select(minimapSvgNode)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  const defs = minimapSvg.selectAll("defs").data([null]).join("defs");
  defs
    .selectAll("clipPath#minimap-clip")
    .data([null])
    .join("clipPath")
    .attr("id", "minimap-clip")
    .selectAll("rect")
    .data([null])
    .join("rect")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  const root = minimapSvg.selectAll("g.minimap-root").data([null]).join("g").attr("class", "minimap-root");

  root
    .selectAll("rect.minimap-plot-bg")
    .data([null])
    .join("rect")
    .attr("class", "minimap-plot-bg")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("ry", 6);

  const gridLayer = root
    .selectAll("g.minimap-grid")
    .data([null])
    .join("g")
    .attr("class", "minimap-grid")
    .attr("clip-path", "url(#minimap-clip)");

  gridLayer
    .selectAll("line.minimap-grid-x")
    .data(xMini.ticks(10))
    .join("line")
    .attr("class", "minimap-grid-x")
    .attr("x1", (value) => xMini(value))
    .attr("x2", (value) => xMini(value))
    .attr("y1", padding)
    .attr("y2", padding + innerHeight);

  gridLayer
    .selectAll("line.minimap-grid-y")
    .data(yMini.ticks(8))
    .join("line")
    .attr("class", "minimap-grid-y")
    .attr("x1", padding)
    .attr("x2", padding + innerWidth)
    .attr("y1", (value) => yMini(value))
    .attr("y2", (value) => yMini(value));

  const dataLayer = root
    .selectAll("g.minimap-data")
    .data([null])
    .join("g")
    .attr("class", "minimap-data")
    .attr("clip-path", "url(#minimap-clip)");

  const saturationPoints = [];
  for (let t = MINIMAP_T_MIN; t <= MINIMAP_T_MAX; t += 1) {
    const satW = Psychro.getWFromPw(Psychro.getSatVapPres(t), Patm);
    if (!Number.isFinite(satW)) continue;
    saturationPoints.push({
      t,
      w: clampMinimapValue(satW, MINIMAP_W_MIN, MINIMAP_W_MAX, MINIMAP_W_MIN),
    });
  }

  dataLayer
    .selectAll("path.minimap-saturation")
    .data(saturationPoints.length ? [saturationPoints] : [])
    .join("path")
    .attr("class", "minimap-saturation")
    .attr("d", d3.line().x((point) => xMini(point.t)).y((point) => yMini(point.w)));

  dataLayer
    .selectAll("polygon.minimap-real-data-zone")
    .data(realDataZones, (zone) => zone.id)
    .join("polygon")
    .attr("class", "minimap-real-data-zone")
    .attr("points", (zone) => buildMinimapPolygonPoints(zone.points || [], xMini, yMini))
    .attr("fill", (zone) => {
      const rgb = hexToRgb(zone.color || "#1b9e2a");
      return `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
    })
    .attr("stroke", (zone) => zone.color || "#1b9e2a");

  dataLayer
    .selectAll("polygon.minimap-user-zone")
    .data(State.zones, (zone) => zone.id)
    .join("polygon")
    .attr("class", "minimap-user-zone")
    .attr("points", (zone) => buildMinimapPolygonPoints(zone.points || [], xMini, yMini))
    .attr("fill", (zone) => {
      const rgb = hexToRgb(zone.color || "#19cc2e");
      return `rgba(${rgb.r},${rgb.g},${rgb.b},0.24)`;
    })
    .attr("stroke", (zone) => zone.color || "#19cc2e");

  dataLayer
    .selectAll("polyline.minimap-temp-zone")
    .data(State.tempZone.length ? [State.tempZone] : [])
    .join("polyline")
    .attr("class", "minimap-temp-zone")
    .attr("points", (points) => buildMinimapPolygonPoints(points, xMini, yMini));

  dataLayer
    .selectAll("polygon.minimap-range-preview")
    .data(State.rangePreview.length ? [State.rangePreview] : [])
    .join("polygon")
    .attr("class", "minimap-range-preview")
    .attr("points", (points) => buildMinimapPolygonPoints(points, xMini, yMini));

  dataLayer
    .selectAll("circle.minimap-point")
    .data(State.points.filter((point) => Number.isFinite(point?.t) && Number.isFinite(point?.w)), (point) => point.id)
    .join("circle")
    .attr("class", "minimap-point")
    .attr("cx", (point) => xMini(point.t))
    .attr("cy", (point) => yMini(point.w))
    .attr("r", 1.9)
    .attr("fill", (point) => point.color || "#cc1919");

  const probePoints = [State.probeA, State.probeB].filter((probe) => probe && Number.isFinite(probe.t) && Number.isFinite(probe.w));
  dataLayer
    .selectAll("circle.minimap-probe")
    .data(probePoints)
    .join("circle")
    .attr("class", "minimap-probe")
    .attr("cx", (probe) => xMini(probe.t))
    .attr("cy", (probe) => yMini(probe.w))
    .attr("r", 2.6);

  const viewport = getMinimapViewportBounds(Patm);
  const x0 = xMini(viewport.minT);
  const x1 = xMini(viewport.maxT);
  const y0 = yMini(viewport.maxW);
  const y1 = yMini(viewport.minW);

  const viewportLayer = root.selectAll("g.minimap-viewport").data([null]).join("g").attr("class", "minimap-viewport");
  viewportLayer
    .selectAll("rect.minimap-viewport-box")
    .data([null])
    .join("rect")
    .attr("class", "minimap-viewport-box")
    .attr("x", Math.min(x0, x1))
    .attr("y", Math.min(y0, y1))
    .attr("width", Math.max(2, Math.abs(x1 - x0)))
    .attr("height", Math.max(2, Math.abs(y1 - y0)));

  root
    .selectAll("rect.minimap-frame")
    .data([null])
    .join("rect")
    .attr("class", "minimap-frame")
    .attr("x", padding)
    .attr("y", padding)
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("ry", 6);

  updateMinimapVisibilityState();
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

  if (State.yAxisType === "absoluteHumidity") _syncRatioFromAbsHum();
  else _syncAbsHumFromRatio();

  // Ambil nilai
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(maxTInput.value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const Patm = getPressureInPa();

  syncZoneRangeLimits(minT, maxT);

  let x, y;
  // Clamp viewport lower bounds so they never exceed the current upper bounds.
  const minHumConfig = parseFloat(document.getElementById("minHum")?.value) || 0;
  const viewMinH = Math.min(State.viewMinH, maxH - 0.001);
  State.viewMinH = Math.max(minHumConfig, viewMinH);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);
  const minAbsHumConfig = parseFloat(document.getElementById("minAbsHum")?.value) || 0;
  const viewMinAH = Math.min(State.viewMinAH, maxAH - 0.1);
  State.viewMinAH = Math.max(minAbsHumConfig, viewMinAH);

  if (State.chartType === "psychrometric") {
    x = d3.scaleLinear().domain([minT, maxT]).range([0, w]);

    if (State.yAxisType === "absoluteHumidity") {
      y = d3.scaleLinear().domain([State.viewMinAH, maxAH]).range([h, 0]);
    } else {
      y = d3.scaleLinear().domain([State.viewMinH, maxH]).range([h, 0]);
    }
  } else {
    // Mollier: x = Humidity, y = DBT
    if (State.yAxisType === "absoluteHumidity") {
      x = d3.scaleLinear().domain([State.viewMinAH, maxAH]).range([0, w]);
    } else {
      x = d3.scaleLinear().domain([State.viewMinH, maxH]).range([0, w]);
    }
    y = d3.scaleLinear().domain([minT, maxT]).range([h, 0]);
  }

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

  updateAxisLabels();

  gridLayer.selectAll("*").remove();

  gridLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(
      d3.axisBottom(x).ticks(10).tickSize(-h).tickFormat("")
    )
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5);

  gridLayer
    .append("g")
    .call(
      d3.axisLeft(y).ticks(10).tickSize(-w).tickFormat("")
    )
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("class", "grid-line")
    .attr("stroke-opacity", 0.5);

  axesLayer.selectAll("*").remove();

  axesLayer
    .append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(10));

  axesLayer.append("g").call(d3.axisLeft(y).ticks(10));

  // LABEL SUMBU (Tetap di axesLayer agar paling atas)
  if (State.chartType === "psychrometric") {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text(translateLiteral("Dry Bulb Temperature (°C)"));
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? translateLiteral("Absolute Humidity (g/m³)")
          : translateLiteral("Humidity Ratio (kg/kg')")
      );
  } else {
    axesLayer
      .append("text")
      .attr("class", "axis-label x")
      .attr("x", w / 2)
      .attr("y", h + 45)
      .text(
        State.yAxisType === "absoluteHumidity"
          ? translateLiteral("Absolute Humidity (g/m³)")
          : translateLiteral("Humidity Ratio (kg/kg')")
      );
    axesLayer
      .append("text")
      .attr("class", "axis-label y")
      .attr("transform", "rotate(-90)")
      .attr("x", -h / 2)
      .attr("y", -45)
      .text(translateLiteral("Dry Bulb Temperature (°C)"));
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

  zoneLayer.selectAll("*").remove();

  const visibleRealDataZones = getVisibleRealDataZones(Patm);
  visibleRealDataZones.forEach((zone) => {
    const displayPoints = zone.points.map((point) => {
      if (State.chartType === "psychrometric") {
        return {
          x: x(point.t),
          y: y(getYValue(point.t, point.w, Patm)),
        };
      }

      return {
        x: x(getYValue(point.t, point.w, Patm)),
        y: y(point.t),
      };
    });
    const displaySourcePoints = (zone.sourcePoints || zone.points).map((point) => {
      if (State.chartType === "psychrometric") {
        return {
          x: x(point.t),
          y: y(getYValue(point.t, point.w, Patm)),
        };
      }

      return {
        x: x(getYValue(point.t, point.w, Patm)),
        y: y(point.t),
      };
    });
    const polygonPoints = displayPoints.map((point) => [point.x, point.y].join(",")).join(" ");
    const rgb = hexToRgb(zone.color);
    const labelPoint = findZoneLabelPosition(displayPoints);

    zoneLayer
      .append("polygon")
      .attr("points", polygonPoints)
      .attr("class", "real-data-zone")
      .attr("fill", `rgba(${rgb.r},${rgb.g},${rgb.b}, 0.18)`)
      .attr("stroke", zone.color)
      .attr("stroke-dasharray", "7 4")
      .attr("stroke-width", 1.8)
      .style("pointer-events", "none");

    zoneLayer
      .append("g")
      .attr("class", "real-data-zone-points")
      .selectAll("circle")
      .data(displaySourcePoints)
      .join("circle")
      .attr("cx", (point) => point.x)
      .attr("cy", (point) => point.y)
      .attr("r", 2.6)
      .attr("fill", zone.color)
      .attr("stroke", "rgba(255,255,255,0.95)")
      .attr("stroke-width", 0.8)
      .attr("opacity", 0.92)
      .style("pointer-events", "none");

    zoneLayer
      .append("text")
      .attr("x", labelPoint.x)
      .attr("y", labelPoint.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", zone.color)
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text(zone.name)
      .style("pointer-events", "none");
  });
  
  State.zones.forEach((z) => {
    const displayPoints = z.points.map((p) => {
      if (State.chartType === "psychrometric") {
        return {
          x: x(p.t),
          y: y(getYValue(p.t, p.w, Patm)),
        };
      }

      return {
        x: x(getYValue(p.t, p.w, Patm)),
        y: y(p.t),
      };
    });
    const polyStr = displayPoints.map((point) => [point.x, point.y].join(",")).join(" ");

    const rgb = hexToRgb(z.color);
    const poly = zoneLayer
      .append("polygon")
      .attr("points", polyStr)
      .attr("class", "user-zone")
      .attr("data-zone-id", z.id)
      .attr("fill", `rgba(${rgb.r},${rgb.g},${rgb.b}, 0.3)`)
      .attr("stroke", z.color)
      .style("pointer-events", "none");

    if (z.id === State.selectedZoneId) poly.classed("selected", true);

    const labelPoint = findZoneLabelPosition(displayPoints);

    zoneLayer
      .append("text")
      .attr("x", labelPoint.x)
      .attr("y", labelPoint.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", z.color)
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text(getLocalizedDisplayName(z.name, "zone"))
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
      .attr("data-point-id", p.id)
      .style("pointer-events", "none");

    const circle = pointGroup
      .append("circle")
      .attr("class", isSelected ? "user-point selected" : "user-point")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", 6)
      .attr("fill", p.color || "#ff0000");

    // Sensor: pulsing ring
    if (p.isSensor) {
      pointGroup
        .append("circle")
        .attr("class", "sensor-pulse")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 10)
        .attr("fill", "none")
        .attr("stroke", p.color || "#1565c0")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.4);
    }

    // Posisi label
    const labelX = cx > w * 0.8 ? cx - 15 : cx + 10;
    const labelY = cy < h * 0.2 ? cy + 15 : cy - 5;

    pointGroup
      .append("text")
      .attr("class", isSelected ? "point-label selected" : "point-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .text(getLocalizedDisplayName(p.name, "point"))
      .style("pointer-events", "none")
      .style("text-anchor", cx > w * 0.8 ? "end" : "start");
  });

  // Interaksi mouse - sesuaikan dengan tipe chart
  overlay
    .on("mousemove", (e) => handleMouseMove(e, x, y, minT, maxT, maxH, Patm))
    .on("click", (e) => handleChartClick(e, x, y, minT, maxT, maxH, Patm))
    .on("contextmenu", (e) => e.preventDefault());

  // Probe pins (Explore Lock / Compare)
  if (State.probeA || State.probeB) {
    renderProbes(pointLayer, x, y, w, h, Patm);
  }

  // LEGEND
  const showLegend = document.getElementById("set-show-legend").checked;
  if (showLegend) {
    const legG = axesLayer.append("g").attr("class", "chart-legend");

    const allLegItems = [
      { c: color_rh, t: "Rel. Humidity (%)", d: "0", key: "rh" },
      { c: color_h, t: "Enthalpy (kJ/kg)", d: "0", key: "h" },
      { c: color_twb, t: "Wet Bulb (\u00b0C)", d: "4", key: "twb" },
      { c: color_v, t: "Spec. Vol. (m\u00b3/kg)", d: "0", key: "v" },
      { c: color_sat, t: "Saturation", d: "0", key: "sat" },
      { c: color_tdp, t: "Dew Point (\u00b0C)", d: "0", key: "tdp" },
    ];
    
    const legItems = allLegItems.filter(item => State.visibility[item.key]);
    const legendWidth = 162;
    const rowHeight = 18;
    const legendHeight = 30 + legItems.length * rowHeight;

    if (State.chartType === "psychrometric") {
      legG.attr("transform", `translate(16, 16)`);
    } else {
      legG.attr("transform", `translate(${w - legendWidth - 16}, ${h - legendHeight - 16})`);
    }

    legG
      .append("rect")
      .attr("class", "legend-shell")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("rx", 18);

    // legG
    //   .append("text")
    //   .text("")
    //   .attr("class", "legend-eyebrow")
    //   .attr("x", 12)
    //   .attr("y", 14);

    legG
      .append("text")
      .text("Legends")
      .attr("class", "legend-title")
      .attr("x", 12)
      .attr("y", 21);

    legItems.forEach((item, i) => {
      const rowY = 27 + i * rowHeight;
      const row = legG.append("g").attr("transform", `translate(8, ${rowY})`);

      row
        .append("rect")
        .attr("class", "legend-row-bg")
        .attr("width", legendWidth - 16)
        .attr("height", 14)
        .attr("rx", 9);

      row
        .append("line")
        .attr("class", "legend-row-line")
        .attr("x1", 10)
        .attr("x2", 31)
        .attr("y1", 7)
        .attr("y2", 7)
        .attr("stroke", item.c)
        .attr("stroke-dasharray", item.d === "0" ? null : item.d);

      row
        .append("text")
        .attr("class", "legend-text")
        .attr("x", 40)
        .attr("y", 10)
        .text(item.t);
    });
  }

  renderChartMinimap(Patm, visibleRealDataZones);
  applyLanguage(document.getElementById("chart-wrapper"));
  queuePersistedStateSave();
}

function handleMouseMove(e, x, y, minT, maxT, maxH, Patm) {
  const [mx, my] = d3.pointer(e, svg.node());

  const svgElement = svg.node();
  if (State.mode === "point") {
    svgElement.style.cursor = "crosshair";
  } else if (State.mode === "zone") {
    svgElement.style.cursor = "crosshair";
  } else {
    svgElement.style.cursor = "default";
  }

  const { t, w } = getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm);

  if (t < minT || t > maxT || w < 0 || w > maxH) {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const showInfoPanel = document.getElementById("set-show-info-panel");
  if (showInfoPanel && !showInfoPanel.checked) {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const contextMenu = document.getElementById("context-menu");
  if (contextMenu && contextMenu.style.display === "block") {
    document.getElementById("info-panel").style.display = "none";
    return;
  }

  const d = calculateAllProperties(t, w, Patm);
  const panel = document.getElementById("info-panel");
  const tooltipGrid = document.getElementById("tooltip-grid");
  const fieldCount = getSelectedInfoFields().length;

  panel.style.display = "block";
  if (tooltipGrid) {
    const columnMode = fieldCount > 10 ? "3" : "2";
    panel.dataset.columns = columnMode;
    tooltipGrid.dataset.columns = columnMode;
    tooltipGrid.dataset.density = fieldCount > 18 ? "micro" : fieldCount > 14 ? "compact" : fieldCount > 8 ? "medium" : "default";
    tooltipGrid.innerHTML = renderInfoPanelRows(d);
  }

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

  const { t, w } = getTandWFromCoords(mx, my, x, y, minT, maxT, maxH, Patm);

  if (t < minT || t > maxT || w < 0 || w > maxH) return;

  if (State.mode === "point") addPoint(t, w);
  else if (State.mode === "zone") {
    State.tempZone.push({ t, w });
    updateZonePtCount();
    drawChart();
  } else {
    if (State.exploreSubMode === "compare") {
      const d = calculateAllProperties(t, w, Patm);
      if (State.compareTarget === "B") {
        State.probeB = { t, w, data: d };
      } else {
        State.probeA = { t, w, data: d };
        if (!State.probeB) State.compareTarget = "B";
      }
      refreshCompareProbeBadges();
      const panel = document.getElementById("compare-delta-panel");
      if (State.probeA && State.probeB) updateCompareDeltaPanel(State.probeA.data, State.probeB.data);
      else if (panel) panel.innerHTML = "";
      drawChart();
    } else {
      selectPoint(null);
      selectZone(null);
    }
  }
}

function generateHTMLGrid(d) {
  return [
  buildDetailMetricCard("Dry Bulb Temperature (Tdb)", `${d.Tdb.toFixed(2)} °C`),
  buildDetailMetricCard("Wet Bulb Temperature (Twb)", `${d.Twb.toFixed(2)} °C`),
  buildDetailMetricCard("Dew Point Temperature (Tdp)", `${d.Tdp.toFixed(2)} °C`),
  buildDetailMetricCard("Frost Point Temperature (Tf)", `${d.Tf.toFixed(2)} °C`),
  buildDetailMetricCard("Humidity Ratio (W)", `${d.W.toFixed(4)} kg/kg'`),
  buildDetailMetricCard("Relative Humidity (RH)", `${d.RH.toFixed(2)} %`),
  buildDetailMetricCard("Moisture Content (u)", `${d.mu.toFixed(2)} %`),
  buildDetailMetricCard("Enthalpy (h)", `${d.h.toFixed(2)} kJ/kg`),
  buildDetailMetricCard("Specific Heat Capacity (Cp)", `${d.cp.toFixed(3)} kJ/(kg·°C)`),
  buildDetailMetricCard("Specific Volume (v)", `${d.v.toFixed(3)} m³/kg`),
  buildDetailMetricCard("Density (rho)", `${d.rho.toFixed(2)} kg/m³`),
  buildDetailMetricCard("Vapor Partial Pressure (Pw)", `${d.Pw.toFixed(0)} Pa`),
  buildDetailMetricCard("Saturation Vapor Pressure (Pws)", `${d.Pws.toFixed(0)} Pa`),
  buildDetailMetricCard("Vapor Pressure Deficit (VPD)", `${d.VPD.toFixed(2)} Pa`),
  buildDetailMetricCard("Humidity Deficit (HD)", `${d.HD.toFixed(4)} kg/kg'`),
  buildDetailMetricCard("Absolute Humidity (AH)", `${d.AH.toFixed(2)} g/m³`),
  buildDetailMetricCard("Saturation Vapor Concentration (Dvs)", `${d.Dvs.toFixed(2)} g/m³`),
  buildDetailMetricCard("Volume Mixing Ratio (VMR)", `${d.VMR.toFixed(2)} ppm`),
  buildDetailMetricCard("Psychrometric Difference (PD)", `${d.PD.toFixed(2)} °C`),
  buildDetailMetricCard("Saturation Humidity Ratio (Wsat)", `${d.Wsat.toFixed(4)} kg/kg'`),
  ].join("");
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

  const addLabel = (pos, text, cls, loc, tValue = null, ahValue = null) => {
    labels[loc].push({
      pos,
      text,
      class: cls,
      tValue,
      ahValue,
    });
  };

  // 1. VOLUME LINES (Specific Volume) - Only render if visibility.v is true
  if (State.visibility.v) {
    // Dynamic range: cover full visible area (v = Ra*(T+273.15)/Patm, Ra_dry=287.058, Ra_moist bigger)
    const _vLo = Math.max(0.50, Math.floor(287.058 * (minT + 273.15) / Patm / 0.01) * 0.01 - 0.02);
    const _vHi = Math.min(2.00, Math.ceil((287.058 + 461.5 * maxH) * (maxT + 273.15) / Patm / 0.01) * 0.01 + 0.02);
    for (let v = _vLo; v <= _vHi; v = Math.round((v + 0.01) * 1000) / 1000) {
      const ts = Psychro.solveIntersectionWithSaturation(
        "volume",
        v,
        Patm,
        minT,
        maxT
      );
      const te = (v * Patm) / 287.058 - 273.15;

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
              addLabel(x(te), labelText, "lbl-v", "bottom", te, ah);
            } else {
              addLabel(x(te), labelText, "lbl-v", "bottom", te);
            }
          } else {
            const tAtMaxH = Psychro.getTdbFromVolLine(v, maxH, Patm);
            if (tAtMaxH >= minT && tAtMaxH <= maxT) {
              if (State.yAxisType === "absoluteHumidity") {
                const ah = calculateAbsoluteHumidity(tAtMaxH, maxH, Patm);
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
              addLabel(y(minT), labelText, "lbl-v", "left", minT, ah);
            } else {
              addLabel(y(minT), labelText, "lbl-v", "left", minT);
            }
          } else {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(te, 0, Patm);
              addLabel(x(ah), labelText, "lbl-v", "bottom", te, ah);
            } else {
              addLabel(x(0), labelText, "lbl-v", "bottom", te);
            }
          }
        }
      }
    }
  }

  // 2. ENTHALPY LINES - Only render if visibility.h is true
  if (State.visibility.h) {
    // Dynamic range: h = 1.006*T + W*(2501 + 1.86*T)
    const _hLo = Math.max(-300, Math.floor(1.006 * minT / 5) * 5 - 10);
    const _hHi = Math.min(800, Math.ceil((1.006 * maxT + maxH * (2501 + 1.86 * maxT)) / 5) * 5 + 10);
    for (let h = _hLo; h <= _hHi; h += 5) {
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
  }

  // 3. WET BULB LINES - Only render if visibility.twb is true
  if (State.visibility.twb) {
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
  }

  // 4. RELATIVE HUMIDITY LINES - Only render if visibility.rh is true
  // Saturation line (rh=1.0) is only rendered if visibility.sat is also true
  if (State.visibility.rh || State.visibility.sat) {
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((rh) => {
      // Skip saturation line if visibility.sat is false
      if (rh === 1.0 && !State.visibility.sat) return;
      
      // Skip RH lines if visibility.rh is false (but still show saturation if enabled)
      if (rh < 1.0 && !State.visibility.rh) return;
      
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

          if (exitPoint && exitType) {
            if (State.yAxisType === "absoluteHumidity") {
              const ah = calculateAbsoluteHumidity(
                exitPoint.t,
                exitPoint.w,
                Patm
              );
              if (exitType === "top") {
                addLabel(
                  x(getYValue(exitPoint.t, exitPoint.w, Patm)),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "top",
                  exitPoint.t,
                  ah
                );
              } else if (exitType === "right") {
                addLabel(
                  y(exitPoint.t),
                  (rh * 100).toFixed(0) + "%",
                  "lbl-rh",
                  "right",
                  exitPoint.t,
                  ah
                );
              } else if (exitType === "left") {
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
  }

  // 5. DEW POINT LINES - Only render if visibility.tdp is true
  if (State.visibility.tdp) {
    // Draw iso-dew-point lines as labeled horizontal (psychrometric) lines at nice Tdp values
    const tdpStep = (maxT - minT) > 30 ? 10 : 5;
    const tdpStart = Math.ceil(minT / tdpStep) * tdpStep;
    for (let tdp = tdpStart; tdp < maxT; tdp += tdpStep) {
      const W_tdp = Psychro.getWFromPw(Psychro.getSatVapPres(tdp), Patm);
      if (!Number.isFinite(W_tdp) || W_tdp <= 0 || W_tdp > maxH) continue;

      const tdpLabel = `${tdp}`;
      const isAbsHum = State.yAxisType === "absoluteHumidity";
      const ahTdp = isAbsHum ? calculateAbsoluteHumidity((minT + maxT) / 2, W_tdp, Patm) : 0;

      if (chartType === "psychrometric") {
        // Horizontal line from the saturation curve (at T=tdp) rightward — never crosses saturation
        const yPos = isAbsHum ? y(ahTdp) : y(W_tdp);
        const xStart = Math.max(0, x(tdp));
        linesG
          .append("line")
          .attr("class", "tdp-line")
          .attr("y1", yPos)
          .attr("y2", yPos)
          .attr("x1", xStart)
          .attr("x2", width);

        if (isAbsHum) {
          addLabel(yPos, tdpLabel, "lbl-tdp", "right", maxT, ahTdp);
        } else {
          addLabel(yPos, tdpLabel, "lbl-tdp", "right", maxT);
        }
      } else {
        // Mollier: vertical line from top down to the saturation temperature (T=tdp)
        const xPos = isAbsHum ? x(ahTdp) : x(W_tdp);
        const yEnd = Math.min(height, y(tdp));
        linesG
          .append("line")
          .attr("class", "tdp-line")
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", yEnd);

        if (isAbsHum) {
          addLabel(xPos, tdpLabel, "lbl-tdp", "top", minT, ahTdp);
        } else {
          addLabel(xPos, tdpLabel, "lbl-tdp", "top", minT);
        }
      }
    }
  }

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

  const labelInterval = (() => {
    const raw = parseInt(getInputValue("set-line-label-step"), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  })();

  const counters = new Map();
  const filteredLabelData = labelData.filter((entry) => {
    const key = entry.class || "default";
    const count = counters.get(key) || 0;
    counters.set(key, count + 1);
    return count % labelInterval === 0;
  });

  if (filteredLabelData.length === 0) return;

  filteredLabelData.sort((a, b) => a.pos - b.pos);
  const minGap = 15 + (labelInterval - 1) * 6;

  for (let i = 1; i < filteredLabelData.length; i++) {
    if (filteredLabelData[i].pos < filteredLabelData[i - 1].pos + minGap) {
      filteredLabelData[i].pos = filteredLabelData[i - 1].pos + minGap;
    }
  }

  filteredLabelData.forEach((d) => {
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
          xPos = d.pos;
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
          xPos = d.pos;
          yPos = height + bottom;
          anchor = "middle";
          alignment = "hanging";
        }
      }
    } else {
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

    const isVisible =
      xPos >= -20 && xPos <= width + 20 && yPos >= -20 && yPos <= height + 20;

    if (!isVisible) return;

    const textElem = container
      .append("text")
      .attr("class", "smart-label " + d.class)
      .attr("x", xPos)
      .attr("y", yPos)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", alignment)
      .text(d.text);

    if (rotate) {
      textElem
        // .attr("transform", `rotate(-90, ${xPos}, ${yPos})`)
        .attr("x", xPos - 15)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle");
    }
  });
}

// ==========================================
// EXPLORE: LOCK / PROBE / COMPARE A-B
// ==========================================

function setExploreSubMode(subMode) {
  State.exploreSubMode = subMode;
  const icons = { hover: "explore", compare: "compare_arrows" };
  const labels = { hover: "Hover", compare: "Compare A–B" };
  const icon = document.getElementById("explore-submode-icon");
  const label = document.getElementById("explore-submode-label");
  if (icon) icon.textContent = icons[subMode] || "explore";
  if (label) label.textContent = translateLiteral(labels[subMode] || subMode);

  document.getElementById("explore-hover-ui").style.display = subMode === "hover" ? "grid" : "none";
  document.getElementById("explore-compare-ui").style.display = subMode === "compare" ? "grid" : "none";
  if (subMode === "hover") clearProbeAll();
  if (subMode === "compare") setCompareTarget(State.compareTarget || "A");
  syncProbeAStatus();
  ["hover","compare"].forEach(m => {
    const b = document.getElementById("seg-explore-" + m);
    if (b) b.classList.toggle("active", m === subMode);
  });
  scheduleAnimatedTabRefresh();
}

function clearProbeA() {
  State.probeA = null;
  State.compareTarget = "A";
  const dp = document.getElementById("compare-delta-panel");
  if (dp && (!State.probeA || !State.probeB)) dp.innerHTML = "";
  refreshCompareProbeBadges();
  if (State.probeA && State.probeB) updateCompareDeltaPanel(State.probeA.data, State.probeB.data);
  drawChart();
}

function clearProbeB() {
  State.probeB = null;
  State.compareTarget = "B";
  const dp = document.getElementById("compare-delta-panel");
  if (dp && (!State.probeA || !State.probeB)) dp.innerHTML = "";
  refreshCompareProbeBadges();
  if (State.probeA && State.probeB) updateCompareDeltaPanel(State.probeA.data, State.probeB.data);
  drawChart();
}

function clearProbeAll() {
  State.probeA = null;
  State.probeB = null;
  State.compareTarget = "A";
  const dp = document.getElementById("compare-delta-panel");
  if (dp) dp.innerHTML = "";
  refreshCompareProbeBadges();
  syncProbeAStatus();
  drawChart();
}

function updateCompareDeltaPanel(dA, dB) {
  const panel = document.getElementById("compare-delta-panel");
  if (!panel) return;

  const df = (a, b, dec = 2) => {
    const v = b - a;
    return (v >= 0 ? "+" : "") + v.toFixed(dec);
  };
  const cls = (a, b) => b > a ? "delta-pos" : b < a ? "delta-neg" : "";

  panel.innerHTML = `
    <div class="compare-delta-title">\u0394 (B \u2212 A)</div>
    <div class="compare-delta-grid">
      <div class="delta-row"><span class="delta-label">Tdb</span><span class="delta-val ${cls(dA.Tdb,dB.Tdb)}">${df(dA.Tdb,dB.Tdb)} \u00b0C</span></div>
      <div class="delta-row"><span class="delta-label">Twb</span><span class="delta-val ${cls(dA.Twb,dB.Twb)}">${df(dA.Twb,dB.Twb)} \u00b0C</span></div>
      <div class="delta-row"><span class="delta-label">Tdp</span><span class="delta-val ${cls(dA.Tdp,dB.Tdp)}">${df(dA.Tdp,dB.Tdp)} \u00b0C</span></div>
      <div class="delta-row"><span class="delta-label">RH</span><span class="delta-val ${cls(dA.RH,dB.RH)}">${df(dA.RH,dB.RH)} %</span></div>
      <div class="delta-row"><span class="delta-label">W</span><span class="delta-val ${cls(dA.W,dB.W)}">${df(dA.W,dB.W,4)} kg/kg'</span></div>
      <div class="delta-row"><span class="delta-label">VPD</span><span class="delta-val ${cls(dA.VPD,dB.VPD)}">${df(dA.VPD,dB.VPD,4)} kPa</span></div>
      <div class="delta-row"><span class="delta-label">h</span><span class="delta-val ${cls(dA.h,dB.h)}">${df(dA.h,dB.h)} kJ/kg</span></div>
      <div class="delta-row"><span class="delta-label">v</span><span class="delta-val ${cls(dA.v,dB.v)}">${df(dA.v,dB.v,4)} m\u00b3/kg</span></div>
      <div class="delta-row"><span class="delta-label">AH</span><span class="delta-val ${cls(dA.AH,dB.AH)}">${df(dA.AH,dB.AH,2)} g/m\u00b3</span></div>
    </div>`;
}

function renderProbes(layer, x, y, w, h, Patm) {
  const getXY = (probe) => {
    let cx, cy;
    if (State.chartType === "psychrometric") {
      const yVal = State.yAxisType === "absoluteHumidity"
        ? calculateAbsoluteHumidity(probe.t, probe.w, Patm)
        : probe.w;
      cx = x(probe.t);
      cy = y(yVal);
    } else {
      const xVal = State.yAxisType === "absoluteHumidity"
        ? calculateAbsoluteHumidity(probe.t, probe.w, Patm)
        : probe.w;
      cx = x(xVal);
      cy = y(probe.t);
    }
    return { cx, cy };
  };

  const drawPin = (probe, label, colorFill, colorStroke) => {
    const { cx, cy } = getXY(probe);
    const g = layer.append("g").attr("class", "probe-pin probe-" + label.toLowerCase());
    g.append("line").attr("x1", cx - 12).attr("y1", cy).attr("x2", cx + 12).attr("y2", cy).attr("class", "probe-crosshair").attr("stroke", colorStroke).attr("stroke-width", 1.5);
    g.append("line").attr("x1", cx).attr("y1", cy - 12).attr("x2", cx).attr("y2", cy + 12).attr("class", "probe-crosshair").attr("stroke", colorStroke).attr("stroke-width", 1.5);
    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("fill", colorFill).attr("stroke", colorStroke).attr("stroke-width", 1.5).attr("class", "probe-circle");
    g.append("text").attr("x", cx + 10).attr("y", cy - 9).attr("class", "probe-label").attr("fill", colorStroke).attr("font-size", "11px").attr("font-weight", "700").text(label);
  };

  if (State.probeA) drawPin(State.probeA, "A", "rgba(46,125,50,0.18)", "#2e7d32");
  if (State.probeB) drawPin(State.probeB, "B", "rgba(230,81,0,0.18)", "#e65100");

  if (State.probeA && State.probeB) {
    const a = getXY(State.probeA);
    const b = getXY(State.probeB);
    layer.append("line")
      .attr("x1", a.cx).attr("y1", a.cy).attr("x2", b.cx).attr("y2", b.cy)
      .attr("class", "probe-ab-line").attr("stroke", "#9e9e9e").attr("stroke-width", 1).attr("stroke-dasharray", "4,3").attr("opacity", 0.6);
  }
}

// ==========================================
// POINT: BATCH CSV
// ==========================================

function parseBatchCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const results = [];
  const errors = [];

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const parts = line.split(",").map(s => s.trim());
    let name, tdb, w;

    if (parts.length >= 3) {
      name = parts[0];
      tdb = parseFloat(parts[1]);
      w = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      name = null;
      tdb = parseFloat(parts[0]);
      w = parseFloat(parts[1]);
    } else {
      errors.push(formatI18n("csvExpectedColumns", { line: idx + 1 }));
      return;
    }

    if (isNaN(tdb) || isNaN(w)) {
      errors.push(formatI18n("csvNonNumeric", {
        line: idx + 1,
        tdb: parts[parts.length - 2],
        w: parts[parts.length - 1],
      }));
      return;
    }

    if (w < 0 || w > 0.5) {
      errors.push(formatI18n("csvWOutOfRange", { line: idx + 1, w }));
      return;
    }

    results.push({ name: name || formatI18n("defaultBatchPointName", { index: results.length + 1 }), t: tdb, w });
  });

  return { results, errors };
}

function previewBatchPoints() {
  const text = document.getElementById("batch-csv-input").value;
  const preview = document.getElementById("batch-parse-preview");
  preview.style.display = "block";

  if (!text.trim()) {
    preview.innerHTML = `<span style="color:#999">${formatI18n("batchPasteFirst")}</span>`;
    applyLanguage(preview);
    return;
  }

  const { results, errors } = parseBatchCSV(text);

  if (errors.length > 0) {
    preview.innerHTML = `<span style="color:#c62828">${errors.join("<br>")}</span>`;
  } else if (results.length === 0) {
    preview.innerHTML = `<span style="color:#999">${translateLiteral("No valid rows found.")}</span>`;
  } else {
    const rows = results.slice(0, 8).map((row) => formatI18n("batchPreviewRow", {
      name: row.name,
      tdb: row.t,
      w: row.w,
    })).join("<br>");
    const more = results.length > 8 ? formatI18n("batchPreviewMore", { count: results.length - 8 }) : "";
    preview.innerHTML = `<span style="color:#2e7d32">${formatI18n("batchPreviewReady", { count: results.length, rows, more })}</span>`;
  }

  applyLanguage(preview);
}

function submitBatchPoints() {
  const text = document.getElementById("batch-csv-input").value;
  if (!text.trim()) { alert(translateLiteral("No CSV data entered.")); return; }

  const { results, errors } = parseBatchCSV(text);

  if (errors.length > 0) {
    alert(formatI18n("csvErrors", { errors: errors.join("\n") }));
    return;
  }
  if (results.length === 0) { alert(translateLiteral("No valid rows found.")); return; }

  const Patm = getPressureInPa();
  const colors = ["#cc1919","#1565c0","#6a1e8e","#2e7d32","#e65100","#ad1457","#00695c","#37474f"];

  results.forEach((r, i) => {
    const props = calculateAllProperties(r.t, r.w, Patm);
    State.points.push({
      id: Date.now() + i,
      name: r.name,
      color: colors[i % colors.length],
      t: r.t,
      w: r.w,
      data: props
    });
  });

  historyManager.push(State);
  updateLists();
  drawChart();

  document.getElementById("batch-csv-input").value = "";
  const preview = document.getElementById("batch-parse-preview");
  if (preview) { preview.style.display = "none"; preview.innerHTML = ""; }
}

// ==========================================
// POINT: LIVE SENSOR
// ==========================================

function addSensorPoint() {
  const name = document.getElementById("sensor-name").value.trim();
  const url = document.getElementById("sensor-url").value.trim();
  const tdbField = document.getElementById("sensor-tdb-field").value.trim() || "tdb";
  const wField = document.getElementById("sensor-w-field").value.trim() || "w";
  const intervalSec = Math.max(1, parseFloat(document.getElementById("sensor-interval").value) || 5);

  if (!name) { alert(translateLiteral("Please enter a sensor name/ID.")); return; }
  if (!url) { alert(translateLiteral("Please enter a data URL.")); return; }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      alert(translateLiteral("Only http:// and https:// URLs are supported."));
      return;
    }
  } catch (e) {
    alert(translateLiteral("Invalid URL format."));
    return;
  }

  const sensorId = Date.now();
  const Patm = getPressureInPa();

  const sensor = { id: sensorId, name, url, tdbField, wField, intervalSec, status: "connecting", t: null, w: null, lastUpdate: null };
  State.sensors.push(sensor);

  State.points.push({
    id: sensorId,
    name,
    color: "#1565c0",
    t: 25,
    w: 0.01,
    data: calculateAllProperties(25, 0.01, Patm),
    isSensor: true,
    sensorId
  });

  updateLists();
  renderSensorList();
  startSensor(sensorId);

  document.getElementById("sensor-name").value = "";
  document.getElementById("sensor-url").value = "";
}

function startSensor(sensorId) {
  if (_sensorIntervals[sensorId]) clearInterval(_sensorIntervals[sensorId]);
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (!sensor) return;
  const poll = () => fetchSensorData(sensorId);
  poll();
  _sensorIntervals[sensorId] = setInterval(poll, sensor.intervalSec * 1000);
  sensor.status = "polling";
  renderSensorList();
}

function stopSensor(sensorId) {
  if (_sensorIntervals[sensorId]) { clearInterval(_sensorIntervals[sensorId]); delete _sensorIntervals[sensorId]; }
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (sensor) { sensor.status = "stopped"; renderSensorList(); }
}

function removeSensor(sensorId) {
  stopSensor(sensorId);
  State.sensors = State.sensors.filter(s => s.id !== sensorId);
  State.points = State.points.filter(p => p.sensorId !== sensorId);
  updateLists();
  renderSensorList();
  drawChart();
}

async function fetchSensorData(sensorId) {
  const sensor = State.sensors.find(s => s.id === sensorId);
  if (!sensor) return;

  try {
    const response = await fetch(sensor.url, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(formatI18n("invalidHttpRange", { status: response.status }));

    const raw = await response.json();

    const getVal = (obj, path) => path.includes(".")
      ? path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj)
      : obj[path];

    const tdb = parseFloat(getVal(raw, sensor.tdbField));
    const w = parseFloat(getVal(raw, sensor.wField));

    if (isNaN(tdb) || isNaN(w)) {
      throw new Error(formatI18n("sensorFieldsNotNumeric", { tdbField: sensor.tdbField, wField: sensor.wField }));
    }
    if (w < 0 || w > 0.5 || tdb < -100 || tdb > 200) {
      throw new Error(formatI18n("sensorOutOfRange"));
    }

    sensor.t = tdb;
    sensor.w = w;
    sensor.lastUpdate = new Date();
    sensor.status = "live";

    const Patm = getPressureInPa();
    const idx = State.points.findIndex(p => p.sensorId === sensorId);
    if (idx !== -1) {
      State.points[idx].t = tdb;
      State.points[idx].w = w;
      State.points[idx].data = calculateAllProperties(tdb, w, Patm);
    }

    renderSensorList();
    updateLists();
    drawChart();

  } catch (e) {
    sensor.status = formatI18n("sensorErrorPrefix", { message: e.message.substring(0, 50) });
    renderSensorList();
  }
}

function renderSensorList() {
  const panel = document.getElementById("sensor-list-panel");
  if (!panel) return;

  if (State.sensors.length === 0) {
    panel.innerHTML = `<div style="font-size:11px;color:#999;text-align:center;padding:6px;">No sensors added.</div>`;
    applyLanguage(panel);
    return;
  }

  panel.innerHTML = State.sensors.map(s => {
    const statusClass = s.status === "live" ? "status-live" : s.status === "polling" || s.status === "connecting" ? "status-polling" : s.status === "stopped" ? "status-stopped" : "status-error";
    const isRunning = !!_sensorIntervals[s.id];
    const tsStr = s.lastUpdate ? s.lastUpdate.toLocaleTimeString() : "";
    const dataStr = s.t !== null
      ? formatI18n("sensorDataString", { tdb: s.t.toFixed(1), w: s.w.toFixed(4) })
      : translateLiteral("Waiting for data…");
    return `
      <div class="sensor-item">
        <div class="sensor-item-header">
          <span class="sensor-status-dot ${statusClass}"></span>
          <span class="sensor-name">${s.name}</span>
          <div class="sensor-actions">
            ${isRunning
              ? `<div class="icon-btn" onclick="stopSensor(${s.id})" title="Pause"><span class="material-symbols-rounded">pause</span></div>`
              : `<div class="icon-btn" onclick="startSensor(${s.id})" title="Resume"><span class="material-symbols-rounded">play_arrow</span></div>`}
            <div class="icon-btn btn-delete" onclick="removeSensor(${s.id})" title="Remove"><span class="material-symbols-rounded">delete</span></div>
          </div>
        </div>
        <div class="sensor-item-detail">${dataStr}${tsStr ? " \u2502 " + tsStr : ""}<br><span style="color:#aaa">${escapeHtml(getSensorStatusLabel(s.status))}</span></div>
      </div>`;
  }).join("");

  applyLanguage(panel);
}

// ==========================================
// ZONE: AUTO ZONE BY TARGET PARAMETER
// ==========================================

function getWForAutoZoneParam(t, paramType, val, Patm) {
  switch (paramType) {
    case "RH": {
      const Pws = Psychro.getSatVapPres(t);
      return Psychro.getWFromPw(Pws * (val / 100), Patm);
    }
    case "VPD": {
      const Pws = Psychro.getSatVapPres(t);
      const Pw = Pws - val * 1000; // val in kPa, Pws in Pa
      if (Pw <= 0) return null;
      return Psychro.getWFromPw(Pw, Patm);
    }
    case "W": return val;
    case "h": {
      const w = Psychro.getWFromEnthalpyLine(t, val);
      return (w >= 0) ? w : null;
    }
    case "Twb": {
      const w = Psychro.getWFromTwbLine(t, val, Patm);
      return (w >= 0) ? w : null;
    }
    case "Tdp": {
      // Dew point → partial pressure → humidity ratio (independent of t)
      const Pws_dp = Psychro.getSatVapPres(val);
      return Psychro.getWFromPw(Pws_dp, Patm);
    }
    default: return null;
  }
}

function generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH) {
  const tStep = 0.5;
  const upper = [];
  const lower = [];

  for (let t = minT; t <= maxT + 0.01; t += tStep) {
    const wHigh = getWForAutoZoneParam(t, paramType, maxVal, Patm);
    if (wHigh !== null && wHigh >= 0 && wHigh <= maxH * 1.05) {
      upper.push({ t, w: Math.min(wHigh, maxH) });
    }
    const wLow = getWForAutoZoneParam(t, paramType, minVal, Patm);
    if (wLow !== null && wLow >= 0 && wLow <= maxH * 1.05) {
      lower.push({ t, w: Math.min(wLow, maxH) });
    }
  }

  if (upper.length < 2 && lower.length < 2) return [];
  // For params where w is independent of t (W, Tdp), supplement with t-range boundaries
  if (paramType === "W" || paramType === "Tdp") {
    return [
      { t: minT, w: maxVal <= maxH ? maxVal : maxH },
      { t: maxT, w: maxVal <= maxH ? maxVal : maxH },
      { t: maxT, w: minVal },
      { t: minT, w: minVal }
    ];
  }
  return [...upper, ...lower.slice().reverse()];
}

function previewAutoZone() {
  if (getAutoZoneMethod() === "double") {
    updateRangeZone();
    return;
  }

  const paramType = document.getElementById("auto-zone-param").value;
  const minVal = parseFloat(document.getElementById("auto-zone-min").value);
  const maxVal = parseFloat(document.getElementById("auto-zone-max").value);

  if (isNaN(minVal) || isNaN(maxVal) || minVal >= maxVal) {
    State.rangePreview = [];
    drawChart();
    return;
  }

  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);

  State.rangePreview = generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH);
  drawChart();
}

function submitAutoZone() {
  if (getAutoZoneMethod() === "double") {
    updateRangeZone();
    if (State.rangePreview.length < 3) {
      alert(translateLiteral("Could not generate a valid zone. Check parameter values and chart bounds."));
      return;
    }

    const tMin = parseFloat(document.getElementById("rangeTmin").value);
    const tMax = parseFloat(document.getElementById("rangeTmax").value);
    const paramType = document.getElementById("rangeParamType").value;
    const pMin = parseFloat(document.getElementById("rangeP2min").value);
    const pMax = parseFloat(document.getElementById("rangeP2max").value);

    State.zones.push({
      id: Date.now(),
      name: `Auto Tdb/${paramType} ${tMin}\u2013${tMax} / ${pMin}\u2013${pMax}`,
      color: "#7b1fa2",
      points: [...State.rangePreview],
    });

    State.rangePreview = [];
    historyManager.push(State);
    updateLists();
    drawChart();
    return;
  }

  const paramType = document.getElementById("auto-zone-param").value;
  const minVal = parseFloat(document.getElementById("auto-zone-min").value);
  const maxVal = parseFloat(document.getElementById("auto-zone-max").value);

  if (isNaN(minVal) || isNaN(maxVal)) { alert(translateLiteral("Enter valid min and max values.")); return; }
  if (minVal >= maxVal) { alert(translateLiteral("Min must be less than max.")); return; }

  const Patm = getPressureInPa();
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);

  const points = generateAutoZonePoints(paramType, minVal, maxVal, Patm, minT, maxT, maxH);
  if (points.length < 3) { alert(translateLiteral("Could not generate a valid zone. Check parameter values and chart bounds.")); return; }

  const labels = { RH: "RH", VPD: "VPD", W: "W", h: "h", Twb: "Twb", Tdp: "Tdp" };
  const zone = {
    id: Date.now(),
    name: `Auto ${labels[paramType]} ${minVal}\u2013${maxVal}`,
    color: "#7b1fa2",
    points
  };

  State.zones.push(zone);
  State.rangePreview = [];
  historyManager.push(State);
  updateLists();
  drawChart();
}

// ==========================================
// ZONE: BOOLEAN OPERATIONS
// ==========================================

function isPointInPolygon(t, w, polygonPoints) {
  let inside = false;
  const n = polygonPoints.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygonPoints[i].t, yi = polygonPoints[i].w;
    const xj = polygonPoints[j].t, yj = polygonPoints[j].w;
    if (((yi > w) !== (yj > w)) && (t < (xj - xi) * (w - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Sutherland-Hodgman intersection
function clipPolygonSH(subject, clip) {
  if (!subject.length || !clip.length) return [];
  let output = subject.slice();

  for (let i = 0; i < clip.length; i++) {
    if (!output.length) break;
    const input = output;
    output = [];
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const eDt = b.t - a.t, eDw = b.w - a.w;

    const inside = (p) => eDt * (p.w - a.w) - eDw * (p.t - a.t) >= 0;
    const intersect = (s, e) => {
      const dt = e.t - s.t, dw = e.w - s.w;
      const denom = eDt * dw - eDw * dt;
      if (Math.abs(denom) < 1e-12) return null;
      const t_ = ((a.t - s.t) * dw - (a.w - s.w) * dt) / denom;
      return { t: s.t + t_ * dt, w: s.w + t_ * dw };
    };

    for (let k = 0; k < input.length; k++) {
      const p = input[k], q = input[(k + 1) % input.length];
      if (inside(p) && inside(q)) {
        output.push(q);
      } else if (inside(p) && !inside(q)) {
        const ix = intersect(p, q); if (ix) output.push(ix);
      } else if (!inside(p) && inside(q)) {
        const ix = intersect(p, q); if (ix) output.push(ix);
        output.push(q);
      }
    }
  }
  return output;
}

function segSegIntersect(a1, a2, b1, b2) {
  const d1t = a2.t - a1.t, d1w = a2.w - a1.w;
  const d2t = b2.t - b1.t, d2w = b2.w - b1.w;
  const cross = d1t * d2w - d1w * d2t;
  if (Math.abs(cross) < 1e-12) return null;
  const dt = b1.t - a1.t, dw = b1.w - a1.w;
  const s = (dt * d2w - dw * d2t) / cross;
  const u = (dt * d1w - dw * d1t) / cross;
  if (s < 0 || s > 1 || u < 0 || u > 1) return null;
  return { t: a1.t + s * d1t, w: a1.w + s * d1w };
}

// Vertex-collection + angular sort for union/difference
function polygonBooleanVertexMethod(polyA, polyB, operation) {
  const candidates = [];

  polyA.forEach(p => {
    const inB = isPointInPolygon(p.t, p.w, polyB);
    if (operation === "union" || (operation === "difference" && !inB)) {
      candidates.push(p);
    }
  });

  if (operation === "union") {
    polyB.forEach(p => {
      const inA = isPointInPolygon(p.t, p.w, polyA);
      if (!inA) candidates.push(p);
    });
  }

  // Add intersection points of edges
  for (let i = 0; i < polyA.length; i++) {
    for (let j = 0; j < polyB.length; j++) {
      const ix = segSegIntersect(polyA[i], polyA[(i + 1) % polyA.length], polyB[j], polyB[(j + 1) % polyB.length]);
      if (ix) candidates.push(ix);
    }
  }

  if (candidates.length < 3) return null;

  // Sort by polar angle around centroid
  const cx = candidates.reduce((s, p) => s + p.t, 0) / candidates.length;
  const cy = candidates.reduce((s, p) => s + p.w, 0) / candidates.length;
  candidates.sort((a, b) => Math.atan2(a.w - cy, a.t - cx) - Math.atan2(b.w - cy, b.t - cx));

  return candidates;
}

function populateBooleanZoneSelects() {
  const selA = document.getElementById("boolean-zone-a");
  const selB = document.getElementById("boolean-zone-b");
  if (!selA || !selB) return;
  const opts = State.zones.map((z, i) => `<option value="${z.id}">${i + 1}. ${escapeHtml(getLocalizedDisplayName(z.name, "zone", i + 1))}</option>`).join("");
  selA.innerHTML = opts || `<option disabled>No zones yet</option>`;
  selB.innerHTML = opts || `<option disabled>No zones yet</option>`;
  applyLanguage(document.getElementById("zone-boolean-ui"));
  if (State.zones.length >= 2) { selA.value = State.zones[0].id; selB.value = State.zones[1].id; }
}

function applyZoneBoolean() {
  if (State.zones.length < 2) { alert(translateLiteral("Need at least 2 zones.")); return; }

  const aId = parseInt(document.getElementById("boolean-zone-a").value);
  const bId = parseInt(document.getElementById("boolean-zone-b").value);
  const op = document.getElementById("boolean-op").value;

  if (aId === bId) { alert(translateLiteral("Select two different zones.")); return; }

  const zA = State.zones.find(z => z.id === aId);
  const zB = State.zones.find(z => z.id === bId);
  if (!zA || !zB) { alert(translateLiteral("Zone not found.")); return; }

  let resultPoints;
  if (op === "intersect") {
    resultPoints = clipPolygonSH(zA.points, zB.points);
  } else {
    resultPoints = polygonBooleanVertexMethod(zA.points, zB.points, op);
  }

  if (!resultPoints || resultPoints.length < 3) {
    alert(translateLiteral("Result is empty. The zones may not overlap, or the winding direction of the clicked zones may not be compatible with this operation."));
    return;
  }

  const opLabel = { intersect: "\u2229", union: "\u222a", difference: "\u2212" };
  const opColor = { intersect: "#e65100", union: "#1b5e20", difference: "#4a148c" };

  const zone = {
    id: Date.now(),
    name: `${zA.name} ${opLabel[op]} ${zB.name}`,
    color: opColor[op],
    points: resultPoints
  };

  State.zones.push(zone);
  historyManager.push(State);
  updateLists();
  drawChart();
}

window.addEventListener("resize", () => {
  drawChart();
  scheduleAnimatedTabRefresh();
});

// ===== CHART ZOOM + PAN: Ctrl+Scroll (zoom), Scroll (vertical pan), Shift+Scroll (horizontal pan) =====

const _zoomTouch = { active: false, dist0: 1, minT0: 0, maxT0: 50, maxH0: 0.030, minH0: 0 };
const _panTouch  = { active: false, lastX: 0, lastY: 0 };

// ── helpers ──────────────────────────────────────────────────────────────────

function _touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _chartInnerSize() {
  return {
    cw: chartWrapper.clientWidth  - margin.left - margin.right,
    ch: chartWrapper.clientHeight - margin.top  - margin.bottom
  };
}

// ── ZOOM ─────────────────────────────────────────────────────────────────────

function _applyChartZoom(factor, pixX, pixY) {
  if (factor <= 0 || !isFinite(factor)) return;
  const { cw, ch } = _chartInnerSize();
  if (cw <= 0 || ch <= 0) return;

  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);

  const fx = Math.max(0, Math.min(cw, pixX - margin.left)) / cw;
  const fy = Math.max(0, Math.min(ch, pixY - margin.top))  / ch;

  let t_foc, w_foc, ah_foc;
  if (State.chartType === "psychrometric") {
    t_foc = minT + fx * (maxT - minT);
    if (State.yAxisType === "absoluteHumidity") {
      ah_foc = State.viewMinAH + (1 - fy) * (maxAH - State.viewMinAH);
    } else {
      w_foc = State.viewMinH + (1 - fy) * (maxH - State.viewMinH);
    }
  } else {
    if (State.yAxisType === "absoluteHumidity") {
      ah_foc = State.viewMinAH + fx * (maxAH - State.viewMinAH);
    } else {
      w_foc = State.viewMinH + fx * (maxH - State.viewMinH);
    }
    t_foc = minT + (1 - fy) * (maxT - minT);
  }

  let newMinT  = t_foc - (t_foc - minT)          * factor;
  let newMaxT  = t_foc + (maxT - t_foc)           * factor;
  let newMinH = State.viewMinH;
  let newMaxH = maxH;
  let newMinAH = State.viewMinAH;
  let newMaxAH = maxAH;

  if (State.yAxisType === "absoluteHumidity") {
    newMinAH = ah_foc - (ah_foc - State.viewMinAH) * factor;
    newMaxAH = ah_foc + (maxAH - ah_foc) * factor;
  } else {
    newMinH = w_foc - (w_foc - State.viewMinH) * factor;
    newMaxH = w_foc + (maxH - w_foc) * factor;
  }

  const MIN_T = 2;
  const MIN_AH = 1;
  const MAX_AH = 400;
  if (newMaxT - newMinT < MIN_T) { const m = (newMinT + newMaxT) / 2; newMinT = m - MIN_T / 2; newMaxT = m + MIN_T / 2; }
  newMinT = Math.max(min_tdb, Math.min(max_tdb - MIN_T, newMinT));
  newMaxT = Math.min(max_tdb, Math.max(newMinT + MIN_T, newMaxT));

  if (State.yAxisType === "absoluteHumidity") {
    if (newMaxAH - newMinAH < MIN_AH) {
      const m = (newMinAH + newMaxAH) / 2;
      newMinAH = m - MIN_AH / 2;
      newMaxAH = m + MIN_AH / 2;
    }
    newMinAH = Math.max(0, newMinAH);
    newMaxAH = Math.max(newMinAH + MIN_AH, Math.min(MAX_AH, newMaxAH));
    State.viewMinAH = newMinAH;
    document.getElementById("maxAbsHum").value = newMaxAH.toFixed(1);
  } else {
    newMinH = Math.max(0, newMinH);
    newMaxH = Math.max(newMinH + 0.001, Math.min(0.2, newMaxH));
    State.viewMinH = newMinH;
    document.getElementById("maxHum").value  = newMaxH.toFixed(4);
  }

  document.getElementById("minTemp").value = newMinT.toFixed(1);
  document.getElementById("maxTemp").value = newMaxT.toFixed(1);
  if (State.yAxisType === "absoluteHumidity") _syncRatioFromAbsHum();
  else _syncAbsHum();
  registerMinimapZoomActivity();
  drawChart();
}

// ── PAN ──────────────────────────────────────────────────────────────────────
// vertFrac  > 0 → pan toward higher Y-axis values (more humid / hotter)
// horizFrac > 0 → pan toward higher X-axis values (hotter / more humid)

function _applyChartPan(vertFrac, horizFrac) {
  const minT = parseFloat(document.getElementById("minTemp").value);
  const maxT = parseFloat(document.getElementById("maxTemp").value);
  const maxH = parseFloat(document.getElementById("maxHum").value);
  const maxAH = parseFloat(document.getElementById("maxAbsHum").value);
  const tRange = maxT - minT;
  const wRange = maxH - State.viewMinH;
  const ahRange = maxAH - State.viewMinAH;
  let changed = false;

  function panW(frac) {
    const d = frac * wRange;
    let lo = State.viewMinH + d, hi = maxH + d;
    if (lo < 0)   { hi -= lo; lo = 0; }
    if (hi > 0.2) { lo -= (hi - 0.2); hi = 0.2; lo = Math.max(0, lo); }
    State.viewMinH = lo;
    document.getElementById("maxHum").value = hi.toFixed(4);
    changed = true;
  }

  function panAH(frac) {
    const d = frac * ahRange;
    let lo = State.viewMinAH + d, hi = maxAH + d;
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > 400) { lo -= hi - 400; hi = 400; lo = Math.max(0, lo); }
    State.viewMinAH = lo;
    document.getElementById("maxAbsHum").value = hi.toFixed(1);
    _syncRatioFromAbsHum();
    changed = true;
  }

  function panT(frac) {
    const d = frac * tRange;
    let lo = minT + d, hi = maxT + d;
    if (lo < min_tdb) { hi += min_tdb - lo; lo = min_tdb; }
    if (hi > max_tdb) { lo -= hi - max_tdb; hi = max_tdb; lo = Math.max(min_tdb, lo); }
    document.getElementById("minTemp").value = lo.toFixed(1);
    document.getElementById("maxTemp").value = hi.toFixed(1);
    changed = true;
  }

  if (State.chartType === "psychrometric") {
    if (vertFrac  !== 0) {
      if (State.yAxisType === "absoluteHumidity") panAH(vertFrac);
      else panW(vertFrac);
    }
    if (horizFrac !== 0) panT(horizFrac);  // X = Tdb
  } else {
    if (vertFrac  !== 0) panT(vertFrac);   // Y = Tdb (Mollier)
    if (horizFrac !== 0) {
      if (State.yAxisType === "absoluteHumidity") panAH(horizFrac);
      else panW(horizFrac);
    }
  }

  if (changed) {
    _syncAbsHum();
    registerMinimapZoomActivity();
    drawChart();
  }
}

function _syncAbsHum() {
  try { _syncAbsHumFromRatio(); } catch (_) {}
}

// ── MOUSE WHEEL ──────────────────────────────────────────────────────────────

chartWrapper.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = chartWrapper.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;

  if (e.ctrlKey) {
    // ZOOM centred on cursor
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    _applyChartZoom(factor, px, py);
  } else {
    // PAN: normalise delta to ±8% of current range per wheel step
    // scroll up (deltaY < 0) → see higher values (step < 0 means pan toward higher data)
    const step = Math.sign(e.deltaY) * 0.08;
    if (e.shiftKey) {
      // HORIZONTAL PAN (scroll right → see higher X)
      _applyChartPan(0, step);
    } else {
      // VERTICAL PAN (scroll up → see higher Y, so negate step)
      _applyChartPan(-step, 0);
    }
  }
}, { passive: false });

// ── TOUCH: PINCH-ZOOM + 1-FINGER PAN ─────────────────────────────────────────

chartWrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    _panTouch.active = false;
    _zoomTouch.active = true;
    _zoomTouch.dist0 = _touchDist(e.touches[0], e.touches[1]);
    _zoomTouch.minT0 = parseFloat(document.getElementById("minTemp").value);
    _zoomTouch.maxT0 = parseFloat(document.getElementById("maxTemp").value);
    _zoomTouch.maxH0 = parseFloat(document.getElementById("maxHum").value);
    _zoomTouch.minH0 = State.viewMinH;
  } else if (e.touches.length === 1) {
    _zoomTouch.active = false;
    _panTouch.active = true;
    _panTouch.lastX = e.touches[0].clientX;
    _panTouch.lastY = e.touches[0].clientY;
  }
}, { passive: true });

chartWrapper.addEventListener("touchmove", (e) => {
  if (_zoomTouch.active && e.touches.length === 2) {
    e.preventDefault();
    const newDist = _touchDist(e.touches[0], e.touches[1]);
    if (_zoomTouch.dist0 < 1) return;

    // Restore initial domain so every frame zooms from the gesture start
    document.getElementById("minTemp").value = _zoomTouch.minT0;
    document.getElementById("maxTemp").value = _zoomTouch.maxT0;
    document.getElementById("maxHum").value  = _zoomTouch.maxH0;
    State.viewMinH = _zoomTouch.minH0;

    const rect = chartWrapper.getBoundingClientRect();
    const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
    const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
    _applyChartZoom(_zoomTouch.dist0 / newDist, midX, midY);

  } else if (_panTouch.active && e.touches.length === 1) {
    e.preventDefault();
    const { cw, ch } = _chartInnerSize();
    if (cw <= 0 || ch <= 0) return;

    const dx = e.touches[0].clientX - _panTouch.lastX;
    const dy = e.touches[0].clientY - _panTouch.lastY;
    _panTouch.lastX = e.touches[0].clientX;
    _panTouch.lastY = e.touches[0].clientY;

    // finger right (+dx) → content moves right → see lower X → negative horiz frac
    // finger down  (+dy) → content moves down  → see lower Y → negative vert  frac
    const horiz = -(dx / cw) * 0.5;
    const vert  = -(dy / ch) * 0.5;

    _applyChartPan(vert, horiz);
  }
}, { passive: false });

chartWrapper.addEventListener("touchend",   () => { _zoomTouch.active = false; _panTouch.active = false; }, { passive: true });
chartWrapper.addEventListener("touchcancel",() => { _zoomTouch.active = false; _panTouch.active = false; }, { passive: true });

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

function downloadSvgAsSvg(svgSelector, fileName = 'chart.svg') {
  const originalSvg = document.querySelector(svgSelector);
  const clonedSvg = originalSvg.cloneNode(true);

  // Add styles to SVG
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
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

const inputHandlers = {
  "set-language": (event) => {
    setLanguage(event.target.value);
  },
  "set-show-legend": () => {
    drawChart();
  },
  "set-minimap-mode": (event) => {
    setMinimapMode(event.target.value);
  },
  "set-show-rh": (event) => {
    State.visibility.rh = event.target.checked;
    drawChart();
  },
  "set-show-h": (event) => {
    State.visibility.h = event.target.checked;
    drawChart();
  },
  "set-show-twb": (event) => {
    State.visibility.twb = event.target.checked;
    drawChart();
  },
  "set-show-v": (event) => {
    State.visibility.v = event.target.checked;
    drawChart();
  },
  "set-show-sat": (event) => {
    State.visibility.sat = event.target.checked;
    drawChart();
  },
  "set-show-tdp": (event) => {
    State.visibility.tdp = event.target.checked;
    drawChart();
  },
  "set-show-info-panel": (event) => {
    if (!event.target.checked) {
      const panel = document.getElementById("info-panel");
      if (panel) panel.style.display = "none";
    }
  },
  "set-info-precision": (event) => {
    setInfoPrecisionDecimals(event.target.value);
  },
  "set-line-label-step": () => {
    drawChart();
  },
};

function handleInputChange(event) {
  const inputId = event.target.id;
  if (inputHandlers[inputId]) {
    inputHandlers[inputId](event);
  }
  queuePersistedStateSave();
}

const inputs = document.querySelectorAll("input, select");
inputs.forEach((input) => {
  input.addEventListener("input", handleInputChange);
  input.addEventListener("change", handleInputChange);
});

const LOCAL_DB_NAME = "psychrometric-mollier";
const LOCAL_DB_STORE = "workspace";
const LOCAL_DB_KEY = "app-state";
let localDbPromise = null;
let persistTimer = null;
let isHydratingPersistedState = false;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function openLocalDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (localDbPromise) return localDbPromise;

  localDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_DB_STORE)) {
        db.createObjectStore(LOCAL_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return localDbPromise;
}

function captureSettingsSnapshot() {
  const infoFields = getSelectedInfoFields();
  return {
    language: State.language,
    realDataZoneVisibility: cloneValue(State.realDataZoneVisibility),
    chartType: State.chartType,
    yAxisType: State.yAxisType,
    pressure: getInputValue("pressure"),
    pressureUnit: getInputValue("pressure-unit"),
    minTemp: getInputValue("minTemp"),
    maxTemp: getInputValue("maxTemp"),
    maxHum: getInputValue("maxHum"),
    maxAbsHum: getInputValue("maxAbsHum"),
    minHum: getInputValue("minHum"),
    minAbsHum: getInputValue("minAbsHum"),
    showInfoPanel: getCheckboxValue("set-show-info-panel"),
    infoPrecisionDecimals: getInfoPrecisionDecimals(),
    infoPrecisionOffset: getInfoPrecisionDecimals() - DEFAULT_INFO_PRECISION_DECIMALS,
    infoFields: infoFields.join("|"),
    infoPrimary: infoFields[0] || "",
    infoSecondary: infoFields[1] || "",
    minimapMode: normalizeMinimapMode(State.minimapMode),
    showLegend: getCheckboxValue("set-show-legend"),
    labelInterval: getInputValue("set-line-label-step"),
    showRh: getCheckboxValue("set-show-rh"),
    showH: getCheckboxValue("set-show-h"),
    showTwb: getCheckboxValue("set-show-twb"),
    showV: getCheckboxValue("set-show-v"),
    showSat: getCheckboxValue("set-show-sat"),
    showTdp: getCheckboxValue("set-show-tdp"),
  };
}

function captureDataSnapshot() {
  return {
    points: State.points.map((point) => ({
      name: point.name,
      color: point.color,
      t: point.t,
      w: point.w,
      isSensor: !!point.isSensor,
    })),
    zones: State.zones.map((zone) => ({
      name: zone.name,
      color: zone.color,
      points: zone.points.map((point) => ({ t: point.t, w: point.w })),
    })),
  };
}

function captureRuntimeSnapshot() {
  return {
    mode: State.mode,
    pointSubMode: State.pointSubMode,
    zoneSubMode: State.zoneSubMode,
    exploreSubMode: State.exploreSubMode,
    viewMinH: State.viewMinH,
    viewMinAH: State.viewMinAH,
  };
}

function buildPersistedSnapshot() {
  return {
    version: 3,
    settings: captureSettingsSnapshot(),
    data: captureDataSnapshot(),
    runtime: captureRuntimeSnapshot(),
  };
}

async function writePersistedSnapshot(snapshot) {
  const db = await openLocalDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readwrite");
    tx.objectStore(LOCAL_DB_STORE).put(snapshot, LOCAL_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readPersistedSnapshot() {
  const db = await openLocalDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readonly");
    const request = tx.objectStore(LOCAL_DB_STORE).get(LOCAL_DB_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function clearPersistedSnapshot() {
  const db = await openLocalDb();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_DB_STORE, "readwrite");
    tx.objectStore(LOCAL_DB_STORE).delete(LOCAL_DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function queuePersistedStateSave() {
  if (isHydratingPersistedState) return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    writePersistedSnapshot(buildPersistedSnapshot()).catch(() => {});
  }, 180);
}

const DEFAULT_SETTINGS_SNAPSHOT = cloneValue(captureSettingsSnapshot());
const DEFAULT_RUNTIME_SNAPSHOT = cloneValue(captureRuntimeSnapshot());

function resetWorkingCollections() {
  Object.keys(_sensorIntervals).forEach((sensorId) => {
    clearInterval(_sensorIntervals[sensorId]);
    delete _sensorIntervals[sensorId];
  });
  State.points = [];
  State.zones = [];
  State.tempZone = [];
  State.rangePreview = [];
  State.probeA = null;
  State.probeB = null;
  State.sensors = [];
  State.selectedPointId = null;
  State.selectedZoneId = null;
}

async function initializeApp() {
  isHydratingPersistedState = true;
  State.language = getStoredLanguage();
  setRealDataZoneVisibilityMap(State.realDataZoneVisibility);
  const languageSelect = document.getElementById("set-language");
  if (languageSelect) {
    languageSelect.value = State.language;
  }
  renderCursorFieldSettings(DEFAULT_CURSOR_FIELDS);
  setSettingsTab("general");
  setMinimapMode(State.minimapMode, { redraw: false });
  applyLanguage();
  try {
    const snapshot = await readPersistedSnapshot();
    if (snapshot?.settings) {
      applyImportedSettings(snapshot.settings);
    }
    await loadRealDataCatalog();
    resetWorkingCollections();
    if (snapshot?.data) {
      applyImportedData(snapshot.data.points || [], snapshot.data.zones || []);
    } else {
      updateLists();
    }
    State.viewMinH = snapshot?.runtime?.viewMinH ?? DEFAULT_RUNTIME_SNAPSHOT.viewMinH;
    State.viewMinAH = snapshot?.runtime?.viewMinAH ?? DEFAULT_RUNTIME_SNAPSHOT.viewMinAH;
    setMode(snapshot?.runtime?.mode || DEFAULT_RUNTIME_SNAPSHOT.mode);
    setExploreSubMode(["hover","compare"].includes(snapshot?.runtime?.exploreSubMode) ? snapshot.runtime.exploreSubMode : DEFAULT_RUNTIME_SNAPSHOT.exploreSubMode);
    setPointSubMode(snapshot?.runtime?.pointSubMode || DEFAULT_RUNTIME_SNAPSHOT.pointSubMode);
    setZoneSubMode(snapshot?.runtime?.zoneSubMode || DEFAULT_RUNTIME_SNAPSHOT.zoneSubMode);
    updateZonePtCount();
    drawChart();
    scheduleAnimatedTabRefresh();
  } catch (_) {
    await loadRealDataCatalog();
    updateLists();
    drawChart();
    scheduleAnimatedTabRefresh();
  } finally {
    isHydratingPersistedState = false;
  }
}

async function resetLocalState() {
  const confirmed = window.confirm(translateLiteral("Reset all local settings, points, and zones to their defaults?"));
  if (!confirmed) return;

  isHydratingPersistedState = true;
  try {
    await clearPersistedSnapshot();
    resetWorkingCollections();
    State.viewMinH = DEFAULT_RUNTIME_SNAPSHOT.viewMinH;
    State.viewMinAH = DEFAULT_RUNTIME_SNAPSHOT.viewMinAH;
    applyImportedSettings(DEFAULT_SETTINGS_SNAPSHOT);
    updateLists();
    setMode(DEFAULT_RUNTIME_SNAPSHOT.mode);
    setExploreSubMode(DEFAULT_RUNTIME_SNAPSHOT.exploreSubMode);
    setPointSubMode(DEFAULT_RUNTIME_SNAPSHOT.pointSubMode);
    setZoneSubMode(DEFAULT_RUNTIME_SNAPSHOT.zoneSubMode);
    updateZonePtCount();
    drawChart();
    scheduleAnimatedTabRefresh();
  } finally {
    isHydratingPersistedState = false;
  }
}

initializeApp();
initializeAnimatedTabObservers();

document.fonts?.ready?.then(() => scheduleAnimatedTabRefresh());

// === KEYBOARD SHORTCUTS ===

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
    event.preventDefault();
    undoAction();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "y" || (event.key === "z" && event.shiftKey))) {
    event.preventDefault();
    redoAction();
  }
});