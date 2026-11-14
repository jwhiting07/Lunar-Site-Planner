import { memo, useMemo } from 'react';
import { HOUR_MS, type AnalysisResult, type HorizonMask, type InstantState } from '../science';
import { DAY_MS, deg, fmtUtc, num } from '../ui/labels';
import { Panel } from './Common';

const W = 960;
const H = 330;
const ML = 46;
const MR = 14;
const MT = 12;
const MB = 34;
const PW = W - ML - MR;
const PH = H - MT - MB;
const PATH_DAYS = 15;

interface Props {
  mask: HorizonMask | null;
  result: AnalysisResult | null;
  inst: InstantState | null;
  cursorMs: number;
  earthMinClearanceDeg: number;
}

/** Split an az/el series into polyline strings, breaking at the 0/360 wrap. */
function pathSegments(az: Float64Array, el: Float64Array, i0: number, i1: number, x: (a: number) => string, y: (e: number) => string): string[] {
  const segs: string[] = [];
  let cur = '';
  for (let i = i0; i <= i1; i++) {
    if (i > i0 && Math.abs(az[i] - az[i - 1]) > 180) {
      if (cur) segs.push(cur);
      cur = '';
    }
    cur += `${cur ? 'L' : 'M'}${x(az[i])} ${y(el[i])}`;
  }
  if (cur) segs.push(cur);
  return segs;
}

function sunState(inst: InstantState): { label: string; cls: string } {
  if (inst.sun.visible) return { label: 'Sun visible', cls: 'ok-sun' };
  if (inst.sun.elDeg + inst.sun.angularRadiusDeg > 0) return { label: 'Sun blocked by terrain', cls: 'blocked' };
  return { label: 'Sun below horizon', cls: 'off' };
}

function earthState(inst: InstantState, minClear: number): { label: string; cls: string } {
  if (inst.earth.visible) return { label: 'Earth: line of sight', cls: 'ok-earth' };
  if (inst.earth.elDeg > 0 && inst.earth.clearanceDeg > 0 && minClear > 0) return { label: 'Earth: below min. clearance', cls: 'blocked' };
  if (inst.earth.elDeg > 0) return { label: 'Earth: blocked by terrain', cls: 'blocked' };
  return { label: 'Earth: below horizon', cls: 'off' };
}

function SkyViewImpl({ mask, result, inst, cursorMs, earthMinClearanceDeg }: Props) {
  const hourKey = Math.floor(cursorMs / HOUR_MS);
  const geo = useMemo(() => {
    let lo = -4;
    let hi = 8;
    let sunSegs: string[] = [];
    let earthSegs: string[] = [];
    let i0 = -1;
    let i1 = -1;
    if (result) {
      const t = result.series.tMs;
      const c = hourKey * HOUR_MS;
      for (let i = 0; i < t.length; i++) {
        if (i0 < 0 && t[i] >= c - PATH_DAYS * DAY_MS) i0 = i;
        if (t[i] <= c + PATH_DAYS * DAY_MS) i1 = i;
      }
      if (i0 < 0) i0 = t.length - 1;
      if (i1 < i0) i1 = i0;
      for (let i = i0; i <= i1; i++) {
        for (const e of [result.series.sunElDeg[i], result.series.earthElDeg[i]]) {
          if (e - 1 < lo) lo = Math.floor(e - 1);
          if (e + 1 > hi) hi = Math.ceil(e + 1);
        }
      }
    }
    if (mask) {
      for (const e of mask.elevDeg) {
        if (e - 1 < lo) lo = Math.floor(e - 1);
        if (e + 1 > hi) hi = Math.ceil(e + 1);
      }
    }
    const x = (a: number) => (ML + (a / 360) * PW).toFixed(1);
    const y = (e: number) => (MT + ((hi - e) / (hi - lo)) * PH).toFixed(1);
    if (result) {
      const s = result.series;
      sunSegs = pathSegments(s.sunAzDeg, s.sunElDeg, i0, i1, x, y);
      earthSegs = pathSegments(s.earthAzDeg, s.earthElDeg, i0, i1, x, y);
    }
    let skyline = '';
    if (mask) {
      const n = mask.elevDeg.length;
      const pts: string[] = [];
      for (let i = 0; i <= n; i++) pts.push(`${x(i * mask.azStepDeg)} ${y(mask.elevDeg[i % n])}`);
      skyline = `M${ML} ${MT + PH}L${pts.join('L')}L${ML + PW} ${MT + PH}Z`;
    }
    return { lo, hi, x, y, sunSegs, earthSegs, skyline };
  }, [mask, result, hourKey]);

  const { lo, hi, x, y } = geo;
  const step = hi - lo > 30 ? 5 : hi - lo > 14 ? 2 : 1;
  const elTicks: number[] = [];
  for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) elTicks.push(e);
  const azTicks = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  const cardinal: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' };
  const sun = inst ? sunState(inst) : null;
  const earth = inst ? earthState(inst, earthMinClearanceDeg) : null;
  const sunPx = inst ? Math.max(5, (inst.sun.angularRadiusDeg / (hi - lo)) * PH) : 5;

  return (
    <Panel
      title="Sky view from the lander"
      help="What the horizon looks like from the site: terrain skyline, and where the Sun and Earth are in the sky. Azimuth is the compass direction measured clockwise from north."
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sky-svg" role="img" aria-label="Sky view: terrain horizon with Sun and Earth tracks and current positions">
        <defs>
          <clipPath id="sky-clip">
            <rect x={ML} y={MT} width={PW} height={PH} />
          </clipPath>
        </defs>
        <rect x={ML} y={MT} width={PW} height={PH} className="plot-bg" />
        <g className="grid">
          {azTicks.map((a) => (
            <line key={a} x1={x(a)} x2={x(a)} y1={MT} y2={MT + PH} />
          ))}
          {elTicks.map((e) => (
            <line key={e} x1={ML} x2={ML + PW} y1={y(e)} y2={y(e)} />
          ))}
        </g>
        <g clipPath="url(#sky-clip)">
          {geo.skyline && <path d={geo.skyline} className="skyline" />}
          <line x1={ML} x2={ML + PW} y1={y(0)} y2={y(0)} className="flat-horizon" />
          {geo.sunSegs.map((d, i) => (
            <path key={`s${i}`} d={d} className="track track-sun" />
          ))}
          {geo.earthSegs.map((d, i) => (
            <path key={`e${i}`} d={d} className="track track-earth" />
          ))}
          {inst && (
            <>
              <g>
                <circle cx={x(inst.earth.azDeg)} cy={y(inst.earth.elDeg)} r={6} className="mark-earth" />
              </g>
              <g>
                <circle cx={x(inst.sun.azDeg)} cy={y(inst.sun.elDeg)} r={sunPx} className="mark-sun" />
              </g>
            </>
          )}
        </g>
        <rect x={ML} y={MT} width={PW} height={PH} className="plot-frame" />
        <g className="axis-text">
          {azTicks.map((a) => (
            <text key={a} x={x(a)} y={MT + PH + 14} textAnchor="middle">
              {cardinal[a] ? `${cardinal[a]} ${a}°` : `${a}°`}
            </text>
          ))}
          {elTicks.map((e) => (
            <text key={e} x={ML - 6} y={Number(y(e)) + 3.5} textAnchor="end">
              {num(e, 0)}{'°'}
            </text>
          ))}
          <text x={ML + PW / 2} y={H - 4} textAnchor="middle">Azimuth, clockwise from north</text>
          <text transform={`translate(11 ${MT + PH / 2}) rotate(-90)`} textAnchor="middle">Elevation</text>
        </g>
        <g className="annot">
          <text x={ML + 6} y={Number(y(0)) - 4}>0{'°'} flat horizon</text>
          {mask && <text x={ML + PW - 6} y={MT + 14} textAnchor="end">terrain horizon {'—'} LOLA</text>}
          <text x={ML + 6} y={MT + 14} className="annot-sun">{'●'} Sun track</text>
          <text x={ML + 78} y={MT + 14} className="annot-earth">{'●'} Earth track</text>
        </g>
      </svg>
      <p className="caption">
        Tracks show {PATH_DAYS} days either side of the cursor. Filled grey = terrain skyline out to 600 km (LOLA). Markers = Sun (amber) and Earth (cyan) at the cursor time.
      </p>
      {inst ? (
        <div className="readout" aria-live="polite">
          <div className="readout-time">
            <span className="field-label">Cursor</span> <span className="mono">{fmtUtc(inst.tMs)} UTC</span>
          </div>
          <div className="readout-col sun">
            <span className={`chip ${sun?.cls}`}>{sun?.label}</span>
            <dl>
              <dt>Azimuth / elevation</dt>
              <dd>{deg(inst.sun.azDeg, 2)} / {deg(inst.sun.elDeg, 2)}</dd>
              <dt>Terrain horizon / clearance</dt>
              <dd>{deg(inst.sun.horizonDeg, 2)} / {deg(inst.sun.clearanceDeg, 2)}</dd>
              <dt>Visible solar disk</dt>
              <dd>{num(inst.sun.diskFraction * 100, 0)} %</dd>
            </dl>
          </div>
          <div className="readout-col earth">
            <span className={`chip ${earth?.cls}`}>{earth?.label}</span>
            <dl>
              <dt>Azimuth / elevation</dt>
              <dd>{deg(inst.earth.azDeg, 2)} / {deg(inst.earth.elDeg, 2)}</dd>
              <dt>Terrain horizon / clearance</dt>
              <dd>{deg(inst.earth.horizonDeg, 2)} / {deg(inst.earth.clearanceDeg, 2)}</dd>
              <dt>Min. clearance setting</dt>
              <dd>{deg(earthMinClearanceDeg, 1)}</dd>
            </dl>
          </div>
        </div>
      ) : (
        <p className="muted">Waiting for ephemeris and horizon data{'…'}</p>
      )}
    </Panel>
  );
}

export const SkyView = memo(SkyViewImpl);
