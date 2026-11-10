// store.js — keeps loaded data in the browser (IndexedDB), one log per data
// source ("file", "api"), so the app works as a simple data logger: rows
// survive a reload and every API reading is saved as it arrives. Rows are
// keyed by time, so a repeated reading replaces the old one.

const DB = "psychromol-data";
const SOURCES = ["file", "api"];
let dbp = null;

function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { for (const s of SOURCES) req.result.createObjectStore(s, { keyPath: "time" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(source, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(source, mode);
    const out = fn(tx.objectStore(source));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
  });
}

// All saved rows of a source, oldest first (keys sort as ISO text).
export const loadRows = (source) => run(source, "readonly", (st) => st.getAll()).then((r) => r || []);

// Add or replace rows.
export const saveRows = (source, rows) => run(source, "readwrite", (st) => { for (const r of rows) st.put(r); });

// Replace the whole log (a new file replaces the previous file).
export const replaceRows = (source, rows) => run(source, "readwrite", (st) => { st.clear(); for (const r of rows) st.put(r); });

export const clearRows = (source) => run(source, "readwrite", (st) => st.clear());

// Rough size of what the browser stores for this site, when supported.
export async function usage() {
  try { const e = await navigator.storage.estimate(); return e.usage ?? null; } catch { return null; }
}
