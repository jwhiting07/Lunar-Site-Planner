import { describe, expect, it } from 'vitest';
import { flatHorizon, horizonAt, horizonDistanceAt, parseHorizon, type HorizonMask } from './horizon';
import { sitesDoc, shippedMask } from './__fixtures__/shipped';

function buf(values: number[]): ArrayBuffer {
  return new Float32Array(values).buffer as ArrayBuffer;
}

describe('parseHorizon', () => {
  it('splits elevations and distances', () => {
    const m = parseHorizon(buf([1, 2, 3, 4, 10, 20, 30, 40]), 4, 90);
    expect(Array.from(m.elevDeg)).toEqual([1, 2, 3, 4]);
    expect(Array.from(m.distM)).toEqual([10, 20, 30, 40]);
    expect(m.terrainAware).toBe(true);
  });
  it('rejects wrong sizes and tables that do not span 360 deg', () => {
    expect(() => parseHorizon(buf([1, 2, 3]), 2, 180)).toThrow();
    expect(() => parseHorizon(buf([1, 2, 3, 4]), 2, 90)).toThrow(/360/);
  });
  it('parses every shipped mask with statistics matching sites.json', () => {
    for (const s of sitesDoc().sites) {
      const m = shippedMask(s);
      const e = Array.from(m.elevDeg);
      expect(e.length).toBe(s.horizon.n_az);
      expect(Math.min(...e)).toBeCloseTo(s.horizon.min_deg, 3);
      expect(Math.max(...e)).toBeCloseTo(s.horizon.max_deg, 3);
      expect(e.reduce((a, b) => a + b, 0) / e.length).toBeCloseTo(s.horizon.mean_deg, 3);
      expect(Math.max(...Array.from(m.distM)) / 1000).toBeCloseTo(s.horizon.max_obstruction_distance_km, 1);
    }
  });
});

describe('horizonAt', () => {
  const m: HorizonMask = parseHorizon(buf([0, 4, 2, -2, 0, 0, 0, 0]), 4, 90);
  it('interpolates linearly between table azimuths', () => {
    expect(horizonAt(m, 0)).toBe(0);
    expect(horizonAt(m, 45)).toBeCloseTo(2, 12);
    expect(horizonAt(m, 90)).toBe(4);
    expect(horizonAt(m, 135)).toBeCloseTo(3, 12);
    expect(horizonAt(m, 225)).toBeCloseTo(0, 12);
  });
  it('wraps around 360 (segment 270 -> 360 interpolates toward entry 0)', () => {
    expect(horizonAt(m, 315)).toBeCloseTo(-1, 12);
    expect(horizonAt(m, 359.999999)).toBeCloseTo(0, 5);
    expect(horizonAt(m, -45)).toBeCloseTo(-1, 12);
    expect(horizonAt(m, 405)).toBeCloseTo(2, 12);
  });
  it('horizonDistanceAt returns the nearest table entry, wrapping', () => {
    const d = parseHorizon(buf([0, 0, 0, 0, 10, 20, 30, 40]), 4, 90);
    expect(horizonDistanceAt(d, 44)).toBe(10);
    expect(horizonDistanceAt(d, 46)).toBe(20);
    expect(horizonDistanceAt(d, 350)).toBe(10);
  });
});

describe('flatHorizon', () => {
  it('is zero everywhere and not terrain-aware', () => {
    const f = flatHorizon(0.5);
    expect(f.elevDeg.length).toBe(720);
    expect(f.terrainAware).toBe(false);
    for (const az of [0, 17.3, 359.9]) expect(horizonAt(f, az)).toBe(0);
  });
});
