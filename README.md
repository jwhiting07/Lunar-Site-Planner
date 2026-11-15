# Lunar Site Planner

Check a lunar location or search for a mission that meets sunlight and Earth-visibility
targets using precomputed SPICE DE440 geometry. The nine shipped sites (two
as-landed CLPS positions and seven representative points) use
precomputed NASA LOLA terrain masks. The local Vite server can calculate a terrain
mask on demand for custom south-polar coordinates.
The shipped data supports 1959-09-13 (Luna 2 reached the Moon on 13 or 14 September 1959, depending on the source and time zone) through 2029-01-01 UTC; searches without a date look at 2026-2028, and earlier missions are chosen with an exact date or a range.

## Run locally

With Node.js (version 20 or newer) and npm on PATH:

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
For a production build, run `npm run build` and serve it with `npm run preview`.
On-demand terrain uses the Python environment from `requirements.txt` and the
LOLA rasters in `data_cache/lola/` (see `scripts/fetch_sources.py`). The 80 m and
240 m rasters cover the south pole. The 16 pixels/degree global raster from the
[NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) supplies regional skylines elsewhere.
The server uses `.venv` when present. Set `SERAPHIM_PYTHON` to use a different
Python executable. The first on-demand request starts a Python worker that keeps the
rasters in memory (about 7 s once, then about 1 s per location); the worker exits after
five idle minutes. A static host needs an equivalent `/api/custom-horizon` endpoint
to support on-demand profiles. Shipped terrain profiles work on a static host.

## Use the application

The Moon workspace has one collapsible row: **Location**, **Landing (UTC)**,
and **Duration**. Each field opens a small editor. Enter coordinates or choose
on the Moon, fix a landing date, and set a duration from one hour to 365 days;
**Analyze** checks that exact mission. **Advanced** retains visibility targets,
outage limits, Earth clearance, and all power assumptions. The initial 50% minima
are editable project assumptions, not NASA requirements.

For discovery, choose Anywhere or a nearby radius, any landing date or a date
range, and a fixed duration or duration range. **Find options** searches only the
fields left open; exact coordinates and dates remain fixed. Duration ranges
sample at most eight lengths, including both endpoints. Search uses bounded
location/date grids, coarse screening, and hourly refinement of the leading
twelve candidates. It shows five sampled matches, with three rows initially
visible; better unsampled options may exist. Sources & methods documents ranking.

Each result shows coordinates, landing, duration, sunlight, Earth visibility,
verdict, and terrain model. Checking a row immediately includes that scenario in
**Compare**; unchecking removes it. Up to twelve scenarios can be compared,
including different dates and durations at one location. Basic and detailed
comparison and CSV/JSON exports retain each scenario's parameters and targets.
Compared scenarios and their Moon markers are kept in this browser until removed or reset.

**Open** reveals Results, Timeline, Terrain, and Compare. The timeline and local
horizon share a cursor; the Terrain view uses the same cursor for Sun/Earth
geometry. Detailed metrics, terrain facts, power estimates, nearby alternatives,
and exports remain available. **Use this mission in controls** adopts a result
without changing the search settings just by opening it. Nearby alternatives
preserve duration and targets while testing dates within seven days and locations
within 50 km.

Custom coordinates first show a flat-horizon preview while a LOLA profile computes
in the background. Results and the lander skyline update together. The regional
profile uses a DEM with cells about 1.9 km across at the equator and cannot resolve
small local obstructions. Sampled searches use flat-horizon screening. Try `-83`
and `25` for a higher-resolution south-polar profile.

Drag or use arrow keys to rotate the Moon; scroll or use +/− to zoom. The map
centers an entered location and retains cursor coordinates and a distance scale.
Site callouts have a surface dot, diagonal leader, and horizontal name/number line.
The up/down arrows hide and restore mission controls and results without losing
state. Sources & methods stays in the footer. Click the clock for a compact,
searchable time-zone list, ordered west to east by current UTC offset. Every
browser-supported named zone and fixed offsets UTC−12 through UTC+14 remain
available, with time-zone names and daylight-saving-aware offsets. Mission dates
and scientific timeline controls always use UTC.

Solar view remains parked with its code and assets preserved. See
[parked solar work](docs/ui/SOLAR_PARKED.md).

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

The source downloads use about 0.80 GB (0.74 GiB; 797,407,757 bytes per
`data_cache/sources_manifest.json`) in ignored `data_cache/`. The app ships about
5.3 MB under `public/data/` (scientific products plus the display-only star and orbit
tables) and about 6.3 MB of display-only models and textures under `public/models/`
and `public/textures/`. Validation may download additional reference
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
Flat-horizon estimates for arbitrary coordinates ignore terrain shadowing and blocking
and are generally not representative near the poles. No RF link budget, thermal model or
landing-safety certification is provided.

## Licence and data credit

The code is under the MIT licence in `LICENSE`. NASA data are not relicensed here; cite
them as their providers request (verified on the source pages): Barker et al. 2023 for
the PGDA LOLA south-pole products, Mazarico et al. 2011 for the PGDA illumination maps,
and "NASA's Scientific Visualization Studio" for SVS material. Other credits are in
`public/models/provenance.json`, `public/textures/provenance.json` and
`public/data/stars.provenance.json`. A general public-domain status of these datasets was
not verified and is not asserted.
See [verification status](docs/VERIFICATION.md) for checks actually performed and browser limits.

## UI reference

See [the approved UI direction](docs/ui/README.md) for the design requirements and
[the interactive reference](docs/ui/index.html) for the saved layouts. Open the HTML
file locally in a browser; no installation is required.
