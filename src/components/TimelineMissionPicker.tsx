import { useId, useRef, useState } from 'react';
import { placePopover } from '../ui/placePopover';
import { useTimeZone } from '../ui/timeZone';
import { Chevron } from './Chevron';
import type { TimelineMission } from './Timelines';

export function TimelineMissionPicker({ missions, selectedIds, onChange }: {
  missions: TimelineMission[]; selectedIds: string[]; onChange: (ids: string[]) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 8, top: 8, width: 240 });
  const tz = useTimeZone();
  const count = missions.filter(mission => selectedIds.includes(mission.id)).length;

  return <div className="tl-mission-picker">
    <button ref={trigger} type="button" className="select-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      popoverTarget={id} onClick={event => {
        event.preventDefault();
        if (!popup.current || !trigger.current) return;
        if (popup.current.matches(':popover-open')) popup.current.hidePopover();
        else {
          popup.current.showPopover();
          setBox(placePopover(trigger.current, popup.current));
          popup.current.querySelector<HTMLInputElement>('input')?.focus();
        }
      }}>Sites on timeline ({count})<Chevron /></button>
    <div ref={popup} id={id} popover="auto" role="dialog" aria-label="Sites on timeline" className="select-list tl-mission-options"
      style={{ left: box.left, top: box.top, minWidth: box.width }} onToggle={event => setOpen(event.newState === 'open')}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          popup.current?.hidePopover(); trigger.current?.focus();
        }
      }}>
      {missions.map(mission => <label key={mission.id}>
        <input type="checkbox" checked={selectedIds.includes(mission.id)} onChange={event => onChange(event.target.checked
          ? [...selectedIds, mission.id] : selectedIds.filter(id => id !== mission.id))} />
        <span>{mission.label}<small>{tz.dateTime(mission.result.startMs)} · {Number((mission.result.metrics.intervalHours / 24).toFixed(3))} d</small></span>
      </label>)}
    </div>
  </div>;
}
