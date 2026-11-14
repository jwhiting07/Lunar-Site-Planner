import { useEffect, useId, useMemo, useRef, useState } from 'react';

const zones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
const zoneKey = 'seraphim-clock-time-zone';

export function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  const [zone, setZone] = useState(() => {
    try {
      const saved = localStorage.getItem(zoneKey);
      if (saved && zones.includes(saved)) return saved;
    } catch { /* Storage can be disabled. */ }
    return 'UTC';
  });
  const [open, setOpen] = useState(false);
  const chooser = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const chooserId = useId();
  const format = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23', timeZone: zone, timeZoneName: 'short',
  }), [zone]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="clock-control">
    <button ref={button} type="button" className="btn small" aria-label={`Change time zone (current: ${zone})`}
      aria-expanded={open} aria-controls={chooserId} onClick={() => open ? chooser.current?.hidePopover() : chooser.current?.showPopover()}>
      <time dateTime={now.toISOString()}>{format.format(now)}</time>
    </button>
    <div ref={chooser} className="clock-picker" id={chooserId} popover="auto"
      onToggle={event => { setOpen(event.newState === 'open'); if (event.newState === 'open') picker.current?.focus(); }}>
      <label>Time zone
        <select ref={picker} value={zone} onChange={event => {
          const next = event.target.value;
          setZone(next);
          try { localStorage.setItem(zoneKey, next); } catch { /* Keep the choice for this session. */ }
          chooser.current?.hidePopover();
          button.current?.focus();
        }}>
          {zones.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
    </div>
  </div>;
}
