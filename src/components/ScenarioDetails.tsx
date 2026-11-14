import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { loadEphemeris, loadHorizon } from '../data/loader';
import { flatHorizon, instantState, makeSiteContext, type AnalysisResult, type EphemerisIndex, type EphemerisTable, type HorizonMask } from '../science';
import { formatRowValue, summaryRows } from '../science/summary';

const Timeline = lazy(() => import('./Timelines').then(m => ({ default: m.TimelinesPanel })));
const Terrain = lazy(() => import('./TerrainView').then(m => ({ default: m.TerrainView })));
const Horizon = lazy(() => import('./SkyView').then(m => ({ default: m.SkyView })));

export function ScenarioDetails({ result: r, index }: { result: AnalysisResult; index: EphemerisIndex | null }) {
  const [open, setOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [terrainOpen, setTerrainOpen] = useState(false);
  const [horizonOpen, setHorizonOpen] = useState(false);
  const [eph, setEph] = useState<EphemerisTable | null>(null);
  const [mask, setMask] = useState<HorizonMask | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(r.startMs);
  useEffect(() => {
    setCursor(r.startMs); setEph(null); setMask(null); setError('');
    if (!open || !index) return;
    let current = true;
    Promise.all([loadEphemeris(index, r.startMs, r.endMs), r.terrainAware ? loadHorizon(r.site) : Promise.resolve(flatHorizon())])
      .then(([table, horizon]) => { if (current) { setEph(table); setMask(horizon); } })
      .catch(e => { if (current) setError(String(e)); });
    return () => { current = false; };
  }, [r, index, open]);
  const instant = useMemo(() => eph && mask ? instantState(makeSiteContext(r.site, r.observerHeightM, mask), eph, Math.min(r.endMs, Math.max(r.startMs, cursor)), r.earthMinClearanceDeg) : null, [r, eph, mask, cursor]);
  return <details className="mission-data" onToggle={e => { if (e.target === e.currentTarget) setOpen(e.currentTarget.open); }}><summary>Detailed data</summary>
    {open && <>
      <table><tbody>{summaryRows(r).filter(row => !['sunlit_pct', 'sunlit_h', 'earth_pct', 'earth_h'].includes(row.key)).map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{formatRowValue(row)} {row.unit}</td></tr>)}
        {r.terrainAware && <><tr><th scope="row">Elevation above reference sphere</th><td>{r.site.elevation_m.toFixed(1)} m</td></tr><tr><th scope="row">Regional slope</th><td>{r.site.slope.mean3x3_deg.toFixed(1)}°</td></tr><tr><th scope="row">Terrain horizon range</th><td>{r.site.horizon.min_deg.toFixed(1)}°–{r.site.horizon.max_deg.toFixed(1)}°</td></tr></>}
      </tbody></table>
      <details onToggle={e => setTimelineOpen(e.currentTarget.open)}><summary>Timeline</summary>{timelineOpen && <Suspense fallback={<p>Loading timeline…</p>}><Timeline results={[r]} primaryId={r.site.id} startMs={r.startMs} endMs={r.endMs} cursorMs={cursor} onCursor={setCursor} /></Suspense>}</details>
      <details onToggle={e => setHorizonOpen(e.currentTarget.open)}><summary>Local horizon</summary>{horizonOpen && <Suspense fallback={<p>Loading horizon…</p>}><Horizon result={r} mask={mask} inst={instant} cursorMs={cursor} earthMinClearanceDeg={r.earthMinClearanceDeg} /></Suspense>}</details>
      <details onToggle={e => setTerrainOpen(e.currentTarget.open)}><summary>Local terrain</summary>{terrainOpen && <Suspense fallback={<p>Loading terrain…</p>}><Terrain site={r.site} inst={instant} /></Suspense>}</details>
      {error && <p role="alert" className="mission-error">{error}</p>}
    </>}
  </details>;
}
