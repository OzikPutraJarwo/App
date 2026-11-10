// dss.js — process-vector decision support, computed entirely in physical
// space (independent of chart size or zoom). Method: paper-q1/definisi-metode.md.
//
// 1. A = current state (Tdb, W); Z = crop target zone of that hour.
// 2. If A is inside Z: no action.
// 3. B = nearest point of Z to A in normalised space (Tdb/ΔT_ref, W/ΔW_ref).
// 4. d = B − A is the correction vector.
// 5. Each installed, feasible actuator has a direction at A:
//      heating      W constant (horizontal)
//      fogging      along the wet-bulb line (h ≈ constant)
//      ventilation  along the mixing line towards outside air O
//      dehumidify   W decreasing
// 6. Each action is followed along its own process path (fogging along the
//    real wet-bulb curve, ventilation up to pure outside air). An action that
//    enters Z is a candidate; among candidates the one whose direction best
//    matches d (cosine) is chosen. If none enters Z, an action whose cosine
//    is at least cosMin is still taken as the single answer; else a
//    non-negative combination of two action directions that spans d is used;
//    otherwise the action that gets closest is reported as "partial".
// 7. Energy Q = m_da × Δh between A and the end point (zone entry of the
//    chosen single action, else B), with m_da = V / v.

import { state, wetBulb, humRatioFromWetBulb } from "./psychro.js";
import { pointInPolygon } from "./zone.js";

export const ACTIONS = ["heating", "fogging", "ventilation", "dehumidification"];

export const DEFAULT_DSS = {
  tRef: 1,        // °C
  wRef: 0.5,      // g/kg; 1 °C ≈ 0.5 g/kg (sensitivity-tested in the paper)
  cosMin: 0.95,   // an aligned action is accepted even if it stops short of Z
  actuators: { heating: true, fogging: true, ventilation: true, dehumidification: false },
  volume: 0,      // m³ (greenhouse air volume), 0 = energy not reported
};

const toN = (t, w, c) => ({ x: t / c.tRef, y: (w * 1000) / c.wRef });
const fromN = (q, c) => ({ t: q.x * c.tRef, w: (q.y * c.wRef) / 1000 });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => { const l = len(a); return l > 0 ? { x: a.x / l, y: a.y / l } : null; };

// Nearest point on polygon perimeter to q (all in normalised space).
// Hot path (called thousands of times per hour of data): no allocations in
// the loop, squared distances compared, same result as the plain version.
function nearestOnPolygon(q, poly) {
  let bd2 = Infinity, bx = 0, by = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[i + 1 === n ? 0 : i + 1];
    const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / l2)) : 0;
    const cx = a.x + f * abx, cy = a.y + f * aby;
    const dx = cx - q.x, dy = cy - q.y, d2 = dx * dx + dy * dy;
    if (d2 < bd2) { bd2 = d2; bx = cx; by = cy; }
  }
  return { x: bx, y: by, d: Math.hypot(bx - q.x, by - q.y) };
}

// Bounding box of a normalised polygon (cached) and the distance from q to
// it: a lower bound on the distance to the polygon, used to skip exact
// checks that cannot improve the current best (results stay identical).
const boxes = new WeakMap();
function boxDist(q, polyN) {
  let b = boxes.get(polyN);
  if (!b) {
    b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const v of polyN) { b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y); }
    boxes.set(polyN, b);
  }
  const dx = Math.max(b.x0 - q.x, 0, q.x - b.x1), dy = Math.max(b.y0 - q.y, 0, q.y - b.y1);
  return Math.hypot(dx, dy);
}

// Distance from q to zone (0 inside).
function distToZone(q, polyN, zone, c) {
  const p = fromN(q, c);
  return pointInPolygon(p.t, p.w, zone.points) ? 0 : nearestOnPolygon(q, polyN).d;
}

// Directions (unit vectors in normalised space) of feasible installed actions.
function actionDirections(A, aN, sA, outside, zone, polyN, d0, c, p) {
  const dirs = {};
  const on = c.actuators;
  if (on.heating) dirs.heating = { x: 1, y: 0 };
  if (on.dehumidification) dirs.dehumidification = { x: 0, y: -1 };
  if (on.fogging && sA.RH < 98) {
    const twb = wetBulb(A.t, A.w, p);
    const t2 = A.t - 0.5;
    dirs.fogging = unit(sub(toN(t2, humRatioFromWetBulb(t2, twb, p), c), aN));
  }
  if (on.ventilation && outside) {
    // Feasible only if some mixture of inside and outside air is closer to
    // the zone than the current state (ventilation feasibility).
    const oN = toN(outside.t, outside.w, c);
    let bestD = d0;
    for (let i = 1; i <= 50; i++) {
      const f = i / 50;
      const q = { x: aN.x + f * (oN.x - aN.x), y: aN.y + f * (oN.y - aN.y) };
      const lb = boxDist(q, polyN);
      if (lb > 0 && lb >= bestD) continue;
      bestD = Math.min(bestD, distToZone(q, polyN, zone, c));
    }
    if (bestD < d0 - 1e-6) dirs.ventilation = unit(sub(oN, aN));
    dirs._ventMax = len(sub(oN, aN));
  }
  return dirs;
}

// Point reached after "amount" s (normalised units) of an action, or null
// when the process cannot go further (saturation, pure outside air).
function pathPoint(name, s, A, outside, c, p, twb) {
  if (name === "heating") return { t: A.t + s * c.tRef, w: A.w };
  if (name === "dehumidification") { const w = A.w - (s * c.wRef) / 1000; return w > 0 ? { t: A.t, w } : null; }
  if (name === "fogging") {
    const t = A.t - s * c.tRef;
    return t > twb ? { t, w: humRatioFromWetBulb(t, twb, p) } : null;
  }
  if (name === "ventilation") {
    const L = Math.hypot((outside.t - A.t) / c.tRef, ((outside.w - A.w) * 1000) / c.wRef);
    const f = s / L;
    return f <= 1 ? { t: A.t + f * (outside.t - A.t), w: A.w + f * (outside.w - A.w) } : null;
  }
  return null;
}

// Follows an action's path; returns { reaches, end, residual, amount }.
function followPath(name, A, outside, zone, polyN, c, p) {
  const twb = name === "fogging" ? wetBulb(A.t, A.w, p) : 0;
  let best = { reaches: false, end: A, residual: Infinity, amount: 0 };
  for (let s = 0.02; s <= 40; s += 0.02) {
    const q = pathPoint(name, s, A, outside, c, p, twb);
    if (!q) break;
    const qN = toN(q.t, q.w, c);
    const lb = boxDist(qN, polyN);
    if (lb > 0 && lb >= best.residual) continue; // cannot reach the zone or beat the best
    const r = distToZone(qN, polyN, zone, c);
    if (r === 0) return { reaches: true, end: q, residual: 0, amount: s };
    if (r < best.residual) best = { reaches: false, end: q, residual: r, amount: s };
  }
  return best;
}

// Main entry. A = {t, w}; zone from buildZone; outside = {t, w} | null.
export function recommend(A, zone, outside = null, cfg = {}, p = 101325) {
  const c = { ...DEFAULT_DSS, ...cfg, actuators: { ...DEFAULT_DSS.actuators, ...(cfg.actuators || {}) } };
  const sA = state(A.t, A.w, p);
  if (pointInPolygon(A.t, A.w, zone.points)) {
    return { inZone: true, state: sA, actions: [], distance: 0 };
  }

  const aN = toN(A.t, A.w, c);
  const polyN = zone.points.map((q) => toN(q.t, q.w, c));
  const bN = nearestOnPolygon(aN, polyN);
  const B = fromN(bN, c);
  const d = sub(bN, aN);
  const dU = unit(d);
  const dirs = actionDirections(A, aN, sA, outside, zone, polyN, bN.d, c, p);
  const ventMax = dirs._ventMax;
  delete dirs._ventMax;

  if (!dU) return { inZone: true, state: sA, actions: [], distance: 0 };

  const singles = Object.entries(dirs)
    .filter(([, u]) => u)
    .map(([name, u]) => ({ name, cos: dot(dU, u), ...followPath(name, A, outside, zone, polyN, c, p) }));

  let actions = [];
  let match = "none";
  let end = B;
  const reaching = singles.filter((a) => a.reaches).sort((a, b) => b.cos - a.cos);
  const aligned = singles.filter((a) => a.cos >= c.cosMin && a.residual < bN.d).sort((a, b) => b.cos - a.cos);
  if (reaching.length || aligned.length) {
    const pick = reaching[0] ?? aligned[0];
    actions = [pick.name];
    end = pick.end;
    match = pick.reaches ? "single" : "partial";
  } else {
    // Non-negative combination a·u1 + b·u2 = d; pick the one with least effort.
    let best = null;
    const names = Object.keys(dirs).filter((k) => dirs[k]);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const u1 = dirs[names[i]], u2 = dirs[names[j]];
      const det = u1.x * u2.y - u1.y * u2.x;
      if (Math.abs(det) < 1e-9) continue;
      const a = (d.x * u2.y - d.y * u2.x) / det;
      const b = (u1.x * d.y - u1.y * d.x) / det;
      if (a < 0 || b < 0) continue;
      if (names[i] === "ventilation" && a > ventMax) continue;
      if (names[j] === "ventilation" && b > ventMax) continue;
      if (!best || a + b < best.effort) best = { names: [names[i], names[j]], effort: a + b };
    }
    if (best) { actions = best.names; match = "pair"; }
    else {
      const closest = singles.filter((a) => a.residual < bN.d).sort((a, b) => a.residual - b.residual)[0];
      if (closest) { actions = [closest.name]; end = closest.end; match = "partial"; }
    }
  }

  const sB = state(B.t, B.w, p);
  const sE = state(end.t, end.w, p);
  const dh = sE.h - sA.h;
  const energyMJ = c.volume > 0 ? ((c.volume / sA.v) * dh) / 1000 : null;

  return {
    inZone: false,
    state: sA,
    target: { t: B.t, w: B.w, state: sB },   // nearest point of the zone
    end: { t: end.t, w: end.w, state: sE },  // where the recommended action ends
    distance: bN.d,
    dT: B.t - A.t,
    dW: B.w - A.w,
    dh,
    energyMJ,
    scores: Object.fromEntries(singles.map((a) => [a.name, { cos: a.cos, reaches: a.reaches, residual: a.residual }])),
    actions,
    match,
  };
}

// Baseline T/RH threshold alarm (paper-q1/definisi-metode.md).
export const DEFAULT_BASELINE = { rhHigh: 90, rhLow: 50, useZoneT: true };

export function baselineAlarm(s, zone, cfg = DEFAULT_BASELINE) {
  const rh = s.RH > cfg.rhHigh ? "high" : s.RH < cfg.rhLow ? "low" : "";
  let t = "";
  if (cfg.useZoneT && zone) t = s.Tdb < zone.tLo ? "low" : s.Tdb > zone.tHi ? "high" : "";
  return { rh, t };
}

export const RISK = { condMargin: 2, vpdHigh: 1.5 };
