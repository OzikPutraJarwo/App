function makeParams(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    Array.isArray(v) ? v.forEach(val => p.append(k, val)) : p.append(k, v);
  });
  return p.toString();
}

const map = L.map('map').setView([-2, 117], 5);

var control = L.control.geonames({
  // username: 'ozikjarwo'
  username: 'cbi.test'
});
map.addControl(control);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  minZoom: 2,
  maxZoom: 20,
  attribution: `<a href='https://www.kodejarwo.com'><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#ff0000" d="M0 0h12v4H0z"></path><path fill="#FFFFFF" d="M0 4h12v3H0z"></path><path fill="#dfdfdf" d="M0 7h12v1H0z"></path></svg> Ozik Jarwo</a>`
}).addTo(map);

map.on('click', async ({ latlng: { lat, lng } }) => {
  const m = L.marker([lat, lng]).addTo(map)
    .bindPopup('<em>Fetching data...</em>').openPopup();

  const delta = 0.01;
  const bbox = {
    min_lat: lat - delta, max_lat: lat + delta,
    min_lon: lng - delta, max_lon: lng + delta
  };

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

    const summaries = summaryJSON.properties?.summaries || [];
    const soilSummaryHTML = summaries.length
      ? summaries.map(s => `${s.soil_type} (${s.count}%)`).join(', ')
      : 'No data.';
    const soilSummary = summaries.length
      ? summaries.map(s => `${s.soil_type}`).join(', ')
      : 'No data.';

    const layers = propJSON.properties?.layers || [];
    const getLayer = name => layers.find(l => l.name.toLowerCase().includes(name));
    const bdodLayer = getLayer('bdod') || {};
    const nitrogenLayer = getLayer('nitrogen') || {};
    const phLayer = getLayer('ph');
    const bdod = bdodLayer.depths?.[0]?.values?.mean;
    const bdodUnit = bdodLayer.unit_measure?.mapped_units || '';
    const ph = phLayer?.depths?.[1]?.values?.['mean'] ?? 'No data';
    const phActual = (ph / 10).toFixed(1) ?? 'No data';
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

    const elev = elevJSON.elevation?.[0] ?? 'No data';
    const cw = wxJSON.current_weather || {};

    const address = addressJSON.display_name || 'Not found';

    function fetchData(callback) {
      const url = `https://text.pollinations.ai/Mention names of plants (only names, no explanation, separate with comma) that suitable to plant in ${address} area, soil type of ${soilSummary}, pH ${phActual ?? 'No data'}, ${elev} m elev, and ${cw.temperature ?? 'No data'}°C temp. If the elevation is 1-3 and (must) unknown pH, give the suitable 4 water plant and 1 land plant. Give 5 very accurate and most suitable plant names, don't be careless, and use English names, not Latin. Adjust to the country, don't use commodities that are rarely or never planted in the country's province. Remember, must be suitable with the data! And if the elevation is 0 or you don't know because not enough data or anything, just say "Unknown"`;
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error('Connection error');
          }
          return response.text();
        })
        .then(data => {
          callback(data);
        })
        .catch(error => {
          callback(error.message);
        });
    }

    fetchData(AI => {
      const soilType = soilSummaryHTML.replace("No_information", "Unknown");
      const suitablePlants = soilType === "Unknown (100%)" ? "Unknown" : AI;

      m.setPopupContent(`
        <span class="title">Location</span><br>
        ${address}<br><br>
  
        <span class="title">Coordinate</span><br>
        ${lat.toFixed(5)}, ${lng.toFixed(5)}<br><br>

        <span class="title">Suitable Plants</span><br>
        ${suitablePlants}<br><br>

        <hr><br>
  
        <span class="title">Soil type</span><br>
        ${soilType}<br><br>
  
        <span class="title">Soil property</span><br>
        BDOD: ${bdod ?? 'No data'} ${bdodUnit}<br>
        Nitrogen: ${nitrogen ?? 'No data'} ${nitrogenUnit}<br>
        Actual pH: ${phActual ?? 'No data'} - ${phCategory ?? 'No data'}<br><br>
  
        <span class="title">Climate (now)</span><br>
        Temp: ${cw.temperature ?? 'No data'}°C<br>
        Wind: ${cw.windspeed ?? 'No data'} km/h<br><br>
  
        <span class="title">Elevation</span><br>
        ${elev} m
      `);
    });
  } catch (err) {
    console.error(err);
    m.setPopupContent('<span style="color:red">Failed to fetch data!</span>');
  }
});