/**
 * Analysis on SYNTHETIC ephemeris tables whose geometry is known analytically.
 * The site is at lat 0, lon 0 (E = +Y, N = +Z, U = +X). Body vectors are built
 * as observer + D * direction(az, el) so the topocentric az/el at each sample is
 * exactly the constructed one.
 */
import { describe, expect, it } from 'vitest';
import { AU_KM, DEFAULT_LANDER, DEG, HOUR_MS, R_MOON_M, R_SUN_KM } from './constants';
import type { EphemerisTable } from './ephemeris';
import { enuBasis, enuDirection, sitePositionKm, type Vec3 } from './geometry';
import { flatHorizon, type HorizonMask } from './horizon';
import { analyzeMission, analyzeSite, instantState, makeSiteContext, sampleTimes, sunAngularRadiusDeg } from './analysis';
import { simulateBattery } from './power';
import type { SiteDoc } from './types';

const H = (h: number) => h * HOUR_MS;
const EARTH_D = 384_400;
const site = { id: 'synthetic', lat_deg: 0, lon_deg: 0, elevation_m: 0 } as unknown as SiteDoc;
const basis = enuBasis(0, 0);
const OBS_H = 2;
const obs = sitePositionKm(0, 0, R_MOON_M + OBS_H);

function bodyAt(az: number, el: number, d: number): Vec3 {
  const v = enuDirection(az, el);
  return [0, 1, 2].map((i) => obs[i] + d * (v[0] * basis.east[i] + v[1] * basis.north[i] + v[2] * basis.up[i])) as Vec3;
}

/** n hourly samples; sun/earth (az, el) as functions of the hour index. */
function table(n: number, sun: (h: number) => [number, number], earth: (h: number) => [number, number]): EphemerisTable {
  const data = new Float64Array(n * 6);
  for (let k = 0; k < n; k++) {
    data.set(bodyAt(...sun(k), AU_KM), k * 6);
    data.set(bodyAt(...earth(k), EARTH_D), k * 6 + 3);
  }
  return { t0Ms: 0, stepMs: HOUR_MS, n, data };
}

function wallMask(fromAz: number, toAz: number, heightDeg: number): HorizonMask {
  const elev = new Float32Array(720);
  for (let i = 0; i < 720; i++) if (i * 0.5 >= fromAz && i * 0.5 <= toAz) elev[i] = heightDeg;
  return { azStepDeg: 0.5, elevDeg: elev, distM: new Float32Array(720).fill(1000), terrainAware: true };
}

const rSun = Math.asin(R_SUN_KM / AU_KM) / DEG; // 0.266453 deg

describe('instantState (synthetic)', () => {
  const eph = table(3, () => [90, 3], () => [180, 3]);
  it('reproduces the constructed az/el/distance at a sample', () => {
    const st = instantState(makeSiteContext(site, OBS_H, flatHorizon()), eph, H(1));
    expect(st.sun.azDeg).toBeCloseTo(90, 9);
    expect(st.sun.elDeg).toBeCloseTo(3, 9);
    expect(st.sun.distKm).toBeCloseTo(AU_KM, 3);
    expect(st.sun.angularRadiusDeg).toBeCloseTo(rSun, 9);
    expect(st.earth.azDeg).toBeCloseTo(180, 9);
    expect(st.earth.distKm).toBeCloseTo(EARTH_D, 6);
  });

  it('a 5 deg wall over az 80-100 blocks a body at 3 deg there but not elsewhere', () => {
    const ctx = makeSiteContext(site, OBS_H, wallMask(80, 100, 5));
    const st = instantState(ctx, eph, H(1));
    expect(st.sun.horizonDeg).toBeCloseTo(5, 6);
    expect(st.sun.clearanceDeg).toBeCloseTo(-2, 6);
    expect(st.sun.visible).toBe(false);
    expect(st.sun.diskFraction).toBe(0);
    expect(st.sun.horizonDistM).toBe(1000);
    expect(st.earth.horizonDeg).toBe(0);
    expect(st.earth.visible).toBe(true);
    // same mask, Sun moved to az 180
    const st2 = instantState(ctx, table(3, () => [180, 3], () => [90, 3]), H(1));
    expect(st2.sun.visible).toBe(true);
    expect(st2.sun.diskFraction).toBe(1);
    expect(st2.earth.visible).toBe(false);
  });

  it('upper-limb convention: visible while the centre is below the horizon by less than the angular radius', () => {
    const ctx = makeSiteContext(site, OBS_H, flatHorizon());
    const below = (el: number) => instantState(ctx, table(2, () => [45, el], () => [0, 10]), 0).sun;
    const a = below(-0.1);
    expect(a.visible).toBe(true);
    expect(a.diskFraction).toBeGreaterThan(0);
    expect(a.diskFraction).toBeLessThan(0.5);
    expect(below(-rSun + 0.001).visible).toBe(true);
    expect(below(-rSun - 0.001).visible).toBe(false);
    expect(below(0).diskFraction).toBeCloseTo(0.5, 6);
  });

  it('Earth min-clearance threshold', () => {
    const eph2 = table(2, () => [0, -10], () => [200, 1.5]);
    const ctx = makeSiteContext(site, OBS_H, flatHorizon());
    expect(instantState(ctx, eph2, 0, 1).earth.visible).toBe(true);
    expect(instantState(ctx, eph2, 0, 2).earth.visible).toBe(false);
    expect(instantState(ctx, eph2, 0, 2).earth.aboveFlatHorizon).toBe(true);
  });
});

describe('analyzeSite (synthetic)', () => {
  // Sun rising at 0.5 deg/h in elevation at az 90; Earth rising at 0.25 deg/h at az 200.
  const sunEl = (h: number) => -2 + 0.5 * h;
  const earthEl = (h: number) => -1 + 0.25 * h;
  const eph = table(13, (h) => [90, sunEl(h)], (h) => [200, earthEl(h)]);
  const opts = { startMs: 0, endMs: H(12), params: DEFAULT_LANDER };

  it('Sun rise time equals the analytic upper-limb crossing (2 - r_sun) / 0.5 h', () => {
    const r = analyzeSite(makeSiteContext(site, OBS_H, flatHorizon()), eph, opts);
    const tRise = (2 - rSun) / 0.5; // 3.4671 h
    expect(r.metrics.sunWindows).toHaveLength(1);
    expect(r.metrics.sunWindows[0].startMs / HOUR_MS).toBeCloseTo(tRise, 5);
    expect(r.metrics.sunWindows[0].truncatedEnd).toBe(true);
    expect(r.metrics.sunlitHours).toBeCloseTo(12 - tRise, 5);
    expect(r.metrics.sunlitFraction).toBeCloseTo((12 - tRise) / 12, 6);
    // darkness = [0, tRise), truncated at the start
    expect(r.metrics.longestDarkness!.truncatedStart).toBe(true);
    expect((r.metrics.longestDarkness!.endMs - r.metrics.longestDarkness!.startMs) / HOUR_MS).toBeCloseTo(tRise, 5);
    // flat-horizon case: terrain-aware fraction == flat fraction
    expect(r.metrics.sunlitFractionFlat).toBeCloseTo(r.metrics.sunlitFraction, 12);
    expect(r.terrainAware).toBe(false);
  });

  it('Earth rise honours the minimum clearance: 4 h at 0 deg, 8 h at 1 deg', () => {
    const ctx = makeSiteContext(site, OBS_H, flatHorizon());
    const r0 = analyzeSite(ctx, eph, opts);
    expect(r0.metrics.earthWindows[0].startMs / HOUR_MS).toBeCloseTo(4, 5);
    const r1 = analyzeSite(ctx, eph, { ...opts, earthMinClearanceDeg: 1 });
    expect(r1.metrics.earthWindows[0].startMs / HOUR_MS).toBeCloseTo(8, 5);
    expect(r1.metrics.earthVisibleHours).toBeCloseTo(4, 5);
    expect(r1.metrics.bothHours).toBeCloseTo(4, 5); // Sun is up from 3.47 h
    expect(r1.metrics.longestBlackout!.truncatedStart).toBe(true);
  });

  it('a uniform 1 deg terrain horizon delays sunrise by exactly 2 h', () => {
    const elev = new Float32Array(720).fill(1);
    const mask: HorizonMask = { azStepDeg: 0.5, elevDeg: elev, distM: new Float32Array(720), terrainAware: true };
    const r = analyzeSite(makeSiteContext(site, OBS_H, mask), eph, opts);
    expect(r.metrics.sunWindows[0].startMs / HOUR_MS).toBeCloseTo((3 - rSun) / 0.5, 5);
    expect(r.metrics.sunlitFractionFlat - r.metrics.sunlitFraction).toBeCloseTo(2 / 12, 5);
    expect(r.metrics.meanHorizonAtSunDeg).toBeCloseTo(1, 6);
  });

  it('series arrays agree with instantState at the same times, battery with simulateBattery', () => {
    const ctx = makeSiteContext(site, OBS_H, wallMask(80, 100, 1));
    const o = { ...opts, stepMs: H(0.25) };
    const r = analyzeSite(ctx, eph, o);
    expect(r.series.tMs.length).toBe(49);
    for (const i of [0, 7, 13, 14, 15, 30, 48]) {
      const st = instantState(ctx, eph, r.series.tMs[i]);
      expect(r.series.sunElDeg[i]).toBe(st.sun.elDeg);
      expect(r.series.sunAzDeg[i]).toBe(st.sun.azDeg);
      expect(r.series.sunHorizonDeg[i]).toBe(st.sun.horizonDeg);
      expect(r.series.sunClearanceDeg[i]).toBe(st.sun.clearanceDeg);
      expect(r.series.sunDiskFraction[i]).toBe(st.sun.diskFraction);
      expect(r.series.sunVisible[i]).toBe(st.sun.visible ? 1 : 0);
      expect(r.series.earthElDeg[i]).toBe(st.earth.elDeg);
      expect(r.series.earthVisible[i]).toBe(st.earth.visible ? 1 : 0);
    }
    const b = simulateBattery(r.series.tMs, r.series.powerW, DEFAULT_LANDER);
    expect(Array.from(r.series.batteryWh)).toEqual(Array.from(b.energyWh));
    expect(r.battery.generatedWh).toBe(b.generatedWh);
    // power is zero whenever the Sun is not visible
    for (let i = 0; i < r.series.tMs.length; i++) if (!r.series.sunVisible[i]) expect(r.series.powerW[i]).toBe(0);
  });

  it('sunAngularRadiusDeg at 1 au = asin(695700 / 149597870.7) = 0.266453 deg', () => {
    expect(sunAngularRadiusDeg(AU_KM)).toBeCloseTo(0.266453, 6);
  });
});

describe('refined mission analysis preserves the public series', () => {
  it('detects an intervening terrain blackout absent at both hourly endpoints', () => {
    const eph = table(2, h => [90 + h, 3], h => [90 + h, 3]);
    const ctx = makeSiteContext(site, OBS_H, wallMask(90.5, 90.5, 5));
    const opts = { startMs: 0, endMs: H(1), params: DEFAULT_LANDER };
    const hourly = analyzeSite(ctx, eph, opts);
    const refined = analyzeMission(ctx, eph, opts);
    const reference = analyzeSite(ctx, eph, { ...opts, stepMs: 60_000 });
    expect(hourly.metrics.longestBlackout).toBeNull();
    expect(refined.metrics.longestBlackout).not.toBeNull();
    expect(refined.metrics.earthVisibleHours).toBeCloseTo(reference.metrics.earthVisibleHours, 3);
    expect(refined.series.tMs).toEqual(hourly.series.tMs);
    expect(refined.calculation!.samples).toBeGreaterThan(refined.series.tMs.length);
  });

  it('retains exact fractional endpoints and hourly chart values, with a refined battery history', () => {
    const eph = table(4, h => [90, -0.5 + h], () => [180, 5]);
    const ctx = makeSiteContext(site, OBS_H, flatHorizon());
    const opts = { startMs: 1000, endMs: H(2.3), params: DEFAULT_LANDER };
    const r = analyzeMission(ctx, eph, opts);
    expect(r.series.tMs).toEqual(sampleTimes(opts.startMs, opts.endMs, HOUR_MS));
    expect(r.stepMs).toBe(HOUR_MS);
    expect(r.battery.energyWh).toEqual(r.series.batteryWh);
    for (let i = 0; i < r.series.tMs.length; i++) {
      expect(r.series.sunElDeg[i]).toBeCloseTo(instantState(ctx, eph, r.series.tMs[i]).sun.elDeg, 12);
    }
  });
});

describe('sampleTimes', () => {
  it('always includes the exact end, with a short final step when unaligned', () => {
    expect(Array.from(sampleTimes(0, H(3), H(1)))).toEqual([0, H(1), H(2), H(3)]);
    expect(Array.from(sampleTimes(0, H(2.5), H(1)))).toEqual([0, H(1), H(2), H(2.5)]);
    expect(() => sampleTimes(5, 5, H(1))).toThrow(RangeError);
    for (const step of [0, -1, NaN, Infinity]) expect(() => sampleTimes(0, H(1), step)).toThrow(RangeError);
  });
});
