/** Shared fixed strings and small formatters (pure, no DOM). */
import type { PanelMode } from '../science';

export const PANEL_MODE_LABELS: Record<PanelMode, string> = {
  tracking: 'Sun-tracking',
  vertical: 'Vertical, azimuth-tracking',
  horizontal: 'Fixed horizontal',
};

export const EARTH_DISCLAIMER =
  'Geometric line of sight only — not a radio-link assessment (no antenna, pointing or ground-station model).';
export const ENERGY_DISCLAIMER =
  'Engineering estimate from assumed lander parameters — not a NASA CLPS spacecraft model.';
export const SAFETY_DISCLAIMER = 'Favourable light and line of sight do not make a site safe to land on.';
export const SLOPE_DISCLAIMER = '80 m baseline, context only — not a landing-safety assessment.';
export const TERRAIN_CAPTION =
  'LOLA elevation with contextual shading. Visibility uses the horizon mask (terrain out to 600 km).';
export const MAP_CAPTION = 'Shaded relief from LOLA 80 m DEM — artificial lighting, display only';
export const FLAT_WARNING = 'Flat-horizon approximation — no terrain data for this site; results ignore terrain.';

export const COORD_CLASS_LABEL: Record<string, string> = {
  verified_landing: 'Verified landing',
  representative_point: 'Representative point',
};

const MINUS = '−';
/** Fixed-decimal number with a true minus sign. */
export function num(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}
export const deg = (v: number, digits = 1): string => `${num(v, digits)}°`;
export const signed = (v: number, digits = 1): string => (v >= 0 ? '+' : '') + num(v, digits);

export const DAY_MS = 86_400_000;
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** "2026-12-01 06:00Z" */
export const fmtUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
export const fmtLat = (latDeg: number): string => `${Math.abs(latDeg).toFixed(4)}° ${latDeg < 0 ? 'S' : 'N'}`;
export const fmtLon = (lonDeg: number): string => `${lonDeg.toFixed(4)}° E`;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
