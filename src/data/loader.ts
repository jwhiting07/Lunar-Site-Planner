/**
 * Loads the shipped data and, when available, queries the local terrain calculator.
 * Site terrain and ephemeris years are fetched lazily and cached.
 */
import { mergeTables, tableFromBuffer, type EphemerisTable } from '../science/ephemeris';
import { parseHorizon, type HorizonMask } from '../science/horizon';
import type { EphemerisIndex, ProvenanceDoc, SiteDoc, SitesDoc } from '../science/types';
import type { LandingSitesDoc } from './landingSites';

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(name: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(BASE + name, { signal });
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
/**
 * Ephemeris index: the 2026-2028 planning tables plus, when shipped, the historical hourly tables
 * (ephemeris_history.json, from the Luna 2 arrival date). Both use the same sampling, frame and
 * file layout, so their year files merge seamlessly.
 */
export const loadEphemerisIndex = () =>
  cached(jsonCache, 'eph', async (): Promise<EphemerisIndex> => {
    const main = await getJson<EphemerisIndex>('ephemeris.json');
    const history = await getJson<EphemerisIndex>('ephemeris_history.json').catch(() => null);
    if (!history) return main;
    return {
      ...main,
      start_utc: history.start_utc,
      default_start_utc: main.start_utc,
      first_contact: history.first_contact,
      history_interpolation: history.interpolation,
      files: [...history.files, ...main.files],
    };
  }) as Promise<EphemerisIndex>;
/** Optional layer: callers treat a failed load as "no catalogue". */
export const loadLandingSites = () =>
  cached(jsonCache, 'landing', () => getJson<LandingSitesDoc>('landing_sites.json', AbortSignal.timeout(8000))) as Promise<LandingSitesDoc>;
export const loadProvenance = () =>
  cached(jsonCache, 'prov', () => getJson<ProvenanceDoc>('provenance.json')) as Promise<ProvenanceDoc>;

export const overviewUrl = (file: string): string => BASE + file;

const horizonCache = new Map<string, Promise<HorizonMask>>();
export function loadHorizon(site: SiteDoc): Promise<HorizonMask> {
  return cached(horizonCache, site.id, async () =>
    parseHorizon(await getBuffer(site.horizon.file), site.horizon.n_az, site.horizon.az_step_deg),
  );
}

export type CustomHorizon = { site: SiteDoc; mask: HorizonMask; observerHeightM: number } | null;
const customCache = new Map<string, CustomHorizon>();
export const terrainKey = (lat: number, lon: number) => `${lat.toFixed(9)},${(((lon + 180) % 360 + 360) % 360 - 180).toFixed(9)}`;
export interface HorizonProfile {
  elevationM: number; observerHeightM: number; coverageKm: number; azStepDeg: number;
  elevDeg: number[]; distM: number[]; terrainResolutionM?: number;
}

/** Also used by the offline benchmark: exercise the exact browser conversion. */
export function resolveHorizonProfile(site: SiteDoc, data: HorizonProfile): NonNullable<CustomHorizon> {
  const { elevationM, observerHeightM, coverageKm, azStepDeg, elevDeg, distM, terrainResolutionM } = data;
  if (![elevationM, observerHeightM, coverageKm].every(Number.isFinite) ||
      !(azStepDeg > 0) || !Array.isArray(elevDeg) || !Array.isArray(distM) ||
      elevDeg.length !== 360 / azStepDeg || elevDeg.length !== distM.length ||
      !elevDeg.every(Number.isFinite) || !distM.every(Number.isFinite)) {
    throw new Error('The local terrain calculator returned an invalid horizon.');
  }
  const mask: HorizonMask = { azStepDeg, elevDeg: Float32Array.from(elevDeg), distM: Float32Array.from(distM), terrainAware: true };
  if (Number.isFinite(terrainResolutionM) && terrainResolutionM! > 0) mask.resolutionM = terrainResolutionM;
  const resolvedSite: SiteDoc = {
    ...site, terrain_aware: true, elevation_m: elevationM,
    elevation_source: mask.resolutionM ? 'Global LOLA DEM bilinear sample [R-SVS-MOON-KIT]' : 'Polar LOLA DEM bilinear sample [R-LOLA-PGDA]',
    coord_note: 'Coordinates with a computed LOLA horizon [M-HORIZON].',
    horizon: { ...site.horizon, n_az: elevDeg.length, az_step_deg: azStepDeg, coverage_min_km: coverageKm,
      min_deg: Math.min(...elevDeg), max_deg: Math.max(...elevDeg),
      mean_deg: elevDeg.reduce((total, elevation) => total + elevation, 0) / elevDeg.length,
      max_obstruction_distance_km: Math.max(...distM) / 1000 },
  };
  return { site: resolvedSite, mask, observerHeightM };
}

export async function loadCustomHorizon(site: SiteDoc, signal: AbortSignal, allowService = true): Promise<CustomHorizon> {
  const cacheKey = terrainKey(site.lat_deg, site.lon_deg);
  const cached = customCache.get(cacheKey);
  if (cached !== undefined) return cached;
  signal.throwIfAborted();
  // Exact grid coordinates only. No nearby point's skyline is substituted.
  const pack = await cachedSearchProfiles();
  signal.throwIfAborted();
  if (pack?.[cacheKey]) {
    const resolved = resolveHorizonProfile(site, pack[cacheKey]);
    customCache.set(cacheKey, resolved);
    return resolved;
  }
  if (!allowService) return null;
  const query = new URLSearchParams({ lat: String(site.lat_deg), lon: String(site.lon_deg) });
  const url = `${import.meta.env.BASE_URL}api/custom-horizon?${query}`;
  // Longer than the server-side timeout, so a busy calculator is waited for rather than reported as unavailable.
  const deadline = Date.now() + 75_000;
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
  if (data === null) { customCache.set(cacheKey, null); return null; }
  const resolved = resolveHorizonProfile(site, data);
  customCache.set(cacheKey, resolved);
  return resolved;
}

type SearchProfiles = Record<string, HorizonProfile>;
const cachedSearchProfiles = () => cached(jsonCache, 'search-horizons', () =>
  getJson<{ schema: number; profiles: SearchProfiles }>('search_horizons.json')
    .then(doc => doc.schema === 1 ? doc.profiles : null).catch(() => null)) as Promise<SearchProfiles | null>;

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
