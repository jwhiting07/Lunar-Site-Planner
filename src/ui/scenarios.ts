import type { AnalysisResult } from '../science';
import type { Candidate } from '../science/planner';

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

export function horizonModel(result: AnalysisResult): string {
  if (result.horizonMask?.resolutionM) return 'Regional LOLA';
  return result.terrainAware ? 'LOLA terrain' : 'Flat horizon';
}
