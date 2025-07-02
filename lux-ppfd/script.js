// ----- Utility Functions -----

const dataWrapper = document.getElementById('data');

// Responsive graph rendering
document.querySelectorAll('.wavelength').forEach(drawWavelengthGraph);
const ratio = parseFloat(document.querySelector('.wavelength').getAttribute('data-ratio')) || 2;
const resize = () => {
  document.querySelectorAll('.wavelength').forEach(container => {
    const width = container.parentElement.clientWidth;
    // container.style.height = `${width / ratio}px`;
    container.style.height = `100%`;
    container.innerHTML = '';
    drawWavelengthGraph(container);
  });
};
window.addEventListener('resize', resize); resize();

// ----- Graph Rendering -----
function drawWavelengthGraph(container) {
  const title = container.getAttribute('data-title') || "Spectrum";
  const dataAttr = container.getAttribute('data-wave');
  const dataPairs = dataAttr.split(',').map(d => {
    const [wave, val] = d.trim().split(':').map(Number);
    return { wavelength: wave, value: val };
  }).filter(d => d.wavelength >= 350 && d.wavelength <= 800);

  const width = container.clientWidth;
  const height = container.clientHeight;
  const margin = { top: 50, right: 20, bottom: 50, left: 30 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([350, 800])
    .range([0, graphWidth]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(dataPairs, d => d.value) * 1.1])
    .range([graphHeight, 0]);

  const gradientId = 'spectrum-' + Math.random().toString(36).substring(2, 9);
  const gradient = svg.append("defs")
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "100%").attr("y2", "0%");

  const colors = [
    { wavelength: 350, color: "rgb(0, 0, 0)" },
    { wavelength: 380, color: "rgb(97, 0, 97)" },
    { wavelength: 390, color: "rgb(121, 0, 141)" },
    { wavelength: 400, color: "rgb(131, 0, 181)" },
    { wavelength: 410, color: "rgb(126, 0, 219)" },
    { wavelength: 420, color: "rgb(106, 0, 255)" },
    { wavelength: 430, color: "rgb(61, 0, 255)" },
    { wavelength: 440, color: "rgb(0, 0, 255)" },
    { wavelength: 450, color: "rgb(0, 70, 255)" },
    { wavelength: 460, color: "rgb(0, 123, 255)" },
    { wavelength: 470, color: "rgb(0, 169, 255)" },
    { wavelength: 480, color: "rgb(0, 213, 255)" },
    { wavelength: 490, color: "rgb(0, 255, 255)" },
    { wavelength: 500, color: "rgb(0, 255, 146)" },
    { wavelength: 510, color: "rgb(0, 255, 0)" },
    { wavelength: 520, color: "rgb(54, 255, 0)" },
    { wavelength: 530, color: "rgb(94, 255, 0)" },
    { wavelength: 540, color: "rgb(129, 255, 0)" },
    { wavelength: 550, color: "rgb(163, 255, 0)" },
    { wavelength: 560, color: "rgb(195, 255, 0)" },
    { wavelength: 570, color: "rgb(225, 255, 0)" },
    { wavelength: 580, color: "rgb(255, 255, 0)" },
    { wavelength: 590, color: "rgb(255, 223, 0)" },
    { wavelength: 600, color: "rgb(255, 190, 0)" },
    { wavelength: 610, color: "rgb(255, 155, 0)" },
    { wavelength: 620, color: "rgb(255, 119, 0)" },
    { wavelength: 630, color: "rgb(255, 79, 0)" },
    { wavelength: 640, color: "rgb(255, 33, 0)" },
    { wavelength: 650, color: "rgb(250, 0, 0)" },
    { wavelength: 660, color: "rgb(241, 0, 0)" },
    { wavelength: 670, color: "rgb(232, 0, 0)" },
    { wavelength: 680, color: "rgb(223, 0, 0)" },
    { wavelength: 690, color: "rgb(214, 0, 0)" },
    { wavelength: 700, color: "rgb(205, 0, 0)" },
    { wavelength: 710, color: "rgb(196, 0, 0)" },
    { wavelength: 720, color: "rgb(187, 0, 0)" },
    { wavelength: 730, color: "rgb(177, 0, 0)" },
    { wavelength: 740, color: "rgb(168, 0, 0)" },
    { wavelength: 750, color: "rgb(158, 0, 0)" },
    { wavelength: 760, color: "rgb(148, 0, 0)" },
    { wavelength: 770, color: "rgb(138, 0, 0)" },
    { wavelength: 780, color: "rgb(128, 0, 0)" },
    { wavelength: 790, color: "rgb(118, 0, 0)" },
    { wavelength: 800, color: "rgb(107, 0, 0)" }
  ];

  colors.forEach(d => {
    gradient.append("stop")
      .attr("offset", `${(x(d.wavelength) - x(350)) / graphWidth * 100}%`)
      .attr("stop-color", d.color);
  });

  const area = d3.area()
    .x(d => x(d.wavelength))
    .y0(graphHeight)
    .y1(d => y(d.value))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(dataPairs)
    .attr("fill", `url(#${gradientId})`)
    .attr("stroke", "black")
    .attr("stroke-width", 1)
    .attr("d", area);

  g.append("g")
    .attr("transform", `translate(0,${graphHeight})`)
    .call(d3.axisBottom(x).tickValues(d3.range(350, 801, 50)).tickFormat(d => d + " nm"));

  g.append("g")
    .call(d3.axisLeft(y));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Wavelength (nm)");

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text(title);
}

// ----- Data Processing -----
document.querySelectorAll('.wavelength').forEach(waveEl => {
  const waveData = waveEl.getAttribute('data-wave');
  const luxContribConst = 683;

  const VlambdaCIE1931 = [ 
    // --- Data V(λ) dari 380 nm sampai 780 nm ---
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.000039,0.0000428264,0.0000469146,0.0000515896,0.0000571764,0.000064,0.00007234421,0.00008221224,0.00009350816,0.0001061361,0.00012,0.000134984,0.000151492,0.000170208,0.000191816,0.000217,0.0002469067,0.00028124,0.00031852,0.0003572667,0.000396,0.0004337147,0.000473024,0.000517876,0.0005722187,0.00064,0.00072456,0.0008255,0.00094116,0.00106988,0.00121,0.001362091,0.001530752,0.001720368,0.001935323,0.00218,0.0024548,0.002764,0.0031178,0.0035264,0.004,0.00454624,0.00515932,0.00582928,0.00654616,0.0073,0.008086507,0.00890872,0.00976768,0.01066443,0.0116,0.01257317,0.01358272,0.01462968,0.01571509,0.01684,0.01800736,0.01921448,0.02045392,0.02171824,0.023,0.02429461,0.02561024,0.02695857,0.02835125,0.0298,0.03131083,0.03288368,0.03452112,0.03622571,0.038,0.03984667,0.041768,0.043766,0.04584267,0.048,0.05024368,0.05257304,0.05498056,0.05745872,0.06,0.06260197,0.06527752,0.06804208,0.07091109,0.0739,0.077016,0.0802664,0.0836668,0.0872328,0.09098,0.09491755,0.09904584,0.1033674,0.1078846,0.1126,0.117532,0.1226744,0.1279928,0.1334528,0.13902,0.1446764,0.1504693,0.1564619,0.1627177,0.1693,0.1762431,0.1835581,0.1912735,0.199418,0.20802,0.2171199,0.2267345,0.2368571,0.2474812,0.2586,0.2701849,0.2822939,0.2950505,0.308578,0.323,0.3384021,0.3546858,0.3716986,0.3892875,0.4073,0.4256299,0.4443096,0.4633944,0.4829395,0.503,0.5235693,0.544512,0.56569,0.5869653,0.6082,0.6293456,0.6503068,0.6708752,0.6908424,0.71,0.7281852,0.7454636,0.7619694,0.7778368,0.7932,0.8081104,0.8224962,0.8363068,0.8494916,0.862,0.8738108,0.8849624,0.8954936,0.9054432,0.9148501,0.9237348,0.9320924,0.9399226,0.9472252,0.954,0.9602561,0.9660074,0.9712606,0.9760225,0.9803,0.9840924,0.9874182,0.9903128,0.9928116,0.9949501,0.9967108,0.9980983,0.999112,0.9997482,1,0.9998567,0.9993046,0.9983255,0.9968987,0.995,0.9926005,0.9897426,0.9864444,0.9827241,0.9786,0.9740837,0.9691712,0.9638568,0.9581349,0.952,0.9454504,0.9384992,0.9311628,0.9234576,0.9154,0.9070064,0.8982772,0.8892048,0.8797816,0.87,0.8598613,0.849392,0.838622,0.8275813,0.8163,0.8047947,0.793082,0.781192,0.7691547,0.757,0.7447541,0.7324224,0.7200036,0.7074965,0.6949,0.6822192,0.6694716,0.6566744,0.6438448,0.631,0.6181555,0.6053144,0.5924756,0.5796379,0.5668,0.5539611,0.5411372,0.5283528,0.5156323,0.503,0.4904688,0.4780304,0.4656776,0.4534032,0.4412,0.42908,0.417036,0.405032,0.393032,0.381,0.3689184,0.3568272,0.3447768,0.3328176,0.321,0.3093381,0.2978504,0.2865936,0.2756245,0.265,0.2547632,0.2448896,0.2353344,0.2260528,0.217,0.2081616,0.1995488,0.1911552,0.1829744,0.175,0.1672235,0.1596464,0.1522776,0.1451259,0.1382,0.1315003,0.1250248,0.1187792,0.1127691,0.107,0.1014762,0.09618864,0.09112296,0.08626485,0.0816,0.07712064,0.07282552,0.06871008,0.06476976,0.061,0.05739621,0.05395504,0.05067376,0.04754965,0.04458,0.04175872,0.03908496,0.03656384,0.03420048,0.032,0.02996261,0.02807664,0.02632936,0.02470805,0.0232,0.02180077,0.02050112,0.01928108,0.01812069,0.017,0.01590379,0.01483718,0.01381068,0.01283478,0.01192,0.01106831,0.01027339,0.009533311,0.008846157,0.00821,0.007623781,0.007085424,0.006591476,0.006138485,0.005723,0.005343059,0.004995796,0.004676404,0.004380075,0.004102,0.003838453,0.003589099,0.003354219,0.003134093,0.002929,0.002738139,0.002559876,0.002393244,0.002237275,0.002091,0.001953587,0.00182458,0.00170358,0.001590187,0.001484,0.001384496,0.001291268,0.001204092,0.001122744,0.001047,0.0009765896,0.0009111088,0.0008501332,0.0007932384,0.00074,0.0006900827,0.00064331,0.000599496,0.0005584547,0.00052,0.0004839136,0.0004500528,0.0004183452,0.0003887184,0.0003611,0.0003353835,0.0003114404,0.0002891656,0.0002684539,0.0002492,0.0002313019,0.0002146856,0.0001992884,0.0001850475,0.0001719,0.0001597781,0.0001486044,0.0001383016,0.0001287925,0.00012,0.0001118595,0.0001043224,0.0000973356,0.00009084587,0.0000848,0.00007914667,0.000073858,0.000068916,0.00006430267,0.00006,0.00005598187,0.0000522256,0.0000487184,0.00004544747,0.0000424,0.00003956104,0.00003691512,0.00003444868,0.00003214816,0.00003,0.00002799125,0.00002611356,0.00002436024,0.00002272461,0.0000212,0.00001977855,0.00001845285,0.00001721687,0.00001606459,0.00001499,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
  ];

  // Fungsi untuk mendapatkan nilai V(λ)
  const getVlambda = (wavelength) => {
    if (wavelength < 350 || wavelength > 800) return 0;
    const index = wavelength - 350;
    return VlambdaCIE1931[index] || 0;
  };

  // Parsing data-wave menjadi array objek
  const dataPairs = waveData.split(',').map(pair => {
    const [wavelength, value] = pair.split(':');
    return {
      wavelength: parseInt(wavelength),
      ee_mwm2: parseFloat(value)
    };
  });

  // Membuat elemen tabel
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table';

  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';

  // Header tabel
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Wavelength (nm)', 'E<sub>e</sub> (λ) (mW/m²)', 'E<sub>e</sub> (λ) (W/m²)', 'V(λ) CIE 1931', 'Lux Contrib.', 'PPFD Contrib.'].forEach(text => {
    const th = document.createElement('th');
    th.innerHTML = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body tabel
  const tbody = document.createElement('tbody');
  dataPairs.forEach(item => {
    const tr = document.createElement('tr');

    // Kolom 1: Wavelength
    const tdWavelength = document.createElement('td');
    tdWavelength.textContent = item.wavelength;
    tr.appendChild(tdWavelength);

    // Kolom 2: Ee (λ) (mW/m²)
    const tdEe_mwm2 = document.createElement('td');
    tdEe_mwm2.textContent = item.ee_mwm2;
    tr.appendChild(tdEe_mwm2);

    // Kolom 3: Ee (λ) (W/m²)
    const ee_wm2 = item.ee_mwm2 / 1000;
    const tdEe_wm2 = document.createElement('td');
    tdEe_wm2.textContent = ee_wm2.toFixed(9);
    tr.appendChild(tdEe_wm2);

    // Kolom 4: V(λ) CIE 1931
    const v_lambda = getVlambda(item.wavelength);
    const tdVlambda = document.createElement('td');
    tdVlambda.textContent = v_lambda.toFixed(9);
    tr.appendChild(tdVlambda);

    // Kolom 5: Lux Contrib.
    const luxContrib = ee_wm2 * v_lambda * luxContribConst;
    const tdLuxContrib = document.createElement('td');
    tdLuxContrib.textContent = luxContrib.toFixed(9);
    tr.appendChild(tdLuxContrib);

    // Kolom 6: PPFD Contrib.
    const ppfdContrib = item.wavelength * ee_wm2 * 8359 * 0.000001;
    const tdPPFDContrib = document.createElement('td');
    tdPPFDContrib.textContent = ppfdContrib.toFixed(9);
    tr.appendChild(tdPPFDContrib);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  // Sisipkan tabel setelah elemen .wavelength
  dataWrapper.innerHTML = '';
  dataWrapper.appendChild(tableWrapper);

  // Hitung total Lux Contrib.
  const totalLux = dataPairs.reduce((sum, item) => {
    const ee_wm2 = item.ee_mwm2 / 1000;
    const v_lambda = getVlambda(item.wavelength);
    const lux = ee_wm2 * v_lambda * luxContribConst;
    return sum + lux;
  }, 0);

  // Hitung total PPFD Contrib. (untuk wavelength 400-700 nm saja)
  const totalPPFD = dataPairs.reduce((sum, item) => {
    if (item.wavelength >= 400 && item.wavelength <= 700) {
      const ee_wm2 = item.ee_mwm2 / 1000;
      const ppfd = item.wavelength * ee_wm2 * 8359 * 0.000001;
      return sum + ppfd; // convert ke µmol/m²/s
    }
    return sum;
  }, 0);

  // Buat elemen tabel summary
  const summaryWrapper = document.createElement('div');
  summaryWrapper.className = 'table';

  const summaryTable = document.createElement('table');
  summaryTable.style.borderCollapse = 'collapse';

  const summaryThead = document.createElement('thead');
  const summaryHeaderRow1 = document.createElement('tr');

  // Header atas
  const thEmpty = document.createElement('th');
  thEmpty.rowSpan = 2;
  summaryHeaderRow1.appendChild(thEmpty);

  const thLux = document.createElement('th');
  thLux.colSpan = 1;
  thLux.textContent = 'Lux (lx)';
  summaryHeaderRow1.appendChild(thLux);

  const thPPFD = document.createElement('th');
  thPPFD.colSpan = 1;
  thPPFD.textContent = 'PPFD (µmol/m²/s)';
  summaryHeaderRow1.appendChild(thPPFD);

  summaryThead.appendChild(summaryHeaderRow1);
  summaryTable.appendChild(summaryThead);

  const summaryTbody = document.createElement('tbody');

  // Row Value
  const trValue = document.createElement('tr');
  const tdRowValue = document.createElement('td');
  tdRowValue.textContent = 'Value';
  trValue.appendChild(tdRowValue);

  const tdLuxValue = document.createElement('td');
  tdLuxValue.textContent = totalLux.toFixed(6);
  trValue.appendChild(tdLuxValue);

  const tdPPFDValue = document.createElement('td');
  tdPPFDValue.textContent = totalPPFD.toFixed(6);
  trValue.appendChild(tdPPFDValue);

  summaryTbody.appendChild(trValue);

  // Row Converted
  const trConverted = document.createElement('tr');
  const tdRowConverted = document.createElement('td');
  tdRowConverted.textContent = 'Converted';
  trConverted.appendChild(tdRowConverted);

  const tdLuxConverted = document.createElement('td');
  tdLuxConverted.textContent = (totalLux / totalPPFD).toFixed(6);
  tdLuxConverted.classList.add('lux-converted');
  trConverted.appendChild(tdLuxConverted);

  const tdPPFDConverted = document.createElement('td');
  tdPPFDConverted.textContent = (totalPPFD / totalLux).toFixed(9);
  tdPPFDConverted.classList.add('ppfd-converted');
  trConverted.appendChild(tdPPFDConverted);

  summaryTbody.appendChild(trConverted);

  summaryTable.appendChild(summaryTbody);
  summaryWrapper.appendChild(summaryTable);

  // Sisipkan tabel summary setelah tabel spektrum
  tableWrapper.insertAdjacentElement('afterend', summaryWrapper);

});

// ----- Converter -----
  document.querySelector('#lux-to-ppfd-lux').addEventListener('input', function() {
    const luxValue = parseFloat(this.value);
    const conversionFactor = parseFloat(document.querySelector('.lux-converted').textContent);
    document.querySelector('#lux-to-ppfd-ppfd').value = luxValue * conversionFactor;
  });

  document.querySelector('#ppfd-to-lux-ppfd').addEventListener('input', function() {
    const ppfdValue = parseFloat(this.value);
    const reverseConversionFactor = parseFloat(document.querySelector('.ppfd-converted').textContent);
    document.querySelector('#ppfd-to-lux-lux').value = ppfdValue * reverseConversionFactor;
  });
