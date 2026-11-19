// chart.js — psychrometric chart (primary) and Mollier h–x diagram (switch),
// both drawn from the same engine through one projection per view. Drawing
// only: no DSS logic here, so nothing depends on zoom or screen size.

import { satVapPres, humRatioFromVapPres, humRatioFromWetBulb, wetBulb, enthalpy, state } from "./psychro.js";
import { t as tr } from "./i18n.js";

const d3 = window.d3;

// (t °C, w kg/kg) → data coordinates of the active view.
// Mollier: x = W (g/kg), y = h − 2.501·W[g/kg] (oblique h–x convention, so
// isotherms are almost horizontal and isenthalps slope down).
export function project(view, t, w) {
  const wg = w * 1000;
  return view === "mollier" ? [wg, enthalpy(t, w) - 2.501 * wg] : [t, wg];
}

// Action names in the active language (ACTION_LABEL.heating, etc.).
export const ACTION_LABEL = new Proxy({}, { get: (_, k) => tr(`act.${String(k)}`) });

// Background lines the user can customise (Tools → Lines). Empty color or
// width = the stylesheet default (class c-rh, c-wb, c-h, c-v, c-grid).
export const DEFAULT_LINES = {
  rh: { show: true, step: 10, color: "", width: 0 },
  wb: { show: true, color: "", width: 0 },
  h: { show: false, step: 10, color: "", width: 0 },
  v: { show: false, color: "", width: 0 },
  grid: { show: true, color: "", width: 0 },
};

// opts: { view, range: {tMin, tMax, wMax}, p, series, current, zone, rec, outside,
//         lines, marks: { points: [{t, w, label}], procs: [{a, b}] },
//         onPick(i), onAdd(t, w), tooltip(html|null, event) }
export function drawChart(svgEl, opts) {
  const { view, range, p, series = [], current, zone, rec, outside, marks } = opts;
  const L = { ...DEFAULT_LINES, ...(opts.lines || {}) };
  const styled = (sel, k) => { if (L[k].color) sel.style("stroke", L[k].color); if (L[k].width > 0) sel.style("stroke-width", L[k].width); return sel; };
  const svg = d3.select(svgEl);
  const W = svgEl.clientWidth || 800, H = svgEl.clientHeight || 520;
  const m = { top: 14, right: view === "mollier" ? 16 : 54, bottom: 44, left: view === "mollier" ? 52 : 16 };
  svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();

  const { tMin, tMax } = range;
  const wMin = (range.wMin || 0) / 1000, wMax = range.wMax / 1000;
  const wSat = (t) => humRatioFromVapPres(satVapPres(t), p);
  let x, y;
  if (view === "mollier") {
    const ys = [[tMin, wMin], [tMax, wMin], [tMin, Math.min(wSat(tMin), wMax)], [tMax, wMax]].map(([t, w]) => project(view, t, w)[1]);
    x = d3.scaleLinear().domain([wMin * 1000, range.wMax]).range([m.left, W - m.right]);
    y = d3.scaleLinear().domain([Math.min(...ys), Math.max(...ys)]).range([H - m.bottom, m.top]);
  } else {
    x = d3.scaleLinear().domain([tMin, tMax]).range([m.left, W - m.right]);
    y = d3.scaleLinear().domain([wMin * 1000, range.wMax]).range([H - m.bottom, m.top]);
  }
  const P = (t, w) => { const [a, b] = project(view, t, w); return [x(a), y(b)]; };
  const line = d3.line();
  const inside = ([px, py]) => px >= m.left && px <= W - m.right && py >= m.top && py <= H - m.bottom;

  svg.append("defs").html(`
    <clipPath id="plot"><rect x="${m.left}" y="${m.top}" width="${Math.max(W - m.left - m.right, 0)}" height="${Math.max(H - m.top - m.bottom, 0)}"/></clipPath>
    <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="6" fill="var(--a-dehumidification)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.6)" stroke-width="2"/></pattern>`);
  const g = svg.append("g").attr("clip-path", "url(#plot)");
  const labels = svg.append("g");
  // Direct labels (actions, outside air, Tools points) never sit on top of each
  // other: a label that overlaps one already placed moves down a line.
  const placed = [];
  const albl = (px, py, text) => {
    const el = labels.append("text").attr("x", px).attr("y", py).attr("class", "c-albl").text(text);
    const node = el.node();
    if (!node.getBBox) return el;
    // Keep the label inside the chart when a zoom pushes its point to an edge.
    const b0 = node.getBBox();
    if (b0.x < 2) el.attr("x", px + 2 - b0.x); else if (b0.x + b0.width > W - 2) el.attr("x", px - (b0.x + b0.width - W + 2));
    for (let k = 0; k < 6; k++) {
      const b = node.getBBox();
      const hit = placed.some((o) => b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height);
      if (!hit) break;
      el.attr("y", Number(el.attr("y")) + b.height + 1);
    }
    placed.push(node.getBBox());
    return el;
  };

  const sample = (fn, t0, t1, n = 80) => d3.range(n + 1).map((i) => t0 + ((t1 - t0) * i) / n).map((t) => [t, fn(t)]).filter(([, w]) => w >= 0 && w <= wMax * 1.3);

  // Isotherms (vertical in the psychrometric chart, almost horizontal in Mollier).
  const step = tMax - tMin > 30 ? 5 : tMax - tMin > 12 ? 2 : 1;
  for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) {
    if (L.grid.show) styled(g.append("path").attr("d", line([P(t, 0), P(t, Math.min(wSat(t), wMax))])).attr("class", "c-grid"), "grid");
    if (view === "mollier") labels.append("text").attr("x", m.left - 6).attr("y", P(t, 0)[1] + 4).attr("class", "c-lbl").attr("text-anchor", "end").text(`${t}°C`);
  }
  // Isenthalps: always in Mollier (its grid), optional in the psychrometric chart.
  const hStep = Math.max(1, L.h.step || 10);
  if (view === "mollier") for (let h = -20; h <= 160; h += 10) {
    g.append("path").attr("d", line(d3.range(0, range.wMax + 0.01, 0.5).map((wg) => [x(wg), y(h - 2.501 * wg)]))).attr("class", "c-h");
  } else if (L.h.show) for (let h = Math.ceil(enthalpy(tMin, 0) / hStep) * hStep; h <= enthalpy(tMax, wMax); h += hStep) {
    const pts = sample((t) => (h - 1.006 * t) / (2501 + 1.86 * t), tMin, tMax).filter(([t, w]) => w <= wSat(t) * 1.0001).map(([t, w]) => P(t, w));
    if (pts.length < 2) continue;
    styled(g.append("path").attr("d", line(pts)).attr("class", "c-hl"), "h");
    const top = pts.filter(inside)[0];
    if (top) labels.append("text").attr("x", top[0] - 4).attr("y", top[1] - 3).attr("class", "c-lbl c-lbl-h").attr("text-anchor", "end").text(`${h}`);
  }
  // Specific volume lines (m³/kg), every 0.01 m³/kg.
  if (L.v.show) for (let v = 0.75; v <= 1.0; v += 0.01) {
    const pts = sample((t) => ((v * p) / (287.042 * (t + 273.15)) - 1) / 1.607858, tMin, tMax).filter(([t, w]) => w <= wSat(t) * 1.0001).map(([t, w]) => P(t, w));
    if (pts.length < 2) continue;
    styled(g.append("path").attr("d", line(pts)).attr("class", "c-v"), "v");
    const bottom = pts.filter(inside)[0];
    if (bottom && Math.round(v * 100) % 2 === 0) labels.append("text").attr("x", bottom[0] + 3).attr("y", bottom[1] - 3).attr("class", "c-lbl").text(v.toFixed(2));
  }
  // Wet-bulb lines.
  if (L.wb.show) for (let twb = Math.ceil((tMin - 5) / step) * step; twb <= tMax; twb += step) {
    styled(g.append("path").attr("d", line(sample((t) => humRatioFromWetBulb(t, twb, p), twb, tMax).map(([t, w]) => P(t, w)))).attr("class", "c-wb"), "wb");
  }
  // Relative humidity lines (saturation is always drawn).
  const rhStep = Math.min(50, Math.max(5, L.rh.step || 10));
  const rhPlaced = [];
  for (let rh = L.rh.show ? rhStep : 100; rh <= 100; rh += rhStep) {
    const pts = sample((t) => humRatioFromVapPres((rh / 100) * satVapPres(t), p), tMin, tMax).map(([t, w]) => P(t, w));
    const path = g.append("path").attr("d", line(pts)).attr("class", rh === 100 ? "c-sat" : "c-rh");
    if (rh < 100) styled(path, "rh");
    const last = pts.filter(inside).pop();
    // skip a label that would collide with one already placed (narrow screens)
    const free = last && rh < 100 && !rhPlaced.some(([a, b]) => Math.abs(a - last[0]) < 30 && Math.abs(b - last[1]) < 13);
    if (free) rhPlaced.push(last);
    if (free) labels.append("text").attr("x", last[0] - 3).attr("y", last[1] - 4).attr("class", "c-lbl").attr("text-anchor", "end").text(`${rh}%`);
    if (rh + rhStep > 100 && rh < 100) rh = 100 - rhStep; // always end with saturation
  }

  // Axes.
  const ax = svg.append("g").attr("class", "c-axis");
  ax.append("g").attr("transform", `translate(0,${H - m.bottom})`).call(d3.axisBottom(x).ticks(Math.max(4, Math.floor(W / 90))).tickSizeOuter(0));
  if (view === "mollier") {
    ax.append("text").attr("class", "c-title").attr("x", (m.left + W - m.right) / 2).attr("y", H - 8).attr("text-anchor", "middle").text(tr("chart.yW"));
  } else {
    ax.append("g").attr("transform", `translate(${W - m.right},0)`).call(d3.axisRight(y).ticks(6).tickSizeOuter(0));
    ax.append("text").attr("class", "c-title").attr("x", (m.left + W - m.right) / 2).attr("y", H - 8).attr("text-anchor", "middle").text(tr("chart.xT"));
    ax.append("text").attr("class", "c-title").attr("transform", `translate(${W - 10},${(m.top + H - m.bottom) / 2}) rotate(90)`).attr("text-anchor", "middle").text(tr("chart.yW"));
  }

  // Crop target zone.
  if (zone) g.append("path").attr("d", line(zone.points.map((q) => P(q.t, q.w))) + "Z").attr("class", "c-zone");

  // Other hours (clickable).
  g.append("g").selectAll("circle").data(series).join("circle")
    .attr("cx", (d) => P(d.t, d.w)[0]).attr("cy", (d) => P(d.t, d.w)[1]).attr("r", 2.5).attr("class", "c-pt");

  // Outside air and mixing line.
  if (current && outside) {
    g.append("path").attr("d", line([P(current.t, current.w), P(outside.t, outside.w)])).attr("class", "c-mix");
    g.append("circle").attr("cx", P(outside.t, outside.w)[0]).attr("cy", P(outside.t, outside.w)[1]).attr("r", 5).attr("class", "c-out");
    albl(P(outside.t, outside.w)[0] + 8, P(outside.t, outside.w)[1] + 4, tr("chart.outside"));
  }

  // Correction vector and the recommended action path, with a direct label.
  if (current && rec && !rec.inZone) {
    g.append("path").attr("d", line([P(current.t, current.w), P(rec.target.t, rec.target.w)])).attr("class", "c-corr");
    const act = rec.actions[0];
    if (act && rec.match !== "pair") {
      let pts;
      if (act === "fogging") {
        const twb = wetBulb(current.t, current.w, p);
        pts = d3.range(25).map((i) => current.t + ((rec.end.t - current.t) * i) / 24).map((t) => P(t, humRatioFromWetBulb(t, twb, p)));
      } else pts = [P(current.t, current.w), P(rec.end.t, rec.end.w)];
      g.append("path").attr("d", line(pts)).attr("class", "c-act").attr("stroke", `var(--a-${act})`)
        .attr("stroke-dasharray", act === "dehumidification" ? "8 3" : null).attr("marker-end", "url(#arrow)");
      const e = pts[pts.length - 1];
      albl(e[0] + 8, e[1] - 6, ACTION_LABEL[act]);
    } else if (rec.match === "pair") {
      const e = P(rec.target.t, rec.target.w);
      albl(e[0] + 8, e[1] - 6, rec.actions.map((a) => ACTION_LABEL[a]).join(" + "));
    }
  }
  if (current) {
    const [cx, cy] = P(current.t, current.w);
    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 7).attr("class", "c-cur");
  }

  // User points and processes (Tools page).
  if (marks) {
    for (const { a, b } of marks.procs || []) {
      g.append("path").attr("d", line([P(a.t, a.w), P(b.t, b.w)])).attr("class", "c-proc").attr("marker-end", "url(#arrow)");
    }
    for (const q of marks.points || []) {
      const [cx, cy] = P(q.t, q.w);
      g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 6).attr("class", "c-upt");
      albl(cx + 9, cy - 7, q.label);
    }
  }

  // Hover read-out of any point on the chart; click picks the nearest hour.
  const inv = (px, py) => {
    if (view === "mollier") { const wg = x.invert(px), w = wg / 1000; return { t: (y.invert(py) + 2.501 * wg - 2501 * w) / (1.006 + 1.86 * w), w }; }
    return { t: x.invert(px), w: y.invert(py) / 1000 };
  };
  const nearest = (px, py) => {
    let best = -1, bd = 24 * 24;
    series.forEach((d, i) => { const [a, b] = P(d.t, d.w); const dd = (a - px) ** 2 + (b - py) ** 2; if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  svg.on("pointermove", (e) => {
    const [px, py] = d3.pointer(e);
    if (!inside([px, py])) return opts.tooltip?.(null);
    const i = nearest(px, py);
    const q = i >= 0 ? series[i] : inv(px, py);
    if (q.w <= 0 || q.w > wSat(q.t) * 1.0001) return opts.tooltip?.(null);
    const addHint = i < 0 && opts.onAdd ? `<div class="t">${tr("tools.clickAdd")}</div>` : "";
    const s = state(q.t, q.w, p);
    const head = i >= 0 ? q.time.replace("T", " ") : tr("chart.cursor");
    opts.tooltip?.(`<div class="t">${head}</div>
      <div class="r"><b>${s.Tdb.toFixed(1)} °C</b> Tdb · <b>${s.RH.toFixed(0)}%</b> RH</div>
      <div class="r"><b>${(s.W * 1000).toFixed(2)}</b> g/kg W · <b>${(s.VPD / 1000).toFixed(2)}</b> kPa VPD</div>
      <div class="r"><b>${s.Tdp.toFixed(1)} °C</b> Tdp · <b>${s.h.toFixed(1)}</b> kJ/kg h</div>${i >= 0 ? `<div class="t">${tr("chart.clickHour")}</div>` : addHint}`, e);
  }).on("pointerleave", () => opts.tooltip?.(null))
    .on("click", (e) => {
      if (Date.now() - (pinches.get(svgEl)?.end || 0) < 500) return; // no tap right after a pinch
      const [px, py] = d3.pointer(e);
      const i = nearest(px, py);
      if (i >= 0) return opts.onPick?.(i);
      const q = inv(px, py);
      if (opts.onAdd && inside([px, py]) && q.w > 0 && q.w <= wSat(q.t) * 1.0001) opts.onAdd(q.t, q.w);
    });

  // Mouse wheel zooms around the cursor (smoothly, see zoomTo).
  svgEl.onwheel = opts.onZoom ? (e) => {
    e.preventDefault();
    const [px, py] = d3.pointer(e);
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    zoomTo(svgEl, inv(px, py), Math.exp(Math.max(-300, Math.min(300, dy)) * 0.0015), range, opts.onZoom);
  } : null;

  // Two-finger pinch zooms on touch screens. One finger still scrolls the page
  // (CSS touch-action: pan-y), so the browser never page-zooms over the chart.
  // The chart point under the fingers stays under them while they move.
  if (!opts.onZoom) { svgEl.ontouchstart = svgEl.ontouchmove = svgEl.ontouchend = svgEl.ontouchcancel = null; return; }
  const plot = { x0: m.left, x1: W - m.right, y0: H - m.bottom, y1: m.top };
  const two = (e) => {
    const [a, b] = [e.touches[0], e.touches[1]].map((t) => d3.pointer(t, svgEl));
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
  };
  svgEl.ontouchstart = (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const z = zooms.get(svgEl);
    if (z?.raf) { cancelAnimationFrame(z.raf); z.raf = 0; }
    const { mid, dist } = two(e);
    const prev = pinches.get(svgEl);
    pinches.set(svgEl, { ...prev, on: true, dist, at: inv(...mid), range: { tMin: range.tMin, tMax: range.tMax, wMin: range.wMin || 0, wMax: range.wMax }, plot, view, last: null });
    opts.tooltip?.(null);
  };
  svgEl.ontouchmove = (e) => {
    const s = pinches.get(svgEl);
    if (!s?.on || e.touches.length !== 2) return;
    e.preventDefault();
    const { mid, dist } = two(e);
    s.last = pinchRange(s, mid, s.dist / dist);
    opts.onZoom(s.last, false);
  };
  svgEl.ontouchend = svgEl.ontouchcancel = (e) => {
    const s = pinches.get(svgEl);
    if (!s?.on || e.touches.length >= 2) return;
    s.on = false; s.end = Date.now();
    if (s.last) opts.onZoom(s.last, true);
  };
}

// Range for a pinch: the start range scaled by f around the touched chart point,
// then shifted so that point sits under the fingers' current midpoint. In the
// Mollier view only W is a straight axis, so only W follows the fingers.
const pinches = new WeakMap();
function pinchRange(s, mid, f) {
  const R = s.range, at = s.at, wg = at.w * 1000, P = s.plot;
  const tSpan = Math.max(LIMIT.tSpan, Math.min((R.tMax - R.tMin) * f, LIMIT.tMax - LIMIT.tMin));
  const wSpan = Math.max(LIMIT.wSpan, Math.min((R.wMax - R.wMin) * f, LIMIT.wMax));
  let tMin, wMin;
  if (s.view === "mollier") {
    tMin = at.t - (at.t - R.tMin) * tSpan / (R.tMax - R.tMin);
    wMin = wg - (mid[0] - P.x0) / (P.x1 - P.x0) * wSpan;
  } else {
    tMin = at.t - (mid[0] - P.x0) / (P.x1 - P.x0) * tSpan;
    wMin = wg - (P.y0 - mid[1]) / (P.y0 - P.y1) * wSpan;
  }
  const [t0, t1] = clampSpan(tMin, tMin + tSpan, LIMIT.tMin, LIMIT.tMax, LIMIT.tSpan);
  const [w0, w1] = clampSpan(wMin, wMin + wSpan, 0, LIMIT.wMax, LIMIT.wSpan);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { tMin: r3(t0), tMax: r3(t1), wMin: r3(w0), wMax: r3(w1) };
}

// ---------- smooth zoom ----------
// Each wheel step scales the target range around the cursor point; the drawn
// range eases towards the target over a few animation frames.
const LIMIT = { tMin: -20, tMax: 60, tSpan: 3, wMax: 50, wSpan: 1 };
const zooms = new WeakMap();

function clampSpan(lo, hi, min, max, minSpan) {
  let span = Math.max(minSpan, Math.min(hi - lo, max - min));
  const mid = (lo + hi) / 2;
  lo = mid - span / 2; hi = mid + span / 2;
  if (lo < min) { hi += min - lo; lo = min; }
  if (hi > max) { lo -= hi - max; hi = max; }
  return [lo, hi];
}

function zoomTo(svgEl, at, f, range, onZoom) {
  let z = zooms.get(svgEl);
  const cur = { tMin: range.tMin, tMax: range.tMax, wMin: range.wMin || 0, wMax: range.wMax };
  if (!z) { z = { cur, target: { ...cur }, raf: 0 }; zooms.set(svgEl, z); }
  if (!z.raf) { z.cur = cur; z.target = { ...cur }; }
  const T = z.target, wg = at.w * 1000;
  const [tMin, tMax] = clampSpan(at.t + (T.tMin - at.t) * f, at.t + (T.tMax - at.t) * f, LIMIT.tMin, LIMIT.tMax, LIMIT.tSpan);
  const [wMin, wMax] = clampSpan(wg + (T.wMin - wg) * f, wg + (T.wMax - wg) * f, 0, LIMIT.wMax, LIMIT.wSpan);
  z.target = { tMin, tMax, wMin, wMax };
  if (z.raf) return;
  const step = () => {
    let done = true;
    for (const k of Object.keys(z.cur)) {
      const d = z.target[k] - z.cur[k];
      if (Math.abs(d) > 0.005) { z.cur[k] += d * 0.3; done = false; } else z.cur[k] = z.target[k];
    }
    const r = Object.fromEntries(Object.entries(z.cur).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    z.raf = done ? 0 : requestAnimationFrame(step);
    onZoom(r, done);
  };
  z.raf = requestAnimationFrame(step);
}

// Standalone SVG with computed styles inlined (for paper figures).
export function exportSVG(svgEl) {
  const clone = svgEl.cloneNode(true);
  const src = svgEl.querySelectorAll("*"), dst = clone.querySelectorAll("*");
  const props = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family", "paint-order", "stroke-linecap"];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute("style", props.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(";"));
  });
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff";
  const [, , w, h] = svgEl.getAttribute("viewBox").split(" ").map(Number);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", w); clone.setAttribute("height", h);
  clone.insertAdjacentHTML("afterbegin", `<rect width="100%" height="100%" fill="${bg}"/>`);
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}
