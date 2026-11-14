import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeSite,
  flatHorizon,
  instantState,
  makeSiteContext,
  tableEndMs,
  HOUR_MS,
  type AnalysisResult,
  type EphemerisIndex,
  type EphemerisTable,
  type HorizonMask,
  type ProvenanceDoc,
  type SitesDoc,
} from './science';
import { loadEphemeris, loadEphemerisIndex, loadHorizon, loadProvenance, loadSites } from './data/loader';
import { clamp } from './ui/labels';
import { SiteFacts } from './components/SiteFacts';
import { TerrainView } from './components/TerrainView';
import { MoonView } from './components/MoonView';
import { SkyView } from './components/SkyView';
import { TimelinesPanel, TimeControls } from './components/Timelines';
import { MetricSummary } from './components/MetricSummary';
import { ParamsPanel, DEFAULT_PARAM_STATE, type ParamState } from './components/ParamsPanel';
import { Comparison } from './components/Comparison';
import { ProvenancePanel } from './components/ProvenancePanel';
import { DateRange, ExportMenu } from './components/Controls';
import { PlanningToolsDialog, type PlanningTool } from './components/PlanningToolsDialog';
import { isoDate } from './ui/labels';
import './planning.css';

const MAX_SITES = 3;
const DEFAULT_START = Date.UTC(2026, 11, 1);
const DEFAULT_END = Date.UTC(2027, 2, 1);

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export default function PlanningView({ selectedSiteId, onSelectSite }: { selectedSiteId: string; onSelectSite: (id: string) => void }) {
  const [sitesDoc, setSitesDoc] = useState<SitesDoc | null>(null);
  const [ephIndex, setEphIndex] = useState<EphemerisIndex | null>(null);
  const [provenance, setProvenance] = useState<ProvenanceDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provError, setProvError] = useState<string | null>(null);

  const [primaryId, setPrimaryId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startMs, setStartMs] = useState(DEFAULT_START);
  const [endMs, setEndMs] = useState(DEFAULT_END);
  const [cursorMs, setCursorMs] = useState(Math.round((DEFAULT_START + DEFAULT_END) / 2 / HOUR_MS) * HOUR_MS);
  const [paramState, setParamState] = useState<ParamState>(DEFAULT_PARAM_STATE);

  const [masks, setMasks] = useState<Record<string, HorizonMask>>({});
  const [maskErrors, setMaskErrors] = useState<Record<string, string>>({});
  const [eph, setEph] = useState<EphemerisTable | null>(null);
  const [ephError, setEphError] = useState<string | null>(null);

  const [provOpen, setProvOpen] = useState(false);
  const [mapView, setMapView] = useState<'moon' | 'terrain'>('moon');
  const [provFocus, setProvFocus] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [tool, setTool] = useState<PlanningTool | null>(null);
  const analysisButton = useRef<HTMLButtonElement>(null);
  const analysisPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (analysisOpen && window.matchMedia('(max-width: 680px)').matches) {
      analysisPanel.current?.focus({ preventScroll: true });
    }
  }, [analysisOpen]);

  // ---- initial data ----
  useEffect(() => {
    Promise.all([loadSites(), loadEphemerisIndex()])
      .then(([s, e]) => {
        setSitesDoc(s);
        setEphIndex(e);
        const ids = s.sites.slice(0, MAX_SITES).map((x) => x.id);
        setPrimaryId(ids.includes(selectedSiteId) ? selectedSiteId : ids[0] ?? '');
        setSelectedIds(ids);
      })
      .catch((e: unknown) => setLoadError(errText(e)));
    loadProvenance()
      .then(setProvenance)
      .catch((e: unknown) => setProvError(errText(e)));
  }, []);

  const covStartMs = ephIndex ? Date.parse(ephIndex.start_utc) : Date.UTC(2026, 0, 1);
  const covEndMs = ephIndex ? Date.parse(ephIndex.stop_utc) : Date.UTC(2029, 0, 1);

  // ---- horizon masks, lazily per selected site ----
  useEffect(() => {
    if (!sitesDoc) return;
    let cancelled = false;
    for (const id of selectedIds) {
      if (masks[id]) continue;
      const site = sitesDoc.sites.find((s) => s.id === id);
      if (!site) continue;
      loadHorizon(site)
        .then((m) => !cancelled && setMasks((cur) => (cur[id] ? cur : { ...cur, [id]: m })))
        .catch((e: unknown) => {
          if (cancelled) return;
          setMaskErrors((cur) => ({ ...cur, [id]: errText(e) }));
          setMasks((cur) => ({ ...cur, [id]: flatHorizon(0.5) }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [sitesDoc, selectedIds, masks]);

  // ---- ephemeris for the selected range ----
  useEffect(() => {
    if (!ephIndex) return;
    let cancelled = false;
    loadEphemeris(ephIndex, startMs, endMs)
      .then((t) => {
        if (!cancelled) {
          setEph(t);
          setEphError(null);
        }
      })
      .catch((e: unknown) => !cancelled && setEphError(errText(e)));
    return () => {
      cancelled = true;
    };
  }, [ephIndex, startMs, endMs]);

  const ephCovers = !!eph && eph.t0Ms <= startMs && tableEndMs(eph) >= endMs;

  // ---- interval analysis (memoised; scrubbing never reaches this) ----
  const cacheRef = useRef(new Map<string, AnalysisResult>());
  const { results, analysisError } = useMemo(() => {
    const out: AnalysisResult[] = [];
    if (!sitesDoc || !eph || !ephCovers) return { results: out, analysisError: null as string | null };
    const cache = cacheRef.current;
    if (cache.size > 24) cache.clear();
    const pj = JSON.stringify(paramState);
    try {
      for (const id of selectedIds) {
        const site = sitesDoc.sites.find((s) => s.id === id);
        const mask = masks[id];
        if (!site || !mask) continue;
        const key = `${id}|${startMs}|${endMs}|${pj}|${mask.terrainAware}`;
        let r = cache.get(key);
        if (!r) {
          r = analyzeSite(makeSiteContext(site, sitesDoc.observer_height_m, mask), eph, {
            startMs,
            endMs,
            params: paramState.lander,
            earthMinClearanceDeg: paramState.earthMinClearanceDeg,
          });
          cache.set(key, r);
        }
        out.push(r);
      }
    } catch (e) {
      return { results: [] as AnalysisResult[], analysisError: errText(e) };
    }
    // primary first
    out.sort((a, b) => (a.site.id === primaryId ? -1 : b.site.id === primaryId ? 1 : 0));
    return { results: out, analysisError: null as string | null };
  }, [sitesDoc, eph, ephCovers, masks, selectedIds, startMs, endMs, paramState, primaryId]);

  const primarySite = sitesDoc?.sites.find((s) => s.id === primaryId) ?? null;
  const primaryMask = masks[primaryId] ?? null;
  const primaryResult = results.find((r) => r.site.id === primaryId) ?? null;

  const primaryCtx = useMemo(
    () => (sitesDoc && primarySite && primaryMask ? makeSiteContext(primarySite, sitesDoc.observer_height_m, primaryMask) : null),
    [sitesDoc, primarySite, primaryMask],
  );
  const inst = useMemo(() => {
    if (!primaryCtx || !eph || !ephCovers) return null;
    try {
      return instantState(primaryCtx, eph, cursorMs, paramState.earthMinClearanceDeg);
    } catch {
      return null;
    }
  }, [primaryCtx, eph, ephCovers, cursorMs, paramState.earthMinClearanceDeg]);

  // ---- handlers ----
  const applyRange = useCallback((s: number, e: number) => {
    setStartMs(s);
    setEndMs(e);
    setCursorMs((c) => clamp(c, s, e));
  }, []);

  const selectPrimary = useCallback((id: string) => {
    setPrimaryId(id);
    onSelectSite(id);
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur;
      return [...cur, id].slice(-MAX_SITES);
    });
  }, [onSelectSite]);

  useEffect(() => {
    if (selectedSiteId && selectedSiteId !== primaryId && sitesDoc?.sites.some(site => site.id === selectedSiteId)) selectPrimary(selectedSiteId);
  }, [selectedSiteId, primaryId, sitesDoc, selectPrimary]);

  const toggleSite = useCallback(
    (id: string) => {
      setSelectedIds((cur) => {
        if (id === primaryId) return cur;
        if (cur.includes(id)) return cur.filter((x) => x !== id);
        return cur.length >= MAX_SITES ? cur : [...cur, id];
      });
    },
    [primaryId],
  );

  const openInfo = useCallback((methodId: string) => {
    setProvFocus(methodId);
    setProvOpen(true);
  }, []);
  const openProv = useCallback(() => {
    setProvFocus(null);
    setProvOpen(true);
  }, []);
  const closeProv = useCallback(() => setProvOpen(false), []);

  const computing = !!sitesDoc && !loadError && results.length < selectedIds.length && !ephError && !analysisError;

  const banners: string[] = [];
  if (ephError) banners.push(`Ephemeris failed to load: ${ephError}`);
  if (analysisError) banners.push(`Analysis failed: ${analysisError}`);
  for (const [id, m] of Object.entries(maskErrors)) banners.push(`Horizon mask for ${id} failed to load (${m}); using a flat horizon.`);

  return (
    <div className="app planning-workspace">
      {loadError && (
        <div className="banner err" role="alert">
          Could not load site data: {loadError}
        </div>
      )}
      {banners.map((b) => (
        <div key={b} className="banner err" role="alert">
          {b}
        </div>
      ))}
      {!sitesDoc && !loadError && <div className="banner">Loading site catalogue{'…'}</div>}
      {computing && <div className="banner">Loading data and computing{'…'}</div>}

      {sitesDoc && primarySite && (
        <main className={`planning-layout${analysisOpen ? ' analysis-open' : ''}`}>
          <div className="planning-visual">
            <div className="planning-view-tools">
              <label>
                <span className="sr-only">Landing site</span>
                <select value={primaryId} onChange={event => selectPrimary(event.target.value)}>
                  {sitesDoc.sites.map(site => <option key={site.id} value={site.id}>{site.short}</option>)}
                </select>
              </label>
              <div className="planning-view-actions">
                <ExportMenu results={results} primaryId={primaryId} provenance={provenance} />
                <button type="button" className="btn" onClick={openProv}>Sources & methods</button>
                <button ref={analysisButton} type="button" className="btn" aria-expanded={analysisOpen} aria-controls="planning-analysis" onClick={() => setAnalysisOpen(open => !open)}>Analysis</button>
              </div>
            </div>
            <section className="map-workspace" aria-label="Lunar visualization">
              <div className="map-view-switch" role="group" aria-label="Map view">
                <button className="btn" aria-pressed={mapView === 'moon'} onClick={() => setMapView('moon')}>Moon</button>
                <button className="btn" aria-pressed={mapView === 'terrain'} onClick={() => setMapView('terrain')}>Local terrain</button>
              </div>
              {mapView === 'moon' ? <MoonView sites={sitesDoc.sites} primaryId={primaryId} onSelect={selectPrimary} /> : <TerrainView site={primarySite} inst={inst} />}
              {inst && <div className="map-readouts">
                <span><span className="sun-text">Sun elevation</span> <strong>{inst.sun.elDeg.toFixed(2)}°</strong></span>
                <span><span className="earth-text">Earth elevation</span> <strong>{inst.earth.elDeg.toFixed(2)}°</strong></span>
              </div>}
            </section>
          </div>
          <aside ref={analysisPanel} tabIndex={-1} id="planning-analysis" className="planning-analysis" aria-label="Site analysis" hidden={!analysisOpen}>
            <header className="planning-analysis-header"><h2>Analysis</h2><button type="button" className="btn small" aria-label="Close analysis" onClick={() => { setAnalysisOpen(false); analysisButton.current?.focus(); }}>Close ×</button></header>
            <p className="planning-analysis-site">{primarySite.short}</p>
            <MetricSummary result={primaryResult} loading={computing} />
            <button type="button" className="planning-detail-button" aria-haspopup="dialog" onClick={() => setTool('comparison')}>Compare sites <span aria-hidden="true">↗</span></button>
            <details className="workspace-details"><summary>Local horizon</summary><SkyView
              mask={primaryMask}
              result={primaryResult}
              inst={inst}
              cursorMs={cursorMs}
              earthMinClearanceDeg={paramState.earthMinClearanceDeg}
            /></details>
            <details className="workspace-details"><summary>Lander parameters</summary><ParamsPanel value={paramState} onChange={setParamState} /></details>
            <details className="workspace-details"><summary>Site facts & coordinates</summary><SiteFacts site={primarySite} onDetails={() => openInfo('M-SITE')} /></details>
          </aside>
        </main>
      )}

      {sitesDoc && <div className="planning-time-dock">
        <button type="button" className="btn planning-tools-trigger" aria-haspopup="dialog" aria-expanded={tool !== null} onClick={() => setTool('timelines')}>Timelines & comparison <span aria-hidden="true">↗</span></button>
        <TimeControls startMs={startMs} endMs={endMs} cursorMs={cursorMs} onCursor={setCursorMs} />
      </div>}
      {tool && sitesDoc && <PlanningToolsDialog initialTool={tool} onClose={() => setTool(null)} interval={`${isoDate(startMs)} — ${isoDate(endMs)}`}
        dateRange={<DateRange startMs={startMs} endMs={endMs} covStartMs={covStartMs} covEndMs={covEndMs} onChange={applyRange} />}
        siteSelection={<fieldset className="planning-site-selection"><legend>Sites · select up to {MAX_SITES}</legend>
          {sitesDoc.sites.map(site => <label key={site.id}><input type="checkbox" checked={selectedIds.includes(site.id)} disabled={site.id === primaryId || (!selectedIds.includes(site.id) && selectedIds.length >= MAX_SITES)} onChange={() => toggleSite(site.id)} /><span>{site.short}<small>{site.coord_class === 'verified_landing' ? 'Verified landing' : 'Representative point'}{site.id === primaryId ? ' · primary' : ''}</small></span></label>)}
        </fieldset>}
        timelines={<TimelinesPanel results={results} primaryId={primaryId} startMs={startMs} endMs={endMs} cursorMs={cursorMs} onCursor={setCursorMs} />}
        comparison={<Comparison results={results} primaryId={primaryId} />}
        timeControls={<TimeControls startMs={startMs} endMs={endMs} cursorMs={cursorMs} onCursor={setCursorMs} />}
      />}

      {provOpen && (
        <ProvenancePanel provenance={provenance} provenanceError={provError} ephIndex={ephIndex} sites={sitesDoc?.sites} focusMethodId={provFocus} onClose={closeProv} />
      )}
    </div>
  );
}
