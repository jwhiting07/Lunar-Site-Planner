/**
 * Visibility windows from sampled states. [M-WINDOWS]
 *
 * A body is "visible" while its margin m(t) is > 0 (Sun: upper-limb clearance;
 * Earth: centre clearance minus the minimum-clearance setting). m is known at
 * the sample times only. A transition between two samples of opposite sign is
 * placed at the zero of the straight line through them:
 *   t_c = t_i + m_i / (m_i - m_{i+1}) * (t_{i+1} - t_i).
 * Events entirely between two samples (shorter than one step) are not detected.
 * Windows touching the start or end of the analysed interval are flagged as
 * truncated: their true duration is at least the reported one.
 */
import { HOUR_MS } from './constants';

export interface TimeWindow {
  startMs: number;
  endMs: number;
  /** The window was already open at the start of the analysed interval. */
  truncatedStart: boolean;
  /** The window was still open at the end of the analysed interval. */
  truncatedEnd: boolean;
}

export const windowHours = (w: TimeWindow): number => (w.endMs - w.startMs) / HOUR_MS;
export const totalHours = (ws: TimeWindow[]): number => ws.reduce((s, w) => s + windowHours(w), 0);

/** Longest window (null if none). */
export function longestWindow(ws: TimeWindow[]): TimeWindow | null {
  let best: TimeWindow | null = null;
  for (const w of ws) if (!best || windowHours(w) > windowHours(best)) best = w;
  return best;
}

/** Windows during which margin > 0. `tMs` must be strictly increasing. */
export function findWindows(tMs: ArrayLike<number>, margin: ArrayLike<number>): TimeWindow[] {
  const n = tMs.length;
  const out: TimeWindow[] = [];
  if (n === 0) return out;
  let open: number | null = null;
  let truncatedStart = false;
  if (margin[0] > 0) {
    open = tMs[0];
    truncatedStart = true;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = margin[i];
    const b = margin[i + 1];
    if (a > 0 === b > 0) continue;
    const tc = tMs[i] + (a / (a - b)) * (tMs[i + 1] - tMs[i]);
    if (b > 0) {
      open = tc;
      truncatedStart = false;
    } else {
      out.push({ startMs: open as number, endMs: tc, truncatedStart, truncatedEnd: false });
      open = null;
    }
  }
  if (open !== null) out.push({ startMs: open, endMs: tMs[n - 1], truncatedStart, truncatedEnd: true });
  return out;
}

/** Gaps between windows inside [startMs, endMs] (e.g. darkness = complement of sunlight). */
export function complementWindows(ws: TimeWindow[], startMs: number, endMs: number): TimeWindow[] {
  const out: TimeWindow[] = [];
  let cursor = startMs;
  for (const w of ws) {
    if (w.startMs > cursor) {
      out.push({ startMs: cursor, endMs: w.startMs, truncatedStart: cursor === startMs, truncatedEnd: false });
    }
    cursor = Math.max(cursor, w.endMs);
  }
  if (cursor < endMs) {
    out.push({ startMs: cursor, endMs, truncatedStart: cursor === startMs, truncatedEnd: true });
  }
  return out;
}

/** Intervals contained in both window lists (each list sorted and non-overlapping). */
export function intersectWindows(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const startMs = Math.max(a[i].startMs, b[j].startMs);
    const endMs = Math.min(a[i].endMs, b[j].endMs);
    if (endMs > startMs) {
      const startsWith = a[i].startMs >= b[j].startMs ? a[i] : b[j];
      const endsWith = a[i].endMs <= b[j].endMs ? a[i] : b[j];
      out.push({
        startMs,
        endMs,
        truncatedStart: startsWith.truncatedStart,
        truncatedEnd: endsWith.truncatedEnd,
      });
    }
    if (a[i].endMs < b[j].endMs) i++;
    else j++;
  }
  return out;
}
