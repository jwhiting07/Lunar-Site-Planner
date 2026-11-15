/** Catalogue of past and planned lunar landing and impact sites (public/data/landing_sites.json). */
export interface LandingSite {
  id: string;
  name: string;
  mission: string;
  program: string;
  agency: string;
  country: string;
  category: 'crewed' | 'lander' | 'rover' | 'sample-return' | 'impact' | 'planned';
  status: 'landed' | 'impact' | 'crashed' | 'planned' | 'candidate-region';
  date: string;
  lat_deg: number;
  lon_deg: number;
  coord_basis: string;
  coord_note: string;
  precision_deg: number;
  source_refs: string[];
}

export interface LandingSitesDoc {
  schema: number;
  description: string;
  frame: string;
  coord_basis_note: string;
  sites: LandingSite[];
  unlocated: { name: string; reason: string; list: string }[];
}

export type LandmarkTone = 'landed' | 'impact' | 'planned';

export const landmarkTone = (site: LandingSite): LandmarkTone =>
  site.category === 'planned' ? 'planned' : site.category === 'impact' ? 'impact' : 'landed';

export const LANDMARK_GROUPS: { label: string; match: (site: LandingSite) => boolean }[] = [
  { label: 'Crewed landings', match: site => site.category === 'crewed' },
  { label: 'Robotic landers and rovers', match: site => ['lander', 'rover', 'sample-return'].includes(site.category) },
  { label: 'Impacts and crashes', match: site => site.category === 'impact' },
  { label: 'Planned and candidate sites', match: site => site.category === 'planned' },
];

/** Catalogue dates are ISO days for past missions and free text ("late 2026") for planned ones. */
export const landmarkYear = (site: LandingSite): string => /^\d{4}/.exec(site.date)?.[0] ?? site.date;

/** One line for lists: "Apollo 11 — Tranquility Base · 1969". */
export const landmarkLabel = (site: LandingSite): string => `${site.name} · ${landmarkYear(site)}`;

/** Honest wording for what the coordinates mean: a feature centre is not a landing target. */
export const landmarkBasis = (site: LandingSite): string =>
  site.coord_basis === 'region/feature centre' ? 'Feature centre (not a landing target)' : site.coord_basis[0].toUpperCase() + site.coord_basis.slice(1);
