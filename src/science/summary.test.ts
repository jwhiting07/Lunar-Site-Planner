import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDER } from './constants';
import { analyzeSite, makeSiteContext } from './analysis';
import { formatRowValue, summaryRows, type SummaryRow } from './summary';
import { windowHours } from './windows';
import { shippedEphemeris, shippedMask, siteById, sitesDoc } from './__fixtures__/shipped';

describe('summaryRows', () => {
  const site = siteById('im1-odysseus');
  const ctx = makeSiteContext(site, sitesDoc().observer_height_m, shippedMask(site));
  const r = analyzeSite(ctx, shippedEphemeris(), {
    startMs: Date.parse('2027-01-01T00:00:00Z'),
    endMs: Date.parse('2027-03-01T00:00:00Z'),
    params: DEFAULT_LANDER,
  });
  const rows = new Map(summaryRows(r).map((x) => [x.key, x]));
  const m = r.metrics;

  it('values equal the underlying metrics', () => {
    expect(rows.get('sunlit_pct')!.value).toBe(100 * m.sunlitFraction);
    expect(rows.get('sunlit_h')!.value).toBe(m.sunlitHours);
    expect(rows.get('earth_pct')!.value).toBe(100 * m.earthVisibleFraction);
    expect(rows.get('earth_h')!.value).toBe(m.earthVisibleHours);
    expect(rows.get('both_h')!.value).toBe(m.bothHours);
    expect(m.longestDarkness).not.toBeNull();
    expect(rows.get('longest_dark_h')!.value).toBe(windowHours(m.longestDarkness!));
    // Malapert A has Earth in view throughout this interval: no blackout -> null value, shown as "—"
    if (m.longestBlackout === null) {
      expect(rows.get('longest_blackout_h')!.value).toBeNull();
      expect(formatRowValue(rows.get('longest_blackout_h')!)).toBe('—');
      expect(m.earthVisibleFraction).toBe(1);
    } else {
      expect(rows.get('longest_blackout_h')!.value).toBe(windowHours(m.longestBlackout));
    }
    expect(rows.get('sunlit_pct_flat')!.value).toBe(100 * m.sunlitFractionFlat);
    expect(rows.get('mean_disk_pct')!.value).toBe(100 * m.meanDiskFraction);
    expect(rows.get('sun_el_max_deg')!.value).toBe(m.sunElevationMaxDeg);
    expect(rows.get('generated_kwh')!.value).toBe(r.battery.generatedWh / 1000);
    expect(rows.get('deficit_h')!.value).toBe(r.battery.deficitHours);
    expect(rows.get('min_battery_pct')!.value).toBe((100 * r.battery.minEnergyWh) / DEFAULT_LANDER.batteryCapacityWh);
    // sunlit + longest-dark consistency sanity: hours fit in the interval
    expect(m.sunlitHours + windowHours(m.longestDarkness!)).toBeLessThanOrEqual(m.intervalHours + 1e-9);
  });

  it('keys are unique and truncation flags follow the windows', () => {
    expect(rows.size).toBe(summaryRows(r).length);
    const d = m.longestDarkness!;
    expect(rows.get('longest_dark_h')!.truncated).toBe(d.truncatedStart || d.truncatedEnd);
  });
});

describe('formatRowValue', () => {
  const base: SummaryRow = { key: 'k', label: 'L', value: 12.345, unit: 'h', digits: 1, kind: 'computed', methodId: 'M-WINDOWS' };
  it('formats with the row digits, "—" for null/non-finite, "≥ " when truncated', () => {
    expect(formatRowValue(base)).toBe('12.3');
    expect(formatRowValue({ ...base, digits: 2 })).toBe('12.35');
    expect(formatRowValue({ ...base, value: null })).toBe('—');
    expect(formatRowValue({ ...base, value: Number.NaN })).toBe('—');
    expect(formatRowValue({ ...base, truncated: true })).toBe('≥ 12.3');
  });
});
