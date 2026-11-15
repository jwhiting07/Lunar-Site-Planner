import { afterEach, expect, it, vi } from 'vitest';
import { analyzeSite, DEFAULT_LANDER, makeSiteContext } from '../science';
import { DEFAULT_TARGETS } from '../science/planner';
import { shippedEphemeris, shippedMask, sitesDoc } from '../science/__fixtures__/shipped';
import { readComparison, storeComparison, storedHorizon } from './comparisonStorage';

afterEach(() => vi.unstubAllGlobals());

it('restores the saved scenario inputs and terrain and clears them on reset', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: storage.get.bind(storage), setItem: storage.set.bind(storage), removeItem: storage.delete.bind(storage) });
  const doc = sitesDoc();
  const site = doc.sites[0];
  const eph = shippedEphemeris();
  const mask = { ...shippedMask(site), resolutionM: 1895 };
  const options = { startMs: Date.parse('2026-11-15T04:30:21Z'), endMs: Date.parse('2026-11-17T04:30:21Z'), params: DEFAULT_LANDER };
  const result = analyzeSite(makeSiteContext(site, doc.observer_height_m, mask), eph, options);
  storeComparison([{ id: 1, targets: DEFAULT_TARGETS, result: { ...result, horizonMask: mask } }], []);

  const [restored] = readComparison();
  expect(restored.geometry.startMs).toBe(options.startMs);
  expect(restored.geometry.site.id).toBe(site.id);
  expect(storedHorizon(restored.mask!)).toEqual(mask);
  expect(analyzeSite(makeSiteContext(restored.geometry.site, restored.geometry.observerHeightM, storedHorizon(restored.mask!)), eph, restored.geometry).metrics).toEqual(result.metrics);
  storeComparison([], []);
  expect(readComparison()).toEqual([]);
});
