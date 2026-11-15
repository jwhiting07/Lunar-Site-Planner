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

export const DAY_MS = 86_400_000;
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const fmtLat = (latDeg: number): string => `${Math.abs(latDeg).toFixed(4)}° ${latDeg < 0 ? 'S' : 'N'}`;
export const fmtLon = (lonDeg: number): string => `${lonDeg.toFixed(4)}° E`;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
