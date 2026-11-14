# Navigator implementation — November 14, 2026

Integrated main's c829a9b cleanup and calculation/search performance improvements.
Production build and 111 Vitest tests pass, including duration-range coverage,
stable search ranking, DST and fractional time-zone offsets, and full zone retention.
Browser checks exercised discovery across location/date/duration, exact terrain-aware
analysis, nearby alternatives, comparison/detail views, synchronized timeline/horizon
controls, 3-D terrain, JSON download, collapsible controls/results, and immediate
comparison checkbox inclusion/removal. The time-zone picker is searchable, compact,
and ordered by current UTC offset, with named zones and fixed UTC−12 through UTC+14.
Further mobile polish is deferred at the user's request.

Older verification notes below describe previous application versions.

# Unified Planning verification — November 14, 2026

`npm run build` and all 103 Vitest tests pass, including new lunar-radius,
pole/date-line, date-grid, target-boundary, cancellation, hourly-refinement and
multi-date export checks. Browser checks covered coordinate entry, keyboard and
click selection, drag suppression, nearby date and location improvements,
unrestricted search (1,519 scenarios for a seven-day mission), radius/date-limited
search, basic/detailed comparison, and retained detailed data/timeline. The 390 px
viewport reflows into one column without horizontal page overflow. Moon/Planning
navigation and preset sites are absent from the active entry point.

Arbitrary-coordinate terrain remains unavailable; the interface labels those
results as flat-horizon estimates. Search samples a grid and does not establish a
global optimum or landing safety. The editable initial 50% targets are project
assumptions. Prior verification notes below describe earlier versions.

# Verification status — 2026-11-14

## Star background refinement

Replaced the enlarged 2.35 MB sky JPEG with 4,103 real bright-star catalog positions
(97,429 bytes), selected through magnitude 5.8 from NASA HEASARC's Yale Bright Star
Catalog. The background now renders dim antialiased points in device pixels, with
no Milky Way haze, enlarged texture, glow or animation. Source and product hashes,
selection and reproduction command are recorded in `public/data/stars.provenance.json`.
The catalog is contextual and is not aligned to a lunar epoch.
Browser checks verified the sparse star field in Moon and Planning, including Moon
zoom, with no console warnings or errors in the final fresh session. The production
build and all 97 JavaScript tests passed.

## Review refinements — November 14, 2026

The later viewport refinement was browser-checked at 1920 × 975 and 390 × 844:
document dimensions matched the viewport with no page scrolling. The bottom time
controls measured 47 px and 70 px high respectively. Date controls remained available
inside the timeline dialog, and the analysis panel scrolled internally. Metric info
popouts contained one explanatory sentence with no action links or classification.
The local NASA star map loaded behind the Moon; its local HTTP asset returned 200.

Based on merged main commit `1c7a8e6`. The production build (including TypeScript)
and all 97 JavaScript tests passed. New coverage checks load the actual shipped
ephemeris at both endpoints, reject invalid intervals, reject calendar rollover,
and exercise zoom/tilt limits with Three.js OrbitControls at each shipped site.

Browser checks on port 5200 verified the default south-pole view with visible sites,
the scale popout and Escape dismissal, simplified site facts and their Sources &
methods link, the comparison table without the repeated narrative, and timeline
dragging without a text selection. Native date changes stayed within coverage.
The continuous local Moon model loaded and remained anchored to the site.
Metric information buttons align after the values in one right-hand column; all
seven shared the same right edge at a 390 px viewport. There was no horizontal
overflow at that width, and the information popout remained usable. The normal
viewport was restored. No browser console warnings or errors were observed.

These UI checks do not establish export downloads or WebGL-failure recovery.
The existing scientific-validation limitations remain applicable. The active
local view now uses the NASA display mesh; the retained DEM patch is not rendered.

## NASA Moon explorer and parked Solar view

Moon is the default page; only Moon and Planning appear in navigation. Solar source,
NASA assets, orbital tables, and mockups are retained but not imported by the active
app. See `docs/ui/SOLAR_PARKED.md` for what remains unfinished before re-enabling it.

The active Moon uses the actual NASA GSFC/LRO GLB, with preserved geometry/UVs and
web-sized embedded imagery. `public/models/provenance.json` records original and
derived checksums; all three derived GLB sizes/checksums and the retained orbital
table checksum were verified. The Moon's native axes are aligned with the existing
ME site coordinates. Its viewing light is contextual, not epoch illumination.

The Moon-only cursor HUD raycasts a reference sphere, reports east-positive
latitude/longitude, and clears when the pointer leaves the globe. The distance bar
updates with zoom and resize; it is approximate at the globe centre in perspective,
not a terrain measurement. Site coordinates use the existing data catalogue.

Passed: 91 JavaScript tests, TypeScript and production Vite build. Python: 26 passed,
4 skipped because optional source-data fixtures were absent. The new tests cover
coordinate round trips including landing-site/polar/date-line cases and distance
bar units/zoom/invalid inputs. Existing science and export tests still pass.

Browser verification on the local Vite server: NASA model near/far-side appearance,
cursor coordinate changes while moving and dragging, distance bar change from
500 km to 200 km on zoom, keyboard rotation and reset, and optional landing-site
markers. Selected Malapert A on Moon and verified the same site in Planning; advanced
the planning cursor one hour and opened/closed its detailed timeline dialog.
No console warnings/errors were observed. At a 375 CSS-pixel viewport there was no
horizontal overflow (document width and scroll width both 375). The responsive Moon
framing leaves room for its controls. Restored the normal viewport after testing.

Proof image: `output/ui/moon-explorer.jpg`. Current browser checks do not establish
actual export downloads or the WebGL/context-loss fallback; those paths are not
claimed as browser-verified. Scientific validation limits below still apply.

## Globe and Trek UI update

Implemented against AGENTS.md and docs/ui/README.md: square controls, approved
palette and Inter/Arial stack, map-first layout, numbered site markers, on-demand
detail panels and a persistent UTC scrubber. The reference HTML is preserved.
All 89 JavaScript tests passed, including the new globe cardinal-coordinate test.
Browser testing now succeeds through the in-app browser: verified textured globe,
marker selection (Malapert A), changed selected-site readout, one-hour time advance,
local terrain switching and return to globe. No console errors were observed.
At 375 px, document scroll width was 360 px (no horizontal overflow); at 1440 px,
it was 1425 px. The globe framing adapts to narrow viewports.
These checks supersede the earlier browser access block for this UI work, but
do not establish download, WebGL-failure or every keyboard-interaction path.

The latest completed scientific validation run is recorded in `VALIDATION.md`
and `validation_results.json`: 88 JavaScript tests in nine files, 30 Python tests,
and TypeScript checking passed. V-1 through V-7 completed using the shipped data,
cached NASA source files and actual JPL Horizons responses. Tests include export
consistency, geometry, interpolation, windows, energy balance and SPICE fixtures.

Final production build (`npm run build`, including TypeScript checking) passed.
A provenance audit confirmed that reference IDs in runtime code and the traceability
guide resolve, recorded pipeline script hashes match the current files, product
files exist and their recorded hashes match, and shipped site text matches the
UTF-8 source catalogue. HTTP checks of `/` and `/data/sites.json` on port 5200
both returned 200 after these checks.

The inherited frontend handoff reported rendering, range presets, the methods
panel, and a 375 px layout check. Those are historical checks, not a new browser
verification by Codex. Codex's in-app browser timed out on the earlier server;
Windows Computer Use then stopped because it could not reliably determine the
browser URL. No browser interaction or download success is claimed from that attempt.

The local server was restarted outside the sandbox on port 5200 and returned HTTP
200. The previous port 5199 was occupied by an unreachable process. Server health
does not establish that every UI interaction works.

Browser checks still requiring confirmation: typed dates and invalid parameters,
site switching, timeline scrubbing, terrain orbit/exaggeration, all provenance tabs,
actual CSV/JSON downloads, keyboard focus, WebGL fallback and responsive layouts.
These remain verification limits; no scientific placeholder is substituted for them.

Known scientific limits include 80 m terrain resolution, hourly event sampling,
idealized power/storage, geometric Earth visibility, and no telemetry comparison.
The official challenge URL could not be fetched (the later attempt returned 502),
so challenge scope is checked against the supplied brief only.
