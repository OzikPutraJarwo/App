let values;

function countChart(outer, svgPoint) {
  const bbox = outer.getBBox();
  const xPercent = ((svgPoint.x - bbox.x) / bbox.width);
  const yPercent = 1 - ((svgPoint.y - bbox.y) / bbox.height);

  let

  tdb = 60 * xPercent - 10
  hra = 30 * yPercent

  tdbk = (tdb + 273.15)
  hrag = (hra * 0.001)

  patm = 101.325
  par = patm * 1000
  ent = 1.006 * tdb + hrag * (2501 + 1.86 * tdb)

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

  values = {
    par,
    tdb: tdb.toFixed(2),
    hra: hra.toFixed(2),
    rhu: rhu.toFixed(0),
    twb: twb.toFixed(2),
    tde: tde.toFixed(2),
    tsa: tsa.toFixed(2),
    ent: ent.toFixed(2),
    pva: pva.toFixed(2),
    psv: psv.toFixed(2),
    she: she.toFixed(2),
    svo: svo.toFixed(2),
    den: den.toFixed(2),
  };

  Object.entries(values).forEach(([key, val]) => {
    const el = document.querySelector(`.${key}`);
    if (el) el.innerHTML = val;
  });
};

document.querySelector('.outer-line').addEventListener('mousemove', function (event) {
  const svg = event.currentTarget.ownerSVGElement;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
  countChart(this, svgPoint);
  const dot = document.querySelector(".cursor-marker");
  dot.classList.remove('hide');
  dot.setAttribute("cx", svgPoint.x);
  dot.setAttribute("cy", svgPoint.y);
  dot.setAttribute("r", 3);
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

document.querySelector('.chart svg').addEventListener('mouseenter', function () {
  const dot = document.querySelector(".cursor-marker");
  dot.classList.remove('hide');
});

document.querySelector('.chart svg').addEventListener('mouseleave', function () {
  const dot = document.querySelector(".cursor-marker");
  dot.classList.add('hide');
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
      .map(([k, v]) => `<div><strong>${k.toUpperCase()}</strong>: ${v}</div>`)
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
