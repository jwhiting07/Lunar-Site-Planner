import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landmarkBasis, landmarkLabel, landmarkTone, LANDMARK_GROUPS, type LandingSitesDoc } from './landingSites';

const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8')) as T;
const catalogue = read<LandingSitesDoc>('landing_sites.json');
const references = new Set(read<{ references: { id: string }[] }>('provenance.json').references.map(r => r.id));

describe('landing-site catalogue', () => {
  it('has unique ids, in-range coordinates and only known references', () => {
    expect(catalogue.sites.length).toBeGreaterThan(60);
    expect(new Set(catalogue.sites.map(s => s.id)).size).toBe(catalogue.sites.length);
    for (const s of catalogue.sites) {
      expect(s.lat_deg, s.id).toBeGreaterThanOrEqual(-90);
      expect(s.lat_deg, s.id).toBeLessThanOrEqual(90);
      expect(s.lon_deg, s.id).toBeGreaterThan(-180);
      expect(s.lon_deg, s.id).toBeLessThanOrEqual(180);
      expect(s.precision_deg, s.id).toBeGreaterThan(0);
      expect(s.source_refs.length, s.id).toBeGreaterThan(0);
      for (const ref of s.source_refs) expect(references.has(ref), `${s.id} cites ${ref}`).toBe(true);
    }
  });

  it('lists every site in exactly one picker group', () => {
    for (const s of catalogue.sites) expect(LANDMARK_GROUPS.filter(g => g.match(s)).length, s.id).toBe(1);
  });

  it('keeps the well-known Apollo 11 position and labels feature centres honestly', () => {
    const apollo = catalogue.sites.find(s => s.id === 'apollo-11')!;
    expect([apollo.lat_deg, apollo.lon_deg]).toEqual([0.67416, 23.47314]);
    expect(landmarkTone(apollo)).toBe('landed');
    expect(landmarkLabel(apollo)).toBe('Apollo 11 — Tranquility Base · 1969');
    const centre = catalogue.sites.find(s => s.coord_basis === 'region/feature centre')!;
    expect(landmarkBasis(centre)).toMatch(/not a landing target/);
    expect(landmarkTone(catalogue.sites.find(s => s.category === 'planned')!)).toBe('planned');
  });
});
