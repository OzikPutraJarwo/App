// eval-worker.js — runs report.evaluate off the main thread so the page stays
// responsive while a long dataset (thousands of hours) is evaluated.
import { evaluate } from "./report.js";

self.onmessage = (e) => {
  const { id, series, profile, outside, settings, p } = e.data;
  const results = evaluate(series, profile, outside, settings, p);
  // rows are re-attached on the main thread; send only what was computed
  self.postMessage({ id, results: results.map(({ zone, outside: o, rec, alarm }) => ({ zone, outside: o, rec, alarm })) });
};
