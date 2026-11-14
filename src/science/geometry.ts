/**
 * Observer geometry on the lunar reference sphere. [M-GEOM]
 *
 * Frame: lunar Mean-Earth/Polar-Axis body-fixed frame (SPICE
 * MOON_ME_DE440_ME421, the frame of the LOLA products) [R-NAIF-MOONFK].
 * Latitude planetocentric, longitude east-positive, degrees.
 * Local frame: East-North-Up with Up = planetocentric radial direction.
 * Azimuth clockwise from north in [0, 360); elevation above the local
 * horizontal plane. Mirrors scripts/moonlib.py.
 */
import { DEG, R_MOON_M } from './constants';

export type Vec3 = [number, number, number];

export interface EnuBasis {
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n === 0) throw new Error('cannot normalise a zero vector');
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** East, North, Up unit vectors (body-fixed components) at a planetocentric lat/lon. E x N = U. */
export function enuBasis(latDeg: number, lonDeg: number): EnuBasis {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const so = Math.sin(lon), co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/** Body-fixed position in km of a point at planetocentric radius `radiusM` (metres). */
export function sitePositionKm(latDeg: number, lonDeg: number, radiusM: number): Vec3 {
  return scale(enuBasis(latDeg, lonDeg).up, radiusM / 1000);
}

/** Wrap an angle to [0, 360). */
export function wrap360(deg: number): number {
  const w = deg % 360;
  return w < 0 ? w + 360 : w;
}

/** Signed smallest difference a - b in (-180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = wrap360(a - b);
  return d > 180 ? d - 360 : d;
}

export interface AzEl {
  /** Azimuth, degrees clockwise from north, [0, 360). */
  azDeg: number;
  /** Elevation above the local horizontal plane, degrees. */
  elDeg: number;
  /** Observer-to-target distance, same unit as the input vector. */
  dist: number;
}

/** Azimuth/elevation of an observer->target vector given in body-fixed components. */
export function azEl(topo: Vec3, basis: EnuBasis): AzEl {
  const e = dot(topo, basis.east);
  const n = dot(topo, basis.north);
  const u = dot(topo, basis.up);
  const dist = Math.hypot(e, n, u);
  return {
    azDeg: wrap360(Math.atan2(e, n) / DEG),
    elDeg: Math.asin(Math.max(-1, Math.min(1, u / dist))) / DEG,
    dist,
  };
}

/** Unit vector in ENU components [east, north, up] for an azimuth/elevation. Inverse of azEl. */
export function enuDirection(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG, el = elDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
}

/**
 * ENU position (metres, relative to the site's ground point) of a terrain-patch
 * node. The patch grid is azimuthal-equidistant: the node at offsets (eastM,
 * northM) lies at arc length s = hypot(e, n) along azimuth atan2(e, n) from the
 * site (see scripts/build_data.py terrain_patch). With theta = s / R and target
 * radius r = R + h, the exact position on the sphere is
 *   horizontal = r sin(theta), up = r cos(theta) - r_site,
 * so the rendered patch includes lunar curvature. [M-PATCH]
 */
export function terrainNodeEnu(eastM: number, northM: number, heightM: number, siteHeightM: number): Vec3 {
  const s = Math.hypot(eastM, northM);
  const r = R_MOON_M + heightM;
  const rSite = R_MOON_M + siteHeightM;
  if (s === 0) return [0, 0, r - rSite];
  const theta = s / R_MOON_M;
  const horiz = r * Math.sin(theta);
  return [(horiz * eastM) / s, (horiz * northM) / s, r * Math.cos(theta) - rSite];
}

/**
 * South polar stereographic projection on the sphere, true scale at the pole,
 * central meridian 0 (the projection of the LOLA polar products).
 * Returns metres; longitude 0 points along +y, 90E along +x. [R-SNYDER]
 */
export function stereoSouth(latDeg: number, lonDeg: number): [number, number] {
  const rho = 2 * R_MOON_M * Math.tan(Math.PI / 4 + (latDeg * DEG) / 2);
  return [rho * Math.sin(lonDeg * DEG), rho * Math.cos(lonDeg * DEG)];
}

/** Inverse of stereoSouth: metres -> [latDeg, lonDeg in (-180, 180]]. */
export function stereoSouthInverse(xM: number, yM: number): [number, number] {
  const rho = Math.hypot(xM, yM);
  return [-(90 - (2 * Math.atan(rho / (2 * R_MOON_M))) / DEG), Math.atan2(xM, yM) / DEG];
}
