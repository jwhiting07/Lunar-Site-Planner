/**
 * Site analysis: Sun/Earth local geometry, terrain clearance, visibility
 * windows and the energy estimate for one site over one time interval.
 *
 * This module is the single authority for every number the UI shows or
 * exports; rendering code only reads its results.
 *
 * Dependency chain (details in docs/CALCULATION_TRACEABILITY.md):
 *   SPICE samples (ephemeris.ts) -> topocentric vector (minus site position)
 *   -> ENU azimuth/elevation (geometry.ts) -> clearance over H(A) (horizon.ts)
 *   -> visibility margins -> windows (windows.ts) -> power/battery (power.ts)
 */
import {
  DEFAULT_EARTH_MIN_CLEARANCE_DEG,
  DEG,
  HOUR_MS,
  R_MOON_M,
  R_SUN_KM,
  type LanderParams,
} from './constants';
import { bodyVectorKm, bodyVectorsInto, type EphemerisTable } from './ephemeris';
import { azEl, azElInto, enuBasis, sitePositionKm, sub, type EnuBasis, type Vec3 } from './geometry';
import { horizonAt, horizonDistanceAt, type HorizonMask } from './horizon';
import { diskFractionVisible, panelPowerW, simulateBattery, type BatteryResult } from './power';
import type { SiteDoc } from './types';
import {
  complementWindows,
  findWindows,
  intersectWindows,
  longestWindow,
  totalHours,
  type TimeWindow,
} from './windows';

/** Everything needed to evaluate geometry at one site. */
export interface SiteContext {
  site: SiteDoc;
  basis: EnuBasis;
  /** Body-fixed position of the observer's eye point, km. */
  observerKm: Vec3;
  /** Height of the observer above the DEM surface, m (ASSUMED, [A-OBS-HEIGHT]). */
  observerHeightM: number;
  mask: HorizonMask;
}

export function makeSiteContext(site: SiteDoc, observerHeightM: number, mask: HorizonMask): SiteContext {
  return {
    site,
    basis: enuBasis(site.lat_deg, site.lon_deg),
    observerKm: sitePositionKm(site.lat_deg, site.lon_deg, R_MOON_M + site.elevation_m + observerHeightM),
    observerHeightM,
    mask,
  };
}

/** Geometry of one body at one instant. All angles in degrees. */
export interface BodyState {
  azDeg: number;
  elDeg: number;
  /** Observer-to-body-centre distance, km. */
  distKm: number;
  /** Terrain horizon elevation H at the body's azimuth. */
  horizonDeg: number;
  /** Centre clearance C = elevation - H(azimuth). */
  clearanceDeg: number;
  /** Distance to the terrain that defines the horizon at this azimuth, m (0 for a flat mask). */
  horizonDistM: number;
}

export interface InstantState {
  tMs: number;
  sun: BodyState & {
    /** Apparent angular radius asin(R_sun / distance). */
    angularRadiusDeg: number;
    /** Visible fraction of the solar disk, 0..1. */
    diskFraction: number;
    /** Any part of the disk above the terrain horizon (upper-limb convention). */
    visible: boolean;
  };
  earth: BodyState & {
    /** Earth's centre above the mathematical horizontal plane (elevation > 0). */
    aboveFlatHorizon: boolean;
    /** Geometric direct-to-Earth opportunity: centre clearance > minimum clearance. */
    visible: boolean;
  };
}

function bodyState(ctx: SiteContext, vecKm: Vec3): BodyState {
  const ae = azEl(sub(vecKm, ctx.observerKm), ctx.basis);
  const horizonDeg = horizonAt(ctx.mask, ae.azDeg);
  return {
    azDeg: ae.azDeg,
    elDeg: ae.elDeg,
    distKm: ae.dist,
    horizonDeg,
    clearanceDeg: ae.elDeg - horizonDeg,
    horizonDistM: horizonDistanceAt(ctx.mask, ae.azDeg),
  };
}

/** Apparent angular radius of the Sun, degrees: asin(R_sun / d). [R-NAIF-PCK] */
export const sunAngularRadiusDeg = (distKm: number): number => Math.asin(R_SUN_KM / distKm) / DEG;

/** Sun and Earth geometry at an arbitrary time inside the ephemeris coverage. */
export function instantState(
  ctx: SiteContext,
  eph: EphemerisTable,
  tMs: number,
  earthMinClearanceDeg = DEFAULT_EARTH_MIN_CLEARANCE_DEG,
): InstantState {
  const sun = bodyState(ctx, bodyVectorKm(eph, tMs, 'sun'));
  const earth = bodyState(ctx, bodyVectorKm(eph, tMs, 'earth'));
  const angularRadiusDeg = sunAngularRadiusDeg(sun.distKm);
  return {
    tMs,
    sun: {
      ...sun,
      angularRadiusDeg,
      diskFraction: diskFractionVisible(sun.clearanceDeg, angularRadiusDeg),
      visible: sun.clearanceDeg + angularRadiusDeg > 0,
    },
    earth: {
      ...earth,
      aboveFlatHorizon: earth.elDeg > 0,
      visible: earth.clearanceDeg > earthMinClearanceDeg,
    },
  };
}

/** Sampled time series over the analysed interval (struct of arrays, one entry per sample). */
export interface Series {
  tMs: Float64Array;
  sunAzDeg: Float64Array;
  sunElDeg: Float64Array;
  sunHorizonDeg: Float64Array;
  sunClearanceDeg: Float64Array;
  sunRadiusDeg: Float64Array;
  sunDistKm: Float64Array;
  /** Visible fraction of the solar disk, 0..1. */
  sunDiskFraction: Float64Array;
  earthAzDeg: Float64Array;
  earthElDeg: Float64Array;
  earthHorizonDeg: Float64Array;
  earthClearanceDeg: Float64Array;
  /** 1 where any part of the solar disk is above the terrain horizon. */
  sunVisible: Uint8Array;
  /** 1 where Earth's centre clears the terrain horizon by more than the minimum clearance. */
  earthVisible: Uint8Array;
  /** Array output power, W. */
  powerW: Float64Array;
  /** Stored battery energy, Wh. */
  batteryWh: Float64Array;
}

/** Sample times: start, start + step, ... and always the exact end of the interval. */
export function sampleTimes(startMs: number, endMs: number, stepMs: number): Float64Array {
  if (![startMs, endMs, stepMs].every(Number.isFinite) || !(endMs > startMs) || stepMs <= 0) {
    throw new RangeError('analysis requires a finite, positive interval and sample spacing');
  }
  const k = Math.floor((endMs - startMs) / stepMs);
  const aligned = startMs + k * stepMs === endMs;
  const t = new Float64Array(aligned ? k + 1 : k + 2);
  for (let i = 0; i <= k; i++) t[i] = startMs + i * stepMs;
  if (!aligned) t[k + 1] = endMs;
  return t;
}

export interface Metrics {
  /** Length of the analysed interval, h. */
  intervalHours: number;
  sunlitHours: number;
  /** Fraction of the interval with any part of the Sun visible, 0..1. */
  sunlitFraction: number;
  earthVisibleHours: number;
  earthVisibleFraction: number;
  /** Time with both Sun and Earth visible, h. */
  bothHours: number;
  bothFraction: number;
  /** Longest continuous darkness and communication blackout (null if none occurs). */
  longestDarkness: TimeWindow | null;
  longestBlackout: TimeWindow | null;
  sunWindows: TimeWindow[];
  earthWindows: TimeWindow[];
  bothWindows: TimeWindow[];
  darknessWindows: TimeWindow[];
  blackoutWindows: TimeWindow[];
  /** Time-average of the visible solar-disk fraction, 0..1. */
  meanDiskFraction: number;
  /** Same fractions for the mathematical flat horizon H = 0 (shows the effect of terrain). */
  sunlitFractionFlat: number;
  earthVisibleFractionFlat: number;
  sunElevationMinDeg: number;
  sunElevationMaxDeg: number;
  earthElevationMinDeg: number;
  earthElevationMaxDeg: number;
  /** Mean terrain horizon elevation at the Sun's / Earth's azimuths over the interval, degrees. */
  meanHorizonAtSunDeg: number;
  meanHorizonAtEarthDeg: number;
}

export interface AnalysisResult {
  site: SiteDoc;
  /** Runtime terrain profile used by this analysis, also shared by the sky chart. */
  horizonMask?: HorizonMask;
  terrainAware: boolean;
  startMs: number;
  endMs: number;
  /** Sample spacing, ms (the last step may be shorter). */
  stepMs: number;
  /** Internal integration grid; the public series retains the hourly display grid. */
  calculation?: { baseStepMs: number; minStepMs: number; samples: number };
  observerHeightM: number;
  earthMinClearanceDeg: number;
  params: LanderParams;
  series: Series;
  metrics: Metrics;
  battery: BatteryResult;
}

export interface AnalysisOptions {
  startMs: number;
  endMs: number;
  /** Sample spacing; defaults to the ephemeris sample spacing (1 h). */
  stepMs?: number;
  earthMinClearanceDeg?: number;
  params: LanderParams;
  /** Internal validation/refinement grid, including both exact interval endpoints. */
  timesMs?: Float64Array;
}

function minMax(a: Float64Array): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < lo) lo = a[i];
    if (a[i] > hi) hi = a[i];
  }
  return [lo, hi];
}

/** Time-weighted (trapezoidal) mean of a sampled quantity. */
function timeMean(t: Float64Array, v: Float64Array): number {
  let acc = 0;
  for (let i = 0; i < t.length - 1; i++) acc += 0.5 * (v[i] + v[i + 1]) * (t[i + 1] - t[i]);
  return acc / (t[t.length - 1] - t[0]);
}

/** Run the full analysis for one site. Pure function of its arguments. */
export function analyzeSite(ctx: SiteContext, eph: EphemerisTable, opts: AnalysisOptions): AnalysisResult {
  const stepMs = opts.stepMs ?? eph.stepMs;
  const minClear = opts.earthMinClearanceDeg ?? DEFAULT_EARTH_MIN_CLEARANCE_DEG;
  const tMs = opts.timesMs ?? sampleTimes(opts.startMs, opts.endMs, stepMs);
  if (tMs.length < 2 || tMs[0] !== opts.startMs || tMs[tMs.length - 1] !== opts.endMs
    || tMs.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= tMs[i - 1]))) {
    throw new RangeError('integration samples must be finite, increasing and cover the exact interval');
  }
  const n = tMs.length;
  const f64 = () => new Float64Array(n);
  const s: Series = {
    tMs,
    sunAzDeg: f64(), sunElDeg: f64(), sunHorizonDeg: f64(), sunClearanceDeg: f64(),
    sunRadiusDeg: f64(), sunDistKm: f64(), sunDiskFraction: f64(),
    earthAzDeg: f64(), earthElDeg: f64(), earthHorizonDeg: f64(), earthClearanceDeg: f64(),
    sunVisible: new Uint8Array(n), earthVisible: new Uint8Array(n),
    powerW: f64(), batteryWh: f64(),
  };
  // Margins whose sign defines visibility; flat-horizon versions for the terrain-effect comparison.
  const sunMargin = f64(), earthMargin = f64(), sunMarginFlat = f64(), earthMarginFlat = f64();

  // Hot loop: the same geometry as instantState (azElInto is the shared core),
  // without per-sample allocation.
  const vec = new Float64Array(6);
  const ae = new Float64Array(3);
  const [ox, oy, oz] = ctx.observerKm;
  for (let i = 0; i < n; i++) {
    bodyVectorsInto(eph, tMs[i], vec);

    azElInto(vec[0] - ox, vec[1] - oy, vec[2] - oz, ctx.basis, ae);
    const sunAz = ae[0], sunEl = ae[1], sunDist = ae[2];
    const sunH = horizonAt(ctx.mask, sunAz);
    const sunClear = sunEl - sunH;
    const rho = sunAngularRadiusDeg(sunDist);
    const disk = diskFractionVisible(sunClear, rho);

    azElInto(vec[3] - ox, vec[4] - oy, vec[5] - oz, ctx.basis, ae);
    const earthAz = ae[0], earthEl = ae[1];
    const earthH = horizonAt(ctx.mask, earthAz);
    const earthClear = earthEl - earthH;

    s.sunAzDeg[i] = sunAz;
    s.sunElDeg[i] = sunEl;
    s.sunHorizonDeg[i] = sunH;
    s.sunClearanceDeg[i] = sunClear;
    s.sunRadiusDeg[i] = rho;
    s.sunDistKm[i] = sunDist;
    s.sunDiskFraction[i] = disk;
    s.earthAzDeg[i] = earthAz;
    s.earthElDeg[i] = earthEl;
    s.earthHorizonDeg[i] = earthH;
    s.earthClearanceDeg[i] = earthClear;
    sunMargin[i] = sunClear + rho;
    earthMargin[i] = earthClear - minClear;
    s.sunVisible[i] = sunMargin[i] > 0 ? 1 : 0;
    s.earthVisible[i] = earthMargin[i] > 0 ? 1 : 0;
    s.powerW[i] = panelPowerW(opts.params, sunDist, sunEl, disk);
    sunMarginFlat[i] = sunEl + rho;
    earthMarginFlat[i] = earthEl - minClear;
  }

  const battery = simulateBattery(tMs, s.powerW, opts.params);
  s.batteryWh.set(battery.energyWh);

  const sunWindows = findWindows(tMs, sunMargin);
  const earthWindows = findWindows(tMs, earthMargin);
  const bothWindows = intersectWindows(sunWindows, earthWindows);
  const darknessWindows = complementWindows(sunWindows, opts.startMs, opts.endMs);
  const blackoutWindows = complementWindows(earthWindows, opts.startMs, opts.endMs);
  const intervalHours = (opts.endMs - opts.startMs) / HOUR_MS;
  const sunlitHours = totalHours(sunWindows);
  const earthVisibleHours = totalHours(earthWindows);
  const bothHours = totalHours(bothWindows);
  const [sunElMin, sunElMax] = minMax(s.sunElDeg);
  const [earthElMin, earthElMax] = minMax(s.earthElDeg);

  const metrics: Metrics = {
    intervalHours,
    sunlitHours,
    sunlitFraction: sunlitHours / intervalHours,
    earthVisibleHours,
    earthVisibleFraction: earthVisibleHours / intervalHours,
    bothHours,
    bothFraction: bothHours / intervalHours,
    longestDarkness: longestWindow(darknessWindows),
    longestBlackout: longestWindow(blackoutWindows),
    sunWindows, earthWindows, bothWindows, darknessWindows, blackoutWindows,
    meanDiskFraction: timeMean(tMs, s.sunDiskFraction),
    sunlitFractionFlat: totalHours(findWindows(tMs, sunMarginFlat)) / intervalHours,
    earthVisibleFractionFlat: totalHours(findWindows(tMs, earthMarginFlat)) / intervalHours,
    sunElevationMinDeg: sunElMin,
    sunElevationMaxDeg: sunElMax,
    earthElevationMinDeg: earthElMin,
    earthElevationMaxDeg: earthElMax,
    meanHorizonAtSunDeg: timeMean(tMs, s.sunHorizonDeg),
    meanHorizonAtEarthDeg: timeMean(tMs, s.earthHorizonDeg),
  };

  return {
    site: ctx.site,
    terrainAware: ctx.mask.terrainAware,
    startMs: opts.startMs,
    endMs: opts.endMs,
    stepMs,
    observerHeightM: ctx.observerHeightM,
    earthMinClearanceDeg: minClear,
    params: opts.params,
    series: s,
    metrics,
    battery,
  };
}

/** Final mission calculation. Keep the familiar hourly chart/export series while
 * integrating at 15 minutes, with 5-minute probes around grazing visibility and
 * partial solar disks. This refines the interpolation, not the source ephemeris
 * or terrain resolution. Events shorter than the probe spacing can still be missed.
 * analyzeSite remains the explicit fixed-grid evaluator for screening/validation.
 */
export function analyzeMission(ctx: SiteContext, eph: EphemerisTable, opts: AnalysisOptions): AnalysisResult {
  const baseStepMs = 15 * 60_000, minStepMs = 5 * 60_000;
  const base = analyzeSite(ctx, eph, { ...opts, timesMs: undefined, stepMs: baseStepMs });
  const times: number[] = [];
  const s = base.series;
  for (let i = 0; i < s.tMs.length - 1; i++) {
    const a = s.tMs[i], b = s.tMs[i + 1];
    times.push(a);
    const near = (j: number) => Math.abs(s.sunClearanceDeg[j]) < s.sunRadiusDeg[j] + 0.15
      || Math.abs(s.earthClearanceDeg[j] - base.earthMinClearanceDeg) < 0.15;
    if (near(i) || near(i + 1) || s.sunVisible[i] !== s.sunVisible[i + 1]
      || s.earthVisible[i] !== s.earthVisible[i + 1]) {
      for (let t = a + minStepMs; t < b; t += minStepMs) times.push(t);
    }
  }
  times.push(opts.endMs);
  // Include display anchors even for fractional-hour mission durations.
  const displayTimes = sampleTimes(opts.startMs, opts.endMs, HOUR_MS);
  const grid = Float64Array.from([...new Set([...times, ...displayTimes])].sort((a, b) => a - b));
  const fine = grid.length === s.tMs.length ? base : analyzeSite(ctx, eph, { ...opts, stepMs: baseStepMs, timesMs: grid });
  const indices: number[] = [];
  let j = 0;
  for (const t of displayTimes) { while (fine.series.tMs[j] < t) j++; indices.push(j); }
  const series = {} as Series;
  for (const key of Object.keys(fine.series) as (keyof Series)[]) {
    const values = fine.series[key];
    const selected = indices.map(index => values[index]);
    // These assignments preserve the struct-of-arrays API consumed by the UI.
    if (key === 'sunVisible' || key === 'earthVisible') series[key] = Uint8Array.from(selected);
    else series[key] = Float64Array.from(selected);
  }
  return { ...fine, stepMs: HOUR_MS, series, battery: { ...fine.battery, energyWh: series.batteryWh },
    calculation: { baseStepMs, minStepMs, samples: fine.series.tMs.length } };
}
