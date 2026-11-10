// report.js — evaluates a whole series and builds the per-row table used by
// the paper (same code in the browser and in tools/run-dss.mjs).

import { buildZone, profileAt } from "./zone.js";
import { recommend, baselineAlarm, ACTIONS, RISK } from "./dss.js";
import { outsideAt } from "./data.js";

export function evaluate(series, profile, outside, settings, p) {
  const zones = new Map(); // one zone per profile hour (same settings and pressure)
  const zoneFor = (hour) => {
    if (!zones.has(hour)) { const opt = profileAt(profile, hour); zones.set(hour, opt ? buildZone(opt, settings.zone, p) : null); }
    return zones.get(hour);
  };
  return series.map((row) => {
    const zone = zoneFor(Number(row.time.slice(11, 13)));
    const o = outsideAt(outside, row.time);
    const rec = zone ? recommend({ t: row.t, w: row.w }, zone, o, settings.dss, p) : null;
    return { row, zone, outside: o, rec, alarm: rec ? baselineAlarm(rec.state, zone, settings.baseline) : null };
  });
}

const f = (x, d) => (x === null || x === undefined || !Number.isFinite(x) ? "" : x.toFixed(d));

export const CSV_HEADER = [
  "timestamp", "Tdb_C", "RH_pct", "W_gkg", "Tdp_C", "Twb_C", "h_kJkg", "VPD_kPa", "cond_margin_C",
  "zone_Tdb_lo", "zone_Tdb_hi", "zone_VPD_lo", "zone_VPD_hi", "in_zone", "distance_norm",
  "actions", "match", ...ACTIONS.map((a) => `cos_${a}`), "end_Tdb_C", "end_W_gkg", "dh_kJkg", "energy_MJ",
  "risk_condensation", "risk_dry", "baseline_rh_alarm", "baseline_t_alarm", "outside_Tdb_C", "outside_W_gkg",
];

export function toCSV(results) {
  const lines = [CSV_HEADER.join(",")];
  for (const { row, zone, outside, rec, alarm } of results) {
    const s = rec?.state;
    lines.push([
      row.time, f(row.t, 2), f(s?.RH, 1), f(row.w * 1000, 3), f(s?.Tdp, 2), f(s?.Twb, 2), f(s?.h, 2),
      f(s ? s.VPD / 1000 : NaN, 3), f(s?.condMargin, 2),
      f(zone?.tLo, 2), f(zone?.tHi, 2), f(zone?.vpdLo, 2), f(zone?.vpdHi, 2),
      rec ? (rec.inZone ? 1 : 0) : "", f(rec?.distance, 3),
      rec ? rec.actions.join("+") : "", rec ? (rec.inZone ? "in_zone" : rec.match) : "",
      ...ACTIONS.map((a) => f(rec?.scores?.[a]?.cos, 3)),
      f(rec?.end?.t, 2), f(rec?.end ? rec.end.w * 1000 : NaN, 3), f(rec?.dh, 2), f(rec?.energyMJ, 3),
      s ? (s.condMargin < RISK.condMargin ? 1 : 0) : "", s ? (s.VPD / 1000 > RISK.vpdHigh ? 1 : 0) : "",
      alarm?.rh ?? "", alarm?.t ?? "", f(outside?.t, 2), f(outside ? outside.w * 1000 : NaN, 3),
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

export function summary(results) {
  const n = results.filter((r) => r.rec).length;
  const inZone = results.filter((r) => r.rec?.inZone).length;
  const cond = results.filter((r) => r.rec && r.rec.state.condMargin < RISK.condMargin);
  const dry = results.filter((r) => r.rec && r.rec.state.VPD / 1000 > RISK.vpdHigh);
  const actions = {};
  for (const r of results) if (r.rec && !r.rec.inZone) {
    const k = r.rec.actions.join("+") || "none"; actions[k] = (actions[k] || 0) + 1;
  }
  return {
    n, inZone,
    condRisk: cond.length, condCaughtByRH: cond.filter((r) => r.alarm.rh === "high").length,
    dryRisk: dry.length, dryCaughtByRH: dry.filter((r) => r.alarm.rh === "low").length,
    actions,
  };
}
