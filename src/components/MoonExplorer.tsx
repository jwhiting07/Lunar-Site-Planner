import { useEffect, useState } from 'react';
import { loadSites } from '../data/loader';
import type { SitesDoc } from '../science';
import { MoonView } from './MoonView';
import { UtcClock } from './UtcClock';

export default function MoonExplorer({ selectedSiteId, onSelectSite }: { selectedSiteId: string; onSelectSite: (id: string) => void }) {
  const [doc, setDoc] = useState<SitesDoc | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSites().then(data => { if (!cancelled) setDoc(data); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return <main className="moon-page">
    {doc ? <MoonView explorer sites={doc.sites} primaryId={doc.sites.find(site => site.id === selectedSiteId)?.id ?? doc.sites[0]?.id ?? ''} onSelect={onSelectSite} />
      : <div className="view-loading" role={error ? 'alert' : 'status'}>{error ? 'Could not load landing sites. Reload to try again.' : 'Loading Moon…'}</div>}
    <footer className="moon-bottom"><span><a href="https://svs.gsfc.nasa.gov/14959/" target="_blank" rel="noreferrer">NASA GSFC / LRO</a> · Viewing light <a className="moon-planning-link" href="#planning">Site analysis ↗</a></span><UtcClock /></footer>
  </main>;
}
