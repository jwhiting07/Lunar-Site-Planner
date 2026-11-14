import { memo, useState } from 'react';
import { DEFAULT_EARTH_MIN_CLEARANCE_DEG, DEFAULT_LANDER, type LanderParams, type PanelMode } from '../science';
import { PANEL_MODE_LABELS } from '../ui/labels';
import { InfoButton, Panel } from './Common';

export interface ParamState {
  lander: LanderParams;
  earthMinClearanceDeg: number;
}

export const DEFAULT_PARAM_STATE: ParamState = { lander: DEFAULT_LANDER, earthMinClearanceDeg: DEFAULT_EARTH_MIN_CLEARANCE_DEG };

interface Field {
  id: string;
  label: string;
  unit: string;
  get: (p: ParamState) => number;
  set: (p: ParamState, v: number) => ParamState;
  min: number;
  max?: number;
  step: string;
  help: string;
}

const FIELDS: Field[] = [
  {
    id: 'area', label: 'Panel area', unit: 'm²', min: 0, step: 'any', help: 'Solar array collecting area',
    get: (p) => p.lander.panelAreaM2,
    set: (p, v) => ({ ...p, lander: { ...p.lander, panelAreaM2: v } }),
  },
  {
    id: 'eff', label: 'Panel efficiency', unit: '%', min: 0, max: 100, step: 'any', help: 'Sunlight-to-electricity efficiency of the whole array, 0 to 100 %',
    get: (p) => p.lander.panelEfficiency * 100,
    set: (p, v) => ({ ...p, lander: { ...p.lander, panelEfficiency: v / 100 } }),
  },
  {
    id: 'load', label: 'Constant load', unit: 'W', min: 0, step: 'any', help: 'Electrical power the lander draws continuously',
    get: (p) => p.lander.loadW,
    set: (p, v) => ({ ...p, lander: { ...p.lander, loadW: v } }),
  },
  {
    id: 'batt', label: 'Battery capacity', unit: 'Wh', min: 0, step: 'any', help: 'Usable battery energy',
    get: (p) => p.lander.batteryCapacityWh,
    set: (p, v) => ({ ...p, lander: { ...p.lander, batteryCapacityWh: v } }),
  },
  {
    id: 'clear', label: 'Earth min. clearance', unit: '°', min: 0, max: 60, step: 'any', help: 'Earth must be this many degrees above the terrain horizon to count as visible. 0 = pure line of sight.',
    get: (p) => p.earthMinClearanceDeg,
    set: (p, v) => ({ ...p, earthMinClearanceDeg: v }),
  },
];

const fmtField = (v: number): string => String(Number(v.toPrecision(10)));

interface Props {
  value: ParamState;
  onChange: (p: ParamState) => void;
  onInfo: (methodId: string) => void;
}

function ParamsPanelImpl({ value, onChange, onInfo }: Props) {
  const [resetKey, setResetKey] = useState(0);
  return <ParamsForm key={resetKey} value={value} onChange={onChange} onInfo={onInfo} onReset={() => { onChange(DEFAULT_PARAM_STATE); setResetKey((k) => k + 1); }} />;
}

function ParamsForm({ value, onChange, onInfo, onReset }: Props & { onReset: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.id, fmtField(f.get(value))])),
  );
  const errorOf = (f: Field, text: string): string | null => {
    if (text.trim() === '') return 'Enter a number';
    const v = Number(text);
    if (!Number.isFinite(v)) return 'Not a number';
    if (v < f.min) return `Must be at least ${f.min}`;
    if (f.max !== undefined && v > f.max) return `Must be at most ${f.max}`;
    return null;
  };

  const edit = (f: Field, text: string) => {
    setDraft((d) => ({ ...d, [f.id]: text }));
    if (errorOf(f, text) === null) onChange(f.set(value, Number(text)));
  };

  return (
    <Panel
      title="Lander parameters"
      right={<InfoButton label="Lander parameters" methodId="A-LANDER" onClick={() => onInfo('A-LANDER')} />}
    >
      <div className="param-grid">
        {FIELDS.map((f) => {
          const err = errorOf(f, draft[f.id]);
          return (
            <div key={f.id} className="field">
              <label htmlFor={`p-${f.id}`} className="field-label" title={f.help}>
                {f.label}
              </label>
              <div className="input-unit">
                <input
                  id={`p-${f.id}`}
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={draft[f.id]}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `p-${f.id}-err` : undefined}
                  title={f.help}
                  onChange={(e) => edit(f, e.target.value)}
                />
                <span className="unit-suffix">{f.unit}</span>
              </div>
              {err && (
                <span id={`p-${f.id}-err`} className="field-err" role="alert">
                  {err}
                </span>
              )}
            </div>
          );
        })}
        <div className="field wide">
          <label htmlFor="p-mode" className="field-label" title="How the array is oriented relative to the Sun">
            Panel pointing
          </label>
          <select
            id="p-mode"
            value={value.lander.panelMode}
            onChange={(e) => onChange({ ...value, lander: { ...value.lander, panelMode: e.target.value as PanelMode } })}
          >
            {(Object.keys(PANEL_MODE_LABELS) as PanelMode[]).map((m) => (
              <option key={m} value={m}>
                {PANEL_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="param-foot">
        <button type="button" className="btn small" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </Panel>
  );
}

export const ParamsPanel = memo(ParamsPanelImpl);
