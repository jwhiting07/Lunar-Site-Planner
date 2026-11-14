import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { loadCustomHorizon, loadEphemeris, loadEphemerisIndex, loadHorizon, loadProvenance, loadSites } from './data/loader';
import { analyzeSite, flatHorizon, makeSiteContext, type EphemerisIndex, type EphemerisTable, type HorizonMask, type ProvenanceDoc, type SitesDoc } from './science';
import { assessment, compareCandidates, coordinateSite, dateGrid, DAY, DEFAULT_TARGETS, distanceKm, locationGrid, normalizeLon, searchCandidates, type Candidate, type Point, type Targets } from './science/planner';
import { formatRowValue, summaryRows } from './science/summary';
import { DEFAULT_PARAM_STATE, type ParamState } from './components/ParamsPanel';
import { ExportMenu, parseDate } from './components/Controls';
import { deg, fmtUtc, isoDate } from './ui/labels';
import { ScenarioDetails, ScenarioTimeline } from './components/ScenarioDetails';
import { UtcClock } from './components/UtcClock';
import './mission.css';

const Moon = lazy(() => import('./components/MoonView').then(m => ({ default: m.MoonView })));
const Sources = lazy(() => import('./components/ProvenancePanel').then(m => ({ default: m.ProvenancePanel })));
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const coords = (r: Candidate['result']) => `${r.site.lat_deg.toFixed(4)}°, ${r.site.lon_deg.toFixed(4)}°`;
interface Saved extends Candidate { id: number }
const dashboardTabs = ['Inputs', 'Results', 'Timeline', 'Compare'] as const;
type DashboardTab = typeof dashboardTabs[number];

export default function MissionPlanner() {
  const [data, setData] = useState<{ sites: SitesDoc; index: EphemerisIndex } | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'check' | 'find'>('check');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [date, setDate] = useState('2026-12-01');
  const [lastDate, setLastDate] = useState('2026-12-31');
  const [duration, setDuration] = useState('7');
  const [near, setNear] = useState(false);
  const [dateLimited, setDateLimited] = useState(false);
  const [radius, setRadius] = useState('50');
  const [targets, setTargets] = useState<Targets>({ ...DEFAULT_TARGETS });
  const [params, setParams] = useState<ParamState>(DEFAULT_PARAM_STATE);
  const [pick, setPick] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [active, setActive] = useState<Candidate | null>(null);
  const [terrainStatus, setTerrainStatus] = useState<'pending' | 'uncovered' | 'unavailable' | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [markerScenarioId, setMarkerScenarioId] = useState<number | null>(null);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [searchNote, setSearchNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [sources, setSources] = useState(false);
  const [provenance, setProvenance] = useState<ProvenanceDoc | null>(null);
  const [provError, setProvError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardTab | null>(null);
  const [detailed, setDetailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const terrainRequest = useRef<AbortController | null>(null);
  const masks = useRef(new Map<string, HorizonMask>());
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const dashboardTrigger = useRef<HTMLButtonElement>(null);
  const compareTrigger = useRef<HTMLButtonElement>(null);
  const openedFromCompare = useRef(false);

  useEffect(() => {
    let current = true;
    Promise.all([loadSites(), loadEphemerisIndex()]).then(([sites, index]) => { if (current) setData({ sites, index }); }).catch(e => { if (current) setError(errorText(e)); });
    return () => { current = false; abort.current?.abort(); terrainRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!sources) return;
    loadProvenance().then(setProvenance).catch(e => setProvError(errorText(e)));
  }, [sources]);
  useEffect(() => {
    const element = dialog.current;
    if (dashboard && !element?.open) element?.showModal();
    if (!dashboard && element?.open) {
      element.close();
      (openedFromCompare.current ? compareTrigger : dashboardTrigger).current?.focus();
    }
  }, [dashboard]);

  const startCoverage = data ? Date.parse(data.index.start_utc) : Date.UTC(2026, 0, 1);
  const endCoverage = data ? Date.parse(data.index.stop_utc) : Date.UTC(2029, 0, 1);
  const validDuration = Number.isFinite(Number(duration)) ? Math.max(1 / 24, Math.min(365, Number(duration))) : 1;
  const lastAllowedDate = isoDate(endCoverage - validDuration * DAY);
  const chosen = useMemo(() => {
    if (lat.trim() === '' || lon.trim() === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return [];
    return [coordinateSite({ lat: Number(lat), lon: Number(lon) }, data?.sites.sites)];
  }, [lat, lon, data]);
  const savedSites = useMemo(() => new Map(saved.map(entry => [entry.result.site.id, entry.result.site])), [saved]);
  const savedSiteIds = useMemo(() => new Set(savedSites.keys()), [savedSites]);
  const mapSites = useMemo(() => {
    const sites = new Map(savedSites);
    for (const site of chosen) sites.set(site.id, site);
    return [...sites.values()];
  }, [savedSites, chosen]);
  const markerScenario = saved.find(entry => entry.id === markerScenarioId);
  const markerSiteId = markerScenario?.result.site.id;
  const markerDates = saved.filter(entry => entry.result.site.id === markerSiteId);

  const selectMarker = (siteId: string) => {
    const scenario = saved.find(entry => entry.result.site.id === siteId);
    setMarkerScenarioId(scenario?.id ?? null);
  };

  const getMask = async (site: ReturnType<typeof coordinateSite>) => {
    if (!site.terrain_aware) return flatHorizon();
    const cached = masks.current.get(site.id);
    if (cached) return cached;
    const mask = await loadHorizon(site);
    masks.current.set(site.id, mask);
    return mask;
  };
  const validateTargets = () => {
    if (![targets.sunlight, targets.earth].every(v => Number.isFinite(v) && v >= 0 && v <= 100)
      || ![targets.maxDarkHours, targets.maxBlackoutHours].every(v => v === null || Number.isFinite(v) && v >= 0)
      || !Number.isFinite(params.earthMinClearanceDeg) || params.earthMinClearanceDeg < 0 || params.earthMinClearanceDeg > 60) throw new Error('Check the advanced targets and clearance.');
  };

  const stopTerrain = () => {
    terrainRequest.current?.abort();
    terrainRequest.current = null;
    setTerrainStatus(null);
  };

  function showResult(candidate: Candidate, index?: EphemerisIndex, ephemeris?: EphemerisTable) {
    stopTerrain();
    setActive(candidate);
    const { result } = candidate;
    if (result.terrainAware) return;
    if (result.site.lat_deg > -60) {
      setTerrainStatus('uncovered');
      return;
    }
    if (!index) return;
    const request = new AbortController();
    terrainRequest.current = request;
    setTerrainStatus('pending');
    void Promise.all([
      loadCustomHorizon(result.site, request.signal),
      ephemeris ?? loadEphemeris(index, result.startMs, result.endMs),
    ]).then(([terrain, eph]) => {
      if (terrainRequest.current !== request || request.signal.aborted) return;
      if (terrain) {
        const { site, mask, observerHeightM } = terrain;
        const updated = analyzeSite(makeSiteContext(site, observerHeightM, mask), eph, {
          startMs: result.startMs, endMs: result.endMs, params: result.params,
          earthMinClearanceDeg: result.earthMinClearanceDeg,
        });
        setActive({ targets: candidate.targets, result: { ...updated, horizonMask: mask } });
      }
      setTerrainStatus(terrain ? null : 'uncovered');
    }).catch(() => {
      if (terrainRequest.current === request && !request.signal.aborted) setTerrainStatus('unavailable');
    }).finally(() => {
      if (terrainRequest.current === request) terrainRequest.current = null;
    });
  }

  async function run(alternatives = false) {
    if (!data || busy) return;
    if (terrainRequest.current) stopTerrain();
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setProgress('Loading geometry…'); setOptions([]); setSearchNote('');
    try {
      validateTargets();
      const base = alternatives ? active : null;
      const days = base ? (base.result.endMs - base.result.startMs) / DAY : Number(duration);
      if (!Number.isFinite(days) || days < 1 / 24 || days > 365) throw new Error('Duration must be between 1 hour and 365 days.');
      const start = base ? base.result.startMs : mode === 'find' && !dateLimited ? startCoverage : parseDate(date);
      if (start === null) throw new Error('Enter a valid landing date.');
      const point: Point = base ? { lat: base.result.site.lat_deg, lon: base.result.site.lon_deg } : mode === 'find' && !near ? { lat: 0, lon: 0 } : { lat: Number(lat), lon: Number(lon) };
      if ((mode === 'check' || near) && !chosen.length && !base) throw new Error('Enter latitude from −90 to 90 and longitude from −180 to 180, or choose on the Moon.');
      const target = base ? base.targets : { ...targets };
      const lander = base ? base.result.params : { ...params.lander };
      const clearance = base ? base.result.earthMinClearanceDeg : params.earthMinClearanceDeg;
      if (base || mode === 'find') {
        const km = base ? 50 : near ? Number(radius) : null;
        if (km !== null && (!Number.isFinite(km) || km <= 0 || km > 1000)) throw new Error('Search radius must be greater than 0 and at most 1,000 km.');
        const first = base ? Math.max(startCoverage, start - 7 * DAY) : dateLimited ? start : startCoverage;
        const last = base ? Math.min(endCoverage - days * DAY, start + 7 * DAY) : dateLimited ? parseDate(lastDate) : endCoverage - days * DAY;
        if (last === null || first < startCoverage || last + days * DAY > endCoverage || last < first) throw new Error('The landing range and full mission must fit within 2026–2028.');
        let points = locationGrid(point, km);
        const dates = dateGrid(first, last);
        if (base) points = [point];
        const eph = await loadEphemeris(data.index, first, last + days * DAY);
        for (const s of data.sites.sites) await getMask(s);
        const known = data.sites.sites;
        const customBase = base?.result.horizonMask?.terrainAware && !base.result.site.horizon.file ? base.result : null;
        const searchMasks = new Map(masks.current);
        if (customBase?.horizonMask) searchMasks.set(customBase.site.id, customBase.horizonMask);
        const config = { points, dates, durationDays: days, targets: target, lander, clearance, origin: point, startMs: start,
          known: customBase ? [...known, customBase.site] : known,
          observerHeight: data.sites.observer_height_m, masks: searchMasks };
        const update = (done: number, total: number) => setProgress(`Checking ${done} / ${total}…`);
        let found = await searchCandidates(eph, config, controller.signal, update);
        let count = points.length * dates.length;
        if (base) {
          const nearby = locationGrid(point, 50).slice(1);
          const local = await searchCandidates(eph, { ...config, points: nearby, dates: [start] }, controller.signal, update);
          count += nearby.length;
          const betterDates = found.filter(c => compareCandidates(c, base, point, start) < 0);
          const betterLocations = local.filter(c => compareCandidates(c, base, point, start) < 0);
          // Keep both types of improvement visible when both exist.
          const dateCount = betterLocations.length ? 3 : 5;
          const locationCount = 5 - Math.min(dateCount, betterDates.length);
          found = [...betterDates.slice(0, dateCount), ...betterLocations.slice(0, locationCount)].sort((a, b) => compareCandidates(a, b, point, start));
        }
        if (controller.signal.aborted) return;
        setOptions(found);
        setSearchNote(base ? `${count} nearby scenarios checked: dates within 7 days or locations within 50 km. ${found.length ? '' : 'No better option found in these samples.'}` : `${count} sampled scenarios checked. ${found.some(c => assessment(c.result, c.targets).good) ? 'Best sampled matches shown.' : 'No sampled scenario meets every target; closest matches shown.'}`);
        if (!base && found[0]) use(found[0], data.index, eph);
      } else {
        if (start < startCoverage || start + days * DAY > endCoverage) throw new Error('The full mission must fit within January 1, 2026 and January 1, 2029 UTC.');
        const site = coordinateSite(point, data.sites.sites);
        const [eph, mask] = await Promise.all([
          loadEphemeris(data.index, start, start + days * DAY),
          getMask(site),
        ]);
        if (controller.signal.aborted) return;
        const result = analyzeSite(makeSiteContext(site, data.sites.observer_height_m, mask), eph, {
          startMs: start, endMs: start + days * DAY, params: lander, earthMinClearanceDeg: clearance,
        });
        showResult({ targets: target, result: { ...result, horizonMask: mask } }, data.index, eph);
      }
      setDashboard(tab => tab === 'Inputs' ? 'Results' : tab);
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { if (abort.current === controller) { setBusy(false); setProgress(''); } }
  }

  const signature = (c: Candidate) => JSON.stringify([c.result.site.id, c.result.startMs, c.result.endMs, c.targets, c.result.params, c.result.earthMinClearanceDeg]);
  const inComparison = (c: Candidate) => saved.some(s => signature(s) === signature(c));
  const add = (candidate: Candidate) => { if (saved.length < 12 && !inComparison(candidate)) setSaved(s => [...s, { ...candidate, id: ++sequence.current }]); };
  const use = (candidate: Candidate, index?: EphemerisIndex, eph?: EphemerisTable) => {
    showResult(candidate, index, eph);
    setLat(String(candidate.result.site.lat_deg)); setLon(String(normalizeLon(candidate.result.site.lon_deg)));
    setDate(isoDate(candidate.result.startMs)); setDuration(String((candidate.result.endMs - candidate.result.startMs) / DAY));
    setTargets({ ...candidate.targets }); setParams({ lander: { ...candidate.result.params }, earthMinClearanceDeg: candidate.result.earthMinClearanceDeg });
  };
  const verdict = active ? assessment(active.result, active.targets) : null;
  const terrainPending = terrainStatus === 'pending';
  const terrainNotice = terrainStatus && <p className="mission-terrain-status" role="status">
    {terrainPending ? 'Preview using a flat horizon. Results and the skyline will update when terrain is ready.'
      : terrainStatus === 'uncovered' ? 'LOLA coverage is insufficient here. Results use a flat horizon.'
        : 'Terrain calculation is unavailable. Results use a flat horizon.'}
    {terrainStatus === 'unavailable' && active && data && <>
      {' '}<button type="button" className="btn small" onClick={() => showResult(active, data.index)}>Retry terrain</button>
    </>}
  </p>;

  const inputs = <form className="mission-form" onSubmit={e => { e.preventDefault(); void run(); }}>
        <div className="mission-mode" role="group" aria-label="Planning mode"><button type="button" disabled={busy} aria-pressed={mode === 'check'} onClick={() => { setMode('check'); setOptions([]); setSearchNote(''); }}>Check a site</button><button type="button" disabled={busy} aria-pressed={mode === 'find'} onClick={() => { setMode('find'); setOptions([]); setSearchNote(''); }}>Find a site</button></div>
        <fieldset disabled={busy}>
          {mode === 'find' && <label className="mission-check"><input type="checkbox" checked={near} onChange={e => setNear(e.target.checked)} />Within a location</label>}
          {(mode === 'check' || near) && <>
            <label>Precomputed terrain sites
              <select value={chosen[0]?.terrain_aware ? chosen[0].id : ''} onChange={event => {
                const site = data?.sites.sites.find(candidate => candidate.id === event.target.value);
                if (!site) { setLat(''); setLon(''); return; }
                setLat(String(site.lat_deg));
                setLon(String(normalizeLon(site.lon_deg)));
                setPick(false);
              }}>
                <option value="">Custom coordinates</option>
                {data?.sites.sites.filter(site => site.terrain_aware).map(site => <option key={site.id} value={site.id}>{site.short}</option>)}
              </select>
            </label>
            <div className="mission-fields"><label>Latitude (°)<input type="number" required min="-90" max="90" step="any" placeholder="−90 to 90" value={lat} onChange={e => setLat(e.target.value)} /></label><label>Longitude (° E)<input type="number" required min="-180" max="180" step="any" placeholder="−180 to 180" value={lon} onChange={e => setLon(e.target.value)} /></label></div>
            <button type="button" className="btn mission-map-pick" aria-pressed={pick} onClick={() => { setDashboard(null); setPick(v => !v); }}>{pick ? 'Cancel map selection' : 'Choose on Moon'}</button>
            {mode === 'find' && <label>Within (km)<input type="number" required min="0.001" max="1000" step="any" value={radius} onChange={e => setRadius(e.target.value)} /></label>}
          </>}
          {mode === 'find' && <label className="mission-check"><input type="checkbox" checked={dateLimited} onChange={e => setDateLimited(e.target.checked)} />Within a date range</label>}
          {(mode === 'check' || dateLimited) && <div className={mode === 'find' ? 'mission-fields' : ''}><label>{mode === 'check' ? 'Landing date (UTC)' : 'First landing (UTC)'}<input type="date" required min={isoDate(startCoverage)} max={lastAllowedDate} value={date} onChange={e => setDate(e.target.value)} /></label>{mode === 'find' && <label>Last landing (UTC)<input type="date" required min={date} max={lastAllowedDate} value={lastDate} onChange={e => setLastDate(e.target.value)} /></label>}</div>}
          <label>Mission duration (days)<input type="number" required min={1 / 24} max="365" step="any" value={duration} onChange={e => setDuration(e.target.value)} /></label>
          <p className="mission-targets">Sunlight ≥ {targets.sunlight}% · Earth visible ≥ {targets.earth}%</p>
          <details className="mission-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>Advanced</summary>
            <div className="mission-fields"><label>Minimum sunlight (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.sunlight) ? '' : targets.sunlight} onChange={e => setTargets(t => ({ ...t, sunlight: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label><label>Minimum Earth visible (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.earth) ? '' : targets.earth} onChange={e => setTargets(t => ({ ...t, earth: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label></div>
            <div className="mission-fields"><label>Max. darkness (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxDarkHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxDarkHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label><label>Max. blackout (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxBlackoutHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxBlackoutHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label></div>
            <label>Earth clearance (°)<input type="number" required min="0" max="60" step="any" value={params.earthMinClearanceDeg} onChange={e => setParams(p => ({ ...p, earthMinClearanceDeg: Number(e.target.value) }))} /></label>
            <fieldset className="mission-power"><legend>Power estimate</legend><div className="mission-fields">{([{ key: 'panelAreaM2', label: 'Panel area (m²)' }, { key: 'panelEfficiency', label: 'Efficiency (0–1)', max: 1 }, { key: 'loadW', label: 'Load (W)' }, { key: 'batteryCapacityWh', label: 'Battery (Wh)' }] as const).map(f => <label key={f.key}>{f.label}<input type="number" required min="0" max={'max' in f ? f.max : undefined} step="any" value={params.lander[f.key]} onChange={e => setParams(p => ({ ...p, lander: { ...p.lander, [f.key]: Number(e.target.value) } }))} /></label>)}</div><label>Panel pointing<select value={params.lander.panelMode} onChange={e => setParams(p => ({ ...p, lander: { ...p.lander, panelMode: e.target.value as ParamState['lander']['panelMode'] } }))}><option value="tracking">Sun tracking</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label></fieldset>
          </details>
          <button type="submit" className="btn mission-run" disabled={!data}>{mode === 'check' ? 'Run analysis' : 'Find sites'}</button>
        </fieldset>
        {busy && <div className="mission-progress" role="status"><span>{progress}</span><button type="button" className="btn small" onClick={() => abort.current?.abort()}>Cancel</button></div>}
        {error && <p className="mission-error" role="alert">{error}</p>}
  </form>;

  const results = active && verdict ? <>
          <div className="mission-verdict"><strong className={verdict.good ? 'mission-good' : 'mission-bad'}>{verdict.good ? 'Meets targets' : 'Doesn’t meet targets'}</strong><span>{active.result.terrainAware ? 'Terrain included' : 'Flat-horizon estimate'}</span><button className="btn" disabled={terrainPending || inComparison(active) || saved.length >= 12} onClick={() => add(active)}>{inComparison(active) ? 'Added to comparison' : 'Add to comparison'}</button></div>
          {terrainNotice}
          <p className="mission-result-coords">{coords(active.result)} · {isoDate(active.result.startMs)} · {(active.result.metrics.intervalHours / 24).toFixed(2).replace(/\.00$/, '')} days</p>
          <div className="mission-metrics"><div><span className="sun-text">Sunlight</span><strong>{percent(active.result.metrics.sunlitFraction)}</strong><small>{active.result.metrics.sunlitHours.toFixed(1)} h · target ≥ {active.targets.sunlight}%</small></div><div><span className="earth-text">Earth visible</span><strong>{percent(active.result.metrics.earthVisibleFraction)}</strong><small>{active.result.metrics.earthVisibleHours.toFixed(1)} h · target ≥ {active.targets.earth}%</small></div></div>
          {verdict.failures.length > 0 && <p className="mission-failures">{verdict.failures.map(c => `${c.label}: ${c.actual.toFixed(1)}${c.maximum ? ' h' : '%'} (${c.maximum ? '≤' : '≥'} ${c.target}${c.maximum ? ' h' : '%'} required)`).join(' · ')}</p>}
          <div className="mission-result-actions">
            <button className="btn" onClick={() => {
              if (!dashboard) openedFromCompare.current = false;
              setDashboard('Timeline');
            }}>View horizon</button>
            <button className="btn" disabled={busy || terrainPending} onClick={() => void run(true)}>Find better nearby ↗</button>
            <ExportMenu results={terrainPending ? [] : [active.result]} primaryId={active.result.site.id} provenance={provenance} targets={[active.targets]} />
          </div>
          <ScenarioDetails result={active.result} />
  </> : <p>Run an analysis to see results.</p>;

  const searchResults = (searchNote || options.length > 0) && <section className="mission-options" aria-label="Search results"><p>{searchNote}</p><div className="mission-table-scroll"><table><thead><tr><th>Location</th><th>Landing (UTC)</th><th>Sunlight</th><th>Earth visible</th><th>Result</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{options.map((c, i) => <tr key={i}><td className="mono">{coords(c.result)}<small>{c.result.terrainAware ? 'Terrain included' : 'Flat-horizon estimate'}</small></td><td>{isoDate(c.result.startMs)}</td><td>{percent(c.result.metrics.sunlitFraction)}</td><td>{percent(c.result.metrics.earthVisibleFraction)}</td><td>{assessment(c.result, c.targets).good ? 'Meets targets' : 'Below targets'}<small>{active && c.result !== active.result ? `${signed((c.result.metrics.sunlitFraction - active.result.metrics.sunlitFraction) * 100)} pp sun · ${signed((c.result.metrics.earthVisibleFraction - active.result.metrics.earthVisibleFraction) * 100)} pp Earth · ${distanceKm({ lat: active.result.site.lat_deg, lon: active.result.site.lon_deg }, { lat: c.result.site.lat_deg, lon: c.result.site.lon_deg }).toFixed(1)} km away` : 'Selected result'}</small></td><td><button className="btn small" onClick={() => use(c, data?.index)}>View</button> <button className="btn small" disabled={inComparison(c) || saved.length >= 12} onClick={() => add(c)}>{inComparison(c) ? 'Added' : 'Compare'}</button></td></tr>)}</tbody></table></div></section>;

  const comparison = <div className="mission-comparison">
      {!!saved.length && <label className="mission-check"><input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} />Detailed</label>}
      {!saved.length ? <p>Add an analyzed scenario to compare.</p> : <div className="mission-table-scroll"><table><thead><tr><th scope="col">Scenario</th>{saved.map((c, i) => <th scope="col" key={c.id}><button className="mission-scenario" onClick={() => { use(c); setDashboard('Results'); }}>Scenario {i + 1} ↗</button><button className="mission-remove" aria-label={`Remove scenario ${i + 1}`} onClick={() => setSaved(s => s.filter(x => x.id !== c.id))}>×</button></th>)}</tr></thead><tbody>
        {([
          ['Location (lat, lon)', (c: Saved) => coords(c.result)], ['Landing (UTC)', (c: Saved) => isoDate(c.result.startMs)], ['Duration', (c: Saved) => `${c.result.metrics.intervalHours / 24} days`],
          ['Sunlight', (c: Saved) => percent(c.result.metrics.sunlitFraction)], ['Earth visible', (c: Saved) => percent(c.result.metrics.earthVisibleFraction)],
          ['Result', (c: Saved) => assessment(c.result, c.targets).good ? 'Meets targets' : 'Below targets'], ['Model', (c: Saved) => c.result.terrainAware ? 'Terrain included' : 'Flat horizon'],
        ] as [string, (c: Saved) => string][]).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{saved.map(c => <td key={c.id}>{value(c)}</td>)}</tr>)}
        {detailed && <><tr><th scope="row">Targets: sun / Earth</th>{saved.map(c => <td key={c.id}>{c.targets.sunlight}% / {c.targets.earth}%</td>)}</tr><tr><th scope="row">Limits: darkness / blackout</th>{saved.map(c => <td key={c.id}>{c.targets.maxDarkHours ?? '—'} / {c.targets.maxBlackoutHours ?? '—'} h</td>)}</tr><tr><th scope="row">Earth clearance</th>{saved.map(c => <td key={c.id}>{c.result.earthMinClearanceDeg}°</td>)}</tr>{summaryRows(saved[0].result).filter(r => !['sunlit_pct', 'earth_pct'].includes(r.key)).map(row => <tr key={row.key}><th scope="row">{row.label}</th>{saved.map(c => { const r = summaryRows(c.result).find(r => r.key === row.key)!; return <td key={c.id}>{formatRowValue(r)} {r.unit}</td>; })}</tr>)}<tr><th scope="row">Power assumptions</th>{saved.map(c => <td key={c.id}>{c.result.params.panelAreaM2} m² · {Number((c.result.params.panelEfficiency * 100).toFixed(4))}% · {c.result.params.loadW} W · {c.result.params.batteryCapacityWh} Wh · {c.result.params.panelMode}</td>)}</tr></>}
      </tbody></table></div>}
      {!!saved.length && <ExportMenu results={saved.map(c => c.result)} primaryId={saved[0].result.site.id} provenance={provenance} targets={saved.map(c => c.targets)} />}
  </div>;

  return <div className="mission-app">
    <header className="mission-header mission-top">
      <span className="mission-brand">SERAPHIM</span>
      <div className="mission-actions">
        <button className="btn" onClick={() => setSources(true)}>Sources &amp; methods</button>
        <button ref={compareTrigger} className="btn" aria-haspopup="dialog" onClick={() => { openedFromCompare.current = true; setDashboard('Compare'); }}>Compare{saved.length ? ` (${saved.length})` : ''}</button>
      </div>
    </header>
    <main className={`mission-grid${dashboard ? ' dashboard-open' : ''}`}>
      {!dashboard && inputs}
      <section className="mission-canvas" aria-label="Moon">
        <div className="mission-map">
          <Suspense fallback={<div className="view-loading" role="status">Loading Moon…</div>}>
            <Moon compact explorer sites={mapSites} savedSiteIds={savedSiteIds} primaryId={markerSiteId ?? chosen[0]?.id ?? ''} onSelect={selectMarker}
              onPick={pick && !busy ? point => { setLat(point.lat.toFixed(6)); setLon(point.lon.toFixed(6)); setMarkerScenarioId(null); setPick(false); } : undefined} />
          </Suspense>
          {!dashboard && !active && <button ref={dashboardTrigger} className="btn small mission-open-dashboard" aria-haspopup="dialog" onClick={() => { openedFromCompare.current = false; setDashboard('Inputs'); }}>Open dashboard</button>}
          {markerScenario && <MarkerSummary scenario={markerScenario} atLocation={markerDates}
            onSelect={setMarkerScenarioId} onClose={() => setMarkerScenarioId(null)} />}
        </div>
      </section>
      {!dashboard && active && <section className="mission-result" aria-label="Results">
        <div className="mission-result-header">
          <button ref={dashboardTrigger} className="btn small" aria-haspopup="dialog" onClick={() => { openedFromCompare.current = false; setDashboard('Results'); }}>Open dashboard</button>
        </div>
        {results}
      </section>}
      {!dashboard && searchResults}
    </main>
    <footer className="mission-footer"><span>NASA LOLA · SPICE DE440</span><UtcClock /></footer>
    <dialog ref={dialog} className="mission-dashboard" aria-label="Dashboard" onCancel={event => { event.preventDefault(); setDashboard(null); }}>
      <header className="mission-dialog-bar">
        <h2>Dashboard</h2><button className="btn" onClick={() => setDashboard(null)}>Close ×</button>
      </header>
      <div className="mission-dashboard-tabs" role="group" aria-label="Dashboard views">
        {dashboardTabs.map(tab => <button key={tab} className="btn" aria-pressed={dashboard === tab} onClick={() => setDashboard(tab)}>{tab}</button>)}
      </div>
      <div className="mission-dashboard-content">
        {dashboard === 'Inputs' && inputs}
        {dashboard === 'Results' && <>{results}{searchResults}</>}
        {dashboard === 'Compare' && comparison}
        {dashboard === 'Timeline' && (active && data ? <>{terrainNotice}<ScenarioTimeline
          key={`${active.result.site.id}:${active.result.startMs}:${active.result.endMs}`}
          result={active.result} index={data.index} /></> : <p>Run an analysis to view the timeline and local horizon.</p>)}
      </div>
    </dialog>
    {sources && <Suspense fallback={<div role="status">Loading sources…</div>}><Sources provenance={provenance} provenanceError={provError} ephIndex={data?.index ?? null} sites={data?.sites.sites} focusMethodId={null} onClose={() => setSources(false)} /></Suspense>}
  </div>;
}

function signed(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`; }

function MarkerSummary({ scenario, atLocation, onSelect, onClose }: {
  scenario: Saved; atLocation: Saved[]; onSelect: (id: number) => void; onClose: () => void;
}) {
  const { result, targets } = scenario;
  const { site, series, metrics } = result;
  const time = (entry: Saved) => fmtUtc(entry.result.startMs);

  return <aside className="mission-marker-summary" aria-label="Saved scenario summary">
    <header>
      <strong>{site.short}</strong>
      <button type="button" className="btn small" aria-label="Close marker summary" onClick={onClose}>×</button>
    </header>
    <p className="mono">{coords(result)} <span className="muted">(lat, lon)</span></p>
    {atLocation.length > 1
      ? <label>Saved scenario <select value={scenario.id} onChange={event => onSelect(Number(event.target.value))}>
          {atLocation.map(entry => <option key={entry.id} value={entry.id}>#{entry.id} · {time(entry)}</option>)}
        </select></label>
      : <p>Landing <time dateTime={new Date(result.startMs).toISOString()}>{time(scenario)}</time></p>}
    <p>{Number((metrics.intervalHours / 24).toFixed(3))} days · {assessment(result, targets).good ? 'Meets targets' : 'Below targets'} · {result.terrainAware ? 'LOLA horizon' : 'Flat horizon'}</p>
    <dl>
      <dt>Sunlight</dt><dd>{percent(metrics.sunlitFraction)}</dd>
      <dt>Earth visible</dt><dd>{percent(metrics.earthVisibleFraction)}</dd>
      <dt>Estimated solar energy</dt><dd>{(result.battery.generatedWh / 1000).toFixed(1)} kWh</dd>
    </dl>
    <p className="mission-marker-angles">At landing · azimuth / elevation / horizon clearance</p>
    <dl>
      <dt className="sun-text">Sun</dt>
      <dd>{deg(series.sunAzDeg[0], 1)} / {deg(series.sunElDeg[0], 1)} / {deg(series.sunClearanceDeg[0], 1)}</dd>
      <dt className="earth-text">Earth</dt>
      <dd>{deg(series.earthAzDeg[0], 1)} / {deg(series.earthElDeg[0], 1)} / {deg(series.earthClearanceDeg[0], 1)}</dd>
    </dl>
  </aside>;
}
