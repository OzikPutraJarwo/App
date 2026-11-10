// i18n.js — UI text in English (default) and Korean. Only labels live here;
// numbers, units and the exported CSV stay the same in every language.
// Static text in index.html carries data-i18n="key" (textContent),
// data-i18n-html="key" (trusted markup from this file) or
// data-i18n-attr="attr:key;attr:key".

export const LANGS = { en: "English", ko: "한국어" };

const DICT = {
  en: {
    "app.home": "PsychroMol home",
    "lang.label": "Language",
    "nav.pages": "Pages",
    "nav.chart": "Chart", "nav.series": "Time series", 
    "nav.tools": "Tools",
    "tools.fit": "Fit to points", "tools.chartAria": "Psychrometric chart with the project's air states and processes",
    "tools.hint": "Click an empty spot on the chart to add a point there.",
    "tools.tabCalc": "Calculator",
    "tools.gh": "Greenhouse data", "tools.ghShow": "Show the data, target zone and DSS action on this chart",
    "tools.ghAdd": "Add this hour as points",
    "tools.ghNote": "Adds the inside air, the end point of the DSS action and outside air (if the data has it). The process uses one air change per hour (flow = greenhouse volume); edit it in the table. Click a grey dot to pick another hour.",
    "tools.ghNone": "No data loaded", "tools.ghOut": "out", "tools.ghAdded": "Added {n} points from {time}",
    "dss.toTools": "Calculate in Tools",
    "tools.clickAdd": "Click to add a point here",
    "tools.project": "Project", "tools.openProject": "Open project", "tools.new": "New", "tools.delete": "Delete",
    "tools.projName": "Project name", "tools.export": "Export file", "tools.import": "Import file", "tools.pdf": "PDF report",
    "tools.defaultName": "Project",
    "tools.find": "Find air condition", "tools.label": "Label (optional)", "tools.addPoint": "Add point",
    "tools.found": "Found: Tdb {t} °C, W {w} g/kg.",
    "tools.in.tdb": "Dry-bulb temperature", "tools.in.rh": "Relative humidity", "tools.in.twb": "Wet-bulb temperature",
    "tools.in.tdp": "Dew point", "tools.in.w": "Humidity ratio", "tools.in.h": "Enthalpy", "tools.in.v": "Specific volume", "tools.in.vpd": "VPD",
    "tools.errSame": "Choose two different properties.",
    "tools.errValue": "Enter both values.",
    "tools.errDependent": "Dew point and humidity ratio describe the same thing; pick another property.",
    "tools.errRange": "This combination is not a possible air state (check the values).",
    "tools.errNone": "No air state matches these two values.",
    "tools.process": "Process", "tools.from": "From", "tools.to": "To", "tools.flow": "Airflow (m³/h)", "tools.addProcess": "Add process",
    "tools.mix": "Mix two air streams", "tools.streamA": "Stream 1", "tools.streamB": "Stream 2",
    "tools.flowA": "Airflow 1 (m³/h)", "tools.flowB": "Airflow 2 (m³/h)", "tools.addMix": "Add mixed point",
    "tools.needTwo": "Choose two different points.", "tools.needFlow": "Enter the airflows.",
    "tools.points": "Air states", "tools.processes": "Processes and loads",
    "tools.procNote": "Airflow is measured at the starting state. Positive loads are added to the air, negative ones removed.",
    "tools.noPoints": "No points yet. Use Find air condition or click the chart.",
    "tools.noProcs": "No processes yet. Add one from the panel.",
    "tools.th.label": "Point", "tools.th.tdb": "Tdb °C", "tools.th.rh": "RH %", "tools.th.w": "W g/kg", "tools.th.twb": "Twb °C",
    "tools.th.tdp": "Tdp °C", "tools.th.h": "h kJ/kg", "tools.th.v": "v m³/kg", "tools.th.vpd": "VPD kPa", "tools.th.ah": "AH g/m³",
    "tools.th.proc": "Process", "tools.th.kind": "Type", "tools.th.flow": "Airflow m³/h", "tools.th.dt": "ΔT °C", "tools.th.dw": "ΔW g/kg",
    "tools.th.dh": "Δh kJ/kg", "tools.th.m": "ṁ kg/s", "tools.th.qs": "Sensible kW", "tools.th.ql": "Latent kW", "tools.th.qt": "Total kW",
    "tools.th.water": "Water kg/h", "tools.th.shr": "SHR",
    "tools.kind.heat": "Sensible heating", "tools.kind.cool": "Sensible cooling", "tools.kind.humid": "Humidification",
    "tools.kind.dehumid": "Dehumidification", "tools.kind.none": "No change", "tools.kind.heatHumid": "Heating + humidification",
    "tools.kind.heatDehumid": "Heating + drying", "tools.kind.coolHumid": "Evaporative cooling", "tools.kind.coolDehumid": "Cooling + dehumidification",
    "tools.lines": "Chart lines", "tools.linesNote": "Choose which lines the chart shows and how they look. Applies to every chart in the app.",
    "tools.line.rh": "Relative humidity", "tools.line.wb": "Wet-bulb", "tools.line.h": "Enthalpy", "tools.line.v": "Specific volume", "tools.line.grid": "Temperature grid",
    "tools.color": "Colour", "tools.width": "Width (px)", "tools.step.rh": "Every (%)", "tools.step.h": "Every (kJ/kg)",
    "tools.linesReset": "Restore default lines",
    "tools.reportMeta": "PsychroMol report · {date} · pressure {p} kPa (altitude {alt} m)",
    "tools.saveFail": "Could not save the project in this browser.",
    "tools.confirmDel": "Delete the project \"{n}\"?",
    "tools.nameTaken": "A project with this name already exists.",
    "tools.imported": "Project \"{n}\" imported.", "tools.importFail": "Could not read {f} as a project.",
    "nav.settings": "Settings", 

    

    "empty.title": "No data loaded yet",
    "empty.text": "Choose a data source in Settings: the demo, your own file, or your sensor API.",
    "btn.demo": "Load demo data",
    "btn.mydata": "Open settings",

    "chart.diagram": "Diagram",
    "chart.psy": "Psychrometric chart",
    "chart.mollier": "Mollier (h–x)",
    "chart.fit": "Fit to data", "chart.fitTitle": "Fit axes to the data",
    "chart.full": "Full range",
    "chart.aria": "Psychrometric chart with the current greenhouse state, crop target zone and recommended action",
    "chart.xT": "Dry-bulb temperature Tdb (°C)",
    "chart.yW": "Humidity ratio W (g/kg dry air)",
    "chart.outside": "Outside",
    "chart.cursor": "Cursor",
    "chart.clickHour": "Click to open this hour",

    "legend.zone": "Crop target zone", "legend.cur": "Current state", 
    "legend.corr": "Correction vector", 
    "legend.measured": "Measured", "legend.band": "Target band", "legend.thr": "Risk threshold",
    "legend.none": "– No feasible action",

    "tl.play": "Play", "tl.pause": "Pause", "tl.prev": "Previous hour", "tl.next": "Next hour",
    "tl.hour": "Hour", "tl.strip": "Recommended action per hour",

    "act.heating": "Heating", "act.fogging": "Fogging", "act.ventilation": "Ventilation", "act.dehumidification": "Dehumidification",
    "actd.heating": "Raise air temperature at constant humidity ratio (heater, less night ventilation).",
    "actd.fogging": "Add water by fogging or misting; the air cools along the wet-bulb line.",
    "actd.ventilation": "Exchange air with outside air along the mixing line.",
    "actd.dehumidification": "Remove water vapour (dehumidifier).",
    "letter.heating": "H", "letter.fogging": "F", "letter.ventilation": "V", "letter.dehumidification": "D",

    "kpi.tdb": "Dry-bulb temperature", "kpi.rh": "Relative humidity", "kpi.w": "Humidity ratio",
    "kpi.vpd": "Vapour pressure deficit", "kpi.cm": "Condensation margin", 
    "kpi.target": "target {lo}–{hi} {u}",
    "kpi.cmSub": "Tdp {tdp} °C",

    "dss.title": "Decision support",
    "dss.edit": "Edit texts",
    "kpi.title": "Current state",
    "verdict.in": "In the crop zone", "verdict.out": "Outside the crop zone", "verdict.risk": "risk",
    "dss.load": "Load data to get a recommendation.",
    "dss.busy": "Calculating…",
    "dss.condRisk": "Condensation risk: margin {v} °C (below {lim} °C)",
    "dss.dryRisk": "Dry stress: VPD {v} kPa (above {lim} kPa)",
    "dss.inZone": "Inside the crop target zone. No action needed.",
    "dss.noAction": "No installed actuator moves this state towards the zone.",
    "dss.noOutside": " Ventilation needs outside temperature and RH columns in the data.",
    "dss.pair": "Combine two actions",
    "dss.partial": "Best available (stops short of the zone)",
    "dss.reach": "Recommended action",
    "dss.ends": "Ends at Tdb {t} °C, W {w} g/kg, VPD {vpd} kPa. ",
    "dss.dh": "Δh {dh} kJ/kg",
    "dss.energy": ", about {e} MJ for the greenhouse air",
    
    "dss.target": "Target this hour: Tdb {tlo}–{thi} °C · VPD {vlo}–{vhi} kPa · margin ≥ {cm} °C",
    "dss.baseline": "Baseline T/RH threshold alarm:",
    "dss.fires": "fires ({what})",
    "dss.silent": "silent",
    "alarm.high": "high", "alarm.low": "low",

    "series.title": "Greenhouse air against the crop target zone",
    "series.note": "Shaded bands are the hourly target. Click any hour to open it on the chart.",
    "series.tdb": "Dry-bulb temperature Tdb (°C)",
    "series.vpd": "Vapour pressure deficit VPD (kPa)",
    "series.cm": "Condensation margin Tdb − Tdp (°C)",
    "series.dryThr": "dry stress > {v} kPa",
    "series.cmThr": "condensation risk < {v} °C",
    "series.action": "Recommended action",
    "series.none": "No data.",
    "raw.title": "Data table",
    "inZone": "In zone",
    "noFeasible": "No feasible action",

    
    
    "res.export": "Export results (CSV)",
    
    
    
    "th.time": "Time", "th.tdb": "Tdb °C", "th.rh": "RH %", "th.w": "W g/kg", "th.vpd": "VPD kPa",
    "th.tdp": "Tdp °C", "th.h": "h kJ/kg", "th.outT": "Outside Tdb °C", "th.outW": "Outside W g/kg",
    "th.cm": "Margin °C", "th.zone": "Zone", "th.action": "Action", 
    "tag.in": "in zone", "tag.risk": "risk", "zone.in": "in", "zone.out": "out", "none": "none",
    "res.nothing": "Nothing to export yet.",

    
    "data.drop": "Drop a file here or", "data.browse": "browse",
    "src.title": "Data source",
    "src.note": "Pick one. Sources are never mixed: switching shows only that source's data.",
    "src.demo": "Demo", "src.file": "My file", "src.api": "API (JSON)",
    "demo.pick": "Demo dataset", "demo.aehobak": "Korean Squash (애호박)", "demo.tomato": "Tomato",
    "set.crop": "Crop (target profile)", "crop.aehobak": "Korean Squash (애호박)", "crop.tomato": "Tomato",
    "src.fileNote": "CSV or JSON with time, Tdb and one humidity value per row. The rows are saved in this browser.",
    "src.apiNote": "The app requests this URL at every interval, updates the chart and time series, and saves each new reading in this browser. The device must allow CORS.",
    "src.test": "Test URL",
    "map.title": "Fields",
    "map.note": "Leave a field empty to recognise it by common names (timestamp, temperature, humidity, …). Use dots for nested fields, e.g. sensor.temp.",
    "map.path": "List path (JSON)", "map.time": "Time", "map.t": "Temperature Tdb (°C)",
    "map.hum": "Humidity", "map.humType": "Humidity type",
    "map.outT": "Outside temperature (optional)", "map.outRh": "Outside RH % (optional)",
    "map.found": "Fields found:", "map.first": "First row read as:", "map.none": "nothing recognised. Fill in the fields above.",
    "hum.rh": "RH (%)", "hum.w_gkg": "W (g/kg)", "hum.w_kgkg": "W (kg/kg)", "hum.tdp": "Dew point (°C)", "hum.vpd": "VPD (kPa)",
    
    
    "data.url": "URL", "data.interval": "Interval",
    "data.unit": "Interval unit", "unit.s": "seconds", "unit.min": "minutes", "unit.h": "hours",
    "store.info": "Saved in this browser: {n} records (site storage about {mb} MB). Polling only runs while this page is open.",
    "store.clear": "Delete saved data", "store.confirm": "Delete all data saved in this browser for this source?",
    "store.cleared": "Saved data deleted.", "store.fail": "Could not save in the browser: {e}",
    "raw.latest": "Showing the latest {k} of {n} records. Export CSV for all of them.",
    "raw.more": "Show more rows",
    "data.start": "Start polling", "data.stop": "Stop polling",
    
    
    "st.inside": "{n} records, {a} to {b}",
    "st.nothing": "Nothing loaded.",
    "st.demo": "Demo loaded: {n} hours.",
    "st.noRows": "The file was read, but no rows were recognised. Check the fields below.",
    "st.apiTest": "{n} records received, {k} recognised.",
    
    "st.apiNoUrl": "Enter the API URL first.",
    "st.apiOk": "Last reading {time}: {n} new, {total} in total",
    "st.apiFail": "Request failed: {e}. Check the URL and that the Pi allows CORS.",
    "st.apiMixed": "this page is served over https, so the browser blocks an http:// sensor URL. Use an https:// URL for the sensor, or open the app from http:// (for example on the local network)",
    "st.stopped": "Stopped.",
    "toast.demoFail": "Could not load the demo: {e}",
    "toast.inside": "{n} records loaded.",
    
    "toast.readFail": "Could not read {f}",
    "toast.readFailDetail": "Could not read {f}: {e}",
    "toast.reset": "Settings reset to defaults.",
    "toast.textsReset": "Decision texts reset.",
    

    "set.gh": "Greenhouse", "set.len": "Length (m)", "set.wid": "Width (m)", "set.hgt": "Mean height (m)",
    "set.general": "Greenhouse and language", "set.zoneDss": "Target zone and decision rules",
    "set.profileNote": "The hourly optimum comes from the literature profile of the chosen crop (see Method). With Demo, the crop follows the demo dataset.",
    "texts.title": "Decision texts",
    "texts.note": "Rewrite what farmers read in the decision panel, in the active language. Leave a box empty to keep the built-in text.",
    "texts.name": "Name", "texts.advice": "Advice", "texts.messages": "Messages",
    "texts.inZone": "Inside the zone", "texts.noAction": "No action possible",
    "texts.condRisk": "Condensation warning ({v} = margin, {lim} = limit)", "texts.dryRisk": "Dry-stress warning ({v} = VPD, {lim} = limit)",
    "texts.reset": "Restore built-in texts",
    "set.alt": "Altitude (m)",
    "set.vol": "Air volume {v} m³, used for the energy estimate.",
    "set.noVol": "Enter the size to estimate the energy of each action.",
    "set.p": "Atmospheric pressure {p} kPa.",
    "set.act": "Installed actuators", 
    "set.heat": "Heating", "set.fog": "Fogging / misting", "set.vent": "Ventilation (vents, fans)", "set.dehum": "Dehumidifier",
    "set.ttol": "Tdb tolerance ± (°C)", "set.vtol": "VPD tolerance ± (kPa)",
    "set.vmin": "Min. VPD (kPa)", "set.cm": "Min. condensation margin (°C)",
    "set.cos": "Aligned action cos ≥",
    "set.refNote": "ΔT_ref and ΔW_ref set how 1 °C compares with 1 g/kg when finding the nearest point of the zone.",
    "set.base": "Baseline T/RH threshold alarm", "set.rhHi": "RH high (%)", "set.rhLo": "RH low (%)",
    "set.useZoneT": "Temperature alarm uses the hourly zone Tdb band (day/night)",
    "set.axes": "Chart axes", "set.tmin": "Tdb min (°C)", "set.tmax": "Tdb max (°C)", "set.wmax": "W max (g/kg)",
    "set.reset": "Reset all settings to defaults", "set.stored": "Settings are stored in this browser.",

    "about.title": "How the decision support works",
    "about.body": `<p>Each greenhouse reading is a point on the psychrometric chart. For every hour the app builds a <strong>crop target zone</strong> from the optimum profile of the chosen crop (Korean Squash or Tomato): dry-bulb temperature within the optimum ± tolerance, VPD within its band, and a condensation margin (Tdb − Tdp) of at least 2 °C.</p>
<p>The default profile comes from published sources: 22–25 °C by day and 13–15 °C at night for Korean Squash (애호박) in a greenhouse (Goo et al., 2022, <em>J. Bio-Environ. Control</em> 31:468–475), and VPD 0.5–1.5 kPa by day (Yu et al., 2023, <em>Vegetable Research</em> 3:20) with 0.3 kPa as the night floor (Shamshiri et al., 2018, <em>Int. Agrophysics</em> 32:287–302). Day is 08–17 h and night 19–06 h.</p>
<p>For <strong>tomato</strong> the profile is an estimate from commonly cited greenhouse ranges: 24 °C by day and 17 °C at night, VPD 0.8 kPa by day and 0.5 kPa at night (Shamshiri et al., 2018; Peet and Welles, 2005).</p>
<p>When the point lies outside the zone, the app finds the nearest point of the zone in physical space (temperature and humidity ratio, scaled by ΔT_ref and ΔW_ref), so the answer never depends on zoom or screen size. The <strong>correction vector</strong> runs from the current state to that point.</p>
<p>Every installed actuator moves the air along a fixed direction on the chart:</p>
<ul>
<li><strong>Heating</strong> moves right at constant humidity ratio.</li>
<li><strong>Fogging</strong> moves up-left along the wet-bulb line (enthalpy almost constant).</li>
<li><strong>Ventilation</strong> moves along the mixing line towards the outside-air point. It needs outside temperature and RH columns in the data and is only offered when mixing actually brings the air closer to the zone.</li>
<li><strong>Dehumidification</strong> moves down (lower humidity ratio).</li>
</ul>
<p>Each action is followed along its own path. The action that reaches the zone and best matches the correction vector is recommended. If none reaches it, an aligned action, a combination of two actions, or the closest action is shown. Energy is estimated as Q = (V / v) × Δh.</p>
<p>Risk criteria: condensation when the margin is below 2 °C, dry stress when VPD is above 1.5 kPa. The data table and exported CSV compare them with a plain <strong>baseline T/RH threshold alarm</strong> (RH &gt; 90% or &lt; 50%).</p>
<h3>Engine</h3>
<p>Moist-air properties follow ASHRAE Fundamentals 2017 with the Hyland–Wexler saturation pressure, verified against PsychroLib. The psychrometric chart is the primary view; the Mollier (h–x) diagram shows the same states in the oblique h–W convention.</p>
<p class="muted">PsychroMol · Mokpo National University, Department of Horticultural Science.</p>`,
  },

  ko: {
    "app.home": "PsychroMol 홈",
    "lang.label": "언어",
    "nav.pages": "페이지",
    "nav.chart": "선도", "nav.series": "시계열", 
    "nav.tools": "도구",
    "tools.fit": "점에 맞춤", "tools.chartAria": "프로젝트의 공기 상태와 과정을 보여주는 습공기선도",
    "tools.hint": "선도의 빈 곳을 클릭하면 그 위치에 점을 추가합니다.",
    "tools.tabCalc": "계산기",
    "tools.gh": "온실 데이터", "tools.ghShow": "이 선도에 데이터, 목표 영역, DSS 조치 표시",
    "tools.ghAdd": "이 시각을 점으로 추가",
    "tools.ghNote": "실내 공기, DSS 조치의 끝점, 외기(데이터에 있으면)를 추가합니다. 과정은 시간당 1회 환기(유량 = 온실 부피)로 계산하며 표에서 바꿀 수 있습니다. 회색 점을 클릭하면 다른 시각을 고릅니다.",
    "tools.ghNone": "불러온 데이터 없음", "tools.ghOut": "외기", "tools.ghAdded": "{time}에서 점 {n}개 추가",
    "dss.toTools": "Tools에서 계산",
    "tools.clickAdd": "클릭하면 여기에 점을 추가합니다",
    "tools.project": "프로젝트", "tools.openProject": "프로젝트 열기", "tools.new": "새로", "tools.delete": "삭제",
    "tools.projName": "프로젝트 이름", "tools.export": "파일로 내보내기", "tools.import": "파일 가져오기", "tools.pdf": "PDF 보고서",
    "tools.defaultName": "프로젝트",
    "tools.find": "공기 상태 찾기", "tools.label": "이름 (선택)", "tools.addPoint": "점 추가",
    "tools.found": "찾음: Tdb {t} °C, W {w} g/kg.",
    "tools.in.tdb": "건구온도", "tools.in.rh": "상대습도", "tools.in.twb": "습구온도",
    "tools.in.tdp": "이슬점", "tools.in.w": "절대습도", "tools.in.h": "엔탈피", "tools.in.v": "비체적", "tools.in.vpd": "VPD",
    "tools.errSame": "서로 다른 두 물성을 고르세요.",
    "tools.errValue": "두 값을 모두 입력하세요.",
    "tools.errDependent": "이슬점과 절대습도는 같은 정보입니다. 다른 물성을 고르세요.",
    "tools.errRange": "가능한 공기 상태가 아닙니다 (값을 확인하세요).",
    "tools.errNone": "이 두 값에 맞는 공기 상태가 없습니다.",
    "tools.process": "과정", "tools.from": "시작", "tools.to": "끝", "tools.flow": "풍량 (m³/h)", "tools.addProcess": "과정 추가",
    "tools.mix": "두 공기 혼합", "tools.streamA": "공기 1", "tools.streamB": "공기 2",
    "tools.flowA": "풍량 1 (m³/h)", "tools.flowB": "풍량 2 (m³/h)", "tools.addMix": "혼합점 추가",
    "tools.needTwo": "서로 다른 두 점을 고르세요.", "tools.needFlow": "풍량을 입력하세요.",
    "tools.points": "공기 상태", "tools.processes": "과정과 부하",
    "tools.procNote": "풍량은 시작 상태 기준입니다. 양수는 공기에 더해지는 부하, 음수는 제거되는 부하입니다.",
    "tools.noPoints": "아직 점이 없습니다. 공기 상태 찾기를 쓰거나 선도를 클릭하세요.",
    "tools.noProcs": "아직 과정이 없습니다. 패널에서 추가하세요.",
    "tools.th.label": "점", "tools.th.tdb": "Tdb °C", "tools.th.rh": "RH %", "tools.th.w": "W g/kg", "tools.th.twb": "습구 °C",
    "tools.th.tdp": "이슬점 °C", "tools.th.h": "h kJ/kg", "tools.th.v": "v m³/kg", "tools.th.vpd": "VPD kPa", "tools.th.ah": "AH g/m³",
    "tools.th.proc": "과정", "tools.th.kind": "종류", "tools.th.flow": "풍량 m³/h", "tools.th.dt": "ΔT °C", "tools.th.dw": "ΔW g/kg",
    "tools.th.dh": "Δh kJ/kg", "tools.th.m": "ṁ kg/s", "tools.th.qs": "현열 kW", "tools.th.ql": "잠열 kW", "tools.th.qt": "전열 kW",
    "tools.th.water": "수분 kg/h", "tools.th.shr": "SHR",
    "tools.kind.heat": "현열 가열", "tools.kind.cool": "현열 냉각", "tools.kind.humid": "가습",
    "tools.kind.dehumid": "제습", "tools.kind.none": "변화 없음", "tools.kind.heatHumid": "가열 + 가습",
    "tools.kind.heatDehumid": "가열 + 건조", "tools.kind.coolHumid": "증발 냉각", "tools.kind.coolDehumid": "냉각 + 제습",
    "tools.lines": "선도의 선", "tools.linesNote": "선도에 보일 선과 모양을 고릅니다. 앱의 모든 선도에 적용됩니다.",
    "tools.line.rh": "상대습도", "tools.line.wb": "습구온도", "tools.line.h": "엔탈피", "tools.line.v": "비체적", "tools.line.grid": "온도 격자",
    "tools.color": "색", "tools.width": "굵기 (px)", "tools.step.rh": "간격 (%)", "tools.step.h": "간격 (kJ/kg)",
    "tools.linesReset": "기본 선으로 되돌리기",
    "tools.reportMeta": "PsychroMol 보고서 · {date} · 대기압 {p} kPa (해발 {alt} m)",
    "tools.saveFail": "이 브라우저에 프로젝트를 저장하지 못했습니다.",
    "tools.confirmDel": "\"{n}\" 프로젝트를 삭제할까요?",
    "tools.nameTaken": "같은 이름의 프로젝트가 이미 있습니다.",
    "tools.imported": "\"{n}\" 프로젝트를 가져왔습니다.", "tools.importFail": "{f} 파일을 프로젝트로 읽지 못했습니다.",
    "nav.settings": "설정", 

    

    "empty.title": "아직 불러온 데이터가 없습니다",
    "empty.text": "설정에서 데이터 소스를 고르세요: 예시, 내 파일, 또는 센서 API.",
    "btn.demo": "예시 데이터 불러오기",
    "btn.mydata": "설정 열기",

    "chart.diagram": "선도 종류",
    "chart.psy": "습공기선도",
    "chart.mollier": "몰리에 선도 (h–x)",
    "chart.fit": "데이터에 맞춤", "chart.fitTitle": "축 범위를 데이터에 맞춤",
    "chart.full": "전체 범위",
    "chart.aria": "현재 온실 상태, 작물 목표 영역, 추천 조치를 보여주는 습공기선도",
    "chart.xT": "건구온도 Tdb (°C)",
    "chart.yW": "절대습도 W (g/kg 건공기)",
    "chart.outside": "외기",
    "chart.cursor": "커서",
    "chart.clickHour": "클릭하면 이 시각을 엽니다",

    "legend.zone": "작물 목표 영역", "legend.cur": "현재 상태", 
    "legend.corr": "보정 벡터", 
    "legend.measured": "측정값", "legend.band": "목표 범위", "legend.thr": "위험 기준선",
    "legend.none": "– 가능한 조치 없음",

    "tl.play": "재생", "tl.pause": "일시정지", "tl.prev": "이전 시각", "tl.next": "다음 시각",
    "tl.hour": "시각", "tl.strip": "시각별 추천 조치",

    "act.heating": "난방", "act.fogging": "포그 분무", "act.ventilation": "환기", "act.dehumidification": "제습",
    "actd.heating": "절대습도는 그대로 두고 기온을 올립니다 (난방기, 야간 환기 줄이기).",
    "actd.fogging": "포그나 미스트로 물을 공급합니다. 공기는 습구온도선을 따라 냉각됩니다.",
    "actd.ventilation": "혼합선을 따라 외기와 공기를 교환합니다.",
    "actd.dehumidification": "수증기를 제거합니다 (제습기).",
    "letter.heating": "H", "letter.fogging": "F", "letter.ventilation": "V", "letter.dehumidification": "D",

    "kpi.tdb": "건구온도", "kpi.rh": "상대습도", "kpi.w": "절대습도",
    "kpi.vpd": "수증기압차 (VPD)", "kpi.cm": "결로 여유", 
    "kpi.target": "목표 {lo}–{hi} {u}",
    "kpi.cmSub": "이슬점 {tdp} °C",

    "dss.title": "의사결정 지원",
    "dss.edit": "문구 편집",
    "kpi.title": "현재 상태",
    "verdict.in": "작물 목표 영역 안", "verdict.out": "작물 목표 영역 밖", "verdict.risk": "위험",
    "dss.load": "데이터를 불러오면 추천 조치가 표시됩니다.",
    "dss.busy": "계산 중…",
    "dss.condRisk": "결로 위험: 여유 {v} °C (기준 {lim} °C 미만)",
    "dss.dryRisk": "건조 스트레스: VPD {v} kPa (기준 {lim} kPa 초과)",
    "dss.inZone": "작물 목표 영역 안에 있습니다. 조치가 필요 없습니다.",
    "dss.noAction": "설치된 장치 중 이 상태를 목표 영역 쪽으로 옮길 수 있는 것이 없습니다.",
    "dss.noOutside": " 환기를 평가하려면 데이터에 외기 온도와 습도 열이 있어야 합니다.",
    "dss.pair": "두 조치를 함께 사용",
    "dss.partial": "가장 나은 조치 (목표 영역에 못 미침)",
    "dss.reach": "추천 조치",
    "dss.ends": "도착점: Tdb {t} °C, W {w} g/kg, VPD {vpd} kPa. ",
    "dss.dh": "Δh {dh} kJ/kg",
    "dss.energy": ", 온실 공기 기준 약 {e} MJ",
    
    "dss.target": "이 시각의 목표: Tdb {tlo}–{thi} °C · VPD {vlo}–{vhi} kPa · 여유 ≥ {cm} °C",
    "dss.baseline": "기존 온습도 기준 경보:",
    "dss.fires": "울림 ({what})",
    "dss.silent": "울리지 않음",
    "alarm.high": "높음", "alarm.low": "낮음",

    "series.title": "작물 목표 영역 대비 온실 공기",
    "series.note": "음영은 시각별 목표 범위입니다. 시각을 클릭하면 선도에서 열립니다.",
    "series.tdb": "건구온도 Tdb (°C)",
    "series.vpd": "수증기압차 VPD (kPa)",
    "series.cm": "결로 여유 Tdb − Tdp (°C)",
    "series.dryThr": "건조 스트레스 > {v} kPa",
    "series.cmThr": "결로 위험 < {v} °C",
    "series.action": "추천 조치",
    "series.none": "데이터 없음.",
    "raw.title": "데이터 표",
    "inZone": "목표 영역 안",
    "noFeasible": "가능한 조치 없음",

    
    
    "res.export": "결과 내보내기 (CSV)",
    
    
    
    "th.time": "시각", "th.tdb": "Tdb °C", "th.rh": "RH %", "th.w": "W g/kg", "th.vpd": "VPD kPa",
    "th.tdp": "이슬점 °C", "th.h": "h kJ/kg", "th.outT": "외기 Tdb °C", "th.outW": "외기 W g/kg",
    "th.cm": "여유 °C", "th.zone": "영역", "th.action": "조치", 
    "tag.in": "영역 안", "tag.risk": "위험", "zone.in": "안", "zone.out": "밖", "none": "없음",
    "res.nothing": "아직 내보낼 결과가 없습니다.",

    
    "data.drop": "파일을 여기에 놓거나", "data.browse": "찾아보기",
    "src.title": "데이터 소스",
    "src.note": "하나만 고르세요. 소스는 섞이지 않으며, 바꾸면 그 소스의 데이터만 표시됩니다.",
    "src.demo": "예시", "src.file": "내 파일", "src.api": "API (JSON)",
    "demo.pick": "예시 데이터", "demo.aehobak": "애호박 (Korean Squash)", "demo.tomato": "토마토",
    "set.crop": "작물 (목표 프로파일)", "crop.aehobak": "애호박", "crop.tomato": "토마토",
    "src.fileNote": "각 행에 시각, Tdb, 습도 값 하나가 있는 CSV 또는 JSON. 행은 이 브라우저에 저장됩니다.",
    "src.apiNote": "정한 간격마다 이 URL을 요청해 선도와 시계열을 갱신하고, 새 측정값을 이 브라우저에 저장합니다. 장치가 CORS를 허용해야 합니다.",
    "src.test": "URL 테스트",
    "map.title": "필드",
    "map.note": "비워 두면 흔한 이름(timestamp, temperature, humidity 등)으로 찾습니다. 중첩 필드는 점으로 씁니다. 예: sensor.temp",
    "map.path": "목록 경로 (JSON)", "map.time": "시각", "map.t": "온도 Tdb (°C)",
    "map.hum": "습도", "map.humType": "습도 종류",
    "map.outT": "외기 온도 (선택)", "map.outRh": "외기 상대습도 % (선택)",
    "map.found": "찾은 필드:", "map.first": "첫 행 해석:", "map.none": "인식된 값이 없습니다. 위 필드를 채우세요.",
    "hum.rh": "상대습도 (%)", "hum.w_gkg": "W (g/kg)", "hum.w_kgkg": "W (kg/kg)", "hum.tdp": "이슬점 (°C)", "hum.vpd": "VPD (kPa)",
    
    
    "data.url": "URL", "data.interval": "간격",
    "data.unit": "간격 단위", "unit.s": "초", "unit.min": "분", "unit.h": "시간",
    "store.info": "이 브라우저에 저장됨: 기록 {n}개 (사이트 저장 공간 약 {mb} MB). 수신은 이 페이지가 열려 있을 때만 동작합니다.",
    "store.clear": "저장된 데이터 삭제", "store.confirm": "이 소스에 대해 브라우저에 저장된 데이터를 모두 삭제할까요?",
    "store.cleared": "저장된 데이터를 삭제했습니다.", "store.fail": "브라우저에 저장하지 못했습니다: {e}",
    "raw.latest": "기록 {n}개 중 최근 {k}개만 표시합니다. 전체는 CSV로 내보내세요.",
    "raw.more": "더 보기",
    "data.start": "수신 시작", "data.stop": "수신 중지",
    
    
    "st.inside": "{n}개 기록, {a} – {b}",
    "st.nothing": "불러온 데이터 없음.",
    "st.demo": "예시 불러옴: {n}시간.",
    "st.noRows": "파일은 읽었지만 인식된 행이 없습니다. 아래 필드를 확인하세요.",
    "st.apiTest": "기록 {n}개 수신, {k}개 인식.",
    
    "st.apiNoUrl": "먼저 API URL을 입력하세요.",
    "st.apiOk": "마지막 수신 {time}: 새 기록 {n}개, 전체 {total}개",
    "st.apiFail": "요청 실패: {e}. URL과 라즈베리파이의 CORS 허용 여부를 확인하세요.",
    "st.apiMixed": "이 페이지는 https로 열려 있어 브라우저가 http:// 센서 URL을 차단합니다. 센서에 https:// URL을 쓰거나, 앱을 http://(예: 내부 네트워크)로 여세요",
    "st.stopped": "중지됨.",
    "toast.demoFail": "예시를 불러오지 못했습니다: {e}",
    "toast.inside": "{n}개 기록을 불러왔습니다.",
    
    "toast.readFail": "{f} 파일을 읽지 못했습니다",
    "toast.readFailDetail": "{f} 파일을 읽지 못했습니다: {e}",
    "toast.reset": "설정을 기본값으로 되돌렸습니다.",
    "toast.textsReset": "의사결정 문구를 되돌렸습니다.",
    

    "set.gh": "온실", "set.len": "길이 (m)", "set.wid": "폭 (m)", "set.hgt": "평균 높이 (m)",
    "set.general": "온실과 언어", "set.zoneDss": "목표 영역과 판단 규칙",
    "set.profileNote": "시간별 최적값은 선택한 작물의 문헌 프로파일에서 가져옵니다 (방법 참고). 예시 데이터에서는 작물이 데이터에 맞춰집니다.",
    "texts.title": "의사결정 문구",
    "texts.note": "의사결정 패널에서 농가가 읽는 문구를 현재 언어로 고쳐 쓸 수 있습니다. 비워 두면 기본 문구를 씁니다.",
    "texts.name": "이름", "texts.advice": "조언", "texts.messages": "메시지",
    "texts.inZone": "목표 영역 안", "texts.noAction": "가능한 조치 없음",
    "texts.condRisk": "결로 경고 ({v} = 여유, {lim} = 기준)", "texts.dryRisk": "건조 스트레스 경고 ({v} = VPD, {lim} = 기준)",
    "texts.reset": "기본 문구로 되돌리기",
    "set.alt": "해발고도 (m)",
    "set.vol": "공기 부피 {v} m³ (에너지 계산에 사용).",
    "set.noVol": "크기를 입력하면 조치별 에너지를 계산합니다.",
    "set.p": "대기압 {p} kPa.",
    "set.act": "설치된 장치", 
    "set.heat": "난방", "set.fog": "포그 / 미스트 분무", "set.vent": "환기 (창, 팬)", "set.dehum": "제습기",
    "set.ttol": "Tdb 허용 범위 ± (°C)", "set.vtol": "VPD 허용 범위 ± (kPa)",
    "set.vmin": "최소 VPD (kPa)", "set.cm": "최소 결로 여유 (°C)",
    "set.cos": "정렬 조치 cos ≥",
    "set.refNote": "ΔT_ref와 ΔW_ref는 목표 영역의 가장 가까운 점을 찾을 때 1 °C와 1 g/kg을 어떻게 비교할지 정합니다.",
    "set.base": "기존 온습도 기준 경보", "set.rhHi": "RH 상한 (%)", "set.rhLo": "RH 하한 (%)",
    "set.useZoneT": "온도 경보에 시각별 목표 영역의 Tdb 범위(주간/야간)를 사용",
    "set.axes": "선도 축", "set.tmin": "Tdb 최소 (°C)", "set.tmax": "Tdb 최대 (°C)", "set.wmax": "W 최대 (g/kg)",
    "set.reset": "모든 설정을 기본값으로", "set.stored": "설정은 이 브라우저에 저장됩니다.",

    "about.title": "의사결정 지원의 작동 방식",
    "about.body": `<p>온실의 측정값 하나하나가 습공기선도 위의 한 점입니다. 앱은 선택한 작물(애호박 또는 토마토)의 최적 프로파일로 시각마다 <strong>작물 목표 영역</strong>을 만듭니다. 건구온도는 최적값 ± 허용 범위, VPD는 정해진 범위 안, 결로 여유(Tdb − Tdp)는 2 °C 이상입니다.</p>
<p>기본 프로파일은 발표된 문헌에 근거합니다. 온실 애호박의 주간 22–25 °C, 야간 13–15 °C (Goo 등, 2022, <em>생물환경조절학회지</em> 31:468–475), 주간 VPD 0.5–1.5 kPa (Yu 등, 2023, <em>Vegetable Research</em> 3:20), 야간 VPD 하한 0.3 kPa (Shamshiri 등, 2018, <em>Int. Agrophysics</em> 32:287–302). 주간은 08–17시, 야간은 19–06시입니다.</p>
<p><strong>토마토</strong> 프로파일은 흔히 인용되는 온실 범위에서 추정한 값입니다. 주간 24 °C, 야간 17 °C, VPD 주간 0.8 kPa, 야간 0.5 kPa (Shamshiri 등, 2018; Peet와 Welles, 2005).</p>
<p>점이 영역 밖에 있으면, 앱은 물리 공간(온도와 절대습도를 ΔT_ref, ΔW_ref로 나눈 공간)에서 영역의 가장 가까운 점을 찾습니다. 그래서 결과는 확대나 화면 크기에 따라 달라지지 않습니다. <strong>보정 벡터</strong>는 현재 상태에서 그 점까지 이어집니다.</p>
<p>설치된 장치는 선도 위에서 정해진 방향으로 공기를 옮깁니다.</p>
<ul>
<li><strong>난방</strong>: 절대습도를 유지한 채 오른쪽으로 이동합니다.</li>
<li><strong>포그 분무</strong>: 습구온도선을 따라 왼쪽 위로 이동합니다 (엔탈피 거의 일정).</li>
<li><strong>환기</strong>: 혼합선을 따라 외기 점 쪽으로 이동합니다. 데이터에 외기 온도와 습도 열이 있어야 하며, 혼합이 실제로 공기를 영역에 더 가깝게 할 때만 제시합니다.</li>
<li><strong>제습</strong>: 아래쪽(절대습도 감소)으로 이동합니다.</li>
</ul>
<p>각 조치는 자기 경로를 따라 계산합니다. 영역에 도달하면서 보정 벡터와 가장 잘 맞는 조치를 추천합니다. 도달하는 조치가 없으면 방향이 잘 맞는 조치, 두 조치의 조합, 또는 가장 가까이 가는 조치를 보여줍니다. 에너지는 Q = (V / v) × Δh로 추정합니다.</p>
<p>위험 기준: 결로 여유가 2 °C 미만이면 결로 위험, VPD가 1.5 kPa를 넘으면 건조 스트레스입니다. 데이터 표와 내보낸 CSV에서는 이를 단순한 <strong>기존 온습도 기준 경보</strong>(RH &gt; 90% 또는 &lt; 50%)와 비교합니다.</p>
<h3>계산 엔진</h3>
<p>습공기 물성은 ASHRAE Fundamentals 2017과 Hyland–Wexler 포화수증기압 식을 따르며, PsychroLib과 비교해 검증했습니다. 습공기선도가 기본 화면이고, 몰리에(h–x) 선도는 같은 상태를 h–W 사선 좌표로 보여줍니다.</p>
<p class="muted">PsychroMol · 국립목포대학교 원예과학과.</p>`,
  },
};

let lang = "en";
let custom = {}; // user-edited texts: { en: { key: text }, ko: { ... } }

export const getLang = () => lang;

// Keys whose text the user may rewrite in Settings (decision texts).
export const EDITABLE = [
  "act.heating", "actd.heating", "act.fogging", "actd.fogging",
  "act.ventilation", "actd.ventilation", "act.dehumidification", "actd.dehumidification",
  "dss.inZone", "dss.noAction", "dss.condRisk", "dss.dryRisk",
];
export const setCustom = (c) => { custom = c || {}; };
// Built-in text, ignoring user edits (shown as the placeholder).
export const tDefault = (key) => DICT[lang][key] ?? DICT.en[key] ?? key;

export function setLang(l) {
  lang = DICT[l] ? l : "en";
  document.documentElement.lang = lang;
}

// t("key", {name: value}) → text in the active language, English as fallback.
export function t(key, vars) {
  let s = custom[lang]?.[key] || DICT[lang][key] || DICT.en[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// Fill every tagged element in the page.
export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
}
