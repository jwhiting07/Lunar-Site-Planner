import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, ProvenanceDoc } from '../science';
import { buildExportJson, buildSeriesCsv, buildSummaryCsv } from '../export/exporters';
import { downloadText } from '../export/download';
import { DAY_MS, clamp, isoDate } from '../ui/labels';

interface RangeProps {
  startMs: number;
  endMs: number;
  covStartMs: number;
  covEndMs: number;
  onChange: (startMs: number, endMs: number) => void;
}

export const parseDate = (s: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && isoDate(t) === s ? t : null;
};

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
}

export function ExportMenu({ results, primaryId, provenance }: ExportProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const primary = results.find((r) => r.site.id === primaryId) ?? results[0];
  const disabled = results.length === 0;
  const range = primary ? `${isoDate(primary.startMs)}_${isoDate(primary.endMs)}` : '';
  const ids = results.map((r) => r.site.id).join('+');

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        Export {'▾'}
      </button>
      {open && (
        <div className="menu-pop" role="group" aria-label="Export options">
          <button
            type="button"
            onClick={() => {
              if (primary) downloadText(`${primary.site.id}_${range}_series.csv`, buildSeriesCsv(primary), 'text/csv');
              setOpen(false);
            }}
          >
            Series CSV (primary site)
          </button>
          <button
            type="button"
            onClick={() => {
              downloadText(`comparison_${ids}_${range}.csv`, buildSummaryCsv(results), 'text/csv');
              setOpen(false);
            }}
          >
            Comparison CSV
          </button>
          <button
            type="button"
            onClick={() => {
              const doc = buildExportJson(results, provenance, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
              downloadText(`clps_${ids}_${range}.json`, JSON.stringify(doc), 'application/json');
              setOpen(false);
            }}
          >
            JSON (all selected sites)
          </button>
        </div>
      )}
    </div>
  );
}
