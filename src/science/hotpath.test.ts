import { describe, expect, it } from 'vitest';
import { bodyVectorKm, bodyVectorsInto, tableEndMs, mergeTables } from './ephemeris';
import { azEl, azElInto, enuBasis, type Vec3 } from './geometry';
import { shippedEphemeris } from './__fixtures__/shipped';

describe('allocation-free hot-path helpers match their object-returning forms exactly', () => {
  it('azElInto equals azEl for random vectors at several sites', () => {
    const out = new Float64Array(3);
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5;
    for (const [lat, lon] of [[-84.79, 29.2], [-80.13, 1.44], [-89.45, 222.7], [0, 0], [45, -170]]) {
      const basis = enuBasis(lat, lon);
      for (let i = 0; i < 200; i++) {
        const v: Vec3 = [rand() * 8e5, rand() * 8e5, rand() * 8e5];
        const ref = azEl(v, basis);
        azElInto(v[0], v[1], v[2], basis, out);
        expect([out[0], out[1], out[2]]).toEqual([ref.azDeg, ref.elDeg, ref.dist]);
      }
    }
  });

  it('bodyVectorsInto equals bodyVectorKm for both bodies, at samples and between them, and refuses extrapolation', () => {
    const eph = shippedEphemeris();
    const out = new Float64Array(6);
    for (const f of [0, 0.25, 1, 17.5, 4000.123, eph.n - 2.5, eph.n - 1]) {
      const t = eph.t0Ms + f * eph.stepMs;
      bodyVectorsInto(eph, t, out);
      expect([out[0], out[1], out[2]]).toEqual(bodyVectorKm(eph, t, 'sun'));
      expect([out[3], out[4], out[5]]).toEqual(bodyVectorKm(eph, t, 'earth'));
    }
    expect(() => bodyVectorsInto(eph, eph.t0Ms - 1, out)).toThrow(RangeError);
    expect(() => bodyVectorsInto(eph, tableEndMs(eph) + 1, out)).toThrow(RangeError);
  });

  it('mergeTables shares a single table instead of copying it', () => {
    const eph = shippedEphemeris();
    expect(mergeTables([eph])).toBe(eph);
  });
});
