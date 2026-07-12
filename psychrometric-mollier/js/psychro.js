// ==========================================
// psychro.js — Psychrometric math engine (Psychro, calculateAllProperties)
// ==========================================

const Psychro = {
  R_DA: 287.058,

  getSatVapPres: (t) => 610.94 * Math.exp((17.625 * t) / (t + 243.04)),
  getTempFromSatPres: (Pws) =>
    (243.04 * Math.log(Pws / 610.94)) / (17.625 - Math.log(Pws / 610.94)),
  getPwFromW: (W, Patm) => (W * Patm) / (0.62198 + W),
  getWFromPw: (Pw, Patm) => (Patm - Pw <= 0 ? 0 : (0.62198 * Pw) / (Patm - Pw)),
  getEnthalpy: (t, W) => 1.006 * t + W * (2501 + 1.86 * t),
  getSpecificVolume: (t, W, Patm) =>
    (287.058 * (t + 273.15) * (1 + 1.6078 * W)) / Patm,
  getDewPoint: (Pw) =>
    Pw <= 0
      ? -273.15
      : (243.04 * Math.log(Pw / 610.94)) / (17.625 - Math.log(Pw / 610.94)),

  getTwbFromState: (Tdb, W, Patm) => {
    let low = -20,
      high = Tdb,
      Twb = Tdb;
    for (let i = 0; i < 20; i++) {
      Twb = (low + high) / 2;
      const Pws = Psychro.getSatVapPres(Twb);
      const Ws = Psychro.getWFromPw(Pws, Patm);
      const num = (2501 - 2.326 * Twb) * Ws - 1.006 * (Tdb - Twb);
      const den = 2501 + 1.86 * Tdb - 4.186 * Twb;
      const W_calc = num / den;
      if (W_calc > W) high = Twb;
      else low = Twb;
    }
    return Twb;
  },

  getTdbFromVolLine: (v, W, Patm) => {
    return (v * Patm) / (287.058 * (1 + 1.6078 * W)) - 273.15;
  },

  solveRobust: (type1, val1, type2, val2, Patm) => {
    if (type2 === "Tdb" || type2 === "W") {
      [type1, type2] = [type2, type1];
      [val1, val2] = [val2, val1];
    }

    if (type1 === "Tdb") {
      const t = val1;

      if (type2 === "W") return { t, w: val2 };

      if (type2 === "RH") {
        const Pws = Psychro.getSatVapPres(t);
        const w = Psychro.getWFromPw(Pws * (val2 / 100), Patm);
        return { t, w };
      }

      if (type2 === "v") {
        const Tk = t + 273.15;
        const numerator = (val2 * Patm) / (Psychro.R_DA * Tk) - 1;
        const w = numerator / 1.6078;
        return { t, w };
      }

      let wLow = 0,
        wHigh = 0.15,
        wMid = 0;
      for (let i = 0; i < 40; i++) {
        wMid = (wLow + wHigh) / 2;
        let calc = 0;
        if (type2 === "h") calc = Psychro.getEnthalpy(t, wMid);
        else if (type2 === "Twb") calc = Psychro.getTwbFromState(t, wMid, Patm);

        if (calc > val2) wHigh = wMid;
        else wLow = wMid;
      }
      return { t, w: wMid };
    }

    if (type1 === "W") {
      const w = val1;

      // Direct solution: both unknowns are fully determined
      if (type2 === "Tdb") return { t: val2, w };

      let tLow = -50,
        tHigh = 100,
        tMid = 0;

      for (let i = 0; i < 40; i++) {
        tMid = (tLow + tHigh) / 2;
        let calc = 0;

        if (type2 === "RH") {
          const Pws = Psychro.getSatVapPres(tMid);
          const Pw = Psychro.getPwFromW(w, Patm);
          calc = (Pw / Pws) * 100;
          if (calc < val2) tHigh = tMid;
          else tLow = tMid;
          continue;
        } else if (type2 === "h") calc = Psychro.getEnthalpy(tMid, w);
        else if (type2 === "Twb") calc = Psychro.getTwbFromState(tMid, w, Patm);
        else if (type2 === "v") calc = Psychro.getSpecificVolume(tMid, w, Patm);

        if (calc > val2) tHigh = tMid;
        else tLow = tMid;
      }
      return { t: tMid, w };
    }

    let tLow = -20,
      tHigh = 100,
      tMid = 0;
    let lastWGuess = 0;
    for (let i = 0; i < 50; i++) {
      tMid = (tLow + tHigh) / 2;

      let wL = 0,
        wH = 0.15,
        wM = 0;
      for (let j = 0; j < 15; j++) {
        wM = (wL + wH) / 2;
        let v1Calc = 0;
        if (type1 === "h") v1Calc = Psychro.getEnthalpy(tMid, wM);
        else if (type1 === "Twb")
          v1Calc = Psychro.getTwbFromState(tMid, wM, Patm);
        else if (type1 === "v")
          v1Calc = Psychro.getSpecificVolume(tMid, wM, Patm);

        if (v1Calc > val1) wH = wM;
        else wL = wM;
      }
      let wGuess = wM;
      lastWGuess = wGuess;

      let v2Calc = 0;
      if (type2 === "RH") {
        const Pws = Psychro.getSatVapPres(tMid);
        const Pw = Psychro.getPwFromW(wGuess, Patm);
        v2Calc = (Pw / Pws) * 100;
      } else if (type2 === "v") {
        v2Calc = Psychro.getSpecificVolume(tMid, wGuess, Patm);
      }

      if (type2 === "RH") {
        if (v2Calc < val2) tHigh = tMid;
        else tLow = tMid;
      } else {
        if (v2Calc > val2) tHigh = tMid;
        else tLow = tMid;
      }
    }
    return { t: tMid, w: lastWGuess };
  },

  getWFromTwbLine: (Tdb, Twb, Patm) => {
    const Pws = Psychro.getSatVapPres(Twb);
    const Ws = Psychro.getWFromPw(Pws, Patm);
    return (
      ((2501 - 2.326 * Twb) * Ws - 1.006 * (Tdb - Twb)) /
      (2501 + 1.86 * Tdb - 4.186 * Twb)
    );
  },
  getTdbFromTwbZeroW: (Twb, Patm) => {
    const Pws = Psychro.getSatVapPres(Twb);
    const Ws = Psychro.getWFromPw(Pws, Patm);
    return ((2501 - 2.326 * Twb) * Ws + 1.006 * Twb) / 1.006;
  },
  getWFromEnthalpyLine: (t, h) => (h - 1.006 * t) / (2501 + 1.86 * t),
  getWFromVolLine: (t, v, Patm) =>
    ((v * Patm) / (287.058 * (t + 273.15)) - 1) / 1.6078,
  solveIntersectionWithSaturation: (type, targetVal, Patm, minT, maxT) => {
    let low = minT - 20,
      high = maxT + 20,
      mid = 0;
    for (let i = 0; i < 20; i++) {
      mid = (low + high) / 2;
      const Pws = Psychro.getSatVapPres(mid);
      const Wsat = Psychro.getWFromPw(Pws, Patm);
      let val =
        type === "enthalpy"
          ? Psychro.getEnthalpy(mid, Wsat)
          : Psychro.getSpecificVolume(mid, Wsat, Patm);
      if (val > targetVal) high = mid;
      else low = mid;
    }
    return mid;
  },
};

function getFrostPoint(Pw) {
  // Magnus-type equation for ice
  const lnRatio = Math.log(Pw / 611.2);
  return (272.62 * lnRatio) / (22.46 - lnRatio);
}


function calculateAllProperties(t, w, Patm) {
  const Pws = Psychro.getSatVapPres(t);
  const Pw = Psychro.getPwFromW(w, Patm);
  const Wsat = Psychro.getWFromPw(Pws, Patm);
  const vpdVal = Pws - Pw;
  const hdVal = Wsat - w;
  const v = Psychro.getSpecificVolume(t, w, Patm);
  const ahVal = (w / v) * 1000;
  const Tdp = Psychro.getDewPoint(Pw);
  const Tf = Tdp >= 0 ? Tdp : getFrostPoint(Pw);

  return {
    Tdb: t,
    W: w,
    RH: (Pw / Pws) * 100,
    Twb: Psychro.getTwbFromState(t, w, Patm),
    Tdp: Tdp,
    h: Psychro.getEnthalpy(t, w),
    v: Psychro.getSpecificVolume(t, w, Patm),
    rho: (1 + w) / Psychro.getSpecificVolume(t, w, Patm),
    Pw: Pw,
    Pws: Pws,
    mu: (w / Psychro.getWFromPw(Pws, Patm)) * 100,
    cp: 1.006 + 1.86 * w,
    Wsat: Wsat,
    VPD: vpdVal,
    HD: hdVal,
    AH: ahVal,
    PD: t - Psychro.getTwbFromState(t, w, Patm),
    VMR: (Pw / (Patm - Pw)) * 1000000,
    Dvs: 1000 * Pws / (461.5 * (t + 273.15)),
    Tf: Tf,
  };
}
