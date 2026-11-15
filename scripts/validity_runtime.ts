import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolveHorizonProfile, terrainKey, type HorizonProfile } from '../src/data/loader';
import { analyzeMission, analyzeSite, makeSiteContext, type AnalysisResult } from '../src/science/analysis';
import { DEFAULT_LANDER, HOUR_MS } from '../src/science/constants';
import { assessment, coordinateSite, DAY, DEFAULT_TARGETS, locationGrid, searchCandidates, type Candidate } from '../src/science/planner';
import { buildExportJson } from '../src/export/exporters';
import { shippedEphemeris, shippedMask, sitesDoc } from '../src/science/__fixtures__/shipped';
import { simulateBattery } from '../src/science/power';

const read = (name: string) => JSON.parse(readFileSync(name, 'utf8'));
const write = (name: string, data: unknown) => writeFileSync(name, JSON.stringify(data, null, 1));
const targets = { sunlight: 75, earth: 50, maxDarkHours: 24, maxBlackoutHours: 12 };
const metrics = (r: AnalysisResult) => ({ sunlit_fraction: r.metrics.sunlitFraction,
  earth_visible_fraction: r.metrics.earthVisibleFraction, both_hours: r.metrics.bothHours,
  longest_darkness_hours: r.metrics.longestDarkness ? (r.metrics.longestDarkness.endMs - r.metrics.longestDarkness.startMs) / HOUR_MS : 0,
  longest_blackout_hours: r.metrics.longestBlackout ? (r.metrics.longestBlackout.endMs - r.metrics.longestBlackout.startMs) / HOUR_MS : 0,
  generated_wh: r.battery.generatedWh, unserved_wh: r.battery.unservedWh, deficit_hours: r.battery.deficitHours,
  min_energy_wh: r.battery.minEnergyWh, verdict: assessment(r, targets).good });

export async function run(mode: string) {
  const points = locationGrid({ lat: 0, lon: 0 }, null);
  if (mode === 'grid') { write('data_cache/validity_grid.json', points); return; }
  const input = read('data_cache/validity_input.json');
  const eph = shippedEphemeris(), known = sitesDoc().sites;
  const cases = [];
  for (const c of input.cases) {
    const terrain = resolveHorizonProfile(coordinateSite(c), c.profile);
    const ctx = makeSiteContext(terrain.site, terrain.observerHeightM, terrain.mask);
    const opts = { startMs: Date.parse(c.start), endMs: Date.parse(c.start) + c.days * DAY, params: DEFAULT_LANDER };
    const start = performance.now();
    const actual = analyzeMission(ctx, eph, opts);
    const elapsed_ms = performance.now() - start;
    const grids = Object.fromEntries([60, 15, 5, 1].map(minutes => [minutes, metrics(analyzeSite(ctx, eph, { ...opts, stepMs: minutes * 60_000 }))]));
    const fineTerrain = resolveHorizonProfile(coordinateSite(c), c.fine_profile);
    const terrainRefined = metrics(analyzeMission(makeSiteContext(fineTerrain.site, fineTerrain.observerHeightM, fineTerrain.mask), eph, opts));
    const exported = buildExportJson([actual], null, new Date().toISOString()).sites[0];
    if (exported.summary.find(row => row.key === 'sunlit_pct')!.value !== actual.metrics.sunlitFraction * 100) throw new Error('Export summary mismatch');
    const reference = analyzeSite(ctx, eph, { ...opts, stepMs: 60_000 });
    // Deliberately put thresholds on either side of the fine reference to expose
    // decision sensitivity. These generated boundary tests are not holdout evidence.
    const boundaries = [-0.25, 0, 0.25].map(delta => {
      const boundary = { ...targets, sunlight: Math.max(0, Math.min(100, reference.metrics.sunlitFraction * 100 + delta)),
        earth: 0, maxDarkHours: null, maxBlackoutHours: null };
      return { target_sunlight_pct: boundary.sunlight, actual: assessment(actual, boundary).good, reference: assessment(reference, boundary).good };
    });
    cases.push({ id: c.id, elapsed_ms, actual: metrics(actual), grids, terrain_refined: terrainRefined, boundary_tests: boundaries,
      display_samples: actual.series.tMs.length, calculation: actual.calculation,
      sensitivity: [0.5, 1, 2].map(scale => ({ load_scale: scale, ...metrics(analyzeMission(ctx, eph, { ...opts, params: { ...DEFAULT_LANDER, loadW: DEFAULT_LANDER.loadW * scale } })) })) });
  }
  const profiles = read('public/data/search_horizons.json').profiles as Record<string, HorizonProfile>;
  const resolve = async (site: ReturnType<typeof coordinateSite>) => {
    const profile = profiles[terrainKey(site.lat_deg, site.lon_deg)];
    return profile ? resolveHorizonProfile(site, profile) : null;
  };
  // Small exhaustive reference: all 49 exact grid locations x 3 dates.
  const dates = [Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1), Date.UTC(2026, 11, 1)];
  const config = { points, dates, durationDays: 7, targets: DEFAULT_TARGETS, lander: DEFAULT_LANDER, clearance: 0,
    origin: null, startMs: dates[0], known, observerHeight: 2, masks: new Map(known.map(s => [s.id, shippedMask(s)])), resolveTerrain: resolve };
  const searches = [];
  const key = (c: Candidate) => `${c.result.site.id}|${c.result.startMs}`;
  const started = performance.now();
  const exhaustive = await searchCandidates(eph, { ...config, shortlistSize: points.length * dates.length }, new AbortController().signal, () => {});
  const search_reference_ms = performance.now() - started;
  for (const size of [12, 24, 48]) {
    const time = performance.now();
    const results = await searchCandidates(eph, { ...config, shortlistSize: size }, new AbortController().signal, () => {});
    searches.push({ size, elapsed_ms: performance.now() - time, matches_exhaustive: results.map(key).join() === exhaustive.map(key).join(),
      top_five: results.map(c => ({ key: key(c), terrain: c.result.terrainAware, ...metrics(c.result) })) });
  }
  // Direct integration fixtures are shared with a separately implemented Python midpoint reference.
  const power = input.power_cases.map((c: { id: string; hours: number[]; watts: number[]; load: number; capacity: number }) => {
    const result = simulateBattery(c.hours.map(h => h * HOUR_MS), c.watts, { ...DEFAULT_LANDER, loadW: c.load, batteryCapacityWh: c.capacity });
    return { id: c.id, ...result, energyWh: Array.from(result.energyWh) };
  });
  // Full default unrestricted three-year search benchmark, using precomputed exact skylines.
  const fullStart = performance.now();
  const full = await searchCandidates(eph, { ...config, dates: Array.from({ length: 31 }, (_, i) => dates[0] + i * 36 * DAY) }, new AbortController().signal, () => {});
  write('data_cache/validity_runtime.json', { cases, searches, power, search_reference_ms,
    default_search_ms: performance.now() - fullStart, default_search_count: points.length * 31, default_terrain_results: full.filter(c => c.result.terrainAware).length });
}
