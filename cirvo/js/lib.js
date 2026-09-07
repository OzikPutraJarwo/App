

const CirvoLib = (() => {
  const DB_NAME = 'cirvo';
  const META_DB = 'cirvo-meta';
  const META_STORE = 'meta';

  const DB_VERSION = 2;
  const STORE = 'parts';
  const MANIFEST = 'parts/parts.json';

  const PIN_TYPES = [
    { id: 'io', name: 'Digital I/O', color: '#22a06b' },
    { id: 'analog', name: 'Analog', color: '#3d7fe5' },
    { id: 'pwm', name: 'PWM', color: '#d64ea3' },
    { id: 'bus', name: 'Bus (I2C/SPI/UART)', color: '#8a63d2' },
    { id: 'p5v', name: 'Power 5 V', color: '#e5484d' },
    { id: 'p3v3', name: 'Power 3.3 V', color: '#ff8b3d' },
    { id: 'vin', name: 'Power in', color: '#c2410c' },
    { id: 'gnd', name: 'Ground', color: '#2f3037' },
    { id: 'sig', name: 'Signal', color: '#0f9ba8' },
    { id: 'gpio', name: 'GPIO', color: '#22a06b' },
    { id: 'hole', name: 'Tie point', color: '#9aa0ad' },
    { id: 'other', name: 'Other', color: '#6b7280' },
  ];

  const WIRE_COLORS = ['#e5484d', '#2f3037', '#ff8b3d', '#e8c15a', '#22a06b',
    '#3d7fe5', '#8a63d2', '#d64ea3', '#0f9ba8', '#8b5e34', '#ffffff', '#9aa0ad'];

  const typeColor = (t) => (PIN_TYPES.find(p => p.id === t) || PIN_TYPES[11]).color;

  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);

      req.onblocked = () => reject(new Error('another tab is holding the library open'));
    });
    return dbp;
  }

  function tx(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.onerror = () => reject(t.error);
      if (req) req.onsuccess = () => resolve(req.result);
      else t.oncomplete = () => resolve();
    }));
  }

  let metap = null;

  function metaDb() {
    if (metap) return metap;
    metap = new Promise((resolve, reject) => {
      const req = indexedDB.open(META_DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(META_STORE)) d.createObjectStore(META_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    return metap;
  }

  function metaTx(mode, fn) {
    return metaDb().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(META_STORE, mode);
      const req = fn(t.objectStore(META_STORE));
      t.onerror = () => reject(t.error);
      if (req) req.onsuccess = () => resolve(req.result);
      else t.oncomplete = () => resolve();
    }));
  }

  const getMeta = (k) => metaTx('readonly', s => s.get(k)).catch(() => undefined);
  const setMeta = (k, v) => metaTx('readwrite', s => s.put(v, k)).catch(() => { });
  const delMeta = (k) => metaTx('readwrite', s => s.delete(k)).catch(() => { });

  const getCustom = () => tx('readonly', s => s.getAll()).catch(() => []);
  const putCustom = (part) => tx('readwrite', s => s.put(part));
  const delCustom = (id) => tx('readwrite', s => s.delete(id));

  let cache = null;

  async function loadStock() {
    const res = await fetch(MANIFEST, { cache: 'no-cache' });
    if (!res.ok) throw new Error('parts.json ' + res.status);
    return res.json();
  }

  function partImages(p) {
    if (p && Array.isArray(p.images) && p.images.length) {
      return p.images.map(im => ({
        src: im.src,
        x: im.x === undefined ? 0.5 : im.x,
        y: im.y === undefined ? 0.5 : im.y,
        w: im.w === undefined ? 1 : im.w,
        h: im.h === undefined ? 1 : im.h,
        rot: im.rot || 0,
      }));
    }
    return p && p.image ? [{ src: p.image, x: 0.5, y: 0.5, w: 1, h: 1, rot: 0 }] : [];
  }

  const IGNORED_FIELDS = ['image', 'src', 'custom'];

  function stableKey(v) {
    if (Array.isArray(v)) return '[' + v.map(stableKey).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(k => k[0] !== '_').sort()
        .map(k => JSON.stringify(k) + ':' + stableKey(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function comparable(p) {
    const q = Object.assign({}, p);
    IGNORED_FIELDS.forEach(k => { delete q[k]; });
    if (Array.isArray(q.images)) {
      q.images = q.images.map(im => {
        const r = Object.assign({}, im);
        delete r.src;
        return r;
      });
    }
    return stableKey(q);
  }

  async function pruneStale(stock, custom) {
    if (!stock.parts || !stock.parts.length) return custom;
    const disk = new Map(stock.parts.map(p => [p.id, p]));
    const kept = [];
    const dropped = [];
    for (const rec of custom) {
      const entry = disk.get(rec.id);
      if (!entry) { kept.push(rec); continue; }
      const stale = rec.pins
        ? comparable(rec) !== comparable(entry)
        : !!rec.archived !== !!entry.archived;
      if (!stale) { kept.push(rec); continue; }
      try { await delCustom(rec.id); dropped.push(rec.id); } catch (err) { kept.push(rec); }
    }
    if (dropped.length) {
      console.info('Cirvo: dropped ' + dropped.length
        + ' browser copy/copies that no longer match parts.json —', dropped.join(', '));
    }
    return kept;
  }

  async function load(force) {
    if (cache && !force) return cache;
    let stock = { parts: [] };
    try {
      stock = await loadStock();
    } catch (err) {
      console.warn('Cirvo: stock library unavailable —', err.message);
    }
    const custom = await pruneStale(stock, await getCustom());
    const customById = new Map(custom.map(p => [p.id, p]));

    const byId = new Map();
    stock.parts.forEach(p => byId.set(p.id, normalise(p, false)));
    custom.forEach(p => {
      if (!p.pins) return;
      byId.set(p.id, normalise(p, true));
    });

    const archivedIds = new Set();
    stock.parts.forEach(p => { if (p.archived) archivedIds.add(p.id); });
    custom.forEach(p => {
      if (p.archived) archivedIds.add(p.id);
      else if ('archived' in p || p.pins) archivedIds.delete(p.id);
    });

    const archived = [...archivedIds].map(id => {
      const best = byId.get(id)
        || (customById.get(id) && customById.get(id).pins && normalise(customById.get(id), true))
        || (stock.parts.find(p => p.id === id) && normalise(stock.parts.find(p => p.id === id), false));

      return best ? Object.assign({}, best, { archived: true }) : { id, name: id, archived: true, pins: [], groups: [] };
    }).sort((a, b) => a.name.localeCompare(b.name));

    archivedIds.forEach(id => byId.delete(id));

    cache = {
      manifest: stock,
      parts: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
      byId,
      archived,
    };
    return cache;
  }

  function normalise(p, custom) {
    const q = Object.assign({ pins: [], groups: [] }, p);
    q.custom = !!custom;
    q.pins = q.pins.map((pin, i) => Object.assign({
      id: 'p' + (i + 1), name: 'P' + (i + 1), x: 0.5, y: 0.5,
      type: 'io', color: typeColor(pin.type),
    }, pin));
    return q;
  }

  function categories(parts) {
    const set = new Set(parts.map(p => p.category || 'Other'));
    return [...set].sort();
  }

  function lcsLen(a, b) {
    const n = a.length, m = b.length;
    let prev = new Uint16Array(m + 1), cur = new Uint16Array(m + 1);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      const t = prev; prev = cur; cur = t;
      cur.fill(0);
    }
    return prev[m];
  }

  function search(parts, q) {
    const s = (q || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return parts;
    const terms = s.split(' ');
    const tight = s.replace(/ /g, '');
    const scored = [];
    parts.forEach(p => {
      const name = (p.name || '').toLowerCase();
      let score = 0;
      if (name.startsWith(s)) score = 100;
      else if (name.includes(s)) score = 70;
      else if (terms.every(t => name.includes(t))) score = 50;
      else if (tight.length >= 3) {
        const flat = name.replace(/[^a-z0-9]/g, '');
        const ratio = lcsLen(tight, flat) / tight.length;
        if (ratio < 0.7) return;

        score = ratio * 30 + (tight.length / Math.max(tight.length, flat.length)) * 12;
      } else return;
      scored.push({ p, score });
    });
    return scored
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
      .map(x => x.p);
  }

  const uid = (p) => (p || 'x') + Math.random().toString(36).slice(2, 9);

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const slug = (s) => String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'part';

  function download(data, filename, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const readFile = (file, as) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (as === 'text') r.readAsText(file); else r.readAsDataURL(file);
  });

  const loadImage = (src) => new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image failed: ' + src.slice(0, 60)));
    im.src = src;
  });

  const THEME_KEY = 'cirvo-theme';

  function theme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {  }
    const icon = document.querySelector('#btn-theme .material-symbols-rounded');
    if (icon) icon.textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
  }

  function initTheme() {
    setTheme(theme());
    const btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));
  }

  const toast = (msg, kind) => {
    if (typeof showNotification === 'function') showNotification(msg, kind);
    else console.log('[' + (kind || 'info') + ']', msg);
  };

  function pinWorld(it, pin, d) {
    const w = d.width * (it.scale || 1), h = d.height * (it.scale || 1);
    let lx = pin.x * w, ly = pin.y * h;
    if (it.flipX) lx = w - lx;
    if (it.flipY) ly = h - ly;
    const dx = lx - w / 2, dy = ly - h / 2;
    const a = (it.rot || 0) * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    return {
      x: it.x + w / 2 + dx * cos - dy * sin,
      y: it.y + h / 2 + dx * sin + dy * cos,
    };
  }

  function contacts(items, byId, tol) {
    tol = tol || 1.2;
    const cell = tol * 2;
    const grid = new Map();
    const out = [];
    items.forEach(it => {
      const d = byId.get(it.partId);
      if (!d) return;
      d.pins.forEach(p => {
        const w = pinWorld(it, p, d);
        const gx = Math.round(w.x / cell), gy = Math.round(w.y / cell);
        const key = it.uid + ':' + p.id;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const bucket = grid.get((gx + i) + ',' + (gy + j));
            if (!bucket) continue;
            for (const q of bucket) {
              if (q.uid === it.uid) continue;
              if (Math.abs(q.x - w.x) <= tol && Math.abs(q.y - w.y) <= tol) out.push([q.key, key]);
            }
          }
        }
        const k = gx + ',' + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push({ x: w.x, y: w.y, uid: it.uid, key });
      });
    });
    return out;
  }

  function buildNets(items, wires, byId) {
    const parent = new Map();
    const find = (k) => {
      if (!parent.has(k)) { parent.set(k, k); return k; }
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; }
      return r;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    items.forEach(it => {
      const def = byId.get(it.partId);
      if (!def) return;
      def.pins.forEach(p => find(it.uid + ':' + p.id));
      (def.groups || []).forEach(g => {
        for (let i = 1; i < g.length; i++) union(it.uid + ':' + g[0], it.uid + ':' + g[i]);
      });
    });
    contacts(items, byId).forEach(([a, b]) => union(a, b));
    wires.forEach(w => union(w.a.item + ':' + w.a.pin, w.b.item + ':' + w.b.pin));
    const nets = new Map();
    parent.forEach((_, k) => {
      const r = find(k);
      if (!nets.has(r)) nets.set(r, []);
      nets.get(r).push(k);
    });
    return { key: (item, pin) => find(item + ':' + pin), nets };
  }

  return {
    PIN_TYPES, WIRE_COLORS, MANIFEST, typeColor,
    load, categories, search, normalise, partImages,
    getCustom, putCustom, delCustom,
    getMeta, setMeta, delMeta,
    uid, esc, slug, download, readFile, loadImage, toast, buildNets, pinWorld, contacts,
    theme, setTheme, initTheme,
  };
})();
