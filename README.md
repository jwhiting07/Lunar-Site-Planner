# CLPS Lunar Mission Browser

Check a lunar location or search for a mission that meets sunlight and Earth-visibility
targets using precomputed SPICE DE440 geometry. React, TypeScript, Three.js and Vite;
no backend, new dependencies, or API keys. Arbitrary coordinates use a clearly labeled
flat horizon; the three exact shipped points retain NASA LOLA terrain masks.
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

The current entry point is one Planning workspace, without Moon/Planning tabs or
preset locations. **Check a site** accepts coordinates (or **Choose on Moon**), a
UTC landing date and a duration from one hour to 365 days. **Run analysis** shows
whether the scenario meets the displayed sunlight and Earth-visibility targets.
The initial 50% minima are editable project assumptions, not NASA requirements.
**Advanced** adds outage limits, Earth clearance and power-estimate parameters.

**Find a site** optionally restricts the search to a lunar radius and/or landing-date
range. With neither selected it samples across the Moon and shipped 2026–2028
coverage. **Find better nearby** keeps mission duration and targets fixed, testing
date changes within seven days or locations within 50 km. Search is a bounded grid,
with coarse screening and hourly refinement of the leading twelve candidates;
it can miss better unsampled options. Methods in the app document spacing and ranking.

Add up to twelve scenarios to **Compare**, including different dates at the same
location. Basic comparison shows location, landing date, duration, sunlight, Earth
visibility, verdict and model. **Detailed** includes all metrics and assumptions.
Exports preserve individual dates, parameters and targets. Comparisons remain in
memory for the current page session. Detailed data also retains timelines, the local
horizon, terrain view and site facts. The Moon's scale, zoom, coordinate readout,
south-pole and far-side controls are available in this same workspace.

The previous navigation described below is retained as implementation history;
its separate pages and preset selection are superseded by the workflow above.

The app opens at the south pole on the minimal **Moon** page, using NASA's LRO model. Drag to rotate,
scroll or use the +/− buttons to zoom, and move over the surface for east-positive
latitude/longitude. The lower-left **Scale** popout follows zoom (an approximate scale
at the facing surface). Arrow keys also rotate a focused globe; +/− zoom and Home resets.
Landing sites start visible. Select a site, then open **Planning** for the existing tools
below. Site selection is shared and Planning state stays intact when changing pages.

Solar view is hidden for now; its code, assets and mockups are preserved for later.
See [parked solar work](docs/ui/SOLAR_PARKED.md).

1. Choose Mons Mouton (IM-2), Malapert A (IM-1), or the representative connecting-ridge point.
2. Select the UTC interval. Comparison checkboxes include up to three sites under identical assumptions.
3. Scrub the timeline to inspect Sun/Earth positions against the terrain skyline. Local terrain uses the full Moon model with zoom and tilt clamped around the selected site.
4. Change panel area, efficiency, pointing, load, battery capacity or Earth clearance to recompute estimates.
5. Open a metric's information button or Sources & methods to trace its calculation.
6. Export the primary site's series CSV, comparison CSV, or all selected results as JSON.

Planning fills the viewport without page scrolling; open panels and dialogs scroll
internally. Its compact bottom row holds the shared cursor and scrubber. Open
Timelines & comparison to edit the date range. Metric info buttons sit after the
values and show one sentence explaining the meaning and calculation.

CSV files begin with `#` metadata lines; skip these when importing the table.
JSON includes references, assumptions, windows, summary values and sampled series.

## Sources and reproducibility

The display-only NASA models are recorded with source URLs and checksums in
`public/models/provenance.json`. NASA geometry/UVs are preserved, with embedded maps
repacked for the web (Moon: 4096 px; Earth/Sun: 2048 px). The Moon is about 4.5 MB and
is loaded with the Moon page. The globe uses a viewing light, not physical illumination
for the displayed UTC. Local terrain uses the calculated Sun direction with ambient
fill and no ray-traced shadows. Scientific calculations still use the original terrain and
ephemeris pipeline below.

To reproduce the models and the retained solar-only orbit data, run
`.venv\Scripts\python.exe scripts/prepare_visuals.py` after installing requirements.
Original model downloads and NAIF kernels are cached in ignored `data_cache/`.
The active Moon views use 4,103 bright-star positions from the Yale Bright Star
Catalog hosted by NASA/GSFC HEASARC, rendered as small, dim, antialiased points.
`public/data/stars.provenance.json` records the source, credit, selection and checksums;
`node scripts/prepare_stars.mjs` regenerates the 97 KB data file. Its orientation is
contextual rather than a simulated epoch sky.

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
The continuous Moon model is display-only; visibility uses the precomputed LOLA terrain horizon.
The official challenge page could not be retrieved, so scope follows the supplied brief.
See [verification status](docs/VERIFICATION.md) for checks actually performed and browser limits.

## UI reference

See [the approved UI direction](docs/ui/README.md) for the design requirements and
[the interactive reference](docs/ui/index.html) for the saved layouts. Open the HTML
file locally in a browser; no installation is required.
