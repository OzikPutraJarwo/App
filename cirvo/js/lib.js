/* ============================================================
   Cirvo — shared part library
   Loaded by both index.html (designer) and admin.html (builder).

   A "part" is artwork + pins:
     { id, name, category, image,
       width, height,                    <- canvas size at 100 % zoom
       pins: [{ id, name, x, y, color, type }],   x/y are 0..1 of the box
       groups: [[pinId, ...], ...]       <- pins wired together inside the part
                                            (breadboard rows, shared GNDs) }

   Stock parts come from parts/parts.json, which tools/generate_parts.py
   writes alongside the PNGs. Parts made in the admin page live in
   IndexedDB (their image is an inlined data URL) until they are exported
   into parts/ and committed — see admin.html › Save to app assets.
   ============================================================ */

const CirvoLib = (() => {
  const DB_NAME = 'cirvo';
  const META_DB = 'cirvo-meta';
  const META_STORE = 'meta';
  // Was briefly 2 mid-development (a since-reverted second store), and that
  // version already reached some browsers. Opening at 1 now throws
  // VersionError outright — "requested version is less than existing" — not
  // just onblocked, since a downgrade isn't a request IndexedDB will queue.
  // Matching the version that leaked is the only way back in for those
  // browsers; a fresh one opening at 2 for the first time is unaffected.
  const DB_VERSION = 2;
  const STORE = 'parts';
  const MANIFEST = 'parts/parts.json';

  // Pin roles. The colour doubles as the default colour of a wire started
  // from that pin, which is why they read like a wiring convention.
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

  // ---------------------------------------------------------- IndexedDB
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
      // another tab still holds an older version open. Rejecting turns this
      // into an empty custom library rather than a page that never loads.
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

  /*
   * Small odds and ends that are not parts — currently the folder handle for
   * writing app assets, which localStorage cannot hold because it is an object,
   * not a string.
   *
   * Deliberately its own database rather than a second store in `cirvo`.
   * Adding a store means bumping the version, and a version upgrade blocks
   * until every other tab on that origin closes its connection — so shipping
   * one would have hung Cirvo, with no error and no message, for anyone who
   * happened to have it open twice. A new database at version 1 upgrades
   * nothing and cannot block anything.
   */
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

  // ------------------------------------------------------------ loading
  let cache = null;

  async function loadStock() {
    const res = await fetch(MANIFEST, { cache: 'no-cache' });
    if (!res.ok) throw new Error('parts.json ' + res.status);
    return res.json();
  }

  /** Stock + custom parts, custom winning on an id clash (an override). */
  async function load(force) {
    if (cache && !force) return cache;
    let stock = { parts: [] };
    try {
      stock = await loadStock();
    } catch (err) {
      console.warn('Cirvo: stock library unavailable —', err.message);
    }
    const custom = await getCustom();
    const byId = new Map();
    stock.parts.forEach(p => byId.set(p.id, normalise(p, false)));
    custom.forEach(p => {
      // a tombstone: archived, with nothing of its own to show. Never written
      // to parts.json, so it costs nothing anywhere but this browser, and the
      // part is back the moment the record is deleted.
      if (p.archived) { byId.delete(p.id); return; }
      byId.set(p.id, normalise(p, true));
    });

    // An entry can also be archived in the file itself, which is how a part
    // whose artwork lives in parts/ is put away without deleting the asset:
    // the entry and its PNG stay exactly where they are, the designer simply
    // stops offering it. Applied after the custom pass so un-archiving a part
    // in this browser still wins over the flag on disk.
    stock.parts.forEach(p => {
      if (p.archived && !custom.some(c => c.id === p.id && !c.archived)) byId.delete(p.id);
    });
    cache = {
      manifest: stock,
      parts: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
      byId,
      // what the designer is not being shown, so the builder can list it
      archived: [
        ...stock.parts.filter(p => p.archived).map(p => normalise(p, false)),
        ...custom.filter(p => p.archived).map(p => ({ id: p.id, name: p.id, archived: true, tombstone: true })),
      ].filter((p, i, all) => all.findIndex(q => q.id === p.id) === i),
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

  /**
   * Search the name, and only the name — that is what people type.
   *
   * Four passes, cheapest first: the whole query as a prefix, as a substring,
   * every word of it as a substring, and finally the longest run of the
   * query's letters that appears *in order* in the name. That last pass is
   * what makes "raspi", "ras" and even "rapsrr" all find a Raspberry Pi.
   *
   * It has to be the longest common subsequence, not a greedy scan: a greedy
   * scan commits to the first 'p' it sees and then cannot find the 's' that
   * came before it, so "rapsrr" — two letters transposed — misses entirely.
   * The LCS is free to skip the transposed letter and still match five of six.
   * Seventy per cent of the query has to land, which is loose enough for a
   * fumbled word and tight enough that "zzqqxx" matches nothing at all.
   */
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
        // fuzzy is the last resort, and never for one or two letters — those
        // would match half the library and drown the exact hits
        const flat = name.replace(/[^a-z0-9]/g, '');
        const ratio = lcsLen(tight, flat) / tight.length;
        if (ratio < 0.7) return;
        // a long name has more letters to match by accident, so also ask how
        // much of the *name* the query accounts for — otherwise "rapsrr" ranks
        // a Capacitive Soil Moisture Sensor above a Raspberry Pi
        score = ratio * 30 + (tight.length / Math.max(tight.length, flat.length)) * 12;
      } else return;
      scored.push({ p, score });
    });
    return scored
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
      .map(x => x.p);
  }

  // ------------------------------------------------------------ helpers
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

  // ---------------------------------------------------------- theme
  const THEME_KEY = 'cirvo-theme';

  function theme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* private mode */ }
    const icon = document.querySelector('#btn-theme .material-symbols-rounded');
    if (icon) icon.textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
  }

  /** Wire the header button; the attribute itself is set inline in <head>. */
  function initTheme() {
    setTheme(theme());
    const btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));
  }

  const toast = (msg, kind) => {
    if (typeof showNotification === 'function') showNotification(msg, kind);
    else console.log('[' + (kind || 'info') + ']', msg);
  };

  /** Where a pin sits on the canvas, once the part is scaled, flipped, turned. */
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

  /**
   * Pins of *different* parts sitting on the same spot are touching, exactly as
   * a leg pushed into a breadboard hole is. Those pairs are as good as a wire,
   * which is why a plugged-in LED lights without anyone drawing one.
   */
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
              if (q.uid === it.uid) continue;      // a part never shorts itself
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

  /** Union-find over pins: internal part groups + touching legs + user wires. */
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
    load, categories, search, normalise,
    getCustom, putCustom, delCustom,
    getMeta, setMeta, delMeta,
    uid, esc, slug, download, readFile, loadImage, toast, buildNets, pinWorld, contacts,
    theme, setTheme, initTheme,
  };
})();
