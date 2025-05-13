const chi2table = {
    "0.05": [null, 3.84, 5.99, 7.81, 9.49, 11.07, 12.59, 14.07, 15.51, 16.92, 18.31],
    "0.01": [null, 6.63, 9.21, 11.34, 13.28, 15.09, 16.81, 18.48, 20.09, 21.67, 23.21]
};

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

function renderResult(data, homogeneityGroups) {

    let html;
    // let html = '<h3>Data Input</h3><table><tr><th>Perlakuan</th><th>Nilai</th></tr>';
    // for (let d of data) {
    //   html += `<tr><td>${d.nama}</td><td>${d.nilai}</td></tr>`;
    // }
    // html += '</table>';

    html = '<h3>Perhitungan Scott-Knott</h3>';
    let groupNum = 1;
    for (let group of homogeneityGroups) {
        html += `<div class="group"><b>Gugus ${groupNum}</b><br>`;
        //   html += `<div class="group"><b>Gugus ${groupNum} (${group.homogen ? "Homogen" : "Tidak Homogen"})</b><br>`;
        html += `<table><tr><th>Perlakuan</th><th>Nilai</th></tr>`;
        for (let d of group.group) {
            html += `<tr><td>${d.nama}</td><td>${d.nilai}</td></tr>`;
        }
        let B0s = group.group.map(x => x.nilai);
        html += `</table>`;
        html += `B<sub>0</sub> (rata-rata): <b>${mean(B0s).toFixed(4)}</b><br>`;
        if (group.lambda !== null) {
            html += `Nilai λ: <b>${group.lambda.toFixed(4)}</b><br>`;
            html += `Nilai χ<sup>2</sup>(α, db=1): <b>${group.chi2.toFixed(4)}</b><br>`;
            html += `<b>${group.lambda <= group.chi2 ? "Homogen" : "Belum homogen, dipecah lagi"}</b>`;
        }
        html += `</div>`;
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
    let html = '<h3>Hasil</h3><table><tr><th>Perlakuan</th><th>Nilai</th><th>Notasi</th></tr>';
    for (let d of data) {
        html += `<tr><td>${d.nama}</td><td>${d.nilai}</td><td>${notasiMap[d.nama]}</td></tr>`;
    }
    html += '</table>';
    return html;
}

function runScottKnott() {
    const raw = document.getElementById('dataInput').value;
    const alpha = document.getElementById('alpha').value;
    const data = parseInput(raw);
    if (data.length < 2) {
        document.querySelectorAll('.calculation').forEach(el => {
            el.style.display = 'block';
        });
        document.getElementById('result').innerHTML = '<p style="color: #c00;">Minimal 2 data diperlukan.</p>';
        document.getElementById('hasil').innerHTML = '';
        return;
    }
    document.querySelectorAll('.output, .calculation').forEach(el => {
        el.style.display = 'block';
    });
    const result = scottKnott([data], alpha);
    document.getElementById('result').innerHTML = renderResult(data, result);
    document.getElementById('hasil').innerHTML = renderHasil(data, result);
}