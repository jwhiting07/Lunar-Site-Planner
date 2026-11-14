/** Display-only geometric DE440 orbits. Planning keeps its apparent ME-frame tables. */
import { Quaternion, Vector3 } from 'three';
import { AU_KM } from '../science/constants';

export type OrbitBody = 'sun' | 'earth' | 'moon';
export interface OrbitIndex {
  file: string; start_utc: string; stop_utc: string; step_s: number; n: number; stride: number;
  radii_km: Record<OrbitBody, number>;
}
export interface OrbitData { index: OrbitIndex; t0: number; end: number; step: number; values: Float64Array }
let pending: Promise<OrbitData> | undefined;
export function loadOrbits(): Promise<OrbitData> {
  return pending ??= (async () => {
    const base = `${import.meta.env.BASE_URL}data/`;
    const indexResponse = await fetch(`${base}orbits.json`);
    if (!indexResponse.ok) throw new Error('Could not load orbital coverage.');
    const index: OrbitIndex = await indexResponse.json();
    const response = await fetch(base + index.file);
    if (!response.ok) throw new Error('Could not load orbital positions.');
    const values = new Float64Array(await response.arrayBuffer());
    if (index.stride !== 14 || values.length !== index.n * index.stride || index.n < 2) throw new Error('Invalid orbital data.');
    return { index, values, t0: Date.parse(index.start_utc), end: Date.parse(index.stop_utc), step: index.step_s * 1000 };
  })().catch(error => { pending = undefined; throw error; });
}

function bracket(data: OrbitData, time: number): [number, number] {
  if (!Number.isFinite(time) || time < data.t0 || time > data.end) throw new RangeError('Current time is outside orbital coverage (2026–2028 UTC).');
  const f = (time - data.t0) / data.step;
  const i = Math.min(Math.floor(f), data.index.n - 2);
  return [i, f - i];
}
export function orbitPosition(data: OrbitData, time: number, body: 'earth' | 'moon'): Vector3 {
  const [i, w] = bracket(data, time);
  const a = i * 14 + (body === 'earth' ? 0 : 3);
  const d = data.values;
  return new Vector3(...[0, 1, 2].map(k => d[a + k] + (d[a + 14 + k] - d[a + k]) * w) as [number, number, number]);
}
export function orbitOrientation(data: OrbitData, time: number, body: 'earth' | 'moon'): Quaternion {
  const [i, w] = bracket(data, time);
  const a = i * 14 + (body === 'moon' ? 6 : 10), d = data.values;
  const q = (offset: number) => new Quaternion(d[offset + 1], d[offset + 2], d[offset + 3], d[offset]);
  return q(a).slerp(q(a + 14), w).normalize();
}

/** UTC calendar months, preserving day when possible (Jan 31 -> July 31). */
export function sixMonthsAfter(time: number): number {
  const d = new Date(time), month = d.getUTCMonth() + 6;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}
export function futureTimes(data: OrbitData, now: number, count = 720): number[] {
  bracket(data, now);
  const end = Math.min(sixMonthsAfter(now), data.end);
  return Array.from({ length: count + 1 }, (_, i) => now + (end - now) * i / count);
}
export function metersPerPixel(radiusKm: number, diameterCssPx: number): number {
  if (!(radiusKm > 0 && diameterCssPx > 0)) throw new RangeError('Scale needs a positive radius and projected diameter.');
  return radiusKm * 2000 / diameterCssPx;
}

/**
 * Explicit schematic layout: heliocentric ecliptic directions; far-left extent
 * compressed and lunar separation enlarged. This is never used by science code.
 * Reference angle is captured once on entry; current positions continue to move.
 */
export function createOrbitLayout(data: OrbitData, epoch: number) {
  const current = orbitPosition(data, epoch, 'earth');
  const angle = Math.atan2(current.y, current.x);
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (p: Vector3) => {
    const x = (p.x * c + p.y * s) / AU_KM;
    return new Vector3(x >= 0 ? x : x * 0.27, p.z / AU_KM, (p.x * s - p.y * c) / AU_KM);
  };
  const position = (time: number, body: OrbitBody) => {
    if (body === 'sun') return new Vector3();
    const earth = orbitPosition(data, time, 'earth');
    if (body === 'earth') return rotate(earth);
    const moon = orbitPosition(data, time, 'moon');
    return rotate(earth.add(moon.sub(earth).multiplyScalar(70)));
  };
  // Body-fixed -> Three's Y-up axes, followed by the fixed view azimuth.
  const frame = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -angle)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
  return { position, frame };
}
