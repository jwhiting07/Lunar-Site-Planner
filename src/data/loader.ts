/**
 * Loads the shipped data and, when available, queries the local terrain calculator.
 * Site terrain and ephemeris years are fetched lazily and cached.
 */
import { mergeTables, tableFromBuffer, type EphemerisTable } from '../science/ephemeris';
import { parseHorizon, type HorizonMask } from '../science/horizon';
import type { EphemerisIndex, ProvenanceDoc, SiteDoc, SitesDoc } from '../science/types';

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`failed to load ${name}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function getBuffer(name: string): Promise<ArrayBuffer> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`failed to load ${name}: HTTP ${r.status}`);
  return r.arrayBuffer();
}

function cached<T>(store: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = store.get(key);
  if (!p) {
    p = make();
    p.catch(() => store.delete(key));
    store.set(key, p);
  }
  return p;
}

const jsonCache = new Map<string, Promise<unknown>>();
export const loadSites = () => cached(jsonCache, 'sites', () => getJson<SitesDoc>('sites.json')) as Promise<SitesDoc>;
export const loadEphemerisIndex = () =>
  cached(jsonCache, 'eph', () => getJson<EphemerisIndex>('ephemeris.json')) as Promise<EphemerisIndex>;
export const loadProvenance = () =>
  cached(jsonCache, 'prov', () => getJson<ProvenanceDoc>('provenance.json')) as Promise<ProvenanceDoc>;

export const overviewUrl = (file: string): string => BASE + file;

const horizonCache = new Map<string, Promise<HorizonMask>>();
export function loadHorizon(site: SiteDoc): Promise<HorizonMask> {
  return cached(horizonCache, site.id, async () =>
    parseHorizon(await getBuffer(site.horizon.file), site.horizon.n_az, site.horizon.az_step_deg),
  );
}

export async function loadCustomHorizon(site: SiteDoc, signal: AbortSignal) {
  const query = new URLSearchParams({ lat: String(site.lat_deg), lon: String(site.lon_deg) });
  const url = `${import.meta.env.BASE_URL}api/custom-horizon?${query}`;
  const deadline = Date.now() + 30_000;
  let response = await fetch(url, { signal });
  // A new request can arrive before the server notices the previous one was cancelled.
  while (response.status === 409 && Date.now() < deadline) {
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 500));
    signal.throwIfAborted();
    response = await fetch(url, { signal });
  }
  if (!response.ok) throw new Error('The local terrain calculator is unavailable.');
  const data = await response.json();
  if (data === null) return null;
  const { elevationM, observerHeightM, coverageKm, azStepDeg, elevDeg, distM } = data;
  if (![elevationM, observerHeightM, coverageKm].every(Number.isFinite) ||
      !(azStepDeg > 0) || !Array.isArray(elevDeg) || !Array.isArray(distM) ||
      elevDeg.length !== 360 / azStepDeg || elevDeg.length !== distM.length ||
      !elevDeg.every(Number.isFinite) || !distM.every(Number.isFinite)) {
    throw new Error('The local terrain calculator returned an invalid horizon.');
  }
  const mask: HorizonMask = { azStepDeg, elevDeg: Float32Array.from(elevDeg), distM: Float32Array.from(distM), terrainAware: true };
  const resolvedSite: SiteDoc = {
    ...site, terrain_aware: true, elevation_m: elevationM,
    elevation_source: 'LOLA DEM bilinear sample [R-LOLA-PGDA]',
    coord_note: 'User-selected coordinates with a computed LOLA horizon [M-HORIZON].',
    horizon: {
      ...site.horizon, n_az: elevDeg.length, az_step_deg: azStepDeg, coverage_min_km: coverageKm,
      min_deg: Math.min(...elevDeg), max_deg: Math.max(...elevDeg),
      mean_deg: (elevDeg as number[]).reduce((total, elevation) => total + elevation, 0) / elevDeg.length,
      max_obstruction_distance_km: Math.max(...distM) / 1000,
    },
  };
  return { site: resolvedSite, mask, observerHeightM };
}

/** Terrain patch heights (m above the 1737.4 km sphere), row-major [j][i], n x n. */
const terrainCache = new Map<string, Promise<Float32Array>>();
export function loadTerrain(site: SiteDoc): Promise<Float32Array> {
  return cached(terrainCache, site.id, async () => {
    const heights = new Float32Array(await getBuffer(site.terrain.file));
    if (heights.length !== site.terrain.n * site.terrain.n) throw new Error('terrain patch has unexpected size');
    return heights;
  });
}

const yearCache = new Map<string, Promise<EphemerisTable>>();
const mergedCache = new Map<string, Promise<EphemerisTable>>();
/**
 * Ephemeris table covering [startMs, endMs]; only the year files that overlap
 * the interval are fetched.
 */
export async function loadEphemeris(index: EphemerisIndex, startMs: number, endMs: number): Promise<EphemerisTable> {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs || startMs < Date.parse(index.start_utc) || endMs > Date.parse(index.stop_utc)) {
    throw new RangeError('requested interval is outside the ephemeris coverage or is empty');
  }
  const stepMs = index.step_s * 1000;
  const needed = index.files.filter((f) => {
    const t0 = Date.parse(f.t0_utc);
    const t1 = t0 + (f.n - 1) * stepMs;
    return t1 >= startMs && t0 <= endMs;
  });
  if (needed.length === 0) throw new RangeError('requested interval is outside the ephemeris coverage');
  // Ranges within one year share that year's table; multi-year ranges are merged once per file set.
  return cached(mergedCache, needed.map((f) => f.file).join('+'), async () =>
    mergeTables(await Promise.all(
      needed.map((f) =>
        cached(yearCache, f.file, async () => tableFromBuffer(await getBuffer(f.file), Date.parse(f.t0_utc), stepMs)),
      ),
    )),
  );
}
