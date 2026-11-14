import { describe, it, expect } from 'vitest';
import { analyzeSite, makeSiteContext } from './analysis';
import { DEFAULT_LANDER, HOUR_MS } from './constants';
import { flatHorizon } from './horizon';
import { assessment, coordinateSite, dateGrid, DAY, DEFAULT_TARGETS, destination, distanceKm, locationGrid, searchCandidates } from './planner';
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

  const site = coordinateSite({ lat: -85, lon: 0 });
  const eph = shippedEphemeris();
  const start = Date.UTC(2026, 11, 1);
  const result = analyzeSite(makeSiteContext(site, 2, flatHorizon()), eph, { startMs: start, endMs: start + 7 * DAY, params: DEFAULT_LANDER });

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
});
