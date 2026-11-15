import { Fragment, useEffect, useRef, useState } from 'react';
import { METHODS, type EphemerisIndex, type ProvenanceDoc, type SiteDoc } from '../science';
import { KindTag, RefLinks } from './Common';
import { Select } from './Select';
import { COORD_CLASS_LABEL, fmtLat, fmtLon, num } from '../ui/labels';
import './ProvenancePanel.css';
import { MethodCalculation } from './MethodCalculation';

type Tab = 'methods' | 'data' | 'refs' | 'conv';

interface Props {
  provenance: ProvenanceDoc | null;
  provenanceError: string | null;
  ephIndex: EphemerisIndex | null;
  focusMethodId: string | null;
  onClose: () => void;
  sites?: SiteDoc[];
}

const TABS: [Tab, string][] = [
  ['methods', 'Methods & assumptions'],
  ['data', 'Data sources'],
  ['refs', 'References'],
  ['conv', 'Conventions & limitations'],
];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function shortHash(h: string): string {
  return h.length > 16 ? `${h.slice(0, 12)}…` : h;
}
const fmtBytes = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);

export function ProvenancePanel({ provenance, provenanceError, ephIndex, focusMethodId, onClose, sites = [] }: Props) {
  const [tab, setTab] = useState<Tab>('methods');
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);

  const selectTab = (id: Tab) => {
    setTab(id);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(TABS[next][0]);
    document.getElementById(`tab-${TABS[next][0]}`)?.focus();
  };

  useEffect(() => {
    prev.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (prev.current instanceof HTMLElement) prev.current.focus();
    };
  }, []);

  useEffect(() => {
    if (focusMethodId) {
      setTab('methods');
      requestAnimationFrame(() => {
        document.getElementById(`method-${focusMethodId}`)?.scrollIntoView({ block: 'start' });
      });
    }
  }, [focusMethodId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const p = provenance;
  return (
    <div className="provenance-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="provenance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prov-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header className="provenance-header">
          <h2 id="prov-title">Sources & methods</h2>
          <button type="button" className="provenance-close" onClick={onClose} aria-label="Close sources and methods panel">
            <span>Close <kbd>Esc</kbd></span><span className="provenance-cross" aria-hidden="true">×</span>
          </button>
        </header>
        <div className="provenance-tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label], index) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`pane-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={(e) => onTabKeyDown(e, index)} onClick={() => selectTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="provenance-body" ref={bodyRef} role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {provenanceError && <p className="warn-box">provenance.json could not be loaded: {provenanceError}. Reference links are unavailable.</p>}
          {tab === 'methods' && (
            <div>
              <div className="provenance-method-tools">
                <p className="provenance-intro">
                  Every displayed quantity traces to one of these entries. Classification: see the Conventions tab.{' '}
                  <a href={`${import.meta.env.BASE_URL}data/validity_report.json`} target="_blank" rel="noreferrer">Validation measurements</a>.
                </p>
                <div className="provenance-jump"><Select label="Jump to method" value="" placeholder="Jump to method"
                  options={[...METHODS.map((m) => ({ value: `method-${m.id}`, label: m.title })), { value: 'method-display', label: 'Moon display & local terrain' }]}
                  onChange={(id) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })} /></div>
              </div>
              {METHODS.map((m) => (
                <article key={m.id} id={`method-${m.id}`} className={`method${focusMethodId === m.id ? ' focus' : ''}`}>
                  <header className="provenance-method-header">
                    <div className="provenance-method-meta"><span className="mono">{m.id}</span><KindTag kind={m.kind} /></div>
                    <h3>{m.title}</h3>
                  </header>
                  <p>{m.summary}</p>
                  {m.id === 'M-SITE' && sites.map(site => <section key={site.id} className="site-source-details">
                    <h4>{site.name}</h4>
                    <p>{COORD_CLASS_LABEL[site.coord_class]} · {fmtLat(site.lat_deg)} · {fmtLon(site.lon_deg)}</p>
                    <p>{site.coord_note}</p>
                    <p>Analysis elevation: {num(site.elevation_m, 1)} m. {site.elevation_source}</p>
                    {site.published_elevation_m !== null && <p>Published elevation: {num(site.published_elevation_m, 0)} m (not used in calculations).</p>}
                    <p>Slope: {num(site.slope.pixel_deg, 1)}° pixel; {num(site.slope.mean3x3_deg, 1)}° mean over 3 × 3 pixels. {site.slope.note}</p>
                    <RefLinks ids={[...site.coord_refs, ...site.context_refs]} provenance={p} full />
                  </section>)}
                  {m.formula && <MethodCalculation methodId={m.id} original={m.formula} />}
                  {m.inputs && m.inputs.length > 0 && (
                    <div className="provenance-field">
                      <span className="field-label">Inputs</span><p>{m.inputs.join(', ')}</p>
                    </div>
                  )}
                  <div className="provenance-field">
                    <span className="field-label">Limitations</span>
                    <ul>
                      {m.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="provenance-field code-loc">
                    <span className="field-label">Code</span> <span className="mono">{m.code.join('; ')}</span>
                  </div>
                  <div className="provenance-field">
                    <span className="field-label">References</span> <RefLinks ids={m.refs} provenance={p} />
                  </div>
                </article>
              ))}
              <section className="method" id="method-display">
                <h3>Moon display & local terrain</h3>
                <p>The continuous Moon mesh and texture are from <a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noreferrer">NASA GSFC / LRO</a>. Geometry is normalized for display; the local camera is anchored to the model surface with zoom and tilt limits.</p>
                <p>The star background uses positions and magnitudes from the <a href="https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html" target="_blank" rel="noreferrer">Yale Bright Star Catalog hosted by NASA/GSFC HEASARC</a> (Hoffleit and Warren, 1991), retaining stars through magnitude 5.8 and drawing small, dim points at screen resolution; it provides context and is not aligned to the selected lunar epoch.</p>
                <p>The Moon overview uses a viewing light. Local terrain uses the calculated Sun direction with ambient fill for inspection; shadows and partial solar-disk visibility are not ray-traced. The model is for visual context, and its resolution does not resolve landing hazards.</p>
                <p>Visibility and energy results use the separate LOLA horizon masks, including terrain out to 600 km. The display mesh and lighting are not inputs to those calculations. Local terrain stays at true relief; no vertical exaggeration is applied.</p>
              </section>
            </div>
          )}
          {tab === 'data' && (
            <div className="provenance-data">
              {!p ? (
                <p className="muted">Provenance not loaded.</p>
              ) : (
                <>
                  <h3>Source files (downloaded once, processed offline)</h3>
                  <div className="table-scroll">
                    <table className="doc-table source-files">
                      <thead>
                        <tr><th>File</th><th>Role</th><th>URL</th><th className="num">Size</th><th>SHA-256</th><th>Retrieved</th></tr>
                      </thead>
                      <tbody>
                        {p.sources.map((s) => (
                          <tr key={s.file}>
                            <td className="mono">{s.file}</td>
                            <td>{s.role}</td>
                            <td><a href={s.url} target="_blank" rel="noreferrer">source</a></td>
                            <td className="num mono">{fmtBytes(s.bytes)}</td>
                            <td className="mono" title={s.sha256}>{shortHash(s.sha256)}</td>
                            <td className="mono">{s.retrieved_utc.slice(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h3>Products shipped with this app</h3>
                  <div className="table-scroll">
                    <table className="doc-table">
                      <thead>
                        <tr><th>File</th><th>Description</th><th>Inputs</th><th>Method</th></tr>
                      </thead>
                      <tbody>
                        {p.products.map((s) => (
                          <tr key={s.file}>
                            <td className="mono">{s.file}</td>
                            <td>{s.description}</td>
                            <td className="mono small">{s.inputs.map((input, i) => (
                              <Fragment key={i}><span className="source-input">{input}{i < s.inputs.length - 1 ? ',' : ''}</span>{' '}</Fragment>
                            ))}</td>
                            <td>{s.method ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'refs' && (
            <div>
              {!p ? (
                <p className="muted">Provenance not loaded.</p>
              ) : (
                <ol className="refs-list">
                  {p.references.map((r) => {
                    const doi = r.doi ? (r.doi.startsWith('http') ? r.doi : 'https://doi.org/' + r.doi) : null;
                    return (
                      <li key={r.id} className="refs-item">
                        <span className="refs-id mono">{r.id}</span>
                        <div className="refs-main">
                          <a className="refs-title" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                          <p className="refs-meta">{r.authority}</p>
                          <p className="refs-meta">{r.version}</p>
                          {doi && <p className="refs-links"><a href={doi} target="_blank" rel="noreferrer">{doi.replace('https://doi.org/', 'doi:')}</a></p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
          {tab === 'conv' && (
            <div>
              <h3>Classification legend</h3>
              <ul className="legend-list">
                <li><KindTag kind="sourced" /> taken from an external dataset or publication (for example LOLA elevations, published landing coordinates).</li>
                <li><KindTag kind="computed" /> calculated by this project from sourced inputs with the methods listed here (for example Sun/Earth angles, visibility windows).</li>
                <li><KindTag kind="assumed" /> a model input chosen by this project, not a measured or published fact (for example the lander power parameters).</li>
                <li><KindTag kind="approximated" /> a deliberate simplification of reality (for example the flat-horizon comparison).</li>
              </ul>
              {p && (
                <>
                  <h3>Conventions</h3>
                  <dl className="facts wide-dt">
                    {Object.entries(p.conventions).map(([k, v]) => (
                      <div key={k} className="dl-row">
                        <dt>{k.replace(/_/g, ' ')}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <h3>Data pipeline</h3>
                  <p className="mono small">{p.pipeline.command}</p>
                  <p className="small">
                    Python {p.pipeline.python}; {Object.entries(p.pipeline.packages).map(([k, v]) => `${k} ${v}`).join(', ')}. Provenance generated {p.generated_utc}.
                  </p>
                </>
              )}
              <h3>Ephemeris interpolation self-check</h3>
              {ephIndex ? (
                <>
                  <p>Planning dates are capped to {ephIndex.start_utc.slice(0, 10)} through {ephIndex.stop_utc.slice(0, 10)} UTC. The final timestamp is the boundary sample for the end of 2028; later times are unavailable.</p>
                  <p>{ephIndex.interpolation.method}. {ephIndex.interpolation.check}.</p>
                  <table className="doc-table">
                    <thead><tr><th>Quantity</th><th className="num">Maximum error</th></tr></thead>
                    <tbody>
                      {Object.entries(ephIndex.interpolation.max_error_vs_spice).map(([k, v]) => (
                        <tr key={k}><td className="mono">{k}</td><td className="num mono">{v.toExponential(2)}{k.endsWith('deg') ? ' deg' : ' (relative)'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="small muted">
                    Ephemeris: {ephIndex.frame}, {ephIndex.aberration_correction}, {ephIndex.step_s / 3600} h samples, {ephIndex.start_utc} to {ephIndex.stop_utc} ({ephIndex.time_system}).
                  </p>
                </>
              ) : (
                <p className="muted">ephemeris.json not loaded.</p>
              )}
              <h3>Limitations in short</h3>
              <ul>
                <li>Terrain profiles use a 0.5 degree azimuth grid and either the 80/240 m polar DEMs or the global DEM at about 1.9 km per pixel at the equator.</li>
                <li>Hourly display samples; final summaries use 15-minute integration with 5-minute near-horizon probes. Events between probes can still be missed.</li>
                <li>Earth visibility is geometric line of sight only, not a radio-link assessment.</li>
                <li>Energy values are an engineering estimate from assumed parameters, not a NASA CLPS spacecraft model.</li>
                <li>Slopes are regional (80 m baseline) context and not a landing-safety assessment. Favourable light and line of sight do not make a site safe to land on.</li>
                <li>All times are UTC.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
