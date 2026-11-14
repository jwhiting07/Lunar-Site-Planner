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
import { bodyVectorKm, type EphemerisTable } from './ephemeris';
import { azEl, enuBasis, sitePositionKm, sub, type EnuBasis, type Vec3 } from './geometry';
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
  if (!(endMs > startMs)) throw new RangeError('analysis interval must have positive length');
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
  terrainAware: boolean;
  startMs: number;
  endMs: number;
  /** Sample spacing, ms (the last step may be shorter). */
  stepMs: number;
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
  const tMs = sampleTimes(opts.startMs, opts.endMs, stepMs);
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

  for (let i = 0; i < n; i++) {
    const st = instantState(ctx, eph, tMs[i], minClear);
    s.sunAzDeg[i] = st.sun.azDeg;
    s.sunElDeg[i] = st.sun.elDeg;
    s.sunHorizonDeg[i] = st.sun.horizonDeg;
    s.sunClearanceDeg[i] = st.sun.clearanceDeg;
    s.sunRadiusDeg[i] = st.sun.angularRadiusDeg;
    s.sunDistKm[i] = st.sun.distKm;
    s.sunDiskFraction[i] = st.sun.diskFraction;
    s.earthAzDeg[i] = st.earth.azDeg;
    s.earthElDeg[i] = st.earth.elDeg;
    s.earthHorizonDeg[i] = st.earth.horizonDeg;
    s.earthClearanceDeg[i] = st.earth.clearanceDeg;
    s.sunVisible[i] = st.sun.visible ? 1 : 0;
    s.earthVisible[i] = st.earth.visible ? 1 : 0;
    s.powerW[i] = panelPowerW(opts.params, st.sun.distKm, st.sun.elDeg, st.sun.diskFraction);
    sunMargin[i] = st.sun.clearanceDeg + st.sun.angularRadiusDeg;
    earthMargin[i] = st.earth.clearanceDeg - minClear;
    sunMarginFlat[i] = st.sun.elDeg + st.sun.angularRadiusDeg;
    earthMarginFlat[i] = st.earth.elDeg - minClear;
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
