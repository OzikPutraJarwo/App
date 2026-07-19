---
name: verify
description: How to run and drive the Kode Jarwo static apps in this repo for verification
---

# Verifying apps in this repo

Static site, no build. Every app is a folder (`cv-generator/`, `finance-tracker/`, …) with
`index.html` + `style.css` + `script.js` that loads shared `../main.css` / `../main.js`
(header/footer/popup/toast chrome). Apps must be served from the REPO ROOT so `../` paths work:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 &   # from repo root
# app URL: http://127.0.0.1:8765/<app-folder>/
```

## Browser

No system browser or Playwright package, but a Playwright-downloaded Chromium exists:
`~/.cache/ms-playwright/chromium-1140/chrome-linux/chrome`. Drive it over CDP with
`websocket-client` in a venv (PEP 668 blocks pip --user):

```bash
python3 -m venv "$SCRATCHPAD/venv" && "$SCRATCHPAD/venv/bin/pip" install websocket-client
```

Launch: `chrome --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9222
--user-data-dir=$SCRATCHPAD/profile URL`, then connect to the `webSocketDebuggerUrl` from
`http://127.0.0.1:9222/json/list`. See `drive*.py` pattern: Page.enable/Runtime.enable,
Runtime.evaluate, Input.insertText (after el.focus()), Input.dispatchMouseEvent for real clicks,
Page.captureScreenshot, Page.printToPDF (`preferCSSPageSize: true` — exercises @media print).

## Gotchas

- `main.css` sets `scroll-behavior: smooth` — before computing click coordinates, call
  `el.scrollIntoView({block:"center", behavior:"instant"})` or clicks land on stale positions.
- `confirm()` dialogs: handle `Page.javascriptDialogOpening` inside the CDP recv loop
  (the blocked command won't return until the dialog is accepted).
- Word-export `.doc` files are HTML with a BOM; LibreOffice needs the BOM or it renders raw
  source. Check with `libreoffice --headless --convert-to pdf` + `pdftotext` / `pdftoppm`.
- localStorage persists per `--user-data-dir` profile — reuse the profile to test persistence,
  use a fresh one for first-visit behavior.
- Headless auto-adds `--ozone-override-screen-size=800,600`, so `--window-size=390,...` yields
  `innerWidth` 500, not 390 — narrow media queries still trigger, but don't assert exact widths;
  use `Emulation.setDeviceMetricsOverride` when the precise viewport matters.
- `pkill -f "<pattern>"` self-matches the wrapping bash snapshot shell (its cmdline contains the
  pattern text) and kills it → mysterious exit 1/144 with no output. Defuse with a character
  class: `pkill -f "chromium-114[0]"`.
- The Google icon-font stylesheet (imported by main.css) sets `display` on
  `.material-symbols-rounded` at (0,1,0) specificity, later in the cascade than any app
  style.css — hiding an icon needs a 2-class selector (e.g. `.hdr-btn .dd-caret`), and
  main.css also beats equal-specificity app rules generally (`.dock` vs `#cv-dock`).
