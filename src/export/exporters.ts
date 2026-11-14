/**
 * Pure export builders (no DOM). Every summary number comes from
 * summaryRows()/formatRowValue() of the science core; nothing is re-derived.
 */
import {
  INITIAL_STATE_OF_CHARGE,
  formatRowValue,
  summaryRows,
  windowHours,
  type AnalysisResult,
  type ProvenanceDoc,
  type ReferenceDoc,
  type SiteDoc,
  type SummaryRow,
  type TimeWindow,
} from '../science';
import { COORD_CLASS_LABEL, PANEL_MODE_LABELS, EARTH_DISCLAIMER, ENERGY_DISCLAIMER } from '../ui/labels';

export const SERIES_COLUMNS: string[] = [
  'time_utc',
  'sun_az_deg',
  'sun_el_deg',
  'sun_horizon_deg',
  'sun_clearance_deg',
  'sun_disk_fraction',
  'sun_visible',
  'earth_az_deg',
  'earth_el_deg',
  'earth_horizon_deg',
  'earth_clearance_deg',
  'earth_visible',
  'power_w',
  'battery_wh',
];

const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
const metaLine = (s: string): string => `# ${oneLine(s)}`;

/** Series as formatted strings, one array per column in SERIES_COLUMNS order. */
function formattedColumns(r: AnalysisResult): string[][] {
  const s = r.series;
  const f4 = (a: ArrayLike<number>) => Array.from({ length: a.length }, (_, i) => a[i].toFixed(4));
  const f2 = (a: ArrayLike<number>) => Array.from({ length: a.length }, (_, i) => a[i].toFixed(2));
  const flag = (a: ArrayLike<number>) => Array.from({ length: a.length }, (_, i) => (a[i] ? '1' : '0'));
  return [
    Array.from(s.tMs, iso),
    f4(s.sunAzDeg),
    f4(s.sunElDeg),
    f4(s.sunHorizonDeg),
    f4(s.sunClearanceDeg),
    f4(s.sunDiskFraction),
    flag(s.sunVisible),
    f4(s.earthAzDeg),
    f4(s.earthElDeg),
    f4(s.earthHorizonDeg),
    f4(s.earthClearanceDeg),
    flag(s.earthVisible),
    f2(s.powerW),
    f2(s.batteryWh),
  ];
}

function landerText(r: AnalysisResult): string {
  const p = r.params;
  return (
    `panel_area_m2=${p.panelAreaM2}; panel_efficiency=${p.panelEfficiency}; constant_load_w=${p.loadW}; ` +
    `battery_capacity_wh=${p.batteryCapacityWh}; panel_pointing=${p.panelMode} (${PANEL_MODE_LABELS[p.panelMode]}); ` +
    `initial_battery_state_of_charge=${INITIAL_STATE_OF_CHARGE}`
  );
}

/** One CSV per site: '#'-prefixed metadata lines, then a header row, then one row per sample. */
export function buildSeriesCsv(result: AnalysisResult): string {
  const site = result.site;
  const lines: string[] = [
    metaLine('CLPS Lunar Mission Browser - time series export'),
    metaLine(`site_name: ${site.name}`),
    metaLine(`site_id: ${site.id}`),
    metaLine(`latitude_deg: ${site.lat_deg} (planetocentric, negative = south)`),
    metaLine(`longitude_deg_east: ${site.lon_deg}`),
    metaLine(`elevation_m: ${site.elevation_m} (${site.elevation_source}; height above the 1737.4 km reference sphere)`),
    metaLine(`coordinate_class: ${site.coord_class} (${COORD_CLASS_LABEL[site.coord_class] ?? site.coord_class})`),
    metaLine(`coordinate_note: ${site.coord_note}`),
    metaLine(`terrain_aware: ${result.terrainAware}${result.terrainAware ? '' : ' (flat-horizon approximation, no terrain data)'}`),
    metaLine(`interval_utc: ${iso(result.startMs)} to ${iso(result.endMs)}`),
    metaLine(`step_s: ${result.stepMs / 1000}`),
    metaLine('time_system: UTC'),
    metaLine(
      'reference_frame: lunar Mean-Earth/Polar-Axis body-fixed frame (MOON_ME_DE440_ME421); local East-North-Up at the site; azimuth clockwise from north, elevation above the local horizontal plane',
    ),
    metaLine(`observer_height_m: ${result.observerHeightM} (assumed height above the DEM surface)`),
    metaLine('sun_visible: 1 when any part of the solar disk is above the terrain horizon at the Sun azimuth (upper-limb convention)'),
    metaLine(
      `earth_visible: 1 when the centre of Earth clears the terrain horizon by more than ${result.earthMinClearanceDeg} deg. ${EARTH_DISCLAIMER}`,
    ),
    metaLine(`assumed_lander_parameters: ${landerText(result)}`),
    metaLine(`power_w and battery_wh: ${ENERGY_DISCLAIMER} Parameters above are assumed demonstration values, not a spacecraft specification.`),
    metaLine('sun_disk_fraction: visible fraction of the solar disk, 0..1; sun_clearance_deg and earth_clearance_deg: elevation minus terrain horizon elevation'),
    SERIES_COLUMNS.join(','),
  ];
  const cols = formattedColumns(result);
  const n = result.series.tMs.length;
  for (let i = 0; i < n; i++) lines.push(cols.map((c) => c[i]).join(','));
  return lines.join('\n') + '\n';
}

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Comparison CSV: one row per summary key, one value column per site. */
export function buildSummaryCsv(results: AnalysisResult[]): string {
  const columnIds = results.map((r, i) => results.filter(x => x.site.id === r.site.id).length > 1 ? `${r.site.id}__scenario${i + 1}` : r.site.id);
  const lines: string[] = [metaLine('CLPS Lunar Mission Browser - site comparison (values unrounded)')];
  if (results.length > 0) {
    lines.push(metaLine('time_system: UTC; dates and assumptions are recorded per scenario below'));
    lines.push(metaLine(`Earth metrics: ${EARTH_DISCLAIMER} Energy metrics: ${ENERGY_DISCLAIMER}`));
    results.forEach((r, i) => lines.push(metaLine(`${columnIds[i]}: ${r.site.name}; lat_deg=${r.site.lat_deg}; lon_deg_east=${r.site.lon_deg}; interval_utc=${iso(r.startMs)} to ${iso(r.endMs)}; step_s=${r.stepMs / 1000}; terrain_aware=${r.terrainAware}; earth_min_clearance_deg=${r.earthMinClearanceDeg}; ${landerText(r)}`)));
  }
  const rowsBySite = results.map((r) => new Map(summaryRows(r).map((row) => [row.key, row])));
  const head = ['key', 'label', 'unit', 'kind', 'method_id', ...columnIds, 'truncated_sites'];
  lines.push(head.map(csvField).join(','));
  const base = results.length > 0 ? summaryRows(results[0]) : [];
  for (const row of base) {
    const vals = rowsBySite.map((m) => m.get(row.key));
    const truncated = columnIds.filter((_, i) => vals[i]?.truncated);
    const cells = [
      row.key,
      row.label,
      row.unit,
      row.kind,
      row.methodId,
      ...vals.map((v) => (v && v.value !== null && Number.isFinite(v.value) ? String(v.value) : '')),
      truncated.join(' '),
    ];
    lines.push(cells.map(csvField).join(','));
  }
  return lines.join('\n') + '\n';
}

export interface ExportWindow {
  start_utc: string;
  end_utc: string;
  hours: number;
  truncated_start: boolean;
  truncated_end: boolean;
}

export interface ExportSite {
  site: SiteDoc;
  terrain_aware: boolean;
  interval: { start_utc: string; end_utc: string; step_s: number };
  observer_height_m: number;
  earth_min_clearance_deg: number;
  lander_params: {
    classification: 'assumed';
    note: string;
    panel_area_m2: number;
    panel_efficiency: number;
    constant_load_w: number;
    battery_capacity_wh: number;
    panel_pointing: string;
    initial_state_of_charge: number;
  };
  summary: (SummaryRow & { display: string })[];
  windows: {
    sun: ExportWindow[];
    earth: ExportWindow[];
    both: ExportWindow[];
    darkness: ExportWindow[];
    blackout: ExportWindow[];
  };
  battery: {
    generated_wh: number;
    load_wh: number;
    unserved_wh: number;
    deficit_hours: number;
    min_energy_wh: number;
    min_energy_time_utc: string;
    first_deficit_utc: string | null;
    curtailed_wh: number;
  };
  /** One array per column named in SERIES_COLUMNS (same rounding as the CSV). */
  series: Record<string, (string | number)[]>;
}

export interface ExportDocument {
  schema: 1;
  generated_utc: string;
  conventions: {
    reference_frame: string;
    time_system: string;
    azimuth: string;
    elevation: string;
    units: string;
    sun_visibility: string;
    earth_visibility: string;
  };
  disclaimers: string[];
  references: ReferenceDoc[];
  sites: ExportSite[];
}

const exportWindows = (ws: TimeWindow[]): ExportWindow[] =>
  ws.map((w) => ({
    start_utc: iso(w.startMs),
    end_utc: iso(w.endMs),
    hours: windowHours(w),
    truncated_start: w.truncatedStart,
    truncated_end: w.truncatedEnd,
  }));

/** Full JSON export for all compared sites. */
export function buildExportJson(
  results: AnalysisResult[],
  provenance: ProvenanceDoc | null,
  generatedUtc: string,
): ExportDocument {
  return {
    schema: 1,
    generated_utc: generatedUtc,
    conventions: {
      reference_frame:
        'Lunar Mean-Earth/Polar-Axis body-fixed frame (MOON_ME_DE440_ME421); local East-North-Up at the site, Up = planetocentric radial direction',
      time_system: 'UTC',
      azimuth: 'degrees clockwise from north, [0, 360)',
      elevation: 'degrees above the local horizontal plane',
      units: 'angles deg; durations h; energy Wh or kWh as labelled; power W; terrain heights m above the 1737.4 km sphere',
      sun_visibility: 'Sun visible = any part of the solar disk is above the terrain horizon at the Sun azimuth',
      earth_visibility: `Earth visible = centre of Earth clears the terrain horizon by more than the minimum clearance. ${EARTH_DISCLAIMER}`,
    },
    disclaimers: [
      EARTH_DISCLAIMER,
      ENERGY_DISCLAIMER,
      'Lander parameters are assumed demonstration values, not a spacecraft specification.',
      'Favourable light and line of sight do not make a site safe to land on. Slope values are context only (80 m baseline), not a landing-safety assessment.',
    ],
    references: provenance ? provenance.references : [],
    sites: results.map((r): ExportSite => {
      const m = r.metrics;
      const b = r.battery;
      const cols = formattedColumns(r);
      const series: Record<string, (string | number)[]> = {};
      SERIES_COLUMNS.forEach((name, i) => {
        series[name] = i === 0 ? cols[i] : cols[i].map(Number);
      });
      return {
        site: r.site,
        terrain_aware: r.terrainAware,
        interval: { start_utc: iso(r.startMs), end_utc: iso(r.endMs), step_s: r.stepMs / 1000 },
        observer_height_m: r.observerHeightM,
        earth_min_clearance_deg: r.earthMinClearanceDeg,
        lander_params: {
          classification: 'assumed',
          note: 'Assumed demonstration values, not a spacecraft specification.',
          panel_area_m2: r.params.panelAreaM2,
          panel_efficiency: r.params.panelEfficiency,
          constant_load_w: r.params.loadW,
          battery_capacity_wh: r.params.batteryCapacityWh,
          panel_pointing: r.params.panelMode,
          initial_state_of_charge: INITIAL_STATE_OF_CHARGE,
        },
        summary: summaryRows(r).map((row) => ({ ...row, display: formatRowValue(row) })),
        windows: {
          sun: exportWindows(m.sunWindows),
          earth: exportWindows(m.earthWindows),
          both: exportWindows(m.bothWindows),
          darkness: exportWindows(m.darknessWindows),
          blackout: exportWindows(m.blackoutWindows),
        },
        battery: {
          generated_wh: b.generatedWh,
          load_wh: b.loadWh,
          unserved_wh: b.unservedWh,
          deficit_hours: b.deficitHours,
          min_energy_wh: b.minEnergyWh,
          min_energy_time_utc: iso(b.minEnergyTimeMs),
          first_deficit_utc: b.firstDeficitMs === null ? null : iso(b.firstDeficitMs),
          curtailed_wh: b.curtailedWh,
        },
        series,
      };
    }),
  };
}
