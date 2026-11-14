/**
 * Test-only helpers: read the shipped public/data products from disk with node:fs
 * (the same bytes the browser fetches) and build the runtime objects from them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mergeTables, tableFromBuffer, type EphemerisTable } from '../ephemeris';
import { parseHorizon, type HorizonMask } from '../horizon';
import type { EphemerisIndex, SiteDoc, SitesDoc } from '../types';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..', '..');
export const DATA_DIR = resolve(ROOT, 'public', 'data');

export function readArrayBuffer(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf-8')) as T;

export const sitesDoc = (): SitesDoc => readJson<SitesDoc>(resolve(DATA_DIR, 'sites.json'));
export const ephemerisIndex = (): EphemerisIndex => readJson<EphemerisIndex>(resolve(DATA_DIR, 'ephemeris.json'));

export function yearTables(): EphemerisTable[] {
  const idx = ephemerisIndex();
  return idx.files.map((f) =>
    tableFromBuffer(readArrayBuffer(resolve(DATA_DIR, f.file)), Date.parse(f.t0_utc), idx.step_s * 1000),
  );
}

let merged: EphemerisTable | null = null;
export function shippedEphemeris(): EphemerisTable {
  if (!merged) merged = mergeTables(yearTables());
  return merged;
}

export function shippedMask(site: SiteDoc): HorizonMask {
  return parseHorizon(readArrayBuffer(resolve(DATA_DIR, site.horizon.file)), site.horizon.n_az, site.horizon.az_step_deg);
}

export function siteById(id: string): SiteDoc {
  const s = sitesDoc().sites.find((x) => x.id === id);
  if (!s) throw new Error(`no site ${id}`);
  return s;
}
