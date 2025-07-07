const textarea = document.getElementById('dataInput');

/**
 * Mengambil nilai Z dari matriks asli dengan penanganan batas.
 * Jika koordinat di luar batas, akan mengembalikan nilai dari sel terdekat yang valid.
 * @param {Array<Array<number>>} z_original - Matriks data Z asli.
 * @param {number} r - Indeks baris.
 * @param {number} c - Indeks kolom.
 * @param {number} originalRows - Jumlah baris asli.
 * @param {number} originalCols - Jumlah kolom asli.
 * @returns {number} Nilai Z pada koordinat yang diberikan atau nilai terdekat.
 */
const getZValue = (z_original, r, c, originalRows, originalCols) => {
  const clampedR = Math.min(Math.max(r, 0), originalRows - 1);
  const clampedC = Math.min(Math.max(c, 0), originalCols - 1);
  return z_original[clampedR][clampedC];
};

function generateHeatmap() {
  const input = textarea.value.trim();
  const scaleInput = document.getElementById('scale').value;
  const heightInput = document.getElementById('height').value;
  const titleCheckbox = document.getElementById('title');
  const titleInput = document.getElementById('chart-title').value.trim();
  const colorbarCheckbox = document.getElementById('colorbar');
  const colorbarInput = document.getElementById('colorbar-title').value.trim();
  const xaxisCheckbox = document.getElementById('xaxis');
  const xaxisTick = document.getElementById('xaxis-tick');
  const xaxisInput = document.getElementById('xaxis-title').value.trim();
  const yaxisCheckbox = document.getElementById('yaxis');
  const yaxisTick = document.getElementById('yaxis-tick');
  const yaxisInput = document.getElementById('yaxis-title').value.trim();

  const ratioContainer = document.querySelector('.ratio');
  const ratioNon = document.getElementById('height');
  const ratioCheckbox = document.getElementById('height-ratio');
  const heatmapWidth = document.getElementById('heatmap').offsetWidth;
  const ratioWidth = document.getElementById('ratio-width').value;
  const ratioHeight = document.getElementById('ratio-height').value;

  if (ratioCheckbox.checked === true) {
    ratioContainer.classList.remove('none');
    ratioNon.classList.add('none');
    document.getElementById('heatmap').style.height = heatmapWidth / ratioWidth * ratioHeight + "px";
  } else {
    ratioContainer.classList.add('none');
    ratioNon.classList.remove('none');
    document.getElementById('heatmap').style.height = heightInput ? heightInput + "px" : "450px";
  }

  try {
    const z_original = input
      .split('\n')
      .map(row => row.trim().split(/\s+/).map(Number));

    if (!z_original.length || !z_original[0].length || z_original.some(r => r.length !== z_original[0].length || r.some(isNaN))) {
      throw new Error("Data tidak valid. Pastikan semua baris memiliki jumlah kolom yang sama dan hanya berisi angka.");
    }

    const originalRows = z_original.length;
    const originalCols = z_original[0].length;
    const upscaleFactor = scaleInput;

    const upscaledRows = originalRows * upscaleFactor;
    const upscaledCols = originalCols * upscaleFactor;
    const z_upscaled = Array(upscaledRows).fill(0).map(() => Array(upscaledCols).fill(0));

    for (let r_new = 0; r_new < upscaledRows; r_new++) {
      for (let c_new = 0; c_new < upscaledCols; c_new++) {
        // Hitung koordinat floating point di grid asli dengan pemetaan yang lebih akurat, memastikan pusat data asli dipetakan ke pusat blok yang diperbesar
        const r_orig_float = (originalRows > 1) ? r_new * ((originalRows - 1) / (upscaledRows - 1)) : 0;
        const c_orig_float = (originalCols > 1) ? c_new * ((originalCols - 1) / (upscaledCols - 1)) : 0;

        // Dapatkan indeks sel asli di sekitarnya
        const r1 = Math.floor(r_orig_float);
        const c1 = Math.floor(c_orig_float);
        // r2 dan c2 adalah sel berikutnya, pastikan tidak melebihi batas originalRows/Cols-1
        const r2 = Math.min(r1 + 1, originalRows - 1);
        const c2 = Math.min(c1 + 1, originalCols - 1);

        // Dapatkan nilai dari empat titik sudut sel asli
        const val00 = getZValue(z_original, r1, c1, originalRows, originalCols);
        const val10 = getZValue(z_original, r1, c2, originalRows, originalCols);
        const val01 = getZValue(z_original, r2, c1, originalRows, originalCols);
        const val11 = getZValue(z_original, r2, c2, originalRows, originalCols);

        // Hitung bobot fraksional
        const dr = r_orig_float - r1;
        const dc = c_orig_float - c1;

        // Interpolasi bilinear
        const interpolatedValue =
          val00 * (1 - dc) * (1 - dr) + // Q11 (top-left)
          val10 * dc * (1 - dr) +     // Q21 (top-right)
          val01 * (1 - dc) * dr +     // Q12 (bottom-left)
          val11 * dc * dr;            // Q22 (bottom-right)

        z_upscaled[r_new][c_new] = interpolatedValue;
      }
    }

    const x = [...Array(upscaledCols).keys()];
    const y = [...Array(upscaledRows).keys()];

    const allOriginalValues = z_original.flat();
    const zmin = Math.min(...allOriginalValues);
    const zmax = Math.max(...allOriginalValues);

    const data = [{
      z: z_upscaled,
      x: x,
      y: y,
      type: 'heatmap',
      zmin: zmin,
      zmax: zmax,
      colorscale: [
        [0.0, 'black'],
        [0.1, 'navy'],
        [0.25, 'blue'],
        [0.4, 'green'],
        [0.55, 'yellow'],
        [0.7, 'orange'],
        [0.85, 'red'],
        [1.0, 'white']
      ],
      showscale: colorbarCheckbox.checked ? true : false,
      colorbar: {
        title: colorbarInput,
        titleside: 'right'
      }
    }];

    const layout = {
      title: titleCheckbox.checked ? titleInput : "",
      xaxis: {
        showticklabels: xaxisTick.checked ? true : false,
        ticks: xaxisTick.checked ? true : '',
        title: xaxisCheckbox.checked ? xaxisInput : "",
        tickvals: Array.from({ length: originalCols }, (_, i) => i * upscaleFactor + upscaleFactor / 2),
        ticktext: Array.from({ length: originalCols }, (_, i) => i)
      },
      yaxis: {
        showticklabels: yaxisTick.checked ? true : false,
        ticks: yaxisTick.checked ? true : '',
        title: yaxisCheckbox.checked ? yaxisInput : "",
        tickvals: Array.from({ length: originalRows }, (_, i) => i * upscaleFactor + upscaleFactor / 2),
        ticktext: Array.from({ length: originalRows }, (_, i) => i)
      },
      margin: { l: yaxisCheckbox.checked ? 55 : 0, r: 0, b: xaxisCheckbox.checked ? 55 : 0, t: titleCheckbox.checked ? 50 : 0, pad: 0 }
    };

    Plotly.newPlot('heatmap', data, layout);
  } catch (e) {
    console.log("⚠️ " + e.message);
  }
}

window.onload = generateHeatmap;

textarea.addEventListener('input', generateHeatmap);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    generateHeatmap();
  }, 250);
});

document.addEventListener("DOMContentLoaded", function () {
  const settingsInputs = document.querySelectorAll('.settings input');

  settingsInputs.forEach(input => {
    input.addEventListener('input', generateHeatmap);  // untuk input teks
    input.addEventListener('change', generateHeatmap); // untuk checkbox
  });
});

function download() {
  const container = document.querySelector('.svg-container');
  domtoimage.toPng(container)
    .then(function (dataUrl) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'heatmap.png';
      link.click();
    })
    .catch(function (error) {
      console.error('Error generating image:', error);
    });
}