import { describe, expect, it } from 'vitest';
import { globePosition } from './MoonView';

describe('NASA equirectangular globe orientation', () => {
  it('places cardinal longitudes and poles on the intended Three axes', () => {
    const cases = [[0, 0, 1, 0, 0], [0, 90, 0, 0, -1], [0, 180, -1, 0, 0], [0, 270, 0, 0, 1], [90, 0, 0, 1, 0], [-90, 0, 0, -1, 0]];
    for (const [lat, lon, x, y, z] of cases) {
      const point = globePosition(lat, lon);
      expect(point.x).toBeCloseTo(x, 12);
      expect(point.y).toBeCloseTo(y, 12);
      expect(point.z).toBeCloseTo(z, 12);
      expect(point.length()).toBeCloseTo(1, 12);
    }
  });
});
