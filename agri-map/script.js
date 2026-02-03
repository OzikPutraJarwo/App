// Agricultural Map - Sidebar UI with free public APIs
// APIs: Open-Meteo, ISRIC SoilGrids, NASA POWER, OpenStreetMap Nominatim

function makeParams(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    Array.isArray(v) ? v.forEach(val => p.append(k, val)) : p.append(k, v);
  });
  return p.toString();
}

const map = L.map('map').setView([-2, 117], 5);

const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  minZoom: 2,
  maxZoom: 20,
  attribution: `<a href='https://www.kodejarwo.com'><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#ff0000" d="M0 0h12v4H0z"></path><path fill="#FFFFFF" d="M0 4h12v3H0z"></path><path fill="#dfdfdf" d="M0 7h12v1H0z"></path></svg> Ozik Jarwo</a>`
});

const satelliteLayer = L.tileLayer.provider('Esri.WorldImagery', {
  maxZoom: 19
});

const satelliteLabels = L.tileLayer(
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Esri'
  }
);

const baseLayers = {
  Satellite: satelliteLayer,
  Street: streetLayer
};

const overlayLayers = {
  Labels: satelliteLabels
};

satelliteLayer.addTo(map);
satelliteLabels.addTo(map);
L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(map);
map.attributionControl.addAttribution('<a href="https://www.kodejarwo.com" target="_blank" rel="noopener">Ozik Jarwo</a>');

// Sidebar elements
const detailsEl = document.getElementById('point-details');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const pointsListEl = document.getElementById('points-list');
const savePointBtn = document.getElementById('save-point-btn');
const clearPointsBtn = document.getElementById('clear-points-btn');

let activeMarker = null;
let activePoint = null;
let savedPoints = loadSavedPoints();

function loadSavedPoints() {
  try {
    return JSON.parse(localStorage.getItem('agri-map-points')) || [];
  } catch {
    return [];
  }
}

function persistPoints() {
  localStorage.setItem('agri-map-points', JSON.stringify(savedPoints));
  renderPointsList();
}

function renderPointsList() {
  pointsListEl.innerHTML = '';
  if (!savedPoints.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No saved points yet.';
    pointsListEl.appendChild(empty);
    return;
  }

  savedPoints.forEach(point => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.innerHTML = `<strong>${point.name}</strong><br><small>${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</small>`;

    const actions = document.createElement('div');
    const goBtn = document.createElement('button');
    goBtn.textContent = 'Go';
    goBtn.onclick = () => setActivePoint(point, true);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Remove';
    delBtn.onclick = () => {
      savedPoints = savedPoints.filter(p => p.id !== point.id);
      persistPoints();
    };

    const renameBtn = document.createElement('button');
    renameBtn.textContent = 'Rename';
    renameBtn.onclick = () => {
      const nextName = prompt('Rename point', point.name);
      if (!nextName) return;
      point.name = nextName.trim();
      persistPoints();
      if (activePoint && activePoint.id === point.id) {
        activePoint.name = point.name;
      }
    };

    actions.appendChild(goBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    pointsListEl.appendChild(li);
  });
}

function renderSearchResults(results) {
  searchResultsEl.innerHTML = '';
  if (!results.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No results.';
    searchResultsEl.appendChild(empty);
    return;
  }

  results.forEach(result => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = result.display_name;
    btn.style.textAlign = 'left';
    btn.style.width = '100%';
    btn.onclick = () => {
      setActivePoint({
        id: `search-${Date.now()}`,
        name: result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      }, true);
      searchResultsEl.innerHTML = '';
    };
    li.appendChild(btn);
    searchResultsEl.appendChild(li);
  });
}

function renderDetails(state) {
  const row = (label, value) => `
    <div class="detail-row">
      <span class="detail-key">${label}</span>
      <span class="detail-val">${value ?? '<em>Loading...</em>'}</span>
    </div>
  `;

  const advisory = Array.isArray(state.advisory) && state.advisory.length
    ? `<ul class="advisory-list">${state.advisory.map(a => `<li>${a}</li>`).join('')}</ul>`
    : '<em>Loading...</em>';

  detailsEl.innerHTML = `
    <div class="details-hero">
      <div class="hero-metric">
        <span><span class="material-symbols-rounded icon">thermostat</span> ${state.temp ?? '<em>Loading...</em>'}</span>
        <small>${state.tempRange ?? '<em>Loading...</em>'}</small>
      </div>
      <div class="hero-metric">
        <span><span class="material-symbols-rounded icon">water_drop</span> ${state.humidity ?? '<em>Loading...</em>'}</span>
        <small>Rain: ${state.precipSum ?? '<em>Loading...</em>'}</small>
      </div>
      <div class="hero-metric">
        <span><span class="material-symbols-rounded icon">air</span> ${state.wind ?? '<em>Loading...</em>'}</span>
        <small>ET0: ${state.et0 ?? '<em>Loading...</em>'}</small>
      </div>
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">location_on</span>Location</div>
      ${state.location || '<em>Loading...</em>'}<br>
      <small>${state.coords || ''}</small>
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">grass</span>Suitable Plants</div>
      ${state.plants || '<em>Calculating...</em>'}
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">science</span>Soil Property</div>
      ${row('pH', state.ph)}
      ${row('Bulk Density', state.bdod)}
      ${row('Nitrogen', state.nitrogen)}
      ${row('Organic Carbon', state.soc)}
      ${row('CEC', state.cec)}
      ${row('Texture', state.texture)}
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">cloud</span>Climate (now)</div>
      ${row('Temperature', state.temp)}
      ${row('Humidity', state.humidity)}
      ${row('Wind', state.wind)}
      ${row('Pressure', state.pressure)}
      ${row('Cloud Cover', state.cloud)}
      ${row('Precip (now)', state.precipNow)}
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">sunny</span>Agricultural</div>
      ${row('Solar Radiation', state.solar)}
      ${row('GDD', state.gdd)}
      ${row('Soil Moisture', state.soilMoisture)}
      ${row('Soil Temp', state.soilTemp)}
      ${row('ET0', state.et0)}
      ${row('Water Balance', state.waterBalance)}
      ${row('Heat Risk', state.heatRisk)}
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">terrain</span>Elevation</div>
      ${row('Elevation', state.elev)}
      ${row('Temp Range', state.tempRange)}
      ${row('Rain (daily)', state.precipSum)}
    </div>
    <div class="details-section">
      <div class="details-label"><span class="material-symbols-rounded icon">tips_and_updates</span>Advisory</div>
      ${advisory}
    </div>
  `;
}

function getSuitablePlants(temp, elev, ph) {
  const plants = [];

  if (temp >= 26) {
    plants.push('Rice', 'Corn', 'Cassava', 'Palm Oil', 'Rubber');
  } else if (temp >= 20) {
    plants.push('Coffee', 'Cocoa', 'Tea', 'Vegetables', 'Fruits');
  } else if (temp >= 15) {
    plants.push('Wheat', 'Barley', 'Potatoes', 'Carrots', 'Cabbage');
  } else {
    plants.push('Berries', 'Root Vegetables', 'Hardy Grains');
  }

  if (elev > 1000) {
    return ['Coffee', 'Tea', 'Vegetables', 'Potatoes', 'Strawberries'];
  }

  if (elev < 5 && temp > 25) {
    return ['Rice', 'Coconut', 'Sago', 'Banana', 'Aquaculture Crops'];
  }

  if (ph >= 6.0 && ph <= 7.5) {
    plants.push('Tomatoes', 'Lettuce');
  } else if (ph < 5.5) {
    plants.push('Blueberries', 'Pineapple');
  }

  return plants.slice(0, 5);
}

function textureClass(sand, silt, clay) {
  const s = parseFloat(sand);
  const si = parseFloat(silt);
  const c = parseFloat(clay);
  if ([s, si, c].some(v => Number.isNaN(v))) return 'Unknown';
  if (c >= 40) return 'Clay';
  if (s >= 70) return 'Sand';
  if (si >= 80) return 'Silt';
  if (c >= 27 && s <= 45) return 'Clay Loam';
  if (s >= 43) return 'Sandy Loam';
  if (si >= 50) return 'Silt Loam';
  return 'Loam';
}

function buildAdvisory(state) {
  const notes = [];
  const temp = parseFloat((state.temp || '').replace('°C', ''));
  const humidity = parseFloat((state.humidity || '').replace('%', ''));
  const precipSum = parseFloat((state.precipSum || '').replace(' mm', ''));
  const et0 = parseFloat((state.et0 || '').replace(' mm', ''));
  const moisture = parseFloat((state.soilMoisture || '').replace(' m³/m³', ''));

  if (!Number.isNaN(et0) && !Number.isNaN(precipSum)) {
    if (precipSum < et0) notes.push('Potential water deficit today; consider irrigation.');
    else notes.push('Rainfall likely offsets evapotranspiration today.');
  }
  if (!Number.isNaN(temp) && temp >= 35) notes.push('Heat stress risk is high; monitor crop wilting.');
  if (!Number.isNaN(humidity) && humidity > 85) notes.push('High humidity may increase disease pressure.');
  if (!Number.isNaN(moisture) && moisture < 0.15) notes.push('Soil moisture is low; irrigation may be needed.');
  if (state.ph && state.ph.includes('Strong acidity')) notes.push('Soil is acidic; lime application may be beneficial.');
  if (!notes.length) notes.push('No specific risks detected from available data.');
  return notes;
}

function setActivePoint(point, fly) {
  activePoint = point;
  if (activeMarker) {
    map.removeLayer(activeMarker);
  }
  activeMarker = L.marker([point.lat, point.lng]).addTo(map);
  if (fly) {
    map.flyTo([point.lat, point.lng], 13, { duration: 1.1 });
  }

  autoSavePoint(point);

  const baseState = {
    location: point.name || 'Dropped Pin',
    coords: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    plants: '<em>Calculating...</em>',
    ph: '<em>Loading...</em>',
    bdod: '<em>Loading...</em>',
    nitrogen: '<em>Loading...</em>',
    soc: '<em>Loading...</em>',
    cec: '<em>Loading...</em>',
    texture: '<em>Loading...</em>',
    temp: '<em>Loading...</em>',
    wind: '<em>Loading...</em>',
    humidity: '<em>Loading...</em>',
    pressure: '<em>Loading...</em>',
    cloud: '<em>Loading...</em>',
    precipNow: '<em>Loading...</em>',
    solar: '<em>Loading...</em>',
    gdd: '<em>Loading...</em>',
    soilMoisture: '<em>Loading...</em>',
    soilTemp: '<em>Loading...</em>',
    et0: '<em>Loading...</em>',
    waterBalance: '<em>Loading...</em>',
    heatRisk: '<em>Loading...</em>',
    elev: '<em>Loading...</em>'
    ,tempRange: '<em>Loading...</em>'
    ,precipSum: '<em>Loading...</em>'
    ,advisory: []
  };

  renderDetails(baseState);
  fetchPointData(point, baseState);
}

function autoSavePoint(point) {
  const exists = savedPoints.some(p => p.lat === point.lat && p.lng === point.lng);
  if (!exists) {
    savedPoints.unshift({
      id: point.id || `point-${Date.now()}`,
      name: point.name || 'Dropped Pin',
      lat: point.lat,
      lng: point.lng
    });
    persistPoints();
  }
}

async function fetchPointData(point, state) {
  const weatherURL = 'https://api.open-meteo.com/v1/forecast?' +
    makeParams({
      latitude: point.lat,
      longitude: point.lng,
      current: ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'pressure_msl', 'cloud_cover', 'precipitation'],
      hourly: ['soil_temperature_0cm', 'soil_moisture_0_to_7cm'],
      daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'et0_fao_evapotranspiration'],
      timezone: 'auto',
      forecast_days: 1
    });

  const elevURL = 'https://api.open-meteo.com/v1/elevation?' +
    makeParams({ latitude: point.lat, longitude: point.lng });

  const addressURL = `https://nominatim.openstreetmap.org/reverse?${makeParams({
    lat: point.lat,
    lon: point.lng,
    format: 'json'
  })}`;

  const soilGridsURL = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${point.lng}&lat=${point.lat}` +
    `&property=phh2o&property=bdod&property=nitrogen&property=soc&property=cec&property=clay&property=sand&property=silt` +
    `&depth=0-5cm&value=mean`;

  const nasaPowerURL = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN,T2M_MAX,T2M_MIN&community=AG&longitude=${point.lng}&latitude=${point.lat}&start=20260101&end=20260101&format=JSON`;

  try {
    const [wxJSON, elevJSON, addressJSON] = await Promise.all([
      fetch(weatherURL).then(r => r.json()).catch(() => ({})),
      fetch(elevURL).then(r => r.json()).catch(() => ({})),
      fetch(addressURL).then(r => r.json()).catch(() => ({}))
    ]);

    const cw = wxJSON.current || {};
    const hourly = wxJSON.hourly || {};
    const daily = wxJSON.daily || {};
    const elev = elevJSON.elevation?.[0] ?? 'No data';
    const address = addressJSON.display_name || point.name || 'Dropped Pin';

    const tempValue = cw.temperature_2m ?? 26;
    const elevValue = elev !== 'No data' ? elev : 0;

    state.location = address;
    state.temp = cw.temperature_2m != null ? `${cw.temperature_2m}°C` : 'No data';
    state.wind = cw.wind_speed_10m != null ? `${cw.wind_speed_10m} km/h` : 'No data';
    state.humidity = cw.relative_humidity_2m != null ? `${cw.relative_humidity_2m}%` : 'No data';
    state.pressure = cw.pressure_msl != null ? `${cw.pressure_msl} hPa` : 'No data';
    state.cloud = cw.cloud_cover != null ? `${cw.cloud_cover}%` : 'No data';
    state.precipNow = cw.precipitation != null ? `${cw.precipitation} mm` : 'No data';
    state.elev = elev !== 'No data' ? `${elev} m` : 'No data';
    state.soilMoisture = hourly.soil_moisture_0_to_7cm?.[0] != null
      ? `${hourly.soil_moisture_0_to_7cm[0]} m³/m³`
      : 'No data';
    state.soilTemp = hourly.soil_temperature_0cm?.[0] != null
      ? `${hourly.soil_temperature_0cm[0]}°C`
      : 'No data';

    const tMin = daily.temperature_2m_min?.[0];
    const tMax = daily.temperature_2m_max?.[0];
    state.tempRange = tMin != null && tMax != null ? `${tMin.toFixed(1)}°C - ${tMax.toFixed(1)}°C` : 'No data';
    const precipSum = daily.precipitation_sum?.[0];
    state.precipSum = precipSum != null ? `${precipSum} mm` : 'No data';
    const et0 = daily.et0_fao_evapotranspiration?.[0];
    state.et0 = et0 != null ? `${et0} mm` : 'No data';
    if (et0 != null && precipSum != null) {
      const balance = (precipSum - et0).toFixed(1);
      state.waterBalance = `${balance} mm`;
    }

    state.heatRisk = tMax != null
      ? (tMax >= 35 ? 'High' : tMax >= 30 ? 'Moderate' : 'Low')
      : 'No data';

    state.plants = getSuitablePlants(tempValue, elevValue, 6.5).join(', ');
    state.advisory = buildAdvisory(state);
    renderDetails(state);

    fetch(soilGridsURL)
      .then(r => r.json())
      .then(soilJSON => {
        const layers = soilJSON?.properties?.layers || [];
        const phLayer = layers.find(l => l.name === 'phh2o');
        const bdodLayer = layers.find(l => l.name === 'bdod');
        const nitrogenLayer = layers.find(l => l.name === 'nitrogen');
        const socLayer = layers.find(l => l.name === 'soc');
        const cecLayer = layers.find(l => l.name === 'cec');
        const clayLayer = layers.find(l => l.name === 'clay');
        const sandLayer = layers.find(l => l.name === 'sand');
        const siltLayer = layers.find(l => l.name === 'silt');

        const ph = phLayer?.depths?.[0]?.values?.mean;
        const phActual = ph ? (ph / 10).toFixed(1) : null;
        let phCategory = 'Unknown';
        if (phActual) {
          if (phActual < 4.5) phCategory = 'Extreme acidity';
          else if (phActual < 5.0) phCategory = 'Strong acidity';
          else if (phActual < 5.5) phCategory = 'Medium acidity';
          else if (phActual < 6.0) phCategory = 'Slight acidity';
          else if (phActual < 7.0) phCategory = 'Neutral';
          else if (phActual < 8.0) phCategory = 'Slight alkalinity';
          else if (phActual < 9.0) phCategory = 'Strong alkalinity';
          else phCategory = 'Extreme alkalinity';
        }

        state.ph = phActual ? `${phActual} (${phCategory})` : 'No data';
        state.bdod = bdodLayer?.depths?.[0]?.values?.mean
          ? `${(bdodLayer.depths[0].values.mean / 100).toFixed(2)} cg/cm³`
          : 'No data';
        state.nitrogen = nitrogenLayer?.depths?.[0]?.values?.mean
          ? `${(nitrogenLayer.depths[0].values.mean / 100).toFixed(2)} cg/kg`
          : 'No data';
        state.soc = socLayer?.depths?.[0]?.values?.mean
          ? `${(socLayer.depths[0].values.mean / 10).toFixed(1)} dg/kg`
          : 'No data';
        state.cec = cecLayer?.depths?.[0]?.values?.mean
          ? `${(cecLayer.depths[0].values.mean / 10).toFixed(1)} cmol/kg`
          : 'No data';

        const clay = clayLayer?.depths?.[0]?.values?.mean;
        const sand = sandLayer?.depths?.[0]?.values?.mean;
        const silt = siltLayer?.depths?.[0]?.values?.mean;
        if (clay != null && sand != null && silt != null) {
          const clayPct = (clay / 10).toFixed(1);
          const sandPct = (sand / 10).toFixed(1);
          const siltPct = (silt / 10).toFixed(1);
          state.texture = `${textureClass(sandPct, siltPct, clayPct)} (${sandPct}% sand, ${siltPct}% silt, ${clayPct}% clay)`;
        } else {
          state.texture = 'No data';
        }

        const phValue = phActual ? parseFloat(phActual) : 6.5;
        state.plants = getSuitablePlants(tempValue, elevValue, phValue).join(', ');
        state.advisory = buildAdvisory(state);
        renderDetails(state);
      })
      .catch(() => {
        state.ph = 'No data';
        state.bdod = 'No data';
        state.nitrogen = 'No data';
        state.soc = 'No data';
        state.cec = 'No data';
        state.texture = 'No data';
        renderDetails(state);
      });

    fetch(nasaPowerURL)
      .then(r => r.json())
      .then(nasaJSON => {
        const params = nasaJSON?.properties?.parameter || {};
        const dates = Object.keys(params.ALLSKY_SFC_SW_DWN || {});
        if (dates.length) {
          const date = dates[0];
          const solar = params.ALLSKY_SFC_SW_DWN?.[date];
          const tMax = params.T2M_MAX?.[date] ?? 0;
          const tMin = params.T2M_MIN?.[date] ?? 0;
          const avgTemp = (tMax + tMin) / 2;
          state.solar = solar != null ? `${solar} kWh/m²/day` : 'No data';
          state.gdd = avgTemp > 10 ? `${(avgTemp - 10).toFixed(1)} GDD` : 'Below threshold';
          renderDetails(state);
        }
      })
      .catch(() => {
        state.solar = 'No data';
        state.gdd = 'No data';
        renderDetails(state);
      });
  } catch (err) {
    console.error(err);
  }
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const url = `https://nominatim.openstreetmap.org/search?${makeParams({
    q: query,
    format: 'json',
    addressdetails: 1,
    limit: 6
  })}`;

  try {
    const results = await fetch(url).then(r => r.json());
    renderSearchResults(results);
  } catch {
    renderSearchResults([]);
  }
});

savePointBtn.addEventListener('click', () => {
  if (!activePoint) return;
  const nextName = prompt('Rename point', activePoint.name || 'Dropped Pin');
  if (!nextName) return;
  activePoint.name = nextName.trim();
  const existing = savedPoints.find(p => p.lat === activePoint.lat && p.lng === activePoint.lng);
  if (existing) {
    existing.name = activePoint.name;
  } else {
    savedPoints.unshift({
      id: activePoint.id || `point-${Date.now()}`,
      name: activePoint.name,
      lat: activePoint.lat,
      lng: activePoint.lng
    });
  }
  persistPoints();
});

clearPointsBtn.addEventListener('click', () => {
  savedPoints = [];
  persistPoints();
});

map.on('click', ({ latlng }) => {
  setActivePoint({
    id: `pin-${Date.now()}`,
    name: 'Dropped Pin',
    lat: latlng.lat,
    lng: latlng.lng
  }, false);
});

renderPointsList();