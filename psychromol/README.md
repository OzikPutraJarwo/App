# PsychroMol

Psychrometric chart with decision support for greenhouse microclimate: every hour the inside air is compared with a crop target zone, condensation and dry-stress risk are flagged, and the action whose process path (heating, fogging, ventilation, dehumidification) brings the air back into the zone is recommended.

Live: https://app.kodejarwo.com/psychromol/

- Static HTML, CSS and ES modules; the only library is D3 v7 (`vendor/`). No build step.
- Opens with a demo: Korean Squash (애호박) and Tomato, hourly over three months. The demo data are **simulated**, not sensor measurements.
- Your own data: Settings → My file (CSV/JSON) or API (JSON). Data stay in your browser.
- English and Korean.

Run locally: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

This folder is generated from the development repository (`node tools/export-github.mjs`); edit there, not here.
