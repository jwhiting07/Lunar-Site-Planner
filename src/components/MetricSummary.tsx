import { memo, useMemo } from 'react';
import { formatRowValue, summaryRows, type AnalysisResult, type SummaryRow, type TimeWindow } from '../science';
import { EARTH_DISCLAIMER, ENERGY_DISCLAIMER, FLAT_WARNING, fmtUtc } from '../ui/labels';
import { InfoButton, KindTag, Panel } from './Common';

interface Props {
  result: AnalysisResult | null;
  loading: boolean;
  onInfo: (methodId: string) => void;
}

const unitText = (u: string): string => (u === 'deg' ? '°' : u);
const TRUNC_TIP = 'Window cut by the selected interval; true duration is at least this.';

function windowSpan(w: TimeWindow | null): string | null {
  return w ? `${fmtUtc(w.startMs)} → ${fmtUtc(w.endMs)}` : null;
}

function Value({ row }: { row: SummaryRow }) {
  const text = formatRowValue(row);
  const showUnit = row.value !== null && Number.isFinite(row.value);
  const days = row.unit === 'h' && row.value !== null && row.value >= 48 ? ` (${(row.value / 24).toFixed(1)} d)` : '';
  return (
    <span className="mono" title={row.truncated ? TRUNC_TIP : undefined}>
      {text}
      {showUnit && <span className="unit"> {unitText(row.unit)}</span>}
      {showUnit && days && <span className="unit">{days}</span>}
    </span>
  );
}

function Tile({ row, sub, onInfo }: { row: SummaryRow; sub?: string | null; onInfo: (id: string) => void }) {
  return (
    <div className="tile">
      <div className="tile-h">
        <span className="field-label">{row.label}</span>
        <InfoButton label={row.label} onClick={() => onInfo(row.methodId)} />
      </div>
      <div className="tile-v">
        <Value row={row} />
      </div>
      <div className="tile-f">
        <KindTag kind={row.kind} />
        {row.truncated && <span className="trunc" title={TRUNC_TIP}>cut by interval</span>}
      </div>
      {sub && <div className="tile-sub mono">{sub}</div>}
    </div>
  );
}

function MetricSummaryImpl({ result, loading, onInfo }: Props) {
  const rows = useMemo(() => (result ? summaryRows(result) : []), [result]);
  const by = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  if (!result) {
    return (
      <Panel title="Metric summary">
        <p className="muted">{loading ? 'Computing…' : 'No result yet.'}</p>
      </Panel>
    );
  }
  const g = (k: string) => by.get(k) as SummaryRow;
  const sunKeys = ['sunlit_pct', 'longest_dark_h'];
  const earthKeys = ['earth_pct', 'longest_blackout_h'];
  const energyKeys = ['generated_kwh', 'deficit_h', 'min_battery_pct'];
  const tiled = new Set([...sunKeys, ...earthKeys, ...energyKeys]);
  const rest = rows.filter((r) => !tiled.has(r.key));
  const m = result.metrics;

  return (
    <Panel title="Metric summary" help={`Primary site over the selected interval. ${result.site.short}`}>
      {!result.terrainAware && (
        <p className="warn-box" role="alert">
          {FLAT_WARNING}
        </p>
      )}
      <h3 className="group-h">Sunlight</h3>
      <div className="tiles">
        <Tile row={g('sunlit_pct')} onInfo={onInfo} />
        <Tile row={g('longest_dark_h')} sub={windowSpan(m.longestDarkness)} onInfo={onInfo} />
      </div>
      <h3 className="group-h">Earth line of sight</h3>
      <div className="tiles">
        <Tile row={g('earth_pct')} onInfo={onInfo} />
        <Tile row={g('longest_blackout_h')} sub={windowSpan(m.longestBlackout)} onInfo={onInfo} />
      </div>
      <p className="disclaimer">{EARTH_DISCLAIMER}</p>
      <h3 className="group-h">Energy (assumed lander)</h3>
      <div className="tiles three">
        <Tile row={g('generated_kwh')} onInfo={onInfo} />
        <Tile row={g('deficit_h')} onInfo={onInfo} />
        <Tile row={g('min_battery_pct')} onInfo={onInfo} />
      </div>
      <p className="disclaimer">{ENERGY_DISCLAIMER}</p>
      <details className="all-metrics"><summary>All metrics</summary>
      <table className="metric-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="num">Value</th>
            <th scope="col">Kind</th>
            <th scope="col"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rest.map((r) => (
            <tr key={r.key} title={r.note}>
              <th scope="row">{r.label}</th>
              <td className="num">
                <Value row={r} />
              </td>
              <td>
                <KindTag kind={r.kind} />
              </td>
              <td>
                <InfoButton label={r.label} onClick={() => onInfo(r.methodId)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </details>
    </Panel>
  );
}

export const MetricSummary = memo(MetricSummaryImpl);
