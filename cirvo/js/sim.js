/* ============================================================
   Cirvo — simulator
   Turns the drawing into something that behaves: nets carry
   volts, a board can be switched on at its own power button,
   outputs light and spin, sensors read the world, and user
   Python drives the whole thing through familiar libraries.

   Nothing here solves a circuit properly — there is no nodal
   analysis. Parts are modelled by behaviour (`sim.model` in
   parts.json), which is what makes an LED across a GPIO and a
   resistor light up the way a beginner expects.
   ============================================================ */

const CirvoSim = (() => {
  'use strict';

  const SKULPT = [
    'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js',
    'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js',
  ];

  // drive strengths — a hard rail beats a GPIO beats a sensor beats a pull
  const STR = { rail: 4, gpio: 3, analog: 2, tie: 1.5, pull: 0.5 };
  const ON_THRESHOLD = 1.6;        // volts across an LED before it lights

  const S = {
    getDoc: () => null, getLib: () => null,
    onState: null, onLog: null, onStatus: null,
    boards: new Map(),             // uid -> {on, logic, platform, gpio:Map}
    controls: new Map(),           // 'uid:cid' -> value
    devices: [],
    nets: null,
    V: new Map(),
    dirty: true,
    running: false,
    loop: 0,
    started: 0,
    world: {
      temperature: 26, humidity: 65, light: 400, soil: 42,
      distance: 30, co2: 620, water: 55, tds: 780, flow: 0, gas: 120,
    },
  };

  const def = (id) => { const l = S.getLib(); return l && l.byId.get(id); };
  const items = () => { const d = S.getDoc(); return d ? d.items : []; };
  const partOf = (it) => def(it.partId);

  // ------------------------------------------------------- geometry
  function pinWorld(it, pin) {
    const d = partOf(it);
    const w = d.width * it.scale, h = d.height * it.scale;
    let lx = pin.x * w, ly = pin.y * h;
    if (it.flipX) lx = w - lx;
    if (it.flipY) ly = h - ly;
    const dx = lx - w / 2, dy = ly - h / 2;
    const a = (it.rot || 0) * Math.PI / 180;
    return {
      x: it.x + w / 2 + dx * Math.cos(a) - dy * Math.sin(a),
      y: it.y + h / 2 + dx * Math.sin(a) + dy * Math.cos(a),
    };
  }

  // --------------------------------------------------------- netlist
  function nets() {
    if (!S.nets) S.nets = CirvoLib.buildNets(items(), S.getDoc().wires, S.getLib().byId);
    return S.nets;
  }

  const netOf = (uid, pinId) => nets().key(uid, pinId);

  function pinBySignal(it, sig) {
    const d = partOf(it);
    if (!d) return null;
    return d.pins.find(p => p.signal === sig) || d.pins.find(p => p.name === sig) || null;
  }

  function pinByName(it, name) {
    const d = partOf(it);
    if (!d) return null;
    const want = String(name).toLowerCase();
    return d.pins.find(p => (p.signal || '').toLowerCase() === want)
      || d.pins.find(p => p.name.toLowerCase() === want)
      || d.pins.find(p => p.name.toLowerCase().split(' ').includes(want))
      // the component builder addresses pins by id, so accept that too
      || d.pins.find(p => p.id.toLowerCase() === want) || null;
  }

  const netOfPin = (it, pin) => (pin ? netOf(it.uid, pin.id) : null);

  // ---------------------------------------------------------- boards
  function boardState(it) {
    let b = S.boards.get(it.uid);
    if (!b) {
      const d = partOf(it);
      b = {
        on: true,
        logic: (d.board && d.board.logic) || 3.3,
        platform: (d.board && d.board.platform) || 'raspberrypi',
        numbering: (d.board && d.board.gpio) || 'bcm',
        gpio: new Map(),
      };
      S.boards.set(it.uid, b);
    }
    return b;
  }

  const boardItems = () => items().filter(it => {
    const d = partOf(it);
    return d && d.board;
  });

  function poweredBoards() {
    return boardItems().filter(it => boardState(it).on);
  }

  /** A pin number as written in code -> the signal printed on the header. */
  function resolvePin(it, pin) {
    const b = boardState(it);
    if (typeof pin === 'string') {
      const p = pinByName(it, pin);
      return p ? (p.signal || p.name) : pin;
    }
    const n = Number(pin);
    if (b.numbering === 'bcm') return 'GPIO' + n;
    return 'D' + n;                    // arduino / esp32 / esp8266 all use D<n>
  }

  // ------------------------------------------------- electrical pass
  function drive(key, v, duty, strength) {
    if (key == null) return;
    const cur = S.V.get(key);
    if (!cur || strength > cur.strength || (strength === cur.strength && v > cur.v)) {
      S.V.set(key, { v, duty, strength });
    }
  }

  const at = (key) => (key == null ? null : S.V.get(key) || null);
  const volts = (key) => { const n = at(key); return n ? n.v : 0; };
  const dutyOf = (key) => { const n = at(key); return n ? n.duty : 0; };
  const live = (key) => at(key) != null;

  function evaluate() {
    S.V.clear();
    const ds = devices();

    // 1. power rails of every board that is switched on
    boardItems().forEach(it => {
      const b = boardState(it);
      const d = partOf(it);
      if (!b.on) return;
      d.pins.forEach(p => {
        const sig = p.signal || p.name;
        const key = netOf(it.uid, p.id);
        if (sig === 'GND' || p.type === 'gnd') drive(key, 0, 0, STR.rail);
        else if (sig === '3V3' || sig === '3.3V') drive(key, 3.3, 1, STR.rail);
        else if (sig === '5V' || sig === 'VCC' || sig === '+5V') drive(key, 5, 1, STR.rail);
        else if (sig === 'VIN' || sig === 'RAW') drive(key, 5, 1, STR.rail);
      });
      // 2. whatever the running code has configured
      b.gpio.forEach((g, sig) => {
        const p = pinBySignal(it, sig);
        if (!p) return;
        const key = netOf(it.uid, p.id);
        if (g.mode === 'out') drive(key, g.value ? b.logic : 0, g.value ? 1 : 0, STR.gpio);
        else if (g.mode === 'pwm') drive(key, b.logic, g.duty, STR.gpio);
        else if (g.mode === 'in' && g.pull === 'up') drive(key, b.logic, 1, STR.pull);
        else if (g.mode === 'in' && g.pull === 'down') drive(key, 0, 0, STR.pull);
      });
    });

    // 3. batteries and regulators
    ds.forEach(d => {
      if (d.model === 'supply') {
        drive(d.net('+'), d.p.sim.volts || 9, 1, STR.rail);
        drive(d.net('-'), 0, 0, STR.rail);
      } else if (d.model === 'regulator') {
        if (live(d.net('IN+'))) {
          drive(d.net('OUT+'), d.p.sim.out_volts || 5, 1, STR.rail);
          drive(d.net('OUT-'), 0, 0, STR.rail);
        }
      }
    });

    // 4. analog sources — sensors, pots, LDRs
    ds.forEach(d => analogSource(d));

    // 5. switches, buttons and relay contacts tie nets together
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      ds.forEach(d => {
        (d.ties() || []).forEach(([ka, kb, oneWay]) => {
          const a = at(ka), b = at(kb);
          if (a && (!b || b.strength < a.strength - 0.01)) {
            drive(kb, a.v, a.duty, Math.max(STR.tie, a.strength - 0.01));
            changed = true;
          } else if (!oneWay && b && (!a || a.strength < b.strength - 0.01)) {
            drive(ka, b.v, b.duty, Math.max(STR.tie, b.strength - 0.01));
            changed = true;
          }
        });
      });
      if (!changed) break;
    }

    // 6. every device works out what it is doing now
    ds.forEach(d => d.update());
  }

  // a net's high level, its low level, and how much of the time it is high
  const vhi = (k) => { const n = at(k); return n ? n.v : 0; };
  const vlo = (k) => { const n = at(k); return n && n.duty >= 1 ? n.v : 0; };
  const hiFrac = (k) => { const n = at(k); return n ? (n.duty == null ? 1 : n.duty) : 0; };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const world = (k) => S.world[k];

  // --------------------------------------------------------- devices
  function devices() {
    if (!S.dirty) return S.devices;
    S.devices = items().map(makeDevice).filter(Boolean);
    S.dirty = false;
    return S.devices;
  }

  function makeDevice(it) {
    const p = partOf(it);
    if (!p || !p.sim) return null;
    const d = {
      it, p, uid: it.uid, model: p.sim.model,
      label: it.label || p.name,
      state: {},
      net(name) { return netOfPin(it, pinByName(it, name)); },
      ties() { return null; },
      update() { },
      api: {},
    };
    const M = MODELS[d.model];
    if (M) M(d);
    return d;
  }

  const ctl = (d, cid, dflt) => {
    const v = S.controls.get(d.uid + ':' + cid);
    return v === undefined ? dflt : v;
  };

  /** Sensors, pots and light-dependent parts push a voltage onto their net. */
  function analogSource(d) {
    if (d.analog) d.analog();
  }

  const supplyNear = (d, names) => {
    for (const n of names) {
      const k = d.net(n);
      if (live(k)) return vhi(k);
    }
    return 3.3;
  };

  const MODELS = {
    // ------------------------------------------------------- emitters
    led(d) {
      d.update = () => {
        const a = d.net('Anode'), c = d.net('Cathode');
        const on = live(a) && live(c) && (vhi(a) - vlo(c)) >= ON_THRESHOLD;
        const level = on ? clamp(hiFrac(a) * (1 - hiFrac(c)), 0, 1) : 0;
        const colour = (d.it.props && d.it.props.colour) || d.p.sim.colour || 'red';
        d.state = { glow: level > 0.002 ? { colour, level } : null };
      };
    },
    /**
     * A light on a part that has no other behaviour: it lights from the volts
     * across two of its own pins, exactly like an LED. This is what the
     * component builder writes when you point a light at a + and a - pin, so a
     * part drawn this morning behaves on the canvas with no code and no new
     * model — which is the whole reason the builder can make working parts.
     */
    lamp(d) {
      d.update = () => {
        const a = d.net(d.p.sim.anode || '+'), c = d.net(d.p.sim.cathode || '-');
        const on = live(a) && live(c) && (vhi(a) - vlo(c)) >= (d.p.sim.threshold || ON_THRESHOLD);
        const level = on ? clamp(hiFrac(a) * (1 - hiFrac(c)), 0, 1) : 0;
        // no colour here: the anchor's own colour is the fallback, so the
        // builder's colour picker is what decides what it burns
        d.state = { glow: level > 0.002 ? { colour: d.p.sim.colour || null, level } : null };
      };
    },
    'rgb-led'(d) {
      d.update = () => {
        const gnd = d.net('GND');
        const chan = ['R', 'G', 'B'].map(n => {
          const k = d.net(n);
          if (!live(k) || !live(gnd)) return 0;
          if ((vhi(k) - vlo(gnd)) < ON_THRESHOLD) return 0;
          return clamp(hiFrac(k) * (1 - hiFrac(gnd)), 0, 1);
        });
        const level = Math.max(...chan);
        d.state = {
          glow: level > 0.002
            ? { rgb: chan.map(v => Math.round(v * 255)), level } : null,
        };
      };
    },
    buzzer(d) {
      d.update = () => {
        const plus = d.net('+'), minus = d.net('-');
        const on = live(plus) && live(minus) && (vhi(plus) - vlo(minus)) >= 2;
        const frac = on ? hiFrac(plus) * (1 - hiFrac(minus)) : 0;
        const n = at(plus);
        d.state = { sound: frac > 0.01 ? { level: frac, hz: (n && n.freq) || 0 } : null };
      };
    },
    'led-strip'(d) {
      d.pixels = new Array((d.p.sim.leds || 8)).fill(null).map(() => [0, 0, 0]);
      d.api.set = (i, r, g, b) => { if (d.pixels[i]) d.pixels[i] = [r, g, b]; };
      d.api.fill = (r, g, b) => { d.pixels = d.pixels.map(() => [r, g, b]); };
      d.update = () => { d.state = { leds: d.pixels.map(c => c.slice()) }; };
    },

    // ------------------------------------------------------ switching
    relay(d) {
      d.update = () => {
        const powered = live(d.net('VCC'));
        const chans = d.p.sim.channels || 1;
        const on = [];
        for (let i = 0; i < chans; i++) {
          const k = d.net(chans > 1 ? 'IN' + (i + 1) : 'IN');
          const frac = hiFrac(k);
          const active = powered && live(k)
            && (d.p.sim.active_low ? frac < 0.5 : frac >= 0.5);
          on.push(active);
        }
        d.on = on;
        d.state = { glow: on.some(Boolean) ? { colour: '#e5484d', level: 1 } : null, relays: on };
      };
      d.ties = () => {
        if (!d.on || (d.p.sim.channels || 1) > 1) return null;
        const com = d.net('COM');
        return d.on[0] ? [[com, d.net('NO')]] : [[com, d.net('NC')]];
      };
    },
    button(d) {
      // On a 6 mm tactile switch pins 1-2 are one side and 3-4 the other, and
      // they are already joined by the part's own groups. Pressing bridges the
      // two sides, so the tie has to be 1 to 3.
      d.ties = () => (ctl(d, 'btn', 0) ? [[d.net('1'), d.net('3')]] : null);
      d.update = () => { d.state = { pressed: !!ctl(d, 'btn', 0) }; };
    },
    switch(d) {
      d.ties = () => {
        const on = ctl(d, 'sw', 0);
        const com = d.net('COM');
        if (com == null) return on ? [[d.net('1'), d.net('2')]] : null;
        return [[com, on ? d.net('2') : d.net('1')]];
      };
      d.update = () => { d.state = { toggled: !!ctl(d, 'sw', 0) }; };
    },

    // ------------------------------------------------------- analogue
    potentiometer(d) {
      d.analog = () => {
        const a = d.net('1'), b = d.net('3'), w = d.net('Wiper');
        if (!live(a) && !live(b)) return;
        const va = vhi(a), vb = vhi(b);
        drive(w, va + (vb - va) * ctl(d, 'knob', 0.5), 1, STR.analog);
      };
      d.update = () => { d.state = { knob: ctl(d, 'knob', 0.5) }; };
    },
    ldr(d) { divider(d, () => clamp(world('light') / 1000, 0.03, 0.97)); },
    thermistor(d) { divider(d, () => clamp((world('temperature') + 10) / 80, 0.03, 0.97)); },

    'analog-out'(d) {
      d.analog = () => {
        const supply = supplyNear(d, ['VCC', 'VIN', '+5V', '3.3V']);
        const frac = sensorFraction(d);
        const out = d.p.sim.signal && d.net(d.p.sim.signal);
        drive(out, supply * frac, 1, STR.analog);
        if (d.p.sim.digital) {
          const k = d.net(d.p.sim.digital);
          drive(k, frac > 0.5 ? supply : 0, frac > 0.5 ? 1 : 0, STR.analog);
        }
      };
      d.update = () => { d.state = { reading: sensorFraction(d) }; };
    },
    'digital-out'(d) {                     // PIR and friends
      d.analog = () => {
        const supply = supplyNear(d, ['VCC', '+5V']);
        const hot = world('motion') > 0.5;
        drive(d.net(d.p.sim.signal || 'OUT'), hot ? supply : 0, hot ? 1 : 0, STR.analog);
      };
      d.update = () => { d.state = { glow: world('motion') > 0.5 ? { colour: '#22a06b', level: 1 } : null }; };
    },
    'pulse-out'(d) {
      d.api.read = () => world('flow');
      d.update = () => { d.state = { spin: world('flow') > 0 ? world('flow') / 10 : 0 }; };
    },

    // ------------------------------------------------------ measuring
    adc(d) {
      d.api.read = (ch) => {
        const pin = pinByName(d.it, 'CH' + ch) || pinByName(d.it, 'A' + ch);
        if (!pin) return 0;
        const vref = supplyNear(d, ['VREF', 'VDD', 'VCC']);
        return clamp(vhi(netOfPin(d.it, pin)) / (vref || 3.3), 0, 1);
      };
    },
    dht(d) {
      d.api.read = () => [world('temperature'), world('humidity')];
      d.update = () => { d.state = { reading: 1 }; };
    },
    ds18b20(d) { d.api.read = () => [world('temperature')]; },
    bme280(d) {
      d.api.read = () => [world('temperature'), world('humidity'), 1013.2];
    },
    bh1750(d) { d.api.read = () => [world('light')]; },
    ultrasonic(d) { d.api.read = () => [world('distance')]; },
    co2(d) { d.api.read = () => [world('co2'), world('temperature')]; },
    rtc(d) {
      d.api.read = () => {
        const n = new Date();
        return [n.getFullYear(), n.getMonth() + 1, n.getDate(),
          n.getHours(), n.getMinutes(), n.getSeconds()];
      };
    },
    encoder(d) {
      d.update = () => {
        const v = ctl(d, 'knob', 0.5);
        d.state = { knob: v, steps: Math.round((v - 0.5) * 40) };
      };
      d.api.read = () => [Math.round((ctl(d, 'knob', 0.5) - 0.5) * 40), ctl(d, 'sw', 0)];
    },
    joystick(d) {
      d.update = () => { d.state = { stick: [ctl(d, 'stick_x', 0.5), ctl(d, 'stick_y', 0.5)] }; };
      d.api.read = () => [ctl(d, 'stick_x', 0.5), ctl(d, 'stick_y', 0.5), ctl(d, 'sw', 0)];
    },

    // -------------------------------------------------------- motion
    servo(d) {
      d.angle = 90;
      d.api.angle = (a) => { d.angle = clamp(a, 0, d.p.sim.range_deg || 180); };
      d.update = () => {
        const k = d.net('PWM');
        const n = at(k);
        if (n && n.duty != null && n.pulse) d.angle = clamp(n.pulse, 0, 180);
        d.state = { horn: d.angle, powered: live(d.net('VCC')) };
      };
    },
    'dc-motor'(d) { motorLike(d, ['+', '-']); },
    fan(d) { motorLike(d, ['+', '-']); },
    pump(d) { motorLike(d, ['+', '-']); },
    valve(d) {
      d.update = () => {
        const a = d.net('A'), b = d.net('B');
        const open = live(a) && live(b) && Math.abs(vhi(a) - vlo(b)) >= 3;
        d.state = { glow: open ? { colour: '#3d7fe5', level: 1 } : null, open };
      };
    },
    stepper(d) {
      d.step = 0; d.last = -1;
      const SEQ = [0b1000, 0b1100, 0b0100, 0b0110, 0b0010, 0b0011, 0b0001, 0b1001];
      d.api.step = (n) => { d.step += n; };
      d.update = () => {
        const bits = ['1 Blue', '2 Pink', '3 Yellow', '4 Orange']
          .map((nm, i) => (hiFrac(d.net(nm)) >= 0.5 ? (1 << (3 - i)) : 0))
          .reduce((a, b) => a | b, 0);
        if (bits) {
          const idx = SEQ.indexOf(bits);
          if (idx >= 0 && d.last >= 0 && idx !== d.last) {
            const fwd = (idx - d.last + 8) % 8;
            d.step += fwd <= 4 ? fwd : fwd - 8;
          }
          if (idx >= 0) d.last = idx;
        }
        const spr = d.p.sim.steps_per_rev || 4096;
        d.state = { spin: 0, angle: (d.step / spr) * 360, steps: d.step };
      };
    },
    'stepper-driver'(d) {
      // IN1-IN4 sink the four coils; the socket carries them straight to the
      // motor, so the phases have to be re-driven onto those nets
      const PHASE = ['Blue', 'Pink', 'Yellow', 'Orange'];
      d.on = [false, false, false, false];
      d.analog = () => {
        d.on = [1, 2, 3, 4].map(i => hiFrac(d.net('IN' + i)) >= 0.5);
        const v = supplyNear(d, ['+', 'Red +5V']);
        d.on.forEach((active, i) => {
          drive(d.net(PHASE[i]), active ? v : 0, active ? 1 : 0, STR.gpio);
        });
      };
      d.update = () => {
        d.state = { leds: d.on.map(v => (v ? [225, 70, 66] : [38, 38, 46])) };
      };
    },
    'motor-driver'(d) {
      d.update = () => {
        const pairs = [['IN1', 'IN2', 'OUT1', 'OUT2', 'ENA'], ['IN3', 'IN4', 'OUT3', 'OUT4', 'ENB']];
        d.outs = [];
        pairs.forEach(([a, b, oa, ob, en]) => {
          const enable = d.net(en) == null || !live(d.net(en)) ? 1 : hiFrac(d.net(en));
          const fa = hiFrac(d.net(a)), fb = hiFrac(d.net(b));
          d.outs.push({ oa: d.net(oa), ob: d.net(ob), fa, fb, enable });
        });
        d.state = {};
      };
      d.analog = () => {
        (d.outs || []).forEach(o => {
          const vm = supplyNear(d, ['+12V', '+5V', 'VMOT', 'VCC']);
          if (o.fa >= 0.5 && o.fb < 0.5) { drive(o.oa, vm, o.enable, STR.gpio); drive(o.ob, 0, 0, STR.gpio); }
          else if (o.fb >= 0.5 && o.fa < 0.5) { drive(o.ob, vm, o.enable, STR.gpio); drive(o.oa, 0, 0, STR.gpio); }
        });
      };
    },

    // ------------------------------------------------ passives that conduct
    // Without these a GPIO -> resistor -> LED chain would leave the LED on a
    // dead net, which is the first thing anyone builds.
    resistor(d) {
      d.ties = () => [[d.net('A'), d.net('B')]];
    },
    diode(d) {
      d.ties = () => [[d.net('A'), d.net('K'), true]];
    },
    transistor(d) {
      d.update = () => { d.state = {}; };
      d.ties = () => (hiFrac(d.net('B')) >= 0.5 && vhi(d.net('B')) > 0.7
        ? [[d.net('C'), d.net('E')]] : null);
    },
    'level-shifter'(d) {
      d.ties = () => [1, 2, 3, 4].map(i => [d.net('LV' + i), d.net('HV' + i)]);
    },
    'shift-register'(d) {
      d.ties = () => null;
    },

    // ------------------------------------------------------- displays
    display(d) {
      const k = d.p.sim.kind;
      d.buf = { kind: k, lines: [], pixels: [], text: '', dirty: 0 };
      d.api.clear = () => { d.buf.lines = []; d.buf.pixels = []; d.buf.text = ''; };
      d.api.text = (s, x, y) => {
        const row = Math.max(0, Math.round(y || 0));
        while (d.buf.lines.length <= row) d.buf.lines.push('');
        const col = Math.max(0, Math.round(x || 0));
        const line = d.buf.lines[row].padEnd(col, ' ');
        d.buf.lines[row] = line.slice(0, col) + String(s) + line.slice(col + String(s).length);
      };
      d.api.pixel = (x, y, on) => {
        const key = x + ',' + y;
        const i = d.buf.pixels.indexOf(key);
        if (on && i < 0) d.buf.pixels.push(key);
        if (!on && i >= 0) d.buf.pixels.splice(i, 1);
      };
      d.api.show = (s) => { if (s !== undefined) d.buf.text = String(s); };
      d.update = () => {
        // an unpowered display shows nothing at all — the artwork's own
        // placeholder is what you see, exactly like a dark panel
        const powered = live(d.net('VCC')) || live(d.net('VIN')) || live(d.net('3.3V'));
        d.state = powered ? {
          screen: {
            kind: k, lines: d.buf.lines.slice(), pixels: d.buf.pixels.slice(),
            text: d.buf.text,
          },
        } : {};
      };
    },
  };

  function divider(d, frac) {
    d.analog = () => {
      const a = d.net('A'), b = d.net('B');
      const aLive = live(a), bLive = live(b);
      if (aLive === bLive) return;
      const src = aLive ? a : b, dst = aLive ? b : a;
      drive(dst, vhi(src) * frac(), 1, STR.analog);
    };
    d.update = () => { d.state = { reading: frac() }; };
  }

  function motorLike(d, [pa, pb]) {
    d.update = () => {
      const a = d.net(pa), b = d.net(pb);
      let speed = 0, dir = 1;
      if (live(a) && live(b)) {
        const fwd = vhi(a) - vlo(b), rev = vhi(b) - vlo(a);
        if (fwd >= 2) { speed = hiFrac(a) * (1 - hiFrac(b)); dir = 1; }
        else if (rev >= 2) { speed = hiFrac(b) * (1 - hiFrac(a)); dir = -1; }
      }
      d.state = { spin: speed * dir };
    };
  }

  /** 0..1 for whatever a sensor board is pointed at in the virtual world. */
  function sensorFraction(d) {
    const reads = (d.p.sim.reads || [])[0] || '';
    if (reads.indexOf('soil') === 0) return clamp(1 - world('soil') / 100, 0.02, 0.98);
    if (reads.indexOf('light') === 0) return clamp(world('light') / 1000, 0.02, 0.98);
    if (reads.indexOf('water') === 0) return clamp(world('water') / 100, 0.02, 0.98);
    if (reads.indexOf('tds') === 0) return clamp(world('tds') / 2000, 0.02, 0.98);
    if (reads.indexOf('gas') === 0) return clamp(world('gas') / 1000, 0.02, 0.98);
    return 0.5;
  }

  // ============================================================ python
  let skReady = null;

  function loadSkulpt() {
    if (skReady) return skReady;
    skReady = SKULPT.reduce((chain, url) => chain.then(() => new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = ok;
      s.onerror = () => no(new Error('could not load ' + url));
      document.head.appendChild(s);
    })), Promise.resolve());
    return skReady;
  }

  class Stopped extends Error { }

  // Every in-flight sleep, so Stop can cut them short rather than waiting for the
  // timer to expire — a program sleeping 10 s would otherwise ignore Stop for
  // 10 s and keep its pins driven.
  const naps = new Set();

  function nap(ms) {
    guard();
    return Sk.misceval.promiseToSuspension(new Promise((res, rej) => {
      const entry = { rej };
      entry.timer = setTimeout(() => {
        naps.delete(entry);
        if (!S.running) { rej(new Stopped()); return; }
        // A real sleep just handed control back to the browser — that is
        // exactly the "still alive" signal a hang guard should reset on, so
        // the compute budget below only ever measures time between sleeps,
        // never the running total of a long-lived but well-behaved program.
        Sk.execStart = Date.now();
        res(Sk.builtin.none.none$);
      }, Math.min(Math.max(0, ms), 3600000));
      naps.add(entry);
    }));
  }

  function cancelNaps() {
    naps.forEach(n => { clearTimeout(n.timer); n.rej(new Stopped()); });
    naps.clear();
  }

  const jsv = (v) => (v === undefined || v === null ? null : Sk.ffi.remapToJs(v));
  const pyv = (v) => (v === undefined || v === null ? Sk.builtin.none.none$ : Sk.ffi.remapToPy(v));
  const fn = (f) => new Sk.builtin.func(f);

  function guard() {
    if (!S.running) throw new Stopped('stopped');
  }

  function boardHandle(name) {
    const list = boardItems();
    if (name) {
      const want = String(name).toLowerCase();
      const i = list.findIndex(it => (it.label || '').toLowerCase() === want
        || partOf(it).name.toLowerCase().includes(want)
        || it.partId === want);
      return i;
    }
    const on = list.findIndex(it => boardState(it).on);
    return on >= 0 ? on : (list.length ? 0 : -1);
  }

  function deviceHandle(model, near) {
    const ds = devices().filter(d => d.model === model
      || (d.p.sim.kind && model === 'display:' + d.p.sim.kind));
    if (!ds.length) return -1;
    if (near == null) return devices().indexOf(ds[0]);
    // prefer the one actually wired to that board pin
    const bh = boardHandle(null);
    const bit = boardItems()[bh];
    if (bit) {
      const sig = resolvePin(bit, near);
      const pin = pinBySignal(bit, sig);
      const key = pin ? netOf(bit.uid, pin.id) : null;
      const hit = ds.find(d => partOf(d.it).pins
        .some(p => netOf(d.uid, p.id) === key));
      if (hit) return devices().indexOf(hit);
    }
    return devices().indexOf(ds[0]);
  }

  function buildBridge() {
    const mod = { __name__: new Sk.builtin.str('_cirvo') };
    const board = (h) => boardItems()[jsv(h)];

    mod.b_find = fn((name) => pyv(boardHandle(name && jsv(name))));
    mod.b_on = fn((h) => { const it = board(h); return pyv(!!(it && boardState(it).on)); });
    mod.b_logic = fn((h) => { const it = board(h); return pyv(it ? boardState(it).logic : 3.3); });
    mod.b_name = fn((h) => { const it = board(h); return pyv(it ? (it.label || partOf(it).name) : ''); });
    mod.b_resolve = fn((h, pin) => {
      const it = board(h);
      return pyv(it ? resolvePin(it, jsv(pin)) : String(jsv(pin)));
    });
    mod.b_mode = fn((h, sig, mode, pull) => {
      guard();
      const it = board(h);
      if (!it) throw new Sk.builtin.Exception('no board on the canvas');
      const b = boardState(it);
      const s = jsv(sig);
      const g = b.gpio.get(s) || { value: 0, duty: 0, freq: 0 };
      g.mode = jsv(mode);
      g.pull = jsv(pull) || null;
      b.gpio.set(s, g);
      wake();
      return Sk.builtin.none.none$;
    });
    mod.b_write = fn((h, sig, v) => {
      guard();
      const it = board(h);
      const b = boardState(it);
      const s = jsv(sig);
      const g = b.gpio.get(s) || { mode: 'out', duty: 0, freq: 0 };
      g.mode = 'out';
      g.value = jsv(v) ? 1 : 0;
      b.gpio.set(s, g);
      settle();
      return Sk.builtin.none.none$;
    });
    mod.b_pwm = fn((h, sig, duty, freq) => {
      guard();
      const it = board(h);
      const b = boardState(it);
      const s = jsv(sig);
      const g = b.gpio.get(s) || {};
      g.mode = 'pwm';
      g.duty = clamp(jsv(duty), 0, 1);
      g.freq = jsv(freq) || 50;
      b.gpio.set(s, g);
      settle();
      return Sk.builtin.none.none$;
    });
    mod.b_read = fn((h, sig) => {
      guard();
      ensureFresh();
      const it = board(h);
      if (!it) return pyv(false);
      const p = pinBySignal(it, jsv(sig));
      if (!p) return pyv(false);
      const k = netOf(it.uid, p.id);
      const b = boardState(it);
      if (!live(k)) return pyv(false);
      return pyv(vhi(k) >= b.logic * 0.5 && hiFrac(k) >= 0.5);
    });
    mod.b_analog = fn((h, sig) => {
      guard();
      ensureFresh();
      const it = board(h);
      if (!it) return pyv(0);
      const p = pinBySignal(it, jsv(sig));
      return pyv(p ? vhi(netOf(it.uid, p.id)) : 0);
    });
    mod.find = fn((model, near) => pyv(deviceHandle(jsv(model), near ? jsv(near) : null)));
    mod.dev_call = fn((h, method, args) => {
      guard();
      ensureFresh();
      const d = devices()[jsv(h)];
      if (!d) throw new Sk.builtin.Exception('that component is not on the canvas');
      const m = d.api[jsv(method)];
      if (!m) throw new Sk.builtin.Exception(d.model + ' cannot ' + jsv(method));
      const out = m.apply(null, jsv(args) || []);
      wake();
      return pyv(out === undefined ? null : out);
    });
    mod.dev_name = fn((h) => { const d = devices()[jsv(h)]; return pyv(d ? d.label : ''); });
    mod.world = fn((k) => pyv(S.world[jsv(k)]));
    mod.log = fn((s) => { emitLog(jsv(s)); return Sk.builtin.none.none$; });
    mod.now = fn(() => pyv((performance.now() - S.started) / 1000));
    mod.sleep = fn((secs) => nap(jsv(secs) * 1000));
    return mod;
  }

  // Python-side shims. They read like the real libraries on purpose — code
  // written against gpiozero, RPi.GPIO or MicroPython's machine should run
  // here unchanged for anything the models actually cover.
  const PY = {};

  PY['src/lib/gpiozero.py'] = `
import _cirvo

class _Pinned:
    def __init__(self, pin, board=None):
        self._b = _cirvo.b_find(board)
        if self._b < 0:
            raise RuntimeError("put a board on the canvas first")
        self._sig = _cirvo.b_resolve(self._b, pin)
        self.pin = pin

class OutputDevice(_Pinned):
    def __init__(self, pin, active_high=True, initial_value=False, board=None):
        _Pinned.__init__(self, pin, board)
        self.active_high = active_high
        _cirvo.b_mode(self._b, self._sig, 'out', None)
        self._v = 0
        self.value = 1 if initial_value else 0
    def _apply(self):
        _cirvo.b_write(self._b, self._sig, self._v if self.active_high else (0 if self._v else 1))
    @property
    def value(self):
        return self._v
    @value.setter
    def value(self, v):
        self._v = 1 if v else 0
        self._apply()
    def on(self): self.value = 1
    def off(self): self.value = 0
    def toggle(self): self.value = 0 if self._v else 1
    @property
    def is_active(self): return self._v == 1
    def blink(self, on_time=1, off_time=1, n=1):
        for _ in range(n):
            self.on(); _cirvo.sleep(on_time)
            self.off(); _cirvo.sleep(off_time)
    def close(self): self.off()

class DigitalOutputDevice(OutputDevice): pass
class LED(OutputDevice): pass
class Buzzer(OutputDevice):
    def beep(self, on_time=0.5, off_time=0.5, n=1): self.blink(on_time, off_time, n)

class PWMOutputDevice(_Pinned):
    def __init__(self, pin, frequency=100, initial_value=0, board=None):
        _Pinned.__init__(self, pin, board)
        self.frequency = frequency
        self._v = 0
        self.value = initial_value
    @property
    def value(self): return self._v
    @value.setter
    def value(self, v):
        self._v = max(0.0, min(1.0, float(v)))
        _cirvo.b_pwm(self._b, self._sig, self._v, self.frequency)
    def on(self): self.value = 1
    def off(self): self.value = 0
    def toggle(self): self.value = 0 if self._v else 1
    def pulse(self, fade_in_time=1, fade_out_time=1, n=1):
        for _ in range(n):
            for i in range(21):
                self.value = i / 20.0; _cirvo.sleep(fade_in_time / 20.0)
            for i in range(21):
                self.value = 1 - i / 20.0; _cirvo.sleep(fade_out_time / 20.0)

class PWMLED(PWMOutputDevice): pass

class RGBLED:
    def __init__(self, red, green, blue, board=None):
        self.red = PWMOutputDevice(red, board=board)
        self.green = PWMOutputDevice(green, board=board)
        self.blue = PWMOutputDevice(blue, board=board)
        self._c = (0, 0, 0)
    @property
    def color(self): return self._c
    @color.setter
    def color(self, c):
        self._c = tuple(c)
        self.red.value, self.green.value, self.blue.value = c[0], c[1], c[2]
    def on(self): self.color = (1, 1, 1)
    def off(self): self.color = (0, 0, 0)

class InputDevice(_Pinned):
    def __init__(self, pin, pull_up=False, board=None):
        _Pinned.__init__(self, pin, board)
        self.pull_up = pull_up
        _cirvo.b_mode(self._b, self._sig, 'in', 'up' if pull_up else 'down')
    @property
    def value(self):
        raw = 1 if _cirvo.b_read(self._b, self._sig) else 0
        return 1 - raw if self.pull_up else raw
    @property
    def is_active(self): return self.value == 1

class DigitalInputDevice(InputDevice): pass

class Button(InputDevice):
    def __init__(self, pin, pull_up=True, bounce_time=None, board=None):
        InputDevice.__init__(self, pin, pull_up, board)
    @property
    def is_pressed(self): return self.value == 1
    def wait_for_press(self, timeout=None):
        waited = 0.0
        while not self.is_pressed:
            _cirvo.sleep(0.02); waited += 0.02
            if timeout is not None and waited >= timeout: return False
        return True
    def wait_for_release(self, timeout=None):
        waited = 0.0
        while self.is_pressed:
            _cirvo.sleep(0.02); waited += 0.02
            if timeout is not None and waited >= timeout: return False
        return True

class MotionSensor(InputDevice):
    def __init__(self, pin, board=None):
        InputDevice.__init__(self, pin, False, board)
    @property
    def motion_detected(self): return self.value == 1

class Servo(_Pinned):
    def __init__(self, pin, initial_value=0, min_angle=0, max_angle=180, board=None):
        _Pinned.__init__(self, pin, board)
        self._h = _cirvo.find('servo', pin)
        self.min_angle = min_angle
        self.max_angle = max_angle
        _cirvo.b_mode(self._b, self._sig, 'pwm', None)
        self._val = initial_value
        self.value = initial_value
    def _push(self, angle):
        if self._h >= 0: _cirvo.dev_call(self._h, 'angle', [angle])
        _cirvo.b_pwm(self._b, self._sig, 0.025 + 0.1 * (angle / 180.0), 50)
    @property
    def angle(self):
        return self.min_angle + (self._val + 1) / 2.0 * (self.max_angle - self.min_angle)
    @angle.setter
    def angle(self, a):
        a = max(self.min_angle, min(self.max_angle, a))
        span = (self.max_angle - self.min_angle) or 1
        self._val = (a - self.min_angle) / span * 2 - 1
        self._push(a)
    @property
    def value(self): return self._val
    @value.setter
    def value(self, v):
        self._val = max(-1.0, min(1.0, float(v)))
        self.angle = self.angle
    def min(self): self.angle = self.min_angle
    def mid(self): self.angle = (self.min_angle + self.max_angle) / 2.0
    def max(self): self.angle = self.max_angle
    def detach(self): pass

class AngularServo(Servo): pass

class Motor:
    def __init__(self, forward, backward, enable=None, board=None):
        self.f = OutputDevice(forward, board=board)
        self.b = OutputDevice(backward, board=board)
        self.en = PWMOutputDevice(enable, board=board) if enable is not None else None
    def forward(self, speed=1):
        self.b.off(); self.f.on()
        if self.en: self.en.value = speed
    def backward(self, speed=1):
        self.f.off(); self.b.on()
        if self.en: self.en.value = speed
    def stop(self):
        self.f.off(); self.b.off()
        if self.en: self.en.value = 0

class MCP3008:
    def __init__(self, channel=0, device=0, board=None):
        self.channel = channel
        self._h = _cirvo.find('adc', None)
        if self._h < 0: raise RuntimeError("no ADC on the canvas")
    @property
    def value(self): return _cirvo.dev_call(self._h, 'read', [self.channel])
    @property
    def voltage(self): return self.value * 3.3

class DistanceSensor:
    def __init__(self, echo=None, trigger=None, max_distance=4, board=None):
        self._h = _cirvo.find('ultrasonic', echo if echo is not None else trigger)
        if self._h < 0: raise RuntimeError("no ultrasonic sensor on the canvas")
        self.max_distance = max_distance
    @property
    def distance(self):
        return min(_cirvo.dev_call(self._h, 'read', [])[0] / 100.0, self.max_distance)
`;

  PY['src/lib/RPi/__init__.py'] = '';
  PY['src/lib/RPi/GPIO.py'] = `
import _cirvo

BCM = 11
BOARD = 10
OUT = 0
IN = 1
HIGH = 1
LOW = 0
PUD_UP = 22
PUD_DOWN = 21
PUD_OFF = 20

_b = -1
_mode = BCM

def setmode(m):
    global _b, _mode
    _mode = m
    _b = _cirvo.b_find(None)
    if _b < 0: raise RuntimeError("put a board on the canvas first")

def setwarnings(flag): pass

def _sig(pin):
    global _b
    if _b < 0: setmode(BCM)
    return _cirvo.b_resolve(_b, pin)

def setup(pin, direction, pull_up_down=PUD_OFF, initial=None):
    pins = pin if isinstance(pin, list) else [pin]
    for p in pins:
        if direction == OUT:
            _cirvo.b_mode(_b, _sig(p), 'out', None)
            if initial is not None: _cirvo.b_write(_b, _sig(p), initial)
        else:
            pull = 'up' if pull_up_down == PUD_UP else ('down' if pull_up_down == PUD_DOWN else None)
            _cirvo.b_mode(_b, _sig(p), 'in', pull)

def output(pin, value):
    pins = pin if isinstance(pin, list) else [pin]
    for p in pins:
        _cirvo.b_write(_b, _sig(p), 1 if value else 0)

def input(pin):
    return 1 if _cirvo.b_read(_b, _sig(pin)) else 0

def cleanup(pin=None): pass

class PWM:
    def __init__(self, pin, frequency):
        self.sig = _sig(pin)
        self.freq = frequency
        self.duty = 0
    def start(self, duty):
        self.duty = duty
        _cirvo.b_pwm(_b, self.sig, duty / 100.0, self.freq)
    def ChangeDutyCycle(self, duty): self.start(duty)
    def ChangeFrequency(self, f):
        self.freq = f
        self.start(self.duty)
    def stop(self):
        _cirvo.b_pwm(_b, self.sig, 0, self.freq)
`;

  PY['src/lib/machine.py'] = `
import _cirvo

class Pin:
    OUT = 3
    IN = 1
    PULL_UP = 2
    PULL_DOWN = 1
    def __init__(self, id, mode=-1, pull=None, value=None):
        self._b = _cirvo.b_find(None)
        if self._b < 0: raise RuntimeError("put a board on the canvas first")
        self.id = id
        self._sig = _cirvo.b_resolve(self._b, id)
        if mode == Pin.OUT:
            _cirvo.b_mode(self._b, self._sig, 'out', None)
            if value is not None: _cirvo.b_write(self._b, self._sig, value)
        elif mode == Pin.IN:
            _cirvo.b_mode(self._b, self._sig, 'in',
                          'up' if pull == Pin.PULL_UP else ('down' if pull == Pin.PULL_DOWN else None))
    def value(self, v=None):
        if v is None:
            return 1 if _cirvo.b_read(self._b, self._sig) else 0
        _cirvo.b_write(self._b, self._sig, v)
    def on(self): self.value(1)
    def off(self): self.value(0)

class PWM:
    def __init__(self, pin, freq=1000, duty=0):
        self._pin = pin
        self._freq = freq
        self._duty = duty
        self._apply()
    def _apply(self):
        _cirvo.b_pwm(self._pin._b, self._pin._sig, self._duty / 1023.0, self._freq)
    def freq(self, f=None):
        if f is None: return self._freq
        self._freq = f; self._apply()
    def duty(self, d=None):
        if d is None: return self._duty
        self._duty = d; self._apply()
    def duty_u16(self, d=None):
        if d is None: return int(self._duty * 64)
        self.duty(int(d / 64))
    def deinit(self): self.duty(0)

class ADC:
    ATTN_11DB = 3
    def __init__(self, pin):
        self._pin = pin
    def atten(self, a): pass
    def width(self, w): pass
    def read(self):
        v = _cirvo.b_analog(self._pin._b, self._pin._sig)
        return int(max(0, min(4095, v / 3.3 * 4095)))
    def read_u16(self):
        return int(self.read() * 16)
`;

  PY['src/lib/cirvo.py'] = `
"""Cirvo's own helpers for the parts no standard library covers."""
import _cirvo

def log(*args):
    _cirvo.log(' '.join([str(a) for a in args]))

def world(key):
    return _cirvo.world(key)

def sleep(secs):
    _cirvo.sleep(secs)

class _Part:
    def __init__(self, model, near=None, what='component'):
        self._h = _cirvo.find(model, near)
        if self._h < 0:
            raise RuntimeError("no " + what + " on the canvas")
        self.name = _cirvo.dev_name(self._h)

class Display(_Part):
    def __init__(self, kind=None, near=None):
        _Part.__init__(self, 'display' if kind is None else 'display:' + kind, near, 'display')
    def clear(self):
        _cirvo.dev_call(self._h, 'clear', [])
    def text(self, s, x=0, y=0):
        _cirvo.dev_call(self._h, 'text', [str(s), x, y])
    def pixel(self, x, y, on=1):
        _cirvo.dev_call(self._h, 'pixel', [x, y, 1 if on else 0])
    def show(self, value=None):
        _cirvo.dev_call(self._h, 'show', [value])
    def fill(self, v=0):
        if not v: self.clear()

class OLED(Display):
    def __init__(self, near=None): Display.__init__(self, 'oled', near)
class LCD(Display):
    def __init__(self, near=None): Display.__init__(self, 'character', near)
    def write(self, s, col=0, row=0): self.text(s, col, row)
class SevenSegment(Display):
    def __init__(self, near=None): Display.__init__(self, 'seven-segment', near)
class Matrix(Display):
    def __init__(self, near=None): Display.__init__(self, 'matrix', near)
class TFT(Display):
    def __init__(self, near=None): Display.__init__(self, 'tft', near)

class DHT(_Part):
    def __init__(self, pin=None):
        _Part.__init__(self, 'dht', pin, 'DHT sensor')
    def read(self):
        t, h = _cirvo.dev_call(self._h, 'read', [])
        return (t, h)
    @property
    def temperature(self): return self.read()[0]
    @property
    def humidity(self): return self.read()[1]

class DS18B20(_Part):
    def __init__(self, pin=None): _Part.__init__(self, 'ds18b20', pin, 'DS18B20')
    @property
    def temperature(self): return _cirvo.dev_call(self._h, 'read', [])[0]

class BME280(_Part):
    def __init__(self): _Part.__init__(self, 'bme280', None, 'BME280')
    def read(self):
        t, h, p = _cirvo.dev_call(self._h, 'read', [])
        return (t, h, p)
    @property
    def temperature(self): return self.read()[0]
    @property
    def humidity(self): return self.read()[1]
    @property
    def pressure(self): return self.read()[2]

class BH1750(_Part):
    def __init__(self): _Part.__init__(self, 'bh1750', None, 'BH1750')
    @property
    def lux(self): return _cirvo.dev_call(self._h, 'read', [])[0]

class CO2(_Part):
    def __init__(self): _Part.__init__(self, 'co2', None, 'CO2 sensor')
    @property
    def ppm(self): return _cirvo.dev_call(self._h, 'read', [])[0]

class FlowSensor(_Part):
    def __init__(self, pin=None): _Part.__init__(self, 'pulse-out', pin, 'flow sensor')
    @property
    def litres_per_minute(self): return _cirvo.dev_call(self._h, 'read', [])

class Encoder(_Part):
    def __init__(self): _Part.__init__(self, 'encoder', None, 'rotary encoder')
    @property
    def steps(self): return _cirvo.dev_call(self._h, 'read', [])[0]
    @property
    def pressed(self): return _cirvo.dev_call(self._h, 'read', [])[1] == 1

class Joystick(_Part):
    def __init__(self): _Part.__init__(self, 'joystick', None, 'joystick')
    def read(self):
        x, y, sw = _cirvo.dev_call(self._h, 'read', [])
        return (x, y, sw == 1)

class NeoPixel(_Part):
    def __init__(self, pin=None, n=8):
        _Part.__init__(self, 'led-strip', pin, 'LED strip')
        self.n = n
    def __setitem__(self, i, colour):
        _cirvo.dev_call(self._h, 'set', [i, colour[0], colour[1], colour[2]])
    def fill(self, colour):
        _cirvo.dev_call(self._h, 'fill', [colour[0], colour[1], colour[2]])
    def write(self): pass
    def show(self): pass

class Stepper:
    \"\"\"28BYJ-48 through a ULN2003: give it the four IN pins.\"\"\"
    SEQ = [[1,0,0,0], [1,1,0,0], [0,1,0,0], [0,1,1,0],
           [0,0,1,0], [0,0,1,1], [0,0,0,1], [1,0,0,1]]
    STEPS_PER_REV = 4096
    def __init__(self, in1, in2, in3, in4, board=None):
        self._b = _cirvo.b_find(board)
        if self._b < 0:
            raise RuntimeError("put a board on the canvas first")
        self._sig = [_cirvo.b_resolve(self._b, p) for p in (in1, in2, in3, in4)]
        for s in self._sig:
            _cirvo.b_mode(self._b, s, 'out', None)
        self._i = 0
        self.position = 0
    def _write(self, row):
        for k in range(4):
            _cirvo.b_write(self._b, self._sig[k], row[k])
    def step(self, n=1, delay=0.002):
        d = 1 if n >= 0 else -1
        for _ in range(abs(n)):
            self._i = (self._i + d) % 8
            self._write(Stepper.SEQ[self._i])
            self.position += d
            _cirvo.sleep(delay)
    def turn(self, degrees, delay=0.002):
        self.step(int(degrees / 360.0 * Stepper.STEPS_PER_REV), delay)
    def release(self):
        self._write([0, 0, 0, 0])
`;

  // --------------------------------------------------- library shims
  // Real code imports real libraries. These are thin adapters onto the same
  // bridge the `cirvo` module uses, so a program written for a Pi runs here
  // unchanged — which is the whole point of typing it out.

  PY['src/lib/luma/__init__.py'] = '';
  PY['src/lib/luma/core/__init__.py'] = '';
  PY['src/lib/luma/core/interface/__init__.py'] = '';
  PY['src/lib/luma/core/interface/serial.py'] = `
class _Bus:
    def __init__(self, port=1, address=0x3C, **kwargs):
        self.port = port
        self.address = address
    def command(self, *a): pass
    def data(self, *a): pass
    def cleanup(self): pass

class i2c(_Bus): pass
class spi(_Bus): pass
class noop(_Bus): pass
`;

  PY['src/lib/luma/core/render.py'] = `
class _Draw:
    """Enough of PIL's ImageDraw for the way luma is actually used."""
    def __init__(self, device):
        self.device = device
    def text(self, xy, text, fill=None, font=None, **kwargs):
        self.device._text(text, xy[0], xy[1])
    def point(self, xy, fill=None):
        self.device._pixel(xy[0], xy[1])
    def rectangle(self, box, outline=None, fill=None, **kwargs):
        pass
    def line(self, xy, fill=None, width=1, **kwargs): pass
    def ellipse(self, box, outline=None, fill=None, **kwargs): pass
    def textsize(self, text, font=None):
        return (len(str(text)) * 6, 8)

class canvas:
    def __init__(self, device, dither=False, background=None):
        self.device = device
    def __enter__(self):
        self.device._clear()
        return _Draw(self.device)
    def __exit__(self, *args):
        self.device._flush()
        return False
`;

  PY['src/lib/luma/oled/__init__.py'] = '';
  PY['src/lib/luma/oled/device.py'] = `
import _cirvo

class _Screen:
    def __init__(self, serial_interface=None, width=128, height=64, rotate=0, **kwargs):
        self.width = width
        self.height = height
        self.bounding_box = (0, 0, width - 1, height - 1)
        self._h = _cirvo.find('display', None)
        if self._h < 0:
            raise RuntimeError("no display on the canvas — drop an OLED next to the board")
    # luma works in pixels; the modelled screen works in characters
    def _text(self, s, x, y):
        _cirvo.dev_call(self._h, 'text', [str(s), int(round(x / 6.1)), int(round(y / 10.6))])
    def _pixel(self, x, y):
        _cirvo.dev_call(self._h, 'pixel', [int(x), int(y), 1])
    def _clear(self):
        _cirvo.dev_call(self._h, 'clear', [])
    def _flush(self): pass
    def clear(self): self._clear()
    def show(self): pass
    def hide(self): pass
    def contrast(self, level): pass
    def display(self, image=None): pass
    def cleanup(self): pass

class ssd1306(_Screen): pass
class ssd1309(_Screen): pass
class ssd1325(_Screen): pass
class ssd1331(_Screen): pass
class sh1106(_Screen): pass
`;
  PY['src/lib/luma/lcd/__init__.py'] = '';
  PY['src/lib/luma/lcd/device.py'] = `
from luma.oled.device import _Screen

class st7735(_Screen): pass
class pcd8544(_Screen): pass
class ili9341(_Screen): pass
`;

  PY['src/lib/RPLCD/__init__.py'] = `
from RPLCD.i2c import CharLCD
`;
  PY['src/lib/RPLCD/i2c.py'] = `
import _cirvo

class CharLCD:
    def __init__(self, i2c_expander=None, address=None, port=1, cols=16, rows=2,
                 dotsize=8, charmap='A02', auto_linebreaks=True,
                 backlight_enabled=True, **kwargs):
        self.cols = cols
        self.rows = rows
        self._h = _cirvo.find('display:character', None)
        if self._h < 0:
            self._h = _cirvo.find('display', None)
        if self._h < 0:
            raise RuntimeError("no LCD on the canvas — drop an LCD 1602 next to the board")
        self._pos = (0, 0)
        self.backlight_enabled = backlight_enabled
    @property
    def cursor_pos(self):
        return self._pos
    @cursor_pos.setter
    def cursor_pos(self, value):
        self._pos = (value[0], value[1])
    def write_string(self, text):
        row, col = self._pos
        for line in str(text).replace('\\r', '').split('\\n'):
            if line != '':
                _cirvo.dev_call(self._h, 'text', [line, col, row])
            row += 1
            col = 0
        self._pos = (max(0, row - 1), col)
    def write(self, value): self.write_string(chr(value))
    def clear(self):
        _cirvo.dev_call(self._h, 'clear', [])
        self._pos = (0, 0)
    def home(self): self._pos = (0, 0)
    def crlf(self): self._pos = (self._pos[0] + 1, 0)
    def cr(self): self._pos = (self._pos[0], 0)
    def create_char(self, location, bitmap): pass
    def close(self, clear=False):
        if clear: self.clear()
`;
  PY['src/lib/RPLCD/gpio.py'] = `
from RPLCD.i2c import CharLCD
`;

  PY['src/lib/Adafruit_DHT.py'] = `
import _cirvo

DHT11 = 11
DHT22 = 22
AM2302 = 22

def _sensor(pin):
    h = _cirvo.find('dht', pin)
    if h < 0:
        raise RuntimeError("no DHT sensor on the canvas")
    return h

def read(sensor, pin):
    t, hum = _cirvo.dev_call(_sensor(pin), 'read', [])
    return (hum, t)          # Adafruit returns humidity first

def read_retry(sensor, pin, retries=15, delay_seconds=2):
    return read(sensor, pin)
`;

  PY['src/lib/adafruit_dht.py'] = `
import _cirvo

class _DHT:
    def __init__(self, pin, use_pulseio=False):
        self._h = _cirvo.find('dht', pin)
        if self._h < 0:
            raise RuntimeError("no DHT sensor on the canvas")
    @property
    def temperature(self):
        return _cirvo.dev_call(self._h, 'read', [])[0]
    @property
    def humidity(self):
        return _cirvo.dev_call(self._h, 'read', [])[1]
    def exit(self): pass

class DHT11(_DHT): pass
class DHT22(_DHT): pass
`;

  PY['src/lib/board.py'] = `
"""CircuitPython pin names. They are plain numbers here, which is all the
bridge needs to resolve them against whatever board is on the canvas."""
D0 = 0
D1 = 1
D2 = 2
D3 = 3
D4 = 4
D5 = 5
D6 = 6
D7 = 7
D8 = 8
D9 = 9
D10 = 10
D11 = 11
D12 = 12
D13 = 13
D14 = 14
D15 = 15
D16 = 16
D17 = 17
D18 = 18
D19 = 19
D20 = 20
D21 = 21
D22 = 22
D23 = 23
D24 = 24
D25 = 25
D26 = 26
D27 = 27
SDA = 2
SCL = 3
MOSI = 10
MISO = 9
SCK = 11
CE0 = 8
CE1 = 7
TX = 14
RX = 15

def I2C(): return None
def SPI(): return None
def UART(): return None
`;

  PY['src/lib/busio.py'] = `
class I2C:
    def __init__(self, scl=None, sda=None, frequency=100000): pass
    def deinit(self): pass
    def try_lock(self): return True
    def unlock(self): pass
    def scan(self): return [0x3C, 0x27, 0x76]

class SPI:
    def __init__(self, clock=None, MOSI=None, MISO=None): pass
    def deinit(self): pass

class UART:
    def __init__(self, tx=None, rx=None, baudrate=9600, **kwargs): pass
    def deinit(self): pass
`;

  PY['src/lib/digitalio.py'] = `
import _cirvo

class Direction:
    INPUT = 0
    OUTPUT = 1

class Pull:
    UP = 1
    DOWN = 2

class DigitalInOut:
    def __init__(self, pin):
        self._b = _cirvo.b_find(None)
        if self._b < 0:
            raise RuntimeError("put a board on the canvas first")
        self._sig = _cirvo.b_resolve(self._b, pin)
        self._dir = Direction.INPUT
        self._v = False
    @property
    def direction(self):
        return self._dir
    @direction.setter
    def direction(self, d):
        self._dir = d
        _cirvo.b_mode(self._b, self._sig, 'out' if d == Direction.OUTPUT else 'in', None)
    @property
    def value(self):
        if self._dir == Direction.OUTPUT:
            return self._v
        return _cirvo.b_read(self._b, self._sig)
    @value.setter
    def value(self, v):
        self._v = True if v else False
        _cirvo.b_write(self._b, self._sig, 1 if v else 0)
    @property
    def pull(self):
        return None
    @pull.setter
    def pull(self, p):
        _cirvo.b_mode(self._b, self._sig, 'in', 'up' if p == Pull.UP else 'down')
    def switch_to_output(self, value=False, **kwargs):
        self.direction = Direction.OUTPUT
        self.value = value
    def switch_to_input(self, pull=None):
        self.direction = Direction.INPUT
        if pull is not None:
            self.pull = pull
    def deinit(self): pass
`;

  PY['src/lib/neopixel.py'] = `
import _cirvo

GRB = 'GRB'
RGB = 'RGB'
GRBW = 'GRBW'

class NeoPixel:
    def __init__(self, pin, n, brightness=1.0, auto_write=True, pixel_order=None):
        self.n = n
        self.brightness = brightness
        self.auto_write = auto_write
        self._h = _cirvo.find('led-strip', pin)
        if self._h < 0:
            raise RuntimeError("no LED strip on the canvas")
    def __setitem__(self, i, colour):
        _cirvo.dev_call(self._h, 'set', [i, colour[0], colour[1], colour[2]])
    def __len__(self):
        return self.n
    def fill(self, colour):
        _cirvo.dev_call(self._h, 'fill', [colour[0], colour[1], colour[2]])
    def show(self): pass
    def deinit(self): pass
`;

  PY['src/lib/w1thermsensor.py'] = `
import _cirvo

class Sensor:
    DS18B20 = 0x28

class Unit:
    DEGREES_C = 0
    DEGREES_F = 1

class W1ThermSensor:
    def __init__(self, sensor_type=None, sensor_id=None):
        self._h = _cirvo.find('ds18b20', None)
        if self._h < 0:
            raise RuntimeError("no DS18B20 on the canvas")
        self.id = '28-0000cirvo01'
    def get_temperature(self, unit=None):
        c = _cirvo.dev_call(self._h, 'read', [])[0]
        if unit == Unit.DEGREES_F:
            return c * 9.0 / 5.0 + 32
        return c
    @property
    def temperature(self):
        return self.get_temperature()

def get_available_sensors(types=None):
    return [W1ThermSensor()]
`;

  PY['src/lib/Adafruit_ADS1x15.py'] = `
import _cirvo

class ADS1115:
    def __init__(self, busnum=None, address=0x48, **kwargs):
        self._h = _cirvo.find('adc', None)
        if self._h < 0:
            raise RuntimeError("no ADC on the canvas")
    def read_adc(self, channel, gain=1, data_rate=None):
        return int(_cirvo.dev_call(self._h, 'read', [channel]) * 32767)
    def read_adc_difference(self, differential, gain=1, data_rate=None):
        return 0
    def stop_adc(self): pass

class ADS1015(ADS1115): pass
`;

  PY['src/lib/mfrc522.py'] = `
import _cirvo

class SimpleMFRC522:
    def __init__(self):
        self._h = _cirvo.find('rfid', None)
        if self._h < 0:
            raise RuntimeError("no RFID reader on the canvas")
    def read(self):
        return (723467891011, "Cirvo test card")
    def read_no_block(self):
        return (None, None)
    def write(self, text):
        return (723467891011, text)
    def write_no_block(self, text):
        return (None, None)
`;

  // Skulpt's own `time` works, but it cannot be interrupted — this one checks
  // whether the run was stopped before and after every sleep.
  function buildTime() {
    const mod = { __name__: new Sk.builtin.str('time') };
    mod.sleep = fn((s) => nap(jsv(s) * 1000));
    mod.sleep_ms = fn((s) => nap(jsv(s)));
    mod.sleep_us = fn((s) => nap(jsv(s) / 1000));
    mod.time = fn(() => pyv(Date.now() / 1000));
    mod.monotonic = fn(() => pyv(performance.now() / 1000));
    mod.perf_counter = fn(() => pyv(performance.now() / 1000));
    mod.ticks_ms = fn(() => pyv(Math.round(performance.now())));
    return mod;
  }

  // What a program can import, and what to say when it reaches for something
  // else — a bare "No module named X" tells a beginner nothing about the fix.
  const PROVIDED = new Set([
    'gpiozero', 'RPi', 'machine', 'cirvo', '_cirvo', 'luma', 'RPLCD',
    'Adafruit_DHT', 'adafruit_dht', 'board', 'busio', 'digitalio', 'neopixel',
    'w1thermsensor', 'Adafruit_ADS1x15', 'mfrc522',
    'time', 'math', 'random', 'json', 'string', 're', 'sys', 'os',
    'collections', 'itertools', 'functools', 'operator', 'struct', 'copy',
  ]);

  const HINTS = {
    smbus: 'read the sensor directly instead: `from cirvo import BME280, BH1750`',
    smbus2: 'read the sensor directly instead: `from cirvo import BME280, BH1750`',
    spidev: 'use `from gpiozero import MCP3008` for the ADC',
    serial: 'a UART link to the outside world is not modelled',
    pyserial: 'a UART link to the outside world is not modelled',
    picamera: 'the camera is artwork only, there is no image to capture',
    picamera2: 'the camera is artwork only, there is no image to capture',
    numpy: 'not available — the runtime is a Python subset, use plain lists and math',
    pandas: 'not available — the runtime is a Python subset',
    requests: 'there is no network from inside the simulation',
    urllib: 'there is no network from inside the simulation',
    socket: 'there is no network from inside the simulation',
    threading: 'not available — write one loop with time.sleep() instead',
    asyncio: 'not available — write one loop with time.sleep() instead',
    PIL: 'draw with `luma.core.render.canvas`, or `from cirvo import OLED`',
    Pillow: 'draw with `luma.core.render.canvas`, or `from cirvo import OLED`',
    Adafruit_SSD1306: 'use `luma.oled.device.ssd1306`, or `from cirvo import OLED`',
    RPi_GPIO: 'import it as `import RPi.GPIO as GPIO`',
    pigpio: 'use `gpiozero` or `RPi.GPIO`',
    wiringpi: 'use `gpiozero` or `RPi.GPIO`',
  };

  const AVAILABLE = 'gpiozero · RPi.GPIO · machine · cirvo · luma · RPLCD · '
    + 'Adafruit_DHT · adafruit_dht · board · busio · digitalio · neopixel · '
    + 'w1thermsensor · Adafruit_ADS1x15 · mfrc522 · time · math · random · json';

  /** Top-level module names a program imports, without executing it. */
  function importsIn(code) {
    const found = new Set();
    code.split('\n').forEach(raw => {
      const line = raw.split('#')[0];
      let m = line.match(/^\s*from\s+([A-Za-z_][\w.]*)/);
      if (m) { found.add(m[1].split('.')[0]); return; }
      m = line.match(/^\s*import\s+(.+)$/);
      if (!m) return;
      m[1].split(',').forEach(part => {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) found.add(name.split('.')[0]);
      });
    });
    return [...found];
  }

  function importHint(name) {
    const key = String(name).replace(/^['"]|['"]$/g, '').split('.')[0];
    const tip = HINTS[key];
    return tip
      ? `Cirvo has no \u2018${key}\u2019 \u2014 ${tip}.`
      : `Cirvo has no \u2018${key}\u2019. It provides: ${AVAILABLE}.`;
  }

  let registered = false;
  function registerModules() {
    window.__cirvoBridge = buildBridge();
    window.__cirvoTime = buildTime();
    Sk.builtinFiles.files['src/lib/_cirvo.js'] =
      'var $builtinmodule = function () { return window.__cirvoBridge; };';
    Sk.builtinFiles.files['src/lib/time.js'] =
      'var $builtinmodule = function () { return window.__cirvoTime; };';
    Object.keys(PY).forEach(k => { Sk.builtinFiles.files[k] = PY[k]; });
    registered = true;
  }

  // ------------------------------------------------------- the loop
  function anyPowered() {
    return boardItems().some(it => boardState(it).on);
  }

  function emitState() {
    if (!S.onState) return;
    const st = { running: S.running, boards: {}, items: {} };
    boardItems().forEach(it => { st.boards[it.uid] = { on: boardState(it).on }; });
    devices().forEach(d => {
      if (d.state && Object.keys(d.state).length) st.items[d.uid] = d.state;
    });
    S.onState(st);
  }

  function frame() {
    S.loop = 0;
    evaluate();
    S.vStale = false;
    emitState();
    if (anyPowered() || S.running) schedule();
  }

  function schedule() {
    if (S.loop) return;
    S.loop = requestAnimationFrame(() => setTimeout(frame, 24));
  }

  const wake = () => { S.vStale = true; schedule(); };

  /**
   * Python reads happen between animation frames, so the voltage table can be
   * one write behind: configure a pull-up and read the pin on the next line and
   * the pull-up would not exist yet. Any read settles the circuit first.
   */
  function ensureFresh() {
    if (S.vStale) { evaluate(); S.vStale = false; }
  }

  /**
   * Settle immediately after a write instead of waiting for the next frame.
   * A stepper walks its phases every 2 ms; at 24 ms per frame the sampler would
   * miss eleven transitions out of twelve and read the motion as backwards.
   */
  function settle() { S.vStale = true; evaluate(); S.vStale = false; schedule(); }

  function emitLog(text, kind) {
    if (S.onLog) S.onLog(String(text), kind || 'out');
  }

  // ------------------------------------------------------- controls
  function controlDef(it, cid) {
    const d = partOf(it);
    return d && (d.controls || []).find(c => c.id === cid);
  }

  function setControl(uid, cid, value) {
    S.controls.set(uid + ':' + cid, value);
    wake();
  }

  function press(uid, cid, down) {
    const it = items().find(i => i.uid === uid);
    if (!it) return;
    const c = controlDef(it, cid);
    if (!c) return;
    if (c.kind === 'power') {
      if (down) togglePower(uid);
      return;
    }
    if (c.kind === 'toggle') {
      if (down) setControl(uid, cid, S.controls.get(uid + ':' + cid) ? 0 : 1);
      return;
    }
    setControl(uid, cid, down ? 1 : 0);
  }

  function togglePower(uid) {
    const it = items().find(i => i.uid === uid);
    if (!it || !partOf(it).board) return;
    const b = boardState(it);
    b.on = !b.on;
    if (!b.on) {
      b.gpio.clear();
      if (S.running) stop('power removed from ' + (it.label || partOf(it).name));
    } else {
      emitLog((it.label || partOf(it).name) + ' powered on', 'sys');
    }
    if (S.onStatus) S.onStatus();
    wake();
    frame();
  }

  // ------------------------------------------------------ public API
  function attach(opts) {
    S.getDoc = opts.getDoc;
    S.getLib = opts.getLib;
    S.onState = opts.onState;
    S.onLog = opts.onLog;
    S.onStatus = opts.onStatus;
    invalidate();
  }

  function invalidate() {
    S.nets = null;
    S.dirty = true;
    // forget boards and controls that are no longer on the canvas
    const live = new Set(items().map(i => i.uid));
    [...S.boards.keys()].forEach(k => { if (!live.has(k)) S.boards.delete(k); });
    [...S.controls.keys()].forEach(k => { if (!live.has(k.split(':')[0])) S.controls.delete(k); });
    schedule();
  }

  async function run(code) {
    if (S.running) return;
    if (!items().length) { emitLog('Nothing on the canvas to run against.', 'err'); return; }
    if (S.onStatus) S.onStatus('loading');
    try {
      await loadSkulpt();
    } catch (e) {
      emitLog('Could not load the Python runtime: ' + e.message, 'err');
      if (S.onStatus) S.onStatus();
      return;
    }
    registerModules();

    importsIn(code).filter(n => !PROVIDED.has(n))
      .forEach(n => emitLog(importHint(n), 'sys'));

    S.running = true;
    S.started = performance.now();
    if (S.onStatus) S.onStatus();
    schedule();

    Sk.configure({
      output: (t) => emitLog(t, 'out'),
      read: (x) => {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[x] === undefined) {
          throw new Error("module not available here: " + x);
        }
        return Sk.builtinFiles.files[x];
      },
      __future__: Sk.python3,
      // Not a program time limit — sleep() resets it (see nap() above), so a
      // well-behaved program can run for hours. What this actually catches is
      // a `while True:` with no sleep in it at all: 20 s of the JS main thread
      // never returning to the browser, which would otherwise hang the tab
      // for good with no way back short of reloading the page.
      execLimit: 20000,
      killableWhile: true,
      killableFor: true,
    });

    try {
      await Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody('<cirvo>', false, code, true));
      emitLog('— program finished —', 'sys');
    } catch (e) {
      if (!(e instanceof Stopped) && S.running) {
        const msg = ((e && e.toString) ? e.toString() : String(e)).replace(/^Error: /, '');
        emitLog(msg, 'err');
        const miss = msg.match(/No module named\s+(\S+)/);
        if (miss) emitLog(importHint(miss[1]), 'sys');
        if (/TimeLimitError/.test(msg)) {
          emitLog('That loop never reaches a sleep() — add one (even sleep(0.01)) so it '
            + 'keeps giving the page a chance to breathe. A loop that sleeps runs for as '
            + 'long as you like; this guard only stops one that never does.', 'sys');
        }
      }
    } finally {
      S.running = false;
      // gpiozero closes its devices at exit, so a finished or stopped program
      // leaves the pins as inputs — the LED goes dark, as it would on real hardware
      S.boards.forEach(b => b.gpio.clear());
      if (S.onStatus) S.onStatus();
      wake();
      frame();
    }
  }

  function stop(why) {
    if (!S.running) return;
    S.running = false;
    cancelNaps();
    emitLog(why ? '— stopped: ' + why + ' —' : '— stopped —', 'sys');
    if (S.onStatus) S.onStatus();
    wake();
  }

  function reset() {
    stop();
    S.boards.forEach(b => { b.on = true; b.gpio.clear(); });
    S.controls.clear();
    devices().forEach(d => {
      d.state = {};
      if (d.buf) { d.buf.lines = []; d.buf.pixels = []; d.buf.text = ''; }
      if (d.pixels) d.pixels = d.pixels.map(() => [0, 0, 0]);
      if (d.step !== undefined) { d.step = 0; d.last = -1; }
    });
    frame();
  }

  const setWorld = (k, v) => { S.world[k] = v; wake(); };

  const getControl = (uid, cid, dflt) => {
    const v = S.controls.get(uid + ':' + cid);
    return v === undefined ? (dflt === undefined ? 0 : dflt) : v;
  };

  return {
    attach, invalidate, reset, run, stop, press, setControl, getControl, togglePower,
    frame, schedule,
    isRunning: () => S.running,
    isPowered: (uid) => {
      const it = items().find(i => i.uid === uid);
      return !!(it && S.boards.get(uid) && S.boards.get(uid).on);
    },
    boards: () => boardItems().map(it => ({
      uid: it.uid, name: it.label || partOf(it).name, on: boardState(it).on,
      platform: boardState(it).platform,
    })),
    world: S.world,
    setWorld,
    debug: S,
  };
})();
