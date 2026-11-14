import type { ReactNode } from 'react';
import type { Classification, ProvenanceDoc } from '../science';

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

export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="info-btn" aria-label={`Method and provenance: ${label}`} title="Method and provenance" onClick={onClick}>
      {'ⓘ'}
    </button>
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
