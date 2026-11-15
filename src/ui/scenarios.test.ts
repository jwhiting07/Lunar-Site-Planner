import { describe, expect, it } from 'vitest';
import { analyzeSite, DEFAULT_LANDER, flatHorizon, makeSiteContext } from '../science';
import { coordinateSite, DAY, DEFAULT_TARGETS, type Candidate } from '../science/planner';
import { shippedEphemeris } from '../science/__fixtures__/shipped';
import { comparedMissionEntries, horizonModel, missionEntries, scenarioKey } from './scenarios';

const startMs = Date.UTC(2026, 11, 1);
const result = analyzeSite(
  makeSiteContext(coordinateSite({ lat: -85, lon: 0 }), 2, flatHorizon()),
  shippedEphemeris(),
  { startMs, endMs: startMs + DAY, params: DEFAULT_LANDER },
);
const candidate: Candidate = { result, targets: { ...DEFAULT_TARGETS } };

describe('scenario identity and model labels', () => {
  it('retains comparison selection when terrain, names, and calculated values update', () => {
    const upgraded: Candidate = {
      ...candidate,
      result: {
        ...result,
        site: { ...result.site, name: 'Mission name', short: 'Mission' },
        terrainAware: true,
        horizonMask: { ...flatHorizon(), terrainAware: true, resolutionM: 1895 },
        metrics: { ...result.metrics, sunlitFraction: 0.25 },
      },
    };
    expect(scenarioKey(upgraded)).toBe(scenarioKey(candidate));
  });

  it('distinguishes site, landing, duration, targets, power assumptions, and Earth clearance', () => {
    const variations: Candidate[] = [
      { ...candidate, result: { ...result, site: { ...result.site, id: 'another-site' } } },
      { ...candidate, result: { ...result, startMs: startMs + 1000 } },
      { ...candidate, result: { ...result, endMs: result.endMs + DAY } },
      { ...candidate, targets: { ...candidate.targets, sunlight: 75 } },
      { ...candidate, targets: { ...candidate.targets, maxDarkHours: 8 } },
      { ...candidate, result: { ...result, params: { ...result.params, loadW: 200 } } },
      { ...candidate, result: { ...result, earthMinClearanceDeg: 1 } },
    ];
    const keys = [candidate, ...variations].map(scenarioKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('preserves regional, polar, and flat horizon labels', () => {
    expect(horizonModel(result)).toBe('Flat horizon');
    expect(horizonModel({ ...result, terrainAware: true })).toBe('LOLA terrain');
    expect(horizonModel({ ...result, terrainAware: true, horizonMask: {
      ...flatHorizon(), terrainAware: true, resolutionM: 1895,
    } })).toBe('Regional LOLA');
  });

  it('keeps distinct mission choices for two landing windows at the same site', () => {
    const later = { ...candidate, result: { ...result, startMs: startMs + DAY, endMs: result.endMs + DAY }, id: 12 };
    const entries = missionEntries([candidate, later], [later], later);
    expect(entries.map(({ id, label }) => [id, label])).toEqual([
      [scenarioKey(candidate), 'Site 1'], [scenarioKey(later), 'Site 2'],
    ]);
    expect(entries[1].candidate.result.startMs).toBe(startMs + DAY);
    expect(entries[1].saved?.id).toBe(12);
  });

  it('includes only checked comparisons, even when an unchecked mission is open', () => {
    const later = { ...candidate, result: { ...result, startMs: startMs + DAY, endMs: result.endMs + DAY }, id: 2 };
    const sampled = [candidate, later];
    expect(comparedMissionEntries(missionEntries(sampled, [later], candidate)).map(entry => entry.id)).toEqual([scenarioKey(later)]);
    expect(comparedMissionEntries(missionEntries(sampled, [], candidate))).toEqual([]);
  });
});
