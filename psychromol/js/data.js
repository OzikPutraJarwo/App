// data.js — reading inside-air series (file or Raspberry Pi API), outside air
// (optional columns in the same data, or KMA ASOS hourly CSV for the CLI),
// and the crop optimum profile. Every series becomes
// [{ time: "YYYY-MM-DDTHH:MM", t, w, out? }] (°C, kg/kg; out = { t, w }).

import { humRatioFromRH, humRatioFromVapPres, satVapPres } from "./psychro.js";

// KMA ASOS stations near the study site. Muan is the default.
export const KMA_STATIONS = ["Muan", "Mokpo", "Gwangju", "Haenam", "Jangheung", "Wando", "Jindo", "Yeonggwang"];

const ALIASES = {
  time: ["timestamp", "time", "datetime", "date", "일시"],
  t: ["tdb", "t", "temp", "temperature", "drybulb", "기온"],
  w: ["w", "humidityratio", "humidity_ratio", "hr", "mixingratio"],
  rh: ["rh", "humidity", "relativehumidity", "relative_humidity", "습도"],
  tdp: ["tdp", "dewpoint", "dew_point", "이슬점온도"],
  vpd: ["vpd"],
  outT: ["out_tdb", "tdb_out", "t_out", "out_t", "outside_temp", "outdoor_temp", "outside_tdb", "temp_out"],
  outRh: ["out_rh", "rh_out", "outside_rh", "outdoor_rh", "humidity_out"],
};

// Humidity field types a user can map a column to.
export const HUM_TYPES = ["rh", "w_gkg", "w_kgkg", "tdp", "vpd"];

const norm = (k) => String(k).toLowerCase().replace(/\s+/g, "").replace(/\(.*?\)/g, "");

function pick(row, field) {
  for (const [k, v] of Object.entries(row)) {
    const nk = norm(k);
    if (ALIASES[field].some((a) => nk === a || (/[가-힣]/.test(a) && nk.startsWith(a)))) return v;
  }
  return undefined;
}

const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));

// Value at a dotted path ("sensor.temp", "items.0.t") or undefined.
export function getPath(obj, path) {
  return String(path).split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

// Time value → "YYYY-MM-DDTHH:MM", or "YYYY-MM-DDTHH:MM:SS" when the
// seconds are not zero (sub-minute logging). Local time. Accepts ISO-like
// text and epoch seconds or milliseconds.
export function toTime(v) {
  if (v === undefined || v === null || v === "") return "";
  let s;
  if (typeof v === "number" || /^\d{9,13}$/.test(String(v).trim())) {
    const n = Number(v), d = new Date(n < 1e12 ? n * 1000 : n);
    const z = (x) => String(x).padStart(2, "0");
    s = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
  } else s = String(v).trim().replace(" ", "T").slice(0, 19);
  return s.length === 19 && s.endsWith(":00") ? s.slice(0, 16) : s;
}

// Humidity value of a given type → W (kg/kg).
function humToW(type, v, t, p) {
  if (!Number.isFinite(v)) return NaN;
  if (type === "rh") return humRatioFromRH(t, v, p);
  if (type === "w_gkg") return v / 1000;
  if (type === "w_kgkg") return v;
  if (type === "tdp") return humRatioFromVapPres(satVapPres(v), p);
  if (type === "vpd") return humRatioFromVapPres(Math.max(satVapPres(t) - v * 1000, 0), p);
  return NaN;
}

// One raw record → { time, t, w, out? } or null. `map` (optional) names the
// fields explicitly: { time, t, hum, humType, outT, outRh }; empty entries
// fall back to the aliases above.
export function toRow(raw, p = 101325, map = {}) {
  const get = (field, key) => (map[key] ? getPath(raw, map[key]) : pick(raw, field));
  const t = num(get("t", "t"));
  if (!Number.isFinite(t)) return null;
  let w;
  if (map.hum) w = humToW(map.humType || "rh", num(getPath(raw, map.hum)), t, p);
  else {
    w = num(pick(raw, "w"));
    if (Number.isFinite(w)) { if (w > 0.5) w /= 1000; }                      // g/kg given
    else {
      const rh = num(pick(raw, "rh")), tdp = num(pick(raw, "tdp")), vpd = num(pick(raw, "vpd"));
      w = Number.isFinite(rh) ? humToW("rh", rh, t, p) : Number.isFinite(tdp) ? humToW("tdp", tdp, t, p) : humToW("vpd", vpd, t, p);
    }
  }
  if (!Number.isFinite(w) || w < 0) return null;
  const row = { time: toTime(get("time", "time")), t, w };
  const ot = num(get("outT", "outT")), orh = num(get("outRh", "outRh"));
  if (Number.isFinite(ot) && Number.isFinite(orh)) row.out = { t: ot, w: humRatioFromRH(ot, orh, p) };
  return row;
}

export function parseCSV(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

// Parsed JSON → list of records. `path` (dotted) points at the list; when
// empty, the JSON itself if it is a list, else the first list of objects
// found inside it (breadth-first), else the object as a single record.
export function extractRecords(j, path = "") {
  const v = path ? getPath(j, path) : j;
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  if (!path) {
    const queue = [v];
    while (queue.length) {
      for (const x of Object.values(queue.shift())) {
        if (Array.isArray(x) && x.length && typeof x[0] === "object") return x;
        if (x && typeof x === "object" && !Array.isArray(x)) queue.push(x);
      }
    }
  }
  return [v];
}

// Text of a .csv or .json file → raw records.
export function parseText(text, name = "", path = "") {
  const s = text.trim();
  if (name.endsWith(".json") || s.startsWith("{") || s.startsWith("[")) return extractRecords(JSON.parse(s), path);
  return parseCSV(s);
}

export const toSeries = (records, p, map) =>
  records.map((r) => toRow(r, p, map)).filter(Boolean).sort((a, b) => a.time.localeCompare(b.time));

// Outside air carried as columns of the inside series.
export const outsideFromSeries = (series) => series.filter((r) => r.out).map((r) => ({ time: r.time, ...r.out }));

// Field names found in the first record (dotted for nested objects), shown
// to the user when mapping API or file fields.
export function fieldNames(rec, prefix = "") {
  if (!rec || typeof rec !== "object") return [];
  return Object.entries(rec).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? fieldNames(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

// KMA ASOS CSV may hold several stations; keep the selected one when the
// station-name column is present.
export function filterStation(records, station) {
  const key = Object.keys(records[0] || {}).find((k) => ["지점명", "stationname", "station"].includes(norm(k)));
  if (!key || !station) return records;
  const kept = records.filter((r) => norm(r[key]).includes(norm(station)) || norm(r[key]).includes(norm(KOREAN[station] || "")));
  return kept.length ? kept : records;
}

const KOREAN = { Muan: "무안", Mokpo: "목포", Gwangju: "광주", Haenam: "해남", Jangheung: "장흥", Wando: "완도", Jindo: "진도", Yeonggwang: "영광" };

// Raspberry Pi API: GET url → JSON (one record or a list). `api` holds the
// optional list path and field map; without them the aliases are used.
// Records without a time get the time of the request.
export async function fetchSensor(url, p, api = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const recs = extractRecords(await res.json(), api.path || "");
  const now = toTime(Date.now());
  const rows = recs.map((r) => toRow(r, p, api.map || {})).filter(Boolean).map((r) => (r.time ? r : { ...r, time: now }));
  return { rows: rows.sort((a, b) => a.time.localeCompare(b.time)), fields: fieldNames(recs[0]) };
}

// Crop optimum profile → 24 rows { hour, tdb, vpd }.
export function toProfile(records) {
  const byHour = new Map();
  for (const r of records) {
    const time = String(pick(r, "time") ?? "");
    const hour = Number(r.hour ?? time.slice(11, 13));
    const tdb = num(pick(r, "t")), vpd = num(pick(r, "vpd"));
    if (Number.isInteger(hour) && Number.isFinite(tdb) && Number.isFinite(vpd) && !byHour.has(hour)) byHour.set(hour, { hour, tdb, vpd });
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

// Outside value for the same clock hour as an inside time.
export function outsideAt(outside, time) {
  if (!outside?.length) return null;
  const key = time.slice(0, 13);
  return outside.find((o) => o.time.slice(0, 13) === key) ?? null;
}
