import { DEFAULT_EARTH_MIN_CLEARANCE_DEG, DEFAULT_LANDER, type LanderParams } from '../science';

/** User-adjustable analysis inputs: assumed lander parameters plus the Earth clearance setting. */
export interface ParamState {
  lander: LanderParams;
  earthMinClearanceDeg: number;
}

export const DEFAULT_PARAM_STATE: ParamState = { lander: DEFAULT_LANDER, earthMinClearanceDeg: DEFAULT_EARTH_MIN_CLEARANCE_DEG };
