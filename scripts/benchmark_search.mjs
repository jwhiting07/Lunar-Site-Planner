// Complete local fetch + exact-terrain search, including a fresh client cache.
// Usage: node scripts/benchmark_search.mjs [mission duration in days]
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
const originalFetch = globalThis.fetch;
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  let terrainRequests = 0;
  globalThis.fetch = (url, options) => {
    const resolved = new URL(url, origin);
    if (resolved.pathname.includes('/api/custom-horizon')) terrainRequests++;
    return originalFetch(resolved, options);
  };
  const planner = await server.ssrLoadModule('/src/science/planner.ts');
  const loader = await server.ssrLoadModule('/src/data/loader.ts');
  const { DEFAULT_LANDER } = await server.ssrLoadModule('/src/science/constants.ts');
  const [sites, index] = await Promise.all([loader.loadSites(), loader.loadEphemerisIndex()]);
  const point = { lat: -90, lon: 0 };
  const startMs = Date.UTC(2027, 0, 1);
  const dates = planner.dateGrid(startMs, Date.UTC(2027, 0, 31));
  const points = planner.locationGrid(point, 50);
  const durationDays = Number(process.argv[2] ?? 7);
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    // Match MissionPlanner.run's loading order, including its serial mask loads.
    const eph = await loader.loadEphemeris(index, startMs, dates.at(-1) + durationDays * planner.DAY);
    const masks = [];
    for (const site of sites.sites) masks.push([site.id, await loader.loadHorizon(site)]);
    const results = await planner.searchCandidates(eph, {
      points, dates, durationDays, targets: planner.DEFAULT_TARGETS,
      lander: DEFAULT_LANDER, clearance: 0, origin: point, startMs,
      known: sites.sites, observerHeight: sites.observer_height_m, masks: new Map(masks),
      resolveTerrain: (site, signal) => loader.loadCustomHorizon(site, signal),
    }, new AbortController().signal, () => {});
    runs.push({ clientCache: i === 0 ? 'cold' : 'warm', ms: +(performance.now() - start).toFixed(1),
      results: results.length, terrainResults: results.filter(c => c.result.terrainAware).length });
  }
  console.log(JSON.stringify({ point, radiusKm: 50, landing: '2027-01-01 through 2027-01-31 UTC',
    durationDays, scenarios: points.length * dates.length, terrainRequests, runs }, null, 2));
  if (terrainRequests) throw new Error('The south-pole grid unexpectedly used the terrain service.');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
