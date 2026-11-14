/**
 * The metric summary of one analysis as a flat list of rows.
 *
 * Both the on-screen metric panels and the CSV/JSON export are generated from
 * these rows, so displayed and exported numbers cannot diverge. Each row names
 * the method (methods.ts) that produces it.
 */
import type { AnalysisResult } from './analysis';
import type { Classification } from './methods';
import { windowHours, type TimeWindow } from './windows';

export interface SummaryRow {
  key: string;
  label: string;
  /** Unrounded value; null when not applicable (e.g. no darkness in the interval). */
  value: number | null;
  unit: string;
  /** Decimal places used for display. */
  digits: number;
  kind: Classification;
  methodId: string;
  /** True when the underlying window is cut by the interval boundary (value is a lower bound). */
  truncated?: boolean;
  note?: string;
}

const hours = (w: TimeWindow | null): number | null => (w ? windowHours(w) : null);
const cut = (w: TimeWindow | null): boolean => !!w && (w.truncatedStart || w.truncatedEnd);

export function summaryRows(r: AnalysisResult): SummaryRow[] {
  const m = r.metrics;
  const b = r.battery;
  const cap = r.params.batteryCapacityWh;
  const flatNote = r.terrainAware ? undefined : 'Flat-horizon approximation: no terrain data used for this site.';
  return [
    { key: 'sunlit_pct', label: 'Sunlit time', value: 100 * m.sunlitFraction, unit: '%', digits: 1, kind: 'computed', methodId: 'M-SUNVIS', note: flatNote },
    { key: 'sunlit_h', label: 'Sunlit hours', value: m.sunlitHours, unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS' },
    { key: 'earth_pct', label: 'Earth visible', value: 100 * m.earthVisibleFraction, unit: '%', digits: 1, kind: 'computed', methodId: 'M-EARTHVIS', note: flatNote },
    { key: 'earth_h', label: 'Earth-visible hours', value: m.earthVisibleHours, unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS' },
    { key: 'both_h', label: 'Sun and Earth both visible', value: m.bothHours, unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS' },
    { key: 'longest_dark_h', label: 'Longest darkness', value: hours(m.longestDarkness), unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS', truncated: cut(m.longestDarkness) },
    { key: 'longest_blackout_h', label: 'Longest Earth blackout', value: hours(m.longestBlackout), unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS', truncated: cut(m.longestBlackout) },
    { key: 'sunlit_pct_flat', label: 'Sunlit time, flat horizon', value: 100 * m.sunlitFractionFlat, unit: '%', digits: 1, kind: 'approximated', methodId: 'M-SUNVIS', note: 'Same geometry with H(A) = 0: the difference from "Sunlit time" is the effect of terrain.' },
    { key: 'earth_pct_flat', label: 'Earth visible, flat horizon', value: 100 * m.earthVisibleFractionFlat, unit: '%', digits: 1, kind: 'approximated', methodId: 'M-EARTHVIS', note: 'Same geometry with H(A) = 0.' },
    { key: 'mean_disk_pct', label: 'Mean visible solar disk', value: 100 * m.meanDiskFraction, unit: '%', digits: 1, kind: 'computed', methodId: 'M-SUNVIS' },
    { key: 'sun_el_min_deg', label: 'Sun elevation, minimum', value: m.sunElevationMinDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-GEOM' },
    { key: 'sun_el_max_deg', label: 'Sun elevation, maximum', value: m.sunElevationMaxDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-GEOM' },
    { key: 'earth_el_min_deg', label: 'Earth elevation, minimum', value: m.earthElevationMinDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-GEOM' },
    { key: 'earth_el_max_deg', label: 'Earth elevation, maximum', value: m.earthElevationMaxDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-GEOM' },
    { key: 'horizon_at_sun_deg', label: 'Mean terrain horizon toward the Sun', value: m.meanHorizonAtSunDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-HORIZON' },
    { key: 'horizon_at_earth_deg', label: 'Mean terrain horizon toward Earth', value: m.meanHorizonAtEarthDeg, unit: 'deg', digits: 2, kind: 'computed', methodId: 'M-HORIZON' },
    { key: 'generated_kwh', label: 'Energy generated', value: b.generatedWh / 1000, unit: 'kWh', digits: 1, kind: 'computed', methodId: 'M-POWER', note: 'Engineering estimate from assumed lander parameters.' },
    { key: 'load_kwh', label: 'Energy demanded by load', value: b.loadWh / 1000, unit: 'kWh', digits: 1, kind: 'assumed', methodId: 'A-LANDER' },
    { key: 'unserved_kwh', label: 'Unserved load energy', value: b.unservedWh / 1000, unit: 'kWh', digits: 1, kind: 'computed', methodId: 'M-BATTERY' },
    { key: 'deficit_h', label: 'Time in power deficit', value: b.deficitHours, unit: 'h', digits: 1, kind: 'computed', methodId: 'M-BATTERY' },
    { key: 'min_battery_pct', label: 'Minimum battery charge', value: cap > 0 ? (100 * b.minEnergyWh) / cap : null, unit: '%', digits: 0, kind: 'computed', methodId: 'M-BATTERY' },
  ];
}

/** Display string of a row value without the unit ("—" when not applicable; ">=" prefix when truncated). */
export function formatRowValue(row: SummaryRow): string {
  if (row.value === null || !Number.isFinite(row.value)) return '—';
  const text = row.value.toFixed(row.digits);
  return row.truncated ? `≥ ${text}` : text;
}
