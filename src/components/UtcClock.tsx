import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TIME_ZONES, timeZoneChoices } from '../ui/timeZones';

const zoneKey = 'seraphim-clock-time-zone';

export function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  const [zone, setZone] = useState(() => {
    try {
      const saved = localStorage.getItem(zoneKey);
      if (saved && TIME_ZONES.includes(saved)) return saved;
    } catch { /* Storage can be disabled. */ }
    return 'UTC';
  });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const chooser = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const chooserId = useId();
  const minute = Math.floor(now.getTime() / 60000);
  const choices = useMemo(() => open ? timeZoneChoices(new Date(minute * 60000)) : [], [open, minute]);
  const filtered = choices.filter(choice => (choice.id + ' ' + choice.place + ' ' + choice.name + ' ' + choice.offset).toLowerCase().includes(search.toLowerCase().trim()));
  const choose = (next: string) => {
    setZone(next);
    try { localStorage.setItem(zoneKey, next); } catch { /* Keep the choice for this session. */ }
    chooser.current?.hidePopover();
    button.current?.focus();
  };
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
      onToggle={event => { setOpen(event.newState === 'open'); if (event.newState === 'open') { setSearch(''); picker.current?.focus(); } else button.current?.focus(); }}>
      <label htmlFor={chooserId + '-search'}>Time zone</label>
      <input ref={picker} id={chooserId + '-search'} type="search" value={search} placeholder="Search place, time zone, or UTC offset" onChange={event => setSearch(event.target.value)} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); chooser.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus(); }
        if (event.key === 'Enter' && filtered.length === 1) { event.preventDefault(); choose(filtered[0].id); }
      }} />
      <div className="clock-zone-list" role="listbox" aria-label="Time zones, ordered by UTC offset" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
        {filtered.map(choice => <button type="button" role="option" aria-selected={choice.id === zone} key={choice.id} title={choice.id} onClick={() => choose(choice.id)}>
          <span className="clock-zone-offset">{choice.offset}</span><span><strong>{choice.place}</strong><small>{choice.name} · {choice.id.split('/')[0]}</small></span>
        </button>)}
        {!filtered.length && <p>No matching time zones.</p>}
      </div>
      <p className="clock-zone-note">{filtered.length} of {TIME_ZONES.length} zones · West to east · Mission dates use UTC</p>
    </div>
  </div>;
}
