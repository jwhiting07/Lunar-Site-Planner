import { describe, expect, it } from 'vitest';
import { firstDayOnOrAfter, lastDayOnOrBefore, wallToUtc, zoneAbbreviation, zoneDate, zoneDateTime, zoneDayStart } from './timeZone';

describe('display time zones', () => {
  it('UTC is the identity', () => {
    const t = Date.UTC(2026, 11, 1, 6, 30);
    expect(zoneDate(t, 'UTC')).toBe('2026-12-01');
    expect(zoneDateTime(t, 'UTC')).toBe('2026-12-01 06:30');
    expect(zoneAbbreviation(t, 'UTC')).toBe('UTC');
    expect(zoneDayStart('2026-12-01', 'UTC')).toBe(Date.UTC(2026, 11, 1));
  });

  it('converts across the date line and fractional offsets in both directions', () => {
    const t = Date.UTC(2026, 11, 1, 0, 0);
    expect(zoneDateTime(t, 'America/New_York')).toBe('2026-11-30 19:00'); // UTC-5 in winter
    expect(zoneDateTime(t, 'Asia/Tokyo')).toBe('2026-12-01 09:00');
    expect(zoneDateTime(t, 'Asia/Kolkata')).toBe('2026-12-01 05:30');
    expect(zoneDateTime(t, 'Pacific/Kiritimati')).toBe('2026-12-01 14:00');
    expect(zoneDayStart('2026-12-01', 'Asia/Tokyo')).toBe(Date.UTC(2026, 10, 30, 15));
    expect(zoneDayStart('2026-12-01', 'Asia/Kolkata')).toBe(Date.UTC(2026, 10, 30, 18, 30));
    expect(zoneDayStart('2026-12-01', 'America/New_York')).toBe(Date.UTC(2026, 11, 1, 5));
  });

  it('handles daylight-saving transitions', () => {
    // New York springs forward on 2026-03-08: midnight is still EST (UTC-5), the next midnight EDT (UTC-4).
    expect(zoneDayStart('2026-03-08', 'America/New_York')).toBe(Date.UTC(2026, 2, 8, 5));
    expect(zoneDayStart('2026-03-09', 'America/New_York')).toBe(Date.UTC(2026, 2, 9, 4));
    expect(zoneDayStart('2026-11-01', 'America/New_York')).toBe(Date.UTC(2026, 10, 1, 4)); // falls back later that day
    expect(wallToUtc(2026, 7, 1, 12, 0, 'Europe/London')).toBe(Date.UTC(2026, 6, 1, 11)); // BST
  });

  it('round-trips a day start through the zone', () => {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Kathmandu', 'Pacific/Auckland']) {
      for (const day of ['2026-01-01', '2026-03-29', '2027-06-15', '2028-12-31']) {
        const start = zoneDayStart(day, zone)!;
        expect(zoneDate(start, zone)).toBe(day);
        expect(zoneDateTime(start, zone).endsWith('00:00')).toBe(true);
        expect(zoneDate(start - 60_000, zone)).not.toBe(day);
      }
    }
  });

  it('rejects impossible dates', () => {
    for (const bad of ['', '2026-02-30', '2026-13-01', '26-01-01']) expect(zoneDayStart(bad, 'UTC')).toBeNull();
  });

  it('finds the first and last whole days inside a UTC coverage window', () => {
    const start = Date.UTC(2026, 0, 1), end = Date.UTC(2029, 0, 1);
    expect(firstDayOnOrAfter(start, 'UTC')).toBe('2026-01-01');
    expect(lastDayOnOrBefore(end, 'UTC')).toBe('2029-01-01');
    // In UTC-5 the coverage start is 2025-12-31 19:00, so the first whole day is 2026-01-01.
    expect(firstDayOnOrAfter(start, 'America/New_York')).toBe('2026-01-01');
    // In UTC+9 the coverage start is 2026-01-01 09:00, so the first whole day is 2026-01-02.
    expect(firstDayOnOrAfter(start, 'Asia/Tokyo')).toBe('2026-01-02');
    expect(zoneDayStart(firstDayOnOrAfter(start, 'Asia/Tokyo'), 'Asia/Tokyo')!).toBeGreaterThanOrEqual(start);
    expect(zoneDayStart(lastDayOnOrBefore(end, 'Asia/Tokyo'), 'Asia/Tokyo')!).toBeLessThanOrEqual(end);
    expect(zoneDayStart(lastDayOnOrBefore(end, 'America/New_York'), 'America/New_York')!).toBeLessThanOrEqual(end);
  });
});
