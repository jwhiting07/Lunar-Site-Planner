import type { Candidate } from '../science/planner';
import { assessment, distanceKm } from '../science/planner';
import { isoDate } from '../ui/labels';

export const scenarioKey = (candidate: Candidate) => JSON.stringify([candidate.result.site.id, candidate.result.startMs, candidate.result.endMs, candidate.targets, candidate.result.params, candidate.result.earthMinClearanceDeg]);
const percent = (value: number) => (value * 100).toFixed(1) + '%';
const delta = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(1);

export function MissionMatches({ candidates, active, note, summary, hidden, onToggle, isSaved, savedCount, pending = false, onCompareChange, onOpen }: {
  candidates: Candidate[]; active: Candidate | null; note: string; summary: string;
  hidden: boolean; onToggle: () => void;
  isSaved: (candidate: Candidate) => boolean; savedCount: number; pending?: boolean;
  onCompareChange: (candidate: Candidate, checked: boolean) => void; onOpen: (candidate: Candidate, trigger: HTMLButtonElement) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? candidates : candidates.slice(0, 3);
  return <section className="mission-options" aria-label="Search results">
    <div className="mission-options-header"><h2>{note ? 'Best sampled matches' : 'Mission result'}</h2><span>{summary}</span>
      <button className="mission-icon-button" aria-label={hidden ? 'Show results' : 'Hide results'} aria-expanded={!hidden} aria-controls="mission-results-table" onClick={onToggle}>{hidden ? '⌃' : '⌄'}</button>
    </div>
    <div id="mission-results-table" hidden={hidden}>
      <div className="mission-table-scroll"><table><thead><tr><th><span className="sr-only">Select for comparison</span></th><th>Coordinates (lat, lon °E)</th><th>Landing (UTC)</th><th>Duration</th><th className="num sun-text">Sunlight</th><th className="num earth-text">Earth visible</th><th>Result / model</th><th><span className="sr-only">Open scenario</span></th></tr></thead>
        <tbody>{visible.map((candidate, index) => {
          const { result } = candidate;
          const difference = active && scenarioKey(active) !== scenarioKey(candidate) ? delta((result.metrics.sunlitFraction - active.result.metrics.sunlitFraction) * 100) + ' pp sun · ' + delta((result.metrics.earthVisibleFraction - active.result.metrics.earthVisibleFraction) * 100) + ' pp Earth · ' + distanceKm({ lat: active.result.site.lat_deg, lon: active.result.site.lon_deg }, { lat: result.site.lat_deg, lon: result.site.lon_deg }).toFixed(1) + ' km away' : '';
          return <tr key={scenarioKey(candidate)} className={active && scenarioKey(active) === scenarioKey(candidate) ? 'mission-selected-row' : ''}>
            <td><input type="checkbox" aria-label={'Compare scenario ' + (index + 1)} title={pending ? 'Waiting for terrain' : savedCount >= 12 && !isSaved(candidate) ? 'Comparison holds up to 12 scenarios' : 'Include in comparison'} checked={isSaved(candidate)} disabled={pending || (savedCount >= 12 && !isSaved(candidate))} onChange={event => onCompareChange(candidate, event.target.checked)} /></td>
            <td className="mono">{result.site.lat_deg.toFixed(4)}°, {result.site.lon_deg.toFixed(4)}°</td>
            <td className="mono">{isoDate(result.startMs)}</td><td>{Number((result.metrics.intervalHours / 24).toFixed(3))} days</td>
            <td className="num mono">{percent(result.metrics.sunlitFraction)}</td><td className="num mono">{percent(result.metrics.earthVisibleFraction)}</td>
            <td>{assessment(result, candidate.targets).good ? 'Meets targets' : 'Below targets'}<details className="mission-row-details"><summary>{result.terrainAware ? 'LOLA terrain' : 'Flat horizon'}</summary><p>{result.terrainAware ? 'Uses a local terrain skyline.' : 'Estimate with a flat skyline.'}{difference && <><br />Compared to the open mission: {difference}</>}</p></details></td>
            <td><button className="mission-text-button" onClick={event => onOpen(candidate, event.currentTarget)}>Open ↗</button></td>
          </tr>;
        })}</tbody></table></div>
      <div className="mission-options-footer"><span>{note}</span>{candidates.length > 3 && <button className="mission-text-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : 'Show all ' + candidates.length}</button>}</div>
    </div>
  </section>;
}
import { useState } from 'react';
