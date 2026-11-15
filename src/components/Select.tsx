import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Chevron } from './Chevron';
import { placePopover } from '../ui/placePopover';

export interface SelectOption<T extends string | number> { value: T; label: string }

/**
 * Themed replacement for native <select>, whose option list ignores page
 * colours. The list is a popover (top layer) so it is never clipped by a
 * scrolling editor or dialog.
 */
export function Select<T extends string | number>({ value, options, onChange, label, placeholder = 'Choose…' }: {
  value: T | ''; options: SelectOption<T>[]; onChange: (value: T) => void; label: string; placeholder?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 8, top: 8, width: 160 });
  const selected = options.find(option => option.value === value);

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])];
  const show = () => {
    const popup = list.current, anchor = trigger.current;
    if (!popup || !anchor || popup.matches(':popover-open')) return;
    popup.showPopover();
    setBox(placePopover(anchor, popup));
    (items().find(item => item.getAttribute('aria-selected') === 'true') ?? items()[0])?.focus();
  };
  const choose = (next: T) => { onChange(next); list.current?.hidePopover(); trigger.current?.focus(); };
  const move = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = items(), at = all.indexOf(document.activeElement as HTMLElement);
    const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : null;
    if (to !== null) { event.preventDefault(); all[Math.max(0, Math.min(all.length - 1, to))]?.focus(); }
    else if (event.key === 'Escape') { event.stopPropagation(); trigger.current?.focus(); }
    else if ((event.key === 'Enter' || event.key === ' ') && at >= 0) { event.preventDefault(); all[at].click(); }
  };

  return <>
    <button ref={trigger} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
      aria-label={`${label}: ${selected?.label ?? placeholder}`}
      onClick={show} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}>
      <span className={selected ? '' : 'select-placeholder'}>{selected?.label ?? placeholder}</span><Chevron />
    </button>
    <ul ref={list} id={id} popover="auto" role="listbox" aria-label={label} className="select-list"
      style={{ left: box.left, top: box.top, minWidth: box.width }} onKeyDown={move} onToggle={event => setOpen(event.newState === 'open')}>
      {options.map(option => <li key={option.value} role="option" tabIndex={-1} aria-selected={option.value === value} onClick={() => choose(option.value)}>{option.label}</li>)}
    </ul>
  </>;
}
