// Get Data from Excel

const getData = {
  _getColumnIndex: function (settingName) {
    const table = document.querySelector('#tableContainer table');
    if (!table) return -1;

    const headers = table.querySelectorAll('th');
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].getAttribute('data-setting') === settingName) {
        return i;
      }
    }
    return -1;
  },

  count: function (settingName) {
    const columnIndex = this._getColumnIndex(settingName);
    if (columnIndex === -1) return -1;

    const uniqueValues = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > columnIndex) {
        uniqueValues.add(cells[columnIndex].textContent.trim());
      }
    });
    return uniqueValues.size;
  },

  sum: function (settingName) {
    const columnIndex = this._getColumnIndex(settingName);
    if (columnIndex === -1) return -1;

    let totalSum = 0;
    const rows = document.querySelectorAll('#tableContainer tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > columnIndex) {
        const value = parseFloat(cells[columnIndex].textContent.trim());
        if (!isNaN(value)) {
          totalSum += value;
        }
      }
    });
    return totalSum;
  },

  sumSquared: function (settingName) {
    const columnIndex = this._getColumnIndex(settingName);
    if (columnIndex === -1) return -1;

    let totalSumSquared = 0;
    const rows = document.querySelectorAll('#tableContainer tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > columnIndex) {
        const value = parseFloat(cells[columnIndex].textContent.trim());
        if (!isNaN(value)) {
          totalSumSquared += (value * value);
        }
      }
    });
    return totalSumSquared;
  },

  sumOfGroupedSquares: function () {
    const args = Array.from(arguments);
    let valueSettingName = args.pop();
    const groupingSettingNames = args;

    if (groupingSettingNames.length === 0) return -1;

    const valueColIndex = this._getColumnIndex(valueSettingName);
    if (valueColIndex === -1) return -1;

    const groupingColIndices = groupingSettingNames.map(name => this._getColumnIndex(name));
    if (groupingColIndices.some(index => index === -1)) return -1;

    const groupedSums = {};
    const rows = document.querySelectorAll('#tableContainer tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > valueColIndex) {
        const groupKeyParts = groupingColIndices.map(index => cells[index].textContent.trim());
        const groupKey = groupKeyParts.join('');

        const value = parseFloat(cells[valueColIndex].textContent.trim());

        if (!isNaN(value)) {
          if (!groupedSums[groupKey]) {
            groupedSums[groupKey] = 0;
          }
          groupedSums[groupKey] += value;
        }
      }
    });

    let totalSumOfSquaredGroups = 0;
    for (const key in groupedSums) {
      totalSumOfSquaredGroups += (groupedSums[key] * groupedSums[key]);
    }
    return totalSumOfSquaredGroups;
  },

  info: function () {
    const args = Array.from(arguments);
    let valueSettingName = args.pop();
    const groupingSettingNames = args;

    if (groupingSettingNames.length === 0) return null;

    const valueColIndex = this._getColumnIndex(valueSettingName);
    if (valueColIndex === -1) return null;

    const groupingColIndices = groupingSettingNames.map(name => this._getColumnIndex(name));
    if (groupingColIndices.some(index => index === -1)) return null;

    const groupedData = {}; // Stores { groupKey: { sum: 0, count: 0 } }
    const rows = document.querySelectorAll('#tableContainer tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > valueColIndex) {
        const groupKeyParts = groupingColIndices.map(index => cells[index].textContent.trim());
        const groupKey = groupKeyParts.join('');
        const value = parseFloat(cells[valueColIndex].textContent.trim());

        if (!isNaN(value)) {
          if (!groupedData[groupKey]) {
            groupedData[groupKey] = { sum: 0, count: 0 };
          }
          groupedData[groupKey].sum += value;
          groupedData[groupKey].count++;
        }
      }
    });

    const results = [];
    // Sort keys to ensure consistent output order
    const sortedKeys = Object.keys(groupedData).sort();

    sortedKeys.forEach(key => {
      if (groupedData[key].count > 0) {
        const average = groupedData[key].sum / groupedData[key].count;
        results.push(`${key} ${average.toFixed(2)}`); // Format to two decimal places
      }
    });

    return results.join('\n');
  }
};

document.querySelectorAll('.collapse').forEach(collapse => {
  const setMaxHeight = () => {
    collapse.style.maxHeight = window.innerWidth >= 1440 ? '85px' : '70px';
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
};

const toggleShow = (selector) => {
  document.querySelector(selector).classList.toggle('show');
};

function getFileName() {
  const x = document.getElementById('fileInput')
  x.style.visibility = 'collapse'
  document.getElementById('fileName').innerHTML = x.value.split('\\').pop();
  document.getElementById('fileName').style.margin = "0";
  document.getElementById('fileName').style.padding = ".5rem 1rem";
  document.querySelector('.excel .input-files label span:first-child').style.display = 'none';
};

let selectedDesign = document.getElementById('jenis-anova').value;
let selectedFactor = document.getElementById('jenis-faktor').value;
let selectedRPT = document.getElementById('jenis-rpt').value;
let selectedPosthoc = document.getElementById('jenis-posthoc').value;

document.querySelectorAll('.type select').forEach(selectElement => {
  selectElement.addEventListener('change', function () {
    selectedDesign = document.getElementById('jenis-anova').value;
    selectedFactor = document.getElementById('jenis-faktor').value;
    selectedRPT = document.getElementById('jenis-rpt').value;
    selectedPosthoc = document.getElementById('jenis-posthoc').value;
  });
});

const fileInput = document.getElementById('fileInput');
const tableContainer = document.getElementById('tableContainer');
const fileContainer = document.querySelector('.file-container');
const sheetSelectorContainer = document.getElementById('sheetSelectorContainer');
const sheetSelect = document.getElementById('sheetSelect');
const settingsContainer = document.getElementById('settingsContainer');

const perlakuanBtn = document.getElementById('perlakuanBtn');
const faktorABtn = document.getElementById('faktoraBtn');
const faktorBBtn = document.getElementById('faktorbBtn');
const barisBtn = document.getElementById('barisBtn');
const kolomBtn = document.getElementById('kolomBtn');

const ulanganBtn = document.getElementById('ulanganBtn');
const hasilBtn = document.getElementById('hasilBtn');

const selectedFaktorAHeaderDisplay = document.getElementById('selectedFaktorAHeader');
const selectedFaktorBHeaderDisplay = document.getElementById('selectedFaktorBHeader');
const selectedPerlakuanHeaderDisplay = document.getElementById('selectedPerlakuanHeader');
const selectedBarisHeaderDisplay = document.getElementById('selectedBarisHeader');
const selectedKolomHeaderDisplay = document.getElementById('selectedKolomHeader');

let selectedFaktorAText;
let selectedFaktorBText;
let selectedPerlakuanText;
let selectedBarisText;
let selectedKolomText;

const selectedUlanganHeaderDisplay = document.getElementById('selectedUlanganHeader');
const selectedHasilHeaderDisplay = document.getElementById('selectedHasilHeader');

let currentWorkbook = null;
let currentTableData = [];
let selectedSettingType = null;
let selectedHeaders = { FaktorA: null, FaktorB: null, Perlakuan: null, Baris: null, Kolom: null, Ulangan: null, Hasil: null };

perlakuanBtn.addEventListener('click', () => activateSetting('Perlakuan'));
faktorABtn.addEventListener('click', () => activateSetting('FaktorA'));
faktorBBtn.addEventListener('click', () => activateSetting('FaktorB'));
barisBtn.addEventListener('click', () => activateSetting('Baris'));
kolomBtn.addEventListener('click', () => activateSetting('Kolom'));
ulanganBtn.addEventListener('click', () => activateSetting('Ulangan'));
hasilBtn.addEventListener('click', () => activateSetting('Hasil'));

fileInput.addEventListener('change', handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  smoothScroll('#tableContainer', top = 75)
  if (!file) {
    return;
  }

  tableContainer.innerHTML = '';
  sheetSelectorContainer.style.display = 'none';
  settingsContainer.style.display = 'none';
  resetSettings();resetHeaders();

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
      fileContainer.classList.add('show-sheet')
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

sheetSelect.addEventListener('change', displaySelectedSheet);

function displaySelectedSheet() {
  if (currentWorkbook) {
    const selectedSheetName = sheetSelect.value;
    displaySheet(currentWorkbook, selectedSheetName);
    resetSettings();resetHeaders();
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

document.querySelectorAll('.type select').forEach(selectElement => {
  selectElement.addEventListener('change', function () {
    if (selectedDesign === "ral" && selectedFactor === "1" || selectedDesign === "rak" && selectedFactor === "1") {
      document.getElementById('buttonContainer').classList.remove('factorial');
      document.getElementById('buttonContainer').classList.remove('bujursangkar');
      document.querySelector('.type').classList.remove('rpt');
    } else if (selectedDesign === "ral" && selectedFactor === "2" || selectedDesign === "rak" && selectedFactor === "2") {
      document.getElementById('buttonContainer').classList.add('factorial');
      document.getElementById('buttonContainer').classList.remove('bujursangkar');
      document.querySelector('.type').classList.remove('rpt');
    } else if (selectedDesign === "rbsl") {
      document.getElementById('buttonContainer').classList.remove('factorial');
      document.getElementById('buttonContainer').classList.add('bujursangkar');
      document.querySelector('.type').classList.remove('rpt');
    } else if (selectedDesign === "rpt") {
      document.getElementById('buttonContainer').classList.add('factorial');
      document.getElementById('buttonContainer').classList.remove('bujursangkar');
      document.querySelector('.type').classList.add('rpt');
    }
  });
});

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

  const headerMap = {
    Perlakuan: selectedPerlakuanHeaderDisplay,
    Ulangan: selectedUlanganHeaderDisplay,
    Hasil: selectedHasilHeaderDisplay,
    FaktorA: selectedFaktorAHeaderDisplay,
    FaktorB: selectedFaktorBHeaderDisplay,
    Baris: selectedBarisHeaderDisplay,
    Kolom: selectedKolomHeaderDisplay,
  };

  if (headerMap[selectedSettingType]) {
    headerMap[selectedSettingType].textContent = headerText;
  }

  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  selectedSettingType = null;

  // Menampilkan tombol analisis (.run) dan scroll ke tombolnya
  if (selectedDesign === "ral" && selectedFactor === "1" || selectedDesign === "rak" && selectedFactor === "1") {
    if (selectedHeaders.Perlakuan && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  } else if (selectedDesign === "ral" && selectedFactor === "2" || selectedDesign === "rak" && selectedFactor === "2") {
    if (selectedHeaders.FaktorA && selectedHeaders.FaktorB && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  } else if (selectedDesign === "rbsl") {
    if (selectedHeaders.Perlakuan && selectedHeaders.Baris && selectedHeaders.Kolom && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  } else if (selectedDesign === "rpt") {
    if (selectedHeaders.FaktorA && selectedHeaders.FaktorB && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  }

  document.querySelector('.run').addEventListener('click', () => {
    selectedFaktorAText = selectedFaktorAHeaderDisplay.textContent;
    selectedFaktorBText = selectedFaktorBHeaderDisplay.textContent;
    selectedPerlakuanText = selectedPerlakuanHeaderDisplay.textContent;
    selectedBarisText = selectedBarisHeaderDisplay.textContent;
    selectedKolomText = selectedKolomHeaderDisplay.textContent;
    document.querySelector('.separator').classList.remove('none');
    document.querySelector('.anova').classList.add('show');
    document.querySelector('#posthoc').classList.remove('none');
    document.querySelector('#posthoc').innerHTML = ``;

    const anovaSup = document.querySelector("#anovaSup");
    if (selectedDesign === "ral" && selectedFactor === "1") {
      countAnovaRAL();
      anovaSup.classList.remove("bujursangkar")
    } else if (selectedDesign === "rak" && selectedFactor === "1") {
      countAnovaRAK();
      anovaSup.classList.remove("bujursangkar")
    } else if (selectedDesign === "ral" && selectedFactor === "2") {
      countAnovaRALF();
      anovaSup.classList.remove("bujursangkar")
    } else if (selectedDesign === "rak" && selectedFactor === "2") {
      countAnovaRAKF();
      anovaSup.classList.remove("bujursangkar")
    } else if (selectedDesign === "rbsl") {
      countAnovaRBSL();
      anovaSup.classList.remove("bujursangkar")
    } else if (selectedDesign === "rpt" && selectedRPT === "ral") {
      countAnovaRPT_RAL();
      anovaSup.classList.add("bujursangkar")
    } else if (selectedDesign === "rpt" && selectedRPT === "rak") {
      countAnovaRPT_RAK();
      anovaSup.classList.add("bujursangkar")
    }

    document.querySelectorAll('.posthoc-collapser').forEach(c => {
      c.innerHTML += `<div class='posthoc-collapser-item'><img src='../icon/arrow-down.png'></div>`;
    });
    // Collapse and uncollapse on Posthoc
    document.querySelectorAll('.posthoc-collapser').forEach(c => {
      c.nextElementSibling.querySelector('.posthoc-collapsed-item').style.height = '0';
      c.querySelector('.posthoc-collapser-item').addEventListener('click', () => {
        c.classList.toggle('show');
        const content = c.nextElementSibling;
        const child = content.querySelector('.posthoc-collapsed-item');
        if (content.classList.toggle('show')) {
          child.style.height = child.scrollHeight + 'px';
        } else {
          child.style.height = '0';
        }
      });
    });
    // Changed the lang
    updateLanguage(siteLangSelect.value); 
  })
}

function resetSettings() {
  document.querySelector('.separator').classList.add('none');
  document.querySelector('#anova').classList.remove('show');
  document.querySelector('#posthoc').classList.add('none');
}

function resetHeaders() {
  selectedSettingType = null;
  selectedHeaders = { FaktorA: null, FaktorB: null, Perlakuan: null, Baris: null, Kolom: null, Ulangan: null, Hasil: null };
  selectedFaktorAHeaderDisplay.textContent = '-';
  selectedFaktorBHeaderDisplay.textContent = '-';
  selectedPerlakuanHeaderDisplay.textContent = '-';
  selectedBarisHeaderDisplay.textContent = '-';
  selectedKolomHeaderDisplay.textContent = '-';
  selectedUlanganHeaderDisplay.textContent = '-';
  selectedHasilHeaderDisplay.textContent = '-';
  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('#tableContainer .selected-header').forEach(e => {
    e.removeAttribute('data-setting');
    e.classList.remove('selected-header');
  });
  document.querySelector('.run').classList.add('none');
}

const inputs = [
  { id: 'jenis-posthoc', handler: resetSettings },
  { id: 'jenis-anova', handler: resetSettings }
];

inputs.forEach(({ id, handler }) => {
  document.getElementById(id).addEventListener('change', handler);
});

function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

///////////////////////////////////////////////////////////////////////////////////////////

// ----- RAL -----
function countAnovaRAL() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Completely Randomized Design (CRD)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Acak Lengkap (RAL)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td>Perlakuan</td>
        <td class="Pdb"></td>
        <td class="Pjk"></td>
        <td class="Pkt"></td>
        <td class="Pfh"></td>
        <td class="Pft5"></td>
        <td class="Pft1"></td>
        <td class="Psg"></td>
      </tr>
      <tr>
        <td data-id='Galat'>Residuals</td>
        <td class="Gdb"></td>
        <td class="Gjk"></td>
        <td class="Gkt"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="Tdb"></td>
        <td class="Tjk"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkk, cellfk, cellgt,
    cellPft5, cellPft1,
    cellPdb, cellPjk, cellPkt, cellPfh, cellPsg,
    cellGdb, cellGjk, cellGkt, cellTdb, cellTjk
  ] = [
    'kk', 'fk', 'gt',
    'Pft5', 'Pft1',
    'Pdb', 'Pjk', 'Pkt', 'Pfh', 'Psg',
    'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / (getData.count("Ulangan") * (getData.count("Perlakuan")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Pdb = getData.count("Perlakuan") - 1;
  cellPdb.innerHTML = Pdb;
  const Gdb = (getData.count("Ulangan") - 1) * getData.count("Perlakuan");
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("Ulangan") * getData.count("Perlakuan") - 1;
  cellTdb.innerHTML = Tdb;

  const Pjk = getData.sumOfGroupedSquares("Perlakuan", "Hasil") / getData.count("Ulangan") - fk;
  cellPjk.innerHTML = Pjk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Pjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Pkt = Pjk / Pdb;
  cellPkt.innerHTML = Pkt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Pfh = Pkt / Gkt;
  cellPfh.innerHTML = Pfh.toFixed(2);

  const Pft5 = jStat.centralF.inv(0.95, Pdb, Gdb);
  cellPft5.innerHTML = Pft5.toFixed(2);
  const Pft1 = jStat.centralF.inv(0.99, Pdb, Gdb);
  cellPft1.innerHTML = Pft1.toFixed(2);

  if (Pfh > Pft1) {
    cellPsg.innerHTML = "**"
  } else if (Pfh > Pft5) {
    cellPsg.innerHTML = "*"
  } else {
    cellPsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    // Nilai Tabel
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    // Nilai Hitung
    thitP = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Perlakuan
    processFLSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thitP);
  }
  // THSD
  else if (selectedPosthoc === "bnj") {
    // Nilai Tabel
    tableP = (jStat.tukey.inv(0.95, getData.count("Perlakuan"), Gdb));
    // Nilai Hitung
    thitP = (tableP * Math.sqrt(Gkt / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processTHSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thitP);
  }
  // DMRT
  else if (selectedPosthoc === "dmrt") {
    processDMRT(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Ulangan"));
  }
  // SNK
  else if (selectedPosthoc === "snk") {
    processSNK(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Ulangan"));
  }
  // SK
  else if (selectedPosthoc === "sk") {
    processSK('Perlakuan', selectedPerlakuanText, getData.info("Perlakuan", "Hasil"));
  }

}

// ----- RAK -----
function countAnovaRAK() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Randomized Block Design (RBD)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Acak Kelompok (RAK)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td data-id='Kelompok'>Block</td>
        <td class="Udb"></td>
        <td class="Ujk"></td>
        <td class="Ukt"></td>
        <td class="Ufh"></td>
        <td class="Uft5"></td>
        <td class="Uft1"></td>
        <td class="Usg"></td>
      </tr>
      <tr>
        <td>Perlakuan</td>
        <td class="Pdb"></td>
        <td class="Pjk"></td>
        <td class="Pkt"></td>
        <td class="Pfh"></td>
        <td class="Pft5"></td>
        <td class="Pft1"></td>
        <td class="Psg"></td>
      </tr>
      <tr>
        <td data-id='Galat'>Residuals</td>
        <td class="Gdb"></td>
        <td class="Gjk"></td>
        <td class="Gkt"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="Tdb"></td>
        <td class="Tjk"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkk, cellfk, cellgt,
    cellUdb, cellUjk, cellUkt, cellUfh, cellUft5, cellUft1, cellUsg,
    cellPft5, cellPft1,
    cellPdb, cellPjk, cellPkt, cellPfh, cellPsg,
    cellGdb, cellGjk, cellGkt, cellTdb, cellTjk
  ] = [
    'kk', 'fk', 'gt',
    'Udb', 'Ujk', 'Ukt', 'Ufh', 'Uft5', 'Uft1', 'Usg',
    'Pft5', 'Pft1',
    'Pdb', 'Pjk', 'Pkt', 'Pfh', 'Psg',
    'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / (getData.count("Ulangan") * (getData.count("Perlakuan")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Udb = getData.count("Ulangan") - 1;
  cellUdb.innerHTML = Udb;
  const Pdb = getData.count("Perlakuan") - 1;
  cellPdb.innerHTML = Pdb;
  const Gdb = (getData.count("Ulangan") - 1) * (getData.count("Perlakuan") - 1);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("Ulangan") * getData.count("Perlakuan") - 1;
  cellTdb.innerHTML = Tdb;

  const Ujk = getData.sumOfGroupedSquares("Ulangan", "Hasil") / getData.count("Perlakuan") - fk;
  cellUjk.innerHTML = Ujk.toFixed(2);
  const Pjk = getData.sumOfGroupedSquares("Perlakuan", "Hasil") / getData.count("Ulangan") - fk;
  cellPjk.innerHTML = Pjk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Ujk - Pjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Ukt = Ujk / Udb;
  cellUkt.innerHTML = Ukt.toFixed(2);
  const Pkt = Pjk / Pdb;
  cellPkt.innerHTML = Pkt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Ufh = Ukt / Gkt;
  cellUfh.innerHTML = Ufh.toFixed(2);
  const Pfh = Pkt / Gkt;
  cellPfh.innerHTML = Pfh.toFixed(2);

  const Uft5 = jStat.centralF.inv(0.95, Udb, Gdb);
  cellUft5.innerHTML = Uft5.toFixed(2);
  const Uft1 = jStat.centralF.inv(0.99, Udb, Gdb);
  cellUft1.innerHTML = Uft1.toFixed(2);

  const Pft5 = jStat.centralF.inv(0.95, Pdb, Gdb);
  cellPft5.innerHTML = Pft5.toFixed(2);
  const Pft1 = jStat.centralF.inv(0.99, Pdb, Gdb);
  cellPft1.innerHTML = Pft1.toFixed(2);

  if (Ufh > Uft1) {
    cellUsg.innerHTML = "**"
  } else if (Ufh > Uft5) {
    cellUsg.innerHTML = "*"
  } else {
    cellUsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Pfh > Pft1) {
    cellPsg.innerHTML = "**"
  } else if (Pfh > Pft5) {
    cellPsg.innerHTML = "*"
  } else {
    cellPsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    // Nilai Tabel
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    // Nilai Hitung
    thitP = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Perlakuan
    processFLSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thitP);
  }
  // THSD
  else if (selectedPosthoc === "bnj") {
    // Nilai Tabel
    tableP = (jStat.tukey.inv(0.95, getData.count("Perlakuan"), Gdb));
    // Nilai Hitung
    thitP = (tableP * Math.sqrt(Gkt / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processTHSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thitP);
  }
  // DMRT
  else if (selectedPosthoc === "dmrt") {
    processDMRT(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Ulangan"));
  }
  // SNK
  else if (selectedPosthoc === "snk") {
    processSNK(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Ulangan"));
  }
  // SK
  else if (selectedPosthoc === "sk") {
    processSK('Perlakuan', selectedPerlakuanText, getData.info("Perlakuan", "Hasil"));
  }

}

// ----- RAL-F -----
function countAnovaRALF() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Completely Randomized Design (2 Factors)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Acak Lengkap (2 Faktor)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td>${selectedFaktorAText}</td>
        <td class="Adb"></td>
        <td class="Ajk"></td>
        <td class="Akt"></td>
        <td class="Afh"></td>
        <td class="Aft5"></td>
        <td class="Aft1"></td>
        <td class="Asg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorBText}</td>
        <td class="Bdb"></td>
        <td class="Bjk"></td>
        <td class="Bkt"></td>
        <td class="Bfh"></td>
        <td class="Bft5"></td>
        <td class="Bft1"></td>
        <td class="Bsg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorAText} × ${selectedFaktorBText}</td>
        <td class="ABdb"></td>
        <td class="ABjk"></td>
        <td class="ABkt"></td>
        <td class="ABfh"></td>
        <td class="ABft5"></td>
        <td class="ABft1"></td>
        <td class="ABsg"></td>
      </tr>
      <tr>
        <td data-id='Galat'>Residuals</td>
        <td class="Gdb"></td>
        <td class="Gjk"></td>
        <td class="Gkt"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="Tdb"></td>
        <td class="Tjk"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkk, cellfk, cellgt,
    cellAft5, cellAft1, cellBft5, cellBft1, cellABft5, cellABft1,
    cellAdb, cellAjk, cellAkt, cellAfh, cellAsg,
    cellBdb, cellBjk, cellBkt, cellBfh, cellBsg,
    cellABdb, cellABjk, cellABkt, cellABfh, cellABsg,
    cellGdb, cellGjk, cellGkt, cellTdb, cellTjk
  ] = [
    'kk', 'fk', 'gt',
    'Aft5', 'Aft1', 'Bft5', 'Bft1', 'ABft5', 'ABft1',
    'Adb', 'Ajk', 'Akt', 'Afh', 'Asg',
    'Bdb', 'Bjk', 'Bkt', 'Bfh', 'Bsg',
    'ABdb', 'ABjk', 'ABkt', 'ABfh', 'ABsg',
    'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / (getData.count("Ulangan") * (getData.count("FaktorA") * getData.count("FaktorB")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Adb = getData.count("FaktorA") - 1;
  cellAdb.innerHTML = Adb;
  const Bdb = getData.count("FaktorB") - 1;
  cellBdb.innerHTML = Bdb;
  const ABdb = (getData.count("FaktorA") - 1) * (getData.count("FaktorB") - 1);
  cellABdb.innerHTML = ABdb;
  const Gdb = (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan") - 1) - (Adb + Bdb + ABdb);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan") - 1;
  cellTdb.innerHTML = Tdb;

  const Ajk = getData.sumOfGroupedSquares("FaktorA", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorB")) - fk;
  cellAjk.innerHTML = Ajk.toFixed(2);
  const Bjk = getData.sumOfGroupedSquares("FaktorB", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorA")) - fk;
  cellBjk.innerHTML = Bjk.toFixed(2);
  const ABjk = (getData.sumOfGroupedSquares("FaktorA", "FaktorB", "Hasil") / getData.count("Ulangan")) - fk - Ajk - Bjk;
  cellABjk.innerHTML = ABjk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Ajk - Bjk - ABjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Akt = Ajk / Adb;
  cellAkt.innerHTML = Akt.toFixed(2);
  const Bkt = Bjk / Bdb;
  cellBkt.innerHTML = Bkt.toFixed(2);
  const ABkt = ABjk / ABdb;
  cellABkt.innerHTML = ABkt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Afh = Akt / Gkt;
  cellAfh.innerHTML = Afh.toFixed(2);
  const Bfh = Bkt / Gkt;
  cellBfh.innerHTML = Bfh.toFixed(2);
  const ABfh = ABkt / Gkt;
  cellABfh.innerHTML = ABfh.toFixed(2);

  const Aft5 = jStat.centralF.inv(0.95, Adb, Gdb);
  cellAft5.innerHTML = Aft5.toFixed(2);
  const Aft1 = jStat.centralF.inv(0.99, Adb, Gdb);
  cellAft1.innerHTML = Aft1.toFixed(2);

  const Bft5 = jStat.centralF.inv(0.95, Bdb, Gdb);
  cellBft5.innerHTML = Bft5.toFixed(2);
  const Bft1 = jStat.centralF.inv(0.99, Bdb, Gdb);
  cellBft1.innerHTML = Bft1.toFixed(2);

  const ABft5 = jStat.centralF.inv(0.95, ABdb, Gdb);
  cellABft5.innerHTML = ABft5.toFixed(2);
  const ABft1 = jStat.centralF.inv(0.99, ABdb, Gdb);
  cellABft1.innerHTML = ABft1.toFixed(2);

  if (Afh > Aft1) {
    cellAsg.innerHTML = "**"
  } else if (Afh > Aft5) {
    cellAsg.innerHTML = "*"
  } else {
    cellAsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Bfh > Bft1) {
    cellBsg.innerHTML = "**"
  } else if (Bfh > Bft5) {
    cellBsg.innerHTML = "*"
  } else {
    cellBsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (ABfh > ABft1) {
    cellABsg.innerHTML = "**";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else if (ABfh > ABft5) {
    cellABsg.innerHTML = "*";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else {
    cellABsg.innerHTML = "<span data-id='tn'>ns</span>";
    document.querySelector('#posthoc').classList.add('tanpa-interaksi')
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    // Nilai Tabel
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    // Nilai Hitung
    thitA = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorB"))));
    thitB = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorA"))));
    thitAB = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processFLSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processFLSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processFLSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processFLSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processFLSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // THSD
  else if (selectedPosthoc === "bnj") {
    // Nilai Tabel
    tableA = (jStat.tukey.inv(0.95, getData.count("FaktorA"), Gdb));
    tableB = (jStat.tukey.inv(0.95, getData.count("FaktorB"), Gdb));
    tableAB = (jStat.tukey.inv(0.95, getData.count("FaktorA") * getData.count("FaktorB"), Gdb));
    // Nilai Hitung
    thitA = (tableA * Math.sqrt(Gkt / (getData.count("FaktorB") * getData.count("Ulangan"))));
    thitB = (tableB * Math.sqrt(Gkt / (getData.count("FaktorA") * getData.count("Ulangan"))));
    thitAB = (tableAB * Math.sqrt(Gkt / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processTHSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processTHSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processTHSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processTHSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processTHSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // DMRT
  else if (selectedPosthoc === "dmrt") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processDMRT(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
    processDMRT(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    processDMRT('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processDMRT(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processDMRT(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // SNK
  else if (selectedPosthoc === "snk") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processSNK(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
    processSNK(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    processSNK('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processSNK(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processSNK(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // SK
  else if (selectedPosthoc === "sk") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processSK('factorA', selectedFaktorAText, getData.info("FaktorA", "Hasil"));
    processSK('factorB', selectedFaktorBText, getData.info("FaktorB", "Hasil"));
    processSK('factorAB', '<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, getData.info("FaktorA", "FaktorB", "Hasil"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processSK(`leading_${faktorA}`, faktorA, info.join('\n'));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processSK(`leading_${faktorB}`, faktorB, info.join('\n'));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }

}

// ----- RAK-F -----
function countAnovaRAKF() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Randomized Block Design (2 Factors)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Acak Kelompok (2 Faktor)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td data-id='Kelompok'>Block</td>
        <td class="Udb"></td>
        <td class="Ujk"></td>
        <td class="Ukt"></td>
        <td class="Ufh"></td>
        <td class="Uft5"></td>
        <td class="Uft1"></td>
        <td class="Usg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorAText}</td>
        <td class="Adb"></td>
        <td class="Ajk"></td>
        <td class="Akt"></td>
        <td class="Afh"></td>
        <td class="Aft5"></td>
        <td class="Aft1"></td>
        <td class="Asg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorBText}</td>
        <td class="Bdb"></td>
        <td class="Bjk"></td>
        <td class="Bkt"></td>
        <td class="Bfh"></td>
        <td class="Bft5"></td>
        <td class="Bft1"></td>
        <td class="Bsg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorAText} × ${selectedFaktorBText}</td>
        <td class="ABdb"></td>
        <td class="ABjk"></td>
        <td class="ABkt"></td>
        <td class="ABfh"></td>
        <td class="ABft5"></td>
        <td class="ABft1"></td>
        <td class="ABsg"></td>
      </tr>
      <tr>
        <td data-id='Galat'>Residuals</td>
        <td class="Gdb"></td>
        <td class="Gjk"></td>
        <td class="Gkt"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="Tdb"></td>
        <td class="Tjk"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkk, cellfk, cellgt,
    cellUdb, cellUjk, cellUkt, cellUfh, cellUft5, cellUft1, cellUsg,
    cellAft5, cellAft1, cellBft5, cellBft1, cellABft5, cellABft1,
    cellAdb, cellAjk, cellAkt, cellAfh, cellAsg,
    cellBdb, cellBjk, cellBkt, cellBfh, cellBsg,
    cellABdb, cellABjk, cellABkt, cellABfh, cellABsg,
    cellGdb, cellGjk, cellGkt, cellTdb, cellTjk
  ] = [
    'kk', 'fk', 'gt',
    'Udb', 'Ujk', 'Ukt', 'Ufh', 'Uft5', 'Uft1', 'Usg',
    'Aft5', 'Aft1', 'Bft5', 'Bft1', 'ABft5', 'ABft1',
    'Adb', 'Ajk', 'Akt', 'Afh', 'Asg',
    'Bdb', 'Bjk', 'Bkt', 'Bfh', 'Bsg',
    'ABdb', 'ABjk', 'ABkt', 'ABfh', 'ABsg',
    'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / (getData.count("Ulangan") * (getData.count("FaktorA") * getData.count("FaktorB")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Udb = getData.count("Ulangan") - 1;
  cellUdb.innerHTML = Udb;
  const Adb = getData.count("FaktorA") - 1;
  cellAdb.innerHTML = Adb;
  const Bdb = getData.count("FaktorB") - 1;
  cellBdb.innerHTML = Bdb;
  const ABdb = (getData.count("FaktorA") - 1) * (getData.count("FaktorB") - 1);
  cellABdb.innerHTML = ABdb;
  const Gdb = (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan") - 1) - (Adb + Bdb + ABdb + Udb);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan") - 1;
  cellTdb.innerHTML = Tdb;

  const Ujk = getData.sumOfGroupedSquares("Ulangan", "Hasil") / (getData.count("FaktorA") * getData.count("FaktorB")) - fk;
  cellUjk.innerHTML = Ujk.toFixed(2);
  const Ajk = getData.sumOfGroupedSquares("FaktorA", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorB")) - fk;
  cellAjk.innerHTML = Ajk.toFixed(2);
  const Bjk = getData.sumOfGroupedSquares("FaktorB", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorA")) - fk;
  cellBjk.innerHTML = Bjk.toFixed(2);
  const ABjk = (getData.sumOfGroupedSquares("FaktorA", "FaktorB", "Hasil") / getData.count("Ulangan")) - fk - Ajk - Bjk;
  cellABjk.innerHTML = ABjk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Ujk - Ajk - Bjk - ABjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Ukt = Ujk / Udb;
  cellUkt.innerHTML = Ukt.toFixed(2);
  const Akt = Ajk / Adb;
  cellAkt.innerHTML = Akt.toFixed(2);
  const Bkt = Bjk / Bdb;
  cellBkt.innerHTML = Bkt.toFixed(2);
  const ABkt = ABjk / ABdb;
  cellABkt.innerHTML = ABkt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Ufh = Ukt / Gkt;
  cellUfh.innerHTML = Ufh.toFixed(2);
  const Afh = Akt / Gkt;
  cellAfh.innerHTML = Afh.toFixed(2);
  const Bfh = Bkt / Gkt;
  cellBfh.innerHTML = Bfh.toFixed(2);
  const ABfh = ABkt / Gkt;
  cellABfh.innerHTML = ABfh.toFixed(2);

  const Uft5 = jStat.centralF.inv(0.95, Udb, Gdb);
  cellUft5.innerHTML = Uft5.toFixed(2);
  const Uft1 = jStat.centralF.inv(0.99, Udb, Gdb);
  cellUft1.innerHTML = Uft1.toFixed(2);

  const Aft5 = jStat.centralF.inv(0.95, Adb, Gdb);
  cellAft5.innerHTML = Aft5.toFixed(2);
  const Aft1 = jStat.centralF.inv(0.99, Adb, Gdb);
  cellAft1.innerHTML = Aft1.toFixed(2);

  const Bft5 = jStat.centralF.inv(0.95, Bdb, Gdb);
  cellBft5.innerHTML = Bft5.toFixed(2);
  const Bft1 = jStat.centralF.inv(0.99, Bdb, Gdb);
  cellBft1.innerHTML = Bft1.toFixed(2);

  const ABft5 = jStat.centralF.inv(0.95, ABdb, Gdb);
  cellABft5.innerHTML = ABft5.toFixed(2);
  const ABft1 = jStat.centralF.inv(0.99, ABdb, Gdb);
  cellABft1.innerHTML = ABft1.toFixed(2);

  if (Ufh > Uft1) {
    cellUsg.innerHTML = "**"
  } else if (Ufh > Uft5) {
    cellUsg.innerHTML = "*"
  } else {
    cellUsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Afh > Aft1) {
    cellAsg.innerHTML = "**"
  } else if (Afh > Aft5) {
    cellAsg.innerHTML = "*"
  } else {
    cellAsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Bfh > Bft1) {
    cellBsg.innerHTML = "**"
  } else if (Bfh > Bft5) {
    cellBsg.innerHTML = "*"
  } else {
    cellBsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (ABfh > ABft1) {
    cellABsg.innerHTML = "**";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else if (ABfh > ABft5) {
    cellABsg.innerHTML = "*";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else {
    cellABsg.innerHTML = "<span data-id='tn'>ns</span>";
    document.querySelector('#posthoc').classList.add('tanpa-interaksi')
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    // Nilai Tabel
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    // Nilai Hitung
    thitA = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorB"))));
    thitB = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorA"))));
    thitAB = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processFLSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processFLSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processFLSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processFLSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processFLSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // THSD
  else if (selectedPosthoc === "bnj") {
    // Nilai Tabel
    tableA = (jStat.tukey.inv(0.95, getData.count("FaktorA"), Gdb));
    tableB = (jStat.tukey.inv(0.95, getData.count("FaktorB"), Gdb));
    tableAB = (jStat.tukey.inv(0.95, getData.count("FaktorA") * getData.count("FaktorB"), Gdb));
    // Nilai Hitung
    thitA = (tableA * Math.sqrt(Gkt / (getData.count("FaktorB") * getData.count("Ulangan"))));
    thitB = (tableB * Math.sqrt(Gkt / (getData.count("FaktorA") * getData.count("Ulangan"))));
    thitAB = (tableAB * Math.sqrt(Gkt / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processTHSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processTHSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processTHSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processTHSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processTHSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // DMRT
  else if (selectedPosthoc === "dmrt") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processDMRT(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
    processDMRT(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    processDMRT('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processDMRT(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processDMRT(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // SNK
  else if (selectedPosthoc === "snk") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processSNK(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
    processSNK(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    processSNK('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processSNK(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processSNK(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // SK
  else if (selectedPosthoc === "sk") {
    // Faktor A, Faktor B, dan Kombinasi AB
    processSK('factorA', selectedFaktorAText, getData.info("FaktorA", "Hasil"));
    processSK('factorB', selectedFaktorBText, getData.info("FaktorB", "Hasil"));
    processSK('factorAB', '<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, getData.info("FaktorA", "FaktorB", "Hasil"));
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processSK(`leading_${faktorA}`, faktorA, info.join('\n'));
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processSK(`leading_${faktorB}`, faktorB, info.join('\n'));
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }

}

// ----- RBSL -----
function countAnovaRBSL() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Latin Square Design (LSD)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Bujur Sangkar Latin (RBSL)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td>${selectedBarisText}</td>
        <td class="Barisdb"></td>
        <td class="Barisjk"></td>
        <td class="Bariskt"></td>
        <td class="Barisfh"></td>
        <td class="Barisft5"></td>
        <td class="Barisft1"></td>
        <td class="Barissg"></td>
      </tr>
      <tr>
        <td>${selectedKolomText}</td>
        <td class="Kolomdb"></td>
        <td class="Kolomjk"></td>
        <td class="Kolomkt"></td>
        <td class="Kolomfh"></td>
        <td class="Kolomft5"></td>
        <td class="Kolomft1"></td>
        <td class="Kolomsg"></td>
      </tr>
      <tr>
        <td>${selectedPerlakuanText}</td>
        <td class="Perlakuandb"></td>
        <td class="Perlakuanjk"></td>
        <td class="Perlakuankt"></td>
        <td class="Perlakuanfh"></td>
        <td class="Perlakuanft5"></td>
        <td class="Perlakuanft1"></td>
        <td class="Perlakuansg"></td>
      </tr>
      <tr>
        <td data-id='Galat'>Residuals</td>
        <td class="Gdb"></td>
        <td class="Gjk"></td>
        <td class="Gkt"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="Tdb"></td>
        <td class="Tjk"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkk, cellfk, cellgt,
    cellBarisft5, cellBarisft1, cellKolomft5, cellKolomft1, cellPerlakuanft5, cellPerlakuanft1,
    cellBarisdb, cellBarisjk, cellBariskt, cellBarisfh, cellBarissg,
    cellKolomdb, cellKolomjk, cellKolomkt, cellKolomfh, cellKolomsg,
    cellPerlakuandb, cellPerlakuanjk, cellPerlakuankt, cellPerlakuanfh, cellPerlakuansg,
    cellGdb, cellGjk, cellGkt, cellTdb, cellTjk
  ] = [
    'kk', 'fk', 'gt',
    'Barisft5', 'Barisft1', 'Kolomft5', 'Kolomft1', 'Perlakuanft5', 'Perlakuanft1',
    'Barisdb', 'Barisjk', 'Bariskt', 'Barisfh', 'Barissg',
    'Kolomdb', 'Kolomjk', 'Kolomkt', 'Kolomfh', 'Kolomsg',
    'Perlakuandb', 'Perlakuanjk', 'Perlakuankt', 'Perlakuanfh', 'Perlakuansg',
    'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / ((getData.count("Baris") * getData.count("Kolom")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Barisdb = getData.count("Baris") - 1;
  cellBarisdb.innerHTML = Barisdb;
  const Kolomdb = getData.count("Kolom") - 1;
  cellKolomdb.innerHTML = Kolomdb;
  const Perlakuandb = getData.count("Perlakuan") - 1;
  cellPerlakuandb.innerHTML = Perlakuandb;
  const Gdb = (getData.count("Baris") - 1) * (getData.count("Kolom") - 2);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("Baris") * getData.count("Kolom") - 1;
  cellTdb.innerHTML = Tdb;

  const Barisjk = getData.sumOfGroupedSquares("Baris", "Hasil") / getData.count("Baris") - fk;
  cellBarisjk.innerHTML = Barisjk.toFixed(2);
  const Kolomjk = getData.sumOfGroupedSquares("Kolom", "Hasil") / getData.count("Kolom") - fk;
  cellKolomjk.innerHTML = Kolomjk.toFixed(2);
  const Perlakuanjk = getData.sumOfGroupedSquares("Perlakuan", "Hasil") / getData.count("Perlakuan") - fk;
  cellPerlakuanjk.innerHTML = Perlakuanjk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Barisjk - Kolomjk - Perlakuanjk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Bariskt = Barisjk / Barisdb;
  cellBariskt.innerHTML = Bariskt.toFixed(2);
  const Kolomkt = Kolomjk / Kolomdb;
  cellKolomkt.innerHTML = Kolomkt.toFixed(2);
  const Perlakuankt = Perlakuanjk / Perlakuandb;
  cellPerlakuankt.innerHTML = Perlakuankt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Barisfh = Bariskt / Gkt;
  cellBarisfh.innerHTML = Barisfh.toFixed(2);
  const Kolomfh = Kolomkt / Gkt;
  cellKolomfh.innerHTML = Kolomfh.toFixed(2);
  const Perlakuanfh = Perlakuankt / Gkt;
  cellPerlakuanfh.innerHTML = Perlakuanfh.toFixed(2);

  const Barisft5 = jStat.centralF.inv(0.95, Barisdb, Gdb);
  cellBarisft5.innerHTML = Barisft5.toFixed(2);
  const Barisft1 = jStat.centralF.inv(0.99, Barisdb, Gdb);
  cellBarisft1.innerHTML = Barisft1.toFixed(2);

  const Kolomft5 = jStat.centralF.inv(0.95, Kolomdb, Gdb);
  cellKolomft5.innerHTML = Kolomft5.toFixed(2);
  const Kolomft1 = jStat.centralF.inv(0.99, Kolomdb, Gdb);
  cellKolomft1.innerHTML = Kolomft1.toFixed(2);

  const Perlakuanft5 = jStat.centralF.inv(0.95, Perlakuandb, Gdb);
  cellPerlakuanft5.innerHTML = Perlakuanft5.toFixed(2);
  const Perlakuanft1 = jStat.centralF.inv(0.99, Perlakuandb, Gdb);
  cellPerlakuanft1.innerHTML = Perlakuanft1.toFixed(2);

  if (Barisfh > Barisft1) {
    cellBarissg.innerHTML = "**"
  } else if (Barisfh > Barisft5) {
    cellBarissg.innerHTML = "*"
  } else {
    cellBarissg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Kolomfh > Kolomft1) {
    cellKolomsg.innerHTML = "**"
  } else if (Kolomfh > Kolomft5) {
    cellKolomsg.innerHTML = "*"
  } else {
    cellKolomsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Perlakuanfh > Perlakuanft1) {
    cellPerlakuansg.innerHTML = "**"
  } else if (Perlakuanfh > Perlakuanft5) {
    cellPerlakuansg.innerHTML = "*"
  } else {
    cellPerlakuansg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("Baris") * getData.count("Kolom") * getData.count("Perlakuan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    thit = (table * Math.sqrt((2 * Gkt) / getData.count("Perlakuan")));
    processFLSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thit);
  }
  // THSD
  else if (selectedPosthoc === "bnj") {
    table = (jStat.tukey.inv(0.95, getData.count("Perlakuan"), Gdb));
    thit = (table * Math.sqrt(Gkt / getData.count("Perlakuan")));
    processTHSD(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), thit);
  }
  // DMRT
  else if (selectedPosthoc === "dmrt") {
    processDMRT(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Perlakuan"));
  }
  // SNK
  else if (selectedPosthoc === "snk") {
    processSNK(selectedPerlakuanText, 'Perlakuan', getData.info("Perlakuan", "Hasil"), getData.count("Perlakuan"), Gdb, Gkt, getData.count("Perlakuan"));
  }
  // SK
  else if (selectedPosthoc === "sk") {
    processSK('Perlakuan', selectedPerlakuanText, getData.info("Perlakuan", "Hasil"));
  }

}

// ----- RPT RAK -----
function countAnovaRPT_RAK() {
  const anovaTitle = document.querySelector("#anova h3");
  anovaTitle.innerHTML = `ANOVA: Split Plot Design RBD (SPD-RBD)`;
  anovaTitle.setAttribute("data-id", "Anova: Rancangan Petak Terbagi RAK (RPT-RAK)")

  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th rowspan='2' data-id='Sumber Keragaman'>Source of Variation</th>
        <th rowspan='2' data-id='Derajat Bebas'>Degrees of Freedom</th>
        <th rowspan='2' data-id='Jumlah Kuadrat'>Sum of Squares</th>
        <th rowspan='2' data-id='Kuadrat Tengah'>Mean Square</th>
        <th rowspan='2' data-id='F Hitung'>F Stat</th>
        <th colspan='2' data-id='F Tabel'>F Table</th>
        <th rowspan='2' data-id='Signifikansi'>Significance</th>
      </tr>
      <tr>
        <th>5%</th>
        <th>1%</th>
      </tr>
    </thead>  
    <tbody>
      <tr>
        <td data-id='Petak Utama' colspan="8">Main Plot</td>
      </tr>
      <tr>
        <td data-id='Kelompok'>Block</td>
        <td class="Udb"></td>
        <td class="Ujk"></td>
        <td class="Ukt"></td>
        <td class="Ufh"></td>
        <td class="Uft5"></td>
        <td class="Uft1"></td>
        <td class="Usg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorAText} (A)</td>
        <td class="Adb"></td>
        <td class="Ajk"></td>
        <td class="Akt"></td>
        <td class="Afh"></td>
        <td class="Aft5"></td>
        <td class="Aft1"></td>
        <td class="Asg"></td>
      </tr>
      <tr>
        <td>Residuals</td>
        <td class="AGdb"></td>
        <td class="AGjk"></td>
        <td class="AGkt"></td>
        <td class="AGfh" colspan="4"></td>
      </tr>
      <tr>
        <td data-id='Anak Petak' colspan="8">Sub Plot</td>
      </tr>
      <tr>
        <td>${selectedFaktorBText} (B)</td>
        <td class="Bdb"></td>
        <td class="Bjk"></td>
        <td class="Bkt"></td>
        <td class="Bfh"></td>
        <td class="Bft5"></td>
        <td class="Bft1"></td>
        <td class="Bsg"></td>
      </tr>
      <tr>
        <td>${selectedFaktorAText} × ${selectedFaktorBText} (A × B)</td>
        <td class="ABdb"></td>
        <td class="ABjk"></td>
        <td class="ABkt"></td>
        <td class="ABfh"></td>
        <td class="ABft5"></td>
        <td class="ABft1"></td>
        <td class="ABsg"></td>
      </tr>
      <tr>
        <td>Residuals</td>
        <td class="BGdb"></td>
        <td class="BGjk"></td>
        <td class="BGkt"></td>
        <td class="BGfh" colspan="4"></td>
      </tr>
      <tr>
        <td>Total</td>
        <td class="BTdb"></td>
        <td class="BTjk"></td>
        <td class="BTkt" colspan="5"></td>
      </tr>
    </tbody>
  `;
  const [
    cellkkA, cellkkB, cellfk, cellgt,
    cellUdb, cellUjk, cellUkt, cellUfh, cellUft5, cellUft1, cellUsg,
    cellAdb, cellAjk, cellAkt, cellAfh, cellAsg, cellAGdb, cellAGjk, cellAGkt, cellAft5, cellAft1,
    cellBdb, cellBjk, cellBkt, cellBfh, cellBsg, cellBGdb, cellBGjk, cellBGkt, cellBTdb, cellBTjk, cellBft5, cellBft1,
    cellABdb, cellABjk, cellABkt, cellABfh, cellABsg, cellABft5, cellABft1
  ] = [
    'kkA', 'kkB', 'fk', 'gt',
    'Udb', 'Ujk', 'Ukt', 'Ufh', 'Uft5', 'Uft1', 'Usg',
    'Adb', 'Ajk', 'Akt', 'Afh', 'Asg', 'AGdb', 'AGjk', 'AGkt', 'Aft5', 'Aft1',
    'Bdb', 'Bjk', 'Bkt', 'Bfh', 'Bsg', 'BGdb', 'BGjk', 'BGkt', 'BTdb', 'BTjk', 'Bft5', 'Bft1',
    'ABdb', 'ABjk', 'ABkt', 'ABfh', 'ABsg', 'ABft5', 'ABft1'
  ]
    .map(cls => document.querySelector(`.${cls}`));

  const fk = (getData.sum("Hasil") * getData.sum("Hasil")) / (getData.count("Ulangan") * (getData.count("FaktorA") * getData.count("FaktorB")));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sumSquared("Hasil").toFixed(2);

  const Udb = getData.count("Ulangan") - 1;
  cellUdb.innerHTML = Udb;
  const Adb = getData.count("FaktorA") - 1;
  cellAdb.innerHTML = Adb;
  const AGdb = (getData.count("FaktorA") - 1) * (getData.count("Ulangan") - 1);
  cellAGdb.innerHTML = AGdb;
  const Bdb = getData.count("FaktorB") - 1;
  cellBdb.innerHTML = Bdb;
  const BGdb = getData.count("FaktorA") * (getData.count("Ulangan") - 1) * (getData.count("FaktorB") - 1);
  cellBGdb.innerHTML = BGdb;
  const BTdb = getData.count("Ulangan") * getData.count("FaktorA") * getData.count("FaktorB") - 1;
  cellBTdb.innerHTML = BTdb;
  const ABdb = (getData.count("FaktorA") - 1) * (getData.count("FaktorB") - 1);
  cellABdb.innerHTML = ABdb;

  const Ujk = getData.sumOfGroupedSquares("Ulangan", "Hasil") / (getData.count("FaktorA") * getData.count("FaktorB")) - fk;
  cellUjk.innerHTML = Ujk.toFixed(2);
  const Ajk = getData.sumOfGroupedSquares("FaktorA", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorB")) - fk;
  cellAjk.innerHTML = Ajk.toFixed(2);
  const AGjk = getData.sumOfGroupedSquares("FaktorA", "Ulangan", "Hasil") / getData.count("FaktorB") - fk - Ujk - Ajk;
  cellAGjk.innerHTML = AGjk.toFixed(2);
  const Bjk = getData.sumOfGroupedSquares("FaktorB", "Hasil") / (getData.count("Ulangan") * getData.count("FaktorA")) - fk;
  cellBjk.innerHTML = Bjk.toFixed(2);
  const ABjk = (getData.sumOfGroupedSquares("FaktorA", "FaktorB", "Hasil") / getData.count("Ulangan")) - fk - Ajk - Bjk;
  cellABjk.innerHTML = ABjk.toFixed(2);
  const BTjk = getData.sumSquared("Hasil") - fk;
  cellBTjk.innerHTML = BTjk.toFixed(2);
  const BGjk = BTjk - Ujk - Ajk - AGjk - Bjk - ABjk;
  cellBGjk.innerHTML = BGjk.toFixed(2);

  const Ukt = Ujk / Udb;
  cellUkt.innerHTML = Ukt.toFixed(2);
  const Akt = Ajk / Adb;
  cellAkt.innerHTML = Akt.toFixed(2);
  const AGkt = AGjk / AGdb;
  cellAGkt.innerHTML = AGkt.toFixed(2);
  const Bkt = Bjk / Bdb;
  cellBkt.innerHTML = Bkt.toFixed(2);
  const BGkt = BGjk / BGdb;
  cellBGkt.innerHTML = BGkt.toFixed(2);
  const ABkt = ABjk / ABdb;
  cellABkt.innerHTML = ABkt.toFixed(2);

  const Ufh = Ukt / AGkt;
  cellUfh.innerHTML = Ufh.toFixed(2);
  const Afh = Akt / AGkt;
  cellAfh.innerHTML = Afh.toFixed(2);
  const Bfh = Bkt / BGkt;
  cellBfh.innerHTML = Bfh.toFixed(2);
  const ABfh = ABkt / BGkt;
  cellABfh.innerHTML = ABfh.toFixed(2);

  const Uft5 = jStat.centralF.inv(0.95, Udb, AGdb);
  cellUft5.innerHTML = Uft5.toFixed(2);
  const Uft1 = jStat.centralF.inv(0.99, Udb, AGdb);
  cellUft1.innerHTML = Uft1.toFixed(2);

  const Aft5 = jStat.centralF.inv(0.95, Adb, AGdb);
  cellAft5.innerHTML = Aft5.toFixed(2);
  const Aft1 = jStat.centralF.inv(0.99, Adb, AGdb);
  cellAft1.innerHTML = Aft1.toFixed(2);

  const Bft5 = jStat.centralF.inv(0.95, Bdb, BGdb);
  cellBft5.innerHTML = Bft5.toFixed(2);
  const Bft1 = jStat.centralF.inv(0.99, Bdb, BGdb);
  cellBft1.innerHTML = Bft1.toFixed(2);

  const ABft5 = jStat.centralF.inv(0.95, ABdb, BGdb);
  cellABft5.innerHTML = ABft5.toFixed(2);
  const ABft1 = jStat.centralF.inv(0.99, ABdb, BGdb);
  cellABft1.innerHTML = ABft1.toFixed(2);

  if (Ufh > Uft1) {
    cellUsg.innerHTML = "**"
  } else if (Ufh > Uft5) {
    cellUsg.innerHTML = "*"
  } else {
    cellUsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Afh > Aft1) {
    cellAsg.innerHTML = "**"
  } else if (Afh > Aft5) {
    cellAsg.innerHTML = "*"
  } else {
    cellAsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (Bfh > Bft1) {
    cellBsg.innerHTML = "**"
  } else if (Bfh > Bft5) {
    cellBsg.innerHTML = "*"
  } else {
    cellBsg.innerHTML = "<span data-id='tn'>ns</span>"
  }

  if (ABfh > ABft1) {
    cellABsg.innerHTML = "**";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else if (ABfh > ABft5) {
    cellABsg.innerHTML = "*";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else {
    cellABsg.innerHTML = "<span data-id='tn'>ns</span>";
    document.querySelector('#posthoc').classList.add('tanpa-interaksi')
  }

  const kkA = Math.sqrt(AGkt) / (getData.sum("Hasil") / (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan"))) * 100;
  cellkkA.innerHTML = kkA.toFixed(0) + "%";
  const kkB = Math.sqrt(BGkt) / (getData.sum("Hasil") / (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan"))) * 100;
  cellkkB.innerHTML = kkB.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // FLSD
  if (selectedPosthoc === "bnt") {
    // Nilai Tabel
    tableA = (jStat.studentt.inv(1 - 0.05 / 2, BGdb));
    tableB = (jStat.studentt.inv(1 - 0.05 / 2, AGdb));
    // Nilai Hitung
    thitA = (tableA * Math.sqrt((2 * AGkt) / (getData.count("Ulangan") * getData.count("FaktorB"))));
    thitB = (tableB * Math.sqrt((2 * BGkt) / (getData.count("Ulangan") * getData.count("FaktorA"))));
    thitAB = (tableB * Math.sqrt((2 * BGkt) / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processFLSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processFLSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processFLSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
    const uniqueFaktorA = new Set();
    const uniqueFaktorB = new Set();
    const rows = document.querySelectorAll('#tableContainer tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        uniqueFaktorA.add(cells[0].textContent.trim());
        uniqueFaktorB.add(cells[1].textContent.trim());
      }
    });
    uniqueFaktorA.forEach(faktorA => {
      const info = getData.info("FaktorA", "FaktorB", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorA));
      if (info.length > 0) {
        processFLSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
      }
    });
    uniqueFaktorB.forEach(faktorB => {
      const info = getData.info("FaktorB", "FaktorA", "Hasil")
        .split('\n')
        .filter(line => line.startsWith(faktorB));
      if (info.length > 0) {
        processFLSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
      }
    });
    // Tabel Interaksi 
    (function () {
      const table = document.querySelector('#tableContainer table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
      const headers = Array.from(table.querySelectorAll('th'));
      const colIndex = {};
      headers.forEach((th, i) => {
        if (th.dataset.setting) {
          colIndex[th.dataset.setting] = i;
        }
      });
      const dataMap = {};
      rows.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const faktorA = cells[colIndex['FaktorA']].textContent.trim();
        const faktorB = cells[colIndex['FaktorB']].textContent.trim();
        const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
        if (!dataMap[faktorB]) dataMap[faktorB] = {};
        if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
        dataMap[faktorB][faktorA].push(nilai);
      });
      const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
      const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
      const newTable = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')).textContent = '×';
      faktorAList.forEach(fa => {
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = fa;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      const tbody = document.createElement('tbody');
      faktorBList.forEach(fb => {
        const avgRow = document.createElement('tr');
        const fbCell = document.createElement('th');
        fbCell.rowSpan = 2;
        fbCell.textContent = fb;
        avgRow.appendChild(fbCell);
        faktorAList.forEach(fa => {
          const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
          const td1 = document.createElement('td');
          td1.textContent = avg.toFixed(2);
          const td2 = document.createElement('td');
          td2.classList.add('x-kecil');
          td2.dataset.pair = `${fb}${fa}`;
          td2.textContent = 'x';
          avgRow.appendChild(td1);
          avgRow.appendChild(td2);
        });
        tbody.appendChild(avgRow);
        const xRow = document.createElement('tr');
        faktorAList.forEach(fa => {
          const td = document.createElement('td');
          td.colSpan = 2;
          td.classList.add('x-besar');
          td.dataset.pair = `${fa}${fb}`;
          td.textContent = 'X';
          xRow.appendChild(td);
        });
        tbody.appendChild(xRow);
      });
      newTable.appendChild(tbody);
      const container = document.getElementById('interaction-table');
      container.innerHTML = '';
      container.appendChild(newTable);
      const perFaktorContainer = document.createElement('div');
      perFaktorContainer.classList.add('posthoc-collapsed-item');
      container.appendChild(perFaktorContainer);
      const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
      const notasiMap = {};
      posthocTables.forEach(tbl => {
        const trs = tbl.querySelectorAll('tbody tr');
        trs.forEach(tr => {
          const perlakuan = tr.cells[0].textContent.trim();
          const notasi = tr.cells[2].textContent.trim();
          notasiMap[perlakuan] = notasi;
        });
      });
      document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
        const pair = td.dataset.pair;
        if (notasiMap[pair]) {
          td.textContent = notasiMap[pair];
        }
      });
      const target = container.querySelector('.posthoc-collapsed-item');
      let nextSibling = container.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        target.appendChild(temp);
      }
    })();
  }
  // // THSD
  // else if (selectedPosthoc === "bnj") {
  //   // Nilai Tabel
  //   tableA = (jStat.tukey.inv(0.95, getData.count("FaktorA"), Gdb));
  //   tableB = (jStat.tukey.inv(0.95, getData.count("FaktorB"), Gdb));
  //   tableAB = (jStat.tukey.inv(0.95, getData.count("FaktorA") * getData.count("FaktorB"), Gdb));
  //   // Nilai Hitung
  //   thitA = (tableA * Math.sqrt(Gkt / (getData.count("FaktorB") * getData.count("Ulangan"))));
  //   thitB = (tableB * Math.sqrt(Gkt / (getData.count("FaktorA") * getData.count("Ulangan"))));
  //   thitAB = (tableAB * Math.sqrt(Gkt / getData.count("Ulangan")));
  //   // Faktor A, Faktor B, dan Kombinasi AB
  //   processTHSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
  //   processTHSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
  //   processTHSD('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
  //   // Interaksi AB
  //   document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
  //   const uniqueFaktorA = new Set();
  //   const uniqueFaktorB = new Set();
  //   const rows = document.querySelectorAll('#tableContainer tbody tr');
  //   rows.forEach(row => {
  //     const cells = row.querySelectorAll('td');
  //     if (cells.length >= 2) {
  //       uniqueFaktorA.add(cells[0].textContent.trim());
  //       uniqueFaktorB.add(cells[1].textContent.trim());
  //     }
  //   });
  //   uniqueFaktorA.forEach(faktorA => {
  //     const info = getData.info("FaktorA", "FaktorB", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorA));
  //     if (info.length > 0) {
  //       processTHSD(faktorA, `leading_${faktorA}`, info.join('\n'), thitA);
  //     }
  //   });
  //   uniqueFaktorB.forEach(faktorB => {
  //     const info = getData.info("FaktorB", "FaktorA", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorB));
  //     if (info.length > 0) {
  //       processTHSD(faktorB, `leading_${faktorB}`, info.join('\n'), thitB);
  //     }
  //   });
  //   // Tabel Interaksi 
  //   (function () {
  //     const table = document.querySelector('#tableContainer table');
  //     if (!table) return;
  //     const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
  //     const headers = Array.from(table.querySelectorAll('th'));
  //     const colIndex = {};
  //     headers.forEach((th, i) => {
  //       if (th.dataset.setting) {
  //         colIndex[th.dataset.setting] = i;
  //       }
  //     });
  //     const dataMap = {};
  //     rows.forEach(tr => {
  //       const cells = tr.querySelectorAll('td');
  //       if (!cells.length) return;
  //       const faktorA = cells[colIndex['FaktorA']].textContent.trim();
  //       const faktorB = cells[colIndex['FaktorB']].textContent.trim();
  //       const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
  //       if (!dataMap[faktorB]) dataMap[faktorB] = {};
  //       if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
  //       dataMap[faktorB][faktorA].push(nilai);
  //     });
  //     const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
  //     const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
  //     const newTable = document.createElement('table');
  //     const thead = document.createElement('thead');
  //     const headRow = document.createElement('tr');
  //     headRow.appendChild(document.createElement('th')).textContent = '×';
  //     faktorAList.forEach(fa => {
  //       const th = document.createElement('th');
  //       th.colSpan = 2;
  //       th.textContent = fa;
  //       headRow.appendChild(th);
  //     });
  //     thead.appendChild(headRow);
  //     newTable.appendChild(thead);
  //     const tbody = document.createElement('tbody');
  //     faktorBList.forEach(fb => {
  //       const avgRow = document.createElement('tr');
  //       const fbCell = document.createElement('th');
  //       fbCell.rowSpan = 2;
  //       fbCell.textContent = fb;
  //       avgRow.appendChild(fbCell);
  //       faktorAList.forEach(fa => {
  //         const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
  //         const td1 = document.createElement('td');
  //         td1.textContent = avg.toFixed(2);
  //         const td2 = document.createElement('td');
  //         td2.classList.add('x-kecil');
  //         td2.dataset.pair = `${fb}${fa}`;
  //         td2.textContent = 'x';
  //         avgRow.appendChild(td1);
  //         avgRow.appendChild(td2);
  //       });
  //       tbody.appendChild(avgRow);
  //       const xRow = document.createElement('tr');
  //       faktorAList.forEach(fa => {
  //         const td = document.createElement('td');
  //         td.colSpan = 2;
  //         td.classList.add('x-besar');
  //         td.dataset.pair = `${fa}${fb}`;
  //         td.textContent = 'X';
  //         xRow.appendChild(td);
  //       });
  //       tbody.appendChild(xRow);
  //     });
  //     newTable.appendChild(tbody);
  //     const container = document.getElementById('interaction-table');
  //     container.innerHTML = '';
  //     container.appendChild(newTable);
  //     const perFaktorContainer = document.createElement('div');
  //     perFaktorContainer.classList.add('posthoc-collapsed-item');
  //     container.appendChild(perFaktorContainer);
  //     const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
  //     const notasiMap = {};
  //     posthocTables.forEach(tbl => {
  //       const trs = tbl.querySelectorAll('tbody tr');
  //       trs.forEach(tr => {
  //         const perlakuan = tr.cells[0].textContent.trim();
  //         const notasi = tr.cells[2].textContent.trim();
  //         notasiMap[perlakuan] = notasi;
  //       });
  //     });
  //     document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     const target = container.querySelector('.posthoc-collapsed-item');
  //     let nextSibling = container.nextElementSibling;
  //     while (nextSibling) {
  //       const temp = nextSibling;
  //       nextSibling = nextSibling.nextElementSibling;
  //       target.appendChild(temp);
  //     }
  //   })();
  // }
  // // DMRT
  // else if (selectedPosthoc === "dmrt") {
  //   // Faktor A, Faktor B, dan Kombinasi AB
  //   processDMRT(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
  //   processDMRT(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //   processDMRT('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //   // Interaksi AB
  //   document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
  //   const uniqueFaktorA = new Set();
  //   const uniqueFaktorB = new Set();
  //   const rows = document.querySelectorAll('#tableContainer tbody tr');
  //   rows.forEach(row => {
  //     const cells = row.querySelectorAll('td');
  //     if (cells.length >= 2) {
  //       uniqueFaktorA.add(cells[0].textContent.trim());
  //       uniqueFaktorB.add(cells[1].textContent.trim());
  //     }
  //   });
  //   uniqueFaktorA.forEach(faktorA => {
  //     const info = getData.info("FaktorA", "FaktorB", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorA));
  //     if (info.length > 0) {
  //       processDMRT(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
  //     }
  //   });
  //   uniqueFaktorB.forEach(faktorB => {
  //     const info = getData.info("FaktorB", "FaktorA", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorB));
  //     if (info.length > 0) {
  //       processDMRT(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //     }
  //   });
  //   // Tabel Interaksi 
  //   (function () {
  //     const table = document.querySelector('#tableContainer table');
  //     if (!table) return;
  //     const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
  //     const headers = Array.from(table.querySelectorAll('th'));
  //     const colIndex = {};
  //     headers.forEach((th, i) => {
  //       if (th.dataset.setting) {
  //         colIndex[th.dataset.setting] = i;
  //       }
  //     });
  //     const dataMap = {};
  //     rows.forEach(tr => {
  //       const cells = tr.querySelectorAll('td');
  //       if (!cells.length) return;
  //       const faktorA = cells[colIndex['FaktorA']].textContent.trim();
  //       const faktorB = cells[colIndex['FaktorB']].textContent.trim();
  //       const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
  //       if (!dataMap[faktorB]) dataMap[faktorB] = {};
  //       if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
  //       dataMap[faktorB][faktorA].push(nilai);
  //     });
  //     const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
  //     const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
  //     const newTable = document.createElement('table');
  //     const thead = document.createElement('thead');
  //     const headRow = document.createElement('tr');
  //     headRow.appendChild(document.createElement('th')).textContent = '×';
  //     faktorAList.forEach(fa => {
  //       const th = document.createElement('th');
  //       th.colSpan = 2;
  //       th.textContent = fa;
  //       headRow.appendChild(th);
  //     });
  //     thead.appendChild(headRow);
  //     newTable.appendChild(thead);
  //     const tbody = document.createElement('tbody');
  //     faktorBList.forEach(fb => {
  //       const avgRow = document.createElement('tr');
  //       const fbCell = document.createElement('th');
  //       fbCell.rowSpan = 2;
  //       fbCell.textContent = fb;
  //       avgRow.appendChild(fbCell);
  //       faktorAList.forEach(fa => {
  //         const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
  //         const td1 = document.createElement('td');
  //         td1.textContent = avg.toFixed(2);
  //         const td2 = document.createElement('td');
  //         td2.classList.add('x-kecil');
  //         td2.dataset.pair = `${fb}${fa}`;
  //         td2.textContent = 'x';
  //         avgRow.appendChild(td1);
  //         avgRow.appendChild(td2);
  //       });
  //       tbody.appendChild(avgRow);
  //       const xRow = document.createElement('tr');
  //       faktorAList.forEach(fa => {
  //         const td = document.createElement('td');
  //         td.colSpan = 2;
  //         td.classList.add('x-besar');
  //         td.dataset.pair = `${fa}${fb}`;
  //         td.textContent = 'X';
  //         xRow.appendChild(td);
  //       });
  //       tbody.appendChild(xRow);
  //     });
  //     newTable.appendChild(tbody);
  //     const container = document.getElementById('interaction-table');
  //     container.innerHTML = '';
  //     container.appendChild(newTable);
  //     const perFaktorContainer = document.createElement('div');
  //     perFaktorContainer.classList.add('posthoc-collapsed-item');
  //     container.appendChild(perFaktorContainer);
  //     const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
  //     const notasiMap = {};
  //     posthocTables.forEach(tbl => {
  //       const trs = tbl.querySelectorAll('tbody tr');
  //       trs.forEach(tr => {
  //         const perlakuan = tr.cells[0].textContent.trim();
  //         const notasi = tr.cells[2].textContent.trim();
  //         notasiMap[perlakuan] = notasi;
  //       });
  //     });
  //     document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     const target = container.querySelector('.posthoc-collapsed-item');
  //     let nextSibling = container.nextElementSibling;
  //     while (nextSibling) {
  //       const temp = nextSibling;
  //       nextSibling = nextSibling.nextElementSibling;
  //       target.appendChild(temp);
  //     }
  //   })();
  // }
  // // SNK
  // else if (selectedPosthoc === "snk") {
  //   // Faktor A, Faktor B, dan Kombinasi AB
  //   processSNK(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
  //   processSNK(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //   processSNK('<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), getData.count("FaktorA") * getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //   // Interaksi AB
  //   document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
  //   const uniqueFaktorA = new Set();
  //   const uniqueFaktorB = new Set();
  //   const rows = document.querySelectorAll('#tableContainer tbody tr');
  //   rows.forEach(row => {
  //     const cells = row.querySelectorAll('td');
  //     if (cells.length >= 2) {
  //       uniqueFaktorA.add(cells[0].textContent.trim());
  //       uniqueFaktorB.add(cells[1].textContent.trim());
  //     }
  //   });
  //   uniqueFaktorA.forEach(faktorA => {
  //     const info = getData.info("FaktorA", "FaktorB", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorA));
  //     if (info.length > 0) {
  //       processSNK(faktorA, `leading_${faktorA}`, info.join('\n'), getData.count("FaktorA"), Gdb, Gkt, getData.count("Ulangan"));
  //     }
  //   });
  //   uniqueFaktorB.forEach(faktorB => {
  //     const info = getData.info("FaktorB", "FaktorA", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorB));
  //     if (info.length > 0) {
  //       processSNK(faktorB, `leading_${faktorB}`, info.join('\n'), getData.count("FaktorB"), Gdb, Gkt, getData.count("Ulangan"));
  //     }
  //   });
  //   // Tabel Interaksi 
  //   (function () {
  //     const table = document.querySelector('#tableContainer table');
  //     if (!table) return;
  //     const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
  //     const headers = Array.from(table.querySelectorAll('th'));
  //     const colIndex = {};
  //     headers.forEach((th, i) => {
  //       if (th.dataset.setting) {
  //         colIndex[th.dataset.setting] = i;
  //       }
  //     });
  //     const dataMap = {};
  //     rows.forEach(tr => {
  //       const cells = tr.querySelectorAll('td');
  //       if (!cells.length) return;
  //       const faktorA = cells[colIndex['FaktorA']].textContent.trim();
  //       const faktorB = cells[colIndex['FaktorB']].textContent.trim();
  //       const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
  //       if (!dataMap[faktorB]) dataMap[faktorB] = {};
  //       if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
  //       dataMap[faktorB][faktorA].push(nilai);
  //     });
  //     const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
  //     const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
  //     const newTable = document.createElement('table');
  //     const thead = document.createElement('thead');
  //     const headRow = document.createElement('tr');
  //     headRow.appendChild(document.createElement('th')).textContent = '×';
  //     faktorAList.forEach(fa => {
  //       const th = document.createElement('th');
  //       th.colSpan = 2;
  //       th.textContent = fa;
  //       headRow.appendChild(th);
  //     });
  //     thead.appendChild(headRow);
  //     newTable.appendChild(thead);
  //     const tbody = document.createElement('tbody');
  //     faktorBList.forEach(fb => {
  //       const avgRow = document.createElement('tr');
  //       const fbCell = document.createElement('th');
  //       fbCell.rowSpan = 2;
  //       fbCell.textContent = fb;
  //       avgRow.appendChild(fbCell);
  //       faktorAList.forEach(fa => {
  //         const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
  //         const td1 = document.createElement('td');
  //         td1.textContent = avg.toFixed(2);
  //         const td2 = document.createElement('td');
  //         td2.classList.add('x-kecil');
  //         td2.dataset.pair = `${fb}${fa}`;
  //         td2.textContent = 'x';
  //         avgRow.appendChild(td1);
  //         avgRow.appendChild(td2);
  //       });
  //       tbody.appendChild(avgRow);
  //       const xRow = document.createElement('tr');
  //       faktorAList.forEach(fa => {
  //         const td = document.createElement('td');
  //         td.colSpan = 2;
  //         td.classList.add('x-besar');
  //         td.dataset.pair = `${fa}${fb}`;
  //         td.textContent = 'X';
  //         xRow.appendChild(td);
  //       });
  //       tbody.appendChild(xRow);
  //     });
  //     newTable.appendChild(tbody);
  //     const container = document.getElementById('interaction-table');
  //     container.innerHTML = '';
  //     container.appendChild(newTable);
  //     const perFaktorContainer = document.createElement('div');
  //     perFaktorContainer.classList.add('posthoc-collapsed-item');
  //     container.appendChild(perFaktorContainer);
  //     const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
  //     const notasiMap = {};
  //     posthocTables.forEach(tbl => {
  //       const trs = tbl.querySelectorAll('tbody tr');
  //       trs.forEach(tr => {
  //         const perlakuan = tr.cells[0].textContent.trim();
  //         const notasi = tr.cells[2].textContent.trim();
  //         notasiMap[perlakuan] = notasi;
  //       });
  //     });
  //     document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     const target = container.querySelector('.posthoc-collapsed-item');
  //     let nextSibling = container.nextElementSibling;
  //     while (nextSibling) {
  //       const temp = nextSibling;
  //       nextSibling = nextSibling.nextElementSibling;
  //       target.appendChild(temp);
  //     }
  //   })();
  // }
  // // SK
  // else if (selectedPosthoc === "sk") {
  //   // Faktor A, Faktor B, dan Kombinasi AB
  //   processSK('factorA', selectedFaktorAText, getData.info("FaktorA", "Hasil"));
  //   processSK('factorB', selectedFaktorBText, getData.info("FaktorB", "Hasil"));
  //   processSK('factorAB', '<span data-id="Kombinasi">Combination</span>: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, getData.info("FaktorA", "FaktorB", "Hasil"));
  //   // Interaksi AB
  //   document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'><span data-id='Interaksi'>Interaction</span>: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
  //   const uniqueFaktorA = new Set();
  //   const uniqueFaktorB = new Set();
  //   const rows = document.querySelectorAll('#tableContainer tbody tr');
  //   rows.forEach(row => {
  //     const cells = row.querySelectorAll('td');
  //     if (cells.length >= 2) {
  //       uniqueFaktorA.add(cells[0].textContent.trim());
  //       uniqueFaktorB.add(cells[1].textContent.trim());
  //     }
  //   });
  //   uniqueFaktorA.forEach(faktorA => {
  //     const info = getData.info("FaktorA", "FaktorB", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorA));
  //     if (info.length > 0) {
  //       processSK(`leading_${faktorA}`, faktorA, info.join('\n'));
  //     }
  //   });
  //   uniqueFaktorB.forEach(faktorB => {
  //     const info = getData.info("FaktorB", "FaktorA", "Hasil")
  //       .split('\n')
  //       .filter(line => line.startsWith(faktorB));
  //     if (info.length > 0) {
  //       processSK(`leading_${faktorB}`, faktorB, info.join('\n'));
  //     }
  //   });
  //   // Tabel Interaksi 
  //   (function () {
  //     const table = document.querySelector('#tableContainer table');
  //     if (!table) return;
  //     const rows = Array.from(table.querySelectorAll('tbody tr')).slice(1);
  //     const headers = Array.from(table.querySelectorAll('th'));
  //     const colIndex = {};
  //     headers.forEach((th, i) => {
  //       if (th.dataset.setting) {
  //         colIndex[th.dataset.setting] = i;
  //       }
  //     });
  //     const dataMap = {};
  //     rows.forEach(tr => {
  //       const cells = tr.querySelectorAll('td');
  //       if (!cells.length) return;
  //       const faktorA = cells[colIndex['FaktorA']].textContent.trim();
  //       const faktorB = cells[colIndex['FaktorB']].textContent.trim();
  //       const nilai = parseFloat(cells[colIndex['Hasil']].textContent.trim());
  //       if (!dataMap[faktorB]) dataMap[faktorB] = {};
  //       if (!dataMap[faktorB][faktorA]) dataMap[faktorB][faktorA] = [];
  //       dataMap[faktorB][faktorA].push(nilai);
  //     });
  //     const faktorAList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorA']]?.textContent.trim()).filter(Boolean))];
  //     const faktorBList = [...new Set(rows.map(tr => tr.querySelectorAll('td')[colIndex['FaktorB']]?.textContent.trim()).filter(Boolean))];
  //     const newTable = document.createElement('table');
  //     const thead = document.createElement('thead');
  //     const headRow = document.createElement('tr');
  //     headRow.appendChild(document.createElement('th')).textContent = '×';
  //     faktorAList.forEach(fa => {
  //       const th = document.createElement('th');
  //       th.colSpan = 2;
  //       th.textContent = fa;
  //       headRow.appendChild(th);
  //     });
  //     thead.appendChild(headRow);
  //     newTable.appendChild(thead);
  //     const tbody = document.createElement('tbody');
  //     faktorBList.forEach(fb => {
  //       const avgRow = document.createElement('tr');
  //       const fbCell = document.createElement('th');
  //       fbCell.rowSpan = 2;
  //       fbCell.textContent = fb;
  //       avgRow.appendChild(fbCell);
  //       faktorAList.forEach(fa => {
  //         const avg = dataMap[fb]?.[fa] ? (dataMap[fb][fa].reduce((a, b) => a + b, 0) / dataMap[fb][fa].length) : 0;
  //         const td1 = document.createElement('td');
  //         td1.textContent = avg.toFixed(2);
  //         const td2 = document.createElement('td');
  //         td2.classList.add('x-kecil');
  //         td2.dataset.pair = `${fb}${fa}`;
  //         td2.textContent = 'x';
  //         avgRow.appendChild(td1);
  //         avgRow.appendChild(td2);
  //       });
  //       tbody.appendChild(avgRow);
  //       const xRow = document.createElement('tr');
  //       faktorAList.forEach(fa => {
  //         const td = document.createElement('td');
  //         td.colSpan = 2;
  //         td.classList.add('x-besar');
  //         td.dataset.pair = `${fa}${fb}`;
  //         td.textContent = 'X';
  //         xRow.appendChild(td);
  //       });
  //       tbody.appendChild(xRow);
  //     });
  //     newTable.appendChild(tbody);
  //     const container = document.getElementById('interaction-table');
  //     container.innerHTML = '';
  //     container.appendChild(newTable);
  //     const perFaktorContainer = document.createElement('div');
  //     perFaktorContainer.classList.add('posthoc-collapsed-item');
  //     container.appendChild(perFaktorContainer);
  //     const posthocTables = document.querySelectorAll('#posthoc table[id^="leading_"][id$="-LETTER"]');
  //     const notasiMap = {};
  //     posthocTables.forEach(tbl => {
  //       const trs = tbl.querySelectorAll('tbody tr');
  //       trs.forEach(tr => {
  //         const perlakuan = tr.cells[0].textContent.trim();
  //         const notasi = tr.cells[2].textContent.trim();
  //         notasiMap[perlakuan] = notasi;
  //       });
  //     });
  //     document.querySelectorAll('#interaction-table .x-kecil').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     document.querySelectorAll('#interaction-table .x-besar').forEach(td => {
  //       const pair = td.dataset.pair;
  //       if (notasiMap[pair]) {
  //         td.textContent = notasiMap[pair];
  //       }
  //     });
  //     const target = container.querySelector('.posthoc-collapsed-item');
  //     let nextSibling = container.nextElementSibling;
  //     while (nextSibling) {
  //       const temp = nextSibling;
  //       nextSibling = nextSibling.nextElementSibling;
  //       target.appendChild(temp);
  //     }
  //   })();
  // }

}

///////////////////////////////////////////////////////////////////////////////////////////

// ----- Posthoc : BNT / Fisher's LSD -----
function processFLSD(title, factorKey, info, thit) {
  // Title
  document.getElementById('posthoc-title').innerHTML = "<span data-id='Uji Lanjut: Beda Nyata Terkecil (BNT)'>Post Hoc: Fisher's LSD</span>";
  // Container Dummy
  const container = document.querySelector('#posthoc');
  container.innerHTML += `
    <h4 class='posthoc-collapser'>${title}</h4>
    <div class='posthoc-collapsed'>
      <table id="${factorKey}-LETTER">
        <thead>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class='posthoc-collapsed-item'>
        <table id="${factorKey}-MATRIX">
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Mengambil data mentah
  const input = info.trim();
  const lines = input.split('\n');
  let dataMapFLSD = {};
  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapFLSD[perlakuan] = nilaiFloat;
  });
  const sortedEntries = Object.entries(dataMapFLSD).sort((a, b) => a[1] - b[1]);
  // Matrix
  const matrixTableBody = document.querySelector(`#${factorKey}-MATRIX tbody`);
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `<th>${thit.toFixed(2)}</th>` + sortedEntries.map(entry => `<th>${entry[0]}</th>`).join('');
  matrixTableBody.innerHTML = '';
  matrixTableBody.appendChild(headerRow);
  sortedEntries.forEach(([perlakuanA, nilaiA]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${perlakuanA}</th>`;
    sortedEntries.forEach(([perlakuanB, nilaiB]) => {
      const difference = (nilaiA - nilaiB).toFixed(2);
      if (difference <= thit && difference >= 0) {
        row.innerHTML += `<td class="green">${difference}</td>`;
      } else if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else {
        row.innerHTML += `<td>${difference}</td>`;
      }
    });
    matrixTableBody.appendChild(row);
  });
  // Mengambil nilai rata-rata dari info
  const infoString = info;
  const infoData = {};
  infoString.trim().split('\n').forEach(line => {
    const [key, value] = line.trim().split(' ');
    infoData[key] = parseFloat(value);
  });
  // Membuat tabel letter
  function generateLetterTable(matrixTableSelector, resultSelector) {
    const matrixTable = document.querySelector(matrixTableSelector);
    const resultDiv = document.querySelector(resultSelector);
    const firstGreenCols = new Set();
    const treatments = [];
    const treatmentNotations = {};
    const rows = matrixTable.querySelectorAll('tbody tr');
    for (let i = 1; i < rows.length; i++) {
      const th = rows[i].querySelector('th');
      const treatment = th.textContent;
      treatments.push(treatment);
      const cells = rows[i].querySelectorAll('td');
      const greens = [];
      for (let j = 0; j < cells.length; j++) {
        if (cells[j].classList.contains('green')) {
          greens.push(j);
          if (greens.length === 1) firstGreenCols.add(j);
        }
      }
      treatmentNotations[treatment] = greens;
    }
    const sortedCols = Array.from(firstGreenCols).sort((a, b) => a - b);
    const colLetters = {};
    sortedCols.forEach((col, i) => colLetters[col] = String.fromCharCode(97 + i));
    let html = `
      <table id="letterTable">
        <thead>
          <tr>
            <th><span>${title}</span></th>
            <th><span data-id='Nilai'>Value</span></th>
            <th><span data-id='Notasi'>Letter</span></th>
          </tr>
        </thead>
        <tbody>`;
    treatments.forEach(treatment => {
      const greens = treatmentNotations[treatment];
      const letters = sortedCols.filter(col => greens.includes(col))
        .map(col => colLetters[col])
        .join('');
      html += `
        <tr>
          <td>${treatment}</td>
          <td>${infoData[treatment]}</td>
          <td>${letters}</td>
        </tr>`;
    });
    resultDiv.innerHTML = html + `
        </tbody>
      </table>`;
  }
  generateLetterTable(`#${factorKey}-MATRIX`, `#${factorKey}-LETTER`);
}

// ----- Posthoc : BNJ / Tukey's HSD -----
function processTHSD(title, factorKey, info, thit) {
  // Title
  document.getElementById('posthoc-title').innerHTML = "<span data-id='Uji Lanjut: Beda Nyata Jujur (BNJ)'>Post Hoc: Tukey's LSD</span>";
  // Container Dummy
  const container = document.querySelector('#posthoc');
  container.innerHTML += `
    <h4 class='posthoc-collapser'>${title}</h4>
    <div class='posthoc-collapsed'>
      <table id="${factorKey}-LETTER">
        <thead>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class='posthoc-collapsed-item'>
        <table id="${factorKey}-MATRIX">
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Mengambil data mentah
  const input = info.trim();
  const lines = input.split('\n');
  let dataMapTHSD = {};
  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapTHSD[perlakuan] = nilaiFloat;
  });
  const sortedEntries = Object.entries(dataMapTHSD).sort((a, b) => a[1] - b[1]);
  // Matrix
  const matrixTableBody = document.querySelector(`#${factorKey}-MATRIX tbody`);
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `<th>${thit.toFixed(2)}</th>` + sortedEntries.map(entry => `<th>${entry[0]}</th>`).join('');
  matrixTableBody.innerHTML = '';
  matrixTableBody.appendChild(headerRow);
  sortedEntries.forEach(([perlakuanA, nilaiA]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${perlakuanA}</th>`;
    sortedEntries.forEach(([perlakuanB, nilaiB]) => {
      const difference = (nilaiA - nilaiB).toFixed(2);
      if (difference <= thit && difference >= 0) {
        row.innerHTML += `<td class="green">${difference}</td>`;
      } else if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else {
        row.innerHTML += `<td>${difference}</td>`;
      }
    });
    matrixTableBody.appendChild(row);
  });
  // Mengambil nilai rata-rata dari info
  const infoString = info;
  const infoData = {};
  infoString.trim().split('\n').forEach(line => {
    const [key, value] = line.trim().split(' ');
    infoData[key] = parseFloat(value);
  });
  // Membuat tabel letter
  function generateLetterTable(matrixTableSelector, resultSelector) {
    const matrixTable = document.querySelector(matrixTableSelector);
    const resultDiv = document.querySelector(resultSelector);
    const firstGreenCols = new Set();
    const treatments = [];
    const treatmentNotations = {};
    const rows = matrixTable.querySelectorAll('tbody tr');
    for (let i = 1; i < rows.length; i++) {
      const th = rows[i].querySelector('th');
      const treatment = th.textContent;
      treatments.push(treatment);
      const cells = rows[i].querySelectorAll('td');
      const greens = [];
      for (let j = 0; j < cells.length; j++) {
        if (cells[j].classList.contains('green')) {
          greens.push(j);
          if (greens.length === 1) firstGreenCols.add(j);
        }
      }
      treatmentNotations[treatment] = greens;
    }
    const sortedCols = Array.from(firstGreenCols).sort((a, b) => a - b);
    const colLetters = {};
    sortedCols.forEach((col, i) => colLetters[col] = String.fromCharCode(97 + i));
    let html = `
      <table id="letterTable">
        <thead>
          <tr>
            <th><span>${title}</span></th>
            <th><span data-id='Nilai'>Value</span></th>
            <th><span data-id='Notasi'>Letter</span></th>
        </tr>
        </thead>
        <tbody>`;
    treatments.forEach(treatment => {
      const greens = treatmentNotations[treatment];
      const letters = sortedCols.filter(col => greens.includes(col))
        .map(col => colLetters[col])
        .join('');
      html += `
        <tr>
          <td>${treatment}</td>
          <td>${infoData[treatment]}</td>
          <td>${letters}</td>
        </tr>`;
    });
    resultDiv.innerHTML = html + `
        </tbody>
      </table>`;
  }
  generateLetterTable(`#${factorKey}-MATRIX`, `#${factorKey}-LETTER`);
}

// ----- Posthoc : DMRT / Duncan's Multiple Range Test -----
function processDMRT(title, factorKey, info, count, dbg, gkt, r) {
  // Title
  document.getElementById('posthoc-title').innerHTML = "<span data-id='Uji Lanjut: Uji Jarak Berganda Duncan'>Post Hoc: Duncan's Multiple Range Test (DMRT)</span>";
  // Container Dummy
  const container = document.querySelector('#posthoc');
  container.innerHTML += `
    <h4 class='posthoc-collapser'>${title}</h4>
    <div class='posthoc-collapsed'>
      <table id="${factorKey}-LETTER">
        <thead>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class='posthoc-collapsed-item'>
        <table id="${factorKey}-CRITICAL" data-count="${count}" class="${factorKey} check-dmrt">
          <tbody>
            <tr class="table">
              <th>DMRT Table</th>
            </tr>
            <tr class="critical">
              <th>Critical Range</th>
            </tr>
          </tbody>
        </table>
        <br>
        <table id="${factorKey}-MATRIX" class="check-dmrt">
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Menghitung Critical Range
  const DMRTTable = document.querySelector(`#${factorKey}-CRITICAL .table`);
  const criticalTable = document.querySelector(`#${factorKey}-CRITICAL .critical`);
  for (let i = 2; i <= count; i++) {
    // elementDMRTP.innerHTML += `<td>${i}</td>`;
    DMRTTable.innerHTML += `<td>${jrStat.studentq.inv(0.05, i, dbg).toFixed(2)}</td>`;
    criticalTable.innerHTML += `<td data-p="${i}">${(Math.sqrt(gkt / r) * jrStat.studentq.inv(0.05, i, dbg)).toFixed(2)}</td>`;
  }
  // Mengambil data mentah
  const input = info.trim();
  const lines = input.split('\n');
  let dataMapTHSD = {};
  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapTHSD[perlakuan] = nilaiFloat;
  });
  const sortedEntries = Object.entries(dataMapTHSD).sort((a, b) => a[1] - b[1]);
  // Matrix
  const matrixTableBody = document.querySelector(`#${factorKey}-MATRIX tbody`);
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `<th></th>` + sortedEntries.map(entry => `<th>${entry[0]}</th>`).join('');
  matrixTableBody.innerHTML = '';
  matrixTableBody.appendChild(headerRow);
  sortedEntries.forEach(([perlakuanA, nilaiA]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${perlakuanA}</th>`;
    sortedEntries.forEach(([perlakuanB, nilaiB]) => {
      const difference = (nilaiA - nilaiB).toFixed(2);
      if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else if (difference === "0.00") {
        row.innerHTML += `<td class="green">${difference}</td>`;
      } else {
        row.innerHTML += `<td data-matrix="${difference}">${difference}</td>`;
      } 
    });
    matrixTableBody.appendChild(row);
  });
  // Memberi data-p dan data-value
  const rowtr = document.querySelectorAll("[id*='-MATRIX'] tbody tr");
  rowtr.forEach((row) => {
    const cells = row.querySelectorAll("td");
    let zeroIndex = -1;
    cells.forEach((cell, idx) => {
      if (cell.textContent.trim() === "0.00") {
        zeroIndex = idx;
      }
    });
    if (zeroIndex === -1) return;
    let p = 2;
    for (let i = zeroIndex - 1; i >= 0; i--) {
      const cell = cells[i];
      cell.setAttribute("data-p", p);
      cell.setAttribute("data-value", Math.sqrt(gkt / r) * jrStat.studentq.inv(0.05, p, dbg));
      if (Number(cell.getAttribute("data-matrix")) <= Number(cell.getAttribute("data-value"))) {
        cell.classList.add("green");
      }
      p++;
    }
  });
  // Mengambil nilai rata-rata dari info
  const infoString = info;
  const infoData = {};
  infoString.trim().split('\n').forEach(line => {
    const [key, value] = line.trim().split(' ');
    infoData[key] = parseFloat(value);
  });
  // Membuat tabel letter
  function generateLetterTable(matrixTableSelector, resultSelector) {
    const matrixTable = document.querySelector(matrixTableSelector);
    const resultDiv = document.querySelector(resultSelector);
    const firstGreenCols = new Set();
    const treatments = [];
    const treatmentNotations = {};
    const rows = matrixTable.querySelectorAll('tbody tr');
    for (let i = 1; i < rows.length; i++) {
      const th = rows[i].querySelector('th');
      const treatment = th.textContent;
      treatments.push(treatment);
      const cells = rows[i].querySelectorAll('td');
      const greens = [];
      for (let j = 0; j < cells.length; j++) {
        if (cells[j].classList.contains('green')) {
          greens.push(j);
          if (greens.length === 1) firstGreenCols.add(j);
        }
      }
      treatmentNotations[treatment] = greens;
    }
    const sortedCols = Array.from(firstGreenCols).sort((a, b) => a - b);
    const colLetters = {};
    sortedCols.forEach((col, i) => colLetters[col] = String.fromCharCode(97 + i));
    let html = `
      <table id="letterTable">
        <thead>
          <tr>
            <th><span>${title}</span></th>
            <th><span data-id='Nilai'>Value</span></th>
            <th><span data-id='Notasi'>Letter</span></th>
        </tr>
        </thead>
        <tbody>`;
    treatments.forEach(treatment => {
      const greens = treatmentNotations[treatment];
      const letters = sortedCols.filter(col => greens.includes(col))
        .map(col => colLetters[col])
        .join('');
      html += `
        <tr>
          <td>${treatment}</td>
          <td>${infoData[treatment]}</td>
          <td>${letters}</td>
        </tr>`;
    });
    resultDiv.innerHTML = html + `
        </tbody>
      </table>`;
  }
  generateLetterTable(`#${factorKey}-MATRIX`, `#${factorKey}-LETTER`);
}

// ----- Posthoc : Student-Newman-Keuls -----
function processSNK(title, factorKey, info, count, dbg, gkt, r) {
  // Title
  document.getElementById('posthoc-title').innerHTML = "<span data-id='Uji Lanjut: Student-Newman-Keuls (SNK)'>Post Hoc: Student-Newman-Keuls Test (SNK)</span>";
  // Container Dummy
  const container = document.querySelector('#posthoc');
  container.innerHTML += `
    <h4 class='posthoc-collapser'>${title}</h4>
    <div class='posthoc-collapsed'>
      <table id="${factorKey}-LETTER">
        <thead>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class='posthoc-collapsed-item'>
        <table id="${factorKey}-CRITICAL" data-count="${count}" class="${factorKey} check-dmrt">
          <tbody>
            <tr class="table">
              <th>DMRT Table</th>
            </tr>
            <tr class="critical">
              <th>Critical Range</th>
            </tr>
          </tbody>
        </table>
        <br>
        <table id="${factorKey}-MATRIX" class="check-dmrt">
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  `;
  // Menghitung Critical Range
  const DMRTTable = document.querySelector(`#${factorKey}-CRITICAL .table`);
  const criticalTable = document.querySelector(`#${factorKey}-CRITICAL .critical`);
  for (let i = 2; i <= count; i++) {
    // elementDMRTP.innerHTML += `<td>${i}</td>`;
    DMRTTable.innerHTML += `<td>${jStat.tukey.inv(0.95, i, dbg).toFixed(2)}</td>`;
    criticalTable.innerHTML += `<td data-p="${i}">${(Math.sqrt(gkt / r) * jStat.tukey.inv(0.95, i, dbg)).toFixed(2)}</td>`;
  }
  // Mengambil data mentah
  const input = info.trim();
  const lines = input.split('\n');
  let dataMapTHSD = {};
  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapTHSD[perlakuan] = nilaiFloat;
  });
  const sortedEntries = Object.entries(dataMapTHSD).sort((a, b) => a[1] - b[1]);
  // Matrix
  const matrixTableBody = document.querySelector(`#${factorKey}-MATRIX tbody`);
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `<th></th>` + sortedEntries.map(entry => `<th>${entry[0]}</th>`).join('');
  matrixTableBody.innerHTML = '';
  matrixTableBody.appendChild(headerRow);
  sortedEntries.forEach(([perlakuanA, nilaiA]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${perlakuanA}</th>`;
    sortedEntries.forEach(([perlakuanB, nilaiB]) => {
      const difference = (nilaiA - nilaiB).toFixed(2);
      if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else if (difference === "0.00") {
        row.innerHTML += `<td class="green">${difference}</td>`;
      } else {
        row.innerHTML += `<td data-matrix="${difference}">${difference}</td>`;
      } 
    });
    matrixTableBody.appendChild(row);
  });
  // Memberi data-p dan data-value
  const rowtr = document.querySelectorAll("[id*='-MATRIX'] tbody tr");
  rowtr.forEach((row) => {
    const cells = row.querySelectorAll("td");
    let zeroIndex = -1;
    cells.forEach((cell, idx) => {
      if (cell.textContent.trim() === "0.00") {
        zeroIndex = idx;
      }
    });
    if (zeroIndex === -1) return;
    let p = 2;
    for (let i = zeroIndex - 1; i >= 0; i--) {
      const cell = cells[i];
      cell.setAttribute("data-p", p);
      cell.setAttribute("data-value", Math.sqrt(gkt / r) * jStat.tukey.inv(0.95, p, dbg));
      if (Number(cell.getAttribute("data-matrix")) <= Number(cell.getAttribute("data-value"))) {
        cell.classList.add("green");
      }
      p++;
    }
  });
  // Mengambil nilai rata-rata dari info
  const infoString = info;
  const infoData = {};
  infoString.trim().split('\n').forEach(line => {
    const [key, value] = line.trim().split(' ');
    infoData[key] = parseFloat(value);
  });
  // Membuat tabel letter
  function generateLetterTable(matrixTableSelector, resultSelector) {
    const matrixTable = document.querySelector(matrixTableSelector);
    const resultDiv = document.querySelector(resultSelector);
    const firstGreenCols = new Set();
    const treatments = [];
    const treatmentNotations = {};
    const rows = matrixTable.querySelectorAll('tbody tr');
    for (let i = 1; i < rows.length; i++) {
      const th = rows[i].querySelector('th');
      const treatment = th.textContent;
      treatments.push(treatment);
      const cells = rows[i].querySelectorAll('td');
      const greens = [];
      for (let j = 0; j < cells.length; j++) {
        if (cells[j].classList.contains('green')) {
          greens.push(j);
          if (greens.length === 1) firstGreenCols.add(j);
        }
      }
      treatmentNotations[treatment] = greens;
    }
    const sortedCols = Array.from(firstGreenCols).sort((a, b) => a - b);
    const colLetters = {};
    sortedCols.forEach((col, i) => colLetters[col] = String.fromCharCode(97 + i));
    let html = `
      <table id="letterTable">
        <thead>
          <tr>
            <th><span>${title}</span></th>
            <th><span data-id='Nilai'>Value</span></th>
            <th><span data-id='Notasi'>Letter</span></th>
        </tr>
        </thead>
        <tbody>`;
    treatments.forEach(treatment => {
      const greens = treatmentNotations[treatment];
      const letters = sortedCols.filter(col => greens.includes(col))
        .map(col => colLetters[col])
        .join('');
      html += `
        <tr>
          <td>${treatment}</td>
          <td>${infoData[treatment]}</td>
          <td>${letters}</td>
        </tr>`;
    });
    resultDiv.innerHTML = html + `
        </tbody>
      </table>`;
  }
  generateLetterTable(`#${factorKey}-MATRIX`, `#${factorKey}-LETTER`);
}

// ----- Posthoc : Scott Knott -----
function processSK(factorKey, title, info){
  const chi2table={
    "0.05":[null,3.84,5.99,7.81,9.49,11.07,12.59,14.07,15.51,16.92,18.31],
    "0.01":[null,6.63,9.21,11.34,13.28,15.09,16.81,18.48,20.09,21.67,23.21]
  };
  function getNotation(index){
    let label='';
    index++;
    while(index>0){
      let rem=(index-1)%26;
      label=String.fromCharCode(97+rem)+label;
      index=Math.floor((index-1)/26);
    }
    return label;
  }
  function parseInput(raw){
    const lines=raw.trim().split('\n');
    const data=[];
    for(let line of lines){
      let [nama,nilai]=line.trim().split(/\s+/);
      if(nama&&nilai&&!isNaN(parseFloat(nilai))){
        data.push({nama,nilai:parseFloat(nilai)});
      }
    }
    return data;
  }
  function mean(arr){
    if(arr.length===0)return 0;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  }
  function scottKnott(groups,alpha){
    let results=[];
    for(let group of groups){
      if(group.length<2){
        results.push({homogen:true,group,lambda:null,chi2:null});
        continue;
      }
      group=group.slice().sort((a,b)=>a.nilai-b.nilai);
      let n=group.length;
      let totalMean=mean(group.map(x=>x.nilai));
      let bestSplit=null;
      let maxLambda=-Infinity;
      for(let i=1;i<n;i++){
        let left=group.slice(0,i);
        let right=group.slice(i);
        let n1=left.length,n2=right.length;
        let mean1=mean(left.map(x=>x.nilai));
        let mean2=mean(right.map(x=>x.nilai));
        let lambda=n1*Math.pow(mean1-totalMean,2)+n2*Math.pow(mean2-totalMean,2);
        if(lambda>maxLambda){
          maxLambda=lambda;
          bestSplit={left,right,lambda};
        }
      }
      let db=1;
      let chi2=chi2table[alpha][db];
      if(maxLambda<=chi2){
        results.push({homogen:true,group,lambda:maxLambda,chi2});
      }else{
        let leftResults=scottKnott([bestSplit.left],alpha);
        let rightResults=scottKnott([bestSplit.right],alpha);
        results=results.concat(leftResults,rightResults);
      }
    }
    return results;
  }
  function renderResult(homogeneityGroups){
    let html='';
    let groupNum=1;
    for(let group of homogeneityGroups){
      html+=`<tr><th colspan="2">Gugus ${groupNum}</th></tr>`;
      for(let d of group.group){
        html+=`<tr><td>${d.nama}</td><td>${d.nilai}</td></tr>`;
      }
      let B0s=group.group.map(x=>x.nilai);
      html+=`
      <tr>
        <th class="grayth">B<sub>0</sub></th>
        <th class="grayth">${mean(B0s).toFixed(4)}</th>
      </tr>
      ${group.lambda!==null?`
      <tr>
        <th class="grayth">λ</th>
        <th class="grayth">${group.lambda.toFixed(4)}</th>
      </tr>
      <tr>
        <th class="grayth">χ<sup>2</sup>(α, db=1)</th>
        <th class="grayth">${group.chi2.toFixed(4)}</th>
      </tr>
      `:''} 
      <tr>
        <td colspan="2"></td>
      </tr>
      `;
      groupNum++;
    }
    return html;
  }
  function renderHasil(data,homogeneityGroups){
    let notasiMap={};
    let notasiIndex=0;
    for(let group of homogeneityGroups){
      for(let d of group.group){
        notasiMap[d.nama]=getNotation(notasiIndex);
      }
      notasiIndex++;
    }
    let html='<tbody>';
    for(let d of data){
      html+=`<tr><td>${d.nama}</td><td>${d.nilai}</td><td>${notasiMap[d.nama]}</td></tr>`;
    }
    html+='</tbody>';
    return html;
  }
  // Title
  document.getElementById('posthoc-title').innerHTML="<span data-id='Uji Lanjut: Scott-Knott (SK)'>Post Hoc: Scott-Knott Test (SK)</span>";
  // Container
  const container=document.querySelector('#posthoc');
  container.innerHTML+=`
    <h4 class='posthoc-collapser'>${title}</h4>
    <div class='posthoc-collapsed'>
      <table id="${factorKey}-LETTER">
        <thead>
          <th><span>${title}</span></th>
          <th><span data-id='Nilai'>Value</span></th>
          <th><span data-id='Notasi'>Letter</span></th>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class='posthoc-collapsed-item'>
        <table id="${factorKey}-MATRIX">
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  `;
  const alpha = "0.05";
  const data = parseInput(info);
  const result = scottKnott([data],alpha);
  document.querySelector(`#${factorKey}-MATRIX tbody`).innerHTML = renderResult(result);
  const tbody = document.querySelector(`#${factorKey}-MATRIX tbody`);
  if(tbody){
    tbody.innerHTML = tbody.innerHTML.replace('undefined','');
  }
  document.querySelector(`#${factorKey}-LETTER tbody`).innerHTML = renderHasil(data,result);
}

// Responsive Table
const wrapTables = () => {
  document.querySelectorAll('table:not(.responsive-table table)').forEach(t => {
    const w = document.createElement('div');
    w.classList.add('responsive-table');
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });
};
new MutationObserver(wrapTables).observe(document.body, { childList: true, subtree: true });
wrapTables();

// Help popup button
document.querySelectorAll('[data-popup]').forEach(el => {
    el.innerHTML += `<div class='popup-button' onclick='popupShow("${el.dataset.popup}")'><img src='../icon/help.png'></div>`;
});