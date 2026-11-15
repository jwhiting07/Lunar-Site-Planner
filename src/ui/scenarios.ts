import type { AnalysisResult } from '../science';
import type { Candidate } from '../science/planner';
import type { SavedComparison } from '../data/comparisonStorage';

/** Identity used by the results, comparison selection, and terrain upgrades. */
export function scenarioKey({ result, targets }: Candidate): string {
  return JSON.stringify([
    result.site.id,
    result.startMs,
    result.endMs,
    targets,
    result.params,
    result.earthMinClearanceDeg,
  ]);
}

/** A mission keeps its own label and marker even when another mission shares its coordinates. */
export function missionEntries(sampled: Candidate[], saved: SavedComparison[], open: (Candidate | null)[]) {
  const entries = new Map<string, { id: string; label: string; candidate: Candidate; sampled: boolean; saved?: SavedComparison }>();
  sampled.forEach((candidate, index) => {
    const id = scenarioKey(candidate);
    entries.set(id, { id, label: `Site ${index + 1}`, candidate, sampled: true });
  });
  saved.forEach((candidate, index) => {
    const id = scenarioKey(candidate);
    const entry = entries.get(id);
    entries.set(id, entry ? { ...entry, saved: candidate } : {
      id, candidate, sampled: false, saved: candidate, label: candidate.mission ? candidate.result.site.short : `Scenario ${index + 1}`,
    });
  });
  for (const candidate of open) {
    if (!candidate) continue;
    const id = scenarioKey(candidate);
    const entry = entries.get(id);
    entries.set(id, entry ? { ...entry, candidate } : { id, candidate, sampled: false, label: 'Open mission' });
  }
  return [...entries.values()];
}

export function horizonModel(result: AnalysisResult): string {
  if (result.horizonMask?.resolutionM) return 'Regional LOLA';
  return result.terrainAware ? 'LOLA terrain' : 'Flat horizon';
}
