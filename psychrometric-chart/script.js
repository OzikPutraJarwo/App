const chartContainer = document.getElementById('chart');
const chart = document.getElementById('chartImage');
const marker = document.getElementById('marker');
const form = document.getElementById('manualForm');

const elements = {
  dryBulb: document.getElementById('dryBulb'),
  humidityRatio: document.getElementById('humidityRatio'),
  enthalpy: document.getElementById('enthalpy'),
  rh: document.getElementById('rh'),
  dewPoint: document.getElementById('dewPoint'),
  wetBulb: document.getElementById('wetBulb'),
  vp: document.getElementById('vp'),
  vSpec: document.getElementById('vSpec'),
};

let isTracking = false;
let markerMode = 'single';
let currentX = 0;
let currentY = 0;

document.querySelectorAll('input[name="markerMode"]').forEach(radio => {
  radio.addEventListener('change', function () {
    markerMode = this.value;
    if (markerMode === 'single') {
      document.querySelectorAll('.extra-marker').forEach(m => m.remove());
    }
  });
});

// Combinations
const validCombinations = new Set([
  'dryBulb-humidityRatio',
  'dryBulb-rh',
  'dryBulb-dewPoint',
  'dryBulb-enthalpy',
  'dryBulb-vp',
  'dryBulb-vSpec',
  'enthalpy-rh',
  'rh-dewPoint',
  'rh-vp'
]);

const isValidPair = (a, b) => validCombinations.has(`${a}-${b}`) || validCombinations.has(`${b}-${a}`);

const param1 = document.getElementById('param1');
const param2 = document.getElementById('param2');

const filterDropdownOptions = () => {
  const selected1 = param1.value;
  const selected2 = param2.value;

  [...param1.options].forEach(opt1 => {
    if (opt1.value === '') return;
    opt1.hidden = selected2 && !isValidPair(opt1.value, selected2);
  });

  [...param2.options].forEach(opt2 => {
    if (opt2.value === '') return;
    opt2.hidden = selected1 && !isValidPair(selected1, opt2.value);
  });
};

param1.addEventListener('change', () => {
  filterDropdownOptions();
  tryUpdateFromSelectedParams();
});
param2.addEventListener('change', () => {
  filterDropdownOptions();
  tryUpdateFromSelectedParams();
});

// Update Marker and Output
const updateFromValues = (dryBulb, humidityRatio) => {
  const width = chart.width;
  const height = chart.height;

  const x = ((dryBulb + 12.6) / 60) * width;
  const y = (1.07 - (humidityRatio / 0.030)) * height;

  marker.style.left = `${x}px`;
  marker.style.top = `${y}px`;
  marker.style.display = 'block';

  const h = 1.006 * dryBulb + humidityRatio * (2501 + 1.86 * dryBulb);
  const p_atm = 101.325;
  const pws = 0.61078 * Math.exp((17.27 * dryBulb) / (dryBulb + 237.3));
  const pv = (humidityRatio * p_atm) / (0.622 + humidityRatio);
  const rh = (pv / pws) * 95;

  const a = 17.27, b = 237.7;
  const alpha = Math.log(pv / 0.61078);
  const dewPoint = (b * alpha) / (a - alpha);

  const tw =  dryBulb * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
              Math.atan(dryBulb + rh) - Math.atan(rh - 1.676331) +
              0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;

  const R_da = 0.287042;
  const T_k = dryBulb + 273.15;
  const v = R_da * T_k * (1 + 1.6078 * humidityRatio) / p_atm;

  elements.dryBulb.textContent = dryBulb.toFixed(1);
  elements.humidityRatio.textContent = (humidityRatio * 1000).toFixed(1);
  elements.enthalpy.textContent = h.toFixed(1);
  elements.rh.textContent = rh.toFixed(1);
  elements.dewPoint.textContent = dewPoint.toFixed(1);
  elements.wetBulb.textContent = tw.toFixed(1);
  elements.vp.textContent = pv.toFixed(3);
  elements.vSpec.textContent = v.toFixed(3);
};

// Calc from Selected Params
const tryUpdateFromSelectedParams = () => {
  const p1 = param1.value;
  const p2 = param2.value;
  const v1 = parseFloat(document.getElementById('value1').value);
  const v2 = parseFloat(document.getElementById('value2').value);

  if (!p1 || !p2 || isNaN(v1) || isNaN(v2) || p1 === p2 || !isValidPair(p1, p2)) return;

  const params = {
    dryBulb: null,
    humidityRatio: null,
    rh: null,
    dewPoint: null,
    enthalpy: null,
    wetBulb: null,
    vp: null,
    vSpec: null,
  };

  params[p1] = v1;
  params[p2] = v2;

  const p_atm = 101.325;
  const pws = T => 0.61078 * Math.exp((17.27 * T) / (T + 237.3));

  const deriveFromDryBulbAndRH = (T, rh) => {
    const pws_val = pws(T);
    const pv = (rh / 100) * pws_val;
    const W = 0.622 * pv / (p_atm - pv);
    return [T, W];
  };

  const deriveFromDewPoint = T_dp => {
    const pv = pws(T_dp);
    return 0.622 * pv / (p_atm - pv);
  };

  const deriveFromEnthalpy = (h, T) => (h - 1.006 * T) / (2501 + 1.86 * T);

  let dryBulb = null;
  let humidityRatio = null;

  if (params.dryBulb != null && params.rh != null) {
    [dryBulb, humidityRatio] = deriveFromDryBulbAndRH(params.dryBulb, params.rh);
  } else if (params.dryBulb != null && params.humidityRatio != null) {
    dryBulb = params.dryBulb;
    humidityRatio = params.humidityRatio / 1000;
  } else if (params.rh != null && params.dewPoint != null) {
    const W = deriveFromDewPoint(params.dewPoint);
    for (let T = -10; T <= 60; T += 0.1) {
      const [testDB, testW] = deriveFromDryBulbAndRH(T, params.rh);
      if (Math.abs(testW - W) < 0.0005) {
        dryBulb = testDB;
        humidityRatio = testW;
        break;
      }
    }
  } else if (params.dryBulb != null && params.dewPoint != null) {
    const pv = pws(params.dewPoint);
    humidityRatio = 0.622 * pv / (p_atm - pv);
    dryBulb = params.dryBulb;
  } else if (params.dryBulb != null && params.enthalpy != null) {
    dryBulb = params.dryBulb;
    humidityRatio = deriveFromEnthalpy(params.enthalpy, dryBulb);
  } else if (params.enthalpy != null && params.rh != null) {
    for (let T = -10; T <= 60; T += 0.1) {
      const [testDB, testW] = deriveFromDryBulbAndRH(T, params.rh);
      const h = 1.006 * testDB + testW * (2501 + 1.86 * testDB);
      if (Math.abs(h - params.enthalpy) < 1) {
        dryBulb = testDB;
        humidityRatio = testW;
        break;
      }
    }
  } else if (params.dryBulb != null && params.vp != null) {
    const pv = params.vp;
    humidityRatio = 0.622 * pv / (p_atm - pv);
    dryBulb = params.dryBulb;
  } else if (params.rh != null && params.vp != null) {
    for (let T = -10; T <= 60; T += 0.1) {
      const pws_val = pws(T);
      const expectedVP = (params.rh / 100) * pws_val;
      if (Math.abs(expectedVP - params.vp) < 0.05) {
        dryBulb = T;
        humidityRatio = 0.622 * params.vp / (p_atm - params.vp);
        break;
      }
    }
  } else if (params.dryBulb != null && params.vSpec != null) {
    const T_k = params.dryBulb + 273.15;
    const R_da = 0.287042;
    humidityRatio = ((params.vSpec * p_atm) / (R_da * T_k) - 1) / 1.6078;
    dryBulb = params.dryBulb;
  }

  if (dryBulb != null && humidityRatio != null) {
    updateFromValues(dryBulb, humidityRatio);
  }
};

// Input listener
['value1', 'value2'].forEach(id => {
  document.getElementById(id).addEventListener('input', tryUpdateFromSelectedParams);
});

// Form submit
form.addEventListener('submit', function (e) {
  e.preventDefault();
  tryUpdateFromSelectedParams();
});

// Tracking start
chartContainer.addEventListener('mousedown', function (e) {
  if (e.button === 0) {
    isTracking = true;
  }
});

// Multi-marker
chartContainer.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  if (!isTracking) return;
  isTracking = false;

  if (markerMode === 'multi') {
    const clone = marker.cloneNode(true);
    clone.classList.remove('hide');
    clone.classList.add('extra-marker');
    clone.style.left = marker.style.left;
    clone.style.top = marker.style.top;
    chartContainer.appendChild(clone);
  }
});

// Track move
chartContainer.addEventListener('mousemove', function (e) {
  if (!isTracking) return;

  const rect = chart.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const width = chart.width;
  const height = chart.height;

  if (x < 0 || y < 0 || x > width || y > height) return;

  currentX = x;
  currentY = y;

  const dryBulb = -10 + (x / width) * 60;
  const humidityRatio = (1 - (y / height)) * 0.030;

  updateFromValues(dryBulb, humidityRatio);
});

// Download
document.getElementById('download').addEventListener('click', function () {
  html2canvas(chartContainer, {
    scale: 3,
    useCORS: true
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'psychrometric.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
});

// Tutorial
const toggleVisibility = () => {
  ['overlay', 'pop'].forEach(id => document.getElementById(id).classList.toggle('hide'));
};
['tutor', 'overlay', 'popclose'].forEach(id =>
  document.getElementById(id === 'close' ? 'close' : id).addEventListener('click', toggleVisibility)
);

// Filtering on page load
filterDropdownOptions();
