import type { LandingSite } from './landingSites';
import { HOUR_MS, type AnalysisResult, type HorizonMask } from '../science';
import type { Candidate, Targets } from '../science/planner';

const KEY = 'seraphim-compare-v1';
export interface SavedComparison extends Candidate { id: number; mission?: LandingSite }

type StoredResult = Pick<AnalysisResult, 'site' | 'startMs' | 'endMs' | 'stepMs' | 'observerHeightM' | 'earthMinClearanceDeg' | 'params'>;
type StoredMask = Omit<HorizonMask, 'elevDeg' | 'distM'> & { elevDeg: number[]; distM: number[] };
export interface StoredComparison { id: number; mission?: LandingSite; targets: Targets; geometry: StoredResult; mask?: StoredMask }

export function readComparison(): StoredComparison[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(entry => Number.isSafeInteger(entry?.id) && entry.id > 0 &&
      Number.isFinite(entry.geometry?.startMs) && Number.isFinite(entry.geometry?.endMs) &&
      entry.geometry.endMs > entry.geometry.startMs && entry.geometry.endMs - entry.geometry.startMs <= 365 * 24 * HOUR_MS &&
      Number.isFinite(entry.geometry.stepMs) && entry.geometry.stepMs >= HOUR_MS &&
      Number.isFinite(entry.geometry.site?.lat_deg) && Number.isFinite(entry.geometry.site?.lon_deg)).slice(0, 12);
  } catch { return []; }
}

export function storedHorizon(mask: StoredMask): HorizonMask {
  return { ...mask, elevDeg: Float32Array.from(mask.elevDeg), distM: Float32Array.from(mask.distM) };
}

export function storeComparison(list: SavedComparison[], failed: StoredComparison[]) {
  const stored: StoredComparison[] = list.map(({ id, mission, targets, result }) => {
    const { site, startMs, endMs, stepMs, observerHeightM, earthMinClearanceDeg, params, horizonMask } = result;
    return {
      id, mission, targets, geometry: { site, startMs, endMs, stepMs, observerHeightM, earthMinClearanceDeg, params },
      mask: horizonMask?.terrainAware ? { ...horizonMask, elevDeg: Array.from(horizonMask.elevDeg), distM: Array.from(horizonMask.distM) } : undefined,
    };
  });
  try {
    const comparison = [...failed, ...stored].slice(0, 12);
    if (comparison.length) localStorage.setItem(KEY, JSON.stringify(comparison));
    else localStorage.removeItem(KEY);
  } catch { /* Keep the live comparison usable when storage is unavailable. */ }
}
