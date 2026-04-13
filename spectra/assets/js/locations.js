// Location Management with Leaflet Map
let locationMapInstance = null;
let locationMapMarker = null;

// Initialize location map
function initializeLocationMap(coordString = null) {
  // Destroy existing map if any
  if (locationMapInstance) {
    locationMapInstance.remove();
    locationMapInstance = null;
    locationMapMarker = null;
  }

  const mapContainer = document.getElementById("locationMap");
  if (!mapContainer) return;

  // Default center (Indonesia - Central Java)
  let center = [-6.2, 106.8];
  let zoom = 5;

  // If coordinates provided, use them
  if (coordString) {
    const coords = parseCoordinates(coordString);
    if (coords) {
      center = [coords.lat, coords.lng];
      zoom = 10;
    }
  }

  // Create map
  locationMapInstance = L.map(mapContainer).setView(center, zoom);

  // Add satellite tile layer
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "",
    maxNativeZoom: 17,
    maxZoom: 25,
  }).addTo(locationMapInstance);

  // Add labels layer on top
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png", {
    attribution: "",
    maxNativeZoom: 17,
    maxZoom: 25,
    pane: "shadowPane",
  }).addTo(locationMapInstance);

  // Add marker if coordinates exist
  if (coordString) {
    const coords = parseCoordinates(coordString);
    if (coords) {
      addLocationMarker(coords.lat, coords.lng);
    }
  }

  // Add click event to map
  locationMapInstance.on("click", (e) => {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    const coordString = `${lat},${lng}`;

    // Update input field
    document.getElementById("locationCoord").value = coordString;

    // Add/update marker
    addLocationMarker(lat, lng);
  });

  // Trigger map resize after it's rendered
  setTimeout(() => {
    if (locationMapInstance) {
      locationMapInstance.invalidateSize();
    }
  }, 100);
}

// Add marker to map
function addLocationMarker(lat, lng) {
  if (!locationMapInstance) return;

  // Remove existing marker
  if (locationMapMarker) {
    locationMapInstance.removeLayer(locationMapMarker);
  }

  // Add new marker
  locationMapMarker = L.marker([lat, lng], {
    icon: L.icon({
      iconUrl:
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
      shadowAnchor: [12, 41],
    }),
  })
    .bindPopup(`Location: ${lat}, ${lng}`)
    .addTo(locationMapInstance);

  // Pan to marker
  locationMapInstance.panTo([lat, lng], { animate: true });
}

// Parse coordinate string
function parseCoordinates(coordString) {
  if (!coordString || typeof coordString !== "string") return null;

  const parts = coordString.trim().split(",");
  if (parts.length !== 2) return null;

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

// Destroy map instance
function destroyLocationMap() {
  if (locationMapInstance) {
    locationMapInstance.remove();
    locationMapInstance = null;
    locationMapMarker = null;
  }
}

// Setup clear button
function setupLocationClearButton() {
  const clearBtn = document.getElementById("clearMapBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();

    // Clear coordinate input
    const coordInput = document.getElementById("locationCoord");
    if (coordInput) {
      coordInput.value = "";
    }

    // Remove marker from map
    if (locationMapMarker && locationMapInstance) {
      locationMapInstance.removeLayer(locationMapMarker);
      locationMapMarker = null;
    }

    // Reset map to default view
    if (locationMapInstance) {
      locationMapInstance.setView([-6.2, 106.8], 5);
    }
  });
}

// Initialize location clear button when page loads
document.addEventListener("DOMContentLoaded", () => {
  setupLocationClearButton();
});
