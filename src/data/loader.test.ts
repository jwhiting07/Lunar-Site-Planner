import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EphemerisIndex } from '../science';
import { bodyVectorKm, tableEndMs } from '../science/ephemeris';
import { loadCustomHorizon, loadEphemeris, resolveHorizonProfile, terrainKey } from './loader';
import { coordinateSite } from '../science/planner';

const index = JSON.parse(readFileSync('public/data/ephemeris.json', 'utf8')) as EphemerisIndex;
const first = Date.parse(index.start_utc);
const last = Date.parse(index.stop_utc);
afterEach(() => vi.unstubAllGlobals());

describe('shipped planning date coverage', () => {
  it('loads both coverage boundaries, including the final 2029 boundary sample', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const name = url.split('/').at(-1)!;
      const data = readFileSync(`public/data/${name}`);
      return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
    }));
    const table = await loadEphemeris(index, first, last);
    expect(table.t0Ms).toBe(first);
    expect(tableEndMs(table)).toBe(last);
    for (const time of [first, last - 1, last]) {
      expect(bodyVectorKm(table, time, 'sun').every(Number.isFinite)).toBe(true);
      expect(bodyVectorKm(table, time, 'earth').every(Number.isFinite)).toBe(true);
    }
  });

  it('rejects out-of-coverage, reversed and non-finite ranges before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [a, b] of [[first - 1, last], [first, last + 1], [last, last], [last, first], [NaN, last], [first, Infinity]]) {
      await expect(loadEphemeris(index, a, b)).rejects.toThrow(RangeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('exact-coordinate terrain profiles', () => {
  it('validates a custom profile before it reaches the scientific evaluator', () => {
    const site = coordinateSite({ lat: -83, lon: 25 });
    const profile = { elevationM: 123, observerHeightM: 2, coverageKm: 600, azStepDeg: 1,
      elevDeg: new Array(360).fill(-1), distM: new Array(360).fill(1000) };
    const resolved = resolveHorizonProfile(site, profile);
    expect(resolved.site.elevation_m).toBe(123);
    expect(resolved.mask.terrainAware).toBe(true);
    expect(resolved.observerHeightM).toBe(2);
    expect(() => resolveHorizonProfile(site, { ...profile, elevDeg: [NaN] })).toThrow();
  });

  it('serves exact precomputed locations without a Python service and does not borrow nearby terrain', async () => {
    const site = coordinateSite({ lat: 10, lon: 20 });
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ schema: 1, profiles: {
      [terrainKey(10, 20)]: { elevationM: 120, observerHeightM: 2, coverageKm: 600,
        azStepDeg: 1, elevDeg: new Array(360).fill(2), distM: new Array(360).fill(5000) },
    } }) }));
    vi.stubGlobal('fetch', fetch);
    const result = await loadCustomHorizon(site, new AbortController().signal, false);
    expect(result!.site.elevation_m).toBe(120);
    expect(await loadCustomHorizon(coordinateSite({ lat: 10.001, lon: 20 }), new AbortController().signal, false)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
