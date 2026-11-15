import { memo, useMemo, useRef, type PointerEvent as RPointerEvent } from 'react';
import { HOUR_MS, windowHours, type AnalysisResult, type TimeWindow } from '../science';
import { DAY_MS, clamp, isoDate, num } from '../ui/labels';
import { useTimeZone, type TimeZoneValue } from '../ui/timeZone';
import { useScrubSelection } from '../ui/useScrubSelection';

const VW = 1000;
const LX = 150; // left gutter for labels
const RX = 990;
const PWID = RX - LX;
const BAR_H = 11;
const BAR_GAP = 3;
const SITE_GAP = 10;
const AXIS_H = 22;
const MAX_PTS = 1500;

interface Tick {
  t: number;
  label: string;
}

/** UTC axis ticks: days / weeks for short ranges, month starts for long ones. */
function makeTicks(startMs: number, endMs: number): Tick[] {
  const days = (endMs - startMs) / DAY_MS;
  const out: Tick[] = [];
  if (days > 100) {
    const every = days > 800 ? 6 : days > 400 ? 3 : days > 200 ? 2 : 1;
    const d = new Date(startMs);
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth() + (d.getUTCDate() > 1 || d.getUTCHours() > 0 ? 1 : 0);
    for (;;) {
      const t = Date.UTC(y, m, 1);
      if (t > endMs) break;
      if ((((m % 12) + 12) % 12) % every === 0 || every === 1) out.push({ t, label: isoDate(t).slice(0, 7) });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }
  const stepDays = days <= 8 ? 1 : days <= 20 ? 2 : days <= 45 ? 5 : 10;
  const first = Math.ceil(startMs / (stepDays * DAY_MS)) * stepDays * DAY_MS;
  for (let t = first; t <= endMs; t += stepDays * DAY_MS) out.push({ t, label: isoDate(t).slice(5) });
  return out;
}

/** Path with <= ~maxPts vertices; long series keep min and max per bucket so peaks survive. */
function seriesPath(t: Float64Array, v: Float64Array, tx: (t: number) => number, vy: (v: number) => number): string {
  const n = t.length;
  const pt = (i: number) => `${tx(t[i]).toFixed(1)} ${vy(v[i]).toFixed(1)}`;
  if (n <= MAX_PTS) {
    let d = '';
    for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${pt(i)}`;
    return d;
  }
  const buckets = Math.floor(MAX_PTS / 2);
  const per = n / buckets;
  let d = '';
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor(b * per);
    const e = Math.min(n, Math.floor((b + 1) * per));
    let imin = a;
    let imax = a;
    for (let i = a; i < e; i++) {
      if (v[i] < v[imin]) imin = i;
      if (v[i] > v[imax]) imax = i;
    }
    const [p, q] = imin <= imax ? [imin, imax] : [imax, imin];
    d += `${d ? 'L' : 'M'}${pt(p)}`;
    if (q !== p) d += `L${pt(q)}`;
  }
  return d;
}

interface Props {
  results: AnalysisResult[];
  primaryId: string;
  /** Which charts to draw: Sun/Earth visibility bars, battery and power, or both. */
  part?: 'visibility' | 'power' | 'all';
  startMs: number;
  endMs: number;
  cursorMs: number;
  onCursor: (ms: number) => void;
}

function winTitle(label: string, w: TimeWindow, tz: TimeZoneValue): string {
  return `${label}: ${tz.dateTime(w.startMs)} to ${tz.dateTime(w.endMs)}, ${num(windowHours(w), 1)} h${w.truncatedStart || w.truncatedEnd ? ' (cut by the interval)' : ''}`;
}

function TimelinesImpl({ results, primaryId, part = 'all', startMs, endMs, cursorMs, onCursor }: Props) {
  const tz = useTimeZone();
  const selection = useScrubSelection();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const tx = (t: number) => LX + ((t - startMs) / (endMs - startMs)) * PWID;

  const showRows = part !== 'power';
  const showPower = part !== 'visibility';
  const layout = useMemo(() => {
    const rowsH = showRows ? results.length * (2 * BAR_H + BAR_GAP + SITE_GAP) : 0;
    const chart1Y = AXIS_H + rowsH + (showRows ? 14 : 6);
    const batH = 86;
    const powY = chart1Y + batH + 22;
    const powH = 58;
    return { rowsH, chart1Y, batH, powY, powH, total: showPower ? powY + powH + 8 : AXIS_H + rowsH + 8 };
  }, [results.length, showRows, showPower]);

  const staticPart = useMemo(() => {
    const ticks = makeTicks(startMs, endMs);
    const x = (t: number) => LX + ((t - startMs) / (endMs - startMs)) * PWID;
    const primary = results.find((r) => r.site.id === primaryId) ?? results[0];
    const { chart1Y, batH, powY, powH, total } = layout;
    const bars = (ws: TimeWindow[], y: number, cls: string, label: string) =>
      ws.map((w, i) => (
        <rect key={`${cls}${i}`} x={x(w.startMs)} y={y} width={Math.max(0.6, x(w.endMs) - x(w.startMs))} height={BAR_H} className={cls}>
          <title>{winTitle(label, w, tz)}</title>
        </rect>
      ));
    let batteryPath = '';
    let powerPath = '';
    let deficit: [number, number][] = [];
    let cap = 0;
    let pMax = 1;
    if (primary && showPower) {
      const s = primary.series;
      cap = primary.params.batteryCapacityWh;
      const bmax = cap > 0 ? cap : 1;
      for (let i = 0; i < s.powerW.length; i++) if (s.powerW[i] > pMax) pMax = s.powerW[i];
      batteryPath = seriesPath(s.tMs, s.batteryWh, x, (v) => chart1Y + batH - (v / bmax) * batH);
      powerPath = seriesPath(s.tMs, s.powerW, x, (v) => powY + powH - (v / pMax) * powH);
      let from = -1;
      for (let i = 0; i < s.batteryWh.length; i++) {
        const empty = s.batteryWh[i] <= 1e-6;
        if (empty && from < 0) from = i;
        if ((!empty || i === s.batteryWh.length - 1) && from >= 0) {
          deficit.push([x(s.tMs[from]), x(s.tMs[i])]);
          from = -1;
        }
      }
      if (deficit.length > 400) deficit = deficit.slice(0, 400);
    }
    return (
      <g>
        <rect x={LX} y={AXIS_H} width={PWID} height={total - AXIS_H} className="plot-bg" />
        <g className="grid">
          {ticks.map((k) => (
            <line key={k.t} x1={x(k.t)} x2={x(k.t)} y1={AXIS_H - 4} y2={total} />
          ))}
        </g>
        <g className="axis-text">
          {ticks.map((k) => (
            <text key={k.t} x={x(k.t)} y={AXIS_H - 8} textAnchor="middle">
              {k.label}
            </text>
          ))}
          <text x={LX - 28} y={AXIS_H - 8} textAnchor="end">UTC</text>
        </g>
        {showRows && results.map((r, idx) => {
          const y0 = AXIS_H + 6 + idx * (2 * BAR_H + BAR_GAP + SITE_GAP);
          return (
            <g key={r.site.id}>
              <text x={LX - 8} y={y0 + BAR_H - 2} textAnchor="end" className={r.site.id === primaryId ? 'row-label primary' : 'row-label'}>
                {r.site.short}
              </text>
              <text x={LX - 8} y={y0 + 2 * BAR_H + BAR_GAP - 2} textAnchor="end" className="axis-text-small">
                Sun / Earth
              </text>
              <rect x={LX} y={y0} width={PWID} height={BAR_H} className="bar-track" />
              <rect x={LX} y={y0 + BAR_H + BAR_GAP} width={PWID} height={BAR_H} className="bar-track" />
              {bars(r.metrics.sunWindows, y0, 'bar-sun', `${r.site.short} Sun visible`)}
              {bars(r.metrics.earthWindows, y0 + BAR_H + BAR_GAP, 'bar-earth', `${r.site.short} Earth line of sight`)}
            </g>
          );
        })}
        {showPower && primary && (
          <g>
            <text x={LX - 8} y={chart1Y + 10} textAnchor="end" className="row-label primary">Battery energy</text>
            <text x={LX - 8} y={chart1Y + 24} textAnchor="end" className="axis-text-small">{primary.site.short}</text>
            <text x={LX - 8} y={chart1Y + 38} textAnchor="end" className="axis-text-small">{num(cap, 0)} Wh</text>
            <text x={LX - 8} y={chart1Y + batH} textAnchor="end" className="axis-text-small">0</text>
            <line x1={LX} x2={RX} y1={chart1Y} y2={chart1Y} className="cap-line" />
            <path d={batteryPath} className="line-batt" />
            {deficit.map(([a, b], i) => (
              <rect key={i} x={a} y={chart1Y + batH - 2} width={Math.max(1, b - a)} height={3} className="deficit-mark" />
            ))}
            <text x={LX - 8} y={powY + 10} textAnchor="end" className="row-label primary">Array power</text>
            <text x={LX - 8} y={powY + 24} textAnchor="end" className="axis-text-small">{num(pMax, 0)} W max</text>
            <text x={LX - 8} y={powY + powH} textAnchor="end" className="axis-text-small">0</text>
            <line x1={LX} x2={RX} y1={powY + powH} y2={powY + powH} className="cap-line" />
            <path d={powerPath} className="line-power" />
          </g>
        )}
      </g>
    );
  }, [results, primaryId, startMs, endMs, layout, tz, showRows, showPower]);

  const setFromEvent = (e: RPointerEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VW;
    const f = clamp((px - LX) / PWID, 0, 1);
    const t = Math.round((startMs + f * (endMs - startMs)) / 60000) * 60000;
    onCursor(clamp(t, startMs, endMs));
  };

  const cx = tx(cursorMs);
  const Hh = layout.total;

  return (
    <div className="timelines">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${Hh}`}
        className="timeline-svg"
        role="slider"
        tabIndex={0}
        aria-valuemin={startMs}
        aria-valuemax={endMs}
        aria-valuenow={cursorMs}
        aria-valuetext={tz.dateTime(cursorMs)}
        aria-label="Timelines of Sun visibility, Earth line of sight, battery energy and array power. Click or drag to set the cursor time."
        onKeyDown={(e) => {
          const step = e.shiftKey ? DAY_MS : HOUR_MS;
          const next = e.key === 'Home' ? startMs : e.key === 'End' ? endMs
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? cursorMs - step
              : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? cursorMs + step : null;
          if (next === null) return;
          e.preventDefault();
          onCursor(clamp(next, startMs, endMs));
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          e.preventDefault(); // Scrub the chart without starting browser text selection.
          selection.start();
          e.currentTarget.focus({ preventScroll: true });
          dragging.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current === e.pointerId) setFromEvent(e);
        }}
        onPointerUp={(e) => {
          if (dragging.current !== e.pointerId) return;
          setFromEvent(e);
          dragging.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => { dragging.current = null; selection.stop(); }}
        onLostPointerCapture={() => { dragging.current = null; selection.stop(); }}
      >
        {results.length === 0 ? (
          <text x={LX} y={40} className="axis-text">Computing{'…'}</text>
        ) : (
          <>
            {staticPart}
            <line x1={cx} x2={cx} y1={AXIS_H - 2} y2={Hh} className="cursor-line" />
          </>
        )}
      </svg>
      {showRows ? (
      <p className="caption">
        <span className="key"><i className="lg lg-sun" /> Sun visible (any part of disk)</span>{' '}
        <span className="key"><i className="lg lg-earth" /> Earth line of sight (geometric)</span>{' '}
        1 h display samples; mission summaries use refined integration. Click or drag on the chart to move the cursor.
      </p>
      ) : (
        <p className="caption">Stored energy is limited to the assumed battery capacity; red marks show when the battery is empty. Engineering estimate from assumed lander parameters.</p>
      )}
    </div>
  );
}

export const TimelineChart = memo(TimelinesImpl);

interface ControlsProps {
  startMs: number;
  endMs: number;
  cursorMs: number;
  onCursor: (ms: number) => void;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** "15 Dec" for an instant in a display zone (styled uppercase by CSS). */
function shortDay(ms: number, zone: string): string {
  let f = dayFormats.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: zone }); dayFormats.set(zone, f); }
  return f.format(ms);
}

function TimeControlsImpl({ startMs, endMs, cursorMs, onCursor }: ControlsProps) {
  const tz = useTimeZone();
  const selection = useScrubSelection();
  const step = (ms: number) => onCursor(clamp(cursorMs + ms, startMs, endMs));
  return (
    <div className="timebar">
      <div className="time-now">
        <output className="mono time-val" aria-label={`Cursor time, ${tz.label}`} aria-live="off">{tz.dateTime(cursorMs)}</output>
      </div>
      <div className="time-btns" role="group" aria-label="Step cursor time">
        <button type="button" className="btn small" onClick={() => step(-DAY_MS)} aria-label="Back 1 day">{'−'}1 d</button>
        <button type="button" className="btn small" onClick={() => step(-HOUR_MS)} aria-label="Back 1 hour">{'−'}1 h</button>
        <button type="button" className="btn small" onClick={() => step(HOUR_MS)} aria-label="Forward 1 hour">+1 h</button>
        <button type="button" className="btn small" onClick={() => step(DAY_MS)} aria-label="Forward 1 day">+1 d</button>
      </div>
      <div className="time-slider">
      <input
        type="range"
        className="scrubber"
        onPointerDown={event => { if (event.isPrimary && event.button === 0) selection.start(); }}
        onLostPointerCapture={selection.stop}
        min={startMs}
        max={endMs}
        step="any"
        value={clamp(cursorMs, startMs, endMs)}
        onChange={(e) => onCursor(Number(e.target.value))}
        onKeyDown={event => {
          const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : 0;
          if (direction) { event.preventDefault(); step(direction * (event.shiftKey ? DAY_MS : HOUR_MS)); }
        }}
        aria-label={`Time scrubber, ${tz.label}`}
        aria-valuetext={tz.dateTime(cursorMs)}
      />
      <div className="time-ends" aria-hidden="true"><span>{shortDay(startMs, tz.zone)}</span><span>{shortDay(endMs, tz.zone)}</span></div>
      </div>
    </div>
  );
}

export const TimeControls = memo(TimeControlsImpl);
