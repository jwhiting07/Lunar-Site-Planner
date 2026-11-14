import { analyzeSite, makeSiteContext, type AnalysisResult } from './analysis';
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

export interface Candidate { result: AnalysisResult; targets: Targets }
export function compareCandidates(a: Candidate, b: Candidate, origin: Point, startMs: number) {
  const x = assessment(a.result, a.targets), y = assessment(b.result, b.targets);
  if (x.good !== y.good) return x.good ? -1 : 1;
  if (Math.abs(x.deficit - y.deficit) > 1e-7) return x.deficit - y.deficit;
  const availability = (r: AnalysisResult) => r.metrics.sunlitFraction + r.metrics.earthVisibleFraction;
  const delta = availability(b.result) - availability(a.result);
  if (Math.abs(delta) > 1e-7) return delta;
  const cost = (r: AnalysisResult) => distanceKm(origin, { lat: r.site.lat_deg, lon: r.site.lon_deg }) + Math.abs(r.startMs - startMs) / DAY;
  return cost(a.result) - cost(b.result);
}

export interface SearchOptions {
  points: Point[]; dates: number[]; durationDays: number; targets: Targets;
  lander: LanderParams; clearance: number; origin: Point; startMs: number;
  known: SiteDoc[]; observerHeight: number; masks: Map<string, HorizonMask>;
}

/** Bounded screening, then hourly refinement. Yield between batches to keep the UI responsive. */
export async function searchCandidates(eph: EphemerisTable, o: SearchOptions, signal: AbortSignal, progress: (done: number, total: number) => void): Promise<Candidate[]> {
  const best: Candidate[] = [];
  const flat = flatHorizon();
  const rank = (a: Candidate, b: Candidate) => compareCandidates(a, b, o.origin, o.startMs);
  const evaluate = (point: Point, startMs: number, stepMs: number): Candidate => {
    const site = coordinateSite(point, o.known);
    const mask = o.masks.get(site.id) ?? flat;
    const result = analyzeSite(makeSiteContext(site, o.observerHeight, mask), eph, {
      startMs, endMs: startMs + o.durationDays * DAY, stepMs, params: o.lander, earthMinClearanceDeg: o.clearance,
    });
    if (mask.terrainAware && !site.horizon.file) result.horizonMask = mask;
    return { targets: { ...o.targets }, result };
  };
  const total = o.points.length * o.dates.length;
  let done = 0;
  const step = Math.max(1, Math.ceil(o.durationDays * 24 / 168)) * HOUR_MS;
  for (const point of o.points) for (const date of o.dates) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    best.push(evaluate(point, date, step));
    best.sort(rank);
    if (best.length > 12) best.pop();
    if (++done % 12 === 0) { progress(done, total); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  const refined: Candidate[] = [];
  for (const candidate of best) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    refined.push(evaluate({ lat: candidate.result.site.lat_deg, lon: candidate.result.site.lon_deg }, candidate.result.startMs, HOUR_MS));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  progress(total, total);
  return refined.sort(rank).slice(0, 5);
}
