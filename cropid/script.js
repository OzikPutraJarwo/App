function downloadMainAsExcel() {
  const sections = [
    ["Data", "#tableContainer table"],
    ["ANOVA", "#anovaTable"],
    ["KK, FK, GT", "#anovaSup"],
    ["Uji Lanjut", "#matrixSup"],
    ["Matriks", "#matrixTable"],
    ["Notasi", "#letterTable"],
    ["Interpretasi", "#outputContent"]
  ];

  const wb = XLSX.utils.book_new();
  let ws_data = [];

  sections.forEach(([title, selector], index) => {
    if (index > 0) {
      ws_data.push([]);
    }
    ws_data.push([{ v: title, s: { font: { bold: true } } }]);
    const element = document.querySelector(selector);
    if (element) {
      if (element.tagName === 'TABLE') {
        const ws = XLSX.utils.table_to_sheet(element);
        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
        ws_data = ws_data.concat(json);
      } else {
        const text = element.innerText;
        ws_data.push([text]);
      }
    }
  });

  const now = new Date();
  const formattedTime = now.toLocaleString('en-EN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  ws_data.push([]);
  ws_data.push([`Diolah pada ${formattedTime} melalui https://app.kodejarwo.com/cropid`]);

  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, "data-cropid.xlsx");
};

function downloadSvgAsPng(buttonElement) {
    const parent = buttonElement.parentElement;
    const svgElement = parent.querySelector('svg');

    if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            const scale = 5; 
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const pngUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = 'chart.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
}

document.querySelectorAll('.collapse').forEach(collapse => {
  const setMaxHeight = () => {
    collapse.style.maxHeight = window.innerWidth >= 1440 ? '85px' : '75px';
    collapse.style.overflow = 'hidden';
    collapse.style.transition = 'max-height 0.2s';
  };
  setMaxHeight();
  window.addEventListener('resize', setMaxHeight);
  collapse.querySelector('.uncollapse').addEventListener('click', () => {
    if (collapse.style.maxHeight === (window.innerWidth >= 1440 ? '85px' : '75px')) {
      collapse.style.maxHeight = `${collapse.scrollHeight}px`;
    } else {
      setMaxHeight();
    }
  });
});

document.querySelectorAll('.show-set').forEach(btn => {
  const target = document.querySelector(btn.dataset.element);
  target.style.maxHeight = '0';
  btn.onclick = () => {
    const isCollapsed = target.style.maxHeight === '0px';
    if (isCollapsed) {
      target.style.maxHeight = target.scrollHeight + 'px';
      target.classList.toggle('show', true);
      target.classList.toggle('hide', false);
      setTimeout(() => target.style.maxHeight = '', 190);
    } else {
      target.style.maxHeight = '0';
      target.classList.toggle('show', false);
      target.classList.toggle('hide', true);
    }
  };
});

function smoothScroll(target, offset = 0) {
  setTimeout(() => {
    const element = document.querySelector(target);
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }, 100);
}

function getFileName() {
  const x = document.getElementById('fileInput')
  x.style.visibility = 'collapse'
  document.getElementById('fileName').innerHTML = x.value.split('\\').pop();
  document.getElementById('fileName').style.margin = ".5rem 0 0";
  document.getElementById('fileName').style.padding = ".5rem 1rem";
}

const fileInput = document.getElementById('fileInput');
const tableContainer = document.getElementById('tableContainer');
const sheetSelectorContainer = document.getElementById('sheetSelectorContainer');
const sheetSelect = document.getElementById('sheetSelect');
const settingsContainer = document.getElementById('settingsContainer');
const perlakuanBtn = document.getElementById('perlakuanBtn');
const ulanganBtn = document.getElementById('ulanganBtn');
const hasilBtn = document.getElementById('hasilBtn');
const selectedPerlakuanHeaderDisplay = document.getElementById('selectedPerlakuanHeader');
const selectedUlanganHeaderDisplay = document.getElementById('selectedUlanganHeader');
const selectedHasilHeaderDisplay = document.getElementById('selectedHasilHeader');

let currentWorkbook = null;
let currentTableData = [];
let selectedSettingType = null;
let selectedHeaders = { Perlakuan: null, Ulangan: null, Hasil: null };

window.dataAnalysis = {
  _uniquePerlakuanCount: 0,
  _uniqueUlanganCount: 0,
  _perlakuanResults: {}, 
  _ulanganResults: {},   
  _grandTotal: 0,
  _grandTotalSquared: 0, 
  _isDataReady: false, 

  getPerlakuan: function () {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    return this._uniquePerlakuanCount;
  },
  getUlangan: function () {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    return this._uniqueUlanganCount;
  },
  getAveragePerlakuan: function (perlakuanValue = null) {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    if (perlakuanValue !== null) {
      return this._perlakuanResults[perlakuanValue] ? parseFloat(this._perlakuanResults[perlakuanValue].average) : 0;
    } else {
      let totalAvg = 0;
      let count = 0;
      for (const key in this._perlakuanResults) {
        totalAvg += parseFloat(this._perlakuanResults[key].average);
        count++;
      }
      return count > 0 ? parseFloat((totalAvg / count).toFixed(2)) : 0;
    }
  },
  getTotalPerlakuan: function (squared = false) {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    if (squared) {
      let sumOfSquaredPerlakuanTotals = 0;
      for (const perlakuan in this._perlakuanResults) {
        const rawSum = this._perlakuanResults[perlakuan].rawSum;
        sumOfSquaredPerlakuanTotals += (rawSum * rawSum);
      }
      return parseFloat(sumOfSquaredPerlakuanTotals.toFixed(2));
    } else {
      return parseFloat(this._grandTotal.toFixed(2));
    }
  },
  getAverageUlangan: function (ulanganValue = null) {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    if (ulanganValue !== null) {
      return this._ulanganResults[ulanganValue] ? parseFloat(this._ulanganResults[ulanganValue].average) : 0;
    } else {
      let totalAvg = 0;
      let count = 0;
      for (const key in this._ulanganResults) {
        totalAvg += parseFloat(this._ulanganResults[key].average);
        count++;
      }
      return count > 0 ? parseFloat((totalAvg / count).toFixed(2)) : 0;
    }
  },
  getGrandTotal: function (squared = false) {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return 0;
    }
    if (squared) {
      return parseFloat(this._grandTotalSquared.toFixed(2));
    } else {
      return parseFloat(this._grandTotal.toFixed(2));
    }
  },
  getPerlakuanAveragesFormatted: function () {
    if (!this._isDataReady) {
      console.warn("Data belum siap. Harap muat file dan pilih header terlebih dahulu.");
      return "";
    }
    let output = "";
    for (const perlakuan in this._perlakuanResults) {
      const data = this._perlakuanResults[perlakuan];
      output += `${perlakuan} ${data.average}\n`;
    }
    return output.trim(); 
  }
};

fileInput.addEventListener('change', handleFile);
sheetSelect.addEventListener('change', displaySelectedSheet);
perlakuanBtn.addEventListener('click', () => activateSetting('Perlakuan'));
ulanganBtn.addEventListener('click', () => activateSetting('Ulangan'));
hasilBtn.addEventListener('click', () => activateSetting('Hasil'));

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  tableContainer.innerHTML = '';
  sheetSelectorContainer.style.display = 'none';
  settingsContainer.style.display = 'none';
  resetSettings();

  const reader = new FileReader();

  reader.onload = function (e) {
    const data = e.target.result;

    if (file.name.endsWith('.csv')) {
      currentWorkbook = null;
      parseCSV(data);
      settingsContainer.style.display = 'grid';
      setupHeaderSelection();
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      currentWorkbook = XLSX.read(data, { type: 'array' });
      populateSheetSelector(currentWorkbook.SheetNames);
      displaySheet(currentWorkbook, currentWorkbook.SheetNames[0]);
      sheetSelectorContainer.style.display = 'block';
      settingsContainer.style.display = 'grid';
      setupHeaderSelection();
    } else {
      currentWorkbook = null;
      tableContainer.innerHTML = '<p>Jenis file tidak didukung. Harap unggah file CSV atau Excel.</p>';
    }
  };

  if (file.name.endsWith('.csv')) {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

function populateSheetSelector(sheetNames) {
  sheetSelect.innerHTML = '';
  sheetNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    sheetSelect.appendChild(option);
  });
}

function displaySelectedSheet() {
  if (currentWorkbook) {
    const selectedSheetName = sheetSelect.value;
    displaySheet(currentWorkbook, selectedSheetName);
    resetSettings();
    setupHeaderSelection();
  }
}

function parseCSV(csvData) {
  const rows = csvData.split('\n').filter(row => row.trim() !== '');
  if (rows.length === 0) {
    tableContainer.innerHTML = '<p>File CSV kosong atau tidak valid.</p>';
    currentTableData = [];
    return;
  }

  const parsedData = rows.map(row =>
    row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(col => col.trim().replace(/^"|"$/g, ''))
  );
  currentTableData = parsedData;

  let html = '<table>';
  parsedData.forEach((row, rowIndex) => {
    html += '<tr>';
    row.forEach(cell => {
      if (rowIndex === 0) {
        html += `<th>${escapeHTML(cell)}</th>`;
      } else {
        html += `<td>${escapeHTML(cell)}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</table>';
  tableContainer.innerHTML = html;
}

function displaySheet(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  currentTableData = jsonData;

  if (jsonData.length === 0) {
    tableContainer.innerHTML = `<p>Sheet "${sheetName}" kosong atau tidak valid.</p>`;
    return;
  }

  let html = '<table>';
  jsonData.forEach((row, rowIndex) => {
    html += '<tr>';
    row.forEach(cell => {
      if (rowIndex === 0) {
        html += `<th>${escapeHTML(cell)}</th>`;
      } else {
        html += `<td>${escapeHTML(cell)}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</table>';
  tableContainer.innerHTML = html;
}

function setupHeaderSelection() {
  const headers = tableContainer.querySelectorAll('th');
  headers.forEach(header => {
    header.removeEventListener('click', handleHeaderClick);
    header.addEventListener('click', handleHeaderClick);
    header.classList.remove('selected-header');
  });

  for (const setting in selectedHeaders) {
    if (selectedHeaders[setting]) {
      headers.forEach(header => {
        if (header.textContent === selectedHeaders[setting]) {
          header.classList.add('selected-header');
        }
      });
    }
  }
}

function activateSetting(settingType) {
  selectedSettingType = settingType;
  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${settingType.toLowerCase()}Btn`).classList.add('active');
}

function handleHeaderClick(event) {
  if (!selectedSettingType) {
    return;
  }

  const clickedHeader = event.target;
  const headerText = clickedHeader.textContent;

  const prevSelectedHeader = document.querySelector(`th.selected-header[data-setting="${selectedSettingType}"]`);
  if (prevSelectedHeader) {
    prevSelectedHeader.classList.remove('selected-header');
    prevSelectedHeader.removeAttribute('data-setting');
  }

  selectedHeaders[selectedSettingType] = headerText;
  clickedHeader.classList.add('selected-header');
  clickedHeader.setAttribute('data-setting', selectedSettingType);

  if (selectedSettingType === 'Perlakuan') {
    selectedPerlakuanHeaderDisplay.textContent = headerText;
  } else if (selectedSettingType === 'Ulangan') {
    selectedUlanganHeaderDisplay.textContent = headerText;
  } else if (selectedSettingType === 'Hasil') {
    selectedHasilHeaderDisplay.textContent = headerText;
  }

  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  selectedSettingType = null;

  if (selectedHeaders.Perlakuan && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
    document.querySelector('.run').classList.remove('none');
    smoothScroll('.run', top = 70);
    document.querySelector('.run').addEventListener('click', () => {
      document.querySelector('.anova').classList.add('show');
      calculateCounts();
      calculateAveragesAndTotals();
      window.dataAnalysis._isDataReady = true;
      countAnova();
      hitungBNT(); processData(); initializeInterpretationApp();
      renderBarChart();
      createBoxplot();
      document.querySelector('.graph').classList.remove('none');
      document.querySelector('.download').classList.remove('none');
      document.querySelector('#plotContainer').innerHTML += `<div class="download-svg" onclick="downloadSvgAsPng(this)"><img src="../icon/download.png"></div>`;
      document.querySelector('#chartContainer').innerHTML += `<div class="download-svg" onclick="downloadSvgAsPng(this)"><img src="../icon/download.png"></div>`;
    });
  } else {
    window.dataAnalysis._isDataReady = false; 
  }
}

function calculateCounts() {
  if (!currentTableData || currentTableData.length < 2 || !selectedHeaders.Perlakuan || !selectedHeaders.Ulangan) {
    window.dataAnalysis._uniquePerlakuanCount = 0;
    window.dataAnalysis._uniqueUlanganCount = 0;
    return;
  }

  const headers = currentTableData[0];
  const perlakuanColIndex = headers.indexOf(selectedHeaders.Perlakuan);
  const ulanganColIndex = headers.indexOf(selectedHeaders.Ulangan);

  if (perlakuanColIndex === -1 || ulanganColIndex === -1) {
    console.error("Kolom 'Perlakuan' atau 'Ulangan' tidak ditemukan.");
    window.dataAnalysis._uniquePerlakuanCount = 0;
    window.dataAnalysis._uniqueUlanganCount = 0;
    return;
  }

  const uniquePerlakuan = new Set();
  const uniqueUlangan = new Set();

  for (let i = 1; i < currentTableData.length; i++) {
    const row = currentTableData[i];
    if (row[perlakuanColIndex] !== undefined) {
      uniquePerlakuan.add(row[perlakuanColIndex]);
    }
    if (row[ulanganColIndex] !== undefined) {
      uniqueUlangan.add(row[ulanganColIndex]);
    }
  }

  window.dataAnalysis._uniquePerlakuanCount = uniquePerlakuan.size;
  window.dataAnalysis._uniqueUlanganCount = uniqueUlangan.size;
}

function calculateAveragesAndTotals() {
  if (!currentTableData || currentTableData.length < 2 || !selectedHeaders.Perlakuan || !selectedHeaders.Ulangan || !selectedHeaders.Hasil) {
    window.dataAnalysis._perlakuanResults = {};
    window.dataAnalysis._ulanganResults = {};
    window.dataAnalysis._grandTotal = 0;
    window.dataAnalysis._grandTotalSquared = 0;
    window.dataAnalysis._isDataReady = false;
    return;
  }

  const headers = currentTableData[0];
  const perlakuanColIndex = headers.indexOf(selectedHeaders.Perlakuan);
  const ulanganColIndex = headers.indexOf(selectedHeaders.Ulangan);
  const hasilColIndex = headers.indexOf(selectedHeaders.Hasil);

  if (perlakuanColIndex === -1 || ulanganColIndex === -1 || hasilColIndex === -1) {
    console.error("Kolom 'Perlakuan', 'Ulangan', atau 'Hasil' tidak ditemukan.");
    window.dataAnalysis._perlakuanResults = {};
    window.dataAnalysis._ulanganResults = {};
    window.dataAnalysis._grandTotal = 0;
    window.dataAnalysis._grandTotalSquared = 0;
    window.dataAnalysis._isDataReady = false;
    return;
  }

  const perlakuanData = {};
  const ulanganData = {};
  let grandTotal = 0;
  let grandTotalSquared = 0; 

  for (let i = 1; i < currentTableData.length; i++) {
    const row = currentTableData[i];
    const perlakuanValue = row[perlakuanColIndex];
    const ulanganValue = row[ulanganColIndex];
    const hasilValue = parseFloat(row[hasilColIndex]);

    if (isNaN(hasilValue)) {
      continue;
    }

    if (perlakuanValue !== undefined) {
      if (!perlakuanData[perlakuanValue]) {
        perlakuanData[perlakuanValue] = { sum: 0, count: 0 };
      }
      perlakuanData[perlakuanValue].sum += hasilValue;
      perlakuanData[perlakuanValue].count++;
    }

    if (ulanganValue !== undefined) {
      if (!ulanganData[ulanganValue]) {
        ulanganData[ulanganValue] = { sum: 0, count: 0 };
      }
      ulanganData[ulanganValue].sum += hasilValue;
      ulanganData[ulanganValue].count++;
    }

    grandTotal += hasilValue;
    grandTotalSquared += (hasilValue * hasilValue);
  }

  window.dataAnalysis._perlakuanResults = {};
  for (const perlakuan in perlakuanData) {
    const data = perlakuanData[perlakuan];
    const average = data.count > 0 ? (data.sum / data.count).toFixed(2) : 0;
    window.dataAnalysis._perlakuanResults[perlakuan] = {
      rawSum: data.sum, 
      count: data.count,
      average: average,
      formattedSum: data.sum.toFixed(2) 
    };
  }

  window.dataAnalysis._ulanganResults = {};
  for (const ulangan in ulanganData) {
    const data = ulanganData[ulangan];
    const average = data.count > 0 ? (data.sum / data.count).toFixed(2) : 0;
    window.dataAnalysis._ulanganResults[ulangan] = {
      sum: data.sum.toFixed(2),
      count: data.count,
      average: average
    };
  }

  window.dataAnalysis._grandTotal = grandTotal;
  window.dataAnalysis._grandTotalSquared = grandTotalSquared;
}

function resetSettings() {
  selectedSettingType = null;
  selectedHeaders = { Perlakuan: null, Ulangan: null, Hasil: null };
  selectedPerlakuanHeaderDisplay.textContent = 'Belum dipilih';
  selectedUlanganHeaderDisplay.textContent = 'Belum dipilih';
  selectedHasilHeaderDisplay.textContent = 'Belum dipilih';
  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('.run').classList.add('none');
  document.querySelector('.graph').classList.add('none');
  document.querySelector('.download').classList.add('none');
  document.querySelectorAll('.output').forEach(el => el.classList.remove('show'));
  window.dataAnalysis._uniquePerlakuanCount = 0;
  window.dataAnalysis._uniqueUlanganCount = 0;
  window.dataAnalysis._perlakuanResults = {};
  window.dataAnalysis._ulanganResults = {};
  window.dataAnalysis._grandTotal = 0;
  window.dataAnalysis._grandTotalSquared = 0;
  window.dataAnalysis._isDataReady = false;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

///////////////////////////////////////////////////////////////////////////////////////////

function countAnova() {
  const [cellkk, cellfk, cellgt, cellPdb, cellPjk, cellPkt, cellPfh, cellPft, cellPsg, cellGdb, cellGjk, cellGkt, cellTdb, cellTjk]
    = ['kk', 'fk', 'gt', 'Pdb', 'Pjk', 'Pkt', 'Pfh', 'Pft', 'Psg', 'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk']
      .map(cls => document.querySelector(`.${cls}`));

  const fk = dataAnalysis.getGrandTotal() * dataAnalysis.getGrandTotal() / (dataAnalysis.getPerlakuan() * dataAnalysis.getUlangan());
  cellfk.innerHTML = fk;
  cellgt.innerHTML = dataAnalysis.getGrandTotal();

  const Pdb = dataAnalysis.getPerlakuan() - 1;
  cellPdb.innerHTML = Pdb;
  const Gdb = dataAnalysis.getPerlakuan() * (dataAnalysis.getUlangan() - 1);
  cellGdb.innerHTML = Gdb;
  const Tdb = dataAnalysis.getPerlakuan() * dataAnalysis.getUlangan() - 1;
  cellTdb.innerHTML = Tdb;

  const Pjk = dataAnalysis.getTotalPerlakuan(true) / dataAnalysis.getUlangan() - fk;
  cellPjk.innerHTML = Pjk.toFixed(2);
  const Tjk = dataAnalysis.getGrandTotal(true) - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Pjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Pkt = Pjk / Pdb;
  cellPkt.innerHTML = Pkt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Pfh = Pkt / Gkt;
  cellPfh.innerHTML = Pfh.toFixed(2);
  const Pft = jStat.centralF.inv(0.95, Pdb, Gdb);
  cellPft.innerHTML = Pft.toFixed(2);

  if (Pfh > Pft) {
    cellPsg.innerHTML = "*"
  } else {
    cellPsg.innerHTML = "tn"
  }

  const kk = Math.sqrt(Gkt) / (dataAnalysis.getGrandTotal() / (dataAnalysis.getPerlakuan() * dataAnalysis.getUlangan())) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('input-data').value = dataAnalysis.getPerlakuanAveragesFormatted();
  document.querySelector('#input-perlakuan').value = dataAnalysis.getPerlakuan();
  document.querySelector('#input-ulangan').value = dataAnalysis.getUlangan();
  document.querySelector('#input-ktg').value = Gkt;
}

///////////////////////////////////////////////////////////////////////////////////////////

let valueBNTH;

function hitungBNT() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = 1 - (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt((2 * inputKTG) / inputUlangan);
  const valueBNTT = jStat.studentt.inv(inputSig, valueDBG);
  valueBNTH = valueSD * valueBNTT;

  const outputSD = document.querySelector('.output-sd');
  const outputBNTT = document.querySelector('.output-bntt');
  const outputBNTH = document.querySelector('.output-bnth');

  outputSD.innerHTML = valueSD.toFixed(2);
  outputBNTT.innerHTML = valueBNTT.toFixed(2);
  outputBNTH.innerHTML = valueBNTH.toFixed(2);
}

let dataMap;

function processData() {
  const input = document.getElementById('input-data').value.trim();
  const lines = input.split('\n');
  dataMap = {};

  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMap[perlakuan] = nilaiFloat;
  });

  const sortedEntries = Object.entries(dataMap).sort((a, b) => a[1] - b[1]);

  const jsonOutput = JSON.stringify(sortedEntries, null, 2);

  const matrixTableBody = document.querySelector('#matrixTable tbody');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th></th>' + sortedEntries.map(entry => `<th>${entry[0]}</th>`).join('');
  matrixTableBody.innerHTML = '';
  matrixTableBody.appendChild(headerRow);

  sortedEntries.forEach(([perlakuanA, nilaiA]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${perlakuanA}</th>`;

    sortedEntries.forEach(([perlakuanB, nilaiB]) => {
      const difference = (nilaiA - nilaiB).toFixed(2);
      if (difference <= valueBNTH && difference >= 0) {
        row.innerHTML += `<td class="green">${difference}</td>`;
      } else if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else {
        row.innerHTML += `<td>${difference}</td>`;
      }
    });

    matrixTableBody.appendChild(row);
  });

  const table = document.getElementById('matrixTable');
  const rows = table.querySelectorAll('tbody tr');

  const results = {};

  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) return;

    const treatmentName = row.querySelector('th').textContent.trim();

    const greenColumns = [];

    const cells = row.querySelectorAll('td');
    cells.forEach((cell, cellIndex) => {
      if (cell.classList.contains('green')) {
        greenColumns.push(cellIndex + 1);
      }
    });

    results[treatmentName] = greenColumns.join(',');
  });

  const labelMap = {};
  const assigned = {};
  let currentLabelCode = 'a'.charCodeAt(0);

  function keysWithNumber(num) {
    return Object.keys(results).filter(key =>
      results[key].split(',').includes(String(num))
    );
  }

  for (const key of Object.keys(results)) {
    const nums = results[key].split(',');
    const first = nums[0];

    if (!labelMap[first]) {
      const label = String.fromCharCode(currentLabelCode++);
      labelMap[first] = label;

      const relatedKeys = keysWithNumber(first);
      for (const rk of relatedKeys) {
        assigned[rk] = (assigned[rk] || '') + label;
      }
    }
  }

  const merged = {};

  for (const key in assigned) {
    merged[key] = {
      label: assigned[key],
      value: dataMap[key]
    };
  }

  const dataMapKeyOrder = Object.keys(dataMap);
  const mergedCustomOrder = Object.keys(merged);

  function renderTable(orderBy = 'dataMapKey', reverse = false) {
    const tbody = document.querySelector("#letterTable tbody");
    tbody.innerHTML = "";

    let sortedKeys;

    if (orderBy === 'merged') {
      sortedKeys = [...mergedCustomOrder];
    } else if (orderBy === 'dataMapKey') {
      sortedKeys = dataMapKeyOrder.filter(k => merged[k]);
    }

    if (reverse) sortedKeys.reverse();

    sortedKeys.forEach(key => {
      const row = document.createElement("tr");

      const tdKey = document.createElement("td");
      tdKey.textContent = key;

      const tdValue = document.createElement("td");
      tdValue.textContent = merged[key].value;

      const tdLabel = document.createElement("td");
      tdLabel.textContent = merged[key].label;

      row.appendChild(tdKey);
      row.appendChild(tdValue);
      row.appendChild(tdLabel);

      tbody.appendChild(row);
    });
  }

  renderTable('merged', false);

  let isMergedReversed = false;
  let isDataReversed = false;

  document.getElementById('renderbyMerged').onclick = function () {
    renderTable('merged', !isMergedReversed);
    isMergedReversed = !isMergedReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyData').classList.add('opacity');
  };

  document.getElementById('renderbyData').onclick = function () {
    renderTable('dataMapKey', isDataReversed);
    isDataReversed = !isDataReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyMerged').classList.add('opacity');
  };

  document.querySelectorAll('.output').forEach(el => el.classList.add('show'));

}

document.querySelectorAll('table').forEach(table => {
  const wrapper = document.createElement('div');
  wrapper.classList.add('resp-table');
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
});

const span = document.createElement('span');
span.style.textAlign = 'center';
span.style.fontSize = '.9rem';
span.style.opacity = '.9';
span.style.cursor = 'pointer';
span.style.display = 'block';
span.style.margin = '10px 0';
span.textContent = 'Bingung? Klik untuk menggunakan data contoh';
document.querySelector('.item.input button').before(span);
span.onclick = () => {
  document.getElementById('input-data').value = `M0 39.80815\nM1 52.47585\nM2 53.005425\nM3 64.3575\nM4 77.41665\nM5 64.400025\nM6 41.08125`;
  document.getElementById('input-perlakuan').value = 7;
  document.getElementById('input-ulangan').value = 3;
  document.getElementById('input-ktg').value = 47.62;
};

///////////////////////////////////////////////////////////////////////////////////////////

function initializeInterpretationApp() {
  class InterpretationEngine {
    constructor() {
      this.customTreatmentNames = {};
    }

    areNotationsSimilar(notation1, notation2) {
      if (!notation1 || !notation2) return false;
      for (let char1 of notation1) {
        if (notation2.includes(char1)) {
          return true;
        }
      }
      return false;
    }

    getTreatmentString(treatment, unit = '') {
      const noSpaceUnits = ['%', '°C', '°F', '°K'];
      const needsSpace = !noSpaceUnits.some(s => unit.endsWith(s));
      const unitSuffix = unit ? (needsSpace ? ` ${unit}` : unit) : '';
      const displayedName = this.customTreatmentNames[treatment.perlakuan] || treatment.perlakuan;
      return `${displayedName} (${treatment.value}${unitSuffix})`;
    }

    interpretData(data, unit = '') {
      const sortedData = [...data].sort((a, b) => b.value - a.value);
      let interpretationSentences = [];
      let visitedTreatments = new Set();

      for (let i = 0; i < sortedData.length; i++) {
        const currentTreatment = sortedData[i];
        if (visitedTreatments.has(currentTreatment.perlakuan)) {
          continue;
        }

        let currentComponent = [];
        let queue = [currentTreatment];
        let componentVisited = new Set([currentTreatment.perlakuan]);

        currentComponent.push(currentTreatment);
        visitedTreatments.add(currentTreatment.perlakuan);

        let head = 0;
        while (head < queue.length) {
          const u = queue[head++];
          for (let j = 0; j < sortedData.length; j++) {
            const v = sortedData[j];
            if (!componentVisited.has(v.perlakuan) && this.areNotationsSimilar(u.notasi, v.notasi)) {
              componentVisited.add(v.perlakuan);
              visitedTreatments.add(v.perlakuan);
              currentComponent.push(v);
              queue.push(v);
            }
          }
        }

        // if (visitedTreatments.size === sortedData.length && sortedData.length > 1) {
        //   return "Semua perlakuan tidak saling berbeda nyata.";
        // }

        currentComponent.sort((a, b) => b.value - a.value);
        let sentence = "";

        const hasA = currentComponent.some(t => t.notasi === 'a');
        const hasAB = currentComponent.some(t => t.notasi === 'ab');
        const hasB = currentComponent.filter(t => t.notasi === 'b').length > 0;
        const isA_BN_B = !this.areNotationsSimilar('a', 'b');

        const isSpecificComplexComponent = currentComponent.length >= 3 && hasA && hasAB && hasB && isA_BN_B;

        if (isSpecificComplexComponent) {
          const m0 = currentComponent.find(t => t.notasi === 'a');
          const m6 = currentComponent.find(t => t.notasi === 'ab');
          const m1m2 = currentComponent.filter(t => t.notasi === 'b').sort((a, b) => b.value - a.value);

          if (m0 && m6 && m1m2.length > 0) {
            const m1m2Names = m1m2.map(t => this.getTreatmentString(t, unit));
            const m1m2Phrase = m1m2Names.length > 1 ? `${m1m2Names.join(' dan ')}` : m1m2Names[0];

            sentence = `Perlakuan ${this.getTreatmentString(m6, unit)}, ${m1m2Phrase} tidak saling berbeda nyata, tetapi perlakuan ${this.getTreatmentString(m6, unit)} tidak berbeda nyata dengan perlakuan ${this.getTreatmentString(m0, unit)} dan perlakuan ${m1m2Phrase} berbeda nyata dengan perlakuan lainnya.`;
            interpretationSentences.push(sentence);
            continue;
          }
        }

        const componentNames = currentComponent.map(t => this.getTreatmentString(t, unit));
        if (currentComponent.length === 1) {
          sentence += `Perlakuan ${this.getTreatmentString(currentComponent[0], unit)}`;
        } else {
          const lastItem = componentNames.pop();
          const groupPhrase = componentNames.length > 0 ? `${componentNames.join(' dan ')} dan ${lastItem}` : lastItem;
          sentence += `Perlakuan ${groupPhrase} tidak saling berbeda nyata`;
        }

        const treatmentsOutsideComponent = sortedData.filter(t => !currentComponent.includes(t));

        if (treatmentsOutsideComponent.length > 0) {
          let allDifferentFromOthers = true;
          let anySimilarToOthers = false;

          for (const compMember of currentComponent) {
            for (const externalT of treatmentsOutsideComponent) {
              if (this.areNotationsSimilar(compMember.notasi, externalT.notasi)) {
                anySimilarToOthers = true;
                allDifferentFromOthers = false;
                break;
              }
            }
            if (anySimilarToOthers) break;
          }

          if (allDifferentFromOthers) {
            if (currentComponent.length === 1) {
              sentence += ` berbeda nyata dengan semua perlakuan lainnya.`;
            } else {
              sentence += `, tetapi berbeda nyata dengan perlakuan lainnya.`;
            }
          } else if (anySimilarToOthers) {
            let similarExternalTreatments = new Set();
            let differentExternalTreatments = new Set();

            for (const compMember of currentComponent) {
              for (const externalT of treatmentsOutsideComponent) {
                if (this.areNotationsSimilar(compMember.notasi, externalT.notasi)) {
                  similarExternalTreatments.add(externalT);
                } else {
                  differentExternalTreatments.add(externalT);
                }
              }
            }

            const similarExtArr = Array.from(similarExternalTreatments).sort((a, b) => b.value - a.value);
            const trulyDifferentExtArr = Array.from(differentExternalTreatments).filter(diffT => {
              return !similarExternalTreatments.has(diffT);
            }).sort((a, b) => b.value - a.value);

            let externalParts = [];
            if (similarExtArr.length > 0) {
              externalParts.push(`tidak berbeda nyata dengan ${similarExtArr.map(t => this.getTreatmentString(t, unit)).join(' dan ')}`);
            }
            if (trulyDifferentExtArr.length > 0) {
              externalParts.push(`berbeda nyata dengan ${trulyDifferentExtArr.map(t => this.getTreatmentString(t, unit)).join(' dan ')}`);
            }

            if (currentComponent.length === 1) {
              sentence += ` ${externalParts.join(' dan ')}.`;
            } else {
              sentence += `, tetapi ${externalParts.join(' dan ')}.`;
            }
          } else {
            sentence += `.`;
          }
        } else {
          sentence += `.`;
        }
        interpretationSentences.push(sentence);
      }

      return interpretationSentences.join(' ');
    }
  }

  const interpretationEngine = new InterpretationEngine();
  let isAppInitialized = false;

  function parseTableDataToJson() {
    const table = document.getElementById('letterTable');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    const jsonData = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 3) {
        const perlakuan = cells[0].textContent.trim();
        const value = parseFloat(cells[1].textContent.trim());
        const notasi = cells[2].textContent.trim();
        if (perlakuan && !isNaN(value) && notasi) {
          jsonData.push({ perlakuan, value, notasi });
        } else {
          console.warn("Skipping malformed row:", row.textContent);
        }
      }
    });
    return jsonData;
  }

  function renderCustomNameInputs(data) {
    const container = document.getElementById('customNameInputsContainer');
    container.innerHTML = '';

    data.forEach(treatment => {
      const rowDiv = document.createElement('div');
      rowDiv.id = `custom-name-row-${treatment.perlakuan}`;
      rowDiv.innerHTML = `
                        <span>${treatment.perlakuan}</span>
                        <input type="text" id="custom-${treatment.perlakuan}" placeholder="Nama kustom untuk ${treatment.perlakuan}">
                    `;
      container.appendChild(rowDiv);

      const customInput = document.getElementById(`custom-${treatment.perlakuan}`);
      customInput.value = interpretationEngine.customTreatmentNames[treatment.perlakuan] || '';
      customInput.addEventListener('input', (event) => {
        interpretationEngine.customTreatmentNames[treatment.perlakuan] = event.target.value.trim();
        performInterpretation(false);
      });
    });
  }

  function performInterpretation(shouldRenderCustomInputs = true) {
    const data = parseTableDataToJson();
    const outputDiv = document.getElementById('interpretationOutput');
    const outputContent = document.getElementById('outputContent');
    const errorDiv = document.getElementById('errorMessage');
    const errorContent = document.getElementById('errorContent');

    outputDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    outputContent.textContent = '';
    errorContent.textContent = '';

    try {
      if (!Array.isArray(data) || data.length === 0 || data.some(item => typeof item !== 'object' || !item.perlakuan || typeof item.value === 'undefined' || !item.notasi)) {
        throw new Error("Data tabel tidak valid atau kosong. Pastikan tabel memiliki baris dengan 'Perlakuan', 'Nilai', dan 'Notasi' yang benar.");
      }

      const currentUnit = document.getElementById('unitInput').value.trim();
      const interpretation = interpretationEngine.interpretData(data, currentUnit);
      outputContent.textContent = interpretation;
      outputDiv.style.display = 'block';

      if (shouldRenderCustomInputs) {
        renderCustomNameInputs(data);
      }

    } catch (error) {
      errorContent.textContent = `Kesalahan: ${error.message}`;
      errorDiv.style.display = 'block';
      console.error("Error interpreting data:", error);
    }
  }

  if (!isAppInitialized) {
    document.getElementById('unitInput').addEventListener('input', () => {
      if (document.getElementById('interpretationOutput').style.display !== 'none') {
        performInterpretation(false);
      }
    });
    isAppInitialized = true;
  }

  performInterpretation(true);
}

///////////////////////////////////////////////////////////////////////////////////////////

function createBoxplot() {
  const table = document.querySelector('#tableContainer table');
  if (!table) {
    console.error("Tabel tidak ditemukan.");
    return;
  }

  const headers = table.querySelectorAll('th');
  let perlakuanColIndex = -1;
  let hasilColIndex = -1;
  let hasilColName = '';

  headers.forEach((header, index) => {
    const dataSetting = header.getAttribute('data-setting');
    if (dataSetting === 'Perlakuan') {
      perlakuanColIndex = index;
    } else if (dataSetting === 'Hasil') {
      hasilColIndex = index;
      hasilColName = header.innerText;
    }
  });

  if (perlakuanColIndex === -1 || hasilColIndex === -1) {
    console.error("Kolom 'Perlakuan' atau 'Hasil' (dengan data-setting) tidak ditemukan.");
    const plotContainer = document.getElementById('plotContainer');
    plotContainer.innerHTML = '<p class="plot-placeholder">Gagal membuat boxplot: Pastikan kolom "Perlakuan" dan setidaknya satu kolom "Hasil" memiliki atribut data-setting yang sesuai.</p>';
    return;
  }

  const dataByPerlakuan = {};

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length > Math.max(perlakuanColIndex, hasilColIndex)) {
      const perlakuanValue = cells[perlakuanColIndex].innerText.trim();
      const hasilValue = parseFloat(cells[hasilColIndex].innerText);

      if (!isNaN(hasilValue)) {
        if (!dataByPerlakuan[perlakuanValue]) {
          dataByPerlakuan[perlakuanValue] = [];
        }
        dataByPerlakuan[perlakuanValue].push(hasilValue);
      }
    }
  });

  const plotData = [];
  for (const perlakuanGroup in dataByPerlakuan) {
    if (dataByPerlakuan.hasOwnProperty(perlakuanGroup)) {
      plotData.push({
        y: dataByPerlakuan[perlakuanGroup],
        name: perlakuanGroup,
        type: 'box',
        boxpoints: 'all',
        jitter: 0.3,
        pointpos: -1.8
      });
    }
  }

  const layout = {
    title: '',
    yaxis: {
      title: hasilColName,
      zeroline: false
    },
    xaxis: {
      title: 'Perlakuan'
    },
    boxmode: 'group',
    margin: { t: 25, b: 85, l: 75, r: 45 },
    plot_bgcolor: '#fcfcfc',
    paper_bgcolor: '#ffffff',
    font: {
      family: 'Inter, sans-serif',
      size: 14,
      color: '#333'
    }
  };

  const plotContainer = document.getElementById('plotContainer');
  plotContainer.innerHTML = '';
  Plotly.newPlot('plotContainer', plotData, layout, { responsive: true });
}

function renderBarChart() {
  const table = document.getElementById('letterTable');
  const tbody = table.querySelector('tbody');
  const chartContainer = document.getElementById('chartContainer');


  const data = [];
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 3) {
      const perlakuan = cells[0].textContent.trim();
      const nilai = parseFloat(cells[1].textContent.trim());
      const notasi = cells[2].textContent.trim();
      if (!isNaN(nilai)) {
        data.push({ perlakuan, nilai, notasi });
      }
    }
  });

  if (data.length === 0) {
    return;
  }

  const svgWidth = 600;
  const svgHeight = 400;
  const margin = { top: 10, right: 10, bottom: 60, left: 60 };
  const chartWidth = svgWidth - margin.left - margin.right;
  const chartHeight = svgHeight - margin.top - margin.bottom;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.classList.add("chart-svg");

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
  svg.appendChild(g);

  const maxNilai = Math.max(...data.map(d => d.nilai));
  const yScaleDomainMax = maxNilai * 1.15;

  const yScale = (value) => chartHeight - (value / yScaleDomainMax) * chartHeight;

  const barPadding = 0.2;
  const barWidth = chartWidth / data.length * (1 - barPadding) - 5;
  const xOffset = chartWidth / data.length * barPadding / 2;

  data.forEach((d, i) => {
    const x = i * (chartWidth / data.length) + xOffset;
    const y = yScale(d.nilai);
    const height = chartHeight - y;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", barWidth);
    rect.setAttribute("height", height);
    rect.classList.add("chart-bar");
    g.appendChild(rect);

    const textLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textLabel.setAttribute("x", x + barWidth / 2);
    textLabel.setAttribute("y", y - 10);
    textLabel.setAttribute("text-anchor", "middle");
    textLabel.setAttribute("font-size", "14px");
    textLabel.classList.add("chart-label");
    textLabel.textContent = `${d.nilai} (${d.notasi})`;
    g.appendChild(textLabel);

    const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xLabel.setAttribute("x", x + barWidth / 2);
    xLabel.setAttribute("y", chartHeight + 25);
    xLabel.setAttribute("text-anchor", "middle");
    xLabel.setAttribute("font-size", "12px");
    xLabel.classList.add("chart-axis-label");
    xLabel.textContent = d.perlakuan;
    g.appendChild(xLabel);
  });

  const yAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxisLine.setAttribute("x1", 0);
  yAxisLine.setAttribute("y1", 0);
  yAxisLine.setAttribute("x2", 0);
  yAxisLine.setAttribute("y2", chartHeight);
  yAxisLine.setAttribute("stroke", "#d1d5db");
  yAxisLine.setAttribute("stroke-width", "2");
  g.appendChild(yAxisLine);

  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const tickValue = (yScaleDomainMax / numTicks) * i;
    const yPos = yScale(tickValue);

    const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tickLine.setAttribute("x1", -5);
    tickLine.setAttribute("y1", yPos);
    tickLine.setAttribute("x2", 0);
    tickLine.setAttribute("y2", yPos);
    tickLine.setAttribute("stroke", "#6b7280");
    tickLine.setAttribute("stroke-width", "1");
    g.appendChild(tickLine);

    const tickText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tickText.setAttribute("x", -10);
    tickText.setAttribute("y", yPos + 4);
    tickText.setAttribute("text-anchor", "end");
    tickText.setAttribute("font-size", "10px");
    tickText.classList.add("chart-axis-label");
    tickText.textContent = tickValue.toFixed(1);
    g.appendChild(tickText);
  }

  const xAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxisLine.setAttribute("x1", 0);
  xAxisLine.setAttribute("y1", chartHeight);
  xAxisLine.setAttribute("x2", chartWidth);
  xAxisLine.setAttribute("y2", chartHeight);
  xAxisLine.setAttribute("stroke", "#d1d5db");
  xAxisLine.setAttribute("stroke-width", "2");
  g.appendChild(xAxisLine);

  const yAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yAxisTitle.setAttribute("transform", `rotate(-90)`);
  yAxisTitle.setAttribute("y", -margin.left + 15);
  yAxisTitle.setAttribute("x", -chartHeight / 2);
  yAxisTitle.setAttribute("text-anchor", "middle");
  yAxisTitle.setAttribute("font-size", "14px");
  yAxisTitle.classList.add("chart-axis-label");
  yAxisTitle.textContent = "Nilai";
  g.appendChild(yAxisTitle);

  const xAxisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
  xAxisTitle.setAttribute("x", chartWidth / 2);
  xAxisTitle.setAttribute("y", chartHeight + 60);
  xAxisTitle.setAttribute("text-anchor", "middle");
  xAxisTitle.setAttribute("font-size", "14px");
  xAxisTitle.classList.add("chart-axis-label");
  xAxisTitle.textContent = "Perlakuan";
  g.appendChild(xAxisTitle);

  chartContainer.innerHTML = '';
  chartContainer.appendChild(svg);
}