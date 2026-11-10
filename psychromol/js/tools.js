// tools.js — general psychrometric tools (Tools page): find an air state
// from any two properties, mix two air streams, and compute a process
// between two states with airflow loads. Pure functions (no DOM), so the
// same code runs in the browser and in the tests.

import {
  satVapPres, humRatioFromVapPres, humRatioFromWetBulb, humRatioFromRH,
  enthalpy, specificVolume, state,
} from "./psychro.js";

const R_DA = 287.042;
const T_MIN = -40, T_MAX = 100;

// Inputs a user can give, with the unit shown in the UI.
export const INPUTS = {
  tdb: "°C", rh: "%", twb: "°C", tdp: "°C", w: "g/kg", h: "kJ/kg", v: "m³/kg", vpd: "kPa",
};

const wSat = (t, p) => humRatioFromVapPres(satVapPres(t), p);

// Humidity ratio (kg/kg) at dry bulb t that gives property `key` = val.
// tdp and w do not depend on t.
function wFrom(key, val, t, p) {
  switch (key) {
    case "rh": return humRatioFromRH(t, val, p);
    case "twb": return val > t ? NaN : humRatioFromWetBulb(t, val, p);
    case "tdp": return val > t ? NaN : humRatioFromVapPres(satVapPres(val), p);
    case "w": return val / 1000;
    case "h": return (val - 1.006 * t) / (2501 + 1.86 * t);
    case "v": return ((val * p) / (R_DA * (t + 273.15)) - 1) / 1.607858;
    case "vpd": return humRatioFromVapPres(satVapPres(t) - val * 1000, p);
    default: return NaN;
  }
}

// Value of property `key` for the state (t, w).
function propOf(key, t, w, p) {
  if (key === "tdb") return t;
  if (key === "w") return w * 1000;
  if (key === "h") return enthalpy(t, w);
  if (key === "v") return specificVolume(t, w, p);
  const s = state(t, w, p);
  return { rh: s.RH, twb: s.Twb, tdp: s.Tdp, vpd: s.VPD / 1000 }[key];
}

const valid = (t, w, p) => Number.isFinite(t) && Number.isFinite(w) && w >= 0 && w <= wSat(t, p) * 1.0001 && t >= T_MIN && t <= T_MAX;

// Air state from two known properties: a = [key, value], b = [key, value].
// Returns { t, w } (°C, kg/kg) or { error } with an i18n key.
export function solveState(a, b, p = 101325) {
  let [k1, v1] = a, [k2, v2] = b;
  if (k1 === k2) return { error: "tools.errSame" };
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) return { error: "tools.errValue" };
  if (k2 === "tdb") [k1, v1, k2, v2] = [k2, v2, k1, v1];
  if (k1 === "tdb") {
    const w = wFrom(k2, v2, v1, p);
    return valid(v1, w, p) ? { t: v1, w } : { error: "tools.errRange" };
  }
  // Both fix W (dew point and humidity ratio): not independent.
  if (["tdp", "w"].includes(k1) && ["tdp", "w"].includes(k2)) return { error: "tools.errDependent" };
  // Search t so that the second property matches along the first one's curve.
  const g = (t) => { const w = wFrom(k1, v1, t, p); return valid(t, w, p) ? propOf(k2, t, w, p) - v2 : NaN; };
  let prev = null;
  for (let t = T_MIN; t <= T_MAX + 1e-9; t += 0.25) {
    const f = g(t);
    if (!Number.isFinite(f)) { prev = null; continue; }
    if (f === 0) return { t, w: wFrom(k1, v1, t, p) };
    if (prev && Math.sign(f) !== Math.sign(prev.f)) {
      let lo = prev.t, hi = t, flo = prev.f;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2, fm = g(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
      }
      const tt = (lo + hi) / 2, w = wFrom(k1, v1, tt, p);
      return valid(tt, w, p) ? { t: tt, w } : { error: "tools.errRange" };
    }
    prev = { t, f };
  }
  return { error: "tools.errNone" };
}

// Adiabatic mixing of two streams given as volume flows (m³/h): mass
// balance of dry air, water and enthalpy (lines are straight in t–W within
// the usual accuracy, so t follows from h and W).
export function mix(A, B, qa, qb, p = 101325) {
  const ma = qa / specificVolume(A.t, A.w, p), mb = qb / specificVolume(B.t, B.w, p);
  if (!(ma + mb > 0)) return null;
  const w = (ma * A.w + mb * B.w) / (ma + mb);
  const h = (ma * enthalpy(A.t, A.w) + mb * enthalpy(B.t, B.w)) / (ma + mb);
  return { t: (h - 2501 * w) / (1.006 + 1.86 * w), w };
}

// Process from state A to state B with a volume flow (m³/h, measured at A).
// Loads in kW (positive = added to the air), water in kg/h.
export function processCalc(A, B, flow, p = 101325) {
  const sA = state(A.t, A.w, p), sB = state(B.t, B.w, p);
  const dt = B.t - A.t, dw = B.w - A.w, dh = sB.h - sA.h;
  const m = flow > 0 ? flow / 3600 / sA.v : null; // kg dry air / s
  const cpa = 1.006 + 1.86 * A.w;
  const sens = m === null ? null : m * cpa * dt;
  const total = m === null ? null : m * dh;
  return {
    dt, dw: dw * 1000, dh,
    kind: kind(dt, dw),
    massFlow: m,                              // kg/s
    sensible: sens, latent: total === null ? null : total - sens, total,
    water: m === null ? null : m * dw * 3600, // kg/h
    shr: total ? sens / total : null,         // sensible heat ratio
  };
}

// Process name key from the direction on the chart.
function kind(dt, dw) {
  const T = Math.abs(dt) < 0.05 ? 0 : Math.sign(dt);
  const W = Math.abs(dw) < 0.00005 ? 0 : Math.sign(dw);
  return {
    "1,0": "heat", "-1,0": "cool", "0,1": "humid", "0,-1": "dehumid", "0,0": "none",
    "1,1": "heatHumid", "1,-1": "heatDehumid", "-1,1": "coolHumid", "-1,-1": "coolDehumid",
  }[`${T},${W}`];
}
