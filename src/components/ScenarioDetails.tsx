import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { loadEphemeris, loadHorizon } from '../data/loader';
import { flatHorizon, instantState, makeSiteContext, type AnalysisResult, type EphemerisIndex, type EphemerisTable, type HorizonMask } from '../science';
import { formatRowValue, summaryRows } from '../science/summary';
import { TimeControls, TimelinesPanel } from './Timelines';

const Horizon = lazy(() => import('./SkyView').then(m => ({ default: m.SkyView })));

export function ScenarioDetails({ result }: { result: AnalysisResult }) {
  return <details className="mission-data"><summary>Detailed data</summary>
    <table><tbody>
      {summaryRows(result).filter(row => !['sunlit_pct', 'sunlit_h', 'earth_pct', 'earth_h'].includes(row.key)).map(row => (
        <tr key={row.key}><th scope="row">{row.label}</th><td>{formatRowValue(row)} {row.unit}</td></tr>
      ))}
      {result.terrainAware && <>
        <tr><th scope="row">Elevation above reference sphere</th><td>{result.site.elevation_m.toFixed(1)} m</td></tr>
        {Number.isFinite(result.site.slope.mean3x3_deg) &&
          <tr><th scope="row">Regional slope</th><td>{result.site.slope.mean3x3_deg.toFixed(1)}°</td></tr>}
        <tr><th scope="row">Terrain horizon range</th><td>{result.site.horizon.min_deg.toFixed(1)}°–{result.site.horizon.max_deg.toFixed(1)}°</td></tr>
      </>}
    </tbody></table>
  </details>;
}

export function ScenarioTimeline({ result, index }: { result: AnalysisResult; index: EphemerisIndex }) {
  const { startMs, endMs, site, observerHeightM, terrainAware, earthMinClearanceDeg, horizonMask } = result;
  const timelineResults = useMemo(() => [result], [result]);
  const [geometry, setGeometry] = useState<{ eph: EphemerisTable; mask: HorizonMask } | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(startMs);

  useEffect(() => {
    let current = true;
    Promise.all([loadEphemeris(index, startMs, endMs),
      horizonMask ?? (terrainAware ? loadHorizon(site) : flatHorizon())])
      .then(([eph, mask]) => { if (current) setGeometry({ eph, mask }); })
      .catch(err => { if (current) setError(String(err)); });
    return () => { current = false; };
  }, [index, startMs, endMs, site, terrainAware, horizonMask]);

  const instant = useMemo(() => {
    if (!geometry) return null;
    const ctx = makeSiteContext(site, observerHeightM, geometry.mask);
    return instantState(ctx, geometry.eph, cursor, earthMinClearanceDeg);
  }, [site, observerHeightM, geometry, cursor, earthMinClearanceDeg]);

  return <div className="mission-timeline">
    <div className="mission-timeline-controls">
      <TimeControls startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} />
    </div>
    <TimelinesPanel results={timelineResults} primaryId={site.id} startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} />
    {error ? <p role="alert" className="mission-error">{error}</p> :
      <Suspense fallback={<p role="status">Loading horizon…</p>}>
        <Horizon result={result} mask={geometry?.mask ?? null} inst={instant} cursorMs={cursor}
          earthMinClearanceDeg={earthMinClearanceDeg} onCursor={setCursor} />
      </Suspense>}
  </div>;
}
