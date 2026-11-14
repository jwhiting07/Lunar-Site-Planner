import { describe, expect, it } from 'vitest';
import { DEG, R_MOON_M } from './constants';
import {
  angleDiffDeg,
  azEl,
  dot,
  enuBasis,
  enuDirection,
  norm,
  sitePositionKm,
  stereoSouth,
  stereoSouthInverse,
  terrainNodeEnu,
  wrap360,
  type Vec3,
} from './geometry';
import { horizonAt } from './horizon';
import { sitesDoc } from './__fixtures__/shipped';

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const fromEnu = (b: ReturnType<typeof enuBasis>, v: Vec3): Vec3 => [
  v[0] * b.east[0] + v[1] * b.north[0] + v[2] * b.up[0],
  v[0] * b.east[1] + v[1] * b.north[1] + v[2] * b.up[1],
  v[0] * b.east[2] + v[1] * b.north[2] + v[2] * b.up[2],
];

const LATLON: [number, number][] = [
  [0, 0], [45, 30], [-30, 200], [-84.7906, 29.1957], [-80.13, 1.44], [-89.445496, 222.686278], [-89.999, 123], [10, -170],
];

describe('enuBasis', () => {
  it.each(LATLON)('is orthonormal and right-handed at lat %f lon %f', (lat, lon) => {
    const { east, north, up } = enuBasis(lat, lon);
    for (const v of [east, north, up]) expect(norm(v)).toBeCloseTo(1, 14);
    expect(Math.abs(dot(east, north))).toBeLessThan(1e-15);
    expect(Math.abs(dot(east, up))).toBeLessThan(1e-15);
    expect(Math.abs(dot(north, up))).toBeLessThan(1e-15);
    const c = cross(east, north);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(up[i], 14);
  });

  it('matches the known basis at lat 0, lon 0: E=+Y, N=+Z, U=+X', () => {
    const { east, north, up } = enuBasis(0, 0);
    expect(east.map((x) => x + 0)).toEqual([0, 1, 0]);
    expect(north.map((x) => x + 0)).toEqual([0, 0, 1]);
    expect(up.map((x) => x + 0)).toEqual([1, 0, 0]);
  });

  it('north points toward the south pole axis direction (+Z component positive) in the south polar region', () => {
    // At -85 deg latitude, local north is mostly "away from the south pole": +Z component = cos(lat) > 0
    const { north, up } = enuBasis(-85, 40);
    expect(north[2]).toBeCloseTo(Math.cos(85 * DEG), 15);
    expect(up[2]).toBeCloseTo(-Math.sin(85 * DEG), 15);
  });
});

describe('azEl', () => {
  const b = enuBasis(-84.7906, 29.1957);
  it('pure E/N/U/W/S vectors', () => {
    expect(azEl(b.east, b).azDeg).toBeCloseTo(90, 12);
    expect(azEl(b.east, b).elDeg).toBeCloseTo(0, 12);
    expect(azEl(b.north, b).azDeg).toBeCloseTo(0, 12);
    expect(azEl(b.up, b).elDeg).toBeCloseTo(90, 12);
    expect(azEl([-b.east[0], -b.east[1], -b.east[2]], b).azDeg).toBeCloseTo(270, 12);
    expect(azEl([-b.north[0], -b.north[1], -b.north[2]], b).azDeg).toBeCloseTo(180, 12);
    expect(azEl([-b.up[0], -b.up[1], -b.up[2]], b).elDeg).toBeCloseTo(-90, 12);
  });

  it('returns the vector length as dist (unit-agnostic)', () => {
    const v: Vec3 = [3e8, -4e8, 12e8];
    expect(azEl(v, b).dist).toBeCloseTo(13e8, 0);
  });

  it('azimuth wraps continuously across north (0/360) and horizonAt is continuous there', () => {
    const eps = 1e-6; // degrees
    const west = azEl(fromEnu(b, enuDirection(-eps, 1)), b).azDeg;
    const east = azEl(fromEnu(b, enuDirection(eps, 1)), b).azDeg;
    expect(west).toBeGreaterThan(359.999);
    expect(west).toBeLessThan(360);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(east).toBeLessThan(0.001);
    expect(angleDiffDeg(east, west)).toBeCloseTo(2 * eps, 9);
    // horizon mask with distinct values at 0 and 359.5 deg
    const elev = new Float32Array(720).map((_, i) => Math.sin(i * 0.5 * DEG) * 3 + 1);
    const mask = { azStepDeg: 0.5, elevDeg: elev, distM: new Float32Array(720), terrainAware: true };
    expect(Math.abs(horizonAt(mask, west) - horizonAt(mask, east))).toBeLessThan(1e-6);
    expect(horizonAt(mask, 360)).toBeCloseTo(horizonAt(mask, 0), 12);
  });

  it('enuDirection is the inverse of azEl', () => {
    for (const lat of [-89.5, -80, 10]) {
      const bb = enuBasis(lat, 77);
      for (const az of [0.0001, 13.7, 90, 179.99, 245.5, 359.9999]) {
        for (const el of [-12.3, -0.01, 0, 0.27, 45, 88.8]) {
          const r = azEl(fromEnu(bb, enuDirection(az, el)), bb);
          expect(angleDiffDeg(r.azDeg, az)).toBeCloseTo(0, 9);
          expect(r.elDeg).toBeCloseTo(el, 10);
          expect(r.dist).toBeCloseTo(1, 14);
        }
      }
    }
  });
});

describe('wrap360 / angleDiffDeg', () => {
  it('wraps into [0, 360)', () => {
    expect(wrap360(-0.5)).toBeCloseTo(359.5, 12);
    expect(wrap360(720)).toBe(0);
    expect(wrap360(359.999)).toBeCloseTo(359.999, 12);
    expect(angleDiffDeg(1, 359)).toBeCloseTo(2, 12);
    expect(angleDiffDeg(359, 1)).toBeCloseTo(-2, 12);
    expect(angleDiffDeg(180, 0)).toBe(180);
  });
});

describe('sitePositionKm', () => {
  it('has the requested radius in km and points along Up', () => {
    const p = sitePositionKm(-80.13, 1.44, R_MOON_M + 2591.9 + 2);
    expect(norm(p)).toBeCloseTo((R_MOON_M + 2593.9) / 1000, 9);
    const u = enuBasis(-80.13, 1.44).up;
    expect(dot(p, u) / norm(p)).toBeCloseTo(1, 15);
    expect(sitePositionKm(0, 90, 1000)).toEqual([expect.closeTo(0, 15), 1, 0]);
  });
});

describe('stereoSouth', () => {
  it('maps the pole to the origin and matches a hand-checked value', () => {
    const [x0, y0] = stereoSouth(-90, 0);
    expect(Math.abs(x0)).toBeLessThan(1e-9);
    expect(Math.abs(y0)).toBeLessThan(1e-9);
    // lat -80: rho = 2 R tan(45 - 40 deg) = 3 474 800 m * tan(5 deg) = 304 005.61 m (tan 5deg = 0.0874886635)
    const [x, y] = stereoSouth(-80, 90);
    expect(x).toBeCloseTo(3_474_800 * 0.08748866352592401, 4);
    expect(x).toBeCloseTo(304005.61, 1);
    expect(Math.abs(y)).toBeLessThan(1e-6);
    // lon 0 points along +y
    const [x2, y2] = stereoSouth(-80, 0);
    expect(Math.abs(x2)).toBeLessThan(1e-9);
    expect(y2).toBeCloseTo(304005.61, 1);
  });

  it('round-trips forward/inverse', () => {
    for (const [lat, lon] of [[-89.9999, 10], [-85, -170], [-60.5, 179.9], [-70, 0], [-80.13, 1.44]]) {
      const [x, y] = stereoSouth(lat, lon);
      const [lat2, lon2] = stereoSouthInverse(x, y);
      expect(lat2).toBeCloseTo(lat, 10);
      expect(angleDiffDeg(lon2, lon)).toBeCloseTo(0, 9);
    }
  });

  it('reproduces the stereo_xy_m recorded in sites.json (rounded to 0.1 m)', () => {
    for (const s of sitesDoc().sites) {
      const [x, y] = stereoSouth(s.lat_deg, s.lon_deg);
      // lat/lon in sites.json are rounded to 1e-6 deg (<= 3 cm) and xy to 0.1 m
      expect(Math.abs(x - s.stereo_xy_m[0])).toBeLessThan(0.1);
      expect(Math.abs(y - s.stereo_xy_m[1])).toBeLessThan(0.1);
    }
  });
});

describe('terrainNodeEnu', () => {
  it('zero offset gives the pure height difference', () => {
    expect(terrainNodeEnu(0, 0, 1200, 1000)).toEqual([0, 0, 200]);
  });

  it('curvature drop is ~ s^2 / 2R for small s at the site height', () => {
    for (const s of [100, 1000, 5000]) {
      const p = terrainNodeEnu(s * 0.6, s * 0.8, 0, 0);
      const drop = -p[2];
      expect(drop / (s * s / (2 * R_MOON_M))).toBeCloseTo(1, 4);
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(R_MOON_M * Math.sin(s / R_MOON_M), 6);
      expect(p[0] / p[1]).toBeCloseTo(0.75, 12);
    }
    // 20 km: drop = 115.1 m (first-order 400e6 / 3474800 = 115.11 m)
    expect(-terrainNodeEnu(20_000, 0, 0, 0)[2]).toBeCloseTo(115.11, 1);
  });

  it('equals a direct spherical computation by rotating the site radial vector', () => {
    const lat = -84.7906, lon = 29.1957, hSite = 5321.5;
    const b = enuBasis(lat, lon);
    const pSite = b.up.map((c) => c * (R_MOON_M + hSite)) as Vec3;
    for (const [e, n, h] of [[1500, -300, 5000], [-20000, 20000, 1145.6], [7000, 9000, 6798.5]]) {
      const s = Math.hypot(e, n), theta = s / R_MOON_M;
      const dirH: Vec3 = fromEnu(b, [e / s, n / s, 0]);
      const radial = [0, 1, 2].map((i) => Math.cos(theta) * b.up[i] + Math.sin(theta) * dirH[i]) as Vec3;
      const pNode = radial.map((c) => c * (R_MOON_M + h)) as Vec3;
      const d: Vec3 = [pNode[0] - pSite[0], pNode[1] - pSite[1], pNode[2] - pSite[2]];
      const enu: Vec3 = [dot(d, b.east), dot(d, b.north), dot(d, b.up)];
      const got = terrainNodeEnu(e, n, h, hSite);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - enu[i])).toBeLessThan(1e-6);
    }
  });
});
