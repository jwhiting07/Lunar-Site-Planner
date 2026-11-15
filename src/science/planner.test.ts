import { describe, it, expect } from 'vitest';
import { analyzeSite, makeSiteContext } from './analysis';
import { DEFAULT_LANDER, HOUR_MS } from './constants';
import { flatHorizon, type HorizonMask } from './horizon';
import { assessment, compareCandidates, coordinateSite, dateGrid, durationGrid, DAY, DEFAULT_TARGETS, destination, distanceKm, locationGrid, searchCandidates } from './planner';
import { shippedEphemeris, sitesDoc } from './__fixtures__/shipped';

describe('coordinate planning and mission targets', () => {
  it('never borrows a nearby point’s terrain and recognizes only exact shipped points', () => {
    const known = sitesDoc().sites;
    const site = known[0];
    expect(coordinateSite({ lat: site.lat_deg, lon: site.lon_deg + 360 }, known)).toBe(site);
    const arbitrary = coordinateSite({ lat: site.lat_deg + 0.001, lon: site.lon_deg }, known);
    expect(arbitrary.terrain_aware).toBe(false);
    expect(arbitrary.horizon.file).toBe('');
  });

  it('keeps every sampled point inside the requested lunar radius, including pole and date-line crossings', () => {
    for (const point of [{ lat: -90, lon: 0 }, { lat: 0, lon: 179.9 }, { lat: 89.99, lon: -170 }]) {
      const grid = locationGrid(point, 50);
      expect(grid).toHaveLength(17);
      for (const p of grid) {
        expect(distanceKm(point, p)).toBeLessThanOrEqual(50.000001);
        expect(p.lat).toBeGreaterThanOrEqual(-90);
        expect(p.lon).toBeGreaterThanOrEqual(-180);
        expect(p.lon).toBeLessThan(180);
      }
      expect(distanceKm(point, destination(point, 50, 90))).toBeCloseTo(50, 5);
    }
    expect(locationGrid({ lat: 0, lon: 0 }, null).some(p => p.lat > 70)).toBe(true);
  });

  it('includes both date limits and bounds unrestricted search cost', () => {
    const start = Date.UTC(2026, 0, 1), end = Date.UTC(2028, 11, 25);
    const dates = dateGrid(start, end);
    expect(dates[0]).toBe(start);
    expect(dates.at(-1)).toBe(end);
    expect(dates.length).toBeLessThanOrEqual(32);
    expect(dateGrid(start, start)).toEqual([start]);
    expect(() => dateGrid(end, start)).toThrow();
  });

  it('bounds duration exploration, preserves fractional and endpoint durations, and rejects invalid ranges', () => {
    expect(durationGrid(7, 14)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
    expect(durationGrid(0.5)).toEqual([0.5]);
    const wide = durationGrid(1 / 24, 365);
    expect(wide.length).toBeLessThanOrEqual(8);
    expect(wide[0]).toBe(1 / 24);
    expect(wide.at(-1)).toBe(365);
    for (const [min, max] of [[0, 7], [14, 7], [7, 366], [NaN, 7], [7, Infinity]]) expect(() => durationGrid(min, max)).toThrow(RangeError);
  });

  const site = coordinateSite({ lat: -85, lon: 0 });
  const eph = shippedEphemeris();
  const start = Date.UTC(2026, 11, 1);
  const result = analyzeSite(makeSiteContext(site, 2, flatHorizon()), eph, { startMs: start, endMs: start + 7 * DAY, params: DEFAULT_LANDER });

  it('searches multiple durations without crossing ephemeris coverage or changing the chosen site', async () => {
    const end = start + 2 * DAY;
    const out = await searchCandidates(eph, {
      points: [{ lat: -85, lon: 0 }], dates: [start, start + DAY], durationDays: 1,
      durationsDays: [1, 2], coverageEndMs: end, targets: DEFAULT_TARGETS,
      lander: DEFAULT_LANDER, clearance: 0, origin: { lat: -85, lon: 0 }, startMs: start,
      known: [], observerHeight: 2, masks: new Map(),
    }, new AbortController().signal, () => {});
    expect(out).toHaveLength(3);
    expect(new Set(out.map(candidate => candidate.result.metrics.intervalHours))).toEqual(new Set([24, 48]));
    for (const candidate of out) {
      expect(candidate.result.site.lat_deg).toBe(-85);
      expect(candidate.result.site.lon_deg).toBe(0);
      expect(candidate.result.endMs).toBeLessThanOrEqual(end);
      expect(candidate.result.stepMs).toBe(HOUR_MS);
      expect(candidate.result.series.tMs.at(-1)).toBe(candidate.result.endMs);
    }
  });

  it('shows one sampled match per displayed location and mission window', async () => {
    const point = { lat: -85, lon: 0 };
    const progress: number[][] = [];
    const out = await searchCandidates(eph, {
      points: [point, point, { ...point, lon: 360 }, { ...point, lon: 0.00001 }],
      dates: [start, start], durationDays: 1, durationsDays: [1, 1, 2],
      targets: DEFAULT_TARGETS, lander: DEFAULT_LANDER, clearance: 0,
      origin: point, startMs: start, known: [], observerHeight: 2, masks: new Map(),
    }, new AbortController().signal, (done, total) => progress.push([done, total]));

    expect(progress.at(-1)).toEqual([4, 4]);
    expect(out.map(({ result }) => result.endMs).sort()).toEqual([start + DAY, start + 2 * DAY]);
  });

  it('applies inclusive percentage and outage limits using unrounded values', () => {
    const matching = { ...DEFAULT_TARGETS, sunlight: result.metrics.sunlitFraction * 100, earth: result.metrics.earthVisibleFraction * 100 };
    expect(assessment(result, matching).good).toBe(true);
    expect(assessment(result, { ...matching, sunlight: matching.sunlight + 0.01 }).good).toBe(false);
    const original = assessment(result, matching);
    expect(assessment(result, { ...matching, maxDarkHours: original.dark, maxBlackoutHours: original.blackout }).good).toBe(true);
    expect(assessment(result, { ...matching, maxDarkHours: original.dark - 0.01 }).good).toBe(false);
  });

  it('returns hourly, fully covered refined results and honors cancellation', async () => {
    const config = { points: [{ lat: -85, lon: 0 }], dates: [start, start + DAY], durationDays: 14, targets: DEFAULT_TARGETS,
      lander: DEFAULT_LANDER, clearance: 0, origin: { lat: -85, lon: 0 }, startMs: start, known: [], observerHeight: 2, masks: new Map() };
    const out = await searchCandidates(eph, config, new AbortController().signal, () => {});
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(c.result.stepMs).toBe(HOUR_MS);
      expect(c.result.series.tMs.at(-1)).toBe(c.result.endMs);
      expect(c.result.endMs - c.result.startMs).toBe(14 * DAY);
      expect(c.result.terrainAware).toBe(false);
    }
    const cancelled = new AbortController(); cancelled.abort();
    await expect(searchCandidates(eph, config, cancelled.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns the same top results as a full sort over every candidate (more candidates than the kept 12)', async () => {
    const origin = { lat: -85, lon: 0 };
    const points = locationGrid(origin, null);
    const dates = [start, start + 9 * DAY];
    const config = { points, dates, durationDays: 3, targets: DEFAULT_TARGETS, lander: DEFAULT_LANDER, clearance: 0,
      origin, startMs: start, known: [], observerHeight: 2, masks: new Map() };
    expect(points.length * dates.length).toBeGreaterThan(12);
    const out = await searchCandidates(eph, config, new AbortController().signal, () => {});

    // Reference: evaluate everything (3-day missions screen at the 1 h step), stable full sort, keep 12, refine, keep 5.
    const evaluate = (p: { lat: number; lon: number }, t: number) => ({
      targets: { ...DEFAULT_TARGETS },
      result: analyzeSite(makeSiteContext(coordinateSite(p), 2, flatHorizon()), eph, { startMs: t, endMs: t + 3 * DAY, stepMs: HOUR_MS, params: DEFAULT_LANDER, earthMinClearanceDeg: 0 }),
    });
    const rank = (a: ReturnType<typeof evaluate>, b: ReturnType<typeof evaluate>) => compareCandidates(a, b, origin, start);
    const expected = points.flatMap(p => dates.map(t => evaluate(p, t))).sort(rank).slice(0, 12)
      .map(c => evaluate({ lat: c.result.site.lat_deg, lon: c.result.site.lon_deg }, c.result.startMs)).sort(rank).slice(0, 5);
    const key = (c: ReturnType<typeof evaluate>) => `${c.result.site.lat_deg.toFixed(6)},${c.result.site.lon_deg.toFixed(6)},${c.result.startMs}`;
    expect(out.map(key)).toEqual(expected.map(key));
  });
  it('refines a broader shortlist with terrain before ranking, and requests each skyline only once', async () => {
    const points = Array.from({ length: 17 }, (_, i) => ({ lat: -85, lon: i }));
    const calls = new Map<string, number>();
    const resolveTerrain = async (site: ReturnType<typeof coordinateSite>) => {
      calls.set(site.id, (calls.get(site.id) ?? 0) + 1);
      const mask: HorizonMask = { ...flatHorizon(), terrainAware: true };
      mask.elevDeg.fill(site.lon_deg === 16 ? -90 : 90);
      return { site: { ...site, terrain_aware: true }, mask, observerHeightM: 2 };
    };
    const config = { points, dates: [start, start + DAY], durationDays: 3, targets: DEFAULT_TARGETS,
      lander: DEFAULT_LANDER, clearance: 0, origin: null, startMs: start, known: [], observerHeight: 2, masks: new Map(), resolveTerrain };
    const out = await searchCandidates(eph, config, new AbortController().signal, () => {});
    expect(out[0].result.site.lon_deg).toBe(16);
    expect(out.every(c => c.result.terrainAware)).toBe(true);
    expect(out[0].result.calculation).toBeDefined();
    expect([...calls.values()].every(count => count === 1)).toBe(true);
    const controller = new AbortController();
    await expect(searchCandidates(eph, { ...config, resolveTerrain: async () => { controller.abort(); return null; } }, controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
  });

it('prefers terrain-verified results when scores tie, ignores distance without an origin, and caps dates per location', async () => {
    const flat = { targets: { ...DEFAULT_TARGETS }, result };
    const terrain = { targets: { ...DEFAULT_TARGETS }, result: { ...result, terrainAware: true } };
    expect(compareCandidates(flat, terrain, null, start)).toBeGreaterThan(0);
    expect(compareCandidates(terrain, flat, null, start)).toBeLessThan(0);
    const far = { targets: { ...DEFAULT_TARGETS }, result: { ...result, site: { ...result.site, lat_deg: 5, lon_deg: 5 } } };
    expect(compareCandidates(flat, far, null, start)).toBe(0); // same dates, same scores: no distance term
    expect(compareCandidates(flat, far, { lat: result.site.lat_deg, lon: result.site.lon_deg }, start)).toBeLessThan(0);

    const config = { points: [{ lat: -85, lon: 0 }], dates: [start, start + DAY, start + 2 * DAY, start + 3 * DAY], durationDays: 3, targets: DEFAULT_TARGETS,
      lander: DEFAULT_LANDER, clearance: 0, origin: null, startMs: start, known: [], observerHeight: 2, masks: new Map() };
    const out = await searchCandidates(eph, config, new AbortController().signal, () => {});
    expect(out).toHaveLength(2);
  });
});
