/**
 * Cross-implementation checks against SPICE-direct reference values
 * (src/science/__fixtures__/reference_cases.json, from scripts/make_fixtures.py).
 *
 * The TS runtime here uses ONLY the shipped public/data files.
 *
 * 1. Point cases at random NON-hourly epochs: the reference is SPICE spkcpo with
 *    the surface point as observer (LT+S). The runtime uses Moon-centre LT+S
 *    vectors, linearly interpolated between hours, minus the site position.
 *    Expected disagreement is dominated by the hourly linear interpolation
 *    (ephemeris.json reports <= 1.3e-4 deg for Earth, 1.5e-5 deg for the Sun).
 *    Tolerances below are the observed maxima (printed) with margin.
 * 2. Interval metrics: reference is an independent NumPy implementation of the
 *    same rules fed by SPICE at the hourly samples. The runtime evaluates the
 *    shipped samples at the same instants, so agreement should be at the level
 *    of floating-point noise.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { DEFAULT_LANDER, HOUR_MS } from './constants';
import { analyzeSite, instantState, makeSiteContext } from './analysis';
import { angleDiffDeg } from './geometry';
import { windowHours } from './windows';
import { ROOT, readJson, shippedEphemeris, shippedMask, siteById, sitesDoc } from './__fixtures__/shipped';

interface BodyRef { az_deg: number; el_deg: number; dist_km: number }
interface Fixture {
  observer_height_m: number;
  sites: {
    id: string;
    observer_radius_km: number;
    points: { utc: string; sun: BodyRef; earth: BodyRef }[];
    intervals: { start_utc: string; end_utc: string; metrics: Record<string, number | boolean | null> }[];
  }[];
}

const fx = readJson<Fixture>(resolve(ROOT, 'src', 'science', '__fixtures__', 'reference_cases.json'));
const eph = shippedEphemeris();

// Tolerances (deg / relative). Observed maxima are printed by the test run and recorded in docs/VALIDATION.md.
const TOL = {
  sun: { az: 2e-5, el: 5e-5, distRel: 2e-5 },
  earth: { az: 5e-4, el: 3e-4, distRel: 3e-6 },
};

describe('TS runtime vs SPICE spkcpo at non-hourly epochs', () => {
  it('fixture covers all shipped sites with the shipped observer height', () => {
    expect(fx.sites.map((s) => s.id).sort()).toEqual(sitesDoc().sites.map((s) => s.id).sort());
    expect(fx.observer_height_m).toBe(sitesDoc().observer_height_m);
  });

  const worst = { sun: { az: 0, azCos: 0, el: 0, distRel: 0 }, earth: { az: 0, azCos: 0, el: 0, distRel: 0 } };
  for (const fs of fx.sites) {
    it(`${fs.id}: az/el/distance within tolerance`, () => {
      const site = siteById(fs.id);
      const ctx = makeSiteContext(site, fx.observer_height_m, shippedMask(site));
      expect(Math.hypot(...ctx.observerKm)).toBeCloseTo(fs.observer_radius_km, 9);
      for (const p of fs.points) {
        const t = Date.parse(p.utc);
        expect(t % HOUR_MS).not.toBe(0);
        const st = instantState(ctx, eph, t);
        for (const body of ['sun', 'earth'] as const) {
          const ref = p[body];
          const got = st[body];
          const dAz = Math.abs(angleDiffDeg(got.azDeg, ref.az_deg));
          const dEl = Math.abs(got.elDeg - ref.el_deg);
          const dD = Math.abs(got.distKm / ref.dist_km - 1);
          const w = worst[body];
          w.az = Math.max(w.az, dAz);
          w.azCos = Math.max(w.azCos, dAz * Math.cos((ref.el_deg * Math.PI) / 180));
          w.el = Math.max(w.el, dEl);
          w.distRel = Math.max(w.distRel, dD);
          expect(dAz, `${body} az ${p.utc}`).toBeLessThan(TOL[body].az);
          expect(dEl, `${body} el ${p.utc}`).toBeLessThan(TOL[body].el);
          expect(dD, `${body} dist ${p.utc}`).toBeLessThan(TOL[body].distRel);
        }
      }
    });
  }
  it('reports the observed maxima', () => {
    console.log('[spice_consistency] observed max |TS - spkcpo|:', JSON.stringify(worst));
    expect(worst.sun.el).toBeGreaterThan(0); // the comparison actually ran
  });
});

describe('TS interval metrics vs independent Python implementation', () => {
  const H_TOL = 1e-6; // hours
  for (const fs of fx.sites) {
    for (const iv of fs.intervals) {
      it(`${fs.id} ${iv.start_utc} .. ${iv.end_utc}`, () => {
        const site = siteById(fs.id);
        const ctx = makeSiteContext(site, fx.observer_height_m, shippedMask(site));
        const r = analyzeSite(ctx, eph, {
          startMs: Date.parse(iv.start_utc),
          endMs: Date.parse(iv.end_utc),
          params: DEFAULT_LANDER,
        });
        const m = r.metrics;
        const py = iv.metrics;
        expect(m.intervalHours).toBe(py.interval_hours);
        expect(Math.abs(m.sunlitHours - (py.sunlit_hours as number))).toBeLessThan(H_TOL);
        expect(Math.abs(m.earthVisibleHours - (py.earth_visible_hours as number))).toBeLessThan(H_TOL);
        expect(Math.abs(m.bothHours - (py.both_hours as number))).toBeLessThan(H_TOL);
        expect(Math.abs(m.sunlitFraction - (py.sunlit_fraction as number))).toBeLessThan(1e-9);
        expect(Math.abs(m.earthVisibleFraction - (py.earth_visible_fraction as number))).toBeLessThan(1e-9);
        expect(Math.abs(m.sunlitFractionFlat - (py.sunlit_fraction_flat as number))).toBeLessThan(1e-9);
        expect(Math.abs(m.earthVisibleFractionFlat - (py.earth_visible_fraction_flat as number))).toBeLessThan(1e-9);
        expect(Math.abs(m.meanDiskFraction - (py.mean_disk_fraction as number))).toBeLessThan(1e-9);
        expect(m.sunWindows.length).toBe(py.n_sun_windows);
        expect(m.earthWindows.length).toBe(py.n_earth_windows);
        const ld = m.longestDarkness, lb = m.longestBlackout;
        if (py.longest_darkness_hours === null) expect(ld).toBeNull();
        else {
          expect(Math.abs(windowHours(ld!) - (py.longest_darkness_hours as number))).toBeLessThan(H_TOL);
          expect(ld!.truncatedStart || ld!.truncatedEnd).toBe(py.longest_darkness_truncated);
        }
        if (py.longest_blackout_hours === null) expect(lb).toBeNull();
        else {
          expect(Math.abs(windowHours(lb!) - (py.longest_blackout_hours as number))).toBeLessThan(H_TOL);
          expect(lb!.truncatedStart || lb!.truncatedEnd).toBe(py.longest_blackout_truncated);
        }
      });
    }
  }
});
