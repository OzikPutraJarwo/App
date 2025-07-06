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
  // Memastikan koordinat berada dalam batas yang valid
  const clampedR = Math.min(Math.max(r, 0), originalRows - 1);
  const clampedC = Math.min(Math.max(c, 0), originalCols - 1);
  return z_original[clampedR][clampedC];
};

function generateHeatmap() {
  const input = textarea.value.trim();

  try {
    const z_original = input
      .split('\n')
      .map(row => row.trim().split(/\s+/).map(Number));

    // Validasi data input
    if (!z_original.length || !z_original[0].length || z_original.some(r => r.length !== z_original[0].length || r.some(isNaN))) {
      throw new Error("Data tidak valid. Pastikan semua baris memiliki jumlah kolom yang sama dan hanya berisi angka.");
    }

    const originalRows = z_original.length;
    const originalCols = z_original[0].length;
    const upscaleFactor = 200; // Faktor perbesaran

    // Hitung dimensi heatmap yang diperbesar
    const upscaledRows = originalRows * upscaleFactor;
    const upscaledCols = originalCols * upscaleFactor;
    const z_upscaled = Array(upscaledRows).fill(0).map(() => Array(upscaledCols).fill(0));

    // Interpolasi bilinear untuk memperhalus perubahan warna
    for (let r_new = 0; r_new < upscaledRows; r_new++) {
      for (let c_new = 0; c_new < upscaledCols; c_new++) {
        // Hitung koordinat floating point di grid asli dengan pemetaan yang lebih akurat, memastikan bahwa pusat data asli dipetakan ke pusat blok yang diperbesar
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

    // Buat array X dan Y untuk Plotly berdasarkan dimensi yang diperbesar
    const x = [...Array(upscaledCols).keys()];
    const y = [...Array(upscaledRows).keys()];

    // Hitung nilai min dan max dari data asli
    const allOriginalValues = z_original.flat();
    const zmin = Math.min(...allOriginalValues);
    const zmax = Math.max(...allOriginalValues);

    const data = [{
      z: z_upscaled, // Gunakan data yang sudah diinterpolasi
      x: x,
      y: y,
      type: 'heatmap',
      zmin: zmin, // Gunakan zmin dari data asli
      zmax: zmax, // Gunakan zmax dari data asli
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
      colorbar: {
        // title: 'Intensitas',
        // Sesuaikan tickvals dan ticktext untuk mencerminkan rentang data yang sebenarnya
        tickvals: [zmin, (zmin + zmax) / 2, zmax],
        ticktext: [`${zmin.toFixed(0)}`, `${((zmin + zmax) / 2).toFixed(0)}`, `${zmax.toFixed(0)}`]
      }
    }];

    const layout = {
      // title: `Heatmap (Min: ${zmin.toFixed(0)}, Max: ${zmax.toFixed(0)})`,
      xaxis: {
        // title: 'X (Original Scale)', // Mengubah judul sumbu X
        tickvals: Array.from({length: originalCols}, (_, i) => i * upscaleFactor + upscaleFactor / 2), // Posisi tick di tengah sel yang diperbesar
        ticktext: Array.from({length: originalCols}, (_, i) => i) // Label tick sesuai skala asli
      },
      yaxis: {
        // title: 'Y (Original Scale)', // Mengubah judul sumbu Y
        tickvals: Array.from({length: originalRows}, (_, i) => i * upscaleFactor + upscaleFactor / 2), // Posisi tick di tengah sel yang diperbesar
        ticktext: Array.from({length: originalRows}, (_, i) => i) // Label tick sesuai skala asli
      },
      // autosize: true,
      margin: { l: 50, r: 50, b: 50, t: 0, pad: 0 }
    };

    // Gambar heatmap baru
    Plotly.newPlot('heatmap', data, layout);
  } catch (e) {
    document.getElementById('heatmap').innerHTML = `<p style="color: red; text-align: center;">⚠️ ${e.message}</p>`;
  }
}

// Jalankan saat halaman dibuka
window.onload = generateHeatmap;

// Jalankan saat textarea diubah
textarea.addEventListener('input', generateHeatmap);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    generateHeatmap();
  }, 250);
});