import { describe, expect, it } from 'vitest';
import { TIME_ZONES, timeZoneChoice, timeZoneChoices } from './timeZones';

describe('clock time zones', () => {
  it('retains every supported zone, labels each place, and orders by current UTC offset', () => {
    const choices = timeZoneChoices(new Date('2026-11-14T12:00:00Z'));
    expect(new Set(choices.map(choice => choice.id))).toEqual(new Set(TIME_ZONES));
    expect(TIME_ZONES.length).toBeGreaterThan(400);
    for (let index = 0; index < choices.length; index++) {
      expect(choices[index].name).not.toBe('');
      expect(choices[index].place).not.toBe('');
      if (index) expect(choices[index].offsetMinutes).toBeGreaterThanOrEqual(choices[index - 1].offsetMinutes);
    }
  });
  it('uses daylight-saving names and preserves fractional-hour offsets', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');
    expect(timeZoneChoice('America/New_York', winter).offsetMinutes).toBe(-300);
    expect(timeZoneChoice('America/New_York', summer).offsetMinutes).toBe(-240);
    expect(timeZoneChoice('America/New_York', winter).name).not.toBe(timeZoneChoice('America/New_York', summer).name);
    expect(timeZoneChoice('Asia/Katmandu', winter).offsetMinutes).toBe(345);
    expect(timeZoneChoice('Pacific/Chatham', winter).offsetMinutes).toBe(825);
    expect(timeZoneChoice('UTC', winter).offsetMinutes).toBe(0);
    expect(timeZoneChoice('Etc/GMT+12', winter).offsetMinutes).toBe(-720);
    expect(timeZoneChoice('Etc/GMT-14', winter).offsetMinutes).toBe(840);
  });
});
