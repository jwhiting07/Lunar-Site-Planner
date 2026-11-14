import { useEffect, useState } from 'react';

export function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <time dateTime={now.toISOString()} className="explorer-clock" aria-label="Current UTC time">
    <span>{now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
    <span>{now.toISOString().slice(11, 19)} UTC</span>
  </time>;
}
