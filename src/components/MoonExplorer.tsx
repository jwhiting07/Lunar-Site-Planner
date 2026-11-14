import { useEffect, useState } from 'react';
import { loadEphemerisIndex, loadProvenance, loadSites } from '../data/loader';
import type { EphemerisIndex, ProvenanceDoc, SitesDoc } from '../science';
import { MoonView } from './MoonView';
import { UtcClock } from './UtcClock';
import { ProvenancePanel } from './ProvenancePanel';

export default function MoonExplorer({ selectedSiteId, onSelectSite }: { selectedSiteId: string; onSelectSite: (id: string) => void }) {
  const [doc, setDoc] = useState<SitesDoc | null>(null);
  const [error, setError] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [provenance, setProvenance] = useState<ProvenanceDoc | null>(null);
  const [ephIndex, setEphIndex] = useState<EphemerisIndex | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourcesOpen) return;
    let cancelled = false;
    Promise.all([loadProvenance(), loadEphemerisIndex()]).then(([p, e]) => { if (!cancelled) { setProvenance(p); setEphIndex(e); setSourcesError(null); } })
      .catch((e: unknown) => { if (!cancelled) setSourcesError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [sourcesOpen]);
  useEffect(() => {
    let cancelled = false;
    loadSites().then(data => { if (!cancelled) setDoc(data); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return <main className="moon-page">
    {doc ? <MoonView explorer sites={doc.sites} primaryId={doc.sites.find(site => site.id === selectedSiteId)?.id ?? doc.sites[0]?.id ?? ''} onSelect={onSelectSite} />
      : <div className="view-loading" role={error ? 'alert' : 'status'}>{error ? 'Could not load landing sites. Reload to try again.' : 'Loading Moon…'}</div>}
    <footer className="moon-bottom"><span><button type="button" className="moon-sources-link" onClick={() => setSourcesOpen(true)}>Sources & methods</button><a className="moon-planning-link" href="#planning">Site analysis ↗</a></span><UtcClock /></footer>
    {sourcesOpen && <ProvenancePanel provenance={provenance} provenanceError={sourcesError} ephIndex={ephIndex} sites={doc?.sites} focusMethodId={null} onClose={() => setSourcesOpen(false)} />}
  </main>;
}
