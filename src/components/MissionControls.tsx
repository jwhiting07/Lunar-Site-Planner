import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SiteDoc } from '../science';
import { normalizeLon } from '../science/planner';

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
  sites: SiteDoc[]; firstDate: string; lastDate: string;
  busy: boolean; ready: boolean; collapsed: boolean; onCollapse: () => void;
  onRun: () => void; onPick: () => void; advanced: ReactNode;
}

export function MissionControls({ query, onChange, sites, firstDate, lastDate, busy, ready, collapsed, onCollapse, onRun, onPick, advanced }: Props) {
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
      <span>{label}</span><strong>{value}</strong><span className="mission-chevron" aria-hidden="true">⌄</span>
    </button>
    {editor === key && <form ref={popup} id={`mission-editor-${key}`} className={`mission-editor mission-editor-${key}`} aria-label={`${label} settings`} onSubmit={event => { event.preventDefault(); close(); }}>
      {contents}
      <div className="mission-editor-actions"><button type="submit" className="mission-text-button">Apply</button></div>
    </form>}
  </div>;

  return <div ref={root} id="mission-controls" className="mission-controls" hidden={collapsed}>
    {field('location', 'Location', labels.location, <>
      {choices('Location scope', query.location, [['any', 'Anywhere'], ['exact', 'Coordinates'], ['nearby', 'Nearby']], location => change({ location }))}
      {query.location !== 'any' ? <>
        <div className="mission-fields">
          <label>Latitude (°)<input aria-label="Latitude (°)" type="number" required min="-90" max="90" step="any" placeholder="−90 to 90" value={query.lat} onChange={event => change({ lat: event.target.value })} /></label>
          <label>Longitude (° E)<input aria-label="Longitude (° E)" type="number" required min="-180" max="180" step="any" placeholder="−180 to 180" value={query.lon} onChange={event => change({ lon: event.target.value })} /></label>
        </div>
        <button type="button" className="mission-text-button mission-pick" onClick={() => { setEditor(null); onPick(); }}>Choose on Moon ↗</button>
        {query.location === 'nearby' && <label>Radius (km)<input type="number" required min="0.001" max="1000" step="any" value={query.radius} onChange={event => change({ radius: event.target.value })} /></label>}
        <details className="mission-known-sites"><summary>Sites with terrain data</summary><label>Terrain site<select value="" onChange={event => {
          const site = sites.find(item => item.id === event.target.value);
          if (site) change({ lat: String(site.lat_deg), lon: String(normalizeLon(site.lon_deg)) });
        }}><option value="" disabled>Choose a site</option>{sites.filter(site => site.terrain_aware).map(site => <option key={site.id} value={site.id}>{site.short}</option>)}</select></label></details>
      </> : <p>Search across the Moon.</p>}
    </>)}
    {field('landing', 'Landing (UTC)', labels.landing, <>
      {choices('Landing date scope', query.landing, [['any', 'Any date'], ['exact', 'Exact date'], ['range', 'Date range']], landing => change({ landing }))}
      {query.landing === 'any' ? <p>Available landing dates: {firstDate}–{lastDate}.</p> : <div className={query.landing === 'range' ? 'mission-fields' : ''}>
        <label>{query.landing === 'range' ? 'First landing (UTC)' : 'Landing date (UTC)'}<input type="date" required min={firstDate} max={lastDate} value={query.date} onChange={event => change({ date: event.target.value })} /></label>
        {query.landing === 'range' && <label>Last landing (UTC)<input type="date" required min={query.date} max={lastDate} value={query.lastDate} onChange={event => change({ lastDate: event.target.value })} /></label>}
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
    <button type="button" className="mission-icon-button mission-collapse" aria-label="Hide mission controls" aria-expanded="true" aria-controls="mission-controls" onClick={() => { setEditor(null); onCollapse(); }}><span aria-hidden="true">⌃</span></button>
  </div>;
}
