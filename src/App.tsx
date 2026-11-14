import { lazy, Suspense, useEffect, useState } from 'react';

const MoonExplorer = lazy(() => import('./components/MoonExplorer'));
const PlanningView = lazy(() => import('./PlanningView'));
type View = 'moon' | 'planning';
// SolarView.tsx and its assets are deliberately retained, but not exposed or loaded.
const readView = (): View => location.hash === '#planning' ? 'planning' : 'moon';

export default function App() {
  const [view, setView] = useState<View>(readView);
  const [planningVisited, setPlanningVisited] = useState(view === 'planning');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  useEffect(() => {
    const update = () => { const next = readView(); setView(next); if (next === 'planning') setPlanningVisited(true); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return <div className={`mission-shell ${view === 'planning' ? 'mission-planning' : ''}`}>
    <header className="mission-header">
      <a className="mission-brand" href="#moon" aria-label="Seraphim home">SERAPHIM</a>
      <nav aria-label="Main views">
        <a href="#moon" aria-current={view === 'moon' ? 'page' : undefined}>Moon</a>
        <a href="#planning" aria-current={view === 'planning' ? 'page' : undefined}>Planning</a>
      </nav>
    </header>
    <Suspense fallback={<div className="view-loading" role="status">Loading view…</div>}>
      {view === 'moon' && <MoonExplorer selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId} />}
    </Suspense>
    {planningVisited && <div hidden={view !== 'planning'} className="planning-page"><Suspense fallback={<div className="view-loading" role="status">Loading Planning…</div>}><PlanningView selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId} /></Suspense></div>}
  </div>;
}
