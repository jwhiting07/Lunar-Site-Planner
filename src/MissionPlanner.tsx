import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { loadCustomHorizon, loadEphemeris, loadEphemerisIndex, loadHorizon, loadProvenance, loadSites } from './data/loader';
import { analyzeSite, flatHorizon, makeSiteContext, type EphemerisIndex, type EphemerisTable, type HorizonMask, type ProvenanceDoc, type SitesDoc } from './science';
import { assessment, compareCandidates, coordinateSite, dateGrid, durationGrid, DAY, DEFAULT_TARGETS, locationGrid, normalizeLon, searchCandidates, type Candidate, type Point, type Targets } from './science/planner';
import { formatRowValue, summaryRows } from './science/summary';
import { DEFAULT_PARAM_STATE, type ParamState } from './ui/params';
import { ExportMenu, parseDate } from './components/Controls';
import { deg, fmtUtc, isoDate } from './ui/labels';
import { ScenarioDetails, ScenarioTimeline } from './components/ScenarioDetails';
import { UtcClock } from './components/UtcClock';
import { INITIAL_QUERY, isDiscovery, MissionControls, queryLabels, type MissionQuery } from './components/MissionControls';
import { MissionMatches } from './components/MissionMatches';
import './mission.css';

const Moon = lazy(() => import('./components/MoonView').then(m => ({ default: m.MoonView })));
const Sources = lazy(() => import('./components/ProvenancePanel').then(m => ({ default: m.ProvenancePanel })));
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const coords = (r: Candidate['result']) => `${r.site.lat_deg.toFixed(4)}°, ${r.site.lon_deg.toFixed(4)}°`;
interface Saved extends Candidate { id: number }
const dashboardTabs = ['Results', 'Timeline', 'Terrain', 'Compare'] as const;
type DashboardTab = typeof dashboardTabs[number];

export default function MissionPlanner() {
  const [data, setData] = useState<{ sites: SitesDoc; index: EphemerisIndex } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState<MissionQuery>(INITIAL_QUERY);
  const { lat, lon, duration } = query;
  const [controlsHidden, setControlsHidden] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [targets, setTargets] = useState<Targets>({ ...DEFAULT_TARGETS });
  const [params, setParams] = useState<ParamState>(DEFAULT_PARAM_STATE);
  const [pick, setPick] = useState(false);
  const [active, setActive] = useState<Candidate | null>(null);
  const [terrainStatus, setTerrainStatus] = useState<'pending' | 'uncovered' | 'unavailable' | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [markerScenarioId, setMarkerScenarioId] = useState<number | null>(null);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [searchNote, setSearchNote] = useState('');
  const [searchSummary, setSearchSummary] = useState('');
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
  const missionToggle = useRef<HTMLButtonElement>(null);

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
    for (const candidate of options) sites.set(candidate.result.site.id, candidate.result.site);
    if (active) sites.set(active.result.site.id, active.result.site);
    for (const site of chosen) sites.set(site.id, site);
    return [...sites.values()];
  }, [savedSites, chosen, options, active]);
  const markerLabels = useMemo(() => new Map(mapSites.map((site, index) => {
    const candidateIndex = options.findIndex(candidate => candidate.result.site.id === site.id);
    return [site.id, site.short === 'Selected location' ? 'Site ' + (candidateIndex >= 0 ? candidateIndex + 1 : index + 1) : site.short];
  })), [mapSites, options]);
  const markerScenario = saved.find(entry => entry.id === markerScenarioId);
  const markerSiteId = markerScenario?.result.site.id;
  const markerDates = saved.filter(entry => entry.result.site.id === markerSiteId);

  const selectMarker = (siteId: string) => {
    const scenario = saved.find(entry => entry.result.site.id === siteId);
    setMarkerScenarioId(scenario?.id ?? null);
    if (!scenario) {
      const candidate = options.find(entry => entry.result.site.id === siteId);
      if (candidate) { showResult(candidate, data?.index); setDashboard('Results'); }
    }
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
    const lander = params.lander;
    if (![lander.panelAreaM2, lander.panelEfficiency, lander.loadW, lander.batteryCapacityWh].every(value => Number.isFinite(value) && value >= 0)
      || lander.panelEfficiency > 1) throw new Error('Check the power assumptions. Efficiency must be between 0 and 1; power values cannot be negative.');
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
    setResultsHidden(false); setSearchSummary('');
    try {
      validateTargets();
      const base = alternatives ? active : null;
      const days = base ? (base.result.endMs - base.result.startMs) / DAY : Number(duration);
      const durations = durationGrid(days, !base && query.durationRange ? Number(query.maxDuration) : days);
      const maxDays = Math.max(...durations);
      const start = base ? base.result.startMs : query.landing === 'any' ? startCoverage : parseDate(query.date);
      if (start === null) throw new Error('Enter a valid landing date.');
      const point: Point = base ? { lat: base.result.site.lat_deg, lon: base.result.site.lon_deg } : query.location === 'any' ? { lat: 0, lon: 0 } : { lat: Number(lat), lon: Number(lon) };
      if (query.location !== 'any' && !chosen.length && !base) throw new Error('Enter latitude from −90 to 90 and longitude from −180 to 180, or choose on the Moon.');
      const target = base ? base.targets : { ...targets };
      const lander = base ? base.result.params : { ...params.lander };
      const clearance = base ? base.result.earthMinClearanceDeg : params.earthMinClearanceDeg;
      if (base || isDiscovery(query)) {
        const km = base ? 50 : query.location === 'nearby' ? Number(query.radius) : null;
        if (km !== null && (!Number.isFinite(km) || km <= 0 || km > 1000)) throw new Error('Search radius must be greater than 0 and at most 1,000 km.');
        const first = base ? Math.max(startCoverage, start - 7 * DAY) : start;
        const last = base ? Math.min(endCoverage - days * DAY, start + 7 * DAY) : query.landing === 'any' ? endCoverage - days * DAY : query.landing === 'range' ? parseDate(query.lastDate) : start;
        if (last === null || first < startCoverage || last + days * DAY > endCoverage || last < first) throw new Error('The landing range and full mission must fit within 2026–2028.');
        let points = !base && query.location === 'exact' ? [point] : locationGrid(point, km);
        const dates = dateGrid(first, last);
        if (base) points = [point];
        const eph = await loadEphemeris(data.index, first, Math.min(endCoverage, last + maxDays * DAY));
        for (const s of data.sites.sites) await getMask(s);
        const known = data.sites.sites;
        const customBase = base?.result.horizonMask?.terrainAware && !base.result.site.horizon.file ? base.result : null;
        const searchMasks = new Map(masks.current);
        if (customBase?.horizonMask) searchMasks.set(customBase.site.id, customBase.horizonMask);
        const config = { points, dates, durationDays: days, durationsDays: durations, coverageEndMs: endCoverage, targets: target, lander, clearance, origin: point, startMs: start,
          known: customBase ? [...known, customBase.site] : known,
          observerHeight: data.sites.observer_height_m, masks: searchMasks };
        const update = (done: number, total: number) => setProgress(`Checking ${done} / ${total}…`);
        let found = await searchCandidates(eph, config, controller.signal, update);
        let count = points.length * dates.reduce((total, date) => total + durations.filter(length => date + length * DAY <= endCoverage).length, 0);
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
        if (base) setDashboard(null);
        setSearchNote(base ? `${count} nearby scenarios checked: dates within 7 days or locations within 50 km. ${found.length ? '' : 'No better option found in these samples.'}` : `${count} sampled scenarios checked. ${found.some(c => assessment(c.result, c.targets).good) ? 'Best sampled matches shown.' : 'No sampled scenario meets every target; closest matches shown.'}`);
        const labels = queryLabels(query);
        setSearchSummary(base ? 'Nearby dates and locations · ' + days + ' days' : labels.location + ' · ' + labels.landing + ' · ' + labels.duration);
        if (!base && found[0]) showResult(found[0], data.index, eph);
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
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { if (abort.current === controller) { setBusy(false); setProgress(''); } }
  }

  const signature = (c: Candidate) => JSON.stringify([c.result.site.id, c.result.startMs, c.result.endMs, c.targets, c.result.params, c.result.earthMinClearanceDeg]);
  const inComparison = (c: Candidate) => saved.some(s => signature(s) === signature(c));
  const add = (candidate: Candidate) => { if (saved.length < 12 && !inComparison(candidate)) setSaved(s => [...s, { ...candidate, id: ++sequence.current }]); };
  const use = (candidate: Candidate, index?: EphemerisIndex, eph?: EphemerisTable) => {
    showResult(candidate, index, eph);
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

  const advanced = <>
            <div className="mission-fields"><label>Minimum sunlight (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.sunlight) ? '' : targets.sunlight} onChange={e => setTargets(t => ({ ...t, sunlight: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label><label>Minimum Earth visible (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.earth) ? '' : targets.earth} onChange={e => setTargets(t => ({ ...t, earth: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label></div>
            <div className="mission-fields"><label>Max. darkness (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxDarkHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxDarkHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label><label>Max. blackout (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxBlackoutHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxBlackoutHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label></div>
            <label>Earth clearance (°)<input type="number" required min="0" max="60" step="any" value={params.earthMinClearanceDeg} onChange={e => setParams(p => ({ ...p, earthMinClearanceDeg: Number(e.target.value) }))} /></label>
            <fieldset className="mission-power"><legend>Power estimate</legend><div className="mission-fields">{([{ key: 'panelAreaM2', label: 'Panel area (m²)' }, { key: 'panelEfficiency', label: 'Efficiency (0–1)', max: 1 }, { key: 'loadW', label: 'Load (W)' }, { key: 'batteryCapacityWh', label: 'Battery (Wh)' }] as const).map(f => <label key={f.key}>{f.label}<input type="number" required min="0" max={'max' in f ? f.max : undefined} step="any" value={params.lander[f.key]} onChange={e => setParams(p => ({ ...p, lander: { ...p.lander, [f.key]: Number(e.target.value) } }))} /></label>)}</div><label>Panel pointing<select value={params.lander.panelMode} onChange={e => setParams(p => ({ ...p, lander: { ...p.lander, panelMode: e.target.value as ParamState['lander']['panelMode'] } }))}><option value="tracking">Sun tracking</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label></fieldset>
  </>;

  const results = active && verdict ? <>
          <div className="mission-verdict"><strong className={verdict.good ? 'mission-good' : 'mission-bad'}>{verdict.good ? 'Meets targets' : 'Doesn’t meet targets'}</strong><span>{active.result.terrainAware ? 'Terrain included' : 'Flat-horizon estimate'}</span></div>
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

  const comparison = <div className="mission-comparison">
      {!!saved.length && <label className="mission-check"><input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} />Detailed</label>}
      {!saved.length ? <p>Select scenarios in the results to compare.</p> : <div className="mission-table-scroll"><table><thead><tr><th scope="col">Scenario</th>{saved.map((c, i) => <th scope="col" key={c.id}><button className="mission-scenario" onClick={() => { use(c); setDashboard('Results'); }}>Scenario {i + 1} ↗</button><button className="mission-remove" aria-label={`Remove scenario ${i + 1}`} onClick={() => setSaved(s => s.filter(x => x.id !== c.id))}>×</button></th>)}</tr></thead><tbody>
        {([
          ['Location (lat, lon)', (c: Saved) => coords(c.result)], ['Landing (UTC)', (c: Saved) => isoDate(c.result.startMs)], ['Duration', (c: Saved) => `${c.result.metrics.intervalHours / 24} days`],
          ['Sunlight', (c: Saved) => percent(c.result.metrics.sunlitFraction)], ['Earth visible', (c: Saved) => percent(c.result.metrics.earthVisibleFraction)],
          ['Result', (c: Saved) => assessment(c.result, c.targets).good ? 'Meets targets' : 'Below targets'], ['Model', (c: Saved) => c.result.terrainAware ? 'Terrain included' : 'Flat horizon'],
        ] as [string, (c: Saved) => string][]).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{saved.map(c => <td key={c.id}>{value(c)}</td>)}</tr>)}
        {detailed && <><tr><th scope="row">Targets: sun / Earth</th>{saved.map(c => <td key={c.id}>{c.targets.sunlight}% / {c.targets.earth}%</td>)}</tr><tr><th scope="row">Limits: darkness / blackout</th>{saved.map(c => <td key={c.id}>{c.targets.maxDarkHours ?? '—'} / {c.targets.maxBlackoutHours ?? '—'} h</td>)}</tr><tr><th scope="row">Earth clearance</th>{saved.map(c => <td key={c.id}>{c.result.earthMinClearanceDeg}°</td>)}</tr>{summaryRows(saved[0].result).filter(r => !['sunlit_pct', 'earth_pct'].includes(r.key)).map(row => <tr key={row.key}><th scope="row">{row.label}</th>{saved.map(c => { const r = summaryRows(c.result).find(r => r.key === row.key)!; return <td key={c.id}>{formatRowValue(r)} {r.unit}</td>; })}</tr>)}<tr><th scope="row">Power assumptions</th>{saved.map(c => <td key={c.id}>{c.result.params.panelAreaM2} m² · {Number((c.result.params.panelEfficiency * 100).toFixed(4))}% · {c.result.params.loadW} W · {c.result.params.batteryCapacityWh} Wh · {c.result.params.panelMode}</td>)}</tr></>}
      </tbody></table></div>}
      {!!saved.length && <ExportMenu results={saved.map(c => c.result)} primaryId={saved[0].result.site.id} provenance={provenance} targets={saved.map(c => c.targets)} />}
  </div>;

  const displayed = options.length ? options : active ? [active] : [];
  return <div className="mission-app">
    <header className="mission-top">
      <h1>Lunar Landing Site Navigator</h1>
      {controlsHidden && <button ref={missionToggle} className="mission-text-button mission-reopen" aria-expanded="false" aria-controls="mission-controls" onClick={() => setControlsHidden(false)}>⌄ Mission</button>}
      <button ref={compareTrigger} className="mission-text-button mission-compare" aria-haspopup="dialog" onClick={() => { openedFromCompare.current = true; setDashboard('Compare'); }}>Compare{saved.length ? ' (' + saved.length + ')' : ''}</button>
    </header>
    <MissionControls query={query} onChange={setQuery} sites={data?.sites.sites ?? []} firstDate={isoDate(startCoverage)} lastDate={lastAllowedDate}
      busy={busy} ready={Boolean(data)} collapsed={controlsHidden} onCollapse={() => { setControlsHidden(true); requestAnimationFrame(() => missionToggle.current?.focus()); }}
      onRun={() => void run()} onPick={() => { setPick(true); setDashboard(null); }} advanced={advanced} />
    {(busy || error || pick) && <div className="mission-feedback" role={error ? 'alert' : 'status'}>
      <span>{error || (busy ? progress : 'Click the Moon to choose coordinates. Drag to rotate; Enter selects the center.')}</span>
      {busy && <button className="mission-text-button" onClick={() => abort.current?.abort()}>Cancel search</button>}
      {pick && <button className="mission-text-button" onClick={() => setPick(false)}>Cancel selection</button>}
      {error && <button className="mission-icon-button" aria-label="Dismiss error" onClick={() => setError('')}>×</button>}
    </div>}
    <main className="mission-workspace">
      <section className="mission-canvas" aria-label="Moon"><div className="mission-map">
        <Suspense fallback={<div className="view-loading" role="status">Loading Moon…</div>}>
          <Moon compact explorer sites={mapSites} markerLabels={markerLabels} savedSiteIds={savedSiteIds} primaryId={markerSiteId ?? (query.location !== 'any' ? chosen[0]?.id : undefined) ?? active?.result.site.id ?? ''} onSelect={selectMarker}
            onPick={pick && !busy ? point => { setQuery(current => ({ ...current, location: current.location === 'any' ? 'exact' : current.location, lat: point.lat.toFixed(6), lon: point.lon.toFixed(6) })); setMarkerScenarioId(null); setPick(false); } : undefined} />
        </Suspense>
        {markerScenario && <MarkerSummary scenario={markerScenario} atLocation={markerDates} onSelect={setMarkerScenarioId} onClose={() => setMarkerScenarioId(null)} />}
      </div></section>
      {(displayed.length > 0 || searchNote) && <MissionMatches candidates={displayed} active={active} note={searchNote} summary={searchSummary}
        hidden={resultsHidden} onToggle={() => setResultsHidden(hidden => !hidden)}
        isSaved={inComparison} savedCount={saved.length} pending={terrainPending && !options.length}
        onCompareChange={(candidate, checked) => { if (checked) add(candidate); else setSaved(current => current.filter(entry => signature(entry) !== signature(candidate))); }}
        onOpen={(candidate, trigger) => { dashboardTrigger.current = trigger; openedFromCompare.current = false; use(candidate, data?.index); setDashboard('Results'); }}
        />}
    </main>
    <footer className="mission-footer"><button className="mission-text-button" onClick={() => setSources(true)}>Sources &amp; methods</button><span>NASA LOLA · SPICE DE440</span><UtcClock /></footer>
    <dialog ref={dialog} className="mission-dashboard" aria-label="Mission details" onCancel={event => { event.preventDefault(); setDashboard(null); }}>
      <header className="mission-dialog-bar"><h2>Mission details</h2><button className="mission-icon-button" aria-label="Close mission details" onClick={() => setDashboard(null)}>×</button></header>
      <div className="mission-dashboard-tabs" role="group" aria-label="Analysis views">
        {dashboardTabs.map(tab => <button key={tab} className="mission-text-button" aria-pressed={dashboard === tab} onClick={() => setDashboard(tab)}>{tab}</button>)}
      </div>
      <div className="mission-dashboard-content">
        {dashboard === 'Results' && <>{results}{active && <button className="mission-text-button mission-use" onClick={() => {
          setQuery(current => ({ ...current, location: 'exact', lat: String(active.result.site.lat_deg), lon: String(normalizeLon(active.result.site.lon_deg)), landing: 'exact', date: isoDate(active.result.startMs), duration: String(active.result.metrics.intervalHours / 24), durationRange: false }));
          setControlsHidden(false); setDashboard(null);
        }}>Use this mission in controls ↗</button>}</>}
        {dashboard === 'Compare' && comparison}
        {(dashboard === 'Timeline' || dashboard === 'Terrain') && (active && data ? <>{terrainNotice}<ScenarioTimeline
          key={active.result.site.id + ':' + active.result.startMs + ':' + active.result.endMs}
          result={active.result} index={data.index} view={dashboard === 'Terrain' ? 'terrain' : 'timeline'} /></> : <p>Run an analysis to view the timeline and local horizon.</p>)}
      </div>
    </dialog>
    {sources && <Suspense fallback={<div role="status">Loading sources…</div>}><Sources provenance={provenance} provenanceError={provError} ephIndex={data?.index ?? null} sites={data?.sites.sites} focusMethodId={null} onClose={() => setSources(false)} /></Suspense>}
  </div>;
}

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
