# Calculation traceability

## Context globe (UI update)

`src/components/MoonView.tsx` renders the NASA GSFC/LRO Moon GLB
(`public/models/moon.glb`, SVS 14959) loaded by `src/visuals/models.ts`; source URL,
checksums and processing are in `public/models/provenance.json`. The NASA SVS CGI
Moon Kit colour map (`public/textures/moon-color.jpg`, R-SVS-MOON-KIT, recorded in
`public/textures/provenance.json`, https://svs.gsfc.nasa.gov/4720/) is used only at
build time to colour the local terrain patch (`terrain_color_<id>.png`).
(Corrected 2026-11-14 audit: an earlier version of this paragraph described a
textured unit sphere; the unused `moon-bump.jpg` was later removed.)
This globe is display-only: its fixed viewing light is not an epoch illumination
model.
The image is aesthetically processed and includes polar fill. Scientific analysis
continues to use the separate LOLA horizon and SPICE pipeline below.
Markers use the sourced site latitude/longitude via `enuBasis`; lunar body axes
(X,Y,Z) map to Three.js (X,Z,-Y), aligning zero longitude with the texture centre.
The local DEM patches and textures are retained generation products. The active
planner shows the lander's skyline through `SkyView.tsx`. No code or assets were
copied from Moonquake Map; its simple globe presentation was the visual reference.

This guide follows each major displayed/exported quantity from its output to its
equation, implementation, inputs and references. Reference IDs resolve in
`scripts/references.json` and `public/data/provenance.json`; exact URLs, equations,
versions and source qualifications are in `REFERENCES_AND_ASSUMPTIONS.md`.
The app's Sources & methods panel is defined in `src/science/methods.ts`.

## Conventions and dependency chain

All dates are UTC. SPICE converts UTC to ephemeris time using `naif0012.tls`.
Positions use lunar Mean-Earth `MOON_ME_DE440_ME421`, planetocentric latitude and
east-positive longitude. Heights reference a 1,737,400 m sphere. Local axes are
East, North, radial Up. Azimuth is clockwise from north in [0,360); elevation is
above the horizontal plane. Runtime angles are degrees, vectors km, terrain m,
power W, energy Wh and durations h. Constants live in `src/science/constants.ts`
and `scripts/moonlib.py` (R-LOLA-PGDA, R-IAU-WGCCRE, R-NAIF-PCK, R-AU, R-TSI).
Degrees/radians and milliseconds/hours are unit conversions, not fitted parameters.

The chain is: source files and site records → Python preprocessing → shipped
ephemeris/horizon/terrain → TypeScript geometry → visibility → windows and power
→ battery integration → `summaryRows` → UI and export builders. No scientific
result in this chain is a direct NASA prediction unless identified as sourced.

## Site and terrain outputs

| Output / classification | Equation or rule and implementation | Inputs and references | Limits |
|---|---|---|---|
| IM-1/IM-2 coordinates / sourced | Copy published as-landed coordinates; `scripts/sites_input.json`, `build_data.py select_site_point` (M-SITE) | LROC reports, R-LROC-1360, R-LROC-1408, R-NASA-IM1 | Rounded coordinates; historical landing points, not future targets |
| Ridge coordinates / computed selection | Maximum illumination-map pixel within the documented Site01 bounds; first maximum in raster order; `select_site_point` | AVGVISIB_65S_240M_201608.TIF, R-LOLA-SITES, R-MAZARICO-2011 | Project-selected representative point; not a published landing target |
| Site elevation / sampled source | Bilinear DEM height at projected coordinates; `moonlib.py Dem`, `build_data.py` | LDEM_80S_80MPP_ADJ.TIF, R-LOLA-PGDA, R-SNYDER | 80 m grid and spherical height datum; interpolation smooths relief |
| Slope / sourced pixel and computed mean | Pixel containing the site and mean of its 3×3 neighborhood; `build_data.py slope_at` (M-SLOPE) | LDSM_80S_80MPP_ADJ.TIF, R-LOLA-PGDA | 80 m context, not hazard clearance or touchdown attitude |
| Horizon angle and defining distance / computed | For arc s, theta=s/R; elevation=atan2((R+h)cos(theta)-r_o,(R+h)sin(theta)); maximum along each ray; `moonlib.py compute_horizon, elevation_angle_deg`; runtime `horizon.ts horizonAt` (M-HORIZON) | Near 80 m DEM, far LDEM_60S_240MPP_ADJ.TIF; observer radius R+h_site+h_obs; R-LOLA-PGDA, R-SNYDER | 0.5° azimuth grid, finite ray spacing, 600 km range; circular linear interpolation in azimuth |
| 3-D terrain / computed display | Horizontal=(R+h)sin(s/R), up=(R+h)cos(s/R)-(R+h_site); `build_data.py terrain_patch`, `geometry.ts terrainNodeEnu` (M-PATCH) | Same DEMs, 201×201 samples at 200 m spacing, covering ±20 km around the site. Surface color comes from the reprojected NASA SVS CGI Moon Kit (R-SVS-MOON-KIT). | Optional ×3 display exaggeration. Color includes lower resolution polar fill. Directional shading provides visual context. |
| Overview map / computed display | Block-mean DEM hillshade with artificial lighting; `build_data.py` | 80 m LOLA DEM, R-LOLA-PGDA | Geographic context, not current illumination |

The spherical polar stereographic forward/inverse transformations and bilinear
sampling derivations are in References §§7.3–7.5. The projection is independently
checked against PROJ during the data build. A-HMAX (11 km assumed maximum terrain)
bounds terrain beyond the ray range; it is not an elevation observation.

## Sun and Earth geometry

M-EPHEM: `build_data.py build_ephemeris` evaluates
`spkpos(body, et, MOON_ME_DE440_ME421, LT+S, MOON)` hourly. Inputs are
`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`
and `pck00011.tpc` (R-DE440, R-NAIF-MOONFK, R-NAIF-LSK, R-NAIF-PCK,
R-NAIF-SPKPOS, R-NAIF-ABCORR, R-NAIF-TIME).
`ephemeris.ts bodyVectorKm` linearly interpolates the shipped vectors without
extrapolation. This is computed geometry with an hourly interpolation approximation.

M-EPHEM-HIST: the same hourly vectors for 1959-09-13 00:00 UTC to 2026-01-01 UTC, written by
`build_data.py build_history_ephemeris` to `ephemeris_{year}.bin` and indexed by
`ephemeris_history.json`; the app merges both indexes (`loader.ts loadEphemerisIndex`), so
searches and analyses use one continuous table. Same kernels, frame and aberration as M-EPHEM.
Epoch conversion differs in one respect: the SPICE leapseconds kernel has no entries before
1972-01-01, so each UTC hour is converted through TAI from the nearest 1 January / 1 July mark,
which applies a constant TAI-UTC offset before 1972 (historical UTC used drifting seconds).
Expected effect: up to about 9 s, about 0.001 deg of solar motion. V-9 compares eight epochs from
1959 to 2023 with JPL Horizons: at most 5e-7 deg (azimuth x cos elevation) and 2.5e-5 deg
(elevation) from 1972, and about 1.2e-3 deg before 1972. The terrain horizon (M-HORIZON) is
today's LOLA topography and is applied unchanged to historical dates.

Landing-site catalogue (`landing_sites.json`): coordinates of past landing and impact sites and
of planned or candidate sites, copied exactly as published by the cited sources
(`scripts/landing_sites_past.json`, `landing_sites_planned.json` and their `_refs.json` files,
merged and checked by `build_data.py build_landing_sites`). Nothing in it is computed. Each entry
states what its coordinates are (`coord_basis`) and the stated precision. The Moon view draws the
entries as dots and the Location editor lists them; choosing one only copies its latitude and
longitude into the query, which then follows the same M-PLAN path as typed coordinates.

M-GEOM: subtract the site observer vector from the Moon-centred body vector.
For latitude p and east longitude L, project onto
E=(-sin L,cos L,0), N=(-sin p cos L,-sin p sin L,cos p),
U=(cos p cos L,cos p sin L,sin p). Then az=atan2(v·E,v·N) modulo 360,
el=asin(v·U/|v|), distance=|v|. `geometry.ts enuBasis, azEl` and
`analysis.ts instantState` supply sky tracks, cursor readouts and direction arrows
(R-NAIF-FRAMES, R-NAIF-MOONFK). Aberration is evaluated at the Moon centre;
V-2 quantifies the surface-observer difference. Up is radial, not a gravity model.

## Visibility and time metrics

| Output | Equation / implementation | Dependency and classification |
|---|---|---|
| Solar clearance, visibility flag | C=el-H(az); rho=asin(R_sun/d); visible when C+rho>0; `analysis.ts instantState` for single instants and the same arithmetic in the `analyzeSite` sample loop for series (M-SUNVIS) | Computed from M-GEOM/M-HORIZON, sourced solar radius 695700 km (R-NAIF-PCK, R-TSI) |
| Visible disk fraction | x=clamp(C/rho,-1,1); f=1-(acos(x)-x sqrt(1-x²))/pi; `power.ts diskFractionVisible` | Computed circular-segment area (R-SEGMENT); straight-edge, uniform-brightness approximation |
| Earth clearance and flag | C=el-H(az); visible when C>C_min; `analysis.ts instantState` for single instants and the same arithmetic in the `analyzeSite` sample loop for series (M-EARTHVIS) | Computed from geometry/horizon, assumed default C_min=0° (A-DTE-MASK); Earth centre only |
| Sun/Earth windows | For adjacent sign-changing margins, t_cross=t_i+m_i/(m_i-m_next)×dt; `windows.ts findWindows` (M-WINDOWS) | Computed linear root; no external citation needed for algebra; physical margins come from preceding rows |
| Darkness / blackout / simultaneous visibility | Complements/intersections of windows; `complementWindows`, `intersectWindows` | Computed interval set operations |
| Sunlit/Earth-visible hours and percentages; both-visible hours | Sum window durations; percentage=100×hours/intervalHours; `analysis.ts analyzeSite` | Computed from M-WINDOWS; milliseconds converted to hours |
| Longest darkness / blackout | Maximum complement window duration; `windows.ts longestWindow`, `summary.ts` | Computed; null if no such window, and lower-bound marker if clipped at either interval edge |
| Flat-horizon percentages | Repeat margins with H=0; `analysis.ts analyzeSite` | Approximated comparison baseline; not an alternative NASA measurement |
| Mean solar disk fraction and mean horizons | Sum 0.5×(v_i+v_next)×dt divided by interval length; `analysis.ts timeMean` | Computed trapezoidal time mean, including invisible periods |
| Minimum / maximum body elevation | Sampled extrema; `analysis.ts analyzeSite` | Computed hourly-sample extrema, not continuous-time optimized extrema |

All window lengths can miss events shorter than the sample interval. The Sun flag
includes a sliver of the disk; it does not imply full power. Earth visibility is
geometric opportunity, not a station-specific communications link. See V-5 for why
the NASA Earth illumination map's any-part-of-disk criterion differs from this app.

## Power and battery outputs

M-POWER: `power.ts solarFluxWm2, incidenceFactor, panelPowerW` uses
S=1361×(AU/d)² W/m² and P=S×A×eta×cos(i)×f_disk. Irradiance and AU are sourced
(R-TSI, R-TSI-MEAS, R-AU). Area and efficiency are assumed. Incidence is 1 for
tracking, cos(el) for vertical azimuth-tracking and max(0,sin(el)) for horizontal.
This is the projected collecting area identity applied to a simplified panel model.

M-BATTERY: `power.ts simulateBattery` integrates generated energy by the trapezoid
rule, E_gen=0.5×(P_i+P_next)×dt_h, and load energy=P_load×dt_h. The next stored
energy is clamp(E+E_gen-E_load,0,capacity). Energy below zero is unserved; energy
above capacity is curtailed. Within a step, deficit duration and first deficit time
assume a constant net rate. Minimum charge=100×min(E)/capacity, or null at zero
capacity. Generated/load/unserved kWh are Wh/1000. These are computed estimates
from assumed inputs, not measured spacecraft performance. The displayed load
energy is tagged assumed because its constant demand is chosen by the user.

Defaults (A-LANDER) are area 2 m², efficiency 0.28, load 150 W, battery 1500 Wh
and tracking. A-BATT-INIT sets initial charge to 100%; A-OBS-HEIGHT places the
observer 2 m above the terrain. `constants.ts` and `build_data.py` define these.
References §8 records rationale and lack of spacecraft-specific evidence. Ideal
storage excludes thermal limits, losses, degradation, dust and operating modes.

## UI, exports and reproducibility

`src/science/summary.ts summaryRows` is the shared source for the metric panels,
comparison table and exports. Each row supplies its unit, classification and
method ID. `formatRowValue` rounds only presentation and marks truncated windows.
`src/export/exporters.ts` exports comparison values unrounded; series angles/disk
fraction have four decimals and power/energy two. JSON retains full summary values
and a matching display string; its sampled series uses the CSV precision. These
digits are formatting choices, not accuracy claims. JSON windows include clipping
flags and durations; exported timestamps are rendered to seconds.

`public/data/provenance.json` records input hashes, actual kernel filenames,
generation time, software versions, preprocessing parameters, product descriptions
and references. Run the README pipeline to regenerate it rather than hand-editing
derived assets. `scripts/make_fixtures.py` builds independent SPICE comparison cases;
`scripts/validate.py` records V-1 through V-8. `src/export/exporters.test.ts` checks
agreement between scientific results, display strings and both export formats.

Measured discrepancies and unvalidated physics are in `VALIDATION.md`.
Bibliographic qualifications and missing source facts remain explicitly disclosed
in References §10; this document does not elevate them to verified claims.

## Per-output dependency chains

One chain per `summaryRows` key (`src/science/summary.ts`), per instantaneous
readout and per verdict/site value. Read right to left as "is computed from".
Link classes: [C] computed, [S] directly sourced, [A] assumed, [X] approximated.
Common tail used below:

```
GEOM(body) = az, el, d of body [C] (M-GEOM, geometry.ts azEl, enuBasis; analysis.ts bodyState)
  <- v = r_body(t) - r_obs [C]
  <- r_body(t): linear interpolation of hourly LT+S Moon-centred vectors [X] (M-EPHEM, ephemeris.ts bodyVectorKm)
       <- ephemeris_<year>.bin <- spkpos(.., MOON_ME_DE440_ME421, LT+S, MOON) [C] (build_data.py build_ephemeris)
       <- de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, naif0012.tls [S]
       <- R-DE440, R-NAIF-MOONFK, R-NAIF-LSK, R-NAIF-ABCORR, R-NAIF-SPKPOS
  <- r_obs = (R + h_site + h_obs) U [C] (analysis.ts makeSiteContext)
       <- R = 1737.4 km [S] (R-IAU-WGCCRE, R-NAIF-PCK); h_site [S] (LDEM_80S_80MPP_ADJ, R-LOLA-PGDA;
          0 m [A] for user-entered points); h_obs = 2 m [A] (A-OBS-HEIGHT); lat/lon [S] (M-SITE)
H(A) = terrain horizon [C] (M-HORIZON, horizon.ts horizonAt; moonlib.py compute_horizon)
  <- horizon_<id>.bin <- ray sampling of LDEM_80S_80MPP_ADJ / LDEM_60S_240MPP_ADJ [S] with curvature [C]
  <- 0.5 deg table, ray step rule, 600 km range [X] <- R-LOLA-PGDA, R-SNYDER
  (H = 0 [X] for user-entered points: horizon.ts flatHorizon)
```

### Summary rows

```
sunlit_pct  Sunlit time [%] = 100 * sunlit_h / interval [C] (M-SUNVIS; analysis.ts analyzeSite)
sunlit_h    Sunlit hours [h] = sum of Sun window durations [C] (M-WINDOWS; windows.ts findWindows, totalHours)
  <- crossings t_c = t_i + m_i/(m_i - m_i+1) dt [X] (linear zero crossing, hourly samples)
  <- m_s = C_s + rho_s, C_s = el_s - H(az_s) [C] (analysis.ts instantState; same arithmetic in the analyzeSite loop)
  <- rho_s = asin(R_sun / d_s) [C] <- R_sun = 695700 km [S] (R-NAIF-PCK, R-TSI)
  <- GEOM(Sun), H(A)
earth_pct   Earth visible [%] = 100 * earth_h / interval [C] (M-EARTHVIS)
earth_h     Earth-visible hours [h] = sum of Earth windows [C] (M-WINDOWS)
  <- m_e = C_e - C_min, C_e = el_e - H(az_e) [C] <- C_min = 0 deg default [A] (A-DTE-MASK)
  <- GEOM(Earth) (Earth centre only [X]), H(A)
both_h      Sun and Earth both visible [h] = sum of intersectWindows(Sun, Earth) [C] (windows.ts intersectWindows)
longest_dark_h      Longest darkness [h] = max complement of Sun windows [C] (complementWindows, longestWindow);
                    ">=" lower bound when cut by the interval edge (truncated flag)
longest_blackout_h  Longest Earth blackout [h] = max complement of Earth windows [C] (same rules)
sunlit_pct_flat     Sunlit time, flat horizon [%]: as sunlit_pct with m_s = el_s + rho_s (H = 0) [X]
earth_pct_flat      Earth visible, flat horizon [%]: as earth_pct with m_e = el_e - C_min [X]
mean_disk_pct       Mean visible solar disk [%] = 100 * trapezoidal time mean of f [C] (analysis.ts timeMean)
  <- f = 1 - (acos x - x sqrt(1 - x^2))/pi, x = clamp(C_s/rho_s) [C][X straight level edge, uniform disk]
     (power.ts diskFractionVisible) <- R-SEGMENT; C_s, rho_s as above
sun_el_min_deg / sun_el_max_deg      extrema of sampled el_s [C] (analysis.ts minMax) <- GEOM(Sun)
earth_el_min_deg / earth_el_max_deg  extrema of sampled el_e [C] <- GEOM(Earth)
horizon_at_sun_deg    trapezoidal time mean of H(az_s(t)) over the whole interval [C] <- H(A), GEOM(Sun)
horizon_at_earth_deg  trapezoidal time mean of H(az_e(t)) [C] <- H(A), GEOM(Earth)
generated_kwh  Energy generated [kWh] = sum (P_i + P_i+1)/2 dt / 1000 [C] (M-BATTERY; power.ts simulateBattery)
  <- P = S(d) A eta cos(i) f [C] (M-POWER; power.ts panelPowerW)
  <- S(d) = 1361 W m^-2 (1 au / d_s)^2 [C] <- S0 [S] (R-TSI; R-TSI-MEAS consistency), 1 au [S] (R-AU)
  <- A = 2.0 m^2, eta = 0.28, panel mode [A] (A-LANDER) ; cos(i) [C] from el_s ; f as above
load_kwh       Energy demanded by load [kWh] = P_load * interval / 1000 [A] (A-LANDER, 150 W default)
unserved_kwh   Unserved load energy [kWh] = sum of energy below 0 [C] (M-BATTERY)
deficit_h      Time in power deficit [h]: per step (-E')/(-n) dt, constant net rate within a step [C][X]
min_battery_pct  Minimum battery charge [%] = 100 min(E)/E_cap [C]
  <- E_i+1 = clamp(E_i + E_gen - E_load, 0, E_cap) [C]; E_0 = E_cap [A] (A-BATT-INIT); E_cap = 1500 Wh [A];
     ideal storage, constant load [A]
```

### Instantaneous readouts (Local horizon / sky view, Local terrain, Timelines cursor)

```
Sun / Earth azimuth, elevation [deg]   <- GEOM(body) at the cursor time (analysis.ts instantState; SkyView.tsx readout)
Terrain horizon [deg]                   <- H(az) at the body azimuth (horizon.ts horizonAt)
Clearance [deg]                         <- C = el - H(az) [C]
Visible solar disk [%]                  <- 100 f (power.ts diskFractionVisible)
Status chips ("Sun visible", "blocked by terrain", "below horizon"; Earth "line of sight", "below min. clearance")
                                        <- signs of C_s + rho_s, el_s + rho_s, C_e - C_min, el_e (SkyView.tsx sunState, earthState)
Min. clearance setting [deg]            <- C_min [A] (A-DTE-MASK)
Horizon distance note ("set by terrain N km away") <- distance of the horizon-defining sample at the nearest
                                        table azimuth (horizon.ts horizonDistanceAt) <- horizon_<id>.bin [C]
Skyline curve                           <- H(A) table (horizon_<id>.bin); for user-entered points H = 0 [X]
Sun / Earth tracks                      <- GEOM(body) sampled over +/- 15 days (SkyView.tsx PATH_DAYS, display)
Timelines bars / power / battery curves <- Series.sunVisible, earthVisible, powerW, batteryWh (analysis.ts analyzeSite)
```

### Site facts, terrain and maps

```
Latitude / longitude          [S] sites_input.json <- R-LROC-1408 (IM-2), R-LROC-1360 + R-NASA-IM1 (IM-1);
                              ridge [C] by the selection rule (build_data.py select_site_point) <- AVGVISIB_65S_240M_201608 [S]
                              (R-MAZARICO-2011), Site01 box [S] (R-LOLA-SITES); user-entered [A]
Elevation above sphere [m]    [S] bilinear LDEM_80S_80MPP_ADJ sample (build_data.py; sites.json elevation_m) <- R-LOLA-PGDA
Published elevation [m]       [S] IM-1 2579 m (R-LROC-1360, R-NASA-IM1); display only; comparison in V-7
Regional slope [deg]          [S] LDSM_80S_80MPP_ADJ pixel and 3x3 mean (build_data.py slope_at) <- R-LOLA-PGDA; context only
Horizon range / mean [deg], max obstruction distance [km], coverage [km], unseen-terrain margin [deg]
                              [C] sites.json horizon.* (build_data.py main) <- H(A) table; margin uses A-HMAX [A]
Retained local DEM products   [C] terrain_<id>.bin heights (build_data.py terrain_patch), colour terrain_color_<id>.png
                              <- R-SVS-MOON-KIT (display); generated but not loaded by the active planner
Moon globe                    display only: moon.glb (public/models/provenance.json); site markers from lat/lon via enuBasis
Overview hillshade            display only (build_data.py build_overview) <- LDEM_80S_80MPP_ADJ, artificial light
```

### Verdict, search and comparison

```
"Meets targets" / failures    [C] planner.ts assessment: sunlitFraction, earthVisibleFraction, longest darkness/blackout
                              compared with targets [A] (M-PLAN; default 50 % / 50 %, limits off)
"Terrain included" / "Flat-horizon estimate"  <- SiteDoc.terrain_aware (exact match to a shipped site)
Search results / ranking      [C][X] planner.ts searchCandidates, compareCandidates (bounded grid, coarse screening,
                              hourly refinement) <- analyzeSite for each candidate (chains above)
Comparison table              same AnalysisResult values and summaryRows (MissionPlanner.tsx compare dialog)
```

### Exports

```
CSV/JSON summary values  <- summaryRows(r) (same rows as on screen) via src/export/exporters.ts
CSV/JSON series          <- AnalysisResult.series (4 decimals angles/disk fraction, 2 decimals power/energy: formatting only)
JSON references          <- public/data/provenance.json references (= scripts/references.json)
```

## How to reproduce

```sh
python -m venv .venv
# activate the venv, then:
python -m pip install -r requirements.txt
python scripts/fetch_sources.py      # NASA downloads into git-ignored data_cache/ (about 0.80 GB)
python scripts/build_data.py         # regenerates public/data/ and provenance.json
python scripts/make_fixtures.py      # SPICE reference cases for the TypeScript tests
python scripts/validate.py           # V-1 ... V-8 -> docs/VALIDATION.md
npm install
npm test
python -m pytest scripts/tests -q
```

Display assets have their own generators: `scripts/prepare_visuals.py` (Moon model) and `node scripts/prepare_stars.mjs` (stars).

## Reference IDs and where they are used

| ID | Used in |
|---|---|
| R-DE440, R-NAIF-MOONFK, R-NAIF-LSK, R-NAIF-PCK, R-NAIF-ABCORR, R-NAIF-SPKPOS, R-NAIF-TIME, R-NAIF-FRAMES, R-NAIF-GK | M-EPHEM, M-GEOM; `build_data.py build_ephemeris`; `moonlib.py`; `ephemeris.json` |
| R-NAIF-SPKCPO, R-HORIZONS, R-DE421 | validation only (V-1, V-2, V-3) |
| R-SPICE, R-SPICE-2018, R-SPICEYPY | software citations for every SPICE call |
| R-IAU-WGCCRE | R_MOON (`constants.ts`, `moonlib.py`) |
| R-LOLA-PGDA, R-SNYDER | M-SITE, M-HORIZON, M-SLOPE, M-PATCH; `moonlib.py`; `build_data.py` |
| R-LOLA-SITES, R-MAZARICO-2011 | ridge selection (M-SITE); V-5 |
| R-LS-* | landing-site catalogue only (`landing_sites.json`); display and coordinate entry, never a computed value |
| R-LROC-1360, R-NASA-IM1, R-LROC-1408 | site coordinates (`sites_input.json`) |
| R-LROC-1401, R-CLPS, R-CP22, R-ARTEMIS3-REGIONS, R-SVS-5027, R-USGS-GAZ-MOUTON, R-USGS-LUNAR-STD, R-CHALLENGE | background / context notes only |
| R-TSI, R-TSI-MEAS, R-AU | M-POWER (`constants.ts`, `power.ts`); R-TSI also R_SUN |
| R-SEGMENT | M-SUNVIS (`power.ts diskFractionVisible`) |
| R-SST-SOA-POWER | plausibility note for A-LANDER efficiency only |
| R-SVS-MOON-KIT | display colour of the local terrain (M-PATCH) |
