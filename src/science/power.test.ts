import { describe, expect, it } from 'vitest';
import { AU_KM, HOUR_MS, type LanderParams } from './constants';
import { diskFractionVisible, incidenceFactor, panelPowerW, simulateBattery, solarFluxWm2 } from './power';

const H = (h: number) => h * HOUR_MS;
const P: LanderParams = { panelAreaM2: 2, panelEfficiency: 0.28, loadW: 150, batteryCapacityWh: 1500, panelMode: 'tracking' };

describe('solarFluxWm2', () => {
  it('is 1361 W/m^2 at 1 au and scales with the inverse square', () => {
    expect(solarFluxWm2(AU_KM)).toBeCloseTo(1361, 10);
    expect(solarFluxWm2(2 * AU_KM)).toBeCloseTo(1361 / 4, 10);
    expect(solarFluxWm2(0.983 * AU_KM)).toBeCloseTo(1361 / 0.983 ** 2, 9);
  });
});

describe('diskFractionVisible', () => {
  it('is 0, 0.5, 1 at x = -1, 0, 1 and clamps beyond', () => {
    expect(diskFractionVisible(-0.27, 0.27)).toBe(0);
    expect(diskFractionVisible(0, 0.27)).toBeCloseTo(0.5, 15);
    expect(diskFractionVisible(0.27, 0.27)).toBe(1);
    expect(diskFractionVisible(-5, 0.27)).toBe(0);
    expect(diskFractionVisible(5, 0.27)).toBe(1);
  });
  it('is monotonic and satisfies f(x) + f(-x) = 1', () => {
    let prev = -1;
    for (let x = -1; x <= 1.0000001; x += 0.01) {
      const f = diskFractionVisible(x, 1);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f + diskFractionVisible(-x, 1)).toBeCloseTo(1, 12);
      prev = f;
    }
  });
  it('matches the circular-segment area at x = 0.5 (hand value 0.80450)', () => {
    // segment below edge: (acos(0.5) - 0.5 sqrt(0.75)) / pi = (1.047198 - 0.433013) / pi = 0.195501
    expect(diskFractionVisible(0.5, 1)).toBeCloseTo(1 - 0.195501, 5);
  });
});

describe('incidenceFactor / panelPowerW', () => {
  it('tracking = 1, vertical = cos(el), horizontal = max(0, sin(el))', () => {
    expect(incidenceFactor('tracking', 3)).toBe(1);
    expect(incidenceFactor('vertical', 60)).toBeCloseTo(0.5, 15);
    expect(incidenceFactor('horizontal', 30)).toBeCloseTo(0.5, 15);
    expect(incidenceFactor('horizontal', -5)).toBe(0);
  });
  it('hand-computed power: 1361 * 2 m^2 * 0.28 = 762.16 W at 1 au, full disk', () => {
    expect(panelPowerW(P, AU_KM, 2, 1)).toBeCloseTo(762.16, 9);
    expect(panelPowerW(P, AU_KM, 2, 0.5)).toBeCloseTo(381.08, 9);
    expect(panelPowerW({ ...P, panelMode: 'vertical' }, AU_KM, 60, 1)).toBeCloseTo(381.08, 9);
    expect(panelPowerW({ ...P, panelMode: 'horizontal' }, AU_KM, 30, 1)).toBeCloseTo(381.08, 9);
    expect(panelPowerW(P, AU_KM, 2, 0)).toBe(0);
  });
});

describe('simulateBattery', () => {
  it('constant surplus clamps at capacity and accounts the curtailed energy', () => {
    const t = [0, 1, 2, 3, 4].map(H);
    const r = simulateBattery(t, [1000, 1000, 1000, 1000, 1000], P);
    expect(Array.from(r.energyWh)).toEqual([1500, 1500, 1500, 1500, 1500]);
    expect(r.generatedWh).toBeCloseTo(4000, 9);
    expect(r.loadWh).toBeCloseTo(600, 9);
    expect(r.curtailedWh).toBeCloseTo(3400, 9);
    expect(r.unservedWh).toBe(0);
    expect(r.firstDeficitMs).toBeNull();
    expect(r.minEnergyWh).toBe(1500);
  });

  it('constant deficit drains linearly and empties at the analytic time (t = 10 h)', () => {
    // 1.5 h steps, no generation: 1500 Wh / 150 W = 10 h, i.e. 2/3 into the step 9 h -> 10.5 h
    const t = Array.from({ length: 11 }, (_, i) => H(1.5 * i)); // 0 .. 15 h
    const r = simulateBattery(t, new Array(11).fill(0), P);
    expect(r.energyWh[1]).toBeCloseTo(1275, 9);
    expect(r.energyWh[6]).toBeCloseTo(150, 9);
    expect(r.energyWh[7]).toBe(0);
    expect(r.firstDeficitMs).toBeCloseTo(H(10), 3);
    expect(r.deficitHours).toBeCloseTo(5, 9);
    expect(r.unservedWh).toBeCloseTo(750, 9);
    expect(r.loadWh).toBeCloseTo(2250, 9);
    expect(r.minEnergyWh).toBe(0);
    expect(r.minEnergyTimeMs).toBeCloseTo(H(10), 3);
  });

  it('conserves energy: E_end - E_start = generated - load + unserved - curtailed', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const t: number[] = [0];
    for (let i = 1; i < 500; i++) t.push(t[i - 1] + H(0.25 + rnd()));
    const p = t.map((_, i) => (i % 40 < 20 ? 500 + 400 * rnd() : 50 * rnd())); // alternating day/night
    const r = simulateBattery(t, p, { ...P, loadW: 300 });
    const lhs = r.energyWh[r.energyWh.length - 1] - r.energyWh[0];
    const rhs = r.generatedWh - r.loadWh + r.unservedWh - r.curtailedWh;
    expect(Math.abs(lhs - rhs)).toBeLessThan(1e-8);
    expect(r.unservedWh).toBeGreaterThan(0);
    expect(r.curtailedWh).toBeGreaterThan(0);
    for (const e of r.energyWh) {
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1500);
    }
  });

  it('handles a non-uniform (shorter) last step with trapezoidal generation', () => {
    const t = [0, 1, 2, 2.5].map(H);
    const r = simulateBattery(t, [0, 100, 200, 300], { ...P, batteryCapacityWh: 1e6 });
    // gen = 50 + 150 + 0.5 * 250 = 325 Wh; load = 150 * 2.5 = 375 Wh
    expect(r.generatedWh).toBeCloseTo(325, 9);
    expect(r.loadWh).toBeCloseTo(375, 9);
    expect(r.energyWh[3]).toBeCloseTo(1e6 - 50, 6);
  });

  it('does not cancel a discharge/charge cycle inside one step', () => {
    // Net power rises -100 -> +100 W: the interior minimum is at 0.5 h.
    // With only 10 Wh capacity, the first negative triangle empties the battery.
    const r = simulateBattery([0, H(1)], [0, 200], { ...P, loadW: 100, batteryCapacityWh: 10 });
    expect(r.minEnergyWh).toBe(0);
    expect(r.unservedWh).toBeCloseTo(15, 9);
    expect(r.curtailedWh).toBeCloseTo(15, 9);
    expect(r.energyWh[1]).toBeCloseTo(10, 9);
    expect(r.firstDeficitMs! / HOUR_MS).toBeCloseTo((1 - Math.sqrt(0.6)) / 2, 9);
    expect(r.deficitHours).toBeCloseTo(Math.sqrt(0.6) / 2, 9);
  });

  it('records an interior battery minimum even if both sampled endpoints are full', () => {
    const r = simulateBattery([0, H(1)], [0, 200], { ...P, loadW: 100, batteryCapacityWh: 100 });
    expect(r.energyWh[1]).toBeCloseTo(100, 9);
    expect(r.minEnergyWh).toBeCloseTo(75, 9);
    expect(r.minEnergyTimeMs).toBe(H(0.5));
  });
});
