import { lazy, Suspense } from 'react';
const MissionPlanner = lazy(() => import('./MissionPlanner'));
export default function App() {
  return <Suspense fallback={<div className="view-loading" role="status">Loading…</div>}><MissionPlanner /></Suspense>;
}
