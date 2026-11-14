import { useEffect, useMemo, useState } from 'react';
import { loadEphemeris, loadHorizon } from '../data/loader';
import { flatHorizon, instantState, makeSiteContext, type AnalysisResult, type EphemerisIndex, type EphemerisTable, type HorizonMask } from '../science';
import { formatRowValue, summaryRows } from '../science/summary';
import { TimeControls, TimelinesPanel } from './Timelines';
import { SkyView } from './SkyView';

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
  const [eph, setEph] = useState<EphemerisTable | null>(null);
  const [loadedMask, setLoadedMask] = useState<HorizonMask | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(startMs);

  useEffect(() => {
    let current = true;
    loadEphemeris(index, startMs, endMs)
      .then(table => { if (current) setEph(table); })
      .catch(err => { if (current) setError(String(err)); });
    return () => { current = false; };
  }, [index, startMs, endMs]);

  useEffect(() => {
    if (horizonMask || !terrainAware) return;
    let current = true;
    loadHorizon(site)
      .then(mask => { if (current) setLoadedMask(mask); })
      .catch(err => { if (current) setError(String(err)); });
    return () => { current = false; };
  }, [site, terrainAware, horizonMask]);
  const referenceMask = useMemo(() => flatHorizon(), []);
  const mask = horizonMask ?? (terrainAware ? loadedMask : referenceMask);

  const instant = useMemo(() => {
    if (!eph || !mask) return null;
    return instantState(makeSiteContext(site, observerHeightM, mask), eph, cursor, earthMinClearanceDeg);
  }, [site, observerHeightM, eph, mask, cursor, earthMinClearanceDeg]);

  return <div className="mission-timeline">
    <div className="mission-timeline-controls">
      <TimeControls startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} />
    </div>
    {error ? <p role="alert" className="mission-error">{error}</p> :
      <SkyView result={result} mask={mask} inst={instant} cursorMs={cursor}
        earthMinClearanceDeg={earthMinClearanceDeg} onCursor={setCursor} />}
    <TimelinesPanel results={timelineResults} primaryId={site.id} startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} />
  </div>;
}
