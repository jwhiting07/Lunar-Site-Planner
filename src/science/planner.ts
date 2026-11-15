import { analyzeMission, analyzeSite, makeSiteContext, type AnalysisResult } from './analysis';
import { DEG, HOUR_MS, R_MOON_M, type LanderParams } from './constants';
import { flatHorizon, type HorizonMask } from './horizon';
import type { EphemerisTable } from './ephemeris';
import type { SiteDoc } from './types';
import { windowHours } from './windows';

export const DAY = 24 * HOUR_MS;
export interface Point { lat: number; lon: number }
export interface Targets { sunlight: number; earth: number; maxDarkHours: number | null; maxBlackoutHours: number | null }
export const DEFAULT_TARGETS: Targets = { sunlight: 50, earth: 50, maxDarkHours: null, maxBlackoutHours: null };
export const normalizeLon = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;

/** Arbitrary coordinates use a reference sphere, never another site's terrain mask. */
export function coordinateSite(point: Point, known: SiteDoc[] = []): SiteDoc {
  const lon = normalizeLon(point.lon);
  const exact = known.find(s => Math.abs(s.lat_deg - point.lat) < 1e-8 && Math.abs(normalizeLon(s.lon_deg - lon)) < 1e-8);
  if (exact) return exact;
  return {
    id: `point-${point.lat}-${lon}`, name: 'Selected location', short: 'Selected location',
    lat_deg: point.lat, lon_deg: lon, coord_class: 'representative_point', coord_refs: [],
    coord_note: 'User-selected coordinates; reference sphere with no local terrain.', context_refs: [], selection: null,
    elevation_m: 0, elevation_source: 'Reference sphere assumption', published_elevation_m: null,
    slope: { pixel_deg: NaN, mean3x3_deg: NaN, source: '', note: 'Not available' }, stereo_xy_m: [0, 0], terrain_aware: false,
    horizon: { file: '', layout: '', n_az: 360, az_step_deg: 1, min_deg: 0, max_deg: 0, mean_deg: 0,
      max_obstruction_distance_km: 0, fraction_azimuths_beyond_patch: 0, coverage_min_km: 0, unseen_terrain_margin_min_deg: 0, samples_from_240m_dem_fraction: 0 },
    terrain: { file: '', n: 0, half_width_m: 0, spacing_m: 0, layout: '', min_m: 0, max_m: 0, samples_from_240m_dem_fraction: 0 },
  };
}

export function assessment(r: AnalysisResult, t: Targets) {
  const dark = r.metrics.longestDarkness ? windowHours(r.metrics.longestDarkness) : 0;
  const blackout = r.metrics.longestBlackout ? windowHours(r.metrics.longestBlackout) : 0;
  const checks = [
    { label: 'Sunlight', actual: r.metrics.sunlitFraction * 100, target: t.sunlight, maximum: false },
    { label: 'Earth visibility', actual: r.metrics.earthVisibleFraction * 100, target: t.earth, maximum: false },
    ...(t.maxDarkHours === null ? [] : [{ label: 'Longest darkness', actual: dark, target: t.maxDarkHours, maximum: true }]),
    ...(t.maxBlackoutHours === null ? [] : [{ label: 'Longest blackout', actual: blackout, target: t.maxBlackoutHours, maximum: true }]),
  ];
  const failures = checks.filter(c => c.maximum ? c.actual > c.target + 1e-7 : c.actual + 1e-7 < c.target);
  const deficit = failures.reduce((sum, c) => sum + Math.abs(c.actual - c.target) / Math.max(1, c.target), 0);
  return { good: failures.length === 0, failures, deficit, dark, blackout };
}

export function distanceKm(a: Point, b: Point) {
  const dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return R_MOON_M / 1000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function destination(p: Point, km: number, bearingDeg: number): Point {
  const d = km / (R_MOON_M / 1000), b = bearingDeg * DEG, lat = p.lat * DEG;
  // The usual longitude formula is 0/0 at a pole and collapses distinct
  // bearings. Use the limiting ENU convention, also used by the terrain rays.
  if (Math.abs(p.lat) === 90) return {
    lat: Math.sign(p.lat) * (90 - d / DEG),
    lon: normalizeLon(p.lon + (p.lat < 0 ? bearingDeg : 180 - bearingDeg)),
  };
  const next = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b))));
  return { lat: next / DEG, lon: normalizeLon(p.lon + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(next)) / DEG) };
}

export function locationGrid(center: Point, radiusKm: number | null): Point[] {
  if (radiusKm !== null) return [center, ...[radiusKm / 2, radiusKm].flatMap(r => Array.from({ length: 8 }, (_, i) => destination(center, r, i * 45)))];
  // Equal-area Fibonacci sphere. Include the entered point as a baseline.
  return [center, ...Array.from({ length: 48 }, (_, i) => ({ lat: Math.asin(1 - 2 * (i + 0.5) / 48) / DEG, lon: normalizeLon(i * 137.507764) }))];
}

export function dateGrid(start: number, end: number): number[] {
  if (end < start) throw new RangeError('The last landing date must follow the first.');
  const step = Math.max(1, Math.ceil((end - start) / DAY / 30)) * DAY;
  const out: number[] = [];
  for (let t = start; t <= end; t += step) out.push(t);
  if (out.at(-1) !== end) out.push(end);
  return out;
}

/** Bounded duration samples, including both limits. Values are in days. */
export function durationGrid(min: number, max = min): number[] {
  if (![min, max].every(value => Number.isFinite(value) && value >= 1 / 24 && value <= 365) || max < min) {
    throw new RangeError('Duration must be between 1 hour and 365 days, with maximum at least minimum.');
  }
  if (min === max) return [min];
  const intervals = Math.min(7, Math.max(1, Math.ceil(max - min)));
  return Array.from({ length: intervals + 1 }, (_, i) => i === intervals ? max : min + (max - min) * i / intervals);
}

export interface Candidate { result: AnalysisResult; targets: Targets }
export function compareCandidates(a: Candidate, b: Candidate, origin: Point | null, startMs: number) {
  const x = assessment(a.result, a.targets), y = assessment(b.result, b.targets);
  if (x.good !== y.good) return x.good ? -1 : 1;
  if (Math.abs(x.deficit - y.deficit) > 1e-7) return x.deficit - y.deficit;
  const availability = (r: AnalysisResult) => r.metrics.sunlitFraction + r.metrics.earthVisibleFraction;
  const delta = availability(b.result) - availability(a.result);
  if (Math.abs(delta) > 1e-7) return delta;
  // Prefer terrain-backed values on ties. A flat horizon is not a rigorous upper
  // bound: elevated observers can have a negative terrain skyline.
  if (a.result.terrainAware !== b.result.terrainAware) return a.result.terrainAware ? -1 : 1;
  // With no entered location (unrestricted search) distance does not matter, only the date offset.
  const cost = (r: AnalysisResult) => (origin ? distanceKm(origin, { lat: r.site.lat_deg, lon: r.site.lon_deg }) : 0) + Math.abs(r.startMs - startMs) / DAY;
  return cost(a.result) - cost(b.result);
}

export interface SearchOptions {
  points: Point[]; dates: number[]; durationDays: number; targets: Targets;
  durationsDays?: number[]; coverageEndMs?: number;
  lander: LanderParams; clearance: number; origin: Point | null; startMs: number;
  known: SiteDoc[]; observerHeight: number; masks: Map<string, HorizonMask>;
  resolveTerrain?: (site: SiteDoc, signal: AbortSignal) => Promise<{ site: SiteDoc; mask: HorizonMask; observerHeightM: number } | null>;
  /** Validation can compare different bounded shortlists against an exhaustive run. */
  shortlistSize?: number;
}

/**
 * Let the event loop run (rendering, input) without the >= 4 ms clamp that
 * browsers apply to nested setTimeout(0): a MessageChannel hop returns almost
 * at once. Measured: 126 setTimeout(0) yields cost 1.9 s in Node on Windows,
 * more than all the geometry in a 1,500-scenario search.
 */
function yieldToUi(): Promise<void> {
  return new Promise(resolve => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { port1.close(); port2.close(); resolve(); };
    port2.postMessage(null);
  });
}

/** Work slice between yields, ms: short enough to keep the UI at 60 fps. */
const SLICE_MS = 12;

export type SearchPhase = 'screening' | 'refining';

/** Bounded screening, then hourly refinement. Yields every SLICE_MS of work to keep the UI responsive. */
export async function searchCandidates(eph: EphemerisTable, options: SearchOptions, signal: AbortSignal, progress: (done: number, total: number, phase: SearchPhase) => void): Promise<Candidate[]> {
  const best: Candidate[] = [];
  const shortlistSize = options.shortlistSize ?? 48;
  let sliceStart = performance.now();
  const sliceOver = () => performance.now() - sliceStart >= SLICE_MS;
  const rest = async () => { await yieldToUi(); sliceStart = performance.now(); };
  const flat = flatHorizon();
  const rank = (a: Candidate, b: Candidate) => compareCandidates(a, b, options.origin, options.startMs);
  const evaluate = (site: SiteDoc, startMs: number, days: number, stepMs: number): Candidate => {
    const mask = options.masks.get(site.id) ?? flat;
    const result = analyzeSite(makeSiteContext(site, options.observerHeight, mask), eph, {
      startMs, endMs: startMs + days * DAY, stepMs, params: options.lander, earthMinClearanceDeg: options.clearance,
    });
    if (mask.terrainAware) result.horizonMask = mask;
    return { targets: { ...options.targets }, result };
  };
  const sites = new Map<string, SiteDoc>();
  for (const point of options.points) {
    const site = coordinateSite(point, options.known);
    sites.set(site.id, site);
  }
  const durations = [...new Set(options.durationsDays ?? durationGrid(options.durationDays))];
  for (const days of durations) durationGrid(days);
  const scenarios = [...new Set(options.dates)].flatMap(date => durations
    .filter(days => date + days * DAY <= (options.coverageEndMs ?? Infinity))
    .map(days => ({ date, days })));
  const total = sites.size * scenarios.length;
  let done = 0;
  for (const site of sites.values()) {
    for (const { date, days } of scenarios) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const step = Math.max(1, Math.ceil(days * 24 / 168)) * HOUR_MS;
      const candidate = evaluate(site, date, days, step);
      // Insert after equal-ranked candidates to preserve the sampling order on ties.
      let lo = 0;
      let hi = best.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (rank(best[mid], candidate) <= 0) lo = mid + 1;
        else hi = mid;
      }
      if (lo < shortlistSize) {
        best.splice(lo, 0, candidate);
        // Preserve location diversity: many dates at one initially promising
        // flat-horizon point must not monopolize terrain refinement.
        const same = best.filter(c => c.result.site.id === siteKey(candidate) && c.result.metrics.intervalHours === candidate.result.metrics.intervalHours);
        if (same.length > 4) best.splice(best.indexOf(same.at(-1)!), 1);
        if (best.length > shortlistSize) best.pop();
      }
      done++;
      if (done < total && sliceOver()) {
        progress(done, total, 'screening');
        await rest();
      }
    }
  }
  progress(total, total, 'screening');
  progress(0, best.length, 'refining');
  const refined: Candidate[] = [];
  const resolved = new Map<string, Awaited<ReturnType<NonNullable<SearchOptions['resolveTerrain']>>>>();
  for (const candidate of best) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const { site, startMs, endMs } = candidate.result;
    let terrain = null;
    if (!candidate.result.terrainAware && options.resolveTerrain) {
      if (!resolved.has(site.id)) resolved.set(site.id, await options.resolveTerrain(site, signal));
      terrain = resolved.get(site.id) ?? null;
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const result = analyzeMission(makeSiteContext(terrain?.site ?? site, terrain?.observerHeightM ?? options.observerHeight,
      terrain?.mask ?? options.masks.get(site.id) ?? flat), eph, {
      startMs, endMs, params: options.lander, earthMinClearanceDeg: options.clearance,
    });
    result.horizonMask = terrain?.mask ?? options.masks.get(site.id) ?? flat;
    refined.push({ targets: candidate.targets, result });
    progress(refined.length, best.length, 'refining');
    if (sliceOver()) await rest();
  }
  // At most two dates per location and mission length, so the list is not five copies of one point.
  const countsBySiteAndDuration = new Map<string, number>();
  const shown = new Set<string>();
  return refined.sort(rank).filter(({ result }) => {
    // Two site aliases can resolve to the same coordinates and mission window.
    const location = `${Number(result.site.lat_deg.toFixed(4))}|${normalizeLon(Number(result.site.lon_deg.toFixed(4)))}`;
    const sample = `${location}|${result.startMs}|${result.endMs}`;
    if (shown.has(sample)) return false;
    shown.add(sample);
    const key = result.site.id + '|' + Math.round(result.metrics.intervalHours);
    const count = (countsBySiteAndDuration.get(key) ?? 0) + 1;
    countsBySiteAndDuration.set(key, count);
    return count <= 2;
  }).slice(0, 5);
}

const siteKey = (candidate: Candidate) => candidate.result.site.id;
