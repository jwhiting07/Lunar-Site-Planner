import { useEffect, useRef, useState } from 'react';
import { METHODS, type EphemerisIndex, type ProvenanceDoc, type SiteDoc } from '../science';
import { KindTag, RefLinks } from './Common';
import { COORD_CLASS_LABEL, fmtLat, fmtLon, num } from '../ui/labels';

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
  const prev = useRef<Element | null>(null);

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
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prov-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header className="drawer-h">
          <h2 id="prov-title">Sources & methods</h2>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close sources and methods panel">
            Close (Esc)
          </button>
        </header>
        <div className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`pane-${id}`} className={tab === id ? 'tab on' : 'tab'} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="drawer-b" role="tabpanel" id={`pane-${tab}`} aria-labelledby={`tab-${tab}`}>
          {provenanceError && <p className="warn-box">provenance.json could not be loaded: {provenanceError}. Reference links are unavailable.</p>}
          {tab === 'methods' && (
            <div>
              <p className="muted">
                Every displayed quantity traces to one of these entries. Classification: see the Conventions tab.
              </p>
              {METHODS.map((m) => (
                <article key={m.id} id={`method-${m.id}`} className={`method${focusMethodId === m.id ? ' focus' : ''}`}>
                  <h3>
                    <span className="mono">{m.id}</span> {m.title} <KindTag kind={m.kind} />
                  </h3>
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
                  {m.formula && <pre className="formula">{m.formula}</pre>}
                  {m.inputs && m.inputs.length > 0 && (
                    <p>
                      <span className="field-label">Inputs</span> {m.inputs.join(', ')}
                    </p>
                  )}
                  <div>
                    <span className="field-label">Limitations</span>
                    <ul>
                      {m.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="code-loc">
                    <span className="field-label">Code</span> <span className="mono">{m.code.join('; ')}</span>
                  </p>
                  <p>
                    <span className="field-label">References</span> <RefLinks ids={m.refs} provenance={p} />
                  </p>
                </article>
              ))}
              <section className="method">
                <h3>Moon display & local terrain</h3>
                <p>The continuous Moon mesh and texture are from <a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noreferrer">NASA GSFC / LRO</a>. Geometry is normalized for display; the local camera is anchored to the model surface with zoom and tilt limits.</p>
                <p>The star background uses positions and magnitudes from the <a href="https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html" target="_blank" rel="noreferrer">Yale Bright Star Catalog hosted by NASA/GSFC HEASARC</a> (Hoffleit and Warren, 1991), retaining stars through magnitude 5.8 and drawing small, dim points at screen resolution; it provides context and is not aligned to the selected lunar epoch.</p>
                <p>The Moon overview uses a viewing light. Local terrain uses the calculated Sun direction with ambient fill for inspection; shadows and partial solar-disk visibility are not ray-traced. The model is for visual context, and its resolution does not resolve landing hazards.</p>
                <p>Visibility and energy results use the separate LOLA horizon masks, including terrain out to 600 km. The display mesh and lighting are not inputs to those calculations. Local terrain stays at true relief; no vertical exaggeration is applied.</p>
              </section>
            </div>
          )}
          {tab === 'data' && (
            <div>
              {!p ? (
                <p className="muted">Provenance not loaded.</p>
              ) : (
                <>
                  <h3>Source files (downloaded once, processed offline)</h3>
                  <div className="table-scroll">
                    <table className="doc-table">
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
                            <td className="mono small">{s.inputs.join(', ')}</td>
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
                <div className="table-scroll">
                  <table className="doc-table">
                    <thead>
                      <tr><th>ID</th><th>Authority</th><th>Title</th><th>Version</th><th>Link</th></tr>
                    </thead>
                    <tbody>
                      {p.references.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.id}</td>
                          <td>{r.authority}</td>
                          <td>{r.title}</td>
                          <td>{r.version}</td>
                          <td><a href={r.url} target="_blank" rel="noreferrer">open</a>{r.doi ? <> &middot; <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">DOI</a></> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                <li>Visibility uses an 80/240 m DEM and a 0.5 degree azimuth grid: boulders, small craters and the lander itself are not represented.</li>
                <li>Hourly samples: events shorter than one hour between samples are not detected.</li>
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
