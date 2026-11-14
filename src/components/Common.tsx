import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { METHOD_BY_ID, type Classification, type ProvenanceDoc } from '../science';
import { METRIC_INFO } from '../ui/metricInfo';

export function Panel({
  title,
  help,
  right,
  className,
  children,
}: {
  title: string;
  help?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header className="panel-h">
        <h2 title={help}>{title}</h2>
        {right}
      </header>
      <div className="panel-b">{children}</div>
    </section>
  );
}

const KIND_HELP: Record<Classification, string> = {
  sourced: 'Sourced: taken from an external dataset or publication',
  computed: 'Computed: calculated from sourced inputs',
  assumed: 'Assumed: model input chosen by this project',
  approximated: 'Approximated: deliberate simplification',
};

export function KindTag({ kind }: { kind: Classification }) {
  return (
    <span className={`tag tag-${kind}`} title={KIND_HELP[kind]}>
      {kind}
    </span>
  );
}

export function InfoButton({ label, methodId, metricKey }: { label: string; methodId: string; metricKey?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const method = METHOD_BY_ID[methodId];
  const explanation = (metricKey ? METRIC_INFO[metricKey] : undefined) ?? (methodId === 'A-LANDER' ? 'Lander parameters are assumed panel, load and battery settings used to estimate solar generation and stored energy.' : method.summary);

  useEffect(() => {
    if (!open) return;
    const close = () => popup.current?.hidePopover();
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = () => {
    const box = popup.current;
    const button = trigger.current;
    if (!box || !button) return;
    if (box.matches(':popover-open')) { box.hidePopover(); return; }
    box.showPopover();
    const anchor = button.getBoundingClientRect();
    const bounds = box.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, anchor.bottom + 8 + bounds.height <= window.innerHeight - 8 ? anchor.bottom + 8 : anchor.top - bounds.height - 8),
    });
  };

  return (
    <>
      <button ref={trigger} type="button" className="info-btn" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={toggle}>
        <span aria-hidden="true">i</span>
      </button>
      {createPortal(
        <div ref={popup} id={id} popover="auto" role="dialog" aria-label={`About ${label}`} className="info-popover" style={position} onToggle={(event) => setOpen(event.newState === 'open')}>
          <p>{explanation}</p>
        </div>, document.body,
      )}
    </>
  );
}

/** Reference IDs rendered as links resolved through provenance.references. */
export function RefLinks({ ids, provenance, full }: { ids: string[]; provenance: ProvenanceDoc | null; full?: boolean }) {
  if (ids.length === 0) return <span className="muted">none</span>;
  const byId = new Map((provenance?.references ?? []).map((r) => [r.id, r]));
  return (
    <span className={full ? 'reflist full' : 'reflist'}>
      {ids.map((id) => {
        const r = byId.get(id);
        if (!r) return <span key={id} className="ref-unresolved" title="Reference not found in provenance.json">{id}</span>;
        return (
          <a key={id} href={r.url} target="_blank" rel="noreferrer" title={`${r.authority}: ${r.title} (${r.version})`}>
            {full ? `${r.title} [${id}]` : id}
          </a>
        );
      })}
    </span>
  );
}
