/**
 * Terrain horizon mask H(A). [M-HORIZON]
 *
 * The mask is computed offline from LOLA elevation data by great-circle ray
 * sampling with exact spherical curvature (scripts/moonlib.py compute_horizon)
 * [R-LOLA-PGDA]. At runtime it is only interpolated. The same mask feeds the
 * solar-visibility and Earth-visibility calculations and the sky view.
 */
import { wrap360 } from './geometry';

export interface HorizonMask {
  /** Azimuth spacing of the table, degrees. Entry i is azimuth i * azStepDeg. */
  azStepDeg: number;
  /** Horizon elevation at each azimuth, degrees. */
  elevDeg: Float32Array;
  /** Distance (m) of the terrain sample that defines the horizon at each azimuth. Zero for a flat mask. */
  distM: Float32Array;
  /** False for the mathematical flat horizon (no terrain data used). */
  terrainAware: boolean;
  /** Approximate equatorial DEM cell size for the global regional estimate. */
  resolutionM?: number;
}

/** Parse horizon_<id>.bin: nAz float32 elevations (deg) then nAz float32 distances (m). */
export function parseHorizon(buffer: ArrayBuffer, nAz: number, azStepDeg: number): HorizonMask {
  const all = new Float32Array(buffer);
  if (all.length !== 2 * nAz) throw new Error(`horizon file has ${all.length} values, expected ${2 * nAz}`);
  if (Math.abs(nAz * azStepDeg - 360) > 1e-9) throw new Error('horizon table does not span 360 degrees');
  return { azStepDeg, elevDeg: all.subarray(0, nAz), distM: all.subarray(nAz), terrainAware: true };
}

/**
 * Flat-horizon approximation: H(A) = 0 everywhere (the horizontal plane through
 * the observer; ignores both terrain and the dip of the horizon). Used for the
 * "no terrain" comparison and whenever a site has no terrain mask.
 */
export function flatHorizon(azStepDeg = 1): HorizonMask {
  const n = Math.round(360 / azStepDeg);
  return { azStepDeg, elevDeg: new Float32Array(n), distM: new Float32Array(n), terrainAware: false };
}

/** H(A): periodic linear interpolation of the mask (continuous across 0/360). */
export function horizonAt(mask: HorizonMask, azDeg: number): number {
  const n = mask.elevDeg.length;
  const f = wrap360(azDeg) / mask.azStepDeg;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const w = f - Math.floor(f);
  return mask.elevDeg[i0] * (1 - w) + mask.elevDeg[i1] * w;
}

/** Distance (m) to the horizon-defining terrain at the table azimuth nearest to `azDeg`. */
export function horizonDistanceAt(mask: HorizonMask, azDeg: number): number {
  const n = mask.distM.length;
  return mask.distM[Math.round(wrap360(azDeg) / mask.azStepDeg) % n];
}
