# Development and reproducibility

[Application](https://lunarsiteplanner.com) · [README](../README.md) ·
[Release notes](../CHANGELOG.md)

## Local development

Use Node.js 20.19+ or 22.12+ with npm. React, TypeScript, Three.js, KaTeX, and Vite
power the browser application; Python prepares and validates the scientific data.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5200 --strictPort
```

Open [localhost:5200](http://127.0.0.1:5200) and keep the terminal running. If the
port is occupied, select another and use the URL Vite prints. No API keys are
required for the shipped data. Browser localStorage retains comparison selections.

## Checks and production build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`build` runs TypeScript checking and Vite, writing deployable assets to `dist/`.
`preview` serves that build locally. There is no configured lint command.

Serve the complete `dist/` directory over HTTPS at **lunarsiteplanner.com**,
including binary ephemerides, terrain products, fonts, and models. The application
has no external database dependency. Keep attribution and license files with
the assets they cover.

A static host can use the nine shipped terrain profiles and the 49 exact default
search-grid profiles, which load lazily from `public/data/search_horizons.json`.
Additional coordinates require an equivalent `/api/custom-horizon` service.
Without it, uncached locations retain explicitly labeled flat-horizon estimates.
The Vite terrain middleware accepts loopback requests only; exposing a public
service requires a separate deployment with appropriate request controls.

## Optional terrain service

Create a Python environment and install the pinned requirements:

```sh
python -m venv .venv
# Activate .venv using the command for your shell.
python -m pip install -r requirements.txt
python scripts/fetch_sources.py
```

The Vite development and preview servers use `.venv` when present. On Windows,
its executable is `.venv\Scripts\python.exe`; on macOS/Linux, `.venv/bin/python`.
Set `LUNAR_SITE_PLANNER_PYTHON` to select another executable.

On-demand terrain uses the LOLA rasters in ignored `data_cache/lola/`. The 80 m
and 240 m rasters cover the south pole; the 16 pixels/degree global raster supplies
regional skylines elsewhere. Global cells are about 1.9 km across at the equator
and cannot resolve small local obstructions.

The first terrain request starts a Python worker that retains the rasters in
memory. Previously observed local timings were about seven seconds for startup
and one second per subsequent location; performance depends on the host. The
worker exits after five idle minutes. No nearby skyline is substituted for an
entered coordinate. Try latitude `-83`, longitude `25` for a south-polar profile.

Custom missions first show a flat preview while terrain computes, then update
the result and skyline together. Cold nearby searches can take longer because
multiple uncached profiles may be needed.

## Regenerate scientific products

With Python dependencies installed and Node/npm on PATH:

```sh
python scripts/fetch_sources.py
python scripts/build_data.py
python scripts/make_fixtures.py
python scripts/validate.py
python scripts/validate_validity.py
python -m pytest scripts/tests -q
```

The validity command also regenerates exact search-grid terrain profiles. These
commands can download substantial source and reference data and overwrite derived
products; review their diffs before committing. The original recorded source
manifest totals about 0.80 GB in ignored `data_cache/`; validation may download
additional reference products and Horizons responses.

`public/data/provenance.json` records source checksums, preprocessing parameters,
software versions, and derived-product provenance. Search profiles carry source
and generator hashes. The validity evidence is bound to evaluator source hashes;
regenerate it after relevant science changes.

See [references](REFERENCES_AND_ASSUMPTIONS.md),
[calculation traceability](CALCULATION_TRACEABILITY.md),
[validation](VALIDATION.md), and [mission-level validity](VALIDITY.md) for exact
inputs, equations, numerical budgets, and measured differences. Historical
[verification notes](VERIFICATION.md) identify checks performed on each revision.

## Display assets

```sh
python scripts/prepare_visuals.py
node scripts/prepare_stars.mjs
```

The Moon generator caches its source in ignored `data_cache/models/`, preserves
NASA geometry/UVs, and resizes embedded maps to 4096 px for the web. The resulting
Moon model is about 4.5 MB; `public/models/provenance.json` records source and output
checksums. Globe lighting provides viewing context, rather than physical
illumination for the displayed UTC. Local terrain uses the calculated Sun
direction with ambient fill and no ray-traced shadows.

The star generator selects 4,103 bright-star positions from the Yale Bright Star
Catalog hosted by NASA/GSFC HEASARC. The approximately 97 KB output and
`public/data/stars.provenance.json` retain source, credit, selection, and checksums.
The starfield orientation is contextual rather than an epoch sky simulation.

## Search and exports

Search uses bounded location/date grids, flat-horizon screening, and refinement
of up to 48 missions using exact-coordinate terrain where available. At most four
dates per location and duration enter refinement. Nearby alternatives preserve
duration and targets while testing dates within seven days and locations within
50 km. Opening a result preserves the search settings; **Use this mission in
controls** explicitly adopts its inputs.

CSV exports begin with `#` metadata lines; skip those lines when importing the
table. JSON retains scenario inputs, targets, assumptions, references, windows,
summary values, and hourly sampled series. Mission summaries use finer integration
than the exported display series.

## Work in progress

The local development work also adds 17 exact locations for the south-pole-centered
50 km search to the profile cache (about 1.8 MB total), with separate screening and
refinement progress. Where available, `node scripts/benchmark_search.mjs` measures
the January 2027 seven-day search, reports fresh/warm client-cache timings, and
fails if a terrain-service request occurs. Pass a duration in days to measure
another length. These additions are separate from the initial release's
49-profile baseline.

Local submission materials under `docs/submission/` contain video talking points,
submission text, resource lists, and review notes. Local credit/notice and SI
metadata files preserve the separate submission-preparation work. They can be
reviewed and committed with that work; they are not required to run this release.

## Interface reference

Read [the reviewed UI direction](ui/README.md) and inspect [its HTML reference](ui/index.html)
before interface changes. The saved reference uses illustrative data. Keep the
current dark palette, approved fonts, sharp-edged controls, and restrained layout.
