import { useEffect, useMemo, useState } from 'react';
import { loadEphemeris, loadHorizon } from '../data/loader';
import { flatHorizon, instantState, makeSiteContext, type AnalysisResult, type EphemerisIndex, type EphemerisTable, type HorizonMask } from '../science';
import { formatRowValue, summaryRows } from '../science/summary';
import { TimeControls, TimelineChart } from './Timelines';
import { SkyReadout, SkyView } from './SkyView';

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

export type TerrainState = 'pending' | 'uncovered' | 'unavailable' | null;

/** One-line description of the horizon behind the sky view. */
function horizonState(mask: HorizonMask | null, terrain: TerrainState): string {
  if (mask?.terrainAware) return `LOLA terrain horizon · ${mask.azStepDeg}° azimuth steps`;
  if (terrain === 'pending') return 'Flat 0° horizon · Calculating terrain…';
  if (terrain === 'uncovered') return 'Flat 0° horizon · Outside LOLA coverage';
  if (terrain === 'unavailable') return 'Flat 0° horizon · Terrain calculator unavailable';
  return 'Flat 0° horizon · No terrain data for this site';
}

export function ScenarioTimeline({ result, index, terrain = null }: { result: AnalysisResult; index: EphemerisIndex; terrain?: TerrainState }) {
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

  return <div className="mission-timeline tl">
    <div className="mission-timeline-controls">
      <TimeControls startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} />
    </div>
    <section className="tl-panel" aria-label="Sky view from the lander">
      <header className="tl-panel-h"><h3>Sky view from the lander</h3><span className="tl-state">{horizonState(mask, terrain)}</span></header>
      <div className="tl-sky">
        <div className="tl-sky-chart">
          {error ? <p role="alert" className="mission-error">{error}</p> :
            <SkyView result={result} mask={mask} inst={instant} cursorMs={cursor} onCursor={setCursor} />}
        </div>
        <SkyReadout inst={instant} earthMinClearanceDeg={earthMinClearanceDeg} terrainAware={Boolean(mask?.terrainAware)} />
      </div>
    </section>
    <section className="tl-panel" aria-label="Mission timeline">
      <header className="tl-panel-h"><h3>Mission timeline</h3><span className="tl-state">Drag to change time</span></header>
      <div className="tl-body"><TimelineChart results={timelineResults} primaryId={site.id} part="visibility" startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} /></div>
    </section>
    <details className="tl-power">
      <summary><span>Power details</span><small>Battery energy / Array power</small></summary>
      <div className="tl-body"><TimelineChart results={timelineResults} primaryId={site.id} part="power" startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} /></div>
    </details>
  </div>;
}
