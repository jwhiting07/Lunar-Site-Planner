import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EphemerisIndex } from '../science';
import { bodyVectorKm, tableEndMs } from '../science/ephemeris';
import { loadEphemeris } from './loader';

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
