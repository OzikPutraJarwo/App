let ptot = 101.325; // kPa
let T, W, pw, pws, phi, Ws, mu, Tdew, Twb, h, v;

function calculate(xValue, yValue, container) {

  // Dry Bulb Temperature (T)
  T = xValue; // °C

  // Humidity Ratio (W)
  W = yValue / 1000; // g/kg

  // Vapor Pressure (pw)
  pw = (W * ptot) / (0.622 + W); // kPa

  // Saturation Vapor Pressure (pws[T])
  pws = 0.61094 * Math.exp((17.625 * T) / (T + 243.04)); // kPa

  // Relative Humidity (ϕ)
  phi = pw / pws; // %

  // Saturation Humidity Ratio
  Ws = 0.622 * pws / (ptot - pws); // (kg/kgda)

  // Degree of Saturation (μ)
  mu = W / Ws; // %

  // Dew Point Temperature (Tdew)
  Tdew = (243.04 * Math.log(pw / 0.61094)) / (17.625 - Math.log(pw / 0.61094)); // °C

  // Wet Bulb Temperature (Twb)
  function pws_magnus(T) {
    // T in °C -> returns kPa
    return 0.61094 * Math.exp((17.625 * T) / (T + 243.04));
  }
  function Ws_from_T(T, p_kpa) {
    const pws = pws_magnus(T);
    return 0.622 * pws / (p_kpa - pws);
  }
  function Wcalc_from_Twb(T, Twb, p_kpa) {
    // T, Twb in °C, p in kPa
    const WsTwb = Ws_from_T(Twb, p_kpa);
    const num = (2501 - 2.326 * Twb) * WsTwb - 1.006 * (T - Twb);
    const den = 2501 + 1.86 * T - 4.186 * Twb;
    return num / den; // kg/kg dry air
  }
  function dew_point_from_pw(pw_kpa) {
    // invert Magnus approximate quickly (valid for typical range)
    // pw_kpa must be > 0
    return (243.04 * Math.log(pw_kpa / 0.61094)) / (17.625 - Math.log(pw_kpa / 0.61094));
  }
  function findTwb_bisection(T, W_given, p_kpa, tol = 1e-6, maxIter = 100) {
    // compute pw from W
    const pw = (W_given * p_kpa) / (0.622 + W_given);
    // dew point as lower bound (safe)
    let a = dew_point_from_pw(pw);
    let b = T; // upper bound
    // ensure f(a) and f(b) have opposite signs
    let fa = Wcalc_from_Twb(T, a, p_kpa) - W_given;
    let fb = Wcalc_from_Twb(T, b, p_kpa) - W_given;
    // if no sign change, expand bounds a bit or fail gracefully
    if (!(fa * fb <= 0)) {
      // fallback: try slightly below dew and slightly above T
      a = Math.min(a, T - 100);
      b = Math.max(b, T + 5);
      fa = Wcalc_from_Twb(T, a, p_kpa) - W_given;
      fb = Wcalc_from_Twb(T, b, p_kpa) - W_given;
      if (fa * fb > 0) {
        throw new Error('Bisection sign check failed; check inputs or formula (freezing case?)');
      }
    }
    let mid = (a + b) / 2;
    let fmid = Wcalc_from_Twb(T, mid, p_kpa) - W_given;
    let iter = 0;
    while ((Math.abs(fmid) > tol) && (iter < maxIter) && ((b - a) / 2 > 1e-7)) {
      if (fa * fmid <= 0) {
        b = mid;
        fb = fmid;
      } else {
        a = mid;
        fa = fmid;
      }
      mid = (a + b) / 2;
      fmid = Wcalc_from_Twb(T, mid, p_kpa) - W_given;
      iter++;
    }
    // return { Twb: mid, iterations: iter, residual: fmid };
    return mid;
  }
  Twb = findTwb_bisection(T, W, ptot); // °C

  // Specific Enthalpy (h)
  h = 1.006 * T + W * (2501 + 1.86 * T); // kg dry air

  // Specific Volume (v)
  v = 0.287042 * (T + 273.15) * (1 + 1.6078 * W) / ptot; // m³/kgda

  // Moist Air Density (ρ)
  p = (1 + W) / v; // kg/m³

  toFixedAll = 3

  // Display results
  document.querySelector(container).innerHTML = `
    <div><span>Dry Bulb Temperature (Tdb)</span><span>:</span><span>${T.toFixed(toFixedAll)}</span><span>°C</span></div>
    <div><span>Humidity Ratio (W)</span><span>:</span><span>${(W * 1000).toFixed(toFixedAll)}</span><span>g<sub>w</sub>/kg<sub>da</sub></span></div>
    <div><span>Vapor Pressure (pw)</span><span>:</span><span>${pw.toFixed(toFixedAll)}</span><span>kPa</span></div>
    <div><span>Saturation Vapor Pressure (pws)</span><span>:</span><span>${pws.toFixed(toFixedAll)}</span><span>kPa</span></div>
    <div><span>Relative Humidity (ϕ)</span><span>:</span><span>${(phi * 100).toFixed(toFixedAll)}</span><span>%</span></div>
    <div><span>Saturation Humidity Ratio (Ws)</span><span>:</span><span>${Ws.toFixed(toFixedAll)}</span><span>kg/kg</span></div>
    <div><span>Degree of Saturation (μ)</span><span>:</span><span>${(mu * 100).toFixed(toFixedAll)}</span><span>%</span></div>
    <div><span>Dew Point Temperature (Tdew)</span><span>:</span><span>${Tdew.toFixed(toFixedAll)}</span><span>°C</span></div>
    <div><span>Wet Bulb Temperature (Twb)</span><span>:</span><span>${Twb.toFixed(toFixedAll)}</span><span>°C</span></div>
    <div><span>Specific Enthalpy (h)</span><span>:</span><span>${h.toFixed(toFixedAll)}</span><span>kJ/kg</span></div>
    <div><span>Specific Volume (v)</span><span>:</span><span>${v.toFixed(toFixedAll)}</span><span>m³/kg</span></div>
    <div><span>Moist Air Density (ρ)</span><span>:</span><span>${p.toFixed(toFixedAll)}</span><span>kg/m³</span></div>
  `;

}

const graphOutline = document.querySelector('.graph-outline');
const marker = document.querySelector('.moving-marker');
const fixedMarkerGroup = document.getElementById('custom-marker');
const infoMarker = document.querySelector('#info-marker');

// move marker to cursor position
function moveMarker(event) {
  const svg = event.target.closest('svg');
  const svgRect = svg.getBoundingClientRect();
  const xPercent = (event.clientX - svgRect.left) / svgRect.width * 100;
  const yPercent = (event.clientY - svgRect.top) / svgRect.height * 100;

  const cx = xPercent / 100 * 2988;
  const cy = yPercent / 100 * 2273;

  marker.setAttribute('cx', cx);
  marker.setAttribute('cy', cy);

  const cxValue = (31 * Number(cx) - 22190) / 1407;
  const cyValue = -0.01246 * Number(cy) + 26.73;
  calculate(cxValue, cyValue, '.results');
}

graphOutline.addEventListener('mouseover', () => {
  graphOutline.addEventListener('mousemove', (event) => {
    moveMarker(event);
  });
});

let number = 1;

graphOutline.addEventListener('click', () => {
  if (document.querySelector('#info-marker .no-marker')) {
    infoMarker.innerHTML = '';
  }
  const cx = marker.getAttribute('cx');
  const cy = marker.getAttribute('cy');

  const placedMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  placedMarker.setAttribute('cx', cx);
  placedMarker.setAttribute('cy', cy);
  placedMarker.setAttribute('class', `placed-marker number-${number}`);
  fixedMarkerGroup.appendChild(placedMarker);

  const item = document.createElement('span');
  item.classList.add(`marker-item`);
  item.classList.add(`number-${number}`);
  item.innerHTML = `${number}`;
  infoMarker.appendChild(item);
  number++;
  showMarkerInfo();
});

graphOutline.addEventListener('mouseout', () => {
  graphOutline.removeEventListener('mousemove', moveMarker);
});

// stop moveMarker when cursor hovered to custom-marker
fixedMarkerGroup.addEventListener('mouseover', () => {
  graphOutline.removeEventListener('mousemove', moveMarker);
});

function showMarkerInfo() {
  const markerItems = document.querySelectorAll('.marker-item');
  const markers = document.querySelectorAll('.placed-marker');
  const borderMarker = document.querySelector('.border-marker');

  function toggleShow(item, isMarker) {
    const classList = Array.from(item.classList);
    const numberClass = classList.find(cls => cls.startsWith('number-'));
    const markerNumber = numberClass ? numberClass.split('-')[1] : null;

    // Check if the item/marker is already shown
    const isItemShown = item.classList.contains('show');

    // Remove 'show' from all item/marker
    markerItems.forEach(i => i.classList.remove('show'));
    markers.forEach(m => m.classList.remove('show'));

    // If already shown, simply remove 'show'
    if (isItemShown) {
      document.querySelector('.marker-detail').innerHTML = ``;
      const selectedMarker = document.querySelector(`.placed-marker.number-${markerNumber}`);
      selectedMarker.classList.remove('show');
      borderMarker.setAttribute("cx", 0);
      borderMarker.setAttribute("cy", 0);
    } else {
      // Show the selected item/marker
      item.classList.add('show');
      if (isMarker) {
        const selectedItem = document.querySelector(`.marker-item.number-${markerNumber}`);
        selectedItem.classList.add('show');
      } else {
        const selectedMarker = document.querySelector(`.placed-marker.number-${markerNumber}`);
        selectedMarker.classList.add('show');
      }

      // Move border-marker to selected marker position
      const targetMarker = isMarker ? item : document.querySelector(`.placed-marker.number-${markerNumber}`);
      const cx = targetMarker.getAttribute("cx");
      const cy = targetMarker.getAttribute("cy");
      borderMarker.setAttribute("cx", cx);
      borderMarker.setAttribute("cy", cy);

      const cxValue = (31 * Number(cx) - 22190) / 1407;
      const cyValue = -0.01246 * Number(cy) + 26.73;
      calculate(cxValue, cyValue, `.marker-detail`);
    }
  }

  markerItems.forEach(item => {
    item.onclick = () => toggleShow(item, false);
  });

  markers.forEach(marker => {
    marker.onclick = () => toggleShow(marker, true);
  });
}

///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////

// Data Struktur untuk Definisi Kombinasi yang Diizinkan (Symmetrical)
// Kunci (key) adalah kode parameter, Nilai (value) adalah daftar kode parameter yang diizinkan berpasangan dengannya.
// Semua kombinasi dijamin bolak-balik (simetris).
const connectionList = {
  'Tdb': ['W', 'pw', 'phi', 'Tdew', 'Twb', 'h', 'v', 'rho', 'mu'], // all
  'W': ['Tdb', 'phi', 'Twb', 'h', 'v', 'rho'], // no mu, tdew
  'pw': ['Tdb', 'phi', 'Twb', 'h', 'v', 'rho'], // no mu, tdew
  'phi': ['Tdb', 'W', 'pw', 'rho', 'mu'], // no Tdew, Twb, h, v
  'mu': ['Tdb', 'Twb', 'v', 'rho'], // no W, pw, phi, Tdew, h
  'Tdew': ['Tdb', 'Twb', 'h', 'v', 'rho'], // no W, pw, phi, mu
  'Twb': ['Tdb', 'W', 'pw', 'Tdew', 'h', 'v', 'rho', 'mu'], // no phi
  'h': ['Tdb', 'W', 'pw', 'Tdew', 'Twb', 'v', 'rho',], // no phi, mu
  'v': ['Tdb', 'W', 'pw', 'Tdew', 'Twb', 'h', 'mu'], // no phi, rho
  'rho': ['Tdb', 'W', 'pw', 'phi', 'Tdew', 'Twb', 'h', 'mu'], // no v
};

// Pemetaan untuk nama yang lebih mudah dibaca dan simbol (Unicode/HTML Entity)
const displayNames = {
  'Tdb': ['Dry Bulb Temperature (Tdb)', '°C'],
  'W': ['Humidity Ratio (W)', 'g<sub>w</sub>/kg<sub>da</sub>'],
  'pw': ['Vapor Pressure (pw)', 'kPa'],
  'phi': ['Relative Humidity (ϕ / phi)', '%'],
  'mu': ['Degree of Saturation (μ / mu)', '%'],
  'Tdew': ['Dew Point Temperature (Tdew)', '°C'],
  'Twb': ['Wet Bulb Temperature (Twb)', '°C'],
  'h': ['Specific Enthalpy (h)', 'kJ/kg'],
  'v': ['Specific Volume (v)', 'm³/kg'],
  'rho': ['Moist Air Density (ρ / rho)', 'kg/m³'],
};

const select1 = document.getElementById('select1');
const select2 = document.getElementById('select2');
let param1, param2;

// Fungsi untuk mengisi opsi di Select 1
function populateSelect1() {
  // Ambil semua kunci (Tdb, W, pw, dll.)
  const keys = Object.keys(displayNames);

  keys.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.innerHTML = displayNames[key][0];
    select1.appendChild(option);
  });
}

// Fungsi utama untuk memfilter dan mengisi opsi di Select 2
function filterAndPopulateSelect2(selectedKey) {
  // 1. Reset Select 2
  select2.innerHTML = '<option value="" disabled selected>Select second parameter</option>';
  select2.disabled = true;
  select2.selectedIndex = 0; // Pastikan kembali ke opsi default

  // Jika Select 1 belum dipilih, keluar dari fungsi
  if (!selectedKey) return;

  // 2. Dapatkan daftar pasangan yang diizinkan
  const allowedPartners = connectionList[selectedKey] || [];

  // 3. Aktifkan Select 2
  select2.disabled = false;

  // 4. Isi Select 2 dengan opsi yang diizinkan
  allowedPartners.forEach(partnerKey => {
    // Pastikan opsi yang dipilih di Select 1 tidak muncul di Select 2
    if (partnerKey !== selectedKey) {
      const option = document.createElement('option');
      option.value = partnerKey;
      option.innerHTML = displayNames[partnerKey][0];
      select2.appendChild(option);
    }
  });
}

// Mengatur nilai default kedua select secara programatis
function defaultSelect(p1Key, p2Key) {
  // 1. Cek apakah kedua kunci valid
  if (!connectionList[p1Key] || !connectionList[p1Key].includes(p2Key)) {
    console.error(`Invalid combination: ${p1Key} dan ${p2Key}`);
    return;
  }

  // 2. Atur nilai Select 1
  select1.value = p1Key;
  param1 = p1Key;

  // 3. Filter dan isi Select 2 berdasarkan Select 1
  filterAndPopulateSelect2(p1Key);

  // 4. Atur nilai Select 2 (harus dilakukan setelah Select 2 diisi ulang)
  select2.value = p2Key;
  param2 = p2Key

  console.log(`${param1} dan ${param2}`);
}

// --- Event Listeners ---

const param1Unit = document.querySelector('.x-input span'),
      param2Unit = document.querySelector('.y-input span');

// Ketika Select 1 berubah, filter Select 2
select1.addEventListener('change', () => {
  const selectedKey = select1.value;
  param1Unit.innerHTML = displayNames[selectedKey][1];
  filterAndPopulateSelect2(selectedKey);
});

select2.addEventListener('change', () => {
  const selectedKey = select2.value;
  param2Unit.innerHTML = displayNames[selectedKey][1];
});

// --- Inisialisasi ---
document.addEventListener('DOMContentLoaded', () => {
  populateSelect1();
  // Aktifkan default select
  // defaultSelect('Tdb', 'W');
  // Panggil filterAndPopulateSelect2 secara eksplisit untuk memastikan Select 2 dinonaktifkan di awal
  filterAndPopulateSelect2(select1.value);
});

///////////////////////////////////////////////////////////////
// === Fungsi Baru: Hitung Tdb & W dari dua parameter apa pun ===
///////////////////////////////////////////////////////////////
function calculateTdbW(param1, val1, param2, val2) {
  const p = 101.325; // kPa total pressure (fixed)
  const A = String(param1);
  const B = String(param2);
  const vA = Number(val1);
  const vB = Number(val2);

  // ----- helpers -----
  const pws = (T) => 0.61094 * Math.exp((17.625 * T) / (T + 243.04)); // kPa
  const T_from_pws = (pw) => (243.04 * Math.log(pw / 0.61094)) / (17.625 - Math.log(pw / 0.61094));
  const W_from_pw = (pw) => 0.622 * pw / (p - pw); // kg/kg
  const pw_from_W = (W) => (W * p) / (0.622 + W); // kPa
  const Ws_from_T = (T) => 0.622 * pws(T) / (p - pws(T)); // kg/kg
  const h_from_TW = (T, W) => 1.006 * T + W * (2501 + 1.86 * T); // kJ/kg
  const v_from_TW = (T, W) => 0.287042 * (T + 273.15) * (1 + 1.6078 * W) / p; // m3/kg

  // Wet-bulb relation (lecture) -> compute Wcalc given T and Twb
  function Wcalc_from_T_and_Twb(T, Twb) {
    const WsTwb = Ws_from_T(Twb);
    const num = (2501 - 2.326 * Twb) * WsTwb - 1.006 * (T - Twb);
    const den = 2501 + 1.86 * T - 4.186 * Twb;
    return num / den; // kg/kg
  }

  // robust bisection for scalar root of f on [a,b]
  function bisection(f, a, b, tol = 1e-7, maxIter = 100) {
    let fa = f(a), fb = f(b);
    if (isNaN(fa) || isNaN(fb)) throw new Error('bisection: f(a) or f(b) is NaN');
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb > 0) throw new Error('bisection: no sign change on interval');
    let L = a, R = b, mid, fm;
    for (let i = 0; i < maxIter; i++) {
      mid = 0.5 * (L + R);
      fm = f(mid);
      if (Math.abs(fm) < tol) return mid;
      if (fa * fm <= 0) {
        R = mid; fb = fm;
      } else {
        L = mid; fa = fm;
      }
    }
    return 0.5 * (L + R);
  }

  // small helper to read values and convert units where necessary:
  function readW_input_raw(keyVal) {
    // input W expected in g/kg (UI), convert to kg/kg
    return keyVal / 1000;
  }
  function outW_as_gkg(Wkg) {
    return Wkg * 1000; // convert back to g/kg for caller (calculate expects yValue in g/kg)
  }

  // convenience get function
  function valOf(key) {
    if (A === key) return vA;
    if (B === key) return vB;
    return null;
  }

  // -------------------------
  // CASES: handle all allowed symmetric combos
  // Note: wherever we accept 'phi' input we expect percent (0-100). Convert to fraction by phi/100.
  // Wherever 'W' is provided by user, assume it's g/kg (UI); convert to kg/kg internally.
  // Return: { Tdb (°C), W (g/kg) }
  // -------------------------

  // 1) If Tdb is provided -> many algebraic paths (Tdb combined with many others)
  if (A === 'Tdb' || B === 'Tdb') {
    const Tdb = valOf('Tdb');

    // If W is provided (user input W in g/kg)
    if (A === 'W' || B === 'W') {
      const W_in = valOf('W');
      const Wkg = readW_input_raw(W_in);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & phi (phi in percent)
    if (A === 'phi' || B === 'phi') {
      const phi_percent = valOf('phi');
      const phi_frac = phi_percent / 100;
      const pw = phi_frac * pws(Tdb);
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & pw (pw in kPa)
    if (A === 'pw' || B === 'pw') {
      const pw = valOf('pw');
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & Tdew
    if (A === 'Tdew' || B === 'Tdew') {
      const Tdew = valOf('Tdew');
      const pw = pws(Tdew);
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & Twb -> get W by wet-bulb eq
    if (A === 'Twb' || B === 'Twb') {
      const Twb = valOf('Twb');
      // compute Wkg directly
      const Wkg = Wcalc_from_T_and_Twb(Tdb, Twb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & h (h in kJ/kg)
    if (A === 'h' || B === 'h') {
      const h = valOf('h');
      const Wkg = (h - 1.006 * Tdb) / (2501 + 1.86 * Tdb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & v (v m3/kg)
    if (A === 'v' || B === 'v') {
      const v = valOf('v');
      const Acoef = (v * p) / (0.287042 * (Tdb + 273.15)); // equals (1 + 1.6078 W)
      const Wkg = (Acoef - 1) / 1.6078;
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & rho (rho in kg/m3)
    if (A === 'rho' || B === 'rho') {
      const rho = valOf('rho');
      // derive algebraic from rho = (1+W)/v and v formula
      // solve for Wkg: Wkg = (rho*(0.287042*(T+273.15)) - p) / (p - 1.6078*rho*(0.287042*(T+273.15)))
      const term = 0.287042 * (Tdb + 273.15);
      const numerator = rho * term - p;
      const denom = p - 1.6078 * rho * term;
      const Wkg = numerator / denom;
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // Tdb & mu (mu in percent)
    if (A === 'mu' || B === 'mu') {
      const mu_percent = valOf('mu');
      const mu_frac = mu_percent / 100;
      const WsVal = Ws_from_T(Tdb);
      const Wkg = mu_frac * WsVal;
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // if reached here, not implemented for Tdb+other
  } // end Tdb present

  // 2) If W is provided (user supplies W in g/kg) and Tdb not provided
  if (A === 'W' || B === 'W') {
    const W_input_gkg = valOf('W');
    const Wkg = readW_input_raw(W_input_gkg);

    // W & phi  -> compute pw from W then pws->T
    if (A === 'phi' || B === 'phi') {
      const phi_percent = valOf('phi');
      const phi_frac = phi_percent / 100;
      const pw = pw_from_W(Wkg);
      // pws(T) must equal pw/phi_frac -> invert
      const target_pws = pw / phi_frac;
      const Tdb = T_from_pws(target_pws);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // W & Twb -> find Tdb such that Wcalc(Tdb, Twb) = Wkg
    if (A === 'Twb' || B === 'Twb') {
      const Twb = valOf('Twb');
      // search T in [Twb, 200]
      const f = (T) => Wcalc_from_T_and_Twb(T, Twb) - Wkg;
      try {
        const Tdb = bisection(f, Twb - 50, 200);
        return { Tdb, W: outW_as_gkg(Wkg) };
      } catch (e) {
        throw new Error('W & Twb numeric solve failed: ' + e.message);
      }
    }

    // W & h -> algebraic for T
    if (A === 'h' || B === 'h') {
      const h = valOf('h');
      const Tdb = (h - 2501 * Wkg) / (1.006 + 1.86 * Wkg);
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // W & v -> algebraic for T
    if (A === 'v' || B === 'v') {
      const v = valOf('v');
      const Tdb = (v * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // W & rho -> algebraic for T
    if (A === 'rho' || B === 'rho') {
      const rho = valOf('rho');
      const Tdb = ((1 + Wkg) * p) / (rho * 0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    }

    // W & pw -> redundant if consistent; cannot determine T uniquely
    if (A === 'pw' || B === 'pw') {
      const pw_in = valOf('pw');
      const pw_fromW = pw_from_W(Wkg);
      if (Math.abs(pw_in - pw_fromW) < 1e-6) {
        throw new Error('W & pw redundant: pw matches W (no unique Tdb).');
      } else {
        throw new Error('W & pw inconsistent.');
      }
    }

    // W & mu -> redundant (mu depends on T: cannot get T)
    // if (A === 'mu' || B === 'mu') {
    //   throw new Error('W & mu insufficient to determine Tdb uniquely (mu depends on T)');
    // }

    // done W cases
  }

  // 3) Cases with neither Tdb nor W provided (both unknown) — numeric reduces

  // pw & phi -> pws = pw/phi -> invert pws -> Tdb ; W from pw
  if ((A === 'pw' && B === 'phi') || (A === 'phi' && B === 'pw')) {
    const pw = valOf('pw'), phi_percent = valOf('phi');
    const phi_frac = phi_percent / 100;
    const target_pws = pw / phi_frac;
    const Tdb = T_from_pws(target_pws);
    const Wkg = W_from_pw(pw);
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // pw & Twb -> W from pw; find T s.t. Wcalc(T,Twb)=W_from_pw(pw)
  if ((A === 'pw' && B === 'Twb') || (A === 'Twb' && B === 'pw')) {
    const pw = valOf('pw'); const Twb = valOf('Twb');
    const Wkg = W_from_pw(pw);
    const f = (T) => Wcalc_from_T_and_Twb(T, Twb) - Wkg;
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('pw & Twb numeric solve failed: ' + e.message);
    }
  }

  // pw & h -> W from pw ; T from h linear
  if ((A === 'pw' && B === 'h') || (A === 'h' && B === 'pw')) {
    const pw = valOf('pw'), h = valOf('h');
    const Wkg = W_from_pw(pw);
    const Tdb = (h - 2501 * Wkg) / (1.006 + 1.86 * Wkg);
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // pw & v -> W from pw ; T from v algebraic
  if ((A === 'pw' && B === 'v') || (A === 'v' && B === 'pw')) {
    const pw = valOf('pw'), v = valOf('v');
    const Wkg = W_from_pw(pw);
    const Tdb = (v * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // pw & rho -> same idea
  if ((A === 'pw' && B === 'rho') || (A === 'rho' && B === 'pw')) {
    const pw = valOf('pw'), rho = valOf('rho');
    const Wkg = W_from_pw(pw);
    const Tdb = ((1 + Wkg) * p) / (rho * 0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // phi & Twb -> numeric: find T s.t. Wcalc(T,Twb) == W_from_pw(phi * pws(T))
  if ((A === 'phi' && B === 'Twb') || (A === 'Twb' && B === 'phi')) {
    const phi_percent = valOf('phi'); const Twb = valOf('Twb');
    const phi_frac = phi_percent / 100;
    // f(T) = Wcalc(T,Twb) - W_from_pw(phi_frac * pws(T))
    const f = (T) => {
      const wcalc = Wcalc_from_T_and_Twb(T, Twb);
      const pw = phi_frac * pws(T);
      const wphi = W_from_pw(pw);
      return wcalc - wphi;
    };
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      const pw = phi_frac * pws(Tdb);
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('phi & Twb numeric solve failed: ' + e.message);
    }
  }

  // phi & v  -> numeric: solve T such that v_from_TW(T, W_from_pw(phi*pws(T))) == v_target
  if ((A === 'phi' && B === 'v') || (A === 'v' && B === 'phi')) {
    const phi_percent = valOf('phi'); const v_target = valOf('v');
    const phi_frac = phi_percent / 100;
    const f = (T) => {
      const pw = phi_frac * pws(T);
      const Wkg = W_from_pw(pw);
      const vcalc = v_from_TW(T, Wkg);
      return vcalc - v_target;
    };
    try {
      const Tdb = bisection(f, -50, 200);
      const pw = phi_frac * pws(Tdb);
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('phi & v numeric solve failed: ' + e.message);
    }
  }

  // phi & rho -> numeric (similar to phi&v)
  if ((A === 'phi' && B === 'rho') || (A === 'rho' && B === 'phi')) {
    const phi_percent = valOf('phi'); const rho_target = valOf('rho');
    const phi_frac = phi_percent / 100;
    const f = (T) => {
      const pw = phi_frac * pws(T);
      const Wkg = W_from_pw(pw);
      const vcalc = v_from_TW(T, Wkg);
      const rhocalc = (1 + Wkg) / vcalc;
      return rhocalc - rho_target;
    };
    try {
      const Tdb = bisection(f, -50, 200);
      const pw = phi_frac * pws(Tdb);
      const Wkg = W_from_pw(pw);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('phi & rho numeric solve failed: ' + e.message);
    }
  }

  // phi & h -> already implemented in your prior code; include robust bisection
  if ((A === 'phi' && B === 'h') || (A === 'h' && B === 'phi')) {
    const phi_percent = valOf('phi'); const h_target = valOf('h');
    const phi_frac = phi_percent / 100;
    const f = (T) => {
      const pw = phi_frac * pws(T);
      const Wkg = W_from_pw(pw);
      return h_from_TW(T, Wkg) - h_target;
    };
    try {
      const Tdb = bisection(f, -50, 200);
      const Wkg = W_from_pw(phi_frac * pws(Tdb));
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('phi & h numeric solve failed: ' + e.message);
    }
  }

  // Tdew & Twb -> Tdew => Wkg; find T where Wcalc(T,Twb)=Wkg
  if ((A === 'Tdew' && B === 'Twb') || (A === 'Twb' && B === 'Tdew')) {
    const Tdew = valOf('Tdew'); const Twb = valOf('Twb');
    const pw = pws(Tdew);
    const Wkg = W_from_pw(pw);
    const f = (T) => Wcalc_from_T_and_Twb(T, Twb) - Wkg;
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('Tdew & Twb numeric solve failed: ' + e.message);
    }
  }

  // Tdew & h (Tdew->W, h->T linear)
  if ((A === 'Tdew' && B === 'h') || (A === 'h' && B === 'Tdew')) {
    const Tdew = valOf('Tdew'), h = valOf('h');
    const Wkg = W_from_pw(pws(Tdew));
    const Tdb = (h - 2501 * Wkg) / (1.006 + 1.86 * Wkg);
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // Tdew & v
  if ((A === 'Tdew' && B === 'v') || (A === 'v' && B === 'Tdew')) {
    const Tdew = valOf('Tdew'), v = valOf('v');
    const Wkg = W_from_pw(pws(Tdew));
    const Tdb = (v * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // Tdew & rho
  if ((A === 'Tdew' && B === 'rho') || (A === 'rho' && B === 'Tdew')) {
    const Tdew = valOf('Tdew'), rho = valOf('rho');
    const Wkg = W_from_pw(pws(Tdew));
    const Tdb = ((1 + Wkg) * p) / (rho * 0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // Twb & h -> numeric (solve T so that h(T, Wcalc(T,Twb)) == h_target)
  if ((A === 'Twb' && B === 'h') || (A === 'h' && B === 'Twb')) {
    const Twb = valOf('Twb'), h_target = valOf('h');
    const f = (T) => {
      const Wkg = Wcalc_from_T_and_Twb(T, Twb);
      return h_from_TW(T, Wkg) - h_target;
    };
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      const Wkg = Wcalc_from_T_and_Twb(Tdb, Twb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('Twb & h numeric solve failed: ' + e.message);
    }
  }

  // Twb & v -> numeric (solve T so that v(T, Wcalc(T,Twb)) == v_target)
  if ((A === 'Twb' && B === 'v') || (A === 'v' && B === 'Twb')) {
    const Twb = valOf('Twb'), v_target = valOf('v');
    const f = (T) => {
      const Wkg = Wcalc_from_T_and_Twb(T, Twb);
      return v_from_TW(T, Wkg) - v_target;
    };
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      const Wkg = Wcalc_from_T_and_Twb(Tdb, Twb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('Twb & v numeric solve failed: ' + e.message);
    }
  }

  // Twb & rho -> numeric (similar)
  if ((A === 'Twb' && B === 'rho') || (A === 'rho' && B === 'Twb')) {
    const Twb = valOf('Twb'), rho_target = valOf('rho');
    const f = (T) => {
      const Wkg = Wcalc_from_T_and_Twb(T, Twb);
      const vcalc = v_from_TW(T, Wkg);
      const rhocalc = (1 + Wkg) / vcalc;
      return rhocalc - rho_target;
    };
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      const Wkg = Wcalc_from_T_and_Twb(Tdb, Twb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('Twb & rho numeric solve failed: ' + e.message);
    }
  }

  // Twb & mu -> numeric (mu percent)
  if ((A === 'Twb' && B === 'mu') || (A === 'mu' && B === 'Twb')) {
    const Twb = valOf('Twb'), mu_percent = valOf('mu');
    const mu_frac = mu_percent / 100;
    // f(T) = Wcalc(T,Twb)/Ws(T) - mu_frac
    const f = (T) => {
      const Wkg = Wcalc_from_T_and_Twb(T, Twb);
      const WsT = Ws_from_T(T);
      return (Wkg / WsT) - mu_frac;
    };
    try {
      const Tdb = bisection(f, Twb - 50, 200);
      const Wkg = Wcalc_from_T_and_Twb(Tdb, Twb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('Twb & mu numeric solve failed: ' + e.message);
    }
  }

  // h & v -> numeric: reduce to W unknown (T = f(W) from v => substitute into h)
  if ((A === 'h' && B === 'v') || (A === 'v' && B === 'h')) {
    const h_target = valOf('h'), v_target = valOf('v');
    const g = (Wkg) => {
      const T = (v_target * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return h_from_TW(T, Wkg) - h_target;
    };
    try {
      const Wkg = bisection(g, 1e-9, 0.5); // realistic bounds
      const Tdb = (v_target * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('h & v numeric solve failed: ' + e.message);
    }
  }

  // h & rho -> numeric: similar to h&v but v = (1+W)/rho_target
  if ((A === 'h' && B === 'rho') || (A === 'rho' && B === 'h')) {
    const h_target = valOf('h'), rho_target = valOf('rho');
    const g = (Wkg) => {
      const vcalc = (1 + Wkg) / rho_target;
      const T = (vcalc * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return h_from_TW(T, Wkg) - h_target;
    };
    try {
      const Wkg = bisection(g, 1e-9, 0.5);
      const vcalc = (1 + Wkg) / rho_target;
      const Tdb = (vcalc * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('h & rho numeric solve failed: ' + e.message);
    }
  }

  // h & mu -> numeric: mu = W / Ws(T) and h(T,W) known => solve for T
  if ((A === 'h' && B === 'mu') || (A === 'mu' && B === 'h')) {
    const h_target = valOf('h'), mu_percent = valOf('mu');
    const mu_frac = mu_percent / 100;
    // f(T) = h(T, mu*Ws(T)) - h_target
    const f = (T) => {
      const WsT = Ws_from_T(T);
      const Wkg = mu_frac * WsT;
      return h_from_TW(T, Wkg) - h_target;
    };
    try {
      const Tdb = bisection(f, -50, 200);
      const Wkg = (mu_frac) * Ws_from_T(Tdb);
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('h & mu numeric solve failed: ' + e.message);
    }
  }

  // v & pw -> W from pw then T from v
  if ((A === 'v' && B === 'pw') || (A === 'pw' && B === 'v')) {
    const v_target = valOf('v'), pw = valOf('pw');
    const Wkg = W_from_pw(pw);
    const Tdb = (v_target * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // rho & pw -> W from pw then T from rho
  if ((A === 'rho' && B === 'pw') || (A === 'pw' && B === 'rho')) {
    const rho_target = valOf('rho'), pw = valOf('pw');
    const Wkg = W_from_pw(pw);
    const Tdb = ((1 + Wkg) * p) / (rho_target * 0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
    return { Tdb, W: outW_as_gkg(Wkg) };
  }

  // mu & pw -> pw gives W, mu then becomes check (can be inconsistent)
  // if ((A === 'mu' && B === 'pw') || (A === 'pw' && B === 'mu')) {
  //   const mu_percent = valOf('mu'); const pw = valOf('pw');
  //   const mu_frac = mu_percent / 100;
  //   const Wkg = W_from_pw(pw);
  //   // if mu inconsistent, still return Tdew/W from pw but warn
  //   const ws_at_Tdew = null; // can't compute Tdb unless more info
  //   return { Tdb: NaN, W: outW_as_gkg(Wkg) };
  // }

  // mu & v -> numeric: mu gives relation W=mu*Ws(T); v gives relation T in terms of W -> solve for W
  if ((A === 'mu' && B === 'v') || (A === 'v' && B === 'mu')) {
    const mu_percent = valOf('mu'), v_target = valOf('v');
    const mu_frac = mu_percent / 100;
    const g = (Wkg) => {
      const T = (v_target * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      const WsT = Ws_from_T(T);
      return Wkg - mu_frac * WsT;
    };
    try {
      const Wkg = bisection(g, 1e-9, 0.5);
      const Tdb = (v_target * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('mu & v numeric solve failed: ' + e.message);
    }
  }

  // mu & rho -> numeric similar to mu & v
  if ((A === 'mu' && B === 'rho') || (A === 'rho' && B === 'mu')) {
    const mu_percent = valOf('mu'), rho_target = valOf('rho');
    const mu_frac = mu_percent / 100;
    const g = (Wkg) => {
      // v = (1+W)/rho_target ; T = ...
      const vcalc = (1 + Wkg) / rho_target;
      const T = (vcalc * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      const WsT = Ws_from_T(T);
      return Wkg - mu_frac * WsT;
    };
    try {
      const Wkg = bisection(g, 1e-9, 0.5);
      const vcalc = (1 + Wkg) / rho_target;
      const Tdb = (vcalc * p) / (0.287042 * (1 + 1.6078 * Wkg)) - 273.15;
      return { Tdb, W: outW_as_gkg(Wkg) };
    } catch (e) {
      throw new Error('mu & rho numeric solve failed: ' + e.message);
    }
  }

  // If we reach here, pair not implemented
  console.warn(`calculateTdbW: combination (${A}, ${B}) not implemented or not supported.`);
  return { Tdb: NaN, W: NaN };
}

let param1Value = document.getElementById('x-input'),
    param2Value = document.getElementById('y-input');

const handleChange = () => {
  param1 = select1.value;
  param2 = select2.value;
  param1Value = document.getElementById('x-input').value;
  param2Value = document.getElementById('y-input').value;
  if (param2.length > 0) {
    if (param1Value.length > 0 && param2Value.length > 0) {
      console.log(`Calculating for ${param1}=${param1Value} and ${param2}=${param2Value}`);
      const { Tdb, W } = calculateTdbW(param1, param1Value, param2, param2Value);
      calculate(Tdb, W, ".input");

      const xValue = 45.38709677419355 * Tdb + 715.8064516129032;
      document.querySelector('.input-marker').setAttribute('cx', xValue);
      const yValue = -80.15384615384616 * W + 2144;
      document.querySelector('.input-marker').setAttribute('cy', yValue);
    }
  }
};

select1.addEventListener('change', handleChange);
select2.addEventListener('change', handleChange);
param1Value.addEventListener('change', handleChange);
param2Value.addEventListener('change', handleChange);