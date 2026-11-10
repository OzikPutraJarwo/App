// series.js — time series of the evaluated hours: Tdb, VPD and condensation
// margin against the hourly target, plus a strip of the recommended action.
// Small multiples share one time axis (never two y-scales on one chart).

import { RISK } from "./dss.js";
import { ACTION_LABEL } from "./chart.js";
import { t, getLang } from "./i18n.js";

const d3 = window.d3;

export function drawSeries(el, results, { onPick, tooltip }) {
  el.innerHTML = "";
  const rows = results.filter((r) => r.rec);
  if (!rows.length) { el.innerHTML = `<p class="muted">${t("series.none")}</p>`; return; }
  const times = new Map(rows.map((r) => [r, new Date(r.row.time.length === 16 ? r.row.time + ":00" : r.row.time)]));
  const tx = (r) => times.get(r);
  const W = el.clientWidth || 900;
  const m = { left: 48, right: 16 };
  const x = d3.scaleTime().domain(d3.extent(rows, tx)).range([m.left, W - m.right]);
  const step = rows.length > 1 ? (x.range()[1] - x.range()[0]) / (rows.length - 1) : 10;

  const panels = [
    { title: t("series.tdb"), v: (r) => r.rec.state.Tdb, lo: (r) => r.zone.tLo, hi: (r) => r.zone.tHi, unit: "°C", d: 1 },
    { title: t("series.vpd"), v: (r) => r.rec.state.VPD / 1000, lo: (r) => r.zone.vpdLo, hi: (r) => r.zone.vpdHi, thr: RISK.vpdHigh, thrLabel: t("series.dryThr", { v: RISK.vpdHigh }), unit: "kPa", d: 2 },
    { title: t("series.cm"), v: (r) => r.rec.state.condMargin, thr: RISK.condMargin, thrLabel: t("series.cmThr", { v: RISK.condMargin }), unit: "°C", d: 1 },
  ];

  const loc = getLang() === "ko" ? "ko-KR" : "en-GB";
  const dayFmt = (d) => (d.getHours() ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString(loc, { month: "short", day: "numeric" }));
  const hairs = [];
  for (const pnl of panels) {
    const H = 150, top = 10, bottom = 22;
    const vals = rows.flatMap((r) => [pnl.v(r), pnl.lo?.(r), pnl.hi?.(r), pnl.thr].filter(Number.isFinite));
    const y = d3.scaleLinear().domain(d3.extent(vals)).nice().range([H - bottom, top]);
    const wrap = d3.select(el).append("div").attr("class", "series-panel");
    wrap.append("div").attr("class", "series-title").text(pnl.title);
    const svg = wrap.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
    svg.append("g").attr("class", "c-axis").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.left - m.right)))
      .call((g) => g.selectAll(".tick line").attr("class", "c-grid")).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "c-axis").attr("transform", `translate(0,${H - bottom})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 120))).tickFormat(dayFmt).tickSizeOuter(0));
    if (pnl.lo) svg.append("path").attr("class", "c-band").attr("d", d3.area().x((r) => x(tx(r))).y0((r) => y(pnl.lo(r))).y1((r) => y(pnl.hi(r))).curve(d3.curveStepAfter)(rows));
    if (Number.isFinite(pnl.thr)) {
      svg.append("line").attr("class", "c-thr").attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(pnl.thr)).attr("y2", y(pnl.thr));
      svg.append("text").attr("class", "c-thr-lbl").attr("x", W - m.right - 4).attr("y", y(pnl.thr) - 4).attr("text-anchor", "end").text(pnl.thrLabel);
    }
    svg.append("path").attr("class", "c-line").attr("d", d3.line().x((r) => x(tx(r))).y((r) => y(pnl.v(r)))(rows));
    hairs.push({ svg, y, H, bottom, top, pnl });
  }

  // Action strip: one cell per hour, colour + letter (secondary encoding).
  const SH = 30;
  const wrap = d3.select(el).append("div").attr("class", "series-panel");
  wrap.append("div").attr("class", "series-title").text(t("series.action"));
  const strip = wrap.append("svg").attr("viewBox", `0 0 ${W} ${SH}`).attr("height", SH);
  strip.append("defs").html(`<pattern id="hatch-s" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="6" fill="var(--a-dehumidification)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.6)" stroke-width="2"/></pattern>`);
  // Built as one SVG string; when cells are narrower than 3 px, neighbouring
  // hours with the same colour are merged into one rectangle (long datasets).
  const cw = Math.max(step - 1, 1);
  const fillOf = (r) => {
    const a = r.rec.inZone ? null : r.rec.actions[0];
    return r.rec.inZone ? "var(--zone)" : !a ? "var(--surface-2)" : a === "dehumidification" ? "url(#hatch-s)" : `var(--a-${a})`;
  };
  const parts = [];
  if (step < 3) {
    let i = 0;
    while (i < rows.length) {
      let j = i;
      const f = fillOf(rows[i]);
      while (j + 1 < rows.length && fillOf(rows[j + 1]) === f) j++;
      const x0 = x(tx(rows[i])) - step / 2, x1 = x(tx(rows[j])) + step / 2;
      parts.push(`<rect x="${x0.toFixed(1)}" y="4" width="${(x1 - x0).toFixed(1)}" height="${SH - 8}" fill="${f}"/>`);
      i = j + 1;
    }
  } else rows.forEach((r) => {
    const cx = x(tx(r)) - step / 2 + 0.5;
    const a = r.rec.inZone ? null : r.rec.actions[0];
    parts.push(`<rect x="${cx.toFixed(1)}" y="4" width="${cw.toFixed(1)}" height="${SH - 8}" rx="2" fill="${fillOf(r)}"/>`);
    if (a && cw >= 9) parts.push(`<text class="c-cell-lbl" x="${(cx + cw / 2).toFixed(1)}" y="${SH / 2 + 4}" text-anchor="middle">${r.rec.actions.map((k) => t(`letter.${k}`)).join("")}</text>`);
  });
  strip.append("g").html(parts.join(""));

  // Crosshair + one tooltip for every panel; click opens the hour on the chart.
  const all = [...hairs.map((h) => h.svg), strip];
  const lines = hairs.map((h) => h.svg.append("line").attr("class", "c-hair").attr("y1", h.top).attr("y2", h.H - h.bottom).attr("visibility", "hidden"));
  const idxAt = (px) => {
    const t = x.invert(px);
    const i = d3.bisector(tx).center(rows, t);
    return Math.max(0, Math.min(rows.length - 1, i));
  };
  for (const s of all) {
    s.on("pointermove", (e) => {
      const [px] = d3.pointer(e);
      const i = idxAt(px), r = rows[i], xx = x(tx(r));
      lines.forEach((l) => l.attr("x1", xx).attr("x2", xx).attr("visibility", "visible"));
      const act = r.rec.inZone ? t("inZone") : r.rec.actions.map((a) => ACTION_LABEL[a]).join(" + ") || t("noFeasible");
      tooltip(`<div class="t">${r.row.time.replace("T", " ")}</div>
        ${panels.map((p) => `<div class="r"><b>${p.v(r).toFixed(p.d)} ${p.unit}</b> ${p.title.split(" (")[0]}</div>`).join("")}
        <div class="r"><b>${act}</b></div>`, e);
    }).on("pointerleave", () => { lines.forEach((l) => l.attr("visibility", "hidden")); tooltip(null); })
      .on("click", (e) => { const [px] = d3.pointer(e); onPick(results.indexOf(rows[idxAt(px)])); })
      .style("cursor", "pointer");
  }
}
