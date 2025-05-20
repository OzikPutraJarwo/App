let values;

function countChart(outer, svgPoint, c_tdb = null, c_hra = null) {
  const bbox = outer.getBBox();
  let xPercent = ((svgPoint.x - bbox.x) / bbox.width);
  let yPercent = 1 - ((svgPoint.y - bbox.y) / bbox.height);

  let

  tdb = c_tdb !== null ? c_tdb : 60 * xPercent - 10;
  hra = c_hra !== null ? c_hra : 30 * yPercent

  tdbk = (tdb + 273.15)
  hrag = (hra * 0.001)

  patm = 101.325
  par = patm * 1000
  ent = 1.006 * tdb + (hra * 0.001) * (2501 + 1.86 * tdb)

  pw = (hra * patm) / (0.622 + hrag)
  pws = 0.61078 * Math.exp((17.27 * tdb) / (tdb + 237.3))
  rhu = pw / pws * 0.096

  a = 611.2
  b = 17.67
  c = 243.5
  tde = (c * Math.log(pw / a)) / (b - Math.log(pw / a))
  tsa = Math.abs((c * Math.log(pw / a)) / (b - Math.log(pw / a)))

  svo = 0.2871 * tdbk * (1 + 1.6078 * hrag) / patm

  twb = tdb * Math.atan(0.151977 * Math.sqrt(rhu + 8.313659)) + Math.atan(tdb + rhu) - Math.atan(rhu - 1.676331) + 0.00391838 * Math.pow(rhu, 1.5) * Math.atan(0.023101 * rhu) - 4.686035;

  pva = (hrag * par) / (0.622 + hrag)
  psv = 610.94 * Math.exp((17.625 * tdb) / (tdb + 243.04))
  she = 1.006 + (hrag * 1.86)
  den = (par / (287 * tdbk)) * (1 + hrag) * (1 - (pw / par))

  ;

  if (rhu > 80) {
    rhu = rhu - 1
  }
  if (rhu > 100) {
    rhu = rhu - 1
  }
  if (rhu < 0) {
    rhu = 0
  }

  if (tdb > 50 || tdb < -10 || hra > 30 || hra < 0 || rhu > 100) {
    document.querySelector('.cursor-marker').classList.add('hidemore');
    return
  } else {
    document.querySelector('.cursor-marker').classList.remove('hidemore');
  }

  values = {
    par: {v1: par, v2: "Pa"},
    tdb: {v1: tdb.toFixed(2), v2: "°C"},
    hra: {v1: hra.toFixed(2), v2: "g/kg"},
    rhu: {v1: rhu.toFixed(0), v2: "%"},
    twb: {v1: twb.toFixed(2), v2: "°C"},
    tde: {v1: tde.toFixed(2), v2: "°C"},
    // tsa: {v1: tsa.toFixed(2), v2: "°C"},
    ent: {v1: ent.toFixed(2), v2: "kJ/kg"},
    pva: {v1: pva.toFixed(2), v2: "Pa"},
    psv: {v1: psv.toFixed(2), v2: "Pa"},
    she: {v1: she.toFixed(2), v2: "kJ/(kg.K)"},
    svo: {v1: svo.toFixed(2), v2: "m³/kg"},
    den: {v1: den.toFixed(2), v2: "kg/m³"}
  };

    Object.entries(values).forEach(([key, val]) => {
      const el = document.querySelector(`.${key}`);
      if (el) el.innerHTML = val.v1;
      if (el) el.nextElementSibling.innerHTML = val.v2;
    });
};

document.querySelector('.chart svg').addEventListener('mousemove', function (event) {
  const outerLine = document.querySelector('.outer-line');
  const boundingRect = this.getBoundingClientRect();

  const scaleX = this.viewBox.baseVal.width / boundingRect.width;
  const scaleY = this.viewBox.baseVal.height / boundingRect.height;

  const x = (event.clientX - boundingRect.left) * scaleX;
  const y = (event.clientY - boundingRect.top) * scaleY;

  countChart(outerLine, { x, y });
  const dot = document.querySelector(".cursor-marker");
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
  dot.setAttribute("r", 3);
});

document.querySelector('.chart svg').addEventListener('mouseenter', function () {
  const dot = document.querySelector(".cursor-marker");
  dot.classList.remove('hide');
});

document.querySelector('.chart svg').addEventListener('mouseleave', function () {
  const dot = document.querySelector(".cursor-marker");
  dot.classList.add('hide');
});

document.querySelector('.cursor-marker').addEventListener('click', function (event) {
  const svg = event.currentTarget.ownerSVGElement;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", svgPoint.x);
  dot.setAttribute("cy", svgPoint.y);
  dot.setAttribute("r", 3);
  dot.setAttribute("data-info", JSON.stringify(values));
  const mar = svg.querySelector("[name='marker']");
  mar.appendChild(dot);
});

const svgRoot = document.querySelector(".chart svg");
const PADDING = 10;

svgRoot.addEventListener("click", (e) => {
  const circle = e.target.closest("circle[data-info]");
  if (!circle) return;

  document.querySelector(".marker-popup")?.remove();

  svgRoot.querySelectorAll("circle[data-info].active").forEach(c => c.classList.remove("active"));
  circle.classList.add("active");

  let raw = circle.getAttribute("data-info");
  if (raw.startsWith("{'")) raw = raw.replace(/'/g, '"');
  const data = JSON.parse(raw);

  const popup = document.createElement("div");
  popup.className = "marker-popup";
  popup.innerHTML = `
  <div style="text-align: right;">
    <button class="popup-close" style="border:none; background:none; font-size:16px; cursor:pointer;">&times;</button>
  </div>
  ${Object.entries(data)
      .map(([k, v]) => `<div><b>${k.toUpperCase()}</b><span>:</span> <span>${v.v1}</span> <span>${v.v2}</span></div>`)
      .join("")}
`;

  popup.querySelector(".popup-close").addEventListener("click", () => {
    popup.remove();
    svgRoot.querySelectorAll("circle[data-info].active").forEach(c => c.classList.remove("active"));
  });

  document.querySelector('.chart').appendChild(popup);

  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;

  const cRect = circle.getBoundingClientRect();
  const pRect = popup.getBoundingClientRect();
  const svgRect = svgRoot.getBoundingClientRect();

  let left = cRect.left + cRect.width / 2 - pRect.width / 2;
  let top = cRect.top - pRect.height - PADDING;
  let pos = "above";

  const minL = svgRect.left + PADDING;
  const maxL = svgRect.right - pRect.width - PADDING;

  if (left < minL) left = minL;
  if (left > maxL) left = maxL;

  const minT = svgRect.top + PADDING;
  const maxT = svgRect.bottom - pRect.height - PADDING;

  if (top < minT) {
    top = cRect.bottom + PADDING;
    pos = "below";
  }
  if (top > maxT) {
    top = maxT;
  }

  popup.dataset.pos = pos;
  popup.style.left = `${left + scrollX}px`;
  popup.style.top = `${top + scrollY}px`;
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const chartContainer = document.querySelector(".chart");
  html2canvas(chartContainer, {
    backgroundColor: null,
    scale: 2
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = "chart.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
});

const options = {
  tdb: ["hra"],
  tdb: ["hra", "ent", "rhu", "tde"],
  hra: ["tdb"],
  ent: ["tdb", "rhu"],
  rhu: ["tdb", "ent", "tde"],
  tde: ["tdb", "rhu"]
};

const customLabels = {
  tdb: "Temperature Dry Bulb",
  hra: "Absolute Humidity",
  ent: "Enthalpy",
  rhu: "Relative Humidity",
  tde: "Temperature Dew"
};

function updateOptions() {
  const select1 = document.getElementById("select-first-param");
  const select1Input = select1.nextElementSibling?.lastElementChild;
  const select2 = document.getElementById("select-second-param");
  const selectedValue = select1.value;

  select2.innerHTML = '';

  if (selectedValue) {
    const availableOptions = options[selectedValue];
    availableOptions.forEach(option => {
      const newOption = document.createElement("option");
      newOption.value = option;
      newOption.textContent = customLabels[option];
      select2.appendChild(newOption);
    });
  } else {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Silahkan pilih opsi 1 terlebih dahulu";
    select2.appendChild(defaultOption);
  }

  if (selectedValue == "tdb") {
    select1Input.value = "°C";
  } else if (selectedValue == "hra") {
    select1Input.value = "g/kg"
  } else if (selectedValue == "ent") {
    select1Input.value = "kJ/kg"
  } else if (selectedValue == "rhu") {
    select1Input.value = "%"
  } else if (selectedValue == "tde") {
    select1Input.value = "°C";
  }

};

function updateSecondUnit() {
  const select2 = document.getElementById("select-second-param");
  const select2Input = document.getElementById("select-second-unit");
  const selectedValue2 = select2.value;
  if (selectedValue2 == "tdb") {
    select2Input.value = "°C";
  } else if (selectedValue2 == "hra") {
    select2Input.value = "g/kg"
  } else if (selectedValue2 == "ent") {
    select2Input.value = "kJ/kg"
  } else if (selectedValue2 == "rhu") {
    select2Input.value = "%"
  } else if (selectedValue2 == "tde") {
    select2Input.value = "°C";
  }
}

function submitCustom() {
  const select1 = document.getElementById("select-first-param");
  const select1Input = document.getElementById("first-param");
  const select2 = document.getElementById("select-second-param");
  const select2Input = document.getElementById("second-param");
  const selectedValue1 = select1.value;
  const selectedValue2 = select2.value;

  let select1Number = Number(select1Input.value);
  let select2Number = Number(select2Input.value);

  let v_tdb, v_hra;

  if (selectedValue1 == "tdb" && selectedValue2 == "hra") {
    v_tdb = Number(select1Input.value);
    v_hra = Number(select2Input.value);
  } else if (selectedValue1 == "tdb" && selectedValue2 == "ent") {
    function calculateHRA(tdb, ent) {
      const numerator = ent - (1.006 * tdb);
      const denominator = 2501 + (1.86 * tdb);
      const hra = (numerator / denominator) * 1000;
      return hra
    }
    const tdb = select1Number;
    const ent = select2Number;
    v_tdb = Number(select1Input.value);
    v_hra = Number(calculateHRA(tdb, ent));
  } else if (selectedValue1 == "tdb" && selectedValue2 == "rhu") {
    v_tdb = Number(select1Input.value);
    v_hra = (select2Number * 0.61078 * Math.exp((17.27 * select1Number) / (select1Number + 237.3)) * 0.622) / (0.096 * 101.325 - select2Number * 0.61078 * Math.exp((17.27 * select1Number) / (select1Number + 237.3)) * 0.001);
  } else if (selectedValue1 == "tdb" && selectedValue2 == "tde") {
    v_tdb = Number(select1Input.value);
    function findHRA(targetTDE) {
      const patm = 101.325;
      const a = 611.2;
      const b = 17.67;
      const c = 243.5;
      let hra = 0;
      let step = 0.01;
      let maxIter = 10000;
      let tolerance = 0.0001;
      let iter = 0;
      while (iter < maxIter) {
        const hrag = hra * 0.001;
        const pw = (hra * patm) / (0.622 + hrag);
        const logRatio = Math.log(pw / a);
        const tde = (c * logRatio) / (b - logRatio);
        if (Math.abs(tde - targetTDE) < tolerance) {
          return hra;
        }
        hra += step;
        iter++;
      }
      throw new Error("HRA not found within iteration limit.");
    }
    v_hra = findHRA(select2Number);
    console.log(v_hra)
  }

  if (selectedValue1 == "hra" && selectedValue2 == "tdb") {
    v_hra = Number(select1Input.value);
    v_tdb = Number(select2Input.value);
  }

  if (selectedValue1 == "ent" && selectedValue2 == "tdb") {
    function calculateHRA(tdb, ent) {
      const numerator = ent - (1.006 * tdb);
      const denominator = 2501 + (1.86 * tdb);
      const hra = (numerator / denominator) * 1000;
      return hra
    }
    const tdb = select2Number;
    const ent = select1Number;
    v_tdb = Number(select2Input.value);
    v_hra = Number(calculateHRA(tdb, ent));
  } else if (selectedValue1 == "ent" && selectedValue2 == "rhu") {
    function findTdbAndHra(targetEnt, targetRhu) {
      const patm = 101.325;
      let bestError = Infinity;
      let bestTdb = null;
      let bestHra = null;
      for (let tdb = 0; tdb <= 50; tdb += 0.1) {
        for (let hra = 0; hra <= 30; hra += 0.1) {
          const hrag = hra * 0.001;
          const pw = (hra * patm) / (0.622 + hrag);
          const pws = 0.61078 * Math.exp((17.27 * tdb) / (tdb + 237.3));
          const rhu = (pw / pws) * 0.096;
          const ent = 1.006 * tdb + hrag * (2501 + 1.86 * tdb);
          const errEnt = Math.abs(ent - targetEnt);
          const errRhu = Math.abs(rhu - targetRhu);
          const totalError = errEnt + errRhu;
          if (totalError < bestError) {
            bestError = totalError;
            bestTdb = tdb;
            bestHra = hra;
          }
        }
      }
      return {
        tdb: bestTdb.toFixed(4),
        hra: bestHra.toFixed(4),
        error: bestError.toFixed(6)
      };
    }
    const result = findTdbAndHra(Number(select1Input.value), Number(select2Input.value));
    v_tdb = Number(result.tdb);
    v_hra = Number(result.hra);
  }

  if (selectedValue1 == "rhu" && selectedValue2 == "tdb") {
    v_tdb = Number(select2Input.value);
    v_hra = (select1Number * 0.61078 * Math.exp((17.27 * select2Number) / (select2Number + 237.3)) * 0.622) / (0.096 * 101.325 - select1Number * 0.61078 * Math.exp((17.27 * select2Number) / (select2Number + 237.3)) * 0.001);
  } else if (selectedValue1 == "rhu" && selectedValue2 == "ent") {
    [select1Number, select2Number] = [select2Number, select1Number];
    function findTdbAndHra(targetEnt, targetRhu) {
      const patm = 101.325;
      let bestError = Infinity;
      let bestTdb = null;
      let bestHra = null;
      for (let tdb = 0; tdb <= 50; tdb += 0.1) {
        for (let hra = 0; hra <= 30; hra += 0.1) {
          const hrag = hra * 0.001;
          const pw = (hra * patm) / (0.622 + hrag);
          const pws = 0.61078 * Math.exp((17.27 * tdb) / (tdb + 237.3));
          const rhu = (pw / pws) * 0.096;
          const ent = 1.006 * tdb + hrag * (2501 + 1.86 * tdb);
          const errEnt = Math.abs(ent - targetEnt);
          const errRhu = Math.abs(rhu - targetRhu);
          const totalError = errEnt + errRhu;
          if (totalError < bestError) {
            bestError = totalError;
            bestTdb = tdb;
            bestHra = hra;
          }
        }
      }
      return {
        tdb: bestTdb.toFixed(4),
        hra: bestHra.toFixed(4),
        error: bestError.toFixed(6)
      };
    }
    const result = findTdbAndHra(select1Number, select2Number);
    v_tdb = Number(result.tdb);
    v_hra = Number(result.hra);
  } else if (selectedValue1 == "rhu" && selectedValue2 == "tde") {
    function findTdbAndHraFromRhuTde(targetRhu, targetTde) {
      const patm = 101.325;
      const a = 611.2;
      const b = 17.67;
      const c = 243.5;
      let bestError = Infinity;
      let bestTdb = null;
      let bestHra = null;
      for (let tdb = 0; tdb <= 50; tdb += 0.1) {
        for (let hra = 0.1; hra <= 30; hra += 0.1) {
          const hrag = hra * 0.001;
          const pw = (hra * patm) / (0.622 + hrag);
          const logPwOverA = Math.log(pw / a);
          const tde = (c * logPwOverA) / (b - logPwOverA);
          const pws = 0.61078 * Math.exp((17.27 * tdb) / (tdb + 237.3));
          const rhu = (pw / pws) * 0.096;
          const errTde = Math.abs(tde - targetTde);
          const errRhu = Math.abs(rhu - targetRhu);
          const totalError = errTde + errRhu;
          if (totalError < bestError) {
            bestError = totalError;
            bestTdb = tdb;
            bestHra = hra;
          }
        }
      }
      return {
        tdb: bestTdb.toFixed(4),
        hra: bestHra.toFixed(4),
        error: bestError.toFixed(6)
      };
    }
    const rhu = select1Number;
    const tde = select2Number;
    const result = findTdbAndHraFromRhuTde(rhu, tde);
    v_tdb = Number(result.tdb);
    v_hra = Number(result.hra);
  }

  if (selectedValue1 == "tde" && selectedValue2 == "tdb") {
    v_tdb = select2Number;
    function findHRA(targetTDE) {
      const patm = 101.325;
      const a = 611.2;
      const b = 17.67;
      const c = 243.5;
      let hra = 0;
      let step = 0.01;
      let maxIter = 10000;
      let tolerance = 0.0001;
      let iter = 0;
      while (iter < maxIter) {
        const hrag = hra * 0.001;
        const pw = (hra * patm) / (0.622 + hrag);
        const logRatio = Math.log(pw / a);
        const tde = (c * logRatio) / (b - logRatio);
        if (Math.abs(tde - targetTDE) < tolerance) {
          return hra;
        }
        hra += step;
        iter++;
      }
      throw new Error("HRA not found within iteration limit.");
    }
    v_hra = findHRA(select1Number);
  } else if (selectedValue1 == "tde" && selectedValue2 == "rhu") {
    function findTdbAndHraFromRhuTde(targetRhu, targetTde) {
      const patm = 101.325;
      const a = 611.2;
      const b = 17.67;
      const c = 243.5;
      let bestError = Infinity;
      let bestTdb = null;
      let bestHra = null;
      for (let tdb = 0; tdb <= 50; tdb += 0.1) {
        for (let hra = 0.1; hra <= 30; hra += 0.1) {
          const hrag = hra * 0.001;
          const pw = (hra * patm) / (0.622 + hrag);
          const logPwOverA = Math.log(pw / a);
          const tde = (c * logPwOverA) / (b - logPwOverA);
          const pws = 0.61078 * Math.exp((17.27 * tdb) / (tdb + 237.3));
          const rhu = (pw / pws) * 0.096;
          const errTde = Math.abs(tde - targetTde);
          const errRhu = Math.abs(rhu - targetRhu);
          const totalError = errTde + errRhu;
          if (totalError < bestError) {
            bestError = totalError;
            bestTdb = tdb;
            bestHra = hra;
          }
        }
      }
      return {
        tdb: bestTdb.toFixed(4),
        hra: bestHra.toFixed(4),
        error: bestError.toFixed(6)
      };
    }
    const rhu = select2Number;
    const tde = select1Number;
    const result = findTdbAndHraFromRhuTde(rhu, tde);
    v_tdb = Number(result.tdb);
    v_hra = Number(result.hra);
  }

  const outerLine = document.querySelector('.outer-line');
  countChart(outerLine, svgPoint = 0, c_tdb = v_tdb, c_hra = v_hra);

  const svg = document.querySelector('.chart svg');
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", (12.710000000000002 * v_tdb + 194.20000000000002));
  dot.setAttribute("cy", (-17.933000000000003 * v_hra + 589));
  dot.setAttribute("r", 3);
  dot.setAttribute("data-info", JSON.stringify(values));
  const mar = svg.querySelector("[name='marker']");
  mar.appendChild(dot);
}

const btnInfo = document.querySelector('#infoBtn');
const contentInfo = document.querySelector('.help');
btnInfo.addEventListener('click', () => {
  if (contentInfo.style.display === "block") {
    contentInfo.style.height = contentInfo.scrollHeight + 'px';
    setTimeout(() => {
      contentInfo.style.height = '0';
    }, 10);
    setTimeout(() => {
      contentInfo.style.display = 'none';
    }, 150);
  } else {
    contentInfo.style.display = 'block';
    contentInfo.style.height = '0';
    setTimeout(() => {
      contentInfo.style.height = contentInfo.scrollHeight + 'px';
    }, 10);
  }
});

// Created with love by Ozik Jarwo, 2025. Full of battle, mixed with reversed engineering.