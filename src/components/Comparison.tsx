import { Fragment, memo, useMemo } from 'react';
import { formatRowValue, summaryRows, type AnalysisResult, type SummaryRow } from '../science';
import { COORD_CLASS_LABEL, FLAT_WARNING, deg, fmtLat, num } from '../ui/labels';
import { Panel } from './Common';

interface Props {
  results: AnalysisResult[];
  primaryId: string;
}

type Rows = Map<string, SummaryRow>;

interface TableRow {
  label: string;
  cell: (r: AnalysisResult, rows: Rows) => string;
  group?: string;
}

const withUnit = (row: SummaryRow | undefined): string => {
  if (!row) return '—';
  const t = formatRowValue(row);
  return t === '—' ? t : `${t} ${row.unit === 'deg' ? '°' : row.unit}`;
};
const v = (key: string) => (_: AnalysisResult, rows: Rows) => withUnit(rows.get(key));
const range = (a: string, b: string) => (_: AnalysisResult, rows: Rows) => {
  const lo = rows.get(a)?.value;
  const hi = rows.get(b)?.value;
  return lo == null || hi == null ? '—' : `${deg(lo, 1)} to ${deg(hi, 1)}`;
};

const TABLE: TableRow[] = [
  { group: 'Sunlight and Earth line of sight', label: 'Sunlit time', cell: v('sunlit_pct') },
  { label: 'Earth visible (geometric)', cell: v('earth_pct') },
  { label: 'Longest darkness', cell: v('longest_dark_h') },
  { label: 'Longest Earth blackout', cell: v('longest_blackout_h') },
  { group: 'Energy (assumed lander)', label: 'Energy generated', cell: v('generated_kwh') },
  { label: 'Unserved load energy', cell: v('unserved_kwh') },
  { label: 'Time in power deficit', cell: v('deficit_h') },
  { label: 'Minimum battery charge', cell: v('min_battery_pct') },
  { group: 'Context', label: 'Latitude', cell: (r) => fmtLat(r.site.lat_deg) },
  { label: 'Elevation (LOLA DEM)', cell: (r) => `${num(r.site.elevation_m, 0)} m` },
  { label: 'Slope (pixel / 3×3 mean, 80 m baseline)', cell: (r) => `${num(r.site.slope.pixel_deg, 1)}° / ${num(r.site.slope.mean3x3_deg, 1)}°` },
  { label: 'Sunlit time, flat horizon', cell: v('sunlit_pct_flat') },
  { label: 'Earth visible, flat horizon', cell: v('earth_pct_flat') },
  { label: 'Mean terrain horizon toward Sun', cell: v('horizon_at_sun_deg') },
  { label: 'Mean terrain horizon toward Earth', cell: v('horizon_at_earth_deg') },
  { label: 'Sun elevation range', cell: range('sun_el_min_deg', 'sun_el_max_deg') },
  { label: 'Earth elevation range', cell: range('earth_el_min_deg', 'earth_el_max_deg') },
];

function ComparisonImpl({ results, primaryId }: Props) {
  const rows = useMemo(() => results.map((r) => new Map(summaryRows(r).map((x) => [x.key, x]))), [results]);

  if (results.length < 2) {
    return (
      <Panel title="Site comparison">
        <p className="muted">Select at least two sites using the checkboxes above to compare them over the same dates and parameters.</p>
      </Panel>
    );
  }
  let lastGroup = '';
  return (
    <Panel title="Site comparison" help="All sites use the same date range, lander parameters and Earth clearance setting.">
      <div className="table-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {results.map((r) => (
                <th key={r.site.id} scope="col" className="num">
                  {r.site.short}
                  {r.site.id === primaryId && <span className="primary-tag"> primary</span>}
                  <div className={`badge badge-${r.site.coord_class}`}>{COORD_CLASS_LABEL[r.site.coord_class]}</div>
                  {!r.terrainAware && <div className="warn-inline">{FLAT_WARNING}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE.map((t) => {
              const header = t.group && t.group !== lastGroup ? t.group : null;
              if (t.group) lastGroup = t.group;
              return (
                <Fragment key={t.label}>
                  {header && (
                    <tr key={`g-${header}`} className="group-row">
                      <th colSpan={results.length + 1} scope="colgroup">
                        {header}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">{t.label}</th>
                    {results.map((r, i) => (
                      <td key={r.site.id} className="num mono">
                        {t.cell(r, rows[i])}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export const Comparison = memo(ComparisonImpl);
