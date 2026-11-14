// node scripts/prepare_stars.mjs — retain bright catalog stars, without a raster sky.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const url = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz';
const cache = new URL('../data_cache/heasarc_bsc5p.tdat.gz', import.meta.url);
let compressed;
try { compressed = await readFile(cache); }
catch {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Star catalog download failed: ${response.status}`);
  compressed = Buffer.from(await response.arrayBuffer());
  await mkdir(new URL('../data_cache/', import.meta.url), { recursive: true });
  await writeFile(cache, compressed);
}
const source = gunzipSync(compressed).toString('utf8');
const fields = source.match(/^line\[1\] = (.+)$/m)[1].trim().split(/\s+/);
const at = name => fields.indexOf(name);
// Catalog records assigned to non-stellar objects, documented by NASA HEASARC.
const nonstellar = new Set([92, 95, 182, 1057, 1841, 2472, 2496, 3515, 3671, 6309, 6515, 7189, 7539, 8296]);
const stars = source.split('<DATA>')[1].split('</DATA>')[0].trim().split(/\r?\n/).flatMap(line => {
  const row = line.split('|');
  const values = ['ra', 'dec', 'vmag'].map(name => row[at(name)]?.trim());
  if (values.some(value => !value)) return [];
  const [ra, dec, magnitude] = values.map(Number);
  if (![ra, dec, magnitude].every(Number.isFinite) || magnitude > 5.8 || nonstellar.has(Number(row[at('hr')]))) return [];
  return [[ra, dec, magnitude]];
});
const output = JSON.stringify({ schema: 1, columns: ['ra_deg', 'dec_deg', 'magnitude'], stars }) + '\n';
await writeFile(new URL('../public/data/stars.json', import.meta.url), output);
await writeFile(new URL('../public/data/stars.provenance.json', import.meta.url), JSON.stringify({
  source: url,
  documentation: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html',
  credit: 'Yale Bright Star Catalog, 5th Revised Edition (Preliminary), Hoffleit and Warren (1991); hosted by NASA/GSFC HEASARC',
  source_sha256: createHash('sha256').update(compressed).digest('hex'),
  product_sha256: createHash('sha256').update(output).digest('hex'),
  selection: 'J2000 RA/Dec and magnitude; magnitude <= 5.8; non-stellar catalog entries and missing values excluded',
  count: stars.length,
  display: 'Small antialiased points in device pixels, dimmed with compressed magnitude contrast; no glow, texture enlargement or animation',
  purpose: 'Contextual background only; no lunar epoch alignment, proper-motion update or input to planning calculations',
  reproduce: 'node scripts/prepare_stars.mjs',
}, null, 2) + '\n');
console.log(`Prepared ${stars.length} bright stars (${Buffer.byteLength(output)} bytes).`);
