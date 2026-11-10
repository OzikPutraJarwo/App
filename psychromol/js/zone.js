// zone.js — crop target zone per hour, as a polygon in (Tdb °C, W kg/kg).
// Bounds (paper-q1/definisi-metode.md): Tdb optimum ± tolerance, VPD within a
// band around the optimum, and condensation margin (Tdb − Tdp) >= minimum.

import { satVapPres, humRatioFromVapPres } from "./psychro.js";

// Defaults follow the literature profile in data/profiles/aehobak-literature.json:
// day 22–25 °C and night 12.5–15.5 °C (Goo et al. 2022), VPD 0.5–1.5 kPa by day
// (Yu et al. 2023) and 0.3–1.0 kPa at night (Shamshiri et al. 2018).
export const DEFAULT_ZONE = {
  tTol: 1.5,      // °C, ± around hourly optimum Tdb
  vpdTol: 0.5,    // kPa, ± around hourly optimum VPD
  vpdMin: 0.3,    // kPa, absolute floor for the lower VPD bound
  condMargin: 2,  // °C, minimum Tdb − Tdp
};

// Optimum for a given hour from a 24-row profile [{hour, tdb, vpd}].
export function profileAt(profile, hour) {
  return profile.find((r) => r.hour === hour) ?? null;
}

// Humidity-ratio band at temperature t for the zone, or null if empty.
function wBand(t, vpdLo, vpdHi, cm, p) {
  const pws = satVapPres(t);
  const wLow = humRatioFromVapPres(Math.max(pws - vpdHi * 1000, 0), p);
  const wVpd = humRatioFromVapPres(Math.max(pws - vpdLo * 1000, 0), p);
  const wCm = humRatioFromVapPres(satVapPres(t - cm), p);
  const wHigh = Math.min(wVpd, wCm);
  return wHigh > wLow ? [wLow, wHigh] : null;
}

// Returns { tLo, tHi, vpdLo, vpdHi, cm, points: [{t, w}] } (closed polygon,
// lower edge left→right then upper edge right→left).
export function buildZone(opt, cfg = DEFAULT_ZONE, p = 101325) {
  const tLo = opt.tdb - cfg.tTol, tHi = opt.tdb + cfg.tTol;
  const vpdLo = Math.max(opt.vpd - cfg.vpdTol, cfg.vpdMin), vpdHi = opt.vpd + cfg.vpdTol;
  const lower = [], upper = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = tLo + ((tHi - tLo) * i) / n;
    const band = wBand(t, vpdLo, vpdHi, cfg.condMargin, p);
    if (!band) continue;
    lower.push({ t, w: band[0] });
    upper.push({ t, w: band[1] });
  }
  return { tLo, tHi, vpdLo, vpdHi, cm: cfg.condMargin, opt, points: [...lower, ...upper.reverse()] };
}

export function pointInPolygon(t, w, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.w > w) !== (b.w > w) && t < ((b.t - a.t) * (w - a.w)) / (b.w - a.w) + a.t) inside = !inside;
  }
  return inside;
}
