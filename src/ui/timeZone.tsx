import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TIME_ZONES } from './timeZones';

/**
 * Display time zone. All calculations and exports stay in UTC; only what the
 * user reads and types (landing dates, cursor times) follows this zone.
 */
const STORAGE_KEY = 'seraphim-clock-time-zone';

const formatters = new Map<string, Intl.DateTimeFormat>();
function fields(ms: number, zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formatters.set(zone, f);
  }
  const out: Record<string, number> = {};
  for (const part of f.formatToParts(ms)) if (part.type !== 'literal') out[part.type] = Number(part.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour, min: out.minute };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Calendar date "YYYY-MM-DD" of an instant in `zone`. */
export function zoneDate(ms: number, zone: string): string {
  const f = fields(ms, zone);
  return `${pad(f.y, 4)}-${pad(f.m)}-${pad(f.d)}`;
}

/** "YYYY-MM-DD HH:mm" of an instant in `zone`. */
export function zoneDateTime(ms: number, zone: string, seconds = false): string {
  const f = fields(ms, zone);
  return `${zoneDate(ms, zone)} ${pad(f.h)}:${pad(f.min)}${seconds ? `:${pad(new Date(ms).getUTCSeconds())}` : ''}`;
}

const nameFormatters = new Map<string, Intl.DateTimeFormat>();
/** Short zone name at an instant, e.g. "UTC", "EST", "GMT+9". */
export function zoneAbbreviation(ms: number, zone: string): string {
  if (zone === 'UTC') return 'UTC';
  let f = nameFormatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }); nameFormatters.set(zone, f); }
  return f.formatToParts(ms).find(part => part.type === 'timeZoneName')?.value ?? zone;
}

/** UTC instant of the wall-clock time y-m-d h:min in `zone` (the later instant when the time repeats). */
export function wallToUtc(y: number, m: number, d: number, h: number, min: number, zone: string): number {
  const wall = Date.UTC(y, m - 1, d, h, min);
  let t = wall;
  for (let i = 0; i < 3; i++) {
    const f = fields(t, zone);
    t = wall - (Date.UTC(f.y, f.m - 1, f.d, f.h, f.min) - Math.floor(t / 60000) * 60000);
  }
  return t;
}

/** Start of calendar day `s` ("YYYY-MM-DD") in `zone`, or null for an invalid date. */
export function zoneDayStart(s: string, zone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  // A zone whose clocks skip midnight starts that day at the first existing hour.
  for (let hour = 0; hour < 4; hour++) {
    const t = wallToUtc(y, m, d, hour, 0, zone);
    if (zoneDate(t, zone) === s) return t;
  }
  return null;
}

/** First day start at or after `ms`, and last day start at or before `ms`, as "YYYY-MM-DD" in `zone`. */
export function firstDayOnOrAfter(ms: number, zone: string): string {
  const day = zoneDate(ms, zone);
  const start = zoneDayStart(day, zone);
  return start !== null && start >= ms ? day : zoneDate(zoneDayStart(day, zone)! + 36 * 3_600_000, zone);
}
export function lastDayOnOrBefore(ms: number, zone: string): string {
  const day = zoneDate(ms, zone);
  const start = zoneDayStart(day, zone);
  return start !== null && start <= ms ? day : zoneDate(start! - 12 * 3_600_000, zone);
}

export interface TimeZoneValue {
  zone: string;
  setZone: (zone: string) => void;
  /** Short name now, for headings: "UTC", "EST". */
  label: string;
  date: (ms: number) => string;
  /** "2026-12-01 06:00 UTC" */
  dateTime: (ms: number, seconds?: boolean) => string;
}

function makeValue(zone: string, setZone: (zone: string) => void): TimeZoneValue {
  return {
    zone, setZone,
    label: zoneAbbreviation(Date.now(), zone),
    date: ms => zoneDate(ms, zone),
    dateTime: (ms, seconds) => `${zoneDateTime(ms, zone, seconds)} ${zoneAbbreviation(ms, zone)}`,
  };
}

const TimeZoneContext = createContext<TimeZoneValue>(makeValue('UTC', () => {}));
export const useTimeZone = () => useContext(TimeZoneContext);

export function TimeZoneProvider({ children }: { children: ReactNode }) {
  const [zone, setZoneState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && TIME_ZONES.includes(saved)) return saved;
    } catch { /* Storage can be disabled. */ }
    return 'UTC';
  });
  const setZone = useCallback((next: string) => {
    setZoneState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the choice for this session. */ }
  }, []);
  const value = useMemo(() => makeValue(zone, setZone), [zone, setZone]);
  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}
