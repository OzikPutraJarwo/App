// app.js — UI: pages, state, settings and wiring. All calculations live in
// the pure modules (psychro, zone, dss, report, data). Loaded file and API
// rows are kept in the browser (store.js), so API polling works as a logger.

import { pressureFromAltitude } from "./psychro.js";
import { DEFAULT_ZONE } from "./zone.js";
import { DEFAULT_DSS, DEFAULT_BASELINE, RISK } from "./dss.js";
import { parseText, toSeries, toProfile, fetchSensor, outsideFromSeries, fieldNames, extractRecords } from "./data.js";
import { evaluate, toCSV } from "./report.js";
import { drawChart, exportSVG, ACTION_LABEL, DEFAULT_LINES } from "./chart.js";
import { initTools, render as renderTools, relabel as relabelTools, addHour } from "./tools-ui.js";
import { drawSeries } from "./series.js";
import { loadRows, saveRows, replaceRows, clearRows, usage } from "./store.js";
import { t, tDefault, setLang, setCustom, applyStatic, EDITABLE } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const STORE = "psychromol-settings-v3"; // v3: literature-based zone defaults
const FULL_RANGE = { tMin: 0, tMax: 45, wMin: 0, wMax: 30 };
// Demo datasets (hourly, 3 months; made by tools/make-demo-data.mjs). Each demo
// sets the crop.
const DEMOS = {
  // day: the example day shown when "Show: One day" is on (same days as the KSBEC talk)
  aehobak: { file: "data/demo/aehobak-synthetic-2026-03-05.json", crop: "aehobak", day: "2026-04-13", hour: "03:00" },
  tomato: { file: "data/demo/tomato-synthetic-2025-08-10.json", crop: "tomato", day: "2025-08-02", hour: "13:00" },
};
const PROFILES = { aehobak: "data/profiles/aehobak-literature.json", tomato: "data/profiles/tomato-literature.json" };
const SOURCES = ["demo", "file", "api"];
const UNIT_MS = { s: 1000, min: 60000, h: 3600000 };
const STRIP_MAX = 72; // hours in the hourly row (3 days)
const TABLE_STEP = 200; // rows drawn in the data table at a time ("Show more" adds more; CSV has all)
let tableRows = TABLE_STEP;

const DEFAULTS = {
  view: "psy",
  lang: "en",
  source: "demo", // exactly one of SOURCES; sources are never combined
  demo: "aehobak", // key of DEMOS
  crop: "aehobak", // key of PROFILES (the demo sets it; user picks it for file/API)
  span: "day", // "day": show one day (demo example day, or the latest day of file/API data); "all": every row
  altitude: 0,
  greenhouse: { l: 0, w: 0, h: 0 },
  actuators: { ...DEFAULT_DSS.actuators },
  tRef: DEFAULT_DSS.tRef, wRef: DEFAULT_DSS.wRef, cosMin: DEFAULT_DSS.cosMin,
  zone: { ...DEFAULT_ZONE },
  baseline: { ...DEFAULT_BASELINE },
  range: { ...FULL_RANGE },
  lines: structuredClone(DEFAULT_LINES), // chart background lines (Tools → Lines)
  toolsGh: true,                          // show greenhouse data on the Tools chart
  // running: polling resumes after a reload until the user stops it.
  api: { url: "", interval: 60, unit: "s", path: "", running: false },
  // Field names for file and API data; empty = recognise by common names.
  map: { time: "", t: "", hum: "", humType: "rh", outT: "", outRh: "" },
  texts: { en: {}, ko: {} }, // user-edited decision texts per language
};

let cfg = load();
// all = every row of the active source; series = the rows shown and evaluated (see spanRows).
const data = { all: [], series: [], profile: [], outside: [], index: 0, results: [], live: false, fileRecs: null };
let poller = null, player = null;

function load() {
  const base = structuredClone(DEFAULTS);
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    for (const k of Object.keys(base)) if (s[k] !== undefined) base[k] = typeof base[k] === "object" ? { ...base[k], ...s[k] } : s[k];
  } catch { /* storage unavailable */ }
  if (!SOURCES.includes(base.source)) base.source = "demo";
  return base;
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* storage unavailable */ } }

const pressure = () => pressureFromAltitude(cfg.altitude || 0);
const volume = () => cfg.greenhouse.l * cfg.greenhouse.w * cfg.greenhouse.h;
const settings = () => ({
  zone: cfg.zone,
  baseline: cfg.baseline,
  dss: { tRef: cfg.tRef, wRef: cfg.wRef, cosMin: cfg.cosMin, actuators: cfg.actuators, volume: volume() },
});
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hatch = (a) => (a === "dehumidification" ? " hatch" : "");
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Action chip: colour plus the action's letter, so the action never relies on colour alone.
const chip = (a) => `<span class="achip a-${a}${hatch(a)}" aria-hidden="true">${esc(t(`letter.${a}`))}</span>`;
// Two-action ("pair") chip: both colours side by side, each with its letter.
const chipPair = ([a, b]) => `<span class="achip pair" style="--c1:var(--a-${a});--c2:var(--a-${b})" aria-hidden="true"><span>${esc(t(`letter.${a}`))}</span><span>${esc(t(`letter.${b}`))}</span></span>`;
const WEEKDAY = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ko: ["일", "월", "화", "수", "목", "금", "토"] };
const dayLabel = (time) => {
  const d = new Date(`${time.slice(0, 10)}T00:00:00Z`);
  const wd = (WEEKDAY[cfg.lang] || WEEKDAY.en)[d.getUTCDay()];
  return cfg.lang === "ko" ? `${+time.slice(5, 7)}월 ${+time.slice(8, 10)}일 (${wd})` : `${wd} ${time.slice(0, 10)}`;
};

// ---------- feedback ----------

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  $("toasts").append(el);
  setTimeout(() => el.remove(), 4500);
}

const tipEl = $("tooltip");
function tooltip(html, e) {
  if (!html) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let left = e.clientX + 14, top = e.clientY + 14;
  if (left + r.width > innerWidth - 8) left = e.clientX - r.width - 14;
  if (top + r.height > innerHeight - 8) top = e.clientY - r.height - 14;
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${Math.max(8, top)}px`;
}

function setStatus(text, cls = "") { const el = $("src-status"); el.textContent = text; el.className = "status " + cls; }

// ---------- computation ----------

// Long series are evaluated in a Web Worker: the chart shows the data at once
// and the zone / DSS results appear when the worker answers (stale answers
// are dropped). Short series (and browsers without module workers) run inline.
const WORKER_MIN = 300;
let worker = null, jobId = 0;
try { worker = new Worker(new URL("./eval-worker.js", import.meta.url), { type: "module" }); } catch { worker = null; }
if (worker) worker.onmessage = (e) => {
  if (e.data.id !== jobId) return;
  const series = data.series;
  if (e.data.results.length !== series.length) return;
  data.results = e.data.results.map((r, i) => ({ row: series[i], ...r }));
  data.busy = false;
  renderPage();
};

// Rows shown for the "Show" setting. Each hour is evaluated on its own, so
// showing one day does not change any hour's result.
function spanRows(all) {
  if (cfg.span === "all" || !all.length) return all;
  const want = cfg.source === "demo" ? DEMOS[cfg.demo]?.day : null;
  const day = want && all.some((r) => r.time.startsWith(want)) ? want : all.at(-1).time.slice(0, 10);
  return all.filter((r) => r.time.startsWith(day));
}

// Hour a demo opens at: the KSBEC deck's example hour on the example day.
const demoStart = () => {
  const d = DEMOS[cfg.demo];
  const i = data.series.findIndex((r) => r.time === `${d.day}T${d.hour}`);
  return i >= 0 ? i : Math.max(0, data.series.findIndex((r) => r.time.endsWith(`T${d.hour}`)));
};

function recompute() {
  tableRows = TABLE_STEP;
  data.series = spanRows(data.all);
  data.outside = outsideFromSeries(data.series);
  data.index = Math.min(data.index, Math.max(data.series.length - 1, 0));
  jobId++;
  const ready = data.series.length && data.profile.length;
  if (ready && worker && data.series.length >= WORKER_MIN) {
    data.results = data.series.map((row) => ({ row, zone: null, rec: null, outside: null, alarm: null }));
    data.busy = true;
    worker.postMessage({ id: jobId, series: data.series, profile: data.profile, outside: data.outside, settings: settings(), p: pressure() });
    return;
  }
  data.busy = false;
  data.results = ready
    ? evaluate(data.series, data.profile, data.outside, settings(), pressure())
    : data.series.map((row) => ({ row, zone: null, rec: null, outside: null, alarm: null }));
}

// ---------- routing: #chart, #series, #settings[/texts] ----------

const PAGES = ["chart", "series", "tools", "settings"];
const currentPage = () => { const p = location.hash.slice(1).split("/")[0]; return PAGES.includes(p) ? p : "chart"; };
function route() {
  const page = currentPage();
  PAGES.forEach((p) => { $(`page-${p}`).hidden = p !== page; });
  document.querySelectorAll("[data-page]").forEach((a) => { if (a.dataset.page === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const sub = location.hash.split("/")[1];
  if (!(page === "settings" && sub)) window.scrollTo(0, 0);
  if (page === "settings" && sub) { const el = $(`set-${sub}`); if (el) { el.open = true; el.scrollIntoView({ block: "start" }); } }
  renderPage(page);
}
function renderPage(page = currentPage()) {
  const empty = !data.series.length && (page === "chart" || page === "series");
  $("empty").hidden = !empty;
  if (page === "chart" || page === "series") $(`page-${page}`).hidden = empty;
  if (empty) return;
  if (page === "chart") renderChartPage();
  if (page === "series") { drawSeries($("series"), data.results, { onPick: openHour, tooltip }); renderTable(); }
  if (page === "settings") renderSource();
  if (page === "tools") renderTools();
}
function openHour(i) {
  if (i < 0) return;
  data.index = i;
  if (currentPage() !== "chart") location.hash = "#chart"; else renderChartPage();
}
const refresh = () => { recompute(); renderPage(); };

// ---------- chart page ----------

function drawMain() {
  const r = data.results[data.index];
  drawChart($("chart"), {
    view: cfg.view, range: cfg.range, p: pressure(), lines: cfg.lines,
    series: data.series, current: r?.row, zone: r?.zone, rec: r?.rec, outside: r?.outside,
    onPick: openHour, tooltip,
    onZoom: (range, done) => { cfg.range = range; drawMain(); if (done) { save(); syncSettings(); } },
  });
}

function renderChartPage() {
  const r = data.results[data.index];
  drawMain();
  $("slider").max = Math.max(data.series.length - 1, 0);
  $("slider").value = data.index;
  $("time-label").textContent = r ? `${dayLabel(r.row.time)} · ${r.row.time.slice(11)}` : "–";
  $("view-psy").setAttribute("aria-pressed", cfg.view === "psy");
  $("view-mollier").setAttribute("aria-pressed", cfg.view === "mollier");
  renderDss(r);
  renderKpis(r);
  renderStrip();
}

function kpi(k, v, unit, s = "", cls = "", big = false) {
  const flag = cls === "risk" ? icon("alert") : cls === "warn" ? icon("info") : "";
  return `<div class="kpi ${cls}${big ? " big" : ""}"><div class="k">${k}</div><div class="v">${v}<small>${unit}</small></div>${s ? `<div class="s">${flag}${s}</div>` : ""}</div>`;
}

function renderVerdict(r) {
  const el = $("verdict");
  const rec = r?.rec;
  if (!rec) { el.className = "verdict"; el.innerHTML = r ? `<span>${t(data.busy ? "dss.busy" : "dss.load")}</span>` : ""; return; }
  const s = rec.state;
  const risk = s.condMargin < RISK.condMargin || s.VPD / 1000 > RISK.vpdHigh;
  const cls = risk ? "risk" : rec.inZone ? "ok" : "warn";
  el.className = `verdict ${cls}`;
  el.innerHTML = `${icon(cls === "ok" ? "check" : "alert")}<span>${esc(t(rec.inZone ? "verdict.in" : "verdict.out"))}${risk ? ` · ${esc(t("verdict.risk"))}` : ""}</span>`;
}

function renderKpis(r) {
  const el = $("kpis");
  renderVerdict(r);
  const s = r?.rec?.state;
  if (!s) { el.innerHTML = r ? kpi(t("kpi.tdb"), fmt(r.row.t), "°C", "", "", true) + kpi(t("kpi.w"), fmt(r.row.w * 1000, 2), "g/kg") : ""; return; }
  const cm = s.condMargin, vpd = s.VPD / 1000;
  const cmCls = cm < RISK.condMargin ? "risk" : cm < RISK.condMargin + 1 ? "warn" : "ok";
  const vpdCls = vpd > RISK.vpdHigh ? "risk" : vpd < r.zone.vpdLo || vpd > r.zone.vpdHi ? "warn" : "ok";
  const tCls = s.Tdb < r.zone.tLo || s.Tdb > r.zone.tHi ? "warn" : "ok";
  el.innerHTML =
    kpi(t("kpi.tdb"), fmt(s.Tdb), "°C", t("kpi.target", { lo: fmt(r.zone.tLo), hi: fmt(r.zone.tHi), u: "°C" }), tCls, true) +
    kpi(t("kpi.vpd"), fmt(vpd, 2), "kPa", t("kpi.target", { lo: fmt(r.zone.vpdLo, 2), hi: fmt(r.zone.vpdHi, 2), u: "kPa" }), vpdCls) +
    kpi(t("kpi.rh"), fmt(s.RH, 0), "%", `W ${fmt(s.W * 1000, 2)} g/kg`) +
    kpi(t("kpi.cm"), fmt(cm), "°C", t("kpi.cmSub", { tdp: fmt(s.Tdp) }), cmCls);
}

// Hourly row: one column per hour (time, Tdb, action chip), like an hourly
// weather forecast. A window around the current hour; it scrolls sideways.
function renderStrip() {
  const el = $("strip");
  const n = data.results.length;
  if (n < 2) { el.innerHTML = ""; return; }
  const max = Math.min(STRIP_MAX, n);
  const from = Math.min(Math.max(0, data.index - Math.floor(max / 2)), Math.max(0, n - max));
  let html = "", day = "";
  for (let i = from; i < from + max; i++) {
    const r = data.results[i], time = r.row.time, d = time.slice(0, 10);
    const acts = r.rec && !r.rec.inZone ? r.rec.actions : [];
    const what = r.rec ? (r.rec.inZone ? t("inZone") : r.rec.actions.map((k) => ACTION_LABEL[k]).join(" + ") || t("noFeasible")) : "–";
    const mark = r.rec?.inZone ? `<span class="achip in" aria-hidden="true">${icon("check")}</span>` : acts.length > 1 ? chipPair(acts) : acts.length ? chip(acts[0]) : `<span class="achip none" aria-hidden="true">–</span>`;
    const newDay = d !== day; day = d;
    html += `<button type="button" class="hr${i === data.index ? " cur" : ""}${newDay ? " day" : ""}" data-i="${i}" aria-label="${esc(`${time.replace("T", " ")}: ${what}`)}"${i === data.index ? ' aria-current="true"' : ""}>`
      + `<span class="dd">${newDay ? esc(dayLabel(time)) : ""}</span><span class="hh">${time.slice(11, 13)}</span>`
      + `<span class="tt">${fmt(r.row.t, 0)}°</span>${mark}</button>`;
  }
  el.innerHTML = html;
  const cur = el.querySelector(".hr.cur");
  if (cur) el.scrollLeft = cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2;
}

function renderDss(r) {
  const panel = $("dss-panel");
  if (!r?.zone) { panel.innerHTML = `<p class="muted">${t(data.busy ? "dss.busy" : "dss.load")}</p>`; return; }
  const { rec, zone, alarm, outside } = r;
  const s = rec.state;

  const alerts = [];
  if (s.condMargin < RISK.condMargin) alerts.push(`<div class="alert risk">${icon("alert")}<span>${esc(t("dss.condRisk", { v: fmt(s.condMargin), lim: RISK.condMargin }))}</span></div>`);
  if (s.VPD / 1000 > RISK.vpdHigh) alerts.push(`<div class="alert risk">${icon("alert")}<span>${esc(t("dss.dryRisk", { v: fmt(s.VPD / 1000, 2), lim: RISK.vpdHigh }))}</span></div>`);

  let action;
  if (rec.inZone) action = `<div class="alert ok">${icon("check")}<span>${esc(t("dss.inZone"))}</span></div>`;
  else if (!rec.actions.length) action = `<div class="alert warn">${icon("info")}<span>${esc(t("dss.noAction"))}${outside ? "" : t("dss.noOutside")}</span></div>`;
  else {
    const head = rec.match === "pair" ? "dss.pair" : rec.match === "partial" ? "dss.partial" : "";
    action = (head ? `<h3 class="act-head">${t(head)}</h3>` : "") + rec.actions.map((a) => `
      <div class="action">${chip(a)}
        <div><strong>${esc(ACTION_LABEL[a])}</strong></div></div>`).join("") +
      `<p class="ends">${esc(((rec.match === "pair" ? "" : t("dss.ends", { t: fmt(rec.end.t), w: fmt(rec.end.w * 1000, 2), vpd: fmt(rec.end.state.VPD / 1000, 2) })) + t("dss.dh", { dh: fmt(rec.dh, 2) }) + (rec.energyMJ !== null ? t("dss.energy", { e: fmt(rec.energyMJ, 2) }) : "")).replace(/^ · /, ""))}</p>`;
  }

  const alarmText = [alarm.rh && `RH ${t(`alarm.${alarm.rh}`)}`, alarm.t && `Tdb ${t(`alarm.${alarm.t}`)}`].filter(Boolean).join(", ");
  panel.innerHTML = `
    ${action}${alerts.join("")}
    <div class="compare">${t("dss.baseline")} <strong>${alarmText ? esc(t("dss.fires", { what: alarmText })) : t("dss.silent")}</strong></div>`;
}

// ---------- time series page: raw data table ----------

function renderTable() {
  const hasOut = data.series.some((r) => r.out);
  const keys = ["time", "tdb", "rh", "w", "tdp", "vpd", "cm", "h", ...(hasOut ? ["outT", "outW"] : []), "zone", "action"];
  const from = Math.max(0, data.results.length - tableRows);
  $("raw-note").textContent = from ? t("raw.latest", { k: data.results.length - from, n: data.results.length }) : "";
  $("raw-more").hidden = !from;
  const body = data.results.slice(from).map((r, j) => {
    const i = from + j;
    const s = r.rec?.state;
    const a = r.rec ? (r.rec.inZone ? `<span class="tag ok">${icon("check")}${t("tag.in")}</span>` : r.rec.actions.length
      ? r.rec.actions.map((k) => `<span class="chip"><i class="a-${k}${hatch(k)}"></i>${esc(ACTION_LABEL[k])}</span>`).join(" + ")
      : `<span class="muted">${t("none")}</span>`) : "–";
    const risk = s && (s.condMargin < RISK.condMargin || s.VPD / 1000 > RISK.vpdHigh);
    return `<tr data-i="${i}"><td>${esc(r.row.time.replace("T", " "))}</td><td>${fmt(r.row.t)}</td><td>${fmt(s?.RH, 0)}</td><td>${fmt(r.row.w * 1000, 2)}</td>
      <td>${fmt(s?.Tdp)}</td><td>${fmt(s ? s.VPD / 1000 : NaN, 2)}</td><td>${fmt(s?.condMargin)}${risk ? ` <span class="tag risk">${icon("alert")}${t("tag.risk")}</span>` : ""}</td><td>${fmt(s?.h)}</td>
      ${hasOut ? `<td>${fmt(r.row.out?.t)}</td><td>${fmt(r.row.out ? r.row.out.w * 1000 : NaN, 2)}</td>` : ""}
      <td>${r.rec ? t(r.rec.inZone ? "zone.in" : "zone.out") : "–"}</td><td>${a}</td></tr>`;
  }).join("");
  $("raw-table").innerHTML = `<thead><tr>${keys.map((k) => `<th>${t(`th.${k}`)}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

// ---------- data source: demo | file | api (one at a time) ----------

function useSeries(rows, msg) {
  data.all = rows;
  data.index = 0;
  refresh();
  if (msg) toast(msg);
}

async function loadDemo() {
  if (!DEMOS[cfg.demo]) cfg.demo = "aehobak";
  const d = DEMOS[cfg.demo];
  try {
    if (cfg.crop !== d.crop) { cfg.crop = d.crop; save(); await loadProfile(); }
    const text = await fetch(d.file).then((r) => r.text());
    data.all = toSeries(parseText(text, ".json"), pressure());
    recompute();
    data.index = demoStart();
    renderPage();
  } catch (e) { toast(t("toast.demoFail", { e: e.message }), true); }
}

async function loadProfile() {
  try { data.profile = toProfile(parseText(await fetch(PROFILES[cfg.crop] || PROFILES.aehobak).then((r) => r.text()), ".json")); }
  catch (e) { toast(t("toast.demoFail", { e: e.message }), true); }
}

async function setDemo(key) {
  if (!DEMOS[key] || (key === cfg.demo && data.series.length)) return;
  cfg.demo = key; save();
  data.all = data.series = []; data.index = 0;
  await loadDemo();
  renderSource();
}

// Rows saved in the browser for the file or API source.
async function loadStored(src) {
  try { data.all = (await loadRows(src)).sort((a, b) => a.time.localeCompare(b.time)); }
  catch { data.all = []; }
  data.index = Number.MAX_SAFE_INTEGER; // recompute clamps it to the last shown row
  refresh();
}

async function setSource(src) {
  if (src === cfg.source && data.series.length) return renderSource();
  stopPolling(true);
  cfg.api.running = false;
  cfg.source = src; save();
  data.all = data.series = []; data.index = 0; data.live = false;
  if (src === "demo") await loadDemo();
  else await loadStored(src);
  renderSource();
}

async function renderStorage() {
  const stored = cfg.source !== "demo";
  $("storage").hidden = !stored;
  if (!stored) return;
  const u = await usage();
  $("storage-info").textContent = t("store.info", { n: data.all.length, mb: u === null ? "–" : fmt(u / 1e6, 2) });
}

function renderSource() {
  document.querySelectorAll("[data-source]").forEach((b) => b.setAttribute("aria-checked", b.dataset.source === cfg.source));
  document.querySelectorAll("[data-pane]").forEach((el) => { el.hidden = !el.dataset.pane.split(" ").includes(cfg.source); });
  $("api-toggle").textContent = t(poller ? "data.stop" : "data.start");
  document.querySelectorAll("[data-span]").forEach((b) => b.setAttribute("aria-checked", b.dataset.span === cfg.span));
  renderStorage();
  if (cfg.source === "api") return;
  document.querySelectorAll("[data-demo]").forEach((b) => b.setAttribute("aria-checked", b.dataset.demo === cfg.demo));
  $("crop").value = cfg.crop;
  $("crop").disabled = cfg.source === "demo";
  if (cfg.source === "demo") setStatus(data.all.length ? t("st.demo", { n: data.all.length }) : "", data.all.length ? "ok" : "");
  else if (!data.all.length) setStatus(data.fileRecs ? t("st.noRows") : t("st.nothing"), data.fileRecs ? "err" : "");
  else setStatus(t("st.inside", { n: data.all.length, a: data.all[0].time.replace("T", " "), b: data.all.at(-1).time.replace("T", " ") }), "ok");
}

// Shows the fields found in the first record and how the first row was read.
function showPreview(raw, rows) {
  const fields = fieldNames(raw);
  $("field-list").innerHTML = fields.map((f) => `<option value="${esc(f)}">`).join("");
  const r = rows[0];
  $("preview").hidden = !raw;
  $("preview").textContent = raw ? `${t("map.found")} ${fields.join(", ")}\n${t("map.first")} ${r
    ? `${r.time || "–"} · Tdb ${fmt(r.t)} °C · W ${fmt(r.w * 1000, 2)} g/kg${r.out ? ` · ${t("chart.outside")} ${fmt(r.out.t)} °C` : ""}`
    : t("map.none")}` : "";
}

const readMap = () => ({ ...cfg.map });

function parseFileRecs() {
  const rows = toSeries(data.fileRecs, pressure(), readMap());
  showPreview(data.fileRecs[0], rows);
  useSeries(rows);
  replaceRows("file", rows).catch((e) => toast(t("store.fail", { e: e.message }), true)).then(renderSource);
}

async function handleFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    data.fileRecs = parseText(text, file.name.toLowerCase());
    parseFileRecs();
    toast(data.all.length ? t("toast.inside", { n: data.all.length }) : t("toast.readFail", { f: file.name }), !data.all.length);
  } catch (e) { setStatus(t("toast.readFailDetail", { f: file.name, e: e.message }), "err"); }
}

function readApiForm() {
  cfg.api = { ...cfg.api, url: $("api-url").value.trim(), interval: Math.max(1, Number($("api-interval").value) || 60), unit: UNIT_MS[$("api-unit").value] ? $("api-unit").value : "s", path: $("map-path").value.trim() };
  save();
  return cfg.api;
}

// An https page (e.g. the public demo) may not request an http sensor URL:
// browsers block it as mixed content before CORS is even checked.
const mixedContent = (url) => location.protocol === "https:" && /^http:/i.test(url);

async function apiOnce() {
  const api = readApiForm();
  if (!api.url) throw new Error(t("st.apiNoUrl"));
  if (mixedContent(api.url)) throw new Error(t("st.apiMixed"));
  const res = await fetch(api.url, { headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const recs = extractRecords(await res.json(), api.path);
  return { recs, rows: toSeries(recs, pressure(), readMap()) };
}

async function testApi() {
  try {
    const { recs, rows } = await apiOnce();
    showPreview(recs[0], rows);
    setStatus(t("st.apiTest", { n: recs.length, k: rows.length }), rows.length ? "ok" : "err");
  } catch (e) { setStatus(t("st.apiFail", { e: e.message }), "err"); }
}

// Every reading is drawn and saved as soon as it arrives. When the new rows
// all come after the last one, only they are evaluated (settings unchanged).
function startPolling() {
  const api = readApiForm();
  if (!api.url) { setStatus(t("st.apiNoUrl"), "err"); return; }
  if (mixedContent(api.url)) { setStatus(t("st.apiFail", { e: t("st.apiMixed") }), "err"); return; }
  stopPolling(true);
  let busy = false; // skip a tick while the previous request is still open
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      const { rows, fields } = await fetchSensor(api.url, pressure(), { path: api.path, map: readMap() });
      $("field-list").innerHTML = fields.map((f) => `<option value="${esc(f)}">`).join("");
      const seen = new Set(data.all.map((r) => r.time));
      const fresh = rows.filter((r) => !seen.has(r.time));
      const follow = data.index >= data.series.length - 1;
      const last = data.all.at(-1)?.time ?? "";
      data.all.push(...fresh);
      // "All data": series is the same array as all, so new rows can be evaluated
      // alone. "One day": the shown day may move, so recompute (one day is cheap).
      if (data.series === data.all && !data.busy && fresh.every((r) => r.time > last) && data.profile.length && data.results.length === data.series.length - fresh.length) {
        data.outside = outsideFromSeries(data.series);
        data.results.push(...evaluate(fresh, data.profile, data.outside, settings(), pressure()));
      } else {
        data.all.sort((a, b) => a.time.localeCompare(b.time));
        recompute();
      }
      if (follow) data.index = data.series.length - 1;
      data.live = true;
      if (fresh.length) await saveRows("api", fresh);
      setStatus(t("st.apiOk", { time: new Date().toLocaleTimeString(), n: fresh.length, total: data.all.length }), "ok");
      renderPage();
    } catch (err) { setStatus(t("st.apiFail", { e: err.message }), "err"); }
    busy = false;
  };
  poll();
  poller = setInterval(poll, api.interval * UNIT_MS[api.unit]);
  if (!cfg.api.running) { cfg.api.running = true; save(); }
  $("api-toggle").textContent = t("data.stop");
}
// quiet = stopped by switching source or restarting, not by the user.
function stopPolling(quiet = false) {
  if (poller) { clearInterval(poller); poller = null; }
  data.live = false;
  $("api-toggle").textContent = t("data.start");
  if (!quiet) { cfg.api.running = false; save(); setStatus(t("st.stopped")); }
}

function bindData() {
  document.addEventListener("click", (e) => { if (e.target.closest("[data-action='demo']")) { setSource("demo"); location.hash = "#chart"; } });
  document.querySelectorAll("[data-source]").forEach((b) => b.addEventListener("click", () => setSource(b.dataset.source)));
  document.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => setDemo(b.dataset.demo)));
  document.querySelectorAll("[data-span]").forEach((b) => b.addEventListener("click", () => {
    if (cfg.span === b.dataset.span) return;
    cfg.span = b.dataset.span; save();
    const time = data.series[data.index]?.time;
    recompute();
    // keep the same hour open when it is still shown
    const i = data.series.findIndex((r) => r.time === time);
    data.index = i >= 0 ? i : cfg.source === "demo" ? demoStart() : data.series.length - 1;
    renderSource();
  }));
  $("crop").addEventListener("change", async (e) => { cfg.crop = e.target.value; save(); await loadProfile(); refresh(); });
  $("file-input").addEventListener("change", (e) => handleFile(e.target.files[0]));
  const drop = $("drop-file");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handleFile(e.dataTransfer.files[0]); });
  $("api-test").addEventListener("click", testApi);
  $("api-toggle").addEventListener("click", () => (poller ? stopPolling() : startPolling()));
  for (const id of ["api-interval", "api-unit"]) $(id).addEventListener("change", () => { readApiForm(); if (poller) startPolling(); });
  $("clear-store").addEventListener("click", async () => {
    if (!confirm(t("store.confirm"))) return;
    if (cfg.source === "api") stopPolling();
    await clearRows(cfg.source);
    data.all = data.series = []; data.index = 0; data.fileRecs = null;
    refresh(); renderSource(); toast(t("store.cleared"));
  });
  for (const el of document.querySelectorAll("[data-map], #map-humtype, #map-path")) el.addEventListener("change", () => {
    document.querySelectorAll("[data-map]").forEach((i) => { cfg.map[i.dataset.map] = i.value.trim(); });
    cfg.map.humType = $("map-humtype").value;
    readApiForm();
    if (cfg.source === "file" && data.fileRecs) parseFileRecs();
    if (cfg.source === "api" && cfg.api.url) testApi();
  });
}

// ---------- decision texts (editable) ----------

const TEXT_GROUPS = [
  ...["heating", "fogging", "ventilation", "dehumidification"].map((a) => ({ title: `act.${a}`, keys: [[`act.${a}`, "texts.name"], [`actd.${a}`, "texts.advice"]], cls: `a-${a}${hatch(a)}` })),
  { title: "texts.messages", keys: [["dss.inZone", "texts.inZone"], ["dss.noAction", "texts.noAction"], ["dss.condRisk", "texts.condRisk"], ["dss.dryRisk", "texts.dryRisk"]] },
];

function renderTexts() {
  const mine = cfg.texts[cfg.lang] || {};
  $("texts-fields").innerHTML = TEXT_GROUPS.map((g) => `<fieldset><legend>${g.cls ? `<i class="key line ${g.cls}"></i>` : ""}${esc(t(g.title))}</legend>${
    g.keys.map(([k, label]) => `<label><span>${t(label)}</span>${k.startsWith("act.")
      ? `<input data-text="${k}" value="${esc(mine[k] || "")}" placeholder="${esc(tDefault(k))}">`
      : `<textarea data-text="${k}" rows="2" placeholder="${esc(tDefault(k))}">${esc(mine[k] || "")}</textarea>`}</label>`).join("")}</fieldset>`).join("");
}

function bindTexts() {
  $("texts-fields").addEventListener("input", (e) => {
    const k = e.target.dataset.text;
    if (!k || !EDITABLE.includes(k)) return;
    const mine = (cfg.texts[cfg.lang] ||= {});
    if (e.target.value.trim()) mine[k] = e.target.value; else delete mine[k];
    setCustom(cfg.texts); save();
    applyStatic(document.querySelector("main")); // legends use the action names
  });
  $("texts-reset").addEventListener("click", () => { cfg.texts[cfg.lang] = {}; setCustom(cfg.texts); save(); applyLang(); renderTexts(); toast(t("toast.textsReset")); });
}

// ---------- settings ----------

const FIELDS = [
  ["gh-l", () => cfg.greenhouse.l, (v) => (cfg.greenhouse.l = v)],
  ["gh-w", () => cfg.greenhouse.w, (v) => (cfg.greenhouse.w = v)],
  ["gh-h", () => cfg.greenhouse.h, (v) => (cfg.greenhouse.h = v)],
  ["altitude", () => cfg.altitude, (v) => (cfg.altitude = v)],
  ["tref", () => cfg.tRef, (v) => (cfg.tRef = v)],
  ["wref", () => cfg.wRef, (v) => (cfg.wRef = v)],
  ["cosmin", () => cfg.cosMin, (v) => (cfg.cosMin = v)],
  ["ttol", () => cfg.zone.tTol, (v) => (cfg.zone.tTol = v)],
  ["vtol", () => cfg.zone.vpdTol, (v) => (cfg.zone.vpdTol = v)],
  ["vmin", () => cfg.zone.vpdMin, (v) => (cfg.zone.vpdMin = v)],
  ["cm", () => cfg.zone.condMargin, (v) => (cfg.zone.condMargin = v)],
  ["rh-hi", () => cfg.baseline.rhHigh, (v) => (cfg.baseline.rhHigh = v)],
  ["rh-lo", () => cfg.baseline.rhLow, (v) => (cfg.baseline.rhLow = v)],
  ["r-tmin", () => cfg.range.tMin, (v) => (cfg.range.tMin = v)],
  ["r-tmax", () => cfg.range.tMax, (v) => (cfg.range.tMax = v)],
  ["r-wmax", () => cfg.range.wMax, (v) => { cfg.range.wMax = v; cfg.range.wMin = 0; }],
];

function syncSettings() {
  for (const [id, get] of FIELDS) $(id).value = get();
  document.querySelectorAll("[data-act]").forEach((el) => (el.checked = !!cfg.actuators[el.dataset.act]));
  document.querySelectorAll("[data-map]").forEach((el) => (el.value = cfg.map[el.dataset.map] || ""));
  $("map-humtype").value = cfg.map.humType || "rh";
  $("map-path").value = cfg.api.path || "";
  $("use-zone-t").checked = cfg.baseline.useZoneT;
  $("api-url").value = cfg.api.url;
  $("api-interval").value = cfg.api.interval;
  $("api-unit").value = cfg.api.unit || "s";
  $("gh-vol").textContent = volume() > 0 ? t("set.vol", { v: fmt(volume(), 0) }) : t("set.noVol");
  $("pressure-note").textContent = t("set.p", { p: fmt(pressure() / 1000, 2) });
  $("lang").value = cfg.lang;
  renderTexts();
}

function bindSettings() {
  for (const [id, , set] of FIELDS) $(id).addEventListener("change", (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    set(v);
    if (cfg.range.tMax <= cfg.range.tMin + 2) cfg.range.tMax = cfg.range.tMin + 2;
    save(); syncSettings(); recompute();
  });
  document.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("change", () => { cfg.actuators[el.dataset.act] = el.checked; save(); recompute(); }));
  $("use-zone-t").addEventListener("change", (e) => { cfg.baseline.useZoneT = e.target.checked; save(); recompute(); });
  $("reset").addEventListener("click", () => {
    const keep = { source: cfg.source, api: cfg.api, map: cfg.map, lang: cfg.lang };
    cfg = { ...structuredClone(DEFAULTS), ...keep }; setCustom(cfg.texts); applyLang(); save(); syncSettings(); refresh(); toast(t("toast.reset"));
  });
  $("lang").addEventListener("change", (e) => { cfg.lang = e.target.value; save(); applyLang(); syncSettings(); renderPage(); });
}

// Static text comes from data-i18n attributes; dynamic text is re-rendered.
function applyLang() {
  setLang(cfg.lang);
  setCustom(cfg.texts);
  applyStatic();
  relabelTools();
  $("api-toggle").textContent = t(poller ? "data.stop" : "data.start");
  $("play").setAttribute("aria-label", t(player ? "tl.pause" : "tl.play"));
}

// ---------- chart controls ----------

function fitRange() {
  if (!data.series.length) return;
  const ts = data.series.map((r) => r.t), ws = data.series.map((r) => r.w * 1000);
  cfg.range = { tMin: Math.floor(Math.min(...ts) - 3), tMax: Math.ceil(Math.max(...ts) + 3), wMax: Math.ceil(Math.max(...ws) + 3) };
  save(); syncSettings(); renderChartPage();
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// PNG at 3× resolution (paper figures).
function png(svgEl, name) {
  const { text, w, h } = exportSVG(svgEl);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = w * 3; c.height = h * 3;
    const g = c.getContext("2d"); g.scale(3, 3); g.drawImage(img, 0, 0);
    c.toBlob((b) => download(name, b), "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
}
const fileStem = () => `psychromol-${cfg.view === "mollier" ? "mollier" : "psychrometric"}-${(data.series[data.index]?.time || "chart").replace(/[:T]/g, "")}`;

function bindChart() {
  $("view-psy").addEventListener("click", () => { cfg.view = "psy"; save(); renderChartPage(); });
  $("view-mollier").addEventListener("click", () => { cfg.view = "mollier"; save(); renderChartPage(); });
  $("fit").addEventListener("click", fitRange);
  $("reset-range").addEventListener("click", () => { cfg.range = { ...FULL_RANGE }; save(); syncSettings(); renderChartPage(); });
  $("dl-svg").addEventListener("click", () => download(`${fileStem()}.svg`, new Blob([exportSVG($("chart")).text], { type: "image/svg+xml" })));
  $("dl-png").addEventListener("click", () => png($("chart"), `${fileStem()}.png`));

  const step = (k) => { if (!data.series.length) return; data.index = Math.min(Math.max(data.index + k, 0), data.series.length - 1); renderChartPage(); };
  $("slider").addEventListener("input", (e) => { data.index = Number(e.target.value); renderChartPage(); });
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  $("strip").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) openHour(Number(b.dataset.i)); });
  $("play").addEventListener("click", togglePlay);
  document.addEventListener("keydown", (e) => {
    if (currentPage() !== "chart" || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) && e.target.type !== "range") return;
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
  });

  $("raw-table").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) openHour(Number(tr.dataset.i)); });
  $("raw-more").addEventListener("click", () => { tableRows += TABLE_STEP; renderTable(); });
  $("export").addEventListener("click", () => {
    if (!data.results.some((r) => r.rec)) return toast(t("res.nothing"), true);
    download("psychromol-dss.csv", new Blob([toCSV(data.results)], { type: "text/csv" }));
  });
}

function togglePlay() {
  if (player) { clearInterval(player); player = null; $("play").innerHTML = icon("play"); $("play").setAttribute("aria-label", t("tl.play")); return; }
  if (!data.series.length) return;
  if (data.index >= data.series.length - 1) data.index = 0;
  player = setInterval(() => {
    if (data.index >= data.series.length - 1) return togglePlay();
    data.index++; renderChartPage();
  }, 400);
  $("play").innerHTML = icon("pause"); $("play").setAttribute("aria-label", t("tl.pause"));
}

// ---------- start ----------

applyLang();
initTools({
  cfg: () => cfg, save, pressure, tooltip, toast, download, png, volume,
  active: () => currentPage() === "tools",
  gh: () => ({ results: data.results, series: data.series, index: data.index }),
  setIndex: (i) => { data.index = i; },
});
$("to-tools").addEventListener("click", () => addHour(data.index));
bindSettings();
bindData();
bindTexts();
bindChart();
syncSettings();
window.addEventListener("hashchange", route);
let resizeT;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => renderPage(), 120); });
await loadProfile();
if (cfg.source === "demo") await loadDemo();
else await loadStored(cfg.source);
if (cfg.source === "api" && cfg.api.url && cfg.api.running) startPolling();
recompute();
route();
