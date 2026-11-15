import MissionPlanner from './MissionPlanner';
import { TimeZoneProvider } from './ui/timeZone';
export default function App() {
  return <TimeZoneProvider><MissionPlanner /></TimeZoneProvider>;
}
