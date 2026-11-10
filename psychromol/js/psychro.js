// psychro.js — moist-air property engine (SI: °C, Pa, kg/kg, kJ/kg).
// Formulation: ASHRAE Handbook Fundamentals 2017, ch. 1 (Hyland–Wexler
// saturation pressure, eqs. 5–6; humidity ratio eq. 20; enthalpy eq. 30;
// specific volume eq. 26; wet bulb eqs. 33/35).

const T_TRIPLE = 0.01;      // °C
const R_DA = 287.042;       // J/(kg·K), dry air
const EPS = 0.621945;       // M_w / M_da
const TOL = 1e-6;           // °C, iteration tolerance

const K = (t) => t + 273.15;

// Saturation vapour pressure over ice (t <= 0.01 °C) or liquid water, Pa.
export function satVapPres(t) {
  const T = K(t);
  const lnP = t <= T_TRIPLE
    ? -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T ** 2
      + 2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T)
    : -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T ** 2
      - 1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T);
  return Math.exp(lnP);
}

export const humRatioFromVapPres = (pw, p) => (EPS * pw) / (p - pw);
export const vapPresFromHumRatio = (w, p) => (p * w) / (EPS + w);
export const enthalpy = (t, w) => 1.006 * t + w * (2501 + 1.86 * t);
export const specificVolume = (t, w, p) => (R_DA * K(t) * (1 + 1.607858 * w)) / p;

// Inverse of satVapPres by bisection (monotonic), °C.
export function tempFromSatVapPres(pw) {
  let lo = -100, hi = 200;
  while (hi - lo > TOL) {
    const mid = (lo + hi) / 2;
    if (satVapPres(mid) > pw) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export const dewPoint = (t, w, p) => Math.min(t, tempFromSatVapPres(vapPresFromHumRatio(w, p)));

// Humidity ratio on the wet-bulb line through (t, twb), ASHRAE eqs. 33/35.
export function humRatioFromWetBulb(t, twb, p) {
  const ws = humRatioFromVapPres(satVapPres(twb), p);
  return twb >= 0
    ? ((2501 - 2.326 * twb) * ws - 1.006 * (t - twb)) / (2501 + 1.86 * t - 4.186 * twb)
    : ((2830 - 0.24 * twb) * ws - 1.006 * (t - twb)) / (2830 + 1.86 * t - 2.1 * twb);
}

export function wetBulb(t, w, p) {
  let lo = dewPoint(t, w, p), hi = t;
  while (hi - lo > TOL) {
    const mid = (lo + hi) / 2;
    if (humRatioFromWetBulb(t, mid, p) > w) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export const humRatioFromRH = (t, rh, p) => humRatioFromVapPres((rh / 100) * satVapPres(t), p);

// Pressure from altitude (m), ASHRAE eq. 3.
export const pressureFromAltitude = (z) => 101325 * (1 - 2.25577e-5 * z) ** 5.2559;

// Full state from dry bulb (°C), humidity ratio (kg/kg) and pressure (Pa).
export function state(t, w, p = 101325) {
  const pws = satVapPres(t);
  const pw = vapPresFromHumRatio(w, p);
  const ws = humRatioFromVapPres(pws, p);
  const v = specificVolume(t, w, p);
  const tdp = dewPoint(t, w, p);
  return {
    Tdb: t,
    W: w,
    RH: (pw / pws) * 100,
    Twb: wetBulb(t, w, p),
    Tdp: tdp,
    h: enthalpy(t, w),
    v,
    rho: (1 + w) / v,
    Pw: pw,
    Pws: pws,
    VPD: pws - pw,
    AH: (w / v) * 1000,       // g/m³
    mu: (w / ws) * 100,
    condMargin: t - tdp,      // condensation margin, °C
  };
}
