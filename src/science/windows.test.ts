import { describe, expect, it } from 'vitest';
import { HOUR_MS } from './constants';
import {
  complementWindows,
  findWindows,
  intersectWindows,
  longestWindow,
  totalHours,
  windowHours,
  type TimeWindow,
} from './windows';

const H = (h: number) => h * HOUR_MS;
const hours = (n: number) => Array.from({ length: n }, (_, i) => H(i));

describe('findWindows', () => {
  it('places edges at the linear zero crossing (hand-computed)', () => {
    // margin -1 -> 1 crosses at 0.5 h; 1 -> -3 crosses at 2 + 1/4 h
    const w = findWindows(hours(5), [-1, 1, 1, -3, -1]);
    expect(w).toHaveLength(1);
    expect(w[0].startMs).toBeCloseTo(H(0.5), 6);
    expect(w[0].endMs).toBeCloseTo(H(2.25), 6);
    expect(windowHours(w[0])).toBeCloseTo(1.75, 12);
    expect(w[0].truncatedStart).toBe(false);
    expect(w[0].truncatedEnd).toBe(false);
  });

  it('flags windows open at either end of the interval as truncated', () => {
    const w = findWindows(hours(6), [2, 1, -1, -1, 3, 1]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ startMs: 0, truncatedStart: true, truncatedEnd: false });
    expect(w[0].endMs).toBeCloseTo(H(1.5), 6);
    expect(w[1].startMs).toBeCloseTo(H(3.25), 6);
    expect(w[1]).toMatchObject({ endMs: H(5), truncatedStart: false, truncatedEnd: true });
  });

  it('all visible -> one window spanning everything, truncated both ends; never -> none', () => {
    const all = findWindows(hours(4), [1, 2, 3, 0.1]);
    expect(all).toEqual([{ startMs: 0, endMs: H(3), truncatedStart: true, truncatedEnd: true }]);
    expect(findWindows(hours(4), [-1, -2, 0, -0.1])).toEqual([]);
    expect(findWindows([], [])).toEqual([]);
  });

  it('treats margin exactly 0 as not visible', () => {
    const w = findWindows(hours(3), [0, 1, 0]);
    expect(w).toHaveLength(1);
    expect(w[0].startMs).toBe(0);
    expect(w[0].endMs).toBe(H(2));
    expect(w[0].truncatedStart).toBe(false);
  });

  it('works with non-uniform sample spacing', () => {
    const w = findWindows([0, H(1), H(1.5)], [-1, -1, 1]);
    expect(w[0].startMs).toBeCloseTo(H(1.25), 6);
  });
});

describe('complementWindows / intersectWindows', () => {
  const t = hours(25);
  const sun = t.map((x) => Math.sin((2 * Math.PI * x) / H(10)) + 0.2);
  const earth = t.map((x) => Math.cos((2 * Math.PI * x) / H(7)) - 0.1);
  const sw = findWindows(t, sun);
  const ew = findWindows(t, earth);
  const start = 0, end = H(24);

  it('sunlit + dark hours = interval, with no overlap', () => {
    const dark = complementWindows(sw, start, end);
    expect(totalHours(sw) + totalHours(dark)).toBeCloseTo(24, 9);
    expect(intersectWindows(sw, dark).reduce((s, w) => s + windowHours(w), 0)).toBeCloseTo(0, 9);
  });

  it('both <= min(sun, earth), and both = sun + earth - union', () => {
    const both = intersectWindows(sw, ew);
    expect(totalHours(both)).toBeLessThanOrEqual(Math.min(totalHours(sw), totalHours(ew)) + 1e-12);
    // union via complement of (dark AND blackout)
    const neither = intersectWindows(complementWindows(sw, start, end), complementWindows(ew, start, end));
    const union = 24 - totalHours(neither);
    expect(totalHours(both)).toBeCloseTo(totalHours(sw) + totalHours(ew) - union, 9);
    for (const w of both) expect(w.endMs).toBeGreaterThan(w.startMs);
  });

  it('complement edge cases: empty list -> whole interval truncated both ends; full window -> nothing', () => {
    expect(complementWindows([], 0, H(5))).toEqual([{ startMs: 0, endMs: H(5), truncatedStart: true, truncatedEnd: true }]);
    expect(complementWindows([{ startMs: 0, endMs: H(5), truncatedStart: true, truncatedEnd: true }], 0, H(5))).toEqual([]);
    const c = complementWindows([{ startMs: H(1), endMs: H(2), truncatedStart: false, truncatedEnd: false }], 0, H(5));
    expect(c).toEqual([
      { startMs: 0, endMs: H(1), truncatedStart: true, truncatedEnd: false },
      { startMs: H(2), endMs: H(5), truncatedStart: false, truncatedEnd: true },
    ]);
  });

  it('intersection propagates truncation flags from the window that defines each edge', () => {
    const a: TimeWindow[] = [{ startMs: 0, endMs: H(5), truncatedStart: true, truncatedEnd: true }];
    const b: TimeWindow[] = [{ startMs: H(1), endMs: H(5), truncatedStart: false, truncatedEnd: true }];
    expect(intersectWindows(a, b)).toEqual([{ startMs: H(1), endMs: H(5), truncatedStart: false, truncatedEnd: true }]);
  });
});

describe('longestWindow', () => {
  it('returns the longest window or null', () => {
    expect(longestWindow([])).toBeNull();
    const ws: TimeWindow[] = [
      { startMs: 0, endMs: H(2), truncatedStart: true, truncatedEnd: false },
      { startMs: H(3), endMs: H(8), truncatedStart: false, truncatedEnd: false },
      { startMs: H(9), endMs: H(10), truncatedStart: false, truncatedEnd: true },
    ];
    expect(longestWindow(ws)).toBe(ws[1]);
  });
});
