/* ----------  util  ---------- */
/** Buat URLSearchParams yg mendukung nilai array (repeat param) */
function makeParams(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    Array.isArray(v) ? v.forEach(val => p.append(k, val)) : p.append(k, v);
  });
  return p.toString();
}

/* ----------  peta  ---------- */
const map = L.map('map').setView([-2, 117], 5);
// https://leaflet-extras.github.io/leaflet-providers/preview/
// L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: "2025 © OpenStreetMap & Kode Jarwo"
}).addTo(map);

/* ----------  event click  ---------- */
map.on('click', async ({ latlng: { lat, lng } }) => {
  const m = L.marker([lat, lng]).addTo(map)
    .bindPopup('<em>Fetching data...</em>').openPopup();

  const delta = 0.01;
  const bbox = {
    min_lat: lat - delta, max_lat: lat + delta,
    min_lon: lng - delta, max_lon: lng + delta
  };

  /* 1) Siapkan semua fetch secara paralel ------------- */
  const soilSummaryURL = 'https://api.openepi.io/soil/type/summary?' +
    makeParams(bbox);

  const soilPropURL = 'https://api.openepi.io/soil/property?' +
    makeParams({
      lon: lng, lat,
      depths: ['0-5cm', '5-15cm', '5-15cm'],
      properties: ['bdod', 'phh2o', 'nitrogen'],
      values: ['mean', 'mean', 'mean']
    });

  const weatherURL = 'https://api.open-meteo.com/v1/forecast?' +
    makeParams({
      latitude: lat, longitude: lng, current_weather: true
    });

  const elevURL = 'https://api.open-meteo.com/v1/elevation?' +
    makeParams({ latitude: lat, longitude: lng });

  const addressURL = `https://nominatim.openstreetmap.org/reverse?${makeParams({ lat, lon: lng, format: 'json' })}`;

  try {
    const [summaryJSON, propJSON, wxJSON, elevJSON, addressJSON] = await Promise.all([
      fetch(soilSummaryURL).then(r => r.json()),
      fetch(soilPropURL).then(r => r.json()),
      fetch(weatherURL).then(r => r.json()),
      fetch(elevURL).then(r => r.json()),
      fetch(addressURL).then(r => r.json())
    ]);

    /* 2) Ringkasan jenis tanah ------------------------ */
    const summaries = summaryJSON.properties?.summaries || [];
    const soilSummaryHTML = summaries.length
      ? summaries.map(s => `${s.soil_type} (${s.count}%)`).join(', ')
      : 'No data.';

    /* 3) Properti tanah ------------------------------- */
    const layers = propJSON.properties?.layers || [];
    const getLayer = name => layers.find(l => l.name.toLowerCase().includes(name));
    const bdodLayer = getLayer('bdod') || {};
    const nitrogenLayer = getLayer('nitrogen') || {};
    const phLayer = getLayer('ph');
    const bdod = bdodLayer.depths?.[0]?.values?.mean;
    const bdodUnit = bdodLayer.unit_measure?.mapped_units || '';
    const ph = phLayer?.depths?.[1]?.values?.['mean'] ?? 'n/a';
    const phActual = (ph / 10).toFixed(1) ?? 'n/a';
    const nitrogen = nitrogenLayer?.depths?.[1]?.values?.['mean'];
    const nitrogenUnit = nitrogenLayer?.unit_measure?.mapped_units || '';

    let phCategory;
    if (phActual < 4.5) {
      phCategory = "Extreme acidity";
    } else if (phActual < 5.0) {
      phCategory = "Strong acidity";
    } else if (phActual < 5.5) {
      phCategory = "Medium acidity";
    } else if (phActual < 6.0) {
      phCategory = "Slight acidity";
    } else if (phActual < 7.0) {
      phCategory = "Neutral";
    } else if (phActual < 8.0) {
      phCategory = "Slight alkalinity";
    } else if (phActual < 9.0) {
      phCategory = "Strong alkalinity";
    } else if (phActual < 10.0) {
      phCategory = "Extreme alkalinity";
    } else {
      phCategory = "Unknown"
    }

    /* 4) Elevasi dan cuaca ------------------------------ */
    const elev = elevJSON.elevation?.[0] ?? 'n/a';
    const cw = wxJSON.current_weather || {};

    /* 5) Alamat --------------------------------------- */
    const address = addressJSON.display_name || 'Not found';

    /* 6) Tanaman yang cocok --------------------------- */
    const suitablePlants = {
      "Coffee": {
        soilTypes: ["Acrisols", "Nitisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.0, max: 6.0 },
        temp: { min: 20, max: 25 }
      },
      "Rice": {
        soilTypes: ["Fluvisols", "Gleysols", "Planosols"],
        elev: { min: 0, max: 500 },
        ph: { min: 5.0, max: 7.5 },
        temp: { min: 25, max: 30 }
      },
      "Rubber tree": {
        soilTypes: ["Ferralsols", "Nitisols"],
        elev: { min: 0, max: 800 },
        ph: { min: 4.0, max: 6.5 },
        temp: { min: 25, max: 30 }
      },
      "Cocoa": {
        soilTypes: ["Acrisols", "Ferralsols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Corn": {
        soilTypes: ["Albeluvisols", "Luvisols"],
        elev: { min: 0, max: 1500 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Soybean": {
        soilTypes: ["Regosols", "Luvisols"],
        elev: { min: 0, max: 1200 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Mango": {
        soilTypes: ["Acrisols", "Ferralsols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.5, max: 7.5 },
        temp: { min: 25, max: 35 }
      },
      "Bananas": {
        soilTypes: ["Andosols", "Ferralsols"],
        elev: { min: 0, max: 600 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 25, max: 30 }
      },
      "Papaya": {
        soilTypes: ["Acrisols", "Regosols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.0, max: 7.5 },
        temp: { min: 25, max: 35 }
      },
      "Pineapple": {
        soilTypes: ["Arenosols", "Regosols"],
        elev: { min: 0, max: 500 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Chili peppers": {
        soilTypes: ["Luvisols", "Cambisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Avocado": {
        soilTypes: ["Andosols", "Leptosols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Sugarcane": {
        soilTypes: ["Fluvisols", "Gleysols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.0, max: 7.5 },
        temp: { min: 25, max: 35 }
      },
      "Tomato": {
        soilTypes: ["Cambisols", "Luvisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Cassava": {
        soilTypes: ["Acrisols", "Cambisols"],
        elev: { min: 0, max: 1200 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 25, max: 35 }
      },
      "Spinach": {
        soilTypes: ["Acrisols", "Luvisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 6.0, max: 7.5 },
        temp: { min: 15, max: 25 }
      },
      "Eggplant": {
        soilTypes: ["Luvisols", "Regosols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Peanut": {
        soilTypes: ["Arenosols", "Regosols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Taro": {
        soilTypes: ["Gleysols"],
        elev: { min: 0, max: 500 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Bitter melon": {
        soilTypes: ["Acrisols", "Cambisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 5.5, max: 7.5 },
        temp: { min: 25, max: 35 }
      },
      "Sorghum": {
        soilTypes: ["Regosols", "Arenosols"],
        elev: { min: 0, max: 1200 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 25, max: 35 }
      },
      "Barley": {
        soilTypes: ["Regosols", "Andosols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 6.0, max: 7.5 },
        temp: { min: 15, max: 25 }
      },
      "Mint": {
        soilTypes: ["Acrisols", "Cambisols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Zucchini": {
        soilTypes: ["Luvisols", "Cambisols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 6.0, max: 7.5 },
        temp: { min: 20, max: 30 }
      },
      "Lemongrass": {
        soilTypes: ["Acrisols", "Regosols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 35 }
      },
      "Tea": {
        soilTypes: ["Acrisols", "Andosols"],
        elev: { min: 0, max: 2500 },
        ph: { min: 4.5, max: 6.0 },
        temp: { min: 15, max: 25 }
      },
      "Coconut": {
        soilTypes: ["Arenosols", "Regosols"],
        elev: { min: 0, max: 600 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Paprika": {
        soilTypes: ["Luvisols", "Regosols"],
        elev: { min: 0, max: 1000 },
        ph: { min: 6.0, max: 7.5 },
        temp: { min: 20, max: 30 }
      },
      "Kale": {
        soilTypes: ["Loamy soils"],
        elev: { min: 0, max: 1000 },
        ph: { min: 6.0, max: 7.0 },
        temp: { min: 15, max: 25 }
      },
      "Durian": {
        soilTypes: ["Acrisols", "Ferralsols"],
        elev: { min: 0, max: 600 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 25, max: 35 }
      },
      "Jackfruit": {
        soilTypes: ["Acrisols", "Ferralsols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.0, max: 7.5 },
        temp: { min: 25, max: 35 }
      },
      "Kencur": {
        soilTypes: ["Acrisols", "Regosols"],
        elev: { min: 0, max: 800 },
        ph: { min: 5.0, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Ginger": {
        soilTypes: ["Andosols", "Acrisols"],
        elev: { min: 0, max: 600 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
      "Turmeric": {
        soilTypes: ["Acrisols", "Regosols"],
        elev: { min: 0, max: 600 },
        ph: { min: 5.5, max: 7.0 },
        temp: { min: 20, max: 30 }
      },
    };

    const suitablePlantsHTML = Object.entries(suitablePlants).filter(([plant, criteria]) => {
      const isSoilTypeSuitable = summaries.some(s => criteria.soilTypes.includes(s.soil_type));
      const isElevSuitable = (elev >= criteria.elev.min && elev <= criteria.elev.max);
      const isPhSuitable = (ph / 10 >= criteria.ph.min && ph / 10 <= criteria.ph.max);
      const isTempSuitable = (cw.temperature >= criteria.temp.min && cw.temperature <= criteria.temp.max);

      return isSoilTypeSuitable && isElevSuitable && isPhSuitable && isTempSuitable;
    }).map(([plant]) => `${plant}`).join(', ');

    /* 7) Tampilkan popup ------------------------------ */
    m.setPopupContent(`
      <span class="title">Location</span><br>
      ${address}<br><br>

      <span class="title">Coordinate</span><br>
      ${lat.toFixed(5)}, ${lng.toFixed(5)}<br><br>

      <span class="title">Soil type</span><br>
      ${soilSummaryHTML.replace("No_information", "Unknown")}<br><br>

      <span class="title">Suitable Plants</span><br>
      ${suitablePlantsHTML || 'No data'}<br><br>

      <span class="title">Soil property</span><br>
      BDOD: ${bdod ?? 'n/a'} ${bdodUnit}<br>
      Nitrogen: ${nitrogen ?? 'n/a'} ${nitrogenUnit}<br>
      Actual pH: ${phActual ?? 'n/a'} - ${phCategory ?? 'n/a'}<br><br>

      <span class="title">Climate (now)</span><br>
      Temp: ${cw.temperature ?? 'n/a'} °C<br>
      Wind: ${cw.windspeed ?? 'n/a'} km/h<br><br>

      <span class="title">Elevation</span><br>
      ${elev} m
    `);
  } catch (err) {
    console.error(err);
    m.setPopupContent('<span style="color:red">Failed to fetch data!</span>');
  }
});