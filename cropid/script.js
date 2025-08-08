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
  document.getElementById('fileName').style.margin = ".5rem 0 0";
  document.getElementById('fileName').style.padding = ".5rem 1rem";
};

const fileInput = document.getElementById('fileInput');
const tableContainer = document.getElementById('tableContainer');
const sheetSelectorContainer = document.getElementById('sheetSelectorContainer');
const sheetSelect = document.getElementById('sheetSelect');
const settingsContainer = document.getElementById('settingsContainer');
const perlakuanBtn = document.getElementById('perlakuanBtn');
const faktorABtn = document.getElementById('faktoraBtn');
const faktorBBtn = document.getElementById('faktorbBtn');
const ulanganBtn = document.getElementById('ulanganBtn');
const hasilBtn = document.getElementById('hasilBtn');
const selectedFaktorAHeaderDisplay = document.getElementById('selectedFaktorAHeader');
const selectedFaktorBHeaderDisplay = document.getElementById('selectedFaktorBHeader');
const selectedPerlakuanHeaderDisplay = document.getElementById('selectedPerlakuanHeader');
let selectedFaktorAText;
let selectedFaktorBText;
let selectedPerlakuanText;
const selectedUlanganHeaderDisplay = document.getElementById('selectedUlanganHeader');
const selectedHasilHeaderDisplay = document.getElementById('selectedHasilHeader');

let currentWorkbook = null;
let currentTableData = [];
let selectedSettingType = null;
let selectedHeaders = { FaktorA: null, FaktorB: null, Perlakuan: null, Ulangan: null, Hasil: null };

perlakuanBtn.addEventListener('click', () => activateSetting('Perlakuan'));
faktorABtn.addEventListener('click', () => activateSetting('FaktorA'));
faktorBBtn.addEventListener('click', () => activateSetting('FaktorB'));
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

sheetSelect.addEventListener('change', displaySelectedSheet);

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

let selectedDesign = document.getElementById('jenis-anova').value;
document.getElementById('jenis-anova').addEventListener('change', function (event) {
  selectedDesign = event.target.value;
  if (selectedDesign === "ral" || selectedDesign === "rak") {
    document.getElementById('buttonContainer').classList.remove('factorial');
  } else if (selectedDesign === "rakf") {
    document.getElementById('buttonContainer').classList.add('factorial');
  }
});

let selectedPosthoc = document.getElementById('jenis-posthoc').value;
document.getElementById('jenis-posthoc').addEventListener('change', function (event) {
  selectedPosthoc = event.target.value;
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
  };

  if (headerMap[selectedSettingType]) {
    headerMap[selectedSettingType].textContent = headerText;
  }

  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  selectedSettingType = null;

  // Menampilkan tombol analisis (.run) dan scroll ke tombolnya
  if (selectedDesign === "ral" || selectedDesign === "rak") {
    // Scroll ketika perlakuan, ulangan, dan hasil telah dipilih (1 faktor)
    if (selectedHeaders.Perlakuan && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  } else if (selectedDesign === "rakf") {
    // Scroll ketika faktor A, faktor B, ulangan, dan hasil telah dipilih (2 faktor)
    if (selectedHeaders.FaktorA && selectedHeaders.FaktorB && selectedHeaders.Ulangan && selectedHeaders.Hasil) {
      document.querySelector('.run').classList.remove('none');
      smoothScroll('.run', top = 75);
    }
  }

  document.querySelector('.run').addEventListener('click', () => {
    selectedFaktorAText = selectedFaktorAHeaderDisplay.textContent;
    selectedFaktorBText = selectedFaktorBHeaderDisplay.textContent;
    selectedPerlakuanText = selectedPerlakuanHeaderDisplay.textContent;
    document.querySelector('.separator').classList.remove('none');
    document.querySelector('.anova').classList.add('show');
    document.querySelector('#posthoc').classList.remove('none');
    document.querySelector('#posthoc').innerHTML = ``;
    if (selectedDesign === "ral") {
      countAnovaRAL();
    } else if (selectedDesign === "rak") {
      countAnovaRAK();
    } else if (selectedDesign === "rakf") {
      countAnovaRAKF();
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
  })
}

function resetSettings() {
  selectedSettingType = null;
  selectedHeaders = { FaktorA: null, FaktorB: null, Perlakuan: null, Ulangan: null, Hasil: null };
  selectedFaktorAHeaderDisplay.textContent = 'Not yet selected';
  selectedFaktorBHeaderDisplay.textContent = 'Not yet selected';
  selectedPerlakuanHeaderDisplay.textContent = 'Not yet selected';
  selectedUlanganHeaderDisplay.textContent = 'Not yet selected';
  selectedHasilHeaderDisplay.textContent = 'Not yet selected';
  document.querySelectorAll('.setting-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('#tableContainer .selected-header').forEach(e => {
    e.removeAttribute('data-setting');
    e.classList.remove('selected-header');
  });
  document.querySelector('.run').classList.add('none');
  document.querySelector('.separator').classList.add('none');
  document.querySelector('#anova').classList.remove('show');
  document.querySelector('#posthoc').classList.add('none');
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
  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th>Sumber Keragaman</th>
        <th>Derajat Bebas</th>
        <th>Jumlah Kuadrat</th>
        <th>Kuadrat Tengah</th>
        <th>F Hitung</th>
        <th>F Tabel 5%</th>
        <th>Signifikansi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Perlakuan</td>
        <td class="Pdb"></td>
        <td class="Pjk"></td>
        <td class="Pkt"></td>
        <td class="Pfh"></td>
        <td class="Pft"></td>
        <td class="Psg"></td>
      </tr>
      <tr>
        <td>Galat</td>
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
  const [cellkk, cellfk, cellgt, cellPdb, cellPjk, cellPkt, cellPfh, cellPft, cellPsg, cellGdb, cellGjk, cellGkt, cellTdb, cellTjk]
    = ['kk', 'fk', 'gt', 'Pdb', 'Pjk', 'Pkt', 'Pfh', 'Pft', 'Psg', 'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk']
      .map(cls => document.querySelector(`.${cls}`));

  const fk = getData.sum("Hasil") * getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"));
  cellfk.innerHTML = fk;
  cellgt.innerHTML = getData.sum("Hasil");

  const Pdb = getData.count("Perlakuan") - 1;
  cellPdb.innerHTML = Pdb;
  const Gdb = getData.count("Perlakuan") * (getData.count("Ulangan") - 1);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("Perlakuan") * getData.count("Ulangan") - 1;
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
  const Pft = jStat.centralF.inv(0.95, Pdb, Gdb);
  cellPft.innerHTML = Pft.toFixed(2);

  if (Pfh > Pft) {
    cellPsg.innerHTML = "*"
  } else {
    cellPsg.innerHTML = "tn"
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('input-data').value = getData.info("Perlakuan", "Hasil");
  document.querySelector('#input-perlakuan').value = getData.count("Perlakuan");
  document.querySelector('#input-ulangan').value = getData.count("Ulangan");
  document.querySelector('#input-ktg').value = Gkt;
}

// ----- RAK -----
function countAnovaRAK() {
  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th>Sumber Keragaman</th>
        <th>Derajat Bebas</th>
        <th>Jumlah Kuadrat</th>
        <th>Kuadrat Tengah</th>
        <th>F Hitung</th>
        <th>F Tabel 5%</th>
        <th>F Tabel 1%</th>
        <th>Signifikansi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Kelompok</td>
        <td class="Udb"></td>
        <td class="Ujk"></td>
        <td class="Ukt"></td>
        <td class="Ufh"></td>
        <td class="Ft5" rowspan="2"></td>
        <td class="Ft1" rowspan="2"></td>
        <td class="Usg"></td>
      </tr>
      <tr>
        <td>Perlakuan</td>
        <td class="Pdb"></td>
        <td class="Pjk"></td>
        <td class="Pkt"></td>
        <td class="Pfh"></td>
        <td class="Psg"></td>
      </tr>
      <tr>
        <td>Galat</td>
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
  const [cellkk, cellfk, cellgt, cellPdb, cellPjk, cellPkt, cellPfh, cellFt5, cellFt1, cellPsg, cellUdb, cellUjk, cellUkt, cellUfh, cellUft, cellUsg, cellGdb, cellGjk, cellGkt, cellTdb, cellTjk]
    = ['kk', 'fk', 'gt', 'Pdb', 'Pjk', 'Pkt', 'Pfh', 'Ft5', 'Ft1', 'Psg', 'Udb', 'Ujk', 'Ukt', 'Ufh', 'Uft', 'Usg', 'Gdb', 'Gjk', 'Gkt', 'Tdb', 'Tjk']
      .map(cls => document.querySelector(`.${cls}`));

  const fk = getData.sum("Hasil") * getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"));
  cellfk.innerHTML = fk.toFixed(2);
  cellgt.innerHTML = getData.sum("Hasil").toFixed(2);

  const Pdb = getData.count("Perlakuan") - 1;
  cellPdb.innerHTML = Pdb;
  const Udb = getData.count("Ulangan") - 1;
  cellUdb.innerHTML = Udb;
  const Gdb = (getData.count("Perlakuan") - 1) * (getData.count("Ulangan") - 1);
  cellGdb.innerHTML = Gdb;
  const Tdb = getData.count("Perlakuan") * getData.count("Ulangan") - 1;
  cellTdb.innerHTML = Tdb;

  const Pjk = getData.sumOfGroupedSquares("Perlakuan", "Hasil") / getData.count("Ulangan") - fk;
  cellPjk.innerHTML = Pjk.toFixed(2);
  const Ujk = getData.sumOfGroupedSquares("Ulangan", "Hasil") / getData.count("Perlakuan") - fk;
  cellUjk.innerHTML = Ujk.toFixed(2);
  const Tjk = getData.sumSquared("Hasil") - fk;
  cellTjk.innerHTML = Tjk.toFixed(2);
  const Gjk = Tjk - Pjk - Ujk;
  cellGjk.innerHTML = Gjk.toFixed(2);

  const Pkt = Pjk / Pdb;
  cellPkt.innerHTML = Pkt.toFixed(2);
  const Ukt = Ujk / Udb;
  cellUkt.innerHTML = Ukt.toFixed(2);
  const Gkt = Gjk / Gdb;
  cellGkt.innerHTML = Gkt.toFixed(2);

  const Pfh = Pkt / Gkt;
  cellPfh.innerHTML = Pfh.toFixed(2);
  const Ufh = Ukt / Gkt;
  cellUfh.innerHTML = Ufh.toFixed(2);

  const ft5 = jStat.centralF.inv(0.95, Pdb, Gdb);
  cellFt5.innerHTML = ft5.toFixed(2);
  const ft1 = jStat.centralF.inv(0.99, Pdb, Gdb);
  cellFt1.innerHTML = ft1.toFixed(2);

  if (Pfh > ft1) {
    cellPsg.innerHTML = "**"
  } else if (Pfh > ft5) {
    cellPsg.innerHTML = "*"
  } else {
    cellPsg.innerHTML = "tn"
  }

  if (Ufh > ft1) {
    cellPsg.innerHTML = "**"
  } else if (Ufh > ft5) {
    cellUsg.innerHTML = "*"
  } else {
    cellUsg.innerHTML = "tn"
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("Perlakuan") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('input-data').value = getData.info("Perlakuan", "Hasil");
  document.querySelector('#input-perlakuan').value = getData.count("Perlakuan");
  document.querySelector('#input-ulangan').value = getData.count("Ulangan");
  document.querySelector('#input-ktg').value = Gkt;
}

// ----- RAK-F -----
function countAnovaRAKF() {
  document.querySelector("#anova h3").innerHTML = `ANOVA: Randomized Block Design (2 Factors)`;
  document.querySelector('table#anovaTable').innerHTML = `
    <thead>
      <tr>
        <th>Sumber Keragaman</th>
        <th>Derajat Bebas</th>
        <th>Jumlah Kuadrat</th>
        <th>Kuadrat Tengah</th>
        <th>F Hitung</th>
        <th>F Tabel 5%</th>
        <th>F Tabel 1%</th>
        <th>Signifikansi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Kelompok</td>
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
        <td>Galat</td>
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
    cellUsg.innerHTML = "tn"
  }

  if (Afh > Aft1) {
    cellAsg.innerHTML = "**"
  } else if (Afh > Aft5) {
    cellAsg.innerHTML = "*"
  } else {
    cellAsg.innerHTML = "tn"
  }

  if (Bfh > Bft1) {
    cellBsg.innerHTML = "**"
  } else if (Bfh > Bft5) {
    cellBsg.innerHTML = "*"
  } else {
    cellBsg.innerHTML = "tn"
  }

  if (ABfh > ABft1) {
    cellABsg.innerHTML = "**";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else if (ABfh > ABft5) {
    cellABsg.innerHTML = "*";
    document.querySelector('#posthoc').classList.remove('tanpa-interaksi')
  } else {
    cellABsg.innerHTML = "tn";
    document.querySelector('#posthoc').classList.add('tanpa-interaksi')
  }

  const kk = Math.sqrt(Gkt) / (getData.sum("Hasil") / (getData.count("FaktorA") * getData.count("FaktorB") * getData.count("Ulangan"))) * 100;
  cellkk.innerHTML = kk.toFixed(0) + "%";

  document.getElementById('posthoc').innerHTML = `<h3 id="posthoc-title"></h3>`;

  // BNT
  if (selectedPosthoc === "bnt") {
    // Perhitungan StudentT & LSD
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    thitA = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorB"))));
    thitB = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorA"))));
    thitAB = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processFLSD(selectedFaktorAText, 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processFLSD(selectedFaktorBText, 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processFLSD('Combination: ' + selectedFaktorAText + ' × ' + selectedFaktorBText, 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'>Interaction: " + selectedFaktorAText + " × " + selectedFaktorBText + "</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
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
  // BNJ
  else if (selectedPosthoc === "bnj") {
    // Perhitungan StudentT & LSD
    table = (jStat.studentt.inv(1 - 0.05 / 2, Gdb));
    thitA = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorB"))));
    thitB = (table * Math.sqrt((2 * Gkt) / (getData.count("Ulangan") * getData.count("FaktorA"))));
    thitAB = (table * Math.sqrt((2 * Gkt) / getData.count("Ulangan")));
    // Faktor A, Faktor B, dan Kombinasi AB
    processFLSD('Faktor A', 'factorA', getData.info("FaktorA", "Hasil"), thitA);
    processFLSD('Faktor B', 'factorB', getData.info("FaktorB", "Hasil"), thitB);
    processFLSD('Kombinasi AB', 'factorAB', getData.info("FaktorA", "FaktorB", "Hasil"), thitAB);
    // Interaksi AB
    document.getElementById('factorAB-LETTER').parentNode.insertAdjacentHTML('afterend', "<h4 class='posthoc-collapser interaksi'>Interaksi AB</h4> <div id='interaction-table' class='posthoc-collapsed'></div>");
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
      headRow.appendChild(document.createElement('th')).textContent = 'Interaksi';
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

///////////////////////////////////////////////////////////////////////////////////////////

// ----- Posthoc : BNT / Fisher's LSD -----
function processFLSD(title, factorKey, info, thit) {
  // Title
  document.getElementById('posthoc-title').innerText = "Post Hoc: Fisher's LSD";
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
            <th><span>Value</span></th>
            <th><span>Letter</span></th>
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

let valueBNTH;
let dataMapBNT;
function hitungBNT() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = 1 - (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt((2 * inputKTG) / inputUlangan);
  const valueBNTT = jStat.studentt.inv(inputSig, valueDBG);
  valueBNTH = valueSD * valueBNTT;

  const outputSD = document.querySelector('.output-bntsd');
  const outputBNTT = document.querySelector('.output-bntt');
  const outputBNTH = document.querySelector('.output-bnth');

  outputSD.innerHTML = valueSD.toFixed(2);
  outputBNTT.innerHTML = valueBNTT.toFixed(2);
  outputBNTH.innerHTML = valueBNTH.toFixed(2);
};
function processDataBNT() {
  const input = document.getElementById('input-data').value.trim();
  const lines = input.split('\n');
  dataMapBNT = {};

  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapBNT[perlakuan] = nilaiFloat;
  });

  const sortedEntries = Object.entries(dataMapBNT).sort((a, b) => a[1] - b[1]);
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
      value: dataMapBNT[key]
    };
  }

  const dataMapBNTKeyOrder = Object.keys(dataMapBNT);
  const mergedCustomOrder = Object.keys(merged);

  function renderTable(orderBy = 'dataMapBNTKey', reverse = false) {
    const tbody = document.querySelector("#letterTable tbody");
    tbody.innerHTML = "";

    let sortedKeys;

    if (orderBy === 'merged') {
      sortedKeys = [...mergedCustomOrder];
    } else if (orderBy === 'dataMapBNTKey') {
      sortedKeys = dataMapBNTKeyOrder.filter(k => merged[k]);
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
    renderTable('dataMapBNTKey', isDataReversed);
    isDataReversed = !isDataReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyMerged').classList.add('opacity');
  };

  document.querySelectorAll('.output').forEach(el => el.classList.add('show'));

};

// ----- Posthoc : BNJ / Tukey's HSD -----



let valueBNJH;
let dataMapBNJ;
function hitungBNJ() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = 1 - (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt(inputKTG / inputUlangan);
  const valueBNJT = jStat.tukey.inv(inputSig, inputPerlakuan, valueDBG);
  valueBNJH = valueSD * valueBNJT;

  const outputSD = document.querySelector('.output-bnjsd');
  const outputBNJT = document.querySelector('.output-bnjt');
  const outputBNJH = document.querySelector('.output-bnjh');

  outputSD.innerHTML = valueSD.toFixed(2);
  outputBNJT.innerHTML = valueBNJT.toFixed(2);
  outputBNJH.innerHTML = valueBNJH.toFixed(2);
}
function processDataBNJ() {
  const input = document.getElementById('input-data').value.trim();
  const lines = input.split('\n');
  dataMapBNJ = {};

  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapBNJ[perlakuan] = nilaiFloat;
  });

  const sortedEntries = Object.entries(dataMapBNJ).sort((a, b) => a[1] - b[1]);

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
      if (difference <= valueBNJH && difference >= 0) {
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
      value: dataMapBNJ[key]
    };
  }

  const dataMapBNJKeyOrder = Object.keys(dataMapBNJ);
  const mergedCustomOrder = Object.keys(merged);

  function renderTable(orderBy = 'dataMapBNJKey', reverse = false) {
    const tbody = document.querySelector("#letterTable tbody");
    tbody.innerHTML = "";

    let sortedKeys;

    if (orderBy === 'merged') {
      sortedKeys = [...mergedCustomOrder];
    } else if (orderBy === 'dataMapBNJKey') {
      sortedKeys = dataMapBNJKeyOrder.filter(k => merged[k]);
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
    renderTable('dataMapBNJKey', isDataReversed);
    isDataReversed = !isDataReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyMerged').classList.add('opacity');
  };

  document.querySelectorAll('.output').forEach(el => el.classList.add('show'));

};

// ----- Posthoc : DMRT / Duncan's Multiple Range Test -----
let dataMapDMRT;
function hitungDMRT() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt(inputKTG / inputUlangan);

  const outputSD = document.querySelector('.dmrt-output-sd');

  outputSD.innerHTML = valueSD.toFixed(2);
  outputSD.setAttribute("colspan", inputPerlakuan - 1);

  const elementDMRTP = document.querySelector('.dmrt-p');
  elementDMRTP.innerHTML = `<th>P</th>`;
  const elementDMRTT = document.querySelector('.dmrt-table');
  elementDMRTT.innerHTML = `<th>Tabel DMRT</th>`;
  const elementDMRTC = document.querySelector('.dmrt-calc');
  elementDMRTC.innerHTML = `<th>DMRT Hitung</th>`;
  for (let i = 2; i <= inputPerlakuan; i++) {
    elementDMRTP.innerHTML += `<td>${i}</td>`;
    elementDMRTT.innerHTML += `<td>${jrStat.studentq.inv(inputSig, i, valueDBG).toFixed(2)}</td>`;
    elementDMRTC.innerHTML += `<td data-p="${i}">${(valueSD * jrStat.studentq.inv(inputSig, i, valueDBG)).toFixed(2)}</td>`;
  }
}
function processDataDMRT() {
  const input = document.getElementById('input-data').value.trim();
  const lines = input.split('\n');
  dataMapDMRT = {};

  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapDMRT[perlakuan] = nilaiFloat;
  });

  const sortedEntries = Object.entries(dataMapDMRT).sort((a, b) => a[1] - b[1]);

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
      if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else {
        row.innerHTML += `<td>${difference}</td>`;
      }
    });

    matrixTableBody.appendChild(row);
  });

  const rowtr = document.querySelectorAll("#matrixTable tbody tr");
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
      p++;
    }
  });

  function checkGreen() {
    const matrixTds = document.querySelectorAll('#matrixTable td');

    matrixTds.forEach(matrixTd => {
      const rawMatrixValue = matrixTd.textContent.trim();
      const matrixValue = parseFloat(rawMatrixValue);
      if (!isNaN(matrixValue) && matrixValue === 0) {
        matrixTd.classList.add('green');
        return;
      }
      const dataP = matrixTd.getAttribute('data-p');
      if (!dataP) return;
      const dmrtTd = document.querySelector(`tr.dmrt-calc td[data-p="${dataP}"]`);
      if (!dmrtTd) return;
      const rawDmrtValue = dmrtTd.textContent.trim();
      const dmrtValue = parseFloat(rawDmrtValue);
      if (!isNaN(matrixValue) && !isNaN(dmrtValue) && matrixValue <= dmrtValue) {
        matrixTd.classList.add('green');
      }
    });
  }
  checkGreen();

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
      value: dataMapDMRT[key]
    };
  }

  const dataMapDMRTKeyOrder = Object.keys(dataMapDMRT);
  const mergedCustomOrder = Object.keys(merged);

  function renderTable(orderBy = 'dataMapDMRTKey', reverse = false) {
    const tbody = document.querySelector("#letterTable tbody");
    tbody.innerHTML = "";

    let sortedKeys;

    if (orderBy === 'merged') {
      sortedKeys = [...mergedCustomOrder];
    } else if (orderBy === 'dataMapDMRTKey') {
      sortedKeys = dataMapDMRTKeyOrder.filter(k => merged[k]);
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
    renderTable('dataMapDMRTKey', isDataReversed);
    isDataReversed = !isDataReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyMerged').classList.add('opacity');
  };

  document.querySelectorAll('.output').forEach(el => el.classList.add('show'));

}

// ----- Posthoc : Student-Newman-Keuls -----
let dataMapSNK;
function hitungSNK() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = 1 - (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt(inputKTG / inputUlangan);

  const outputSD = document.querySelector('.snk-output-sd');

  outputSD.innerHTML = valueSD.toFixed(2);
  outputSD.setAttribute("colspan", inputPerlakuan - 1);

  const elementSNKP = document.querySelector('.snk-p');
  elementSNKP.innerHTML = `<th>P</th>`;
  const elementSNKT = document.querySelector('.snk-table');
  elementSNKT.innerHTML = `<th>Tabel SNK</th>`;
  const elementSNKC = document.querySelector('.snk-calc');
  elementSNKC.innerHTML = `<th>SNK Hitung</th>`;
  for (let i = 2; i <= inputPerlakuan; i++) {
    elementSNKP.innerHTML += `<td>${i}</td>`;
    elementSNKT.innerHTML += `<td>${jStat.tukey.inv(inputSig, i, valueDBG).toFixed(2)}</td>`;
    elementSNKC.innerHTML += `<td data-p="${i}">${(valueSD * jStat.tukey.inv(inputSig, i, valueDBG)).toFixed(2)}</td>`;
  }
}
function processDataSNK() {
  const input = document.getElementById('input-data').value.trim();
  const lines = input.split('\n');
  dataMapSNK = {};

  lines.forEach(line => {
    const [perlakuan, nilai] = line.trim().split(/\s+/);
    const nilaiFloat = parseFloat(nilai);
    dataMapSNK[perlakuan] = nilaiFloat;
  });

  const sortedEntries = Object.entries(dataMapSNK).sort((a, b) => a[1] - b[1]);

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
      if (difference < 0) {
        row.innerHTML += `<td class="gray">${difference}</td>`;
      } else {
        row.innerHTML += `<td>${difference}</td>`;
      }
    });

    matrixTableBody.appendChild(row);
  });

  const rowtr = document.querySelectorAll("#matrixTable tbody tr");
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
      p++;
    }
  });

  function checkGreen() {
    const matrixTds = document.querySelectorAll('#matrixTable td');

    matrixTds.forEach(matrixTd => {
      const rawMatrixValue = matrixTd.textContent.trim();
      const matrixValue = parseFloat(rawMatrixValue);
      if (!isNaN(matrixValue) && matrixValue === 0) {
        matrixTd.classList.add('green');
        return;
      }
      const dataP = matrixTd.getAttribute('data-p');
      if (!dataP) return;
      const snkTd = document.querySelector(`tr.snk-calc td[data-p="${dataP}"]`);
      if (!snkTd) return;
      const rawSnkValue = snkTd.textContent.trim();
      const snkValue = parseFloat(rawSnkValue);
      if (!isNaN(matrixValue) && !isNaN(snkValue) && matrixValue <= snkValue) {
        matrixTd.classList.add('green');
      }
    });
  }
  checkGreen();

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
      value: dataMapSNK[key]
    };
  }

  const dataMapSNKKeyOrder = Object.keys(dataMapSNK);
  const mergedCustomOrder = Object.keys(merged);

  function renderTable(orderBy = 'dataMapSNKKey', reverse = false) {
    const tbody = document.querySelector("#letterTable tbody");
    tbody.innerHTML = "";

    let sortedKeys;

    if (orderBy === 'merged') {
      sortedKeys = [...mergedCustomOrder];
    } else if (orderBy === 'dataMapSNKKey') {
      sortedKeys = dataMapSNKKeyOrder.filter(k => merged[k]);
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
    renderTable('dataMapSNKKey', isDataReversed);
    isDataReversed = !isDataReversed;
    this.classList.toggle('rev');
    this.classList.remove('opacity');
    document.getElementById('renderbyMerged').classList.add('opacity');
  };

  document.querySelectorAll('.output').forEach(el => el.classList.add('show'));

}

// ----- Posthoc : Scott Knott -----
const chi2table = {
  "0.05": [null, 3.84, 5.99, 7.81, 9.49, 11.07, 12.59, 14.07, 15.51, 16.92, 18.31],
  "0.01": [null, 6.63, 9.21, 11.34, 13.28, 15.09, 16.81, 18.48, 20.09, 21.67, 23.21]
}
function getNotation(index) {
  let label = '';
  index++;
  while (index > 0) {
    let rem = (index - 1) % 26;
    label = String.fromCharCode(97 + rem) + label; // 97 = 'a'
    index = Math.floor((index - 1) / 26);
  }
  return label;
}
function parseInput(raw) {
  const lines = raw.trim().split('\n');
  const data = [];
  for (let line of lines) {
    let [nama, nilai] = line.trim().split(/\s+/);
    if (nama && nilai && !isNaN(parseFloat(nilai))) {
      data.push({ nama, nilai: parseFloat(nilai) });
    }
  }
  return data;
}
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function scottKnott(groups, alpha) {
  let results = [];
  for (let group of groups) {
    if (group.length < 2) {
      results.push({ homogen: true, group, lambda: null, chi2: null });
      continue;
    }

    group = group.slice().sort((a, b) => a.nilai - b.nilai);

    let n = group.length;
    let totalMean = mean(group.map(x => x.nilai));

    let bestSplit = null;
    let maxLambda = -Infinity;
    for (let i = 1; i < n; i++) {
      let left = group.slice(0, i);
      let right = group.slice(i);
      let n1 = left.length, n2 = right.length;
      let mean1 = mean(left.map(x => x.nilai));
      let mean2 = mean(right.map(x => x.nilai));
      // λ (lambda) = [n1*(mean1 - totalMean)^2 + n2*(mean2 - totalMean)^2]
      let lambda = n1 * Math.pow(mean1 - totalMean, 2) + n2 * Math.pow(mean2 - totalMean, 2);
      if (lambda > maxLambda) {
        maxLambda = lambda;
        bestSplit = { left, right, lambda };
      }
    }

    let db = 1;
    let chi2 = chi2table[alpha][db];

    if (maxLambda <= chi2) {
      results.push({ homogen: true, group, lambda: maxLambda, chi2 });
    } else {
      let leftResults = scottKnott([bestSplit.left], alpha);
      let rightResults = scottKnott([bestSplit.right], alpha);
      results = results.concat(leftResults, rightResults);
    }
  }
  return results;
}
function renderResult(homogeneityGroups) {
  let html;
  let groupNum = 1;
  for (let group of homogeneityGroups) {
    html += `<tr><th colspan="2">Gugus ${groupNum}</th></tr>`;
    for (let d of group.group) {
      html += `<tr><td>${d.nama}</td><td>${d.nilai}</td></tr>`;
    }
    let B0s = group.group.map(x => x.nilai);
    html += `
  <tr>
    <th class="grayth">B<sub>0</sub></th>
    <th class="grayth">${mean(B0s).toFixed(4)}</th>
  </tr>
  ${group.lambda !== null ? `
  <tr>
    <th class="grayth">λ</th>
    <th class="grayth">${group.lambda.toFixed(4)}</th>
  </tr>
  <tr>
    <th class="grayth">χ<sup>2</sup>(α, db=1)</th>
    <th class="grayth">${group.chi2.toFixed(4)}</th>
  </tr>
  ` : ''} 
  <tr>
    <td colspan="2"></td>
  </tr>
  `;
    groupNum++;
  }
  return html;
}
function renderHasil(data, homogeneityGroups) {
  let notasiMap = {};
  let notasiIndex = 0;
  for (let group of homogeneityGroups) {
    for (let d of group.group) {
      notasiMap[d.nama] = getNotation(notasiIndex);
    }
    notasiIndex++;
  }
  let html = '<tbody>';
  for (let d of data) {
    html += `<tr><td>${d.nama}</td><td>${d.nilai}</td><td>${notasiMap[d.nama]}</td></tr>`;
  }
  html += '</tbody>';
  return html;
}
function processDataSK() {
  const raw = document.getElementById('input-data').value;
  const alpha = "0.05";
  const data = parseInput(raw);
  if (data.length < 2) {
    alert("Minimal 2 data diperlukan!");
    return;
  }
  document.querySelectorAll('.output').forEach(el => {
    el.classList.add('show');
  });
  const result = scottKnott([data], alpha);
  document.querySelector('tbody.sk').innerHTML = renderResult(result);
  const tbody = document.querySelector('tbody.sk');
  if (tbody) {
    tbody.innerHTML = tbody.innerHTML.replace('undefined', '');
  }
  document.querySelector('#letterTable tbody').innerHTML = renderHasil(data, result);
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