import { describe, expect, it } from 'vitest';
import { analyzeSite, DEFAULT_LANDER, flatHorizon, makeSiteContext } from '../science';
import { coordinateSite, DAY, DEFAULT_TARGETS, type Candidate } from '../science/planner';
import { shippedEphemeris } from '../science/__fixtures__/shipped';
import { horizonModel, missionEntries, scenarioKey, timelineEntries, timelineSelection } from './scenarios';

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
    const entries = missionEntries([candidate, later], [later], [later]);
    expect(entries.map(({ id, label }) => [id, label])).toEqual([
      [scenarioKey(candidate), 'Site 1'], [scenarioKey(later), 'Site 2'],
    ]);
    expect(entries[1].candidate.result.startMs).toBe(startMs + DAY);
    expect(entries[1].saved?.id).toBe(12);
  });

  it('offers only the examined mission and checked comparisons, including separate windows at one site', () => {
    const later = { ...candidate, result: { ...result, startMs: startMs + DAY, endMs: result.endMs + DAY } };
    const unchecked = { ...candidate, result: { ...result, site: { ...result.site, id: 'unchecked' } } };
    const entries = missionEntries([candidate, unchecked, later], [{ ...candidate, id: 1 }, { ...later, id: 2 }], [unchecked]);
    expect(timelineEntries(entries, candidate).map(entry => entry.id)).toEqual([
      scenarioKey(candidate), scenarioKey(later),
    ]);

    // Unchecking a comparison removes it from the picker unless it is the examined mission.
    const remaining = missionEntries([candidate, unchecked, later], [{ ...later, id: 2 }], [later]);
    expect(timelineEntries(remaining, later).map(entry => entry.id)).toEqual([scenarioKey(later)]);
    expect(timelineEntries(remaining, candidate).map(entry => entry.id)).toEqual([scenarioKey(candidate), scenarioKey(later)]);
  });

  it('defaults to the examined mission and allows checking and unchecking each chart row', () => {
    const later = { ...candidate, result: { ...result, startMs: startMs + DAY, endMs: result.endMs + DAY }, id: 2 };
    const entries = timelineEntries(missionEntries([candidate, later], [later], [candidate]), candidate);
    const primaryId = scenarioKey(candidate), laterId = scenarioKey(later);
    expect(timelineSelection(entries, primaryId, [primaryId]).map(entry => entry.id)).toEqual([primaryId]);
    expect(timelineSelection(entries, primaryId, [laterId, primaryId]).map(entry => entry.id)).toEqual([primaryId, laterId]);
    expect(timelineSelection(entries, primaryId, [laterId]).map(entry => entry.id)).toEqual([laterId]);
    expect(timelineSelection(entries, primaryId, [])).toEqual([]);
    expect(timelineSelection(entries.slice(0, 1), primaryId, [primaryId, laterId]).map(entry => entry.id)).toEqual([primaryId]);
  });

  it('shows only the open mission without a comparison and no missions before analysis', () => {
    const previous = { ...candidate, result: { ...result, startMs: startMs - DAY } };
    const entries = missionEntries([previous, candidate], [], [previous, candidate]);
    expect(timelineEntries(entries, candidate).map(entry => entry.id)).toEqual([scenarioKey(candidate)]);
    expect(timelineEntries(entries, null)).toEqual([]);
  });

  it('keeps the original open mission selected when inspecting a checked comparison', () => {
    const later = { ...candidate, result: { ...result, startMs: startMs + DAY, endMs: result.endMs + DAY }, id: 2 };
    const unchecked = { ...candidate, result: { ...result, site: { ...result.site, id: 'unchecked' } } };
    const entries = missionEntries([candidate, unchecked], [later], [candidate, later]);
    const available = timelineEntries(entries, later, candidate);
    const selected = [scenarioKey(candidate), scenarioKey(later)];
    expect(available.map(entry => entry.id)).not.toContain(scenarioKey(unchecked));
    expect(timelineSelection(available, scenarioKey(later), selected).map(entry => entry.id)).toEqual([
      scenarioKey(later), scenarioKey(candidate),
    ]);
    expect(timelineSelection(available, scenarioKey(later), []).length).toBe(0);
  });
});
