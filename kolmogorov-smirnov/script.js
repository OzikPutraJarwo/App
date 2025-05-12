document.getElementById('calculateBtn').addEventListener('click', function() {
    const inputText = document.getElementById('dataInput').value.trim();
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = '';
    if (!inputText) {
        errorElement.textContent = 'Please input data first.';
        return;
    }
    const lines = inputText.split('\n');
    const sampleData = [];
    let hasError = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; 
        const normalizedLine = line.replace(',', '.');
        const number = parseFloat(normalizedLine);
        if (isNaN(number)) {
            errorElement.textContent = `Line ${i + 1}: "${line}" is not a valid number (NaN)`;
            errorElement.classList.add('show');
            hasError = true;
            break;
        } else {
            errorElement.classList.remove('show');
        }
        sampleData.push(number);
    }
    if (hasError) return;
    if (sampleData.length < 3) {
        errorElement.textContent = 'Minimum 3 data required.';
        return;
    }
    const testResult = performKSTest(sampleData.sort((a, b) => a - b));
    displayResults(testResult);
});

function calculateCumulativeFrequency(sortedData) {
    const frequency = {};
    sortedData.forEach(value => {
        frequency[value] = (frequency[value] || 0) + 1;
    });
    const uniqueValues = [...new Set(sortedData)];
    let cumulative = 0;
    const result = uniqueValues.map(value => {
        cumulative += frequency[value];
        return {
            value,
            frequency: frequency[value],
            cumulative
        };
    });
    return result;
}

function calculateZScore(value, mean, stdDev) {
    return (value - mean) / stdDev;
}

function normalCDF(z) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1.0 + sign * y);
}

function performKSTest(data) {
    const n = data.length;
    const freqData = calculateCumulativeFrequency(data);
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    let maxDifference = 0;
    const results = freqData.map(item => {
        const snx = item.cumulative / n;
        const zScore = calculateZScore(item.value, mean, stdDev);
        const fx = normalCDF(zScore);
        const difference = Math.abs(fx - snx);
        if (difference > maxDifference) {
            maxDifference = difference;
        }
        return {
            value: item.value,
            frequency: item.frequency,
            cumulative: item.cumulative,
            snx,
            zScore,
            fx,
            difference
        };
    });
    const ksTableValue = 1.36 / Math.sqrt(n);
    const conclusion = maxDifference < ksTableValue ? 
        "Data is normally distributed (Maximum Difference < KS Table)" : 
        "Data is not normally distributed (Maximum Difference ≥ KS Table)";
    return {
        n,
        mean,
        stdDev,
        maxDifference,
        ksTableValue,
        conclusion,
        results
    };
}

function displayResults(testResult) {
    document.getElementById('resultsSection').style.display = 'flex';
    const tableBody = document.getElementById('sampleTableBody');
    tableBody.innerHTML = '';
    testResult.results.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.value.toFixed(3)}</td>
            <td>${item.frequency}</td>
            <td>${item.cumulative}</td>
            <td>${item.snx.toFixed(4)}</td>
            <td>${item.zScore.toFixed(4)}</td>
            <td>${item.fx.toFixed(4)}</td>
            <td>${item.difference.toFixed(4)}</td>
        `;
        tableBody.appendChild(row);
    });
    document.getElementById('nSample').textContent = testResult.n;
    document.getElementById('mean').textContent = testResult.mean.toFixed(4);
    document.getElementById('stdDev').textContent = testResult.stdDev.toFixed(4);
    document.getElementById('dn').textContent = testResult.maxDifference.toFixed(4);
    document.getElementById('ksTable').textContent = testResult.ksTableValue.toFixed(4);
    const conclusionDiv = document.getElementById('conclusion');
    conclusionDiv.textContent = testResult.conclusion;
    conclusionDiv.className = 'conclusion ' + 
        (testResult.maxDifference < testResult.ksTableValue ? 'normal' : 'not-normal');
}