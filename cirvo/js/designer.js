/* ============================================================
   Cirvo — designer
   Canvas of parts (PNG artwork + pins) joined by wires, exported
   as a PNG. Geometry lives in "world" units: 1 unit = 1 px of the
   part at 100 % zoom; the viewport only translates/scales.
   ============================================================ */

(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const { esc, uid, toast } = CirvoLib;

  const SNAP_PX = 9;          // pin-to-pin snapping radius, world units
  const GRID = 10.16;         // 0.1 in — the pitch every stock part is drawn on
  const HALF = GRID / 2;      // wires may bend on the half-step, between hole rows
  const ATTACH_TOL = 1.2;     // pins this close count as plugged together
  const AUTOSAVE = 'cirvo-project';
  const PREFS = 'cirvo-prefs';

  // Explore = look only · Move = components · Wire = pin to pin *and* reshaping

  // ------------------------------------------------------------- state
  const S = {
    lib: null,
    doc: { name: 'Untitled circuit', items: [], wires: [] },
    view: { x: 0, y: 0, z: 1 },
    objTab: 'items',
    sel: { items: [], wires: [] },
    wiring: null,
    drag: null,
    pinch: null,
    touchId: null,
    hoverSeg: null,
    opts: { grid: true, pins: true, snap: true },
    history: [],
    hIdx: -1,
    nets: null,
    nodes: new Map(),
    images: new Map(),
    cat: 'All',
  };

  const els = {};
  let panels = null;   // set once in boot(); onKey needs it too
  const def = (partId) => S.lib && S.lib.byId.get(partId);
  const item = (u) => S.doc.items.find(i => i.uid === u);
  const wire = (u) => S.doc.wires.find(w => w.uid === u);

  // ------------------------------------------------------- geometry
  function size(it) {
    const d = def(it.partId);
    if (!d) return { w: 60, h: 40 };
    return { w: d.width * it.scale, h: d.height * it.scale };
  }

  function pinWorld(it, pin) {
    const { w, h } = size(it);
    let lx = pin.x * w, ly = pin.y * h;
    if (it.flipX) lx = w - lx;
    if (it.flipY) ly = h - ly;
    const dx = lx - w / 2, dy = ly - h / 2;
    const a = (it.rot || 0) * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    return { x: it.x + w / 2 + dx * cos - dy * sin, y: it.y + h / 2 + dx * sin + dy * cos };
  }

  function pinRefWorld(ref) {
    const it = item(ref.item);
    if (!it) return null;
    const d = def(it.partId);
    const pin = d && d.pins.find(p => p.id === ref.pin);
    return pin ? pinWorld(it, pin) : null;
  }

  /** Axis-aligned bounds of a placed part, rotation included. */
  function itemBounds(it) {
    const { w, h } = size(it);
    const a = (it.rot || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const bw = w * cos + h * sin, bh = w * sin + h * cos;
    return { x: it.x + (w - bw) / 2, y: it.y + (h - bh) / 2, w: bw, h: bh };
  }

  function docBounds(pad) {
    let b = null;
    const grow = (x, y) => {
      if (!b) b = { x1: x, y1: y, x2: x, y2: y };
      else { b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y); b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y); }
    };
    S.doc.items.forEach(it => {
      const r = itemBounds(it);
      grow(r.x, r.y); grow(r.x + r.w, r.y + r.h);
      if (it.label) grow(r.x + r.w / 2, r.y + r.h + 22);
    });
    S.doc.wires.forEach(w => wirePoints(w).forEach(p => grow(p.x, p.y)));
    if (!b) b = { x1: 0, y1: 0, x2: 600, y2: 400 };
    const p = pad || 0;
    return { x: b.x1 - p, y: b.y1 - p, w: b.x2 - b.x1 + p * 2, h: b.y2 - b.y1 + p * 2 };
  }

  const toWorld = (cx, cy) => {
    const r = els.viewport.getBoundingClientRect();
    return { x: (cx - r.left - S.view.x) / S.view.z, y: (cy - r.top - S.view.y) / S.view.z };
  };

  // ------------------------------------------------------ wire paths
  function wirePoints(w) {
    const a = pinRefWorld(w.a), b = pinRefWorld(w.b);
    if (!a || !b) return [];
    return [a, ...(w.points || []), b];
  }

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const snapHalf = (v) => Math.round(v / HALF) * HALF;

  function towards(from, to, r) {
    const d = dist(from, to) || 1;
    return { x: from.x + (to.x - from.x) * r / d, y: from.y + (to.y - from.y) * r / d };
  }

  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (dist(out[out.length - 1], pts[i]) > 0.4) out.push(pts[i]);
    }
    return out.length > 1 ? out : pts;
  }

  /** Axis-aligned polyline with softened corners. */
  function pathD(pts) {
    if (!pts || pts.length < 2) return '';
    const p = dedupe(pts);
    let d = `M${r2(p[0].x)} ${r2(p[0].y)}`;
    for (let i = 1; i < p.length - 1; i++) {
      const cur = p[i];
      const r = Math.min(3.0, dist(p[i - 1], cur) / 2, dist(cur, p[i + 1]) / 2);
      const a = towards(cur, p[i - 1], r), b = towards(cur, p[i + 1], r);
      d += ` L${r2(a.x)} ${r2(a.y)} Q${r2(cur.x)} ${r2(cur.y)} ${r2(b.x)} ${r2(b.y)}`;
    }
    const last = p[p.length - 1];
    return d + ` L${r2(last.x)} ${r2(last.y)}`;
  }

  /**
   * Wires run wherever they are drawn.
   *
   * They used to be forced onto the 0.1 in lattice, auto-routed into
   * axis-aligned dog-legs and squared back up after every move. That is right
   * for a schematic and wrong for this: on a board a jumper goes where it goes,
   * and the tidying that matters is the tidying you do yourself. So a new wire
   * is a straight line between two pins, and shape comes from bends you add —
   * click anywhere on a run to fold a corner in there and drag it.
   *
   * `alignToNeighbours` is what keeps that from looking sloppy: a bend dragged
   * within a few px of level with the point before or after it snaps flat, so
   * runs come out square when you want them square without ever being forced
   * to be. Alt places one exactly where the cursor is.
   */
  const ALIGN_TOL = 5;

  function alignToNeighbours(p, prev, next) {
    const out = { x: p.x, y: p.y };
    let sx = null, sy = null;
    [prev, next].forEach(q => {
      if (!q) return;
      if (sy === null && Math.abs(q.y - p.y) <= ALIGN_TOL) sy = q.y;
      if (sx === null && Math.abs(q.x - p.x) <= ALIGN_TOL) sx = q.x;
    });
    if (sx !== null) out.x = sx;
    if (sy !== null) out.y = sy;
    return out;
  }

  const lastWiringPoint = () => {
    if (!S.wiring) return null;
    const pts = S.wiring.points;
    return pts.length ? pts[pts.length - 1] : pinRefWorld(S.wiring.from);
  };

  /** A new wire is simply a straight run: no waypoints until you add one. */
  function routeWire() { return []; }

  const reroute = (w) => { w.points = []; };

  /** The drawn runs of a wire, with the index a new bend would be spliced at. */
  function segments(w) {
    const pts = wirePoints(w);
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (dist(a, b) < 1.2) continue;
      out.push({ i, a, b });
    }
    return out;
  }

  /** Drop bends that sit on a neighbour, or on the straight line through them. */
  function simplifyWire(w) {
    const P = wirePoints(w);
    if (P.length < 3) return;
    const keep = [];
    for (let i = 1; i < P.length - 1; i++) {
      const prev = keep.length ? keep[keep.length - 1] : P[0];
      const cur = P[i], next = P[i + 1];
      if (dist(prev, cur) < 1.2) continue;
      const cross = Math.abs((cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x));
      const span = dist(prev, next) || 1;
      if (cross / span < 0.6) continue;       // collinear: the corner does nothing
      keep.push(cur);
    }
    w.points = keep;
  }

  const r2 = (n) => Math.round(n * 100) / 100;

  // ---------------------------------------------------------- history
  const snapshot = () => JSON.stringify({ name: S.doc.name, items: S.doc.items, wires: S.doc.wires });

  function commit() {
    if (typeof CirvoSim !== 'undefined') CirvoSim.invalidate();
    const snap = snapshot();
    if (S.history[S.hIdx] === snap) return;
    S.history.length = S.hIdx + 1;
    S.history.push(snap);
    if (S.history.length > 60) S.history.shift();
    S.hIdx = S.history.length - 1;
    autosave();
    updateDock();
  }

  function restore(snap) {
    const d = JSON.parse(snap);
    S.doc.name = d.name;
    S.doc.items = d.items;
    S.doc.wires = d.wires;
    S.sel = { items: [], wires: [] };
    S.nets = null;
    if (typeof CirvoSim !== 'undefined') CirvoSim.invalidate();
    renderAll();
    autosave();
    updateDock();
  }

  const undo = () => { if (S.hIdx > 0) restore(S.history[--S.hIdx]); };
  const redo = () => { if (S.hIdx < S.history.length - 1) restore(S.history[++S.hIdx]); };

  let saveTimer;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE, snapshot()); } catch (e) { /* quota — fine */ }
    }, 400);
  }

  const savePrefs = () => {
    try { localStorage.setItem(PREFS, JSON.stringify(S.opts)); } catch (e) { /* private mode */ }
  };

  // ------------------------------------------------------------ nets
  function nets() {
    if (!S.nets) S.nets = CirvoLib.buildNets(S.doc.items, S.doc.wires, S.lib.byId);
    return S.nets;
  }

  const netKey = (itemUid, pinId) => nets().key(itemUid, pinId);

  function netCount() {
    const used = new Set();
    S.doc.wires.forEach(w => { used.add(netKey(w.a.item, w.a.pin)); });
    return used.size;
  }

  // ------------------------------------------------------- rendering
  function renderAll() {
    S._pinPaintDone = false;
    renderItems();
    renderWires();
    renderInspector();
    els.blank.classList.toggle('hide', S.doc.items.length > 0);
  }

  function renderItems() {
    const seen = new Set();
    S.doc.items.forEach((it, i) => {
      seen.add(it.uid);
      let node = S.nodes.get(it.uid);
      if (!node) {
        node = buildItem(it);
        S.nodes.set(it.uid, node);
        els.items.appendChild(node);
      }
      if (node.dataset.order !== String(i)) {
        node.dataset.order = String(i);
        node.style.zIndex = String(i + 1);
      }
      placeItem(it, node);
    });
    S.nodes.forEach((node, u) => {
      if (!seen.has(u)) { node.remove(); S.nodes.delete(u); }
    });
    paintPinStates(S._hotNet, true);
  }

  function buildItem(it) {
    const d = def(it.partId);
    const node = document.createElement('div');
    node.className = 'cv-item';
    node.dataset.uid = it.uid;
    if (!d) {
      node.innerHTML = `<div style="width:100%;height:100%;display:grid;place-items:center;
        background:#fff;border:2px dashed indianred;border-radius:6px;color:indianred;
        font-size:11px;font-weight:700">missing part<br>${esc(it.partId)}</div><div class="item-frame"></div>`;
      return node;
    }
    const img = document.createElement('img');
    img.src = d.image;
    img.alt = d.name;
    img.draggable = false;
    node.appendChild(img);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pins');
    svg.setAttribute('viewBox', `0 0 ${d.width} ${d.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    d.pins.forEach(p => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (p.x * d.width).toFixed(2));
      c.setAttribute('cy', (p.y * d.height).toFixed(2));
      c.setAttribute('r', p.size || (p.type === 'hole' ? 3 : 3.6));
      c.setAttribute('fill', p.color);
      c.setAttribute('class', 'pin-dot');
      c.dataset.pin = p.id;
      svg.appendChild(c);
    });
    node.appendChild(svg);

    const frame = document.createElement('div');
    frame.className = 'item-frame';
    node.appendChild(frame);

    if (d.viz && d.viz.body && (d.props || []).some(p => p.id === 'colour')) {
      const tint = document.createElement('div');
      tint.className = 'body-tint';
      Object.assign(tint.style, circleBox(d.viz.body, d));
      node.appendChild(tint);
    }

    const sim = document.createElement('div');
    sim.className = 'sim';
    node.appendChild(sim);

    if (d.controls && d.controls.length) {
      const wrap = document.createElement('div');
      wrap.className = 'ctrls';
      d.controls.forEach(c => {
        const el = document.createElement('div');
        el.className = 'sim-ctrl';
        el.dataset.cid = c.id;
        el.dataset.kind = c.kind;
        Object.assign(el.style, circleBox(c, d));
        wrap.appendChild(el);
      });
      node.appendChild(wrap);
    }

    const tag = document.createElement('div');
    tag.className = 'item-tag';
    node.appendChild(tag);
    return node;
  }

  /** The value of a per-instance setting, falling back to the part's default. */
  function propValue(d, it, id) {
    const spec = (d.props || []).find(p => p.id === id);
    if (!spec) return null;
    const v = it.props && it.props[id];
    return v === undefined || v === null ? spec.default : v;
  }

  /** The hex a select-with-swatches option carries, e.g. an LED's colour. */
  function propHex(d, it, id) {
    const spec = (d.props || []).find(p => p.id === id);
    if (!spec || !spec.options) return null;
    const v = propValue(d, it, id);
    const hit = spec.options.find(o => o[0] === v) || spec.options[0];
    return hit && hit[2];
  }

  /**
   * Overlay geometry. Everything a part declares (controls, glows, screens) is
   * normalised to its box, and the box is sized in world px — so percentages
   * here follow the part through scaling and the canvas zoom for free.
   */
  function circleBox(c, d) {
    const wpc = c.r * 2 * 100;
    return {
      left: (c.x * 100) + '%',
      top: (c.y * 100) + '%',
      width: wpc + '%',
      height: (c.r * 2 * d.width / d.height * 100) + '%',
      transform: 'translate(-50%, -50%)',
    };
  }

  function placeItem(it, node) {
    node = node || S.nodes.get(it.uid);
    if (!node) return;
    const { w, h } = size(it);
    node.style.left = it.x + 'px';
    node.style.top = it.y + 'px';
    node.style.width = w + 'px';
    node.style.height = h + 'px';
    node.style.transform = `rotate(${it.rot || 0}deg) scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})`;
    node.classList.toggle('sel', S.sel.items.includes(it.uid));
    node.classList.toggle('locked', !!it.locked);
    const tint = node.querySelector('.body-tint');
    if (tint) {
      const d = def(it.partId);
      const hex = propHex(d, it, 'colour') || '#ff4d4d';
      tint.style.background =
        `radial-gradient(circle at 34% 28%, rgba(255,255,255,.9) 0%, ${hex} 42%, ${hex} 100%)`;
      tint.style.boxShadow = `inset 0 0 0 1px rgba(0,0,0,.18)`;
    }
    const tag = node.querySelector('.item-tag');
    if (tag) {
      tag.textContent = it.label || '';
      tag.style.display = it.label ? '' : 'none';
      // keep the label upright no matter how the part is turned
      tag.style.transform = `translateX(-50%) rotate(${-(it.rot || 0)}deg) scale(${it.flipX ? -1 : 1}, ${it.flipY ? -1 : 1})`;
    }
  }

  /** Mark pins that carry a wire, plus the net currently hovered. */
  function paintPinStates(hotNet, force) {
    if (!force && S._hotNet === (hotNet || null) && S._pinPaintDone) return;
    S._hotNet = hotNet || null;
    S._pinPaintDone = true;
    const used = new Set();
    S.doc.wires.forEach(w => {
      used.add(w.a.item + ':' + w.a.pin);
      used.add(w.b.item + ':' + w.b.pin);
    });
    S.nodes.forEach((node, u) => {
      const it = item(u);
      if (!it) return;
      $$('.pin-dot', node).forEach(c => {
        const key = u + ':' + c.dataset.pin;
        c.classList.toggle('used', used.has(key));
        c.classList.toggle('hot', !!hotNet && netKey(u, c.dataset.pin) === hotNet);
      });
    });
  }

  function renderWires() {
    const svg = els.wires;
    svg.innerHTML = '';
    const off = 50000;                       // the svg is shifted so negatives work
    const g0 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g0.setAttribute('transform', `translate(${off} ${off})`);
    svg.appendChild(g0);

    S.doc.wires.forEach(w => {
      const pts = wirePoints(w);
      if (pts.length < 2) return;
      const d = pathD(pts);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.uid = w.uid;
      if (S.sel.wires.includes(w.uid)) g.classList.add('sel');

      const halo = mkPath(d, 'wire-halo');
      halo.setAttribute('stroke-width', (w.width || 2) + 5);
      g.appendChild(halo);

      const line = mkPath(d, 'wire');
      line.setAttribute('stroke', w.color || '#e5484d');
      line.setAttribute('stroke-width', w.width || 2);
      g.appendChild(line);

      [pts[0], pts[pts.length - 1]].forEach(p => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', r2(p.x)); c.setAttribute('cy', r2(p.y));
        c.setAttribute('r', (w.width || 2) * 0.62 + 0.7);
        c.setAttribute('fill', w.color || '#e5484d');
        g.appendChild(c);
      });

      // one grabbable strip per run — clicking it folds a bend in there
      segments(w).forEach(seg => {
        const hit = mkPath(`M${r2(seg.a.x)} ${r2(seg.a.y)} L${r2(seg.b.x)} ${r2(seg.b.y)}`, 'wire-hit');
        hit.dataset.uid = w.uid;
        hit.dataset.seg = String(seg.i);
        g.appendChild(hit);
      });

      // the bends themselves, grabbable whenever the wire is hovered or selected
      const showBends = (S.hoverSeg && S.hoverSeg.uid === w.uid) || S.sel.wires.includes(w.uid);
      (w.points || []).forEach((p, i) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', r2(p.x)); c.setAttribute('cy', r2(p.y));
        c.setAttribute('r', 3.2);
        c.setAttribute('class', 'seg-handle' + (showBends ? ' on' : ''));
        c.dataset.uid = w.uid;
        c.dataset.idx = String(i);
        g.appendChild(c);
      });
      g0.appendChild(g);
    });

    if (S.wiring) {
      const from = pinRefWorld(S.wiring.from);
      if (from) {
        const target = S.wiring.cursor || from;
        const pts = [from, ...S.wiring.points, target];
        const p = mkPath(pathD(pts), 'wire');
        p.setAttribute('stroke', S.wiring.color);
        p.setAttribute('stroke-width', 2);
        p.setAttribute('stroke-dasharray', '6 4');
        p.setAttribute('opacity', '.9');
        g0.appendChild(p);
      }
    }
  }

  function mkPath(d, cls) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  }

  function applyView() {
    els.world.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.z})`;
    els.dZoom.textContent = Math.round(S.view.z * 100) + '%';
    // the background dots are the real 0.1 in lattice, so they have to track the
    // zoom; double the step whenever they would crowd closer than 9 screen px
    let step = GRID;
    while (step * S.view.z < 9) step *= 2;
    const px = step * S.view.z;
    els.viewport.style.backgroundSize = `${px}px ${px}px`;
    els.viewport.style.backgroundPosition = `${S.view.x - px / 2}px ${S.view.y - px / 2}px`;
  }

  function updateDock() {
    els.dUndo.disabled = S.hIdx <= 0;
    els.dRedo.disabled = S.hIdx >= S.history.length - 1;
    els.dGrid.classList.toggle('on', S.opts.grid);
    els.dPins.classList.toggle('on', !!S.opts.pins);
    els.dSnap.classList.toggle('on', S.opts.snap);
    if (els.dTheme) els.dTheme.classList.toggle('on', CirvoLib.theme() === 'dark');
    els.viewport.classList.toggle('grid-off', !S.opts.grid);
    els.viewport.classList.toggle('show-pins', !!S.opts.pins);
  }

  // ==================================================== live simulation
  const SIM_ROWS = { oled: 6, character: 2, graphic: 6, tft: 12 };
  const SIM_COLS = { oled: 21, character: 16, graphic: 14, tft: 40 };

  function applySim(st) {
    els.viewport.classList.toggle('sim-running', !!st.running);
    S.doc.items.forEach(it => {
      const node = S.nodes.get(it.uid);
      if (!node) return;
      const d = def(it.partId);
      if (!d) return;
      const state = st.items[it.uid] || {};
      const board = st.boards[it.uid];

      // controls show their own position back to the user
      $$('.sim-ctrl', node).forEach(el => {
        const c = (d.controls || []).find(x => x.id === el.dataset.cid);
        if (!c) return;
        if (c.kind === 'power') el.classList.toggle('on', !!(board && board.on));
        else if (c.kind === 'toggle') el.classList.toggle('on', !!state.toggled);
        else if (c.kind === 'momentary') el.classList.toggle('down', !!state.pressed);
      });

      const sim = node.querySelector('.sim');
      if (!sim) return;
      const key = JSON.stringify(state) + '|' + (board ? board.on : '');
      if (sim.dataset.key === key) return;
      sim.dataset.key = key;
      sim.innerHTML = '';
      paintSim(sim, it, d, state, board);
    });
  }

  function paintSim(sim, it, d, state, board) {
    const viz = d.viz || {};
    const add = (cls, box, style) => {
      const el = document.createElement('div');
      el.className = cls;
      Object.assign(el.style, box, style || {});
      sim.appendChild(el);
      return el;
    };

    // the little light that says a board has power. Its colour, size and
    // position all come from the part's own anchor, so the builder can move it.
    if (board && board.on && viz.power_led) {
      const a = viz.power_led;
      const col = a.colour || '#54e08a';
      add('sim-glow', circleBox({ x: a.x, y: a.y, r: a.r * 2.6 }, d),
        { background: `radial-gradient(circle, ${col} 0%, ${col} 40%, transparent 72%)`, opacity: 1 });
    }

    if (state.glow && viz.glow) {
      const g = state.glow;
      // the running device wins (an RGB LED, a user-picked LED colour); the
      // anchor's own colour is the fallback for a light with a fixed lens
      const col = g.rgb ? `rgb(${g.rgb.join(',')})`
        : (propHex(d, it, 'colour') || COLOUR[g.colour] || g.colour || viz.glow.colour || '#ff4d4d');
      add('sim-glow', circleBox({ x: viz.glow.x, y: viz.glow.y, r: viz.glow.r * 2.4 }, d),
        {
          background: `radial-gradient(circle, ${col} 0%, ${col} 22%, transparent 68%)`,
          opacity: String(0.25 + 0.75 * g.level),
        });
    }

    if (state.leds && viz.leds) {
      state.leds.forEach((c, i) => {
        const a = viz.leds[i];
        if (!a || (c[0] + c[1] + c[2]) < 6) return;
        add('sim-glow', circleBox({ x: a.x, y: a.y, r: a.r * 2.6 }, d), {
          background: `radial-gradient(circle, rgb(${c.join(',')}) 0%, rgb(${c.join(',')}) 26%, transparent 70%)`,
          opacity: '1',
        });
      });
    }

    if (state.sound && viz.sound) {
      [0, 0.35].forEach(delay => {
        add('sim-wave', circleBox({ x: viz.sound.x, y: viz.sound.y, r: viz.sound.r }, d),
          { animationDelay: delay + 's' });
      });
    }

    if (state.spin && viz.spin) {
      const speed = Math.min(1, Math.abs(state.spin));
      add('sim-spin', circleBox({ x: viz.spin.x, y: viz.spin.y, r: viz.spin.r }, d), {
        animationDuration: (1.4 - speed * 1.2).toFixed(2) + 's',
        animationDirection: state.spin < 0 ? 'reverse' : 'normal',
      });
    }

    if (state.horn !== undefined && viz.horn) {
      add('sim-horn', circleBox({ x: viz.horn.x, y: viz.horn.y, r: viz.horn.r }, d),
        { transform: `translate(-50%, -50%) rotate(${state.horn - 90}deg)` });
    }
    if (state.angle !== undefined && viz.spin) {
      add('sim-horn', circleBox({ x: viz.spin.x, y: viz.spin.y, r: viz.spin.r * 0.7 }, d),
        { transform: `translate(-50%, -50%) rotate(${state.angle}deg)` });
    }

    if (state.screen && d.screens && d.screens[0]) paintScreen(sim, it, d, state.screen);
  }

  const COLOUR = { red: '#ff4d4d', green: '#3ce87a', blue: '#4d9dff', yellow: '#ffd24d', white: '#ffffff' };

  function propRow(pr, d, it) {
    const cur = propValue(d, it, pr.id);
    if (pr.kind === 'select' && pr.options && pr.options[0].length > 2) {
      return `<div class="f-row">
        <label>${esc(pr.label)} — ${esc((pr.options.find(o => o[0] === cur) || pr.options[0])[1])}</label>
        <div class="swatches">${pr.options.map(o => `
          <button type="button" class="swatch${o[0] === cur ? ' active' : ''}" data-prop="${esc(pr.id)}"
                  data-v="${esc(o[0])}" style="background:${esc(o[2])}"></button>`).join('')}
        </div></div>`;
    }
    if (pr.kind === 'select') {
      return `<div class="f-row"><label>${esc(pr.label)}</label>
        <select data-prop="${esc(pr.id)}">${pr.options.map(o =>
        `<option value="${esc(o[0])}"${o[0] === cur ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
    }
    return `<div class="f-row"><label>${esc(pr.label)}${pr.unit ? ' (' + esc(pr.unit) + ')' : ''}</label>
      <input type="${pr.kind === 'number' ? 'number' : 'text'}" data-prop="${esc(pr.id)}"
             value="${esc(cur === null ? '' : cur)}"></div>`;
  }

  function paintScreen(sim, it, d, scr) {
    const s0 = d.screens[0];
    const box = {
      left: (s0.x * 100) + '%', top: (s0.y * 100) + '%',
      width: (s0.w * 100) + '%', height: (s0.h * 100) + '%',
    };
    const hpx = s0.h * d.height * it.scale;

    if (s0.kind === 'matrix') {
      const n = s0.px_w || 8;
      const el = document.createElement('div');
      el.className = 'sim-matrix';
      Object.assign(el.style, box, {
        gridTemplateColumns: `repeat(${n}, 1fr)`,
        gridTemplateRows: `repeat(${s0.px_h || n}, 1fr)`,
        gap: (hpx * 0.02) + 'px',
        padding: (hpx * 0.02) + 'px',
        background: s0.paper || '#17181c',
      });
      const on = new Set(scr.pixels || []);
      for (let y = 0; y < (s0.px_h || n); y++) {
        for (let x = 0; x < n; x++) {
          const dot = document.createElement('i');
          dot.style.background = on.has(x + ',' + y) ? (s0.ink || '#ff4d4d') : 'rgba(255,255,255,.06)';
          el.appendChild(dot);
        }
      }
      sim.appendChild(el);
      return;
    }

    const el = document.createElement('div');
    el.className = 'sim-screen' + (s0.kind === 'seg' ? ' seg' : '');
    const rows = s0.rows || SIM_ROWS[s0.kind] || 4;
    const cols = s0.cols || SIM_COLS[s0.kind] || 20;
    const wpx = s0.w * d.width * it.scale;
    // fit both ways: a 16x2 LCD is limited by its columns, a tall OLED by rows
    const size = Math.min(hpx / rows * 0.8, wpx / (cols * 0.62));
    Object.assign(el.style, box, {
      color: s0.ink || '#7fd6ff',
      // opaque: the artwork has its own placeholder text printed underneath
      background: s0.paper || '#0d0f13',
      fontSize: size.toFixed(2) + 'px',
      padding: (hpx * 0.05).toFixed(2) + 'px',
    });
    if (s0.kind === 'seg') {
      el.textContent = scr.text || (scr.lines[0] || '');
      el.style.fontSize = (hpx * 0.62).toFixed(2) + 'px';
    } else {
      el.textContent = (scr.lines || []).slice(0, rows)
        .map(l => String(l).slice(0, cols)).join('\n');
    }
    sim.appendChild(el);
  }

  // ------------------------------------------------------ mutations
  function addItem(partId, wx, wy, silent) {
    const d = def(partId);
    if (!d) return null;
    const it = {
      uid: uid('i'),
      partId,
      x: Math.round(wx - d.width / 2),
      y: Math.round(wy - d.height / 2),
      scale: 1, rot: 0, flipX: false, flipY: false,
      label: '', locked: false,
    };
    S.doc.items.push(it);
    S.nets = null;
    select([it.uid], []);
    renderAll();
    if (!silent) commit();
    return it;
  }

  function removeSelection() {
    if (!S.sel.items.length && !S.sel.wires.length) return;
    const kill = new Set(S.sel.items);
    S.doc.items = S.doc.items.filter(i => !kill.has(i.uid));
    S.doc.wires = S.doc.wires.filter(w =>
      !S.sel.wires.includes(w.uid) && !kill.has(w.a.item) && !kill.has(w.b.item));
    select([], []);
    S.nets = null;
    renderAll();
    commit();
  }

  function duplicateSelection() {
    if (!S.sel.items.length) return;
    const map = new Map();
    const copies = S.sel.items.map(u => {
      const src = item(u);
      const c = Object.assign({}, src, { uid: uid('i'), x: src.x + 24, y: src.y + 24 });
      map.set(u, c.uid);
      S.doc.items.push(c);
      return c.uid;
    });
    // wires whose two ends were both copied come along
    S.doc.wires.slice().forEach(w => {
      if (map.has(w.a.item) && map.has(w.b.item)) {
        S.doc.wires.push({
          uid: uid('w'), color: w.color, width: w.width, style: w.style,
          a: { item: map.get(w.a.item), pin: w.a.pin },
          b: { item: map.get(w.b.item), pin: w.b.pin },
          points: (w.points || []).map(p => ({ x: p.x + 24, y: p.y + 24 })),
        });
      }
    });
    S.nets = null;
    select(copies, []);
    renderAll();
    commit();
  }

  function connect(a, b) {
    if (a.item === b.item && a.pin === b.pin) return false;
    const dup = S.doc.wires.some(w =>
      (w.a.item === a.item && w.a.pin === a.pin && w.b.item === b.item && w.b.pin === b.pin) ||
      (w.a.item === b.item && w.a.pin === b.pin && w.b.item === a.item && w.b.pin === a.pin));
    if (dup) { toast('These pins are already wired', 'info'); return false; }
    const it = item(a.item);
    const d = def(it.partId);
    const pin = d.pins.find(p => p.id === a.pin);
    const w = {
      uid: uid('w'),
      a: { item: a.item, pin: a.pin },
      b: { item: b.item, pin: b.pin },
      color: S.wiring && S.wiring.color ? S.wiring.color : (pin ? pin.color : '#e5484d'),
      width: 2,
      points: S.wiring && S.wiring.points.length ? S.wiring.points.slice() : null,
    };
    // no hand-placed bends: lay it out on the lattice, on a lane nothing else uses
    if (!w.points) w.points = [];
    S.doc.wires.push(w);
    S.nets = null;
    return true;
  }

  function select(items, wires) {
    S.sel = { items: items || [], wires: wires || [] };
    S.nodes.forEach((n, u) => n.classList.toggle('sel', S.sel.items.includes(u)));
    if ((items || []).length || (wires || []).length) {
      const insp = $('#panel-insp');
      if (insp && insp.classList.contains('collapsed')) $('#panel-insp-toggle').click();
    }
    renderWires();
    renderInspector();
    updateDock();
  }

  /**
   * Turn parts, taking whatever is plugged into them along for the ride.
   *
   * `pinWorld()` swings a pin around its item's own centre by `it.rot`, so
   * rotating a breadboard moves every hole it has — while a plugged-in LED,
   * whose own x/y never changed, is left behind at the old position and stops
   * touching. `attachedSet()` already solves exactly this for dragging; the
   * only reason rotation broke was that no rotate path ever called it.
   *
   * Every rotate goes through here for that reason: the keyboard, the
   * inspector's rotate buttons and its rotation field all used to turn parts
   * their own separate way, and fixing one left the others detaching parts.
   *
   * Each directly-selected item still turns in place about its own centre —
   * its own attachedSet seeds with zero offset from its own pivot, so it
   * never moves — while anything riding on it revolves around that same
   * centre. Per-leader pivots, not one shared centroid: selecting two
   * unrelated parts and rotating still spins each where it stands.
   */
  function rotateItems(uids, deg) {
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const processed = new Set();
    const touched = new Set();

    uids.forEach(uid => {
      const leader = item(uid);
      if (!leader || leader.locked || processed.has(uid)) return;
      const { w: lw, h: lh } = size(leader);
      const px = leader.x + lw / 2, py = leader.y + lh / 2;

      [...attachedSet([uid])].map(item).filter(Boolean).forEach(it => {
        if (it.locked || processed.has(it.uid)) return;
        processed.add(it.uid);
        touched.add(it.uid);
        const { w, h } = size(it);
        const dx = (it.x + w / 2) - px, dy = (it.y + h / 2) - py;
        it.x = px + dx * cos - dy * sin - w / 2;
        it.y = py + dx * sin + dy * cos - h / 2;
        it.rot = (it.rot || 0) + deg;
      });
    });
    if (!touched.size) return;
    S.nets = null;
    renderItems(); renderWires(); renderInspector(); commit();
  }

  function setItem(uids, patch) {
    uids.forEach(u => {
      const it = item(u);
      if (it) Object.assign(it, patch);
    });
    S.nets = null;
    renderItems();
    renderWires();
    commit();
  }

  // -------------------------------------------------------- wiring
  function startWire(ref, clickMode) {
    const it = item(ref.item);
    const d = def(it.partId);
    const pin = d.pins.find(p => p.id === ref.pin);
    S.wiring = {
      from: ref, points: [], color: pin ? pin.color : '#e5484d',
      clickMode: !!clickMode, cursor: pinWorld(it, pin),
    };
    paintPinStates(netKey(ref.item, ref.pin));
  }

  function endWire(ref) {
    if (!S.wiring) return;
    if (ref && connect(S.wiring.from, ref)) {
      cancelWire();
      renderAll();
      commit();
      return;
    }
    cancelWire();
    renderWires();
  }

  function cancelWire() {
    S.wiring = null;
    paintPinStates();
  }

  // -------------------------------------------------- pin snapping
  function snapIndex(exclude) {
    const cell = SNAP_PX * 2;
    const grid = new Map();
    S.doc.items.forEach(it => {
      if (exclude.has(it.uid)) return;
      const d = def(it.partId);
      if (!d) return;
      d.pins.forEach(p => {
        const w = pinWorld(it, p);
        const k = Math.floor(w.x / cell) + ',' + Math.floor(w.y / cell);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(w);
      });
    });
    return { grid, cell };
  }

  /** Best (dx,dy) that lands one of the moving pins on a stationary one. */
  function snapOffset(movingPins, idx) {
    let best = null;
    movingPins.forEach(p => {
      const gx = Math.floor(p.x / idx.cell), gy = Math.floor(p.y / idx.cell);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const bucket = idx.grid.get((gx + a) + ',' + (gy + b));
          if (!bucket) continue;
          for (const t of bucket) {
            const dx = t.x - p.x, dy = t.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= SNAP_PX && (!best || dist < best.dist)) best = { dx, dy, dist };
          }
        }
      }
    });
    return best;
  }

  // ------------------------------------------------- palette (left)
  // A native <select> cannot carry an icon per option, so the category picker
  // and the inspector's list switcher share this small custom control.
  const CAT_ICON = {
    'All': 'apps',
    'Single-board computer': 'developer_board',
    'Microcontroller board': 'memory',
    'Prototyping': 'grid_on',
    'IC': 'device_hub',
    'Semiconductor': 'polyline',
    'Passive': 'linear_scale',
    'Sensor': 'sensors',
    'Display': 'monitor',
    'Output': 'lightbulb',
    'Input': 'touch_app',
    'Actuator': 'toys',
    'Power': 'bolt',
    'Module': 'widgets',
  };
  const catIcon = (c) => CAT_ICON[c] || 'category';

  function mountSelect(el, opts, value, onChange) {
    if (!el) return;
    const cur = opts.find(o => o.value === value) || opts[0];
    if (!cur) return;
    el.innerHTML = `
      <button type="button" class="csel-btn">
        <span class="material-symbols-rounded">${cur.icon}</span>
        <span class="lbl">${esc(cur.label)}</span>
        <span class="material-symbols-rounded caret">expand_more</span>
      </button>
      <div class="csel-menu">${opts.map(o => `
        <button type="button" class="csel-opt${o.value === cur.value ? ' active' : ''}"
                data-v="${esc(o.value)}">
          <span class="material-symbols-rounded">${o.icon}</span>${esc(o.label)}
          ${o.n != null ? `<span class="n">${o.n}</span>` : ''}
        </button>`).join('')}</div>`;
    $('.csel-btn', el).addEventListener('click', e => {
      e.stopPropagation();
      const open = el.classList.contains('open');
      $$('.csel.open').forEach(x => x.classList.remove('open'));
      if (!open) el.classList.add('open');
    });
    $$('.csel-opt', el).forEach(b => b.addEventListener('click', () => {
      el.classList.remove('open');
      onChange(b.dataset.v);
    }));
  }

  function renderCats() {
    const counts = new Map();
    S.lib.parts.forEach(p => {
      const c = p.category || 'Other';
      counts.set(c, (counts.get(c) || 0) + 1);
    });
    const opts = [{ value: 'All', label: 'All components', icon: 'apps', n: S.lib.parts.length }]
      .concat(CirvoLib.categories(S.lib.parts).map(c => ({
        value: c, label: c, icon: catIcon(c), n: counts.get(c),
      })));
    if (!opts.some(o => o.value === S.cat)) S.cat = 'All';
    mountSelect($('#cat-select'), opts, S.cat, v => {
      S.cat = v;
      renderCats();
      renderPalette();
    });
  }

  function renderPalette() {
    const q = els.search.value.trim();
    // the category is the scope: searching looks inside whatever is selected
    let list = S.cat === 'All' ? S.lib.parts
      : S.lib.parts.filter(p => (p.category || 'Other') === S.cat);
    if (q) list = CirvoLib.search(list, q);
    els.list.innerHTML = list.length ? list.map(p => `
      <button type="button" class="part-card" data-part="${esc(p.id)}" draggable="true">
        <span class="part-thumb"><img src="${esc(p.image)}" alt="" loading="lazy"></span>
        <span class="part-meta">
          <span class="part-name">${esc(p.name)}</span>
        </span>
      </button>`).join('')
      : `<div class="cv-empty">Nothing matches ${q ? '“' + esc(q) + '”' : 'this category'}.<br><br>
         <a href="./admin.html">Build the component yourself →</a></div>`;
  }

  function wireObjList(list) {
    if (!list) return;
    let dragUid = null;
    $$('.obj-row', list).forEach(row => {
      row.addEventListener('click', () => {
        if (row.dataset.kind === 'items') select([row.dataset.uid], []);
        else select([], [row.dataset.uid]);
      });
      row.addEventListener('dragstart', e => {
        dragUid = row.dataset.uid;
        row.classList.add('drag');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragUid);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('drag');
        $$('.obj-row.over', list).forEach(r => r.classList.remove('over'));
      });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('over'); });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('over');
        const arr = row.dataset.kind === 'items' ? S.doc.items : S.doc.wires;
        const from = arr.findIndex(x => x.uid === dragUid);
        const to = +row.dataset.i;
        if (from < 0 || from === to) return;
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        renderItems();
        renderWires();
        renderInspector();
        commit();
      });
    });
  }

  // ---------------------------------------------- inspector (right)
  function renderInspector() {
    const body = els.inspBody;
    const nI = S.sel.items.length, nW = S.sel.wires.length;
    els.inspHead.textContent = nI + nW === 0 ? 'Project' : nI === 1 && !nW ? 'Component' : nW === 1 && !nI ? 'Wire' : 'Selection';

    if (nW === 1 && !nI) return renderWireInspector(wire(S.sel.wires[0]));
    if (nI === 1 && !nW) return renderItemInspector(item(S.sel.items[0]));
    if (nI + nW > 1) return renderMultiInspector();

    const tab = S.objTab;
    // top of the list is the front of the canvas, so it reads the way the
    // stacking looks rather than the way the array happens to be ordered
    const rows = tab === 'items' ? S.doc.items.map((it, i) => {
      const d = def(it.partId);
      return `<div class="obj-row${S.sel.items.includes(it.uid) ? ' sel' : ''}"
                   draggable="true" data-kind="items" data-uid="${esc(it.uid)}" data-i="${i}">
        <span class="material-symbols-rounded grip">drag_indicator</span>
        <img class="thumb" src="${esc(d ? d.image : '')}" alt="">
        <span class="nm">${esc(it.label || (d ? d.name : it.partId))}</span>
        <span class="sub">${d ? d.pins.length : 0}p</span>
      </div>`;
    }) : S.doc.wires.map((w, i) => {
      const nm = ['a', 'b'].map(k => {
        const it = item(w[k].item);
        const d = it && def(it.partId);
        const p = d && d.pins.find(x => x.id === w[k].pin);
        return p ? p.name : '?';
      });
      return `<div class="obj-row${S.sel.wires.includes(w.uid) ? ' sel' : ''}"
                   draggable="true" data-kind="wires" data-uid="${esc(w.uid)}" data-i="${i}">
        <span class="material-symbols-rounded grip">drag_indicator</span>
        <span class="swatch-dot" style="background:${esc(w.color || '#e5484d')}"></span>
        <span class="nm">${esc(nm[0])} → ${esc(nm[1])}</span>
      </div>`;
    });

    body.innerHTML = `
      <div class="insp-sec">
        <div class="f-row">
          <label>Project name</label>
          <input type="text" id="p-name" value="${esc(S.doc.name)}" placeholder="Untitled circuit">
        </div>
        <div class="stat-row">
          <div class="stat"><b>${S.doc.items.length}</b><span>Parts</span></div>
          <div class="stat"><b>${S.doc.wires.length}</b><span>Wires</span></div>
          <div class="stat"><b>${netCount()}</b><span>Nets</span></div>
        </div>
      </div>
      <div class="insp-sec">
        <div class="csel" id="obj-select"></div>
        <div class="obj-list" id="obj-list" style="margin-top:.5rem">
          ${rows.slice().reverse().join('') || '<div class="f-hint">Nothing here yet.</div>'}
        </div>
        <div class="f-hint" style="margin-top:.5rem">Top of the list is the front of the canvas.</div>
      </div>`;

    mountSelect($('#obj-select', body), [
      { value: 'items', label: 'Components', icon: 'developer_board', n: S.doc.items.length },
      { value: 'wires', label: 'Wires', icon: 'cable', n: S.doc.wires.length },
    ], S.objTab, v => { S.objTab = v; renderInspector(); });

    wireObjList($('#obj-list', body));
    $('#p-name', body).addEventListener('input', e => { S.doc.name = e.target.value; autosave(); });
  }

  function renderItemInspector(it) {
    if (!it) return;
    const d = def(it.partId) || { name: it.partId, pins: [], category: '—' };
    const wired = new Map();
    S.doc.wires.forEach(w => {
      [['a', 'b'], ['b', 'a']].forEach(([k, o]) => {
        if (w[k].item === it.uid) {
          const other = item(w[o].item);
          const od = other && def(other.partId);
          const op = od && od.pins.find(p => p.id === w[o].pin);
          wired.set(w[k].pin, (other && (other.label || (od ? od.name : '?'))) + ' · ' + (op ? op.name : '?'));
        }
      });
    });

    els.inspBody.innerHTML = `
      <div class="insp-sec">
        <div class="f-row"><label>Label</label>
          <input type="text" id="i-label" value="${esc(it.label || '')}" placeholder="${esc(d.name)}"></div>
        <div class="f-hint">${esc(d.name)} · ${esc(d.category || 'Other')} · ${d.pins.length} pins</div>
      </div>

      ${(d.props || []).length ? `
      <div class="insp-sec">
        <div class="insp-title">Settings</div>
        ${d.props.map(pr => propRow(pr, d, it)).join('')}
      </div>` : ''}

      <div class="insp-sec">
        <div class="insp-title">Transform</div>
        <div class="f-grid">
          <div class="f-row"><label>X</label><input type="number" id="i-x" value="${Math.round(it.x)}"></div>
          <div class="f-row"><label>Y</label><input type="number" id="i-y" value="${Math.round(it.y)}"></div>
        </div>
        <div class="f-grid">
          <div class="f-row"><label>Size %</label><input type="number" id="i-scale" min="10" max="400" step="5" value="${Math.round(it.scale * 100)}"></div>
          <div class="f-row"><label>Rotation °</label><input type="number" id="i-rot" step="15" value="${Math.round(it.rot || 0)}"></div>
        </div>
        <div class="btn-row">
          <button type="button" class="mini-btn" data-act="rot-l"><span class="material-symbols-rounded">rotate_left</span></button>
          <button type="button" class="mini-btn" data-act="rot-r"><span class="material-symbols-rounded">rotate_right</span></button>
          <button type="button" class="mini-btn${it.flipX ? ' active' : ''}" data-act="flip-x"><span class="material-symbols-rounded">flip</span></button>
          <button type="button" class="mini-btn${it.flipY ? ' active' : ''}" data-act="flip-y"><span class="material-symbols-rounded" style="transform:rotate(90deg)">flip</span></button>
        </div>
      </div>

      <div class="insp-sec">
        <div class="insp-title">Arrange</div>
        <div class="btn-row">
          <button type="button" class="mini-btn" data-act="front"><span class="material-symbols-rounded">flip_to_front</span>Front</button>
          <button type="button" class="mini-btn" data-act="back"><span class="material-symbols-rounded">flip_to_back</span>Back</button>
        </div>
        <div class="btn-row" style="margin-top:.4rem">
          <button type="button" class="mini-btn" data-act="lock"><span class="material-symbols-rounded">${it.locked ? 'lock' : 'lock_open'}</span>${it.locked ? 'Locked' : 'Lock'}</button>
          <button type="button" class="mini-btn" data-act="dup"><span class="material-symbols-rounded">content_copy</span>Copy</button>
          <button type="button" class="mini-btn danger" data-act="del"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>

      <div class="insp-sec">
        <div class="insp-title">Pins (${d.pins.length})</div>
        ${d.pins.length > 120
        ? `<div class="f-hint">${d.pins.length} tie points — too many to list. Hover a hole on the
             canvas to see its name and the net it belongs to.</div>`
        : d.pins.map(p => `
          <div class="pin-line${wired.has(p.id) ? ' wired' : ''}" data-pin="${esc(p.id)}">
            <span class="dot" style="background:${esc(p.color)}"></span>
            <span class="nm">${esc(p.name)}</span>
            <span class="to">${wired.has(p.id) ? esc(wired.get(p.id)) : '—'}</span>
          </div>`).join('')}
      </div>`;

    const b = els.inspBody;
    $$('[data-prop]', b).forEach(el => {
      const id = el.dataset.prop;
      const set = (v) => {
        it.props = Object.assign({}, it.props, { [id]: v });
        S.nets = null;
        renderItems();
        renderInspector();
        commit();
      };
      if (el.classList.contains('swatch')) el.addEventListener('click', () => set(el.dataset.v));
      else el.addEventListener('change', () => set(el.value));
    });

    const num = (id, key, f) => {
      const el = $('#' + id, b);
      el.addEventListener('change', () => {
        const v = parseFloat(el.value);
        if (!isNaN(v)) setItem([it.uid], { [key]: f ? f(v) : v });
      });
    };
    $('#i-label', b).addEventListener('input', e => {
      it.label = e.target.value; placeItem(it); autosave();
    });
    $('#i-label', b).addEventListener('change', commit);
    num('i-x', 'x'); num('i-y', 'y');
    num('i-scale', 'scale', v => Math.max(0.1, Math.min(4, v / 100)));
    // typing an angle is still a rotation, so it goes through rotateItems()
    // as a delta — setting `rot` directly would leave anything plugged in
    // behind, which is the whole bug this function exists to stop
    $('#i-rot', b).addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) rotateItems([it.uid], v - (it.rot || 0));
    });

    $$('[data-act]', b).forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.act;
      if (a === 'rot-l') rotateItems([it.uid], -90);
      if (a === 'rot-r') rotateItems([it.uid], 90);
      if (a === 'flip-x') setItem([it.uid], { flipX: !it.flipX });
      if (a === 'flip-y') setItem([it.uid], { flipY: !it.flipY });
      if (a === 'lock') setItem([it.uid], { locked: !it.locked });
      if (a === 'dup') duplicateSelection();
      if (a === 'del') removeSelection();
      if (a === 'front' || a === 'back') {
        S.doc.items = S.doc.items.filter(i => i.uid !== it.uid);
        if (a === 'front') S.doc.items.push(it); else S.doc.items.unshift(it);
        renderItems(); commit();
      }
      renderInspector();
    }));

    $$('.pin-line', b).forEach(line => {
      line.addEventListener('mouseenter', () => paintPinStates(netKey(it.uid, line.dataset.pin)));
      line.addEventListener('mouseleave', () => paintPinStates());
    });
  }

  function renderWireInspector(w) {
    if (!w) return;
    const ends = ['a', 'b'].map(k => {
      const it = item(w[k].item);
      const d = it && def(it.partId);
      const p = d && d.pins.find(x => x.id === w[k].pin);
      return `${esc(it ? (it.label || d.name) : '?')} · <b>${esc(p ? p.name : '?')}</b>`;
    });

    els.inspBody.innerHTML = `
      <div class="insp-sec">
        <div class="f-hint">${ends[0]}<br><span class="material-symbols-rounded"
          style="font-size:1rem;color:var(--accent)">arrow_downward</span><br>${ends[1]}</div>
      </div>
      <div class="insp-sec">
        <div class="insp-title">Colour</div>
        <div class="color-row">
          <input type="color" id="w-color" value="${esc(w.color || '#e5484d')}">
          <input type="text" id="w-hex" value="${esc((w.color || '#e5484d').toUpperCase())}"
                 spellcheck="false" maxlength="7">
        </div>
      </div>
      <div class="insp-sec">
        <div class="insp-title">Shape</div>
        <div class="f-row"><label>Thickness</label>
          <input type="range" id="w-width" min="1" max="6" step="0.5" value="${w.width || 2}"></div>
        <div class="btn-row">
          <button type="button" class="mini-btn" id="w-route"><span class="material-symbols-rounded">alt_route</span>Re-route</button>
          <button type="button" class="mini-btn danger" id="w-del"><span class="material-symbols-rounded">delete</span></button>
        </div>
        <div class="f-hint" style="margin-top:.5rem">${(w.points || []).length} bend point(s).
          Hover a run with the <b>Wire</b> tool for its three handles — the middle one slides
          the run, the outer two fold a corner in at its midpoint. Hold <kbd>Alt</kbd> to place
          a run off-grid. <b>Re-route</b> lays the whole wire out again on a free lane.</div>
      </div>`;

    const b = els.inspBody;
    const setW = (patch) => { Object.assign(w, patch); renderWires(); renderInspector(); commit(); };
    const col = $('#w-color', b), hex = $('#w-hex', b);
    col.addEventListener('input', e => { hex.value = e.target.value.toUpperCase(); w.color = e.target.value; renderWires(); });
    col.addEventListener('change', commit);
    hex.addEventListener('change', e => {
      const v = e.target.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) setW({ color: v.toLowerCase() });
      else e.target.value = (w.color || '').toUpperCase();
    });
    $('#w-width', b).addEventListener('input', e => { w.width = parseFloat(e.target.value); renderWires(); });
    $('#w-width', b).addEventListener('change', commit);
    $('#w-route', b).addEventListener('click', () => { reroute(w); renderWires(); renderInspector(); commit(); });
    $('#w-del', b).addEventListener('click', removeSelection);
  }

  function renderMultiInspector() {
    els.inspBody.innerHTML = `
      <div class="insp-sec">
        <div class="stat-row">
          <div class="stat"><b>${S.sel.items.length}</b><span>Parts</span></div>
          <div class="stat"><b>${S.sel.wires.length}</b><span>Wires</span></div>
        </div>
      </div>
      <div class="insp-sec">
        <div class="insp-title">Align</div>
        <div class="btn-row">
          ${[['left', 'align_horizontal_left'], ['center', 'align_horizontal_center'], ['right', 'align_horizontal_right'],
        ['top', 'align_vertical_top'], ['middle', 'align_vertical_center'], ['bottom', 'align_vertical_bottom']]
        .map(([a, i]) => `<button type="button" class="mini-btn" data-align="${a}"><span class="material-symbols-rounded">${i}</span></button>`).join('')}
        </div>
      </div>
      <div class="insp-sec">
        <div class="btn-row">
          <button type="button" class="mini-btn" id="m-dup"><span class="material-symbols-rounded">content_copy</span>Duplicate</button>
          <button type="button" class="mini-btn danger" id="m-del"><span class="material-symbols-rounded">delete</span>Delete</button>
        </div>
      </div>`;
    const b = els.inspBody;
    $$('[data-align]', b).forEach(btn => btn.addEventListener('click', () => {
      const its = S.sel.items.map(item).filter(Boolean);
      if (its.length < 2) return;
      const rs = its.map(itemBounds);
      const a = btn.dataset.align;
      const minX = Math.min(...rs.map(r => r.x)), maxX = Math.max(...rs.map(r => r.x + r.w));
      const minY = Math.min(...rs.map(r => r.y)), maxY = Math.max(...rs.map(r => r.y + r.h));
      its.forEach((it, i) => {
        const r = rs[i];
        if (a === 'left') it.x += minX - r.x;
        if (a === 'right') it.x += maxX - (r.x + r.w);
        if (a === 'center') it.x += (minX + maxX) / 2 - (r.x + r.w / 2);
        if (a === 'top') it.y += minY - r.y;
        if (a === 'bottom') it.y += maxY - (r.y + r.h);
        if (a === 'middle') it.y += (minY + maxY) / 2 - (r.y + r.h / 2);
      });
      renderItems(); renderWires(); commit();
    }));
    $('#m-dup', b).addEventListener('click', duplicateSelection);
    $('#m-del', b).addEventListener('click', removeSelection);
  }

  // ------------------------------------------------- pointer input
  function pinRefFrom(target) {
    const c = target && target.closest && target.closest('.pin-dot');
    if (!c) return null;
    const node = c.closest('.cv-item');
    return node ? { item: node.dataset.uid, pin: c.dataset.pin } : null;
  }

  /* The viewport captures the pointer while dragging, which retargets every
     later event to the viewport itself — so anything that needs to know what
     is *under* the cursor has to hit-test by coordinate, not by e.target.
     elementsFromPoint (plural) also lets pins win over the wire layer painted
     above them: a run lying across a row of holes must never block a hole. */
  function hitAt(e) {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    let pin = null, seg = null, handle = null;
    for (const el of stack) {
      if (!handle && el.classList && el.classList.contains('seg-handle')) handle = el;
      if (!pin && el.classList && el.classList.contains('pin-dot')) pin = el;
      if (!seg && el.classList && el.classList.contains('wire-hit')) seg = el;
      if (el.id === 'viewport') break;
    }
    return { pin: pinRefFrom(pin), seg, handle };
  }

  const pinAt = (e) => hitAt(e).pin;

  /**
   * One pointer, no modes.
   *
   * There used to be an Explore / Move / Wire switch, and every gesture was
   * gated on which one was active — which meant the answer to "why can't I
   * drag this" was always "you are in the wrong mode". What the pointer is
   * over already says what it should do, so that is what decides:
   *
   *   right-drag (or middle)      pan, from anywhere, over anything
   *   left on a pin              start / finish a wire
   *   left on a wire             bend it at that point, and drag the bend
   *   left on a part's body      move it (with anything plugged into it)
   *   left on empty canvas       marquee-select parts and wires
   *
   * Pins beat wires in the hit test (see hitAt) so a run lying across a row
   * of holes never blocks the hole underneath, and a part's body is only
   * whatever is left after those two — which is why the pin and wire hit
   * areas are kept tight rather than generous.
   */
  function onPointerDown(e) {
    if (e.target.closest('.cv-mobile-tabs')) return;
    closePanels();

    // right or middle button pans, whatever is underneath
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      els.viewport.setPointerCapture(e.pointerId);
      S.drag = { mode: 'pan', x0: e.clientX, y0: e.clientY, vx: S.view.x, vy: S.view.y };
      els.viewport.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;

    // A second finger is the start of a pinch, never a gesture of its own.
    // Chrome fires its pointerdown *before* touchstart, so without this the
    // second finger landed on empty canvas and started a marquee — throwing
    // away the move drag the first finger was in the middle of, along with
    // the original positions needed to put the part back.
    if (e.pointerType === 'touch') {
      if (S.touchId !== null) return;
      S.touchId = e.pointerId;
    }
    if (S.pinch) return;

    // --- something on a part you can actually press or turn
    const ctrl = e.target.closest('.sim-ctrl');
    if (ctrl) {
      const node = ctrl.closest('.cv-item');
      const uid = node.dataset.uid, cid = ctrl.dataset.cid, kind = ctrl.dataset.kind;
      els.viewport.setPointerCapture(e.pointerId);
      if (kind === 'knob' || kind === 'stick') {
        S.drag = {
          mode: 'knob', uid, cid, kind, x0: e.clientX, y0: e.clientY,
          vx: CirvoSim.getControl(uid, kind === 'stick' ? 'stick_x' : cid, 0.5),
          vy: CirvoSim.getControl(uid, 'stick_y', 0.5),
        };
      } else {
        CirvoSim.press(uid, cid, true);
        S.drag = { mode: 'ctrl', uid, cid };
      }
      return;
    }

    const hit = hitAt(e);

    // --- a wire being drawn: a pin ends it, empty canvas drops a corner
    if (S.wiring) {
      els.viewport.setPointerCapture(e.pointerId);
      if (hit.pin) { endWire(hit.pin); return; }
      const p = toWorld(e.clientX, e.clientY);
      S.wiring.points.push(alignToNeighbours(p, lastWiringPoint(), null));
      renderWires();
      return;
    }

    // --- an existing bend: drag it
    if (hit.handle) {
      const w = wire(hit.handle.dataset.uid);
      if (w) {
        select([], [w.uid]);
        els.viewport.setPointerCapture(e.pointerId);
        S.drag = { mode: 'bend', wire: w, idx: +hit.handle.dataset.idx, moved: false };
        renderWires();
        return;
      }
    }

    // --- the body of a wire: fold a new bend in right where it was clicked
    if (hit.seg && !hit.pin) {
      const w = wire(hit.seg.dataset.uid);
      if (w) {
        const i = +hit.seg.dataset.seg;
        const p = toWorld(e.clientX, e.clientY);
        const pts = (w.points || []).map(q => ({ x: q.x, y: q.y }));
        pts.splice(i, 0, { x: p.x, y: p.y });
        w.points = pts;
        select([], [w.uid]);
        els.viewport.setPointerCapture(e.pointerId);
        S.drag = { mode: 'bend', wire: w, idx: i, moved: false, fresh: true };
        renderWires();
        return;
      }
    }

    // --- a pin: starts a wire
    if (hit.pin) {
      e.preventDefault();
      els.viewport.setPointerCapture(e.pointerId);
      startWire(hit.pin, false);
      S.drag = { mode: 'wire', x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }

    const node = e.target.closest && e.target.closest('.cv-item');
    els.viewport.setPointerCapture(e.pointerId);

    // --- a part's body: move it, and the whole selection if it is part of one
    if (node) {
      const it = item(node.dataset.uid);
      if (it) {
        const add = e.shiftKey || e.ctrlKey || e.metaKey;
        let sel = S.sel.items.slice();
        if (add) sel = sel.includes(it.uid) ? sel.filter(u => u !== it.uid) : sel.concat(it.uid);
        // Already in the selection: keep the whole thing. Clicking one part of
        // a marquee'd group moves the group — picking a single member out of it
        // means clearing the selection first, which is what clicking away does.
        else if (!sel.includes(it.uid)) sel = [it.uid];
        select(sel, add ? S.sel.wires : (sel.includes(it.uid) && S.sel.items.includes(it.uid) ? S.sel.wires : []));
        if (!it.locked) { startMove(e); return; }
      }
    }

    // --- empty canvas: drag a box over whatever you want
    if (!node) {
      S.drag = {
        mode: 'marquee', x0: e.clientX, y0: e.clientY, moved: false,
        box: mkMarquee(), add: e.shiftKey || e.ctrlKey || e.metaKey,
        base: { items: S.sel.items.slice(), wires: S.sel.wires.slice() },
      };
    }
  }

  /**
   * Anything plugged into what is being dragged rides along: a part counts as
   * plugged in when its pins land on the pins of a bigger part (an MCP3008 in a
   * breadboard, not the other way round). Dragging the small part on its own
   * still pulls it out, because nothing bigger ever follows it.
   */
  function attachedSet(seed) {
    const set = new Set(seed);
    let grew = true;
    while (grew) {
      grew = false;
      const hosts = [...set].map(item).filter(Boolean);
      for (const cand of S.doc.items) {
        if (set.has(cand.uid) || cand.locked) continue;
        const cd = def(cand.partId);
        if (!cd || !cd.pins.length) continue;
        for (const host of hosts) {
          const hd = def(host.partId);
          if (!hd || cd.pins.length >= hd.pins.length) continue;
          if (pinsTouch(cand, cd, host, hd)) { set.add(cand.uid); grew = true; break; }
        }
      }
    }
    return set;
  }

  function pinsTouch(a, ad, b, bd) {
    const cell = ATTACH_TOL * 2;
    const grid = new Map();
    bd.pins.forEach(p => {
      const w = pinWorld(b, p);
      const k = Math.round(w.x / cell) + ',' + Math.round(w.y / cell);
      (grid.get(k) || grid.set(k, []).get(k)).push(w);
    });
    for (const p of ad.pins) {
      const w = pinWorld(a, p);
      const gx = Math.round(w.x / cell), gy = Math.round(w.y / cell);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const bucket = grid.get((gx + i) + ',' + (gy + j));
          if (!bucket) continue;
          for (const q of bucket) {
            if (Math.abs(q.x - w.x) <= ATTACH_TOL && Math.abs(q.y - w.y) <= ATTACH_TOL) return true;
          }
        }
      }
    }
    return false;
  }

  function startMove(e) {
    const seedSet = attachedSet(S.sel.items);
    const moving = [...seedSet].map(item).filter(i => i && !i.locked);
    const movingIds = new Set(moving.map(i => i.uid));
    S.drag = {
      mode: 'move',
      start: toWorld(e.clientX, e.clientY),
      moved: false,
      origins: moving.map(i => ({ it: i, x: i.x, y: i.y })),
      // a wire with both ends on the moving group keeps its shape
      wires: S.doc.wires
        .filter(w => movingIds.has(w.a.item) && movingIds.has(w.b.item))
        .map(w => ({ w, pts: (w.points || []).map(p => ({ x: p.x, y: p.y })) })),
      snapIdx: S.opts.snap ? snapIndex(movingIds) : null,
      pins: S.opts.snap ? movingPins(moving) : null,
      movingIds,
    };
  }

  function movingPins(items) {
    const out = [];
    items.forEach(it => {
      const d = def(it.partId);
      if (d) d.pins.forEach(p => out.push({ it, p }));
    });
    return out;
  }

  /**
   * Everything the box touches — parts by their bounds, wires by any of their
   * points or the midpoint of any run, so a long wire crossing the box counts
   * even when both of its ends are outside it.
   */
  function applyMarquee(d, e) {
    const a = toWorld(Math.min(d.x0, e.clientX), Math.min(d.y0, e.clientY));
    const b = toWorld(Math.max(d.x0, e.clientX), Math.max(d.y0, e.clientY));
    const inBox = (p) => p && p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y;

    const items = S.doc.items.filter(it => {
      const bb = itemBounds(it);
      return bb.x < b.x && bb.x + bb.w > a.x && bb.y < b.y && bb.y + bb.h > a.y;
    }).map(it => it.uid);

    const wires = S.doc.wires.filter(w => {
      const pts = wirePoints(w);
      if (pts.some(inBox)) return true;
      for (let i = 0; i < pts.length - 1; i++) {
        if (inBox({ x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 })) return true;
      }
      return false;
    }).map(w => w.uid);

    if (d.add) {
      select([...new Set([...d.base.items, ...items])], [...new Set([...d.base.wires, ...wires])]);
    } else {
      select(items, wires);
    }
  }

  function mkMarquee() {
    const b = document.createElement('div');
    b.className = 'cv-marquee';
    els.viewport.appendChild(b);
    return b;
  }

  function onPointerMove(e) {
    const d = S.drag;

    if (S.wiring) {
      const p = toWorld(e.clientX, e.clientY);
      // free to follow the cursor, but level with the last corner when close,
      // and snapped hard onto a pin when there is one under the pointer
      S.wiring.cursor = e.altKey ? p : alignToNeighbours(p, lastWiringPoint(), null);
      const ref = pinAt(e);
      if (ref) {
        const w = pinRefWorld(ref);
        if (w) S.wiring.cursor = w;
      }
      renderWires();
    }

    if (!d) {
      const hit = hitAt(e);
      if (hit.pin) showTip(e, hit.pin); else hideTip();
      // the wire under the pointer shows its bends, and where a new one would go
      const seg = !hit.pin && (hit.seg || hit.handle)
        ? { uid: (hit.handle || hit.seg).dataset.uid } : null;
      const same = (a, b) => (!a && !b) || (a && b && a.uid === b.uid);
      if (!same(seg, S.hoverSeg)) { S.hoverSeg = seg; renderWires(); }
      return;
    }
    if (d.mode === 'wire') {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) d.moved = true;
      return;
    }

    if (d.mode === 'pan') {
      S.view.x = d.vx + (e.clientX - d.x0);
      S.view.y = d.vy + (e.clientY - d.y0);
      applyView();
      return;
    }

    if (d.mode === 'marquee') {
      const x = Math.min(d.x0, e.clientX), y = Math.min(d.y0, e.clientY);
      const r = els.viewport.getBoundingClientRect();
      d.box.style.left = (x - r.left) + 'px';
      d.box.style.top = (y - r.top) + 'px';
      d.box.style.width = Math.abs(e.clientX - d.x0) + 'px';
      d.box.style.height = Math.abs(e.clientY - d.y0) + 'px';
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 3) d.moved = true;
      applyMarquee(d, e);                      // highlight as it is dragged
      return;
    }

    if (d.mode === 'knob') {
      const clamp01 = v => Math.max(0, Math.min(1, v));
      if (d.kind === 'stick') {
        CirvoSim.setControl(d.uid, 'stick_x', clamp01(d.vx + (e.clientX - d.x0) / 120));
        CirvoSim.setControl(d.uid, 'stick_y', clamp01(d.vy + (e.clientY - d.y0) / 120));
      } else {
        CirvoSim.setControl(d.uid, d.cid, clamp01(d.vx + (d.y0 - e.clientY) / 150));
      }
      return;
    }

    if (d.mode === 'ctrl') return;

    if (d.mode === 'bend') {
      const p = toWorld(e.clientX, e.clientY);
      const pts = wirePoints(d.wire);          // [pinA, ...bends, pinB]
      const prev = pts[d.idx], next = pts[d.idx + 2];
      d.wire.points[d.idx] = e.altKey ? p : alignToNeighbours(p, prev, next);
      d.moved = true;
      renderWires();
      return;
    }

    if (d.mode === 'move') {
      const now = toWorld(e.clientX, e.clientY);
      let dx = now.x - d.start.x, dy = now.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      d.origins.forEach(o => { o.it.x = o.x + dx; o.it.y = o.y + dy; });

      if (d.snapIdx && !e.altKey) {
        const off = snapOffset(d.pins.map(({ it, p }) => pinWorld(it, p)), d.snapIdx);
        if (off) { dx += off.dx; dy += off.dy; }
        else if (S.opts.grid && d.origins.length) {
          // nothing to plug into: fall back to the 0.1 in grid so rows stay tidy
          const first = d.origins[0];
          dx += Math.round(first.it.x / GRID) * GRID - first.it.x;
          dy += Math.round(first.it.y / GRID) * GRID - first.it.y;
        }
        d.origins.forEach(o => { o.it.x = o.x + dx; o.it.y = o.y + dy; });
      }
      d.wires.forEach(({ w, pts }) => {
        w.points = pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
      });
      d.origins.forEach(o => placeItem(o.it));
      renderWires();
      }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch' && S.touchId === e.pointerId) S.touchId = null;
    const d = S.drag;
    S.drag = null;
    els.viewport.classList.remove('panning');

    if (d && d.mode === 'marquee') {
      d.box.remove();
      // a click on empty canvas, rather than a box: let go of everything
      if (!d.moved) { select([], []); return; }
      applyMarquee(d, e);
      return;
    }

    if (d && d.mode === 'wire') {
      const ref = pinAt(e);
      if (d.moved) {
        if (ref) endWire(ref);
        else { cancelWire(); renderWires(); }
      } else if (S.wiring) {
        S.wiring.clickMode = true;          // a plain click: keep wiring on clicks
      }
      return;
    }

    if (d && d.mode === 'ctrl') { CirvoSim.press(d.uid, d.cid, false); return; }
    if (d && d.mode === 'knob') return;

    if (d && d.mode === 'bend') {
      // a bend folded in but never dragged is just a click on the wire —
      // simplifyWire drops it again rather than leaving a dead point behind
      simplifyWire(d.wire);
      renderWires();
      renderInspector();
      if (d.moved || d.fresh) commit();
    }
    if (d && d.mode === 'move' && d.moved) {
      renderWires();
      S.nets = null;
      commit();
    }
  }

  function showTip(e, ref) {
    const it = item(ref.item);
    const d = def(it.partId);
    const pin = d.pins.find(p => p.id === ref.pin);
    if (!pin) return hideTip();
    const r = els.viewport.getBoundingClientRect();
    els.tip.innerHTML = `${esc(pin.name)}<small>${esc(it.label || d.name)}</small>`;
    els.tip.style.left = (e.clientX - r.left) + 'px';
    els.tip.style.top = (e.clientY - r.top) + 'px';
    els.tip.style.display = 'block';
    paintPinStates(netKey(ref.item, ref.pin));
  }

  function hideTip() {
    if (els.tip.style.display !== 'none') {
      els.tip.style.display = 'none';
      if (!S.wiring) paintPinStates();
    }
  }

  /* ---------------------------------------------------------- touch
     Two fingers pinch to zoom and drag to pan — the only way to get around
     the canvas on a phone, where there is no wheel and no right button.
     Tracked here rather than through pointer events because a pinch has to
     cancel whatever the first finger had already started: without that, the
     canvas moves a part and zooms at the same time. */
  function touchMid(t) {
    return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
  }
  const touchGap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  function onTouchStart(e) {
    if (e.touches.length !== 2) return;
    const t = [e.touches[0], e.touches[1]];
    // whatever one finger had begun is abandoned, and anything it changed
    // along the way is put back, so a pinch never leaves a part displaced
    const d = S.drag;
    if (d && d.mode === 'move') d.origins.forEach(o => { o.it.x = o.x; o.it.y = o.y; placeItem(o.it); });
    if (d && d.mode === 'marquee') d.box.remove();
    S.drag = null;
    if (S.wiring) { cancelWire(); renderWires(); }
    const r = els.viewport.getBoundingClientRect();
    const m = touchMid(t);
    S.pinch = { gap: touchGap(t), z: S.view.z, cx: m.x - r.left, cy: m.y - r.top, mx: m.x, my: m.y };
    els.viewport.classList.add('panning');
  }

  function onTouchMove(e) {
    if (!S.pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const t = [e.touches[0], e.touches[1]];
    const m = touchMid(t);
    // pan by however far the midpoint travelled, then zoom about it
    S.view.x += m.x - S.pinch.mx;
    S.view.y += m.y - S.pinch.my;
    S.pinch.mx = m.x; S.pinch.my = m.y;
    const r = els.viewport.getBoundingClientRect();
    zoomAt(m.x - r.left, m.y - r.top, S.pinch.z * (touchGap(t) / (S.pinch.gap || 1)));
  }

  function onTouchEnd(e) {
    if (e.touches.length >= 2) return;
    if (S.pinch) els.viewport.classList.remove('panning');
    S.pinch = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const r = els.viewport.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    zoomAt(cx, cy, S.view.z * factor);
  }

  function zoomAt(cx, cy, z) {
    z = Math.max(0.12, Math.min(6, z));
    const wx = (cx - S.view.x) / S.view.z, wy = (cy - S.view.y) / S.view.z;
    S.view.z = z;
    S.view.x = cx - wx * z;
    S.view.y = cy - wy * z;
    applyView();
  }

  function zoomBy(f) {
    const r = els.viewport.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, S.view.z * f);
  }

  function fit() {
    const r = els.viewport.getBoundingClientRect();
    const b = docBounds(60);
    const z = Math.max(0.12, Math.min(2.5, Math.min(r.width / b.w, r.height / b.h)));
    S.view.z = z;
    S.view.x = (r.width - b.w * z) / 2 - b.x * z;
    S.view.y = (r.height - b.h * z) / 2 - b.y * z;
    applyView();
  }

  // -------------------------------------------------------- export
  async function imageFor(d) {
    if (S.images.has(d.id)) return S.images.get(d.id);
    const im = await CirvoLib.loadImage(d.image);
    S.images.set(d.id, im);
    return im;
  }

  async function exportPNG(opts) {
    const b = docBounds(opts.pad);
    const sc = opts.scale;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(b.w * sc));
    cv.height = Math.max(1, Math.round(b.h * sc));
    const ctx = cv.getContext('2d');
    if (opts.bg !== 'transparent') {
      ctx.fillStyle = opts.bg === 'dark' ? '#23212f' : '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.setTransform(sc, 0, 0, sc, -b.x * sc, -b.y * sc);

    for (const it of S.doc.items) {
      const d = def(it.partId);
      if (!d) continue;
      const im = await imageFor(d);
      const { w, h } = size(it);
      ctx.save();
      ctx.translate(it.x + w / 2, it.y + h / 2);
      ctx.rotate((it.rot || 0) * Math.PI / 180);
      ctx.scale(it.flipX ? -1 : 1, it.flipY ? -1 : 1);
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      const hex = propHex(d, it, 'colour');
      if (hex && d.viz && d.viz.body) {
        const b = d.viz.body;
        ctx.beginPath();
        ctx.arc((b.x - 0.5) * w, (b.y - 0.5) * h, b.r * w, 0, Math.PI * 2);
        ctx.fillStyle = hex;
        ctx.fill();
      }
      ctx.restore();
    }

    if (opts.pins) {
      const used = new Set();
      S.doc.wires.forEach(w => {
        used.add(w.a.item + ':' + w.a.pin);
        used.add(w.b.item + ':' + w.b.pin);
      });
      S.doc.items.forEach(it => {
        const d = def(it.partId);
        if (!d) return;
        d.pins.forEach(p => {
          if (opts.pins === 'used' && !used.has(it.uid + ':' + p.id)) return;
          if (p.type === 'hole' && opts.pins !== 'all') return;
          const w = pinWorld(it, p);
          ctx.beginPath();
          ctx.arc(w.x, w.y, (p.size || 3.4) * it.scale, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = 'rgba(255,255,255,.85)';
          ctx.stroke();
        });
      });
    }

    S.doc.wires.forEach(w => {
      const pts = wirePoints(w);
      if (pts.length < 2) return;
      const path = new Path2D(pathD(pts));
      ctx.strokeStyle = w.color || '#e5484d';
      ctx.lineWidth = w.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      [pts[0], pts[pts.length - 1]].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (w.width || 2) * 0.62 + 0.7, 0, Math.PI * 2);
        ctx.fillStyle = w.color || '#e5484d';
        ctx.fill();
      });
    });

    if (opts.labels) {
      ctx.font = '600 13px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      S.doc.items.forEach(it => {
        if (!it.label) return;
        const bb = itemBounds(it);
        const x = bb.x + bb.w / 2, y = bb.y + bb.h + 6;
        const tw = ctx.measureText(it.label).width;
        ctx.fillStyle = opts.bg === 'dark' ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.88)';
        roundRect(ctx, x - tw / 2 - 6, y - 2, tw + 12, 19, 9);
        ctx.fill();
        ctx.fillStyle = '#353353';
        ctx.fillText(it.label, x, y + 1);
      });
    }

    if (opts.title && S.doc.name) {
      ctx.setTransform(sc, 0, 0, sc, -b.x * sc, -b.y * sc);
      ctx.font = '600 20px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = opts.bg === 'dark' ? '#e8e8f2' : '#353353';
      ctx.fillText(S.doc.name, b.x + 12, b.y + 8);
    }

    return new Promise((resolve, reject) => {
      try {
        cv.toBlob(bl => bl ? resolve(bl) : reject(new Error('toBlob failed')), 'image/png');
      } catch (err) { reject(err); }
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------- dialogs
  function dialog(title, html, actions) {
    els.popupWrap.innerHTML = `
      <div class="popup-title">${title}</div>
      <div class="popup-content">${html}</div>
      <div class="popup-action">${actions.map((a, i) =>
      `<div class="popup-btn${a.ghost ? ' ghost' : ''}" data-i="${i}"
             style="${a.ghost ? 'background:var(--surface-2);color:var(--ink)' : ''}">${a.label}</div>`).join('')}</div>`;
    $$('.popup-btn', els.popupWrap).forEach(btn => btn.addEventListener('click', () => {
      const a = actions[+btn.dataset.i];
      if (!a.keep) popupClose(btn);
      if (a.run) a.run();
    }));
    popupShow('#popup');
  }

  function exportDialog() {
    dialog('Export PNG', `
      <div class="f-grid">
        <div class="f-row"><label>Resolution</label>
          <select id="x-scale">
            <option value="1">1× — screen size</option>
            <option value="2" selected>2× — sharp (recommended)</option>
            <option value="3">3× — print</option>
          </select></div>
        <div class="f-row"><label>Background</label>
          <select id="x-bg">
            <option value="white" selected>White</option>
            <option value="transparent">Transparent</option>
            <option value="dark">Dark</option>
          </select></div>
      </div>
      <div class="f-row"><label>Pin markers</label>
        <select id="x-pins">
          <option value="used" selected>Only wired pins</option>
          <option value="none">None — artwork only</option>
          <option value="all">Every pin</option>
        </select></div>
      <label class="check"><input type="checkbox" id="x-labels" checked> Include component labels</label>
      <label class="check"><input type="checkbox" id="x-title"> Print the project name on the image</label>`,
      [{ label: 'Cancel', ghost: true }, {
        label: 'Download PNG', run: async () => {
          const opts = {
            scale: +$('#x-scale').value,
            bg: $('#x-bg').value,
            pins: $('#x-pins').value === 'none' ? false : $('#x-pins').value,
            labels: $('#x-labels').checked,
            title: $('#x-title').checked,
            pad: 40,
          };
          try {
            const blob = await exportPNG(opts);
            CirvoLib.download(blob, CirvoLib.slug(S.doc.name) + '.png');
            toast('PNG exported', 'success');
          } catch (err) {
            console.error(err);
            toast('Export failed — serve the folder over http, not file://', 'error');
          }
        }
      }]);
    // the dialog is rebuilt each time, so read the values inside run()
    setTimeout(() => {
      const sel = $('#x-scale');
      if (sel) sel.focus();
    }, 50);
  }

  // ------------------------------------------------ project file I/O
  function saveProject() {
    const data = JSON.stringify({
      app: 'cirvo', version: 1, name: S.doc.name,
      items: S.doc.items, wires: S.doc.wires, view: S.view,
    }, null, 1);
    CirvoLib.download(data, CirvoLib.slug(S.doc.name) + '.cirvo.json');
    toast('Project saved', 'success');
  }

  async function openProject(file) {
    try {
      const txt = await CirvoLib.readFile(file, 'text');
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.items)) throw new Error('not a Cirvo project');
      S.doc = { name: d.name || 'Untitled circuit', items: d.items, wires: d.wires || [] };
      S.nodes.forEach(n => n.remove());
      S.nodes.clear();
      S.sel = { items: [], wires: [] };
      S.nets = null;
      S.history = []; S.hIdx = -1;
      renderAll();
      commit();
      fit();
      const missing = [...new Set(S.doc.items.map(i => i.partId).filter(p => !def(p)))];
      if (missing.length) {
        toast(missing.length + ' component(s) are not in your library — check the builder', 'error');
      } else {
        toast('Project opened', 'success');
      }
    } catch (err) {
      toast('Could not open that file: ' + err.message, 'error');
    }
  }

  function newProject() {
    dialog('Clear the canvas?', `<div class="popup-note">This removes every component and wire
      from <b>${esc(S.doc.name)}</b>. Download the project file first if you want it back.</div>`,
      [{ label: 'Cancel', ghost: true }, {
        label: 'Clear canvas', run: () => {
          S.doc = { name: 'Untitled circuit', items: [], wires: [] };
          S.nodes.forEach(n => n.remove());
          S.nodes.clear();
          S.sel = { items: [], wires: [] };
          S.nets = null;
          renderAll();
          commit();
        }
      }]);
  }

  // ------------------------------------------------------ shortcuts
  function onKey(e) {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === '`') { e.preventDefault(); toggleCode(); return; }
    if (e.key === 'Escape') { cancelWire(); select([], []); closeMenus(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      select(S.doc.items.map(i => i.uid), S.doc.wires.map(w => w.uid));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }

    const k = e.key.toLowerCase();
    if (k === 'f') fit();
    if (k === 'd' && !mod) CirvoLib.setTheme(CirvoLib.theme() === 'dark' ? 'light' : 'dark');
    if (e.key === '[') panels.toggle('left');
    if (e.key === ']') panels.toggle('right');
    if (k === 'g') toggleOpt('grid');
    if (k === 'p') toggleOpt('pins');
    if (k === 's') toggleOpt('snap');
    if (k === 'r' && S.sel.items.length) rotateItems(S.sel.items, e.shiftKey ? -90 : 90);
    if (e.key === '+' || e.key === '=') zoomBy(1.15);
    if (e.key === '-' || e.key === '_') zoomBy(1 / 1.15);
    if (e.key.startsWith('Arrow') && S.sel.items.length) {
      e.preventDefault();
      const step = e.shiftKey ? GRID : 1;
      const dx = (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
      const dy = (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0);
      S.sel.items.forEach(u => { const it = item(u); it.x += dx; it.y += dy; placeItem(it); });
      renderWires();
      clearTimeout(onKey._t);
      onKey._t = setTimeout(commit, 350);
    }
  }

  function toggleOpt(key) {
    if (key === 'pins') {
      S.opts.pins = (Number(S.opts.pins) + 1) % 3;
      savePrefs();
      updateDock();
        return;
    }
    S.opts[key] = !S.opts[key];
    savePrefs();
    updateDock();
  }

  const closeMenus = () => $$('.dd.open').forEach(d => d.classList.remove('open'));

  // ================================================== code panel + run
  const CODE_KEY = 'cirvo-code';
  const WORLD_LABELS = {
    temperature: ['Temperature', '\u00b0C', -10, 60, 0.5],
    humidity: ['Humidity', '%', 0, 100, 1],
    light: ['Light', 'lux', 0, 1000, 5],
    soil: ['Soil moisture', '%', 0, 100, 1],
    distance: ['Distance', 'cm', 2, 400, 1],
    co2: ['CO\u2082', 'ppm', 400, 5000, 10],
    water: ['Water level', '%', 0, 100, 1],
    tds: ['TDS', 'ppm', 0, 2000, 10],
    flow: ['Flow', 'L/min', 0, 30, 0.1],
    gas: ['Gas', 'ppm', 0, 1000, 5],
    motion: ['Motion', '', 0, 1, 1],
  };

  function toggleCode(show) {
    const panel = els.code;
    const open = show === undefined ? panel.hidden : show;
    panel.hidden = !open;
    $('#btn-code').classList.toggle('primary', open);
    if (open) {
      // CodeMirror is fetched from a CDN the first time the panel is actually
      // opened, same as Skulpt only loads on first Run — no cost for someone
      // who never touches the code side of the app.
      ensureEditor().then(() => els.cm.refresh());   // it measured itself while hidden
    }
  }

  function setPane(name) {
    $$('.code-tab').forEach(b => b.classList.toggle('active', b.dataset.pane === name));
    $$('.code-pane').forEach(p => p.classList.toggle('none', p.dataset.pane !== name));
    if (name === 'world') renderWorld();
  }

  function logLine(text, kind) {
    const out = els.console;
    const empty = $('.empty', out);
    if (empty) empty.remove();
    const el = document.createElement('span');
    el.className = 'l-' + (kind || 'out');
    el.textContent = text.endsWith('\n') ? text : text + '\n';
    out.appendChild(el);
    out.parentElement.scrollTop = out.parentElement.scrollHeight;
    while (out.childNodes.length > 500) out.removeChild(out.firstChild);
    if (kind === 'err' && $('.code-tab[data-pane="console"]')) {
      $('.code-tab[data-pane="console"]').classList.add('has-err');
    }
  }

  function renderWorld() {
    els.worldPane.innerHTML = Object.keys(WORLD_LABELS).map(k => {
      const [label, unit, min, max, step] = WORLD_LABELS[k];
      const v = CirvoSim.world[k];
      return `<div class="wrow">
        <label>${esc(label)} <b id="wv-${k}">${v}${unit ? ' ' + esc(unit) : ''}</b></label>
        <input type="range" data-world="${k}" min="${min}" max="${max}" step="${step}" value="${v}">
      </div>`;
    }).join('');
    $$('#world-grid input', els.worldPane).forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.world;
        const v = parseFloat(inp.value);
        CirvoSim.setWorld(k, v);
        const out = $('#wv-' + k);
        if (out) out.textContent = v + (WORLD_LABELS[k][1] ? ' ' + WORLD_LABELS[k][1] : '');
      });
    });
  }

  function renderStatus() {
    const boards = CirvoSim.boards();
    const running = CirvoSim.isRunning();
    const on = boards.filter(b => b.on);
    els.status.innerHTML = `
      <span class="pill ${running ? 'run' : ''}">
        <span class="material-symbols-rounded">${running ? 'sync' : 'pause'}</span>
        ${running ? 'running' : 'idle'}</span>
      ${boards.length
        ? boards.map(b => `<span class="pill ${b.on ? 'on' : ''}"
            ><span class="material-symbols-rounded">${b.on ? 'power' : 'power_off'}</span>${esc(b.name)}</span>`).join('')
        : '<span>No board on the canvas — drop a Raspberry Pi or an ESP32 first.</span>'}
      ${on.length ? '<span>Everything is live already — click a board\u2019s power button to cut it.</span>'
        : boards.length ? '<span>Every board is switched off.</span>' : ''}`;
    const run = $('#btn-run');
    run.querySelector('.material-symbols-rounded').textContent = running ? 'stop' : 'play_arrow';
    const txt = run.querySelector('.hdr-btn-text');
    if (txt) txt.textContent = running ? 'Stop' : 'Run';
    run.classList.toggle('primary', !running);
  }

  let codeTimer;
  function saveCode() {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => {
      try { localStorage.setItem(CODE_KEY, els.cm.getValue()); } catch (e) { /* private mode */ }
    }, 400);
  }

  // -------------------------------------------------- collapsible panels
  const PANEL_KEY = 'cirvo-panels';

  function initPanels() {
    const shell = $('.cv-shell');
    const specs = [
      { side: 'left', aside: $('#panel-parts'), btn: $('#panel-parts-toggle'),
        cssVar: '--lw', openIcon: 'left_panel_close', closedIcon: 'left_panel_open' },
      { side: 'right', aside: $('#panel-insp'), btn: $('#panel-insp-toggle'),
        cssVar: '--rw', openIcon: 'right_panel_close', closedIcon: 'right_panel_open' },
    ];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}'); } catch (e) { /* private mode */ }

    const apply = (spec, collapsed) => {
      spec.aside.classList.toggle('collapsed', collapsed);
      shell.style.setProperty(spec.cssVar, collapsed ? '3rem' : '');
      const icon = spec.btn.querySelector('.material-symbols-rounded');
      if (icon) icon.textContent = collapsed ? spec.closedIcon : spec.openIcon;
    };

    specs.forEach(spec => {
      apply(spec, !!saved[spec.side]);
      spec.btn.addEventListener('click', () => {
        const collapsed = !spec.aside.classList.contains('collapsed');
        apply(spec, collapsed);
        saved[spec.side] = collapsed;
        try { localStorage.setItem(PANEL_KEY, JSON.stringify(saved)); } catch (e) { /* private mode */ }
      });
    });

    return { toggle(side) { const b = specs.find(x => x.side === side); if (b) b.btn.click(); } };
  }

  // ---------------------------------------------------- CodeMirror
  const CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
  let cmReady = null;

  function loadScript(src) {
    return new Promise((ok, no) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = ok;
      el.onerror = () => no(new Error('could not load ' + src));
      document.head.appendChild(el);
    });
  }

  function loadCSS(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
  }

  function loadCodeMirror() {
    if (cmReady) return cmReady;
    loadCSS(CM_BASE + 'codemirror.min.css');
    cmReady = loadScript(CM_BASE + 'codemirror.min.js')
      .then(() => Promise.all([
        loadScript(CM_BASE + 'mode/python/python.min.js'),
        loadScript(CM_BASE + 'addon/edit/matchbrackets.min.js'),
        loadScript(CM_BASE + 'addon/selection/active-line.min.js'),
        loadScript(CM_BASE + 'addon/comment/comment.min.js'),
      ]));
    return cmReady;
  }

  let cmMounted = null;
  const ensureEditor = () => (cmMounted || (cmMounted = mountEditor()));

  async function mountEditor() {
    await loadCodeMirror();
    const mount = $('#code-editor');
    let initial = '';
    try {
      const saved = localStorage.getItem(CODE_KEY);
      if (saved) initial = saved;
    } catch (e) { /* private mode */ }

    els.cm = CodeMirror(mount, {
      value: initial,
      mode: 'python',
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineNumbers: true,
      lineWrapping: false,
      styleActiveLine: true,
      matchBrackets: true,
      viewportMargin: Infinity,
      extraKeys: {
        Tab: (cm) => cm.somethingSelected()
          ? cm.execCommand('indentMore') : cm.replaceSelection('    ', 'end'),
        'Shift-Tab': 'indentLess',
        'Ctrl-Enter': () => $('#btn-run').click(),
        'Cmd-Enter': () => $('#btn-run').click(),
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
      },
    });
    els.cm.on('change', saveCode);
  }

  // -------------------------------------------------------- dock + resize
  const DOCK_KEY = 'cirvo-code-dock';
  const SIZE_KEY = 'cirvo-code-size';

  function initDock() {
    let dock = 'bottom';
    let sizes = { bottom: 44, top: 44, left: 30, right: 30 };
    try { dock = localStorage.getItem(DOCK_KEY) || dock; } catch (e) { /* private mode */ }
    try { Object.assign(sizes, JSON.parse(localStorage.getItem(SIZE_KEY) || '{}')); } catch (e) { /* */ }

    const applySize = () => {
      const horiz = dock === 'left' || dock === 'right';
      els.code.style.height = horiz ? '' : sizes[dock] + '%';
      els.code.style.width = horiz ? sizes[dock] + '%' : '';
    };

    const setDock = (d) => {
      dock = d;
      els.code.dataset.dock = d;
      applySize();
      $$('.dock-opt').forEach(b => b.classList.toggle('active', b.dataset.dock === d));
      try { localStorage.setItem(DOCK_KEY, d); } catch (e) { /* private mode */ }
      if (els.cm) setTimeout(() => els.cm.refresh(), 0);
    };

    setDock(dock);
    $$('.dock-opt').forEach(b => b.addEventListener('click', () => setDock(b.dataset.dock)));

    $('#code-grip').addEventListener('pointerdown', e => {
      const grip = e.currentTarget;
      grip.setPointerCapture(e.pointerId);
      const stage = els.code.parentElement.getBoundingClientRect();
      const horiz = dock === 'left' || dock === 'right';
      const move = ev => {
        let pct;
        if (dock === 'bottom') pct = (stage.bottom - ev.clientY) / stage.height * 100;
        else if (dock === 'top') pct = (ev.clientY - stage.top) / stage.height * 100;
        else if (dock === 'left') pct = (ev.clientX - stage.left) / stage.width * 100;
        else pct = (stage.right - ev.clientX) / stage.width * 100;
        pct = Math.max(15, Math.min(85, pct));
        sizes[dock] = pct;
        applySize();
        if (els.cm) els.cm.refresh();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        try { localStorage.setItem(SIZE_KEY, JSON.stringify(sizes)); } catch (e) { /* private mode */ }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  function initCodePanel() {
    els.code = $('#code-panel');
    els.console = $('#console-out');
    els.worldPane = $('#world-grid');
    els.status = $('#code-status');

    els.console.innerHTML = '<span class="empty">Output from print() and any errors land here.</span>';

    $$('.code-tab').forEach(b => b.addEventListener('click', () => setPane(b.dataset.pane)));
    $('#code-close').addEventListener('click', () => toggleCode(false));
    $('#btn-code').addEventListener('click', () => toggleCode());
    $('#btn-clear-log').addEventListener('click', () => {
      els.console.innerHTML = '<span class="empty">Cleared.</span>';
    });
    $('#btn-run').addEventListener('click', () => {
      if (CirvoSim.isRunning()) { CirvoSim.stop(); return; }
      if (!els.cm) return;    // still fetching CodeMirror — nothing to run yet
      setPane('console');
      CirvoSim.run(els.cm.getValue());
    });

    initDock();

    // getters, not values: the document object is replaced wholesale when a
    // project is opened or cleared
    CirvoSim.attach({
      getDoc: () => S.doc, getLib: () => S.lib,
      onState: applySim,
      onLog: logLine,
      onStatus: renderStatus,
    });
    renderStatus();
    renderWorld();
  }

  // ------------------------------------------------------------ boot
  async function boot() {
    Object.assign(els, {
      viewport: $('#viewport'), world: $('#world'), items: $('#items'), wires: $('#wires'),
      blank: $('#blank'), tip: $('#tip'), list: $('#part-list'),
      search: $('#part-search'), inspBody: $('#insp-body'),
      inspHead: $('#insp-head'), popupWrap: $('#popup-wrap'), fileOpen: $('#file-open'),
      dUndo: $('#btn-undo'), dRedo: $('#btn-redo'), dZoom: $('#d-zoom'),
      dGrid: $('#d-grid'), dPins: $('#d-pins'), dSnap: $('#d-snap'), dTheme: $('#btn-theme'),
    });

    try {
      Object.assign(S.opts, JSON.parse(localStorage.getItem(PREFS) || '{}'));
    } catch (e) { /* defaults are fine */ }

    S.lib = await CirvoLib.load();
    if (!S.lib.parts.length) {
      toast('No components found — serve this folder over http so parts.json can load', 'error');
    }
    renderCats();
    renderPalette();

    const saved = (() => { try { return localStorage.getItem(AUTOSAVE); } catch (e) { return null; } })();
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.items && d.items.length) S.doc = { name: d.name || 'Untitled circuit', items: d.items, wires: d.wires || [] };
      } catch (e) { /* ignore a corrupt autosave */ }
    }

    renderAll();
    commit();
    applyView();
    updateDock();
    if (S.doc.items.length) fit();

    // --- palette
    els.search.addEventListener('input', renderPalette);
    els.list.addEventListener('click', e => {
      const card = e.target.closest('.part-card');
      if (!card) return;
      const r = els.viewport.getBoundingClientRect();
      const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      addItem(card.dataset.part, c.x, c.y);
      if (window.matchMedia('(max-width: 900px)').matches) closePanels();
    });
    els.list.addEventListener('dragstart', e => {
      const card = e.target.closest('.part-card');
      if (!card) return;
      e.dataTransfer.setData('text/cirvo-part', card.dataset.part);
      e.dataTransfer.effectAllowed = 'copy';
    });
    els.viewport.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/cirvo-part')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    els.viewport.addEventListener('drop', e => {
      const id = e.dataTransfer.getData('text/cirvo-part');
      if (!id) return;
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      addItem(id, p.x, p.y);
    });

    // --- canvas
    els.viewport.addEventListener('pointerdown', onPointerDown);
    els.viewport.addEventListener('pointermove', onPointerMove);
    els.viewport.addEventListener('pointerup', onPointerUp);
    els.viewport.addEventListener('pointercancel', e => {
      if (e.pointerType === 'touch' && S.touchId === e.pointerId) S.touchId = null;
      S.drag = null;
    });
    els.viewport.addEventListener('pointerleave', hideTip);
    els.viewport.addEventListener('wheel', onWheel, { passive: false });
    els.viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    els.viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    els.viewport.addEventListener('touchend', onTouchEnd);
    els.viewport.addEventListener('touchcancel', onTouchEnd);
    // right-drag pans, so the browser menu would fight it
    els.viewport.addEventListener('contextmenu', e => e.preventDefault());
    els.viewport.addEventListener('contextmenu', e => {
      if (S.wiring) {
        e.preventDefault();
        if (S.wiring.points.length) { S.wiring.points.pop(); renderWires(); }
        else cancelWire();
      }
    });
    els.viewport.addEventListener('dblclick', e => {
      const h = e.target.closest && e.target.closest('.wire-pt');
      if (h) {
        const w = wire(h.dataset.uid);
        w.points.splice(+h.dataset.pt, 1);
        renderWires();
        commit();
        return;
      }
      const node = e.target.closest && e.target.closest('.cv-item');
      if (node) {
        const inp = $('#i-label');
        if (inp) { inp.focus(); inp.select(); }
      }
    });

    // --- dock
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#d-zin').addEventListener('click', () => zoomBy(1.2));
    $('#d-zout').addEventListener('click', () => zoomBy(1 / 1.2));
    $('#d-zoom').addEventListener('click', () => {
      const r = els.viewport.getBoundingClientRect();
      zoomAt(r.width / 2, r.height / 2, 1);
    });
    $('#d-fit').addEventListener('click', fit);
    $('#d-grid').addEventListener('click', () => toggleOpt('grid'));
    $('#d-pins').addEventListener('click', () => toggleOpt('pins'));
    $('#d-snap').addEventListener('click', () => toggleOpt('snap'));

    // --- header
    $$('.dd-trigger').forEach(btn => btn.addEventListener('click', () => {
      const dd = btn.closest('.dd');
      const open = dd.classList.contains('open');
      closeMenus();
      if (!open) dd.classList.add('open');
    }));
    document.addEventListener('click', e => {
      if (!e.target.closest('.dd')) closeMenus();
      if (!e.target.closest('.csel')) $$('.csel.open').forEach(x => x.classList.remove('open'));
    });
    $('#btn-png').addEventListener('click', exportDialog);
    $('#btn-json').addEventListener('click', saveProject);
    $('#btn-save').addEventListener('click', saveProject);
    $('#btn-new').addEventListener('click', newProject);
    $('#btn-open').addEventListener('click', () => els.fileOpen.click());
    els.fileOpen.addEventListener('change', e => {
      if (e.target.files[0]) openProject(e.target.files[0]);
      e.target.value = '';
    });

    // --- mobile panels
    $$('.cv-mobile-tabs .dock-btn').forEach(b => b.addEventListener('click', () => {
      const p = $('#' + b.dataset.panel);
      const wasOpen = p.classList.contains('open');
      closePanels();
      if (!wasOpen) p.classList.add('open');
    }));
    $$('.panel-close').forEach(b => b.addEventListener('click', closePanels));

    // handy from the console (and for the headless checks in tools/): the live
    // document, plus the few verbs a script would want to drive
    window.Cirvo = { state: S, addItem, fit, exportPNG, select, connect, renderAll, commit,
      pinRefWorld, wirePoints, segments, reroute, toggleCode, rotateItems,
      sim: CirvoSim };

    CirvoLib.initTheme();
    $('#btn-theme').addEventListener('click', () => setTimeout(updateDock, 0));
    panels = initPanels();
    initCodePanel();

    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => { if (!S.doc.items.length) applyView(); });

    // parts added in the builder show up without a reload
    window.addEventListener('focus', async () => {
      const before = S.lib.parts.length;
      S.lib = await CirvoLib.load(true);
      if (S.lib.parts.length !== before) { renderCats(); renderPalette(); }
    });
  }

  function closePanels() {
    $$('.panel.side.open').forEach(p => p.classList.remove('open'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
