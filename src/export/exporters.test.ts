import { describe, expect, it } from 'vitest';
import { analyzeSite, makeSiteContext, DEFAULT_LANDER, summaryRows, formatRowValue, type ProvenanceDoc } from '../science';
import { sitesDoc, shippedMask, shippedEphemeris, readJson, DATA_DIR } from '../science/__fixtures__/shipped';
import { buildExportJson, buildSeriesCsv, buildSummaryCsv, SERIES_COLUMNS } from './exporters';

const doc = sitesDoc();
const results = doc.sites.map(site => analyzeSite(makeSiteContext(site, doc.observer_height_m, shippedMask(site)), shippedEphemeris(), {
  startMs: Date.parse('2027-01-01T00:00:00Z'), endMs: Date.parse('2027-03-01T00:00:00Z'), params: DEFAULT_LANDER,
}));
const provenance = readJson<ProvenanceDoc>(`${DATA_DIR}/provenance.json`);
const json = buildExportJson(results, provenance, '2026-11-14T00:00:00Z');

describe('scientific exports', () => {
  it('preserves displayed summary values, assumptions, references and clipped windows', () => {
    expect(json.references).toEqual(provenance.references);
    results.forEach((r, i) => {
      expect(json.sites[i].summary).toEqual(summaryRows(r).map(row => ({ ...row, display: formatRowValue(row) })));
      expect(json.sites[i].lander_params.classification).toBe('assumed');
      expect(json.sites[i].battery.generated_wh).toBe(r.battery.generatedWh);
      expect(json.sites[i].windows.earth).toEqual(r.metrics.earthWindows.map(w => ({
        start_utc: new Date(w.startMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        end_utc: new Date(w.endMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        hours: (w.endMs - w.startMs) / 3600000, truncated_start: w.truncatedStart, truncated_end: w.truncatedEnd,
      })));
    });
  });

  it('exports every sample consistently between CSV and JSON at documented precision', () => {
    results.forEach((r, siteIndex) => {
      const csv = buildSeriesCsv(r);
      expect(csv).toContain('assumed demonstration values');
      const [header, ...rows] = csv.trim().split('\n').filter(line => !line.startsWith('#'));
      expect(header.split(',')).toEqual(SERIES_COLUMNS);
      expect(rows.length).toBe(r.series.tMs.length);
      rows.forEach((line, i) => line.split(',').forEach((value, j) => {
        expect(j === 0 ? value : Number(value)).toBe(json.sites[siteIndex].series[SERIES_COLUMNS[j]][i]);
      }));
      expect(Number(rows[0].split(',')[12])).toBeCloseTo(r.series.powerW[0], 2);
    });
  });

  it('retains full precision, missing values and truncation flags in comparison CSV', () => {
    const [, ...lines] = buildSummaryCsv(results).trim().split('\n').filter(line => !line.startsWith('#'));
    lines.forEach((line, i) => {
      const cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      results.forEach((r, j) => {
        const row = summaryRows(r)[i];
        expect(cells[5 + j]).toBe(row.value === null ? '' : String(row.value));
        expect(cells.at(-1)!.split(' ').includes(r.site.id)).toBe(!!row.truncated);
      });
    });
    expect(buildExportJson([], null, '2026-11-14T00:00:00Z').sites).toEqual([]);
  });
});
