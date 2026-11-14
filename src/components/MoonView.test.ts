import { describe, expect, it } from 'vitest';
import { globeCoordinates, globePosition, moonScaleBar } from './MoonView';

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

  it('recovers east-positive coordinates at landing sites and across the date line', () => {
    for (const [lat, lon] of [[-85.5, 31.5], [-80.7, -1.4], [61.34766, -22.14844], [0, 179.9], [0, -179.9], [89.9, -70]]) {
      const recovered = globeCoordinates(globePosition(lat, lon));
      expect(recovered.lat).toBeCloseTo(lat, 9);
      expect(recovered.lon).toBeCloseTo(lon, 9);
    }
  });

  it('uses consistent units and a readable distance scale when zooming', () => {
    const wide = moonScaleBar(5.8);
    const close = moonScaleBar(2.1);
    expect(wide.km).toBe(500);
    expect(close.km).toBe(200);
    for (const scale of [wide, close]) expect(scale.pixels).toBeLessThanOrEqual(100);
    expect(wide.pixels * 5.8).toBeCloseTo(500, 12);
    expect(close.pixels * 2.1).toBeCloseTo(200, 12);
    expect(() => moonScaleBar(0)).toThrow(RangeError);
    expect(() => moonScaleBar(Infinity)).toThrow(RangeError);
  });
});
