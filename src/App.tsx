import { lazy, Suspense } from 'react';
import { TimeZoneProvider } from './ui/timeZone';
const MissionPlanner = lazy(() => import('./MissionPlanner'));
export default function App() {
  return <TimeZoneProvider><Suspense fallback={<div className="view-loading" role="status">Loading…</div>}><MissionPlanner /></Suspense></TimeZoneProvider>;
}
