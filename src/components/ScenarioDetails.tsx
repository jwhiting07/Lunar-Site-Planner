import { useEffect, useMemo, useState } from 'react';
import { loadEphemeris, loadHorizon } from '../data/loader';
import { flatHorizon, instantState, makeSiteContext, type AnalysisResult, type EphemerisIndex, type EphemerisTable, type HorizonMask } from '../science';
import { formatRowValue, summaryRows } from '../science/summary';
import type { Targets } from '../science/planner';
import { TimeControls, TimelineChart, type TimelineMission } from './Timelines';
import { SkyReadout, SkyView } from './SkyView';

function ResultBar({ fraction, target }: { fraction: number; target?: number }) {
  return <div className="mission-result-track" aria-hidden="true">
    <div className="mission-result-fill" style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    {target !== undefined && <div className="mission-result-target" style={{ left: `${target}%` }} />}
  </div>;
}

export function ScenarioOverview({ result, targets }: { result: AnalysisResult; targets: Targets }) {
  const { metrics, battery, params } = result;
  const rows = summaryRows(result);
  const outage = (key: string) => {
    const row = rows.find(entry => entry.key === key);
    return row?.value != null ? `${formatRowValue(row)} h` : 'None';
  };
  const simultaneous = metrics.bothHours / metrics.intervalHours;
  const energyScale = Math.max(1, battery.generatedWh, battery.loadWh, battery.unservedWh);
  const batteryFraction = params.batteryCapacityWh > 0 ? battery.minEnergyWh / params.batteryCapacityWh : null;

  return <div className="mission-results-overview">
    <section className="mission-metrics" aria-label="Visibility across the mission">
      <div><span className="sun-text">Sunlight</span><strong>{(metrics.sunlitFraction * 100).toFixed(1)}%</strong>
        <div className="sun-text"><ResultBar fraction={metrics.sunlitFraction} target={targets.sunlight} /></div>
        <small>{metrics.sunlitHours.toFixed(1)} h · target ≥ {targets.sunlight}%</small>
        <small>Longest darkness · {outage('longest_dark_h')}{targets.maxDarkHours !== null && ` · limit ${targets.maxDarkHours} h`}</small>
      </div>
      <div><span className="earth-text">Earth visible</span><strong>{(metrics.earthVisibleFraction * 100).toFixed(1)}%</strong>
        <div className="earth-text"><ResultBar fraction={metrics.earthVisibleFraction} target={targets.earth} /></div>
        <small>{metrics.earthVisibleHours.toFixed(1)} h · target ≥ {targets.earth}%</small>
        <small>Longest blackout · {outage('longest_blackout_h')}{targets.maxBlackoutHours !== null && ` · limit ${targets.maxBlackoutHours} h`}</small>
      </div>
      <div><span>Sun and Earth both visible</span><strong>{(simultaneous * 100).toFixed(1)}%</strong>
        <ResultBar fraction={simultaneous} />
        <small>{metrics.bothHours.toFixed(1)} h of overlap</small>
      </div>
    </section>
    <section className="mission-energy" aria-label="Estimated mission power">
      <div className="mission-energy-budget">
        <h3>Estimated energy</h3>
        {([
          ['Generated', battery.generatedWh, 'sun-text'],
          ['Demand', battery.loadWh, ''],
          ['Unserved', battery.unservedWh, 'mission-bad'],
        ] as const).map(([label, energy, tone]) => <div className="mission-energy-row" key={label}>
          <span>{label}</span><div className={tone}><ResultBar fraction={energy / energyScale} /></div>
          <span className="mono">{(energy / 1000).toFixed(2)} kWh</span>
        </div>)}
      </div>
      <div className="mission-energy-battery">
        <h3>Minimum battery charge</h3>
        {batteryFraction === null ? <span>No battery capacity configured</span> : <>
          <strong className="mono">{(batteryFraction * 100).toFixed(0)}%</strong>
          <ResultBar fraction={batteryFraction} />
        </>}
        <small>{battery.deficitHours.toFixed(1)} h in power deficit</small>
      </div>
    </section>
  </div>;
}

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
  if (mask?.resolutionM) return `Regional LOLA skyline · ${(mask.resolutionM / 1000).toFixed(1)} km DEM at equator`;
  if (mask?.terrainAware) return `LOLA terrain horizon · ${mask.azStepDeg}° azimuth steps`;
  if (terrain === 'pending') return 'Flat 0° horizon · Calculating terrain…';
  if (terrain === 'uncovered') return 'Flat 0° horizon · No terrain profile available';
  if (terrain === 'unavailable') return 'Flat 0° horizon · Terrain calculator unavailable';
  return 'Flat 0° horizon · No terrain data for this site';
}

export function ScenarioTimeline({ result, missionId, missions, index, terrain = null }: {
  result: AnalysisResult; missionId: string; missions: TimelineMission[]; index: EphemerisIndex; terrain?: TerrainState;
}) {
  const { startMs, endMs, site, observerHeightM, terrainAware, earthMinClearanceDeg, horizonMask } = result;
  const rangeStart = Math.min(startMs, ...missions.map(mission => mission.result.startMs));
  const rangeEnd = Math.max(endMs, ...missions.map(mission => mission.result.endMs));
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

  const withinMission = cursor >= startMs && cursor <= endMs;
  const instant = useMemo(() => {
    if (!eph || !mask || !withinMission) return null;
    return instantState(makeSiteContext(site, observerHeightM, mask), eph, cursor, earthMinClearanceDeg);
  }, [site, observerHeightM, eph, mask, cursor, earthMinClearanceDeg, withinMission]);

  return <div className="mission-timeline tl">
    <div className="mission-timeline-controls">
      <TimeControls startMs={rangeStart} endMs={rangeEnd} cursorMs={cursor} onCursor={setCursor} />
    </div>
    <section className="tl-panel" aria-label="Sky view from the lander">
      <header className="tl-panel-h"><h3>Sky view from the lander</h3><span className="tl-state">{horizonState(mask, terrain)}</span></header>
      <div className="tl-sky">
        <div className="tl-sky-chart">
          {error ? <p role="alert" className="mission-error">{error}</p> :
            <SkyView result={result} mask={mask} inst={instant} cursorMs={Math.max(startMs, Math.min(endMs, cursor))} onCursor={setCursor} />}
        </div>
        {withinMission ? <SkyReadout inst={instant} earthMinClearanceDeg={earthMinClearanceDeg} terrainAware={Boolean(mask?.terrainAware)} />
          : <p className="muted">The cursor is outside the selected mission.</p>}
      </div>
    </section>
    <section className="tl-panel" aria-label="Mission timeline">
      <header className="tl-panel-h"><h3>Mission timeline</h3><span className="tl-state">Drag to change time</span></header>
      <div className="tl-body"><TimelineChart missions={missions} primaryId={missionId} part="visibility" startMs={rangeStart} endMs={rangeEnd} cursorMs={cursor} onCursor={setCursor} /></div>
    </section>
    <section className="tl-panel" aria-label="Selected mission power">
      <header className="tl-panel-h"><h3>Power details</h3><span className="tl-state">Selected mission</span></header>
      <div className="tl-body"><TimelineChart missions={missions} primaryId={missionId} part="power" startMs={startMs} endMs={endMs} cursorMs={cursor} onCursor={setCursor} /></div>
    </section>
  </div>;
}
