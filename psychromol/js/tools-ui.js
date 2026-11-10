// tools-ui.js — Tools page: points from any two properties (or a click on
// the chart), processes with airflow loads, mixing, projects saved in the
// browser or as JSON files, customisable chart lines and a printable report.
// Maths lives in tools.js; this file only wires the page.

import { state } from "./psychro.js";
import { INPUTS, solveState, mix, processCalc } from "./tools.js";
import { drawChart, exportSVG, DEFAULT_LINES, ACTION_LABEL } from "./chart.js";
import { t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const STORE = "psychromol-projects-v1";
const fmt = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(d));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ctx;     // { cfg, save, pressure, tooltip, toast, download, png, active, gh, setIndex, volume }
let book;    // { current, projects: { name: project } }
let proj;    // project: { name, points: [{id, label, t, w}], procs: [{id, a, b, flow}], view, range }

const blank = (name) => ({ name, points: [], procs: [], updated: new Date().toISOString() });

function loadBook() {
  try { book = JSON.parse(localStorage.getItem(STORE) || "null"); } catch { book = null; }
  if (!book?.projects || !Object.keys(book.projects).length) book = { current: t("tools.defaultName"), projects: {} };
  if (!book.projects[book.current]) book.projects[book.current] = blank(book.current);
  proj = book.projects[book.current];
}
function persist() {
  proj.updated = new Date().toISOString();
  book.projects[proj.name] = proj;
  book.current = proj.name;
  try { localStorage.setItem(STORE, JSON.stringify(book)); } catch { ctx.toast(t("tools.saveFail"), true); }
}

const nextLabel = () => {
  const used = new Set(proj.points.map((q) => q.label));
  for (let i = 0; ; i++) {
    const l = (i >= 26 ? String.fromCharCode(65 + Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
    if (!used.has(l)) return l;
  }
};
const uid = () => Math.random().toString(36).slice(2, 9);
const pointById = (id) => proj.points.find((q) => q.id === id);

function addPoint(tt, w, label) {
  proj.points.push({ id: uid(), label: label || nextLabel(), t: tt, w });
  persist(); render();
}

// ---------- greenhouse data → points ----------

function hourVerdict(r) {
  if (!r.rec) return "–";
  if (r.rec.inZone) return t("inZone");
  return r.rec.actions.map((k) => ACTION_LABEL[k]).join(" + ") || t("noFeasible");
}

// Adds hour i of the loaded data as points: inside air, the end point of the
// DSS action (with the process at one air change per hour) and outside air.
export function addHour(i) {
  const r = ctx?.gh().results[i];
  if (!r) return;
  const base = r.row.time.slice(5).replace("T", " ");
  const A = { id: uid(), label: base, t: r.row.t, w: r.row.w };
  const add = [A];
  const rec = r.rec;
  if (rec && !rec.inZone && rec.actions.length && rec.end) {
    const E = { id: uid(), label: `${base} (${rec.actions.map((k) => k[0].toUpperCase()).join("+")})`, t: rec.end.t, w: rec.end.w };
    add.push(E);
    proj.procs.push({ id: uid(), a: A.id, b: E.id, flow: Math.round(ctx.volume()) || 1000 });
  }
  if (r.outside) add.push({ id: uid(), label: `${base} ${t("tools.ghOut")}`, t: r.outside.t, w: r.outside.w });
  proj.points.push(...add);
  persist(); render();
  ctx.toast(t("tools.ghAdded", { n: add.length, time: r.row.time.replace("T", " ") }));
}

// ---------- render ----------

export function render() {
  if (!ctx || !ctx.active()) return;
  const p = ctx.pressure();
  const cfg = ctx.cfg();
  const procs = proj.procs.map((r) => ({ ...r, A: pointById(r.a), B: pointById(r.b) })).filter((r) => r.A && r.B);
  // Optional overlay of the loaded greenhouse data (same view as the Chart page).
  const gh = ctx.gh();
  const r = gh.results[gh.index];
  const overlay = cfg.toolsGh && r ? {
    series: gh.series, current: r.row, zone: r.zone, rec: r.rec, outside: r.outside,
    onPick: (i) => { ctx.setIndex(i); render(); },
  } : {};
  drawChart($("tchart"), {
    view: cfg.view, range: cfg.range, p, lines: cfg.lines, ...overlay,
    marks: { points: proj.points, procs: procs.map((r) => ({ a: r.A, b: r.B })) },
    onAdd: (tt, w) => addPoint(tt, w), tooltip: ctx.tooltip,
    onZoom: (range, done) => { cfg.range = range; render(); if (done) ctx.save(); },
  });
  $("gh-show").checked = !!cfg.toolsGh;
  $("gh-label").textContent = r ? `${r.row.time.replace("T", " ")} · ${hourVerdict(r)}` : t("tools.ghNone");
  for (const id of ["gh-prev", "gh-next", "gh-add"]) $(id).disabled = !r;
  $("tview-psy").setAttribute("aria-pressed", cfg.view === "psy");
  $("tview-mollier").setAttribute("aria-pressed", cfg.view === "mollier");

  // project controls
  $("proj-select").innerHTML = Object.keys(book.projects).sort().map((n) => `<option ${n === proj.name ? "selected" : ""}>${esc(n)}</option>`).join("");
  if (document.activeElement !== $("proj-name")) $("proj-name").value = proj.name;
  const opts = proj.points.map((q) => `<option value="${q.id}">${esc(q.label)}</option>`).join("");
  for (const id of ["proc-a", "proc-b", "mix-a", "mix-b"]) { const v = $(id).value; $(id).innerHTML = opts; if (pointById(v)) $(id).value = v; }
  if (proj.points.length > 1 && $("proc-a").value === $("proc-b").value) $("proc-b").selectedIndex = 1;
  if (proj.points.length > 1 && $("mix-a").value === $("mix-b").value) $("mix-b").selectedIndex = 1;

  // points table: every property of each state
  const ph = ["label", "tdb", "rh", "w", "twb", "tdp", "h", "v", "vpd", "ah"].map((k) => `<th>${t(`tools.th.${k}`)}</th>`).join("");
  $("points-table").innerHTML = `<thead><tr>${ph}<th></th></tr></thead><tbody>${proj.points.map((q) => {
    const s = state(q.t, q.w, p);
    return `<tr><td><input class="lbl-cell" data-label="${q.id}" value="${esc(q.label)}" aria-label="${esc(t("tools.label"))}"></td><td>${fmt(s.Tdb, 2)}</td><td>${fmt(s.RH, 1)}</td><td>${fmt(s.W * 1000, 2)}</td><td>${fmt(s.Twb, 2)}</td><td>${fmt(s.Tdp, 2)}</td><td>${fmt(s.h, 2)}</td><td>${fmt(s.v, 4)}</td><td>${fmt(s.VPD / 1000, 3)}</td><td>${fmt(s.AH, 2)}</td>
      <td class="no-print"><button class="icon-x" data-del-point="${q.id}" aria-label="${esc(t("tools.delete"))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></td></tr>`;
  }).join("") || `<tr><td colspan="11" class="muted">${t("tools.noPoints")}</td></tr>`}</tbody>`;

  // processes table: changes and loads
  const rh = ["proc", "kind", "flow", "dt", "dw", "dh", "m", "qs", "ql", "qt", "water", "shr"].map((k) => `<th>${t(`tools.th.${k}`)}</th>`).join("");
  $("procs-table").innerHTML = `<thead><tr>${rh}<th></th></tr></thead><tbody>${procs.map((r) => {
    const c = processCalc(r.A, r.B, r.flow, p);
    return `<tr><td>${esc(r.A.label)} → ${esc(r.B.label)}</td><td>${t(`tools.kind.${c.kind}`)}</td>
      <td><input class="num-cell" type="number" min="0" step="any" data-flow="${r.id}" value="${r.flow}" aria-label="${esc(t("tools.flow"))}"></td>
      <td>${fmt(c.dt, 2)}</td><td>${fmt(c.dw, 2)}</td><td>${fmt(c.dh, 2)}</td><td>${fmt(c.massFlow, 3)}</td>
      <td>${fmt(c.sensible, 2)}</td><td>${fmt(c.latent, 2)}</td><td>${fmt(c.total, 2)}</td><td>${fmt(c.water, 2)}</td><td>${fmt(c.shr, 2)}</td>
      <td class="no-print"><button class="icon-x" data-del-proc="${r.id}" aria-label="${esc(t("tools.delete"))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></td></tr>`;
  }).join("") || `<tr><td colspan="13" class="muted">${t("tools.noProcs")}</td></tr>`}</tbody>`;

  // report header (shown only when printing)
  $("report-title").textContent = proj.name;
  $("report-meta").textContent = t("tools.reportMeta", { date: new Date().toLocaleString(), p: fmt(p / 1000, 2), alt: cfg.altitude || 0 });
  renderLines();
}

// ---------- lines ----------

const LINE_KEYS = ["rh", "wb", "h", "v", "grid"];
function renderLines() {
  const L = ctx.cfg().lines;
  if ($("lines-fields").dataset.ready) {
    for (const k of LINE_KEYS) {
      const el = (f) => $("lines-fields").querySelector(`[data-line="${k}"][data-f="${f}"]`);
      el("show").checked = L[k].show;
      el("color").value = L[k].color || "#9a9a94";
      el("width").value = L[k].width || "";
      if (el("step")) el("step").value = L[k].step;
    }
    return;
  }
  $("lines-fields").dataset.ready = "1";
  $("lines-fields").innerHTML = LINE_KEYS.map((k) => `
    <fieldset><legend><label class="inline"><input type="checkbox" data-line="${k}" data-f="show"> ${t(`tools.line.${k}`)}</label></legend>
      <label><span>${t("tools.color")}</span><input type="color" data-line="${k}" data-f="color"></label>
      <label><span>${t("tools.width")}</span><input type="number" min="0" max="6" step="0.5" data-line="${k}" data-f="width" placeholder="auto"></label>
      ${k === "rh" || k === "h" ? `<label><span>${t(`tools.step.${k}`)}</span><input type="number" min="${k === "rh" ? 5 : 1}" max="50" step="1" data-line="${k}" data-f="step"></label>` : ""}
    </fieldset>`).join("");
  renderLines();
}

// ---------- events ----------

function bind() {
  const keys = Object.keys(INPUTS);
  const opt = (sel) => keys.map((k) => `<option value="${k}" ${k === sel ? "selected" : ""}>${t(`tools.in.${k}`)} (${INPUTS[k]})</option>`).join("");
  $("find-k1").innerHTML = opt("tdb"); $("find-k2").innerHTML = opt("rh");

  $("find-add").addEventListener("click", () => {
    const r = solveState([$("find-k1").value, parseFloat($("find-v1").value)], [$("find-k2").value, parseFloat($("find-v2").value)], ctx.pressure());
    const st = $("find-status");
    if (r.error) { st.textContent = t(r.error); st.className = "status err"; return; }
    st.textContent = t("tools.found", { t: fmt(r.t, 2), w: fmt(r.w * 1000, 2) }); st.className = "status ok";
    addPoint(r.t, r.w, $("find-label").value.trim());
    $("find-label").value = "";
  });

  $("proc-add").addEventListener("click", () => {
    const a = $("proc-a").value, b = $("proc-b").value;
    if (!a || !b || a === b) return ctx.toast(t("tools.needTwo"), true);
    proj.procs.push({ id: uid(), a, b, flow: Math.max(0, parseFloat($("proc-flow").value) || 0) });
    persist(); render();
  });
  $("mix-add").addEventListener("click", () => {
    const A = pointById($("mix-a").value), B = pointById($("mix-b").value);
    if (!A || !B || A === B) return ctx.toast(t("tools.needTwo"), true);
    const qa = parseFloat($("mix-qa").value) || 0, qb = parseFloat($("mix-qb").value) || 0;
    const M = mix(A, B, qa, qb, ctx.pressure());
    if (!M) return ctx.toast(t("tools.needFlow"), true);
    const label = nextLabel();
    addPoint(M.t, M.w, label);
    const id = proj.points.at(-1).id;
    proj.procs.push({ id: uid(), a: A.id, b: id, flow: qa }, { id: uid(), a: B.id, b: id, flow: qb });
    persist(); render();
  });

  // table edits
  $("lines-fields").addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.line || el.type === "checkbox") return;
    const L = ctx.cfg().lines, k = el.dataset.line, f = el.dataset.f;
    const v = f === "color" ? el.value : parseFloat(el.value);
    if (f !== "color" && !(v >= (f === "step" ? (k === "rh" ? 5 : 1) : 0))) return;
    L[k] = { ...L[k], [f]: v };
    ctx.save(); render();
  });
  document.getElementById("page-tools").addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.label) { const q = pointById(el.dataset.label); if (q) { q.label = el.value.trim() || q.label; persist(); render(); } }
    if (el.dataset.flow) { const r = proj.procs.find((x) => x.id === el.dataset.flow); if (r) { r.flow = Math.max(0, parseFloat(el.value) || 0); persist(); render(); } }
    if (el.dataset.line) {
      const L = ctx.cfg().lines, k = el.dataset.line, f = el.dataset.f;
      L[k] = { ...L[k], [f]: f === "show" ? el.checked : f === "color" ? el.value : Math.max(0, parseFloat(el.value) || 0) };
      ctx.save(); render();
    }
  });
  document.getElementById("page-tools").addEventListener("click", (e) => {
    const dp = e.target.dataset?.delPoint, dr = e.target.dataset?.delProc;
    if (dp) { proj.points = proj.points.filter((q) => q.id !== dp); proj.procs = proj.procs.filter((r) => r.a !== dp && r.b !== dp); persist(); render(); }
    if (dr) { proj.procs = proj.procs.filter((r) => r.id !== dr); persist(); render(); }
  });
  $("lines-reset").addEventListener("click", () => { ctx.cfg().lines = structuredClone(DEFAULT_LINES); ctx.save(); render(); });

  // projects
  $("proj-select").addEventListener("change", (e) => { proj = book.projects[e.target.value]; book.current = proj.name; persist(); render(); });
  $("proj-new").addEventListener("click", () => {
    let n = 1; while (book.projects[`${t("tools.defaultName")} ${n}`]) n++;
    proj = blank(`${t("tools.defaultName")} ${n}`); persist(); render();
  });
  $("proj-del").addEventListener("click", () => {
    if (!confirm(t("tools.confirmDel", { n: proj.name }))) return;
    delete book.projects[proj.name];
    const rest = Object.keys(book.projects);
    proj = rest.length ? book.projects[rest[0]] : blank(t("tools.defaultName"));
    persist(); render();
  });
  $("proj-name").addEventListener("change", (e) => {
    const n = e.target.value.trim();
    if (!n || n === proj.name) return;
    if (book.projects[n]) { ctx.toast(t("tools.nameTaken"), true); e.target.value = proj.name; return; }
    delete book.projects[proj.name]; proj.name = n; persist(); render();
  });
  $("proj-export").addEventListener("click", () => {
    const file = { app: "PsychroMol", type: "project", version: 1, pressure: ctx.pressure(), ...proj };
    ctx.download(`${proj.name.replace(/[^\w.-]+/g, "_")}.psychromol.json`, new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  });
  $("proj-import").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j.points)) throw new Error("points");
      let name = String(j.name || f.name.replace(/\..*$/, "")), n = 2;
      while (book.projects[name]) name = `${j.name} (${n++})`;
      proj = { name, points: j.points.filter((q) => Number.isFinite(q.t) && Number.isFinite(q.w)).map((q) => ({ id: String(q.id || uid()), label: String(q.label || "?"), t: q.t, w: q.w })), procs: (j.procs || []).map((r) => ({ id: String(r.id || uid()), a: String(r.a), b: String(r.b), flow: Number(r.flow) || 0 })) };
      persist(); render(); ctx.toast(t("tools.imported", { n: name }));
    } catch { ctx.toast(t("tools.importFail", { f: f.name }), true); }
  });
  $("proj-pdf").addEventListener("click", () => { document.body.classList.add("printing-tools"); window.print(); });
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-tools"));

  // greenhouse data
  $("gh-show").addEventListener("change", (e) => { ctx.cfg().toolsGh = e.target.checked; ctx.save(); render(); });
  const stepHour = (k) => { const g = ctx.gh(); if (!g.results.length) return; ctx.setIndex(Math.min(Math.max(g.index + k, 0), g.results.length - 1)); render(); };
  $("gh-prev").addEventListener("click", () => stepHour(-1));
  $("gh-next").addEventListener("click", () => stepHour(1));
  $("gh-add").addEventListener("click", () => addHour(ctx.gh().index));

  // side tabs: calculator | chart lines (next to the chart, so edits show at once)
  document.querySelectorAll("[data-ttab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-ttab]").forEach((x) => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll("[data-tpane]").forEach((x) => { x.hidden = x.dataset.tpane !== b.dataset.ttab; });
  }));

  // chart toolbar
  const cfg = () => ctx.cfg();
  $("tview-psy").addEventListener("click", () => { cfg().view = "psy"; ctx.save(); render(); });
  $("tview-mollier").addEventListener("click", () => { cfg().view = "mollier"; ctx.save(); render(); });
  $("treset-range").addEventListener("click", () => { cfg().range = { tMin: 0, tMax: 45, wMin: 0, wMax: 30 }; ctx.save(); render(); });
  $("tfit").addEventListener("click", () => {
    if (!proj.points.length) return;
    const ts = proj.points.map((q) => q.t), ws = proj.points.map((q) => q.w * 1000);
    cfg().range = { tMin: Math.floor(Math.min(...ts) - 5), tMax: Math.ceil(Math.max(...ts) + 5), wMax: Math.ceil(Math.max(...ws) + 4) };
    ctx.save(); render();
  });
  $("tdl-svg").addEventListener("click", () => ctx.download(`${proj.name}.svg`, new Blob([exportSVG($("tchart")).text], { type: "image/svg+xml" })));
  $("tdl-png").addEventListener("click", () => ctx.png($("tchart"), `${proj.name}.png`));
}

// Re-labels the input selects after a language change.
export function relabel() {
  if (!ctx) return;
  for (const id of ["find-k1", "find-k2"]) for (const o of $(id).options) o.textContent = `${t(`tools.in.${o.value}`)} (${INPUTS[o.value]})`;
  delete $("lines-fields").dataset.ready;
}

export function initTools(c) {
  ctx = c;
  loadBook();
  bind();
}
