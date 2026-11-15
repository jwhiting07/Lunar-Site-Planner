import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadCustomHorizon, loadEphemeris, loadEphemerisIndex, loadHorizon, loadLandingSites, loadProvenance, loadSites } from './data/loader';
import type { LandingSite } from './data/landingSites';
import { analyzeSite, flatHorizon, makeSiteContext, type EphemerisIndex, type EphemerisTable, type HorizonMask, type ProvenanceDoc, type SitesDoc } from './science';
import { assessment, compareCandidates, coordinateSite, dateGrid, distanceKm, durationGrid, DAY, DEFAULT_TARGETS, locationGrid, normalizeLon, searchCandidates, type Candidate, type Point, type Targets } from './science/planner';
import { formatRowValue, summaryRows } from './science/summary';
import { DEFAULT_PARAM_STATE, type ParamState } from './ui/params';
import { ExportMenu, parseDate } from './components/Controls';
import { deg, fmtLat, fmtLon } from './ui/labels';
import { ScenarioDetails, ScenarioTimeline } from './components/ScenarioDetails';
import { UtcClock } from './components/UtcClock';
import { firstDayOnOrAfter, lastDayOnOrBefore, useTimeZone, zoneDate, zoneDayStart } from './ui/timeZone';
import { INITIAL_QUERY, isDiscovery, MissionControls, queryLabels, type MissionQuery } from './components/MissionControls';
import { MissionMatches } from './components/MissionMatches';
import { Chevron } from './components/Chevron';
import { Select } from './components/Select';
import { MoonLoading } from './components/MoonLoading';
import './mission.css';

const Moon = lazy(() => import('./components/MoonView').then(m => ({ default: m.MoonView })));
const Sources = lazy(() => import('./components/ProvenancePanel').then(m => ({ default: m.ProvenancePanel })));
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const coords = (r: Candidate['result']) => `${r.site.lat_deg.toFixed(4)}°, ${r.site.lon_deg.toFixed(4)}°`;
interface Saved extends Candidate { id: number }
const dashboardTabs = ['Results', 'Timeline', 'Compare'] as const;
type DashboardTab = typeof dashboardTabs[number];

export default function MissionPlanner() {
  const [data, setData] = useState<{ sites: SitesDoc; index: EphemerisIndex } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [dataSettled, setDataSettled] = useState(false);
  const [landmarksReady, setLandmarksReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const startupReady = fontsReady && landmarksReady && dataSettled;
  const chromeReady = startupReady && (sceneReady || showPlaceholder);
  const [error, setError] = useState('');
  const [query, setQuery] = useState<MissionQuery>(INITIAL_QUERY);
  const tz = useTimeZone();
  const { lat, lon, duration } = query;
  const [controlsHidden, setControlsHidden] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [targets, setTargets] = useState<Targets>({ ...DEFAULT_TARGETS });
  const [params, setParams] = useState<ParamState>(DEFAULT_PARAM_STATE);
  const [pick, setPick] = useState(false);
  const chooseLandmark = (site: LandingSite) => { setQuery(current => ({ ...current, location: current.location === 'any' ? 'exact' : current.location, lat: String(Number(site.lat_deg.toFixed(6))), lon: String(Number(normalizeLon(site.lon_deg).toFixed(6))) })); setMarkerScenarioId(null); setPick(false); };
  const [landmarks, setLandmarks] = useState<LandingSite[]>([]);
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
  const previousZone = useRef(tz.zone);
  useEffect(() => {
    if (!startupReady || sceneReady) return;
    // Fast loads reveal everything together. Only show a disc for a slower scene.
    const timer = window.setTimeout(() => setShowPlaceholder(true), 400);
    return () => window.clearTimeout(timer);
  }, [startupReady, sceneReady]);
  useEffect(() => {
    let current = true;
    document.fonts.ready.then(() => { if (current) setFontsReady(true); });
    return () => { current = false; };
  }, []);
  // Dates in the controls are calendar days in the display zone: when the zone
  // changes, re-express the same instants so the landing dates stay the same moments.
  useEffect(() => {
    const from = previousZone.current;
    previousZone.current = tz.zone;
    if (from === tz.zone) return;
    const remap = (value: string) => { const t = zoneDayStart(value, from); return t === null ? value : zoneDate(t, tz.zone); };
    setQuery(current => ({ ...current, date: remap(current.date), lastDate: remap(current.lastDate) }));
  }, [tz.zone]);
  const [origin, setOrigin] = useState<Point | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([loadSites(), loadEphemerisIndex()]).then(([sites, index]) => { if (current) setData({ sites, index }); }).catch(e => { if (current) setError(errorText(e)); }).finally(() => { if (current) setDataSettled(true); });
    return () => { current = false; abort.current?.abort(); terrainRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    // Optional layer: the planner works without the catalogue.
    let current = true;
    loadLandingSites().then(doc => { if (current) setLandmarks(doc.sites); }).catch(() => {}).finally(() => { if (current) setLandmarksReady(true); });
    return () => { current = false; };
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
  // Searches without a date look at the current planning window; earlier dates must be chosen explicitly.
  const defaultStart = data ? Date.parse(data.index.default_start_utc ?? data.index.start_utc) : Date.UTC(2026, 0, 1);
  const endCoverage = data ? Date.parse(data.index.stop_utc) : Date.UTC(2029, 0, 1);
  const validDuration = Number.isFinite(Number(duration)) ? Math.max(1 / 24, Math.min(365, Number(duration))) : 1;
  const lastAllowedDate = lastDayOnOrBefore(endCoverage - validDuration * DAY, tz.zone);
  const chosen = useMemo(() => {
    if (query.location === 'any' || lat.trim() === '' || lon.trim() === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return [];
    return [coordinateSite({ lat: Number(lat), lon: Number(lon) }, data?.sites.sites)];
  }, [query.location, lat, lon, data]);
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
        const upgraded = { ...updated, horizonMask: mask };
        setActive({ targets: candidate.targets, result: upgraded });
        // The matches list and the comparison must show the same terrain-based numbers as the open mission.
        const key = signature(candidate);
        const swap = <T extends Candidate>(entry: T): T => signature(entry) === key ? { ...entry, result: upgraded } : entry;
        setOptions(list => list.map(swap));
        setSaved(list => list.map(swap));
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
    setBusy(true); setError(''); setProgress('Loading geometry…');
    setResultsHidden(false);
    try {
      validateTargets();
      const base = alternatives ? active : null;
      const days = base ? (base.result.endMs - base.result.startMs) / DAY : Number(duration);
      const durations = durationGrid(days, !base && query.durationRange ? Number(query.maxDuration) : days);
      const maxDays = Math.max(...durations);
      const start = base ? base.result.startMs : query.landing === 'any' ? defaultStart : parseDate(query.date, tz.zone);
      if (start === null) throw new Error('Enter a valid landing date.');
      const point: Point = base ? { lat: base.result.site.lat_deg, lon: base.result.site.lon_deg } : query.location === 'any' ? { lat: 0, lon: 0 } : { lat: Number(lat), lon: Number(lon) };
      if (!base) setOrigin(query.location === 'any' ? null : point);
      if (query.location !== 'any' && !chosen.length && !base) throw new Error('Enter latitude from −90 to 90 and longitude from −180 to 180, or choose on the Moon.');
      const target = base ? base.targets : { ...targets };
      const lander = base ? base.result.params : { ...params.lander };
      const clearance = base ? base.result.earthMinClearanceDeg : params.earthMinClearanceDeg;
      if (base || isDiscovery(query)) {
        const km = base ? 50 : query.location === 'nearby' ? Number(query.radius) : null;
        if (km !== null && (!Number.isFinite(km) || km <= 0 || km > 1000)) throw new Error('Search radius must be greater than 0 and at most 1,000 km.');
        const first = base ? Math.max(startCoverage, start - 7 * DAY) : start;
        const last = base ? Math.min(endCoverage - days * DAY, start + 7 * DAY) : query.landing === 'any' ? endCoverage - days * DAY : query.landing === 'range' ? parseDate(query.lastDate, tz.zone) : start;
        if (last === null || first < startCoverage || last + days * DAY > endCoverage || last < first) throw new Error(`The landing range and full mission must fit within ${utcDay(startCoverage)} and ${utcDay(endCoverage)} UTC.`);
        let points = !base && query.location === 'exact' ? [point] : locationGrid(point, km);
        // An unrestricted search also checks the shipped terrain sites, so polar matches can use real LOLA terrain.
        if (!base && query.location === 'any') points = [...points, ...data.sites.sites.filter(s => s.terrain_aware).map(s => ({ lat: s.lat_deg, lon: normalizeLon(s.lon_deg) }))];
        const dates = dateGrid(first, last);
        if (base) points = [point];
        const eph = await loadEphemeris(data.index, first, Math.min(endCoverage, last + maxDays * DAY));
        for (const s of data.sites.sites) await getMask(s);
        const known = data.sites.sites;
        const customBase = base?.result.horizonMask?.terrainAware && !base.result.site.horizon.file ? base.result : null;
        const searchMasks = new Map(masks.current);
        if (customBase?.horizonMask) searchMasks.set(customBase.site.id, customBase.horizonMask);
        const config = { points, dates, durationDays: days, durationsDays: durations, coverageEndMs: endCoverage, targets: target, lander, clearance, origin: !base && query.location === 'any' ? null : point, startMs: start,
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
        if (start < startCoverage || start + days * DAY > endCoverage) throw new Error(`The full mission must fit within ${utcDay(startCoverage)} and ${utcDay(endCoverage)} UTC.`);
        const site = coordinateSite(point, data.sites.sites);
        const [eph, mask] = await Promise.all([
          loadEphemeris(data.index, start, start + days * DAY),
          getMask(site),
        ]);
        if (controller.signal.aborted) return;
        const result = analyzeSite(makeSiteContext(site, data.sites.observer_height_m, mask), eph, {
          startMs: start, endMs: start + days * DAY, params: lander, earthMinClearanceDeg: clearance,
        });
        setOptions([]); setSearchNote(''); setSearchSummary('');
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
  // Reset: everything the matches panel shows, or just the compared scenarios.
  const resetMatches = () => {
    abort.current?.abort();
    stopTerrain();
    setOptions([]); setActive(null); setSaved([]); setOrigin(null);
    setSearchNote(''); setSearchSummary(''); setError('');
    setMarkerScenarioId(null); setDashboard(null);
    setQuery(INITIAL_QUERY); // also drops the entered location, so its marker goes too
  };
  const resetComparison = () => { setSaved([]); setMarkerScenarioId(null); };
  const verdict = active ? assessment(active.result, active.targets) : null;
  const terrainPending = terrainStatus === 'pending';
  const terrainNotice = terrainStatus && <p className="mission-terrain-status" role="status">
    {terrainPending ? 'Preview using a flat horizon. Results and the skyline will update when terrain is ready.'
      : terrainStatus === 'uncovered' ? 'LOLA terrain covers 60°S–90°S only. This location has no terrain data, so results use a flat horizon.'
        : 'The terrain calculator is not running, so results use a flat horizon. It needs the LOLA rasters and the Python environment: run "python scripts/fetch_sources.py" once, then restart "npm run dev". The shipped sites always include terrain.'}
    {terrainStatus === 'unavailable' && active && data && <>
      {' '}<button type="button" className="btn small" onClick={() => showResult(active, data.index)}>Retry terrain</button>
    </>}
  </p>;

  const advanced = <>
            <div className="mission-fields"><label>Minimum sunlight (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.sunlight) ? '' : targets.sunlight} onChange={e => setTargets(t => ({ ...t, sunlight: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label><label>Minimum Earth visible (%)<input type="number" required min="0" max="100" step="any" value={Number.isNaN(targets.earth) ? '' : targets.earth} onChange={e => setTargets(t => ({ ...t, earth: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label></div>
            <div className="mission-fields"><label>Max. darkness (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxDarkHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxDarkHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label><label>Max. blackout (h)<input type="number" min="0" step="any" placeholder="No limit" value={targets.maxBlackoutHours ?? ''} onChange={e => setTargets(t => ({ ...t, maxBlackoutHours: e.target.value === '' ? null : Number(e.target.value) }))} /></label></div>
            <label>Earth clearance (°)<input type="number" required min="0" max="60" step="any" value={params.earthMinClearanceDeg} onChange={e => setParams(p => ({ ...p, earthMinClearanceDeg: Number(e.target.value) }))} /></label>
            <fieldset className="mission-power"><legend>Power estimate</legend><div className="mission-fields">{([{ key: 'panelAreaM2', label: 'Panel area (m²)' }, { key: 'panelEfficiency', label: 'Efficiency (0–1)', max: 1 }, { key: 'loadW', label: 'Load (W)' }, { key: 'batteryCapacityWh', label: 'Battery (Wh)' }] as const).map(f => <label key={f.key}>{f.label}<input type="number" required min="0" max={'max' in f ? f.max : undefined} step="any" value={params.lander[f.key]} onChange={e => setParams(p => ({ ...p, lander: { ...p.lander, [f.key]: Number(e.target.value) } }))} /></label>)}</div><div className="mission-select-field"><span>Panel pointing</span><Select label="Panel pointing" value={params.lander.panelMode} options={[{ value: 'tracking', label: 'Sun tracking' }, { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]} onChange={panelMode => setParams(p => ({ ...p, lander: { ...p.lander, panelMode } }))} /></div></fieldset>
  </>;

  const results = active && verdict ? <>
          <div className="mission-verdict"><strong className={verdict.good ? 'mission-good' : 'mission-bad'}>{verdict.good ? 'Meets targets' : 'Doesn’t meet targets'}</strong><span>{active.result.terrainAware ? 'Terrain included' : 'Flat-horizon estimate'}</span></div>
          {terrainNotice}
          <p className="mission-result-coords">{coords(active.result)} · {tz.dateTime(active.result.startMs)} · {(active.result.metrics.intervalHours / 24).toFixed(2).replace(/\.00$/, '')} days</p>
          {origin && <p className="mission-distance"><span>Distance from entered location</span><strong className="mono">{distanceKm(origin, { lat: active.result.site.lat_deg, lon: active.result.site.lon_deg }).toFixed(1)} km</strong></p>}
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
      {!!saved.length && <div className="mission-compare-bar"><label className="mission-check"><input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} />Detailed</label><button type="button" className="btn small" onClick={resetComparison}>Reset</button></div>}
      {!saved.length ? <p>Select scenarios in the results to compare.</p> : <div className="mission-table-scroll"><table><thead><tr><th scope="col">Scenario</th>{saved.map((c, i) => <th scope="col" key={c.id}><button className="mission-scenario" onClick={() => { use(c, data?.index); setDashboard('Results'); }}>Scenario {i + 1} ↗</button><button className="mission-remove" aria-label={`Remove scenario ${i + 1}`} onClick={() => setSaved(s => s.filter(x => x.id !== c.id))}>×</button></th>)}</tr></thead><tbody>
        {([
          ['Location (lat, lon)', (c: Saved) => coords(c.result)], [`Landing (${tz.label})`, (c: Saved) => tz.dateTime(c.result.startMs)], ['Duration', (c: Saved) => `${c.result.metrics.intervalHours / 24} days`],
          ['Sunlight', (c: Saved) => percent(c.result.metrics.sunlitFraction)], ['Earth visible', (c: Saved) => percent(c.result.metrics.earthVisibleFraction)],
          ['Result', (c: Saved) => assessment(c.result, c.targets).good ? 'Meets targets' : 'Below targets'], ['Model', (c: Saved) => c.result.terrainAware ? 'Terrain included' : 'Flat horizon'],
        ] as [string, (c: Saved) => string][]).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{saved.map(c => <td key={c.id}>{value(c)}</td>)}</tr>)}
        {detailed && <><tr><th scope="row">Targets: sun / Earth</th>{saved.map(c => <td key={c.id}>{c.targets.sunlight}% / {c.targets.earth}%</td>)}</tr><tr><th scope="row">Limits: darkness / blackout</th>{saved.map(c => <td key={c.id}>{c.targets.maxDarkHours ?? '—'} / {c.targets.maxBlackoutHours ?? '—'} h</td>)}</tr><tr><th scope="row">Earth clearance</th>{saved.map(c => <td key={c.id}>{c.result.earthMinClearanceDeg}°</td>)}</tr>{summaryRows(saved[0].result).filter(r => !['sunlit_pct', 'earth_pct'].includes(r.key)).map(row => <tr key={row.key}><th scope="row">{row.label}</th>{saved.map(c => { const r = summaryRows(c.result).find(r => r.key === row.key)!; return <td key={c.id}>{formatRowValue(r)} {r.unit}</td>; })}</tr>)}<tr><th scope="row">Power assumptions</th>{saved.map(c => <td key={c.id}>{c.result.params.panelAreaM2} m² · {Number((c.result.params.panelEfficiency * 100).toFixed(4))}% · {c.result.params.loadW} W · {c.result.params.batteryCapacityWh} Wh · {c.result.params.panelMode}</td>)}</tr></>}
      </tbody></table></div>}
      {!!saved.length && <ExportMenu results={saved.map(c => c.result)} primaryId={saved[0].result.site.id} provenance={provenance} targets={saved.map(c => c.targets)} />}
  </div>;

  const displayed = options.length ? options : active ? [active] : [];
  return <div className={`mission-app${chromeReady ? ' mission-ready' : ''}`}>
    <header className="mission-top">
      <h1>Lunar Landing Site Navigator</h1>
      <button className="mission-text-button mission-toggle" aria-expanded={!controlsHidden} aria-controls="mission-controls" onClick={() => setControlsHidden(hidden => !hidden)}>Controls<Chevron /></button>
    </header>
    <MissionControls query={query} onChange={setQuery} sites={data?.sites.sites ?? []} landmarks={landmarks} firstDate={firstDayOnOrAfter(startCoverage, tz.zone)} anyFirstDate={firstDayOnOrAfter(defaultStart, tz.zone)} lastDate={lastAllowedDate} zoneLabel={tz.label}
      busy={busy} ready={Boolean(data)} collapsed={controlsHidden}
      onRun={() => void run()} onPick={() => { setPick(true); setDashboard(null); }} advanced={advanced} />
    <main className="mission-workspace">
      <section className="mission-canvas" aria-label="Moon"><div className="mission-map">
        {(busy || error || pick) && <div className="mission-feedback" role={error ? 'alert' : 'status'}>
      <span>{error || (busy ? progress : 'Click the Moon to choose coordinates. Drag to rotate; Enter selects the center.')}</span>
      {busy && <button className="mission-text-button" onClick={() => abort.current?.abort()}>Cancel search</button>}
      {pick && <button className="mission-text-button" onClick={() => setPick(false)}>Cancel selection</button>}
      {error && <button className="mission-icon-button" aria-label="Dismiss error" onClick={() => setError('')}>×</button>}
    </div>}
        <Suspense fallback={<MoonLoading showPlaceholder={showPlaceholder} chromeReady={chromeReady} />}>
          <Moon compact explorer startupReady={startupReady} showPlaceholder={showPlaceholder} chromeReady={chromeReady} onLoadComplete={() => setSceneReady(true)} landmarks={landmarks} onLandmark={chooseLandmark} idleRotate={mapSites.length === 0 && !pick} sites={mapSites} markerLabels={markerLabels} savedSiteIds={savedSiteIds} primaryId={markerSiteId ?? (query.location !== 'any' ? chosen[0]?.id : undefined) ?? active?.result.site.id ?? ''} onSelect={selectMarker}
            onPick={pick && !busy ? point => { setQuery(current => ({ ...current, location: current.location === 'any' ? 'exact' : current.location, lat: point.lat.toFixed(6), lon: point.lon.toFixed(6) })); setMarkerScenarioId(null); setPick(false); } : undefined} />
        </Suspense>
        {markerScenario && <MarkerSummary scenario={markerScenario} atLocation={markerDates} onSelect={setMarkerScenarioId} onClose={() => setMarkerScenarioId(null)} />}
      </div></section>
      {(displayed.length > 0 || searchNote) && <MissionMatches candidates={displayed} active={active} note={searchNote} summary={searchSummary}
        hidden={resultsHidden} onToggle={() => setResultsHidden(hidden => !hidden)}
        isSaved={inComparison} savedCount={saved.length} pending={terrainPending && !options.length}
        onCompare={() => { openedFromCompare.current = true; setDashboard('Compare'); }} compareRef={compareTrigger} onReset={resetMatches}
        reference={origin ? { point: origin, label: 'entered location' } : active ? { point: { lat: active.result.site.lat_deg, lon: active.result.site.lon_deg }, label: 'open mission' } : null}
        onCompareChange={(candidate, checked) => { if (checked) add(candidate); else setSaved(current => current.filter(entry => signature(entry) !== signature(candidate))); }}
        onOpen={(candidate, trigger) => { dashboardTrigger.current = trigger; openedFromCompare.current = false; use(candidate, data?.index); setDashboard('Results'); }}
        />}
    </main>
    <footer className="mission-footer"><button className="mission-text-button" onClick={() => setSources(true)}>Sources &amp; methods</button><span>NASA LOLA · SPICE DE440</span><UtcClock /></footer>
    <dialog ref={dialog} className="mission-dashboard" aria-label="Mission details" onCancel={event => { event.preventDefault(); setDashboard(null); }}>
      <header className="mission-dialog-bar"><div><h2>Mission details</h2>{active && <p className="mission-dialog-sub mono">{fmtLat(active.result.site.lat_deg)} / {fmtLon(active.result.site.lon_deg)}</p>}</div><button className="mission-icon-button" aria-label="Close mission details" onClick={() => setDashboard(null)}>×</button></header>
      <div className="mission-dashboard-tabs" role="group" aria-label="Analysis views">
        {dashboardTabs.map(tab => <button key={tab} className="mission-text-button" aria-pressed={dashboard === tab} onClick={() => setDashboard(tab)}>{tab}</button>)}
      </div>
      <div className="mission-dashboard-content">
        {dashboard === 'Results' && <>{results}</>}
        {dashboard === 'Compare' && comparison}
        {dashboard === 'Timeline' && (data ? <TimelinePanel active={active} saved={saved} signature={signature} index={data.index} notice={terrainNotice} terrain={terrainStatus}
          onChoose={id => { const entry = saved.find(item => String(item.id) === id); if (entry) use(entry, data.index); }} onCompare={() => setDashboard('Compare')} /> : <p>Loading…</p>)}
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
  const tz = useTimeZone();
  const time = (entry: Saved) => tz.dateTime(entry.result.startMs);

  return <aside className="mission-marker-summary" aria-label="Saved scenario summary">
    <header>
      <strong>{site.short}</strong>
      <button type="button" className="btn small" aria-label="Close marker summary" onClick={onClose}>×</button>
    </header>
    <p className="mono">{coords(result)} <span className="muted">(lat, lon)</span></p>
    {atLocation.length > 1
      ? <div className="mission-select-field"><span>Saved scenario</span><Select label="Saved scenario" value={scenario.id} options={atLocation.map(entry => ({ value: entry.id, label: '#' + entry.id + ' · ' + time(entry) }))} onChange={onSelect} /></div>
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

/** Timeline of the open mission; the compared missions can be switched in from the selector. */
function TimelinePanel({ active, saved, signature, onChoose, onCompare, index, notice, terrain }: {
  active: Candidate | null; saved: Saved[]; signature: (candidate: Candidate) => string; onChoose: (value: string) => void; onCompare: () => void;
  index: EphemerisIndex; notice: ReactNode; terrain: 'pending' | 'uncovered' | 'unavailable' | null;
}) {
  const tz = useTimeZone();
  if (!active) return <p>Run an analysis to view the timeline and local horizon.</p>;
  const describe = (candidate: Candidate) => coords(candidate.result) + ' · ' + tz.date(candidate.result.startMs) + ' · ' + Number((candidate.result.metrics.intervalHours / 24).toFixed(3)) + ' d';
  const match = saved.find(entry => signature(entry) === signature(active));
  const options = [
    ...(match ? [] : [{ value: 'open', label: 'Open mission · ' + describe(active) }]),
    ...saved.map((entry, i) => ({ value: String(entry.id), label: 'Scenario ' + (i + 1) + ' · ' + describe(entry) })),
  ];
  return <>
    {saved.length > 0 && <div className="tl-mission-row">
      <div className="mission-select-field mission-timeline-pick"><span>Compared missions</span>
        <Select label="Mission on timeline" value={match ? String(match.id) : 'open'} options={options} onChange={value => { if (value !== 'open') onChoose(value); }} /></div>
      <button type="button" className="btn small" onClick={onCompare}>Compare table</button>
    </div>}
    {notice}
    <ScenarioTimeline key={active.result.site.id + ':' + active.result.startMs + ':' + active.result.endMs} result={active.result} index={index} terrain={terrain} />
  </>;
}
