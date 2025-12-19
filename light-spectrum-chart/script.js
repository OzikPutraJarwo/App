// DOM Elements
const mWDataTextarea = document.getElementById("mW-data");
const umolDataTextarea = document.getElementById("umol-data");
const downloadBtn = document.getElementById("download-btn");

// Settings elements
const xTitleInput = document.getElementById("x-title");
const yLeftTitleInput = document.getElementById("y-left-title");
const yRightTitleInput = document.getElementById("y-right-title");
const decimalFormatSelect = document.getElementById("decimal-format");
const chartHeightInput = document.getElementById("chart-height");
const colorMwInput = document.getElementById("color-mw");
const colorUmolInput = document.getElementById("color-umol");
const dashedLineCheckbox = document.getElementById("dashed-line");
const showGridCheckbox = document.getElementById("show-grid");
const decimalPlacesInput = document.getElementById("decimal-places");

let spectrumChart = null;
let updateTimeout = null;

// Default settings
const settings = {
  xTitle: "Wavelength (nm)",
  yLeftTitle: "mW·m⁻²",
  yRightTitle: "µmol·m⁻²·s⁻¹",
  decimalFormat: "dot",
  chartHeight: 500,
  colorMw: "#000000",
  colorUmol: "#666666",
  dashedLine: true,
  showGrid: true,
  decimalPlaces: 0, // Default changed to 0
};

// Initialize settings from inputs
function initializeSettings() {
  settings.xTitle = xTitleInput.value;
  settings.yLeftTitle = yLeftTitleInput.value;
  settings.yRightTitle = yRightTitleInput.value;
  settings.decimalFormat = decimalFormatSelect.value;
  settings.chartHeight = parseInt(chartHeightInput.value) || 500;
  settings.colorMw = colorMwInput.value;
  settings.colorUmol = colorUmolInput.value;
  settings.dashedLine = dashedLineCheckbox.checked;
  settings.showGrid = showGridCheckbox.checked;
  settings.decimalPlaces = parseInt(decimalPlacesInput.value) || 0; // Default to 0

  // Update chart height
  document.querySelector(".chart-container").style.height =
    settings.chartHeight + "px";
}

// Parse data from textarea
function parseData(textarea) {
  const text = textarea.value.trim();
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      // Handle both decimal separators
      let val = line;
      if (settings.decimalFormat === "comma") {
        val = val.replace(",", ".");
      }
      return parseFloat(val);
    });
}

// Generate X data (350-800 nm)
function generateXData(length) {
  const start = 350;
  const xData = [];

  for (let i = 0; i < length; i++) {
    xData.push(start + i);
  }

  return xData;
}

// Format number based on decimal format setting
function formatNumber(num) {
  if (isNaN(num)) return "N/A";

  // Fix: Ensure decimalPlaces is a number
  const decimalPlaces = parseInt(settings.decimalPlaces) || 0;

  // Fix: Don't use toFixed if decimalPlaces is 0 and we want integer formatting
  if (decimalPlaces === 0) {
    // Round to nearest integer
    return Math.round(num).toString();
  }

  const formatted = num.toFixed(decimalPlaces);

  if (settings.decimalFormat === "comma") {
    return formatted.replace(".", ",");
  }

  return formatted;
}

// Create or update chart
function createChart(mWData, umolData) {
  const ctx = document.getElementById("spectrum-chart").getContext("2d");

  // Destroy previous chart if exists
  if (spectrumChart) {
    spectrumChart.destroy();
  }

  // Generate X data
  const xData = generateXData(mWData.length);

  // Prepare datasets
  const datasets = [
    {
      label: settings.yLeftTitle,
      data: mWData,
      borderColor: settings.colorMw,
      backgroundColor: "rgba(0, 0, 0, 0.05)",
      borderWidth: 1.5,
      yAxisID: "y",
      pointRadius: 0,
      tension: 0.1,
    },
    {
      label: settings.yRightTitle,
      data: umolData,
      borderColor: settings.colorUmol,
      backgroundColor: "rgba(100, 100, 100, 0.05)",
      borderWidth: 1.5,
      yAxisID: "y1",
      pointRadius: 0,
      tension: 0.1,
    },
  ];

  // Apply dashed line style if enabled
  if (settings.dashedLine) {
    datasets[1].borderDash = [5, 5];
  } else {
    datasets[1].borderDash = [];
  }

  // Chart configuration
  spectrumChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: xData,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.y !== null) {
                label += formatNumber(context.parsed.y);
                if (context.datasetIndex === 0) {
                  label
                } else {
                  label
                }
              }
              return label;
            },
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          type: "linear",
          position: "bottom",
          title: {
            display: true,
            text: settings.xTitle,
            color: "#333",
            font: {
              size: 14,
              weight: "normal",
            },
          },
          grid: {
            color: settings.showGrid ? "rgba(0, 0, 0, 0.1)" : "transparent",
            drawBorder: true,
          },
          ticks: {
            color: "#333",
            maxTicksLimit: 10,
            // Remove "nm" from tick labels as requested
            callback: function (value) {
              return value;
            },
          },
          min: 350,
          max: 800,
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: {
            display: true,
            text: settings.yLeftTitle,
            color: settings.colorMw,
            font: {
              size: 14,
              weight: "normal",
            },
          },
          grid: {
            color: settings.showGrid ? "rgba(0, 0, 0, 0.1)" : "transparent",
            drawBorder: true,
          },
          ticks: {
            color: settings.colorMw,
            callback: function (value) {
              return formatNumber(value);
            },
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: {
            display: true,
            text: settings.yRightTitle,
            color: settings.colorUmol,
            font: {
              size: 14,
              weight: "normal",
            },
          },
          grid: {
            drawOnChartArea: false,
            drawBorder: true,
          },
          ticks: {
            color: settings.colorUmol,
            callback: function (value) {
              return formatNumber(value);
            },
          },
        },
      },
    },
  });
}

// Validate and create chart
function validateAndCreateChart() {
  const mWData = parseData(mWDataTextarea);
  const umolData = parseData(umolDataTextarea);

  if (mWData.length === 0 || umolData.length === 0) {
    // Don't show alert for real-time updates, just don't update the chart
    return;
  }

  if (mWData.length !== umolData.length) {
    // Show warning but still try to create chart with available data
    console.warn(
      "Number of data points in mW·m⁻² and µmol·m⁻²·s⁻¹ datasets do not match"
    );

    // Use the smaller dataset size
    const minLength = Math.min(mWData.length, umolData.length);
    createChart(mWData.slice(0, minLength), umolData.slice(0, minLength));
    return;
  }

  // Validate numerical values
  if (mWData.some(isNaN) || umolData.some(isNaN)) {
    console.error("Data contains invalid numbers");
    return;
  }

  createChart(mWData, umolData);
}

// Update chart with debounce for real-time updates
function updateChart() {
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    initializeSettings();
    validateAndCreateChart();
  }, 300);
}

// Download chart as PNG
function downloadChart() {
  if (!spectrumChart) {
    alert("No chart available to download");
    return;
  }

  const link = document.createElement("a");
  link.download = "light-spectrum-chart.png";
  link.href = spectrumChart.toBase64Image();
  link.click();
}

// Event listeners for real-time updates
mWDataTextarea.addEventListener("input", updateChart);
umolDataTextarea.addEventListener("input", updateChart);

// Event listeners for settings
xTitleInput.addEventListener("input", updateChart);
yLeftTitleInput.addEventListener("input", updateChart);
yRightTitleInput.addEventListener("input", updateChart);
decimalFormatSelect.addEventListener("change", updateChart);
chartHeightInput.addEventListener("input", updateChart);
colorMwInput.addEventListener("input", updateChart);
colorUmolInput.addEventListener("input", updateChart);
dashedLineCheckbox.addEventListener("change", updateChart);
showGridCheckbox.addEventListener("change", updateChart);

// FIX: Special handling for decimal places input - update immediately without debounce
decimalPlacesInput.addEventListener("input", function () {
  settings.decimalPlaces = parseInt(this.value) || 0;
  if (spectrumChart) {
    spectrumChart.update();
  }
});

// Download button
downloadBtn.addEventListener("click", downloadChart);

// Initialize chart on page load
window.addEventListener("DOMContentLoaded", () => {
  initializeSettings();
  setTimeout(() => {
    validateAndCreateChart();
  }, 100);
});

// Controls

const inputdataBtn = document.querySelector('.tool-btn.input-data');
const settingsBtn = document.querySelector('.tool-btn.settings');
const inputdataContainer = document.querySelector('.data-input');
const settingsContainer = document.querySelector('.settings-panel');

inputdataBtn.addEventListener('click', () => {
  inputdataBtn.classList.add('active');
  settingsBtn.classList.remove('active');
  inputdataContainer.classList.remove('none');
  settingsContainer.classList.add('none');
});

settingsBtn.addEventListener('click', () => {
  inputdataBtn.classList.remove('active');
  settingsBtn.classList.add('active');
  inputdataContainer.classList.add('none');
  settingsContainer.classList.remove('none');
});

// Line numbers for textarea

document.querySelectorAll(".editor").forEach((editor) => {
  const textarea = editor.querySelector("textarea");
  const lineNumbers = editor.querySelector(".line-numbers");

  function updateLineNumbers() {
    const start = parseInt(editor.dataset.start || "1", 10);
    const lines = textarea.value.split("\n").length || 1;

    lineNumbers.innerHTML = "";
    for (let i = 0; i < lines; i++) {
      const div = document.createElement("div");
      div.textContent = start + i;
      lineNumbers.appendChild(div);
    }
  }
  textarea.addEventListener("scroll", () => {
    lineNumbers.scrollTop = textarea.scrollTop;
  });
  textarea.addEventListener("input", updateLineNumbers);
  updateLineNumbers();
});