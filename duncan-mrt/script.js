function hitungDMRT() {
  const inputPerlakuan = document.querySelector('#input-perlakuan').value;
  const inputUlangan = document.querySelector('#input-ulangan').value;
  const inputKTG = document.querySelector('#input-ktg').value;
  const inputSig = 1 - (document.querySelector('#input-sig').value * 0.01);

  const valueDBG = (inputPerlakuan - 1) * (inputUlangan - 1);
  const valueSD = Math.sqrt(inputKTG / inputUlangan);

  const outputSD = document.querySelector('.output-sd');

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
    elementDMRTT.innerHTML += `<td>${jStat.tukey.inv(inputSig, i, valueDBG).toFixed(2)}</td>`;
    elementDMRTC.innerHTML += `<td data-p="${i}">${(valueSD * jStat.tukey.inv(inputSig, i, valueDBG)).toFixed(2)}</td>`;
  }
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
  document.getElementById('input-data').value = `M0 39.80\nM1 52.47\nM2 53.00\nM3 64.35\nM4 75.41\nM5 64.40\nM6 41.08`;
  document.getElementById('input-perlakuan').value = 7;
  document.getElementById('input-ulangan').value = 3;
  document.getElementById('input-ktg').value = 47.62;
};