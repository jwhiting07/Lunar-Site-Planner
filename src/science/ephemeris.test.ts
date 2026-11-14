import { describe, expect, it } from 'vitest';
import { HOUR_MS } from './constants';
import { bodyVectorKm, mergeTables, tableEndMs, tableFromBuffer, type EphemerisTable } from './ephemeris';
import { ephemerisIndex, shippedEphemeris, yearTables } from './__fixtures__/shipped';

/** Synthetic table: sample k has sun = (k, 2k, 3k), earth = (-k, 10, k*k) (offset by `base`). */
function synth(t0Ms: number, n: number, base = 0): EphemerisTable {
  const data = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) {
    const k = i + base;
    data.set([k, 2 * k, 3 * k, -k, 10, k * k], i * 6);
  }
  return { t0Ms, stepMs: HOUR_MS, n, data };
}

describe('mergeTables (synthetic)', () => {
  it('joins contiguous tables, dropping the duplicated boundary sample, regardless of input order', () => {
    const a = synth(0, 5, 0); // samples k = 0..4
    const b = synth(4 * HOUR_MS, 4, 4); // k = 4..7 (first sample duplicates a's last)
    const c = synth(7 * HOUR_MS, 3, 7); // k = 7..9
    const m = mergeTables([c, a, b]);
    expect(m.n).toBe(10);
    expect(m.t0Ms).toBe(0);
    expect(tableEndMs(m)).toBe(9 * HOUR_MS);
    for (let k = 0; k < 10; k++) expect(bodyVectorKm(m, k * HOUR_MS, 'sun')).toEqual([k, 2 * k, 3 * k]);
  });

  it('rejects gaps, overlaps and step mismatches', () => {
    expect(() => mergeTables([synth(0, 5), synth(5 * HOUR_MS, 3)])).toThrow(/contiguous/);
    expect(() => mergeTables([synth(0, 5), synth(3 * HOUR_MS, 3)])).toThrow(/contiguous/);
    expect(() => mergeTables([synth(0, 5), { ...synth(4 * HOUR_MS, 3), stepMs: 1000 }])).toThrow(/steps/);
    expect(() => mergeTables([])).toThrow();
  });

  it('tableFromBuffer rejects a size that is not a multiple of 6 float64', () => {
    expect(() => tableFromBuffer(new ArrayBuffer(48 * 2 + 8), 0, HOUR_MS)).toThrow();
    expect(tableFromBuffer(new ArrayBuffer(48 * 3), 0, HOUR_MS).n).toBe(3);
  });
});

describe('bodyVectorKm', () => {
  const t = synth(1000, 6);
  it('is exact at the samples', () => {
    for (let k = 0; k < 6; k++) {
      expect(bodyVectorKm(t, 1000 + k * HOUR_MS, 'earth')).toEqual([-k, 10, k * k]);
    }
  });
  it('is linear between samples', () => {
    const v = bodyVectorKm(t, 1000 + 2.25 * HOUR_MS, 'earth');
    expect(v[0]).toBeCloseTo(-2.25, 12);
    expect(v[1]).toBe(10);
    expect(v[2]).toBeCloseTo(4 + 0.25 * (9 - 4), 12); // chord, not k^2 = 5.0625
    const end = bodyVectorKm(t, 1000 + 5 * HOUR_MS, 'sun');
    expect(end).toEqual([5, 10, 15]);
  });
  it('throws RangeError outside coverage (never extrapolates)', () => {
    expect(() => bodyVectorKm(t, 999, 'sun')).toThrow(RangeError);
    expect(() => bodyVectorKm(t, 1000 + 5 * HOUR_MS + 1, 'sun')).toThrow(RangeError);
    expect(() => bodyVectorKm(t, Number.NaN, 'sun')).toThrow(RangeError);
  });
});

describe('shipped ephemeris files', () => {
  const idx = ephemerisIndex();
  const years = yearTables();

  it('year files are contiguous and repeat the boundary sample exactly', () => {
    for (let i = 1; i < years.length; i++) {
      const prev = years[i - 1];
      expect(years[i].t0Ms).toBe(tableEndMs(prev));
      const last = prev.data.subarray((prev.n - 1) * 6, prev.n * 6);
      const first = years[i].data.subarray(0, 6);
      expect(Array.from(first)).toEqual(Array.from(last));
    }
  });

  it('merge covers start_utc..stop_utc hourly with the expected sample count', () => {
    const m = shippedEphemeris();
    expect(m.t0Ms).toBe(Date.parse(idx.start_utc));
    expect(tableEndMs(m)).toBe(Date.parse(idx.stop_utc));
    expect(m.n).toBe((Date.parse(idx.stop_utc) - Date.parse(idx.start_utc)) / HOUR_MS + 1);
    expect(m.n).toBe(idx.files.reduce((s, f) => s + f.n, 0) - (idx.files.length - 1));
    // sample at a year boundary equals the next year's first sample
    const t2027 = Date.parse('2027-01-01T00:00:00Z');
    expect(bodyVectorKm(m, t2027, 'sun')).toEqual(Array.from(years[1].data.subarray(0, 3)));
  });

  it('values are physically plausible (Sun ~1 au, Earth ~356-407 thousand km)', () => {
    const m = shippedEphemeris();
    for (let i = 0; i < m.n; i += 97) {
      const s = Math.hypot(m.data[i * 6], m.data[i * 6 + 1], m.data[i * 6 + 2]);
      const e = Math.hypot(m.data[i * 6 + 3], m.data[i * 6 + 4], m.data[i * 6 + 5]);
      expect(s).toBeGreaterThan(1.45e8);
      expect(s).toBeLessThan(1.53e8);
      expect(e).toBeGreaterThan(355_000);
      expect(e).toBeLessThan(407_500);
    }
  });
});
