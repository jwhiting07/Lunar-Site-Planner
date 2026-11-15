import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Chevron } from './Chevron';
import { placePopover } from '../ui/placePopover';
import type { AnalysisResult, ProvenanceDoc } from '../science';
import { buildExportJson, buildSeriesCsv, buildSummaryCsv } from '../export/exporters';
import { downloadText } from '../export/download';
import { DAY_MS, clamp, isoDate } from '../ui/labels';
import type { Targets } from '../science/planner';
import { zoneDayStart } from '../ui/timeZone';

interface RangeProps {
  startMs: number;
  endMs: number;
  covStartMs: number;
  covEndMs: number;
  onChange: (startMs: number, endMs: number) => void;
}

/** Start of calendar day `s` ("YYYY-MM-DD") in `zone` (UTC by default); null if it is not a real date. */
export const parseDate = (s: string, zone = 'UTC'): number | null => zoneDayStart(s, zone);

export function DateRange({ startMs, endMs, covStartMs, covEndMs, onChange }: RangeProps) {
  const setStart = (s: string) => {
    const t = parseDate(s);
    if (t === null) return;
    const a = clamp(t, covStartMs, covEndMs - DAY_MS);
    onChange(a, endMs > a ? endMs : Math.min(covEndMs, a + DAY_MS));
  };
  const setEnd = (s: string) => {
    const t = parseDate(s);
    if (t === null) return;
    const b = clamp(t, covStartMs + DAY_MS, covEndMs);
    onChange(startMs < b ? startMs : Math.max(covStartMs, b - DAY_MS), b);
  };
  const preset = (days: number) => {
    let a = startMs;
    let b = a + days * DAY_MS;
    if (b > covEndMs) {
      b = covEndMs;
      a = Math.max(covStartMs, b - days * DAY_MS);
    }
    onChange(a, b);
  };
  const lo = isoDate(covStartMs);
  const hi = isoDate(covEndMs);
  return (
    <div className="daterange">
      <div className="field">
        <label className="field-label" htmlFor="d-start">Start (UTC)</label>
        <input id="d-start" type="date" min={lo} max={isoDate(covEndMs - DAY_MS)} value={isoDate(startMs)} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="d-end">End (UTC)</label>
        <input id="d-end" type="date" min={isoDate(covStartMs + DAY_MS)} max={hi} value={isoDate(endMs)} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="presets" role="group" aria-label="Range presets">
        <button type="button" className="btn small" onClick={() => preset(30)}>30 d</button>
        <button type="button" className="btn small" onClick={() => preset(90)}>90 d</button>
        <button type="button" className="btn small" onClick={() => preset(365)}>1 yr</button>
        <button type="button" className="btn small" onClick={() => onChange(covStartMs, covEndMs)} title="Full ephemeris coverage">
          {new Date(covStartMs).getUTCFullYear()}{'–'}{new Date(covEndMs - 1).getUTCFullYear()}
        </button>
      </div>
    </div>
  );
}

interface ExportProps {
  results: AnalysisResult[];
  primaryId: string;
  provenance: ProvenanceDoc | null;
  targets?: Targets[];
}

export function ExportMenu({ results, primaryId, provenance, targets }: ExportProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 8, top: 8, width: 160 });

  const primary = results.find((r) => r.site.id === primaryId) ?? results[0];
  const disabled = results.length === 0;
  const range = primary ? `${isoDate(primary.startMs)}_${isoDate(primary.endMs)}` : '';
  const ids = results.map((r) => r.site.id).join('+').slice(0, 90);
  const targetMetadata = targets?.map((t, i) => `# scenario_${i + 1}_targets: ${JSON.stringify(t)}`).join('\n');

  const show = () => {
    const box = popup.current, anchor = trigger.current;
    if (!box || !anchor || box.matches(':popover-open')) return;
    box.showPopover();
    setBox(placePopover(anchor, box));
    box.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  };
  const done = (download: () => void) => () => { download(); popup.current?.hidePopover(); trigger.current?.focus(); };
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  };

  return (
    <div className="menu">
      <button ref={trigger} type="button" className="btn export-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={show}>
        Export<Chevron />
      </button>
      <div ref={popup} id={id} popover="auto" role="menu" aria-label="Export options" className="export-pop"
        style={{ left: box.left, top: box.top, minWidth: Math.max(box.width, 260) }} onKeyDown={move} onToggle={(event) => setOpen(event.newState === 'open')}>
        <button type="button" role="menuitem" tabIndex={-1}
          onClick={done(() => { if (primary) downloadText(`${primary.site.id}_${range}_series.csv`, (targetMetadata ? targetMetadata + '\n' : '') + buildSeriesCsv(primary), 'text/csv'); })}>
          <span>Series CSV</span><small>Hourly values for the primary site</small>
        </button>
        <button type="button" role="menuitem" tabIndex={-1}
          onClick={done(() => downloadText(`comparison_${ids}_${range}.csv`, (targetMetadata ? targetMetadata + '\n' : '') + buildSummaryCsv(results), 'text/csv'))}>
          <span>Comparison CSV</span><small>Summary metrics, one column per scenario</small>
        </button>
        <button type="button" role="menuitem" tabIndex={-1}
          onClick={done(() => {
            const doc = buildExportJson(results, provenance, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
            downloadText(`clps_${ids}_${range}.json`, JSON.stringify(targets ? { ...doc, planning_targets: targets } : doc), 'application/json');
          })}>
          <span>JSON</span><small>Full results for all selected sites</small>
        </button>
      </div>
    </div>
  );
}
