# Verification status — 2026-11-14

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
