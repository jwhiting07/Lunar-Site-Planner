import { memo } from 'react';
import { stereoSouth, type SitesDoc } from '../science';
import { overviewUrl } from '../data/loader';
import { COORD_CLASS_LABEL, MAP_CAPTION } from '../ui/labels';
import { Panel } from './Common';

interface Props {
  doc: SitesDoc;
  primaryId: string;
  selectedIds: string[];
  maxSelected: number;
  onSelectPrimary: (id: string) => void;
  onToggle: (id: string) => void;
}

const halo = { paintOrder: 'stroke', stroke: '#121417', strokeWidth: 5, strokeLinejoin: 'round' } as const;

function SiteMapImpl({ doc, primaryId, selectedIds, maxSelected, onSelectPrimary, onToggle }: Props) {
  const hw = doc.overview.half_width_m / 1000;
  const pad = 36;
  const r85 = stereoSouth(-85, 0)[1] / 1000;
  const r80 = stereoSouth(-80, 0)[1] / 1000;
  const lonTicks: [number, string][] = [
    [0, '0°'],
    [90, '90°E'],
    [180, '180°'],
    [270, '270°E'],
  ];
  return (
    <Panel title="Landing sites" help="Select a primary site; check boxes to compare sites.">
      <details className="polar-context" open><summary>South pole map</summary>
      <svg
        className="sitemap"
        viewBox={`${-hw - pad} ${-hw - pad} ${2 * hw + 2 * pad} ${2 * hw + 2 * pad}`}
        role="group"
        aria-label="Map of lunar south pole region with site markers"
      >
        <image href={overviewUrl(doc.overview.file)} x={-hw} y={-hw} width={2 * hw} height={2 * hw} />
        <g fill="none" stroke="#9aa3ad" strokeWidth={1.2} strokeOpacity={0.8}>
          <circle r={r80} />
          <circle r={r85} strokeDasharray="6 5" />
          {lonTicks.map(([lon]) => {
            const a = (lon * Math.PI) / 180;
            return (
              <line
                key={lon}
                x1={(r80 - 12) * Math.sin(a)}
                y1={-(r80 - 12) * Math.cos(a)}
                x2={(r80 + 6) * Math.sin(a)}
                y2={-(r80 + 6) * Math.cos(a)}
              />
            );
          })}
          <path d="M-8 0H8M0 -8V8" />
        </g>
        <g fontSize={21} fill="#c9ced4" fontFamily="inherit">
          {lonTicks.map(([lon, label]) => {
            const a = (lon * Math.PI) / 180;
            return (
              <text key={lon} x={(r80 + 22) * Math.sin(a)} y={-(r80 + 22) * Math.cos(a) + 7} textAnchor="middle">
                {label}
              </text>
            );
          })}
          <text x={-r80 * 0.707 + 4} y={-r80 * 0.707 - 6} {...halo}>
            80{'°'}S
          </text>
          <text x={-r85 * 0.707 + 4} y={-r85 * 0.707 - 6} {...halo}>
            85{'°'}S
          </text>
          <text x={12} y={-10} {...halo}>
            pole
          </text>
        </g>
        {doc.sites.map((s) => {
          const x = s.stereo_xy_m[0] / 1000;
          const y = -s.stereo_xy_m[1] / 1000;
          const isPrimary = s.id === primaryId;
          const inSet = selectedIds.includes(s.id);
          const verified = s.coord_class === 'verified_landing';
          return (
            <g
              key={s.id}
              transform={`translate(${x} ${y})`}
              className={`map-marker${isPrimary ? ' primary' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${s.short}, ${COORD_CLASS_LABEL[s.coord_class]}${isPrimary ? ', primary site' : ''}`}
              aria-pressed={isPrimary}
              onClick={() => onSelectPrimary(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPrimary(s.id);
                }
              }}
            >
              <title>{`${s.short} — ${COORD_CLASS_LABEL[s.coord_class]}`}</title>
              {(isPrimary || inSet) && (
                <circle
                  r={isPrimary ? 19 : 15}
                  fill="none"
                  stroke={isPrimary ? '#f2f4f6' : '#8a919b'}
                  strokeWidth={isPrimary ? 3 : 2}
                  strokeDasharray={isPrimary ? undefined : '4 3'}
                />
              )}
              {verified ? (
                <circle r={8} fill="#f2f4f6" stroke="#121417" strokeWidth={2.5} />
              ) : (
                <rect x={-8} y={-8} width={16} height={16} transform="rotate(45)" fill="#121417" stroke="#f2f4f6" strokeWidth={3} strokeDasharray="5 3" />
              )}
              <text x={x > 0 ? -26 : 26} y={7} textAnchor={x > 0 ? 'end' : 'start'} fontSize={21} fill="#f2f4f6" {...halo}>
                {s.short}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="caption">{MAP_CAPTION}</p>
      <p className="caption legend">
        <span className="swatch-circle" aria-hidden="true" /> verified landing &nbsp;
        <span className="swatch-diamond" aria-hidden="true" /> representative point
      </p>
      </details>
      <ul className="site-list" aria-label="Sites">
        {doc.sites.map((s, i) => {
          const isPrimary = s.id === primaryId;
          const inSet = selectedIds.includes(s.id);
          return (
            <li key={s.id} className={`site-row${isPrimary ? ' primary' : ''}`}>
              <div className="site-row-main">
                <input
                  type="checkbox"
                  id={`cmp-${s.id}`}
                  checked={inSet}
                  disabled={isPrimary || (!inSet && selectedIds.length >= maxSelected)}
                  onChange={() => onToggle(s.id)}
                  aria-label={`Include ${s.short} in comparison`}
                  title={isPrimary ? 'The primary site is always compared' : 'Include in comparison'}
                />
                <button type="button" className="site-name" aria-pressed={isPrimary} onClick={() => onSelectPrimary(s.id)} title="Select as primary site">
                  <span className="site-number">{i + 1}</span> {s.short}
                </button>
                <span className={`badge badge-${s.coord_class}`}>{COORD_CLASS_LABEL[s.coord_class]}</span>
              </div>
              <details className="coord-note">
                <summary>Coordinate note</summary>
                <p>{s.coord_note}</p>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="caption">Check boxes to compare up to {maxSelected} sites (the primary is always included).</p>
    </Panel>
  );
}

export const SiteMap = memo(SiteMapImpl);
