/**
 * Registry of methods and assumptions behind every displayed quantity.
 *
 * This is the data model of the in-app provenance panel and uses the same IDs
 * as docs/CALCULATION_TRACEABILITY.md and docs/REFERENCES_AND_ASSUMPTIONS.md.
 * `refs` are reference IDs resolved through public/data/provenance.json.
 */

/** sourced = taken from an external dataset or publication; computed = calculated from sourced inputs;
 *  assumed = model input chosen by this project; approximated = deliberate simplification. */
export type Classification = 'sourced' | 'computed' | 'assumed' | 'approximated';

export interface MethodDoc {
  id: string;
  title: string;
  kind: Classification;
  /** Plain-language description. */
  summary: string;
  /** Equation(s) or rule, plain text. */
  formula?: string;
  /** Inputs, by method ID or dataset name. */
  inputs?: string[];
  refs: string[];
  limitations: string[];
  /** Implementation locations. */
  code: string[];
}

export const METHODS: MethodDoc[] = [
  {
    id: 'M-PLAN', title: 'Mission targets and search', kind: 'approximated',
    summary: 'A scenario meets targets when its unrounded sunlight and Earth-visible percentages meet the chosen minima and its optional darkness and blackout durations stay within their limits. The initial 50% targets are editable project assumptions, not NASA requirements. Power does not affect this verdict.',
    formula: 'Rank by all targets met, then sum of normalized target shortfalls, then total sunlight + Earth-visible fractions. Break ties by distance (km) + date offset (days).',
    refs: [],
    limitations: [
      'Custom coordinates use polar LOLA terrain where covered, otherwise a lower-resolution global regional skyline when available. Exact search-grid profiles are precomputed. Unavailable terrain retains an explicitly labelled flat-horizon estimate at zero reference-sphere elevation.',
      'Local search samples the center and 8 bearings on each of two radius rings. Unrestricted search samples 48 equal-area sphere points, a neutral equatorial point and the shipped terrain sites. Dates sample daily or at a whole-day spacing that limits the grid to 32 dates, including both boundaries.',
      'Duration ranges sample at most eight lengths, including both endpoints. Exact coordinates or an exact landing date remain fixed when other fields are searched. Scenarios extending beyond ephemeris coverage are excluded. Ranking uses visibility targets and availability, not a guarantee of the longest possible mission.',
      'Search screens at a whole-hour spacing of ceil(duration hours / 168), at least one hour. A diverse shortlist of up to 48 missions (at most four dates per location and duration) receives exact-coordinate terrain where available and refined integration before reranking. The best five are shown, with at most two dates per location and duration. Screening and sampling can miss better options; no global optimum is established.',
      'Nearby alternatives test date offsets within 7 days at the same site, and 16 points within 50 km on the original date. Duration and targets are preserved. The search is bounded, not a global optimum guarantee.',
    ],
    code: ['src/science/planner.ts', 'src/MissionPlanner.tsx'],
  },
  {
    id: 'M-SITE',
    title: 'Site coordinates and elevation',
    kind: 'sourced',
    summary:
      'Coordinates may be entered or selected on the Moon. Shipped points use precomputed LOLA profiles. The local calculator samples the same DEMs for custom locations with sufficient coverage. Flat-horizon estimates use zero reference-sphere elevation.',
    formula: 'h_site = bilinear(LDEM_80S_80MPP_ADJ, stereo(lat, lon)); observer radius r_o = 1737.4 km + h_site + h_obs',
    inputs: ['scripts/sites_input.json', 'LDEM_80S_80MPP_ADJ.TIF', 'A-OBS-HEIGHT'],
    refs: ['R-LROC-1408', 'R-LROC-1360', 'R-NASA-IM1', 'R-LOLA-SITES', 'R-MAZARICO-2011', 'R-LOLA-PGDA'],
    limitations: [
      'Published lander coordinates are rounded (IM-1: 0.01 deg, about 300 m); the analysis point may not be the exact touchdown spot.',
      'Representative points are chosen by this project and are not mission landing targets.',
      'The 80 m DEM cannot represent metre-scale relief around a lander (for example the 20 m crater in which IM-2 came to rest).',
    ],
    code: ['scripts/build_data.py select_site_point', 'src/science/analysis.ts makeSiteContext'],
  },
  {
    id: 'M-EPHEM',
    title: 'Sun and Earth positions (SPICE)',
    kind: 'computed',
    summary:
      'Apparent positions of the Sun and Earth relative to the Moon centre are computed offline with NASA SPICE (DE440) in the lunar Mean-Earth body-fixed frame, once per UTC hour from 13 September 1959 (the start of the Luna 2 arrival date, 13 September 1959 UTC) to 1 January 2029, and interpolated linearly between hours.',
    formula:
      'r_body(t) = spkpos(body, t, MOON_ME_DE440_ME421, LT+S, MOON) [km]; between samples r(t) = (1 - w) r_i + w r_(i+1)',
    inputs: ['de440s.bsp', 'moon_pa_de440_200625.bpc', 'moon_de440_250416.tf', 'naif0012.tls', 'pck00011.tpc'],
    refs: ['R-DE440', 'R-NAIF-MOONFK', 'R-NAIF-LSK', 'R-NAIF-ABCORR', 'R-NAIF-SPKPOS', 'R-NAIF-TIME'],
    limitations: [
      'Light time and stellar aberration are evaluated for the Moon centre rather than the surface point (difference measured in docs/VALIDATION.md).',
      'UTC after 2026 assumes no new leap second; each future leap second would shift times by 1 s.',
      'Before 1972-01-01 the SPICE leapseconds kernel has no entries, so UTC is treated with a constant TAI-UTC offset while the historical UTC used drifting "rubber" seconds: pre-1972 times can be up to about 9 s off (about 0.001 deg of solar motion).',
      'The terrain horizon comes from today\'s LOLA topography; it is applied unchanged to historical dates.',
      'Linear interpolation error is below 0.001 deg (recorded in ephemeris.json).',
    ],
    code: ['scripts/build_data.py build_ephemeris, build_history_ephemeris', 'src/science/ephemeris.ts bodyVectorKm'],
  },
  {
    id: 'M-GEOM',
    title: 'Local azimuth and elevation',
    kind: 'computed',
    summary:
      'The observer-to-body vector is the Moon-centred body vector minus the observer position. It is projected on the local East-North-Up axes of the site to obtain azimuth (clockwise from north) and elevation (above the horizontal plane).',
    formula:
      'v = r_body - r_obs;  E = (-sin L, cos L, 0), N = (-sin p cos L, -sin p sin L, cos p), U = (cos p cos L, cos p sin L, sin p);  az = atan2(v.E, v.N) mod 360;  el = asin(v.U / |v|)',
    inputs: ['M-EPHEM', 'M-SITE'],
    refs: ['R-NAIF-FRAMES', 'R-NAIF-MOONFK', 'R-HORIZONS'],
    limitations: [
      '"Up" is the planetocentric radial direction of the 1737.4 km reference sphere; the true local gravity vertical can differ slightly.',
      'No atmosphere, hence no refraction.',
    ],
    code: ['src/science/geometry.ts enuBasis, azEl', 'scripts/moonlib.py az_el_deg'],
  },
  {
    id: 'M-HORIZON',
    title: 'Terrain horizon H(A)',
    kind: 'computed',
    summary:
      'For each azimuth (0.5 deg steps) a ray is marched along the lunar surface out to 600 km. At each sample the LOLA terrain height is converted to an elevation angle as seen from the observer, including lunar curvature; the highest angle along the ray is the horizon in that direction.',
    formula:
      'theta = s / R;  elev(s) = atan2((R + h(s)) cos(theta) - r_o, (R + h(s)) sin(theta));  H(A) = max over s of elev(s);  between table azimuths H is interpolated linearly',
    inputs: ['LDEM_80S_80MPP_ADJ.TIF (80 m)', 'LDEM_60S_240MPP_ADJ.TIF (240 m)', 'ldem_16_uint.tif (global fallback)', 'M-SITE', 'A-OBS-HEIGHT'],
    refs: ['R-LOLA-PGDA', 'R-SVS-MOON-KIT', 'R-SNYDER', 'R-MAZARICO-2011'],
    limitations: [
      'The south-polar DEM samples at 80 or 240 m. The global fallback samples at about 1.9 km per pixel at the equator and describes regional relief.',
      'Azimuth sampling is 0.5 deg; narrow distant peaks between rays can be missed.',
      'The same horizon is used for the whole solar disk width (0.53 deg).',
      'The 3-D view covers +/- 20 km around the site; the horizon can come from farther away (distance shown in the sky view).',
    ],
    code: ['scripts/moonlib.py compute_horizon, elevation_angle_deg', 'src/science/horizon.ts horizonAt'],
  },
  {
    id: 'M-SUNVIS',
    title: 'Solar visibility',
    kind: 'computed',
    summary:
      'The Sun counts as visible when any part of its disk is above the terrain horizon at its azimuth. The visible fraction of the disk is also computed and scales the power estimate.',
    formula:
      'C_s = el_s - H(az_s);  rho = asin(R_sun / d);  visible if C_s + rho > 0;  f_disk = 1 - (acos(x) - x sqrt(1 - x^2)) / pi with x = C_s / rho clamped to [-1, 1]',
    inputs: ['M-GEOM', 'M-HORIZON', 'R_sun = 695700 km'],
    refs: ['R-NAIF-PCK', 'R-TSI', 'R-SEGMENT', 'R-MAZARICO-2011'],
    limitations: [
      'Binary state; "visible" includes times when only a sliver of the disk shows.',
      'The horizon is treated as a straight level edge across the disk; limb darkening is ignored.',
      'Same convention as the NASA LOLA illumination maps (sunlit by any fraction of the disk).',
    ],
    code: ['src/science/analysis.ts instantState, analyzeSite', 'src/science/power.ts diskFractionVisible'],
  },
  {
    id: 'M-EARTHVIS',
    title: 'Earth visibility (geometric direct-to-Earth opportunity)',
    kind: 'computed',
    summary:
      'Earth counts as visible when its centre is above the terrain horizon at its azimuth by more than the chosen minimum clearance. This is line-of-sight geometry only.',
    formula: 'C_e = el_e - H(az_e);  geometric opportunity if C_e > C_min (default 0 deg)',
    inputs: ['M-GEOM', 'M-HORIZON', 'A-DTE-MASK'],
    refs: ['R-MAZARICO-2011'],
    limitations: [
      'Not a radio link assessment: no antenna pattern, pointing, transmitter power, data rate or ground-station availability.',
      'Uses the centre of Earth (apparent radius about 0.9 to 1.0 deg); a station near the limb could appear or disappear earlier or later. The NASA LOLA Earth-visibility maps instead count Earth as visible when any part of its disc is unobscured, which gives higher fractions (docs/VALIDATION.md V-5).',
      'Which Earth ground station faces the Moon at a given time is not modelled.',
    ],
    code: ['src/science/analysis.ts instantState, analyzeSite'],
  },
  {
    id: 'M-WINDOWS',
    title: 'Visibility windows and durations',
    kind: 'computed',
    summary:
      'Final mission summaries integrate on a 15-minute grid with 5-minute probes near the Sun or Earth horizon and across detected visibility transitions. The chart and exported series retain hourly samples. Windows use linear margin crossings on the refined grid; totals sum those window lengths.',
    formula: 't_c = t_i + m_i / (m_i - m_(i+1)) (t_(i+1) - t_i);  hours = sum(end - start);  fraction = hours / interval length',
    inputs: ['M-SUNVIS', 'M-EARTHVIS'],
    refs: [],
    limitations: [
      'Events between 15-minute probes, or between 5-minute probes near a detected grazing interval, can still be missed. Finer evaluation interpolates the original hourly ephemeris; it does not improve the source terrain resolution. Mission convergence and direct-SPICE checks are recorded in docs/VALIDITY.md.',
      'Windows cut by the start or end of the selected interval are marked truncated; their true length is at least the value shown.',
    ],
    code: ['src/science/windows.ts findWindows, complementWindows, intersectWindows'],
  },
  {
    id: 'M-POWER',
    title: 'Solar array power',
    kind: 'computed',
    summary:
      'Array power is solar irradiance at the actual Sun distance, times panel area, efficiency, the cosine of the incidence angle for the chosen pointing mode, and the visible fraction of the solar disk.',
    formula:
      'S(r) = 1361 W/m^2 (1 au / r)^2;  P = S(r) A eta cos(i) f_disk;  cos(i) = 1 (Sun-tracking), cos(el) (vertical, azimuth-tracking), max(0, sin(el)) (horizontal)',
    inputs: ['M-SUNVIS', 'M-GEOM', 'A-LANDER'],
    refs: ['R-TSI', 'R-TSI-MEAS', 'R-AU'],
    limitations: [
      'Engineering estimate with assumed panel area and efficiency; not a model of any NASA CLPS lander.',
      'No temperature dependence, degradation, dust, self-shadowing or reflected light from terrain.',
    ],
    code: ['src/science/power.ts solarFluxWm2, incidenceFactor, panelPowerW'],
  },
  {
    id: 'M-BATTERY',
    title: 'Battery energy balance',
    kind: 'computed',
    summary:
      'Generation is linear between integration samples. Net power is integrated with splits at charge/discharge reversals and solved empty/full crossing times. Stored energy stays between empty and full; unserved and curtailed energy are accounted separately. The hourly chart samples the refined battery history.',
    formula:
      'E_gen = integral P(t) dt; dE/dt = P(t) - P_load with 0 <= E <= E_cap; split linear P(t) at P_load and solve empty/full times; account unserved and curtailed energy',
    inputs: ['M-POWER', 'A-LANDER', 'A-BATT-INIT'],
    refs: [],
    limitations: [
      'Ideal storage (no charge/discharge losses), constant load, battery full at the start of the interval.',
      'No survival heaters, hibernation modes or low-temperature limits.',
    ],
    code: ['src/science/power.ts simulateBattery'],
  },
  {
    id: 'M-SLOPE',
    title: 'Terrain slope (context)',
    kind: 'sourced',
    summary: 'Slope value of the LOLA 80 m slope map at the pixel containing the site, and the mean of the 3 x 3 surrounding pixels.',
    inputs: ['LDSM_80S_80MPP_ADJ.TIF'],
    refs: ['R-LOLA-PGDA'],
    limitations: ['Regional slope over an 80 m baseline; context only, not a landing-hazard or safety assessment.'],
    code: ['scripts/build_data.py slope_at'],
  },
  {
    id: 'M-PATCH',
    title: '3-D terrain patch',
    kind: 'computed',
    summary:
      'A 201 x 201 grid of LOLA heights at 200 m spacing, covering +/- 20 km around the site with lunar curvature and a NASA SVS color texture.',
    formula: 'node at arc s, azimuth A: horizontal = (R + h) sin(s / R), up = (R + h) cos(s / R) - (R + h_site)',
    inputs: ['LDEM_80S_80MPP_ADJ.TIF', 'LDEM_60S_240MPP_ADJ.TIF'],
    refs: ['R-LOLA-PGDA', 'R-SVS-MOON-KIT'],
    limitations: [
      'Display only. The color texture includes lower resolution polar fill. Visibility is computed from the horizon mask, which uses terrain out to 600 km.',
      'Shading in the 3-D view is a simple directional light and does not ray-trace shadows.',
    ],
    code: ['scripts/build_data.py terrain_patch', 'src/science/geometry.ts terrainNodeEnu'],
  },
  {
    id: 'A-OBS-HEIGHT',
    title: 'Observer height above the surface',
    kind: 'assumed',
    summary:
      'The Sun/Earth observer (solar array and antenna reference point) is placed 2 m above the DEM surface. Demonstration value, not a spacecraft specification; changing it requires regenerating the horizon masks.',
    refs: [],
    limitations: ['Real array and antenna heights differ between landers and between components.'],
    code: ['scripts/build_data.py OBSERVER_HEIGHT_M'],
  },
  {
    id: 'A-LANDER',
    title: 'Lander power parameters',
    kind: 'assumed',
    summary:
      'Panel area, array efficiency, electrical load and battery capacity are user-adjustable demonstration defaults (2 m^2, 28 %, 150 W, 1500 Wh) for a generic small lander. They are not NASA or vendor specifications.',
    refs: [],
    limitations: ['Results of the energy model are only as meaningful as these inputs.'],
    code: ['src/science/constants.ts DEFAULT_LANDER'],
  },
  {
    id: 'A-BATT-INIT',
    title: 'Initial battery state',
    kind: 'assumed',
    summary: 'The battery is assumed full at the start of the analysed interval.',
    refs: [],
    limitations: ['A different initial charge shifts when a deficit first appears.'],
    code: ['src/science/constants.ts INITIAL_STATE_OF_CHARGE'],
  },
  {
    id: 'A-DTE-MASK',
    title: 'Earth minimum clearance',
    kind: 'assumed',
    summary:
      'Minimum angle by which Earth centre must clear the terrain for a geometric direct-to-Earth opportunity. Default 0 deg (pure line of sight); adjustable.',
    refs: [],
    limitations: ['Real links need margin above the terrain for multipath and antenna pattern; the right value is mission-specific.'],
    code: ['src/science/constants.ts DEFAULT_EARTH_MIN_CLEARANCE_DEG'],
  },
  {
    id: 'A-HMAX',
    title: 'Bound on terrain beyond the sampled range',
    kind: 'assumed',
    summary:
      'Rays stop at 600 km. To show nothing farther could matter, a hypothetical 11 km high peak (higher than any terrain in the DEMs used) is placed at the end of each ray; it stays at least several degrees below the computed horizon at every azimuth (margin stored per site).',
    refs: ['R-LOLA-PGDA'],
    limitations: ['Bound only; it is not used in any displayed value.'],
    code: ['scripts/moonlib.py unseen_terrain_bound_deg'],
  },
];

export const METHOD_BY_ID: Record<string, MethodDoc> = Object.fromEntries(METHODS.map((m) => [m.id, m]));
