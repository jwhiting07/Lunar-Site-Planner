# Calculation traceability

## Context globe (UI update)

`src/components/MoonView.tsx` renders a unit sphere with NASA SVS CGI Moon Kit
color and JPEG elevation textures. Source URLs, checksums, credit and conventions
are recorded in `public/textures/provenance.json`. Source: https://svs.gsfc.nasa.gov/4720/.
This globe is display-only: fixed viewing light and a small illustrative bump
scale are not an epoch illumination model or physical terrain displacement.
The image is aesthetically processed and includes polar fill. Scientific analysis
continues to use the separate LOLA horizon and SPICE pipeline below.
Markers use the sourced site latitude/longitude via `enuBasis`; lunar body axes
(X,Y,Z) map to Three.js (X,Z,-Y), aligning zero longitude with the texture centre.
The existing local DEM view is accessible through Local terrain. No code or
assets were copied from Moonquake Map; its simple globe presentation was the visual reference.

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
| 3-D terrain / computed display | Horizontal=(R+h)sin(s/R), up=(R+h)cos(s/R)-(R+h_site); `build_data.py terrain_patch`, `geometry.ts terrainNodeEnu` (M-PATCH) | Same DEMs; 201×201 samples at 200 m spacing, ±20 km | Optional ×3 display exaggeration; shading is not a shadow simulation; does not drive visibility |
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
| Solar clearance, visibility flag | C=el-H(az); rho=asin(R_sun/d); visible when C+rho>0; `analysis.ts instantState` (M-SUNVIS) | Computed from M-GEOM/M-HORIZON, sourced solar radius 695700 km (R-NAIF-PCK, R-TSI) |
| Visible disk fraction | x=clamp(C/rho,-1,1); f=1-(acos(x)-x sqrt(1-x²))/pi; `power.ts diskFractionVisible` | Computed circular-segment area (R-SEGMENT); straight-edge, uniform-brightness approximation |
| Earth clearance and flag | C=el-H(az); visible when C>C_min; `analysis.ts instantState` (M-EARTHVIS) | Computed from geometry/horizon, assumed default C_min=0° (A-DTE-MASK); Earth centre only |
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
