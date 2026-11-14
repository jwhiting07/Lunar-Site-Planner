/**
 * Physical constants and model defaults.
 *
 * Every value carries a classification (SOURCED / ASSUMED) and a reference ID
 * that resolves in public/data/provenance.json and
 * docs/REFERENCES_AND_ASSUMPTIONS.md. Nothing here is a NASA spacecraft
 * specification unless explicitly marked SOURCED.
 */

/**
 * SOURCED. Lunar reference sphere radius of the LOLA products, metres: the
 * sphere radius in the CRS of the LOLA GeoTIFFs (checked by scripts/build_data.py
 * at build time) and BODY301_RADII of pck00011.tpc. [R-LOLA-PGDA] [R-NAIF-PCK] [R-IAU-WGCCRE]
 */
export const R_MOON_M = 1_737_400;

/** SOURCED. Solar radius, km: pck00011.tpc BODY10_RADII = IAU 2015 nominal solar radius. [R-NAIF-PCK] [R-TSI] */
export const R_SUN_KM = 695_700;

/**
 * SOURCED. Earth equatorial radius, km: pck00011.tpc BODY399_RADII. [R-NAIF-PCK]
 * Not used by any runtime calculation (Earth visibility uses Earth's centre);
 * the validation script uses the same value for its any-part-of-disc comparison (V-5).
 */
export const R_EARTH_KM = 6378.1366;

/** SOURCED. Astronomical unit, km (exact by definition). [R-AU] */
export const AU_KM = 149_597_870.7;

/**
 * SOURCED. Total solar irradiance at 1 au, W/m^2: IAU 2015 Resolution B3 nominal
 * value [R-TSI], consistent with the measured 1360.8 +/- 0.5 W/m^2 [R-TSI-MEAS].
 */
export const SOLAR_CONSTANT_W_M2 = 1361;

export const DEG = Math.PI / 180;
export const HOUR_MS = 3_600_000;

/** Panel pointing models offered by the power estimate. [M-POWER] */
export type PanelMode = 'tracking' | 'vertical' | 'horizontal';

/** ASSUMED engineering parameters of a generic small lander. [A-LANDER] */
export interface LanderParams {
  /** Solar array collecting area, m^2. */
  panelAreaM2: number;
  /** Sunlight-to-electrical conversion efficiency of the whole array, 0..1. */
  panelEfficiency: number;
  /** Constant electrical load, W. */
  loadW: number;
  /** Usable battery energy capacity, Wh. */
  batteryCapacityWh: number;
  /** Panel pointing assumption. */
  panelMode: PanelMode;
}

/**
 * ASSUMED demonstration defaults. These are NOT the parameters of any NASA CLPS
 * lander; they are round numbers for a small solar-powered lander so that the
 * energy model produces interpretable output. [A-LANDER]
 */
export const DEFAULT_LANDER: LanderParams = {
  panelAreaM2: 2.0,
  panelEfficiency: 0.28,
  loadW: 150,
  batteryCapacityWh: 1500,
  panelMode: 'tracking',
};

/** ASSUMED. Battery state of charge at the start of the analysis interval (fraction of capacity). [A-BATT-INIT] */
export const INITIAL_STATE_OF_CHARGE = 1.0;

/**
 * ASSUMED. Minimum clearance of Earth's centre above the terrain horizon for a
 * geometric direct-to-Earth opportunity, degrees. 0 = pure line of sight. [A-DTE-MASK]
 */
export const DEFAULT_EARTH_MIN_CLEARANCE_DEG = 0;
