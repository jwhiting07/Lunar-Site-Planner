# CLPS Lunar Mission Browser

Compare three lunar south-pole locations using NASA LOLA terrain and precomputed
SPICE DE440 geometry. React, TypeScript, Three.js and Vite; no backend or API keys.
The shipped data supports 2026-01-01 through 2029-01-01 UTC.

## Run locally

With Node.js and npm on PATH:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5200 --strictPort
```

Open http://127.0.0.1:5200 and keep the terminal running. Dependencies are already
installed in this checkout, so `npm ci` is only needed for a fresh installation.
On Jesse's machine, the existing portable Node installation can be enabled in PowerShell:

```powershell
$env:PATH = 'C:\Users\Jesse\AppData\Local\Programs\nodejs-portable\node-v26.13.1-win-x64;' + $env:PATH
npm.cmd run dev -- --host 127.0.0.1 --port 5200 --strictPort
```

If a port is occupied, select another port and use the URL Vite prints.
For a production build, run `npm run build`; serve `dist/` with a static HTTP
server (`npm run preview` locally). Opening index.html as a file will not work.

## Use the application

1. Choose Mons Mouton (IM-2), Malapert A (IM-1), or the representative connecting-ridge point.
2. Select the UTC interval. Comparison checkboxes include up to three sites under identical assumptions.
3. Scrub the timeline to inspect Sun/Earth positions against the terrain skyline and local 3-D terrain.
4. Change panel area, efficiency, pointing, load, battery capacity or Earth clearance to recompute estimates.
5. Open a metric's information button or Sources & methods to trace its calculation.
6. Export the primary site's series CSV, comparison CSV, or all selected results as JSON.

CSV files begin with `#` metadata lines; skip these when importing the table.
JSON includes references, assumptions, windows, summary values and sampled series.

## Sources and reproducibility

- NASA/JPL NAIF: DE440 SPK, lunar orientation/frame kernels, planetary constants and leap seconds.
- NASA LOLA/PGDA: 80 m and 240 m elevation products, 80 m slope map and the illumination map used to select the ridge point.
- NASA/LROC: published IM-1 and IM-2 as-landed coordinates. The ridge is a project-selected representative point, not a mission target.

[References and assumptions](docs/REFERENCES_AND_ASSUMPTIONS.md) contains exact source
URLs and versions. [Calculation traceability](docs/CALCULATION_TRACEABILITY.md)
connects displayed outputs to equations, code and datasets.
[Validation](docs/VALIDATION.md) reports measured discrepancies and limitations.
`public/data/provenance.json` records source checksums, preprocessing parameters,
software versions and derived product provenance.

Python is only required to regenerate data or run scientific validation:

```sh
python -m venv .venv
# Activate the venv using the command for your shell, then:
python -m pip install -r requirements.txt
python scripts/fetch_sources.py
python scripts/build_data.py
python scripts/make_fixtures.py
python scripts/validate.py
```

The source downloads use approximately 0.75 GB in ignored `data_cache/`; the app
ships about 2.2 MB of derived data. Validation may download additional reference
products and Horizons responses. Keep Node/npm on PATH for validation's JS checks.
On Windows the existing venv executable is `.venv\Scripts\python.exe`.

```sh
npm test
npm run build
python -m pytest scripts/tests -q
```

## Limits

This is an educational planning MVP, not flight software or a landing-safety tool.
Terrain below 80 m and events between hourly samples can be missed. Earth visibility
is geometric line of sight, not a radio link budget. Power and battery use explicitly
assumed generic lander parameters and ideal storage, not spacecraft telemetry.
The 3-D patch is display-only; visibility uses a larger, precomputed terrain horizon.
The official challenge page could not be retrieved, so scope follows the supplied brief.
See [verification status](docs/VERIFICATION.md) for checks actually performed and browser limits.

## UI reference

See [the approved UI direction](docs/ui/README.md) for the design requirements and
[the interactive reference](docs/ui/index.html) for the saved layouts. Open the HTML
file locally in a browser; no installation is required.
