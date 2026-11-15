import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SiteDoc } from '../science';
import { normalizeLon } from '../science/planner';
import { LANDMARK_GROUPS, landmarkLabel, type LandingSite } from '../data/landingSites';
import { Chevron } from './Chevron';
import { Select } from './Select';

export type LocationMode = 'any' | 'exact' | 'nearby';
export type LandingMode = 'any' | 'exact' | 'range';
export interface MissionQuery {
  location: LocationMode; lat: string; lon: string; radius: string;
  landing: LandingMode; date: string; lastDate: string;
  duration: string; durationRange: boolean; maxDuration: string;
}

export const INITIAL_QUERY: MissionQuery = {
  location: 'any', lat: '', lon: '', radius: '50',
  landing: 'any', date: '2026-12-01', lastDate: '2026-12-31',
  duration: '7', durationRange: false, maxDuration: '14',
};

export function isDiscovery(query: MissionQuery) {
  return query.location !== 'exact' || query.landing !== 'exact' || query.durationRange;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Choose a date';
}

export function queryLabels(query: MissionQuery) {
  return {
    location: query.location === 'any' ? 'Anywhere' : query.location === 'nearby' ? `Within ${query.radius} km` : query.lat && query.lon ? `${query.lat}°, ${query.lon}° E` : 'Choose coordinates',
    landing: query.landing === 'any' ? 'Any available date' : query.landing === 'range' ? `${dateLabel(query.date)} – ${dateLabel(query.lastDate)}` : dateLabel(query.date),
    duration: `${query.duration}${query.durationRange ? `–${query.maxDuration}` : ''} days`,
  };
}

type Editor = 'location' | 'landing' | 'duration' | 'advanced';
interface Props {
  query: MissionQuery; onChange: (query: MissionQuery) => void;
  sites: SiteDoc[]; landmarks: LandingSite[]; firstDate: string; anyFirstDate: string; lastDate: string;
  busy: boolean; ready: boolean; collapsed: boolean; zoneLabel: string;
  onRun: () => void; onPick: () => void; advanced: ReactNode;
}

export function MissionControls({ query, onChange, sites, landmarks, firstDate, anyFirstDate, lastDate, busy, ready, collapsed, zoneLabel, onRun, onPick, advanced }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<Editor, HTMLButtonElement>());
  const popup = useRef<HTMLFormElement>(null);
  const labels = queryLabels(query);
  const change = (patch: Partial<MissionQuery>) => onChange({ ...query, ...patch });
  const close = () => { if (editor) triggers.current.get(editor)?.focus(); setEditor(null); };

  useEffect(() => {
    if (!editor) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setEditor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); triggers.current.get(editor)?.focus(); setEditor(null); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    popup.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [editor]);

  const choices = <T extends string,>(name: string, value: T, options: [T, string][], select: (value: T) => void) => <div className="mission-editor-modes" role="group" aria-label={name}>
    {options.map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => select(key)}>{label}</button>)}
  </div>;

  const field = (key: Editor, label: string, value: string, contents: ReactNode) => <div className={`mission-control mission-control-${key}`}>
    <button type="button" className="mission-control-trigger" ref={el => { if (el) triggers.current.set(key, el); }} aria-expanded={editor === key} aria-controls={`mission-editor-${key}`} onClick={() => setEditor(editor === key ? null : key)} disabled={busy}>
      <span>{label}</span><strong>{value}</strong><Chevron className="mission-chevron" />
    </button>
    {editor === key && <form ref={popup} id={`mission-editor-${key}`} className={`mission-editor mission-editor-${key}`} aria-label={`${label} settings`} onSubmit={event => { event.preventDefault(); close(); }}>
      {contents}
      <div className="mission-editor-actions"><button type="submit" className="mission-text-button">Apply</button></div>
    </form>}
  </div>;

  return <div className="mission-controls-wrap" data-collapsed={collapsed}><div ref={root} id="mission-controls" className="mission-controls" inert={collapsed}>
    {field('location', 'Location', labels.location, <>
      {choices('Location scope', query.location, [['any', 'Anywhere'], ['exact', 'Coordinates'], ['nearby', 'Nearby']], location => change({ location }))}
      {query.location !== 'any' ? <>
        <div className="mission-fields">
          <label>Latitude (°)<input aria-label="Latitude (°)" type="number" required min="-90" max="90" step="any" placeholder="−90 to 90" value={query.lat} onChange={event => change({ lat: event.target.value })} /></label>
          <label>Longitude (° E)<input aria-label="Longitude (° E)" type="number" required min="-180" max="180" step="any" placeholder="−180 to 180" value={query.lon} onChange={event => change({ lon: event.target.value })} /></label>
        </div>
        <button type="button" className="btn mission-pick" onClick={() => { setEditor(null); onPick(); }}>Choose Coordinates on the Moon</button>
        {query.location === 'nearby' && <label>Radius (km)<input type="number" required min="0.001" max="1000" step="any" value={query.radius} onChange={event => change({ radius: event.target.value })} /></label>}
        {landmarks.length > 0 && <details className="mission-known-sites"><summary>Known landing sites</summary><div className="mission-select-field"><span>Past and planned sites</span><Select label="Known landing site" value="" placeholder="Choose a site" options={LANDMARK_GROUPS.flatMap(group => landmarks.filter(group.match).map(site => ({ value: site.id, label: landmarkLabel(site), group: group.label })))} onChange={id => {
          const site = landmarks.find(item => item.id === id);
          if (site) change({ lat: String(Number(site.lat_deg.toFixed(6))), lon: String(Number(normalizeLon(site.lon_deg).toFixed(6))) });
        }} /></div></details>}
        <details className="mission-known-sites"><summary>Sites with terrain data</summary><div className="mission-select-field"><span>Terrain site</span><Select label="Terrain site" value="" placeholder="Choose a site" options={sites.filter(site => site.terrain_aware).map(site => ({ value: site.id, label: site.short }))} onChange={id => {
          const site = sites.find(item => item.id === id);
          if (site) change({ lat: String(Number(site.lat_deg.toFixed(6))), lon: String(Number(normalizeLon(site.lon_deg).toFixed(6))) });
        }} /></div></details>
      </> : <p>Search across the Moon.</p>}
    </>)}
    {field('landing', `Landing (${zoneLabel})`, labels.landing, <>
      {choices('Landing date scope', query.landing, [['any', 'Any date'], ['exact', 'Exact date'], ['range', 'Date range']], landing => change({ landing }))}
      {query.landing === 'any' ? <p>Searches {anyFirstDate} to {lastDate}. To simulate an earlier mission choose an exact date or a range: the ephemeris reaches back to {firstDate}, the date Luna 2 first reached the Moon.</p> : <div className={query.landing === 'range' ? 'mission-fields' : ''}>
        <label>{query.landing === 'range' ? `First landing (${zoneLabel})` : `Landing date (${zoneLabel})`}<input type="date" required min={firstDate} max={lastDate} value={query.date} onChange={event => change({ date: event.target.value })} /></label>
        {query.landing === 'range' && <label>Last landing ({zoneLabel})<input type="date" required min={query.date} max={lastDate} value={query.lastDate} onChange={event => change({ lastDate: event.target.value })} /></label>}
      </div>}
    </>)}
    {field('duration', 'Duration', labels.duration, <>
      {choices('Mission duration mode', query.durationRange ? 'range' : 'fixed', [['fixed', 'Fixed'], ['range', 'Range']], value => change({ durationRange: value === 'range' }))}
      <div className={query.durationRange ? 'mission-fields' : ''}>
        <label>{query.durationRange ? 'Minimum (days)' : 'Mission duration (days)'}<input type="number" required min={1 / 24} max="365" step="any" value={query.duration} onChange={event => change({ duration: event.target.value })} /></label>
        {query.durationRange && <label>Maximum (days)<input type="number" required min={query.duration || 1 / 24} max="365" step="any" value={query.maxDuration} onChange={event => change({ maxDuration: event.target.value })} /></label>}
      </div>
    </>)}
    <button type="button" className="mission-run" disabled={busy || !ready} onClick={() => { setEditor(null); onRun(); }}>{isDiscovery(query) ? 'Find options' : 'Analyze'} <span aria-hidden="true">→</span></button>
    {field('advanced', 'Advanced', '', advanced)}
  </div></div>;
}
