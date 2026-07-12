// ==========================================
// i18n.js — English/Korean language engine
// ==========================================


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
    "Import CSV": "CSV 가져오기",
    "PNG Image": "PNG 이미지",
    "SVG Image": "SVG 이미지",
    "CSV Data": "CSV 데이터",
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
    "Click": "클릭",
    "Input": "입력",
    "Auto": "자동",
    "Plants": "식물",
    "Auto Zone": "자동 영역",
    "Plant Dataset": "작물 데이터셋",
    "Shape": "형상",
    "Polygon": "다각형",
    "Oval": "타원",
    "Boundary": "경계",
    "Loose": "느슨하게",
    "Compact": "촘촘하게",
    "Decimal Precision": "소수점 자릿수",
    "Digits after decimal": "소수점 이하 자릿수",
    "Choose how many digits are shown after the decimal point, then pick and sort the hover fields below.": "소수점 이하 몇 자리까지 표시할지 정한 뒤, 아래에서 호버 필드를 선택하고 순서를 바꾸세요.",
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
    "Dew Point (°C)": "이슬점 (°C)",
    "Spec. Volume (m³/kg)": "비체적 (m³/kg)",
    "Generate a zone from iso-lines of a parameter between min and max bounds.": "최소값과 최대값 사이의 등치선을 이용해 영역을 생성하세요.",
    "Auto zone from a single parameter band (e.g. RH or VPD).": "단일 파라미터 밴드(예: RH 또는 VPD)로 자동 영역을 만듭니다.",
    "Parameter": "파라미터",
    "Preview": "미리보기",
    "Create": "생성",
    "Configure a real-data plant zone with polygon or oval boundaries.": "실측 데이터 작물 영역을 다각형 또는 타원 경계로 설정하세요.",
    "Preview updates in real time. Click Apply to show this dataset on the chart.": "미리보기가 실시간으로 갱신됩니다. 이 데이터셋을 차트에 표시하려면 적용을 누르세요.",
    "Apply": "적용",
    "No real-data plant zones are available yet.": "아직 사용할 수 있는 실측 작물 영역이 없습니다.",
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
    "Properties": "속성",
    "Summary": "요약",
    "Vertices": "꼭짓점",
    "Area": "면적",
    "Temp Range": "온도 범위",
    "Axis Span": "축 범위",
    "No points yet": "아직 포인트가 없습니다",
    "Add points manually, by input, in batch, or from a live sensor using the panel above.": "위 패널에서 수동, 입력, 배치 또는 실시간 센서로 포인트를 추가하세요.",
    "No zones yet": "아직 영역이 없습니다",
    "Create a zone manually, by input, automatically, or from a plant dataset to start mapping areas.": "수동, 입력, 자동 또는 작물 데이터셋으로 영역을 만들어 맵핑을 시작하세요.",
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
    "Unsupported file format. Please use CSV.": "지원되지 않는 파일 형식입니다. CSV를 사용하세요.",
    "Enter valid min and max values.": "올바른 최소값과 최대값을 입력하세요.",
    "Min must be less than max.": "최소값은 최대값보다 작아야 합니다.",
    "Could not generate a valid zone. Check parameter values and chart bounds.": "유효한 영역을 생성할 수 없습니다. 파라미터 값과 차트 범위를 확인하세요.",
    "Reset all local settings, points, and zones to their defaults?": "모든 로컬 설정, 포인트, 영역을 기본값으로 재설정할까요?",
    "Explore mode": "탐색 모드",
    "Add points": "포인트 추가",
    "Add zones": "영역 추가",
    "Undo (Ctrl+Z)": "실행 취소 (Ctrl+Z)",
    "Redo (Ctrl+Y)": "다시 실행 (Ctrl+Y)",
    "Chart settings": "차트 설정",
    "Import or export data": "데이터 가져오기 또는 내보내기",
    "Menu": "메뉴",
    "Click vertices": "꼭짓점 클릭",
    "Input params": "파라미터 입력",
    "Auto zone": "자동 영역",
    "Plant zones": "식물 영역",
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
const REAL_DATA_DEFAULT_LABEL_POSITION = "inside";
const REAL_DATA_DEFAULT_LABEL_FONT = "Instrument Sans, sans-serif";
const REAL_DATA_LABEL_OUTSIDE_OFFSET = 18;
const REAL_DATA_LABEL_EDGE_PADDING = 12;

let realDataCatalog = [];
let realDataLoadState = "loading";
let realDataLoadError = "";
