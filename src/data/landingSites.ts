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
  /** Sourced UTC surface-event time, to the precision reported by the source. */
  event_utc?: string;
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

/** Start a comparison at the recorded event, the reported date/window, or today's UTC date. */
export function landmarkStart(site: LandingSite, today: number): { ms: number; kind: 'recorded' | 'estimated' | 'today' } {
  const event = Date.parse(site.event_utc ?? '');
  if (Number.isFinite(event)) return { ms: event, kind: 'recorded' };
  const utcDay = Date.parse(new Date(today).toISOString().slice(0, 10));
  if (/^\d{4}-\d{2}-\d{2}$/.test(site.date)) return { ms: Date.parse(site.date), kind: 'estimated' };
  const year = /\b\d{4}\b/.exec(site.date);
  if (!year) return { ms: utcDay, kind: 'today' };
  const earliest = Date.UTC(Number(year[0]), 0, 1);
  if (/\bearly\b/i.test(site.date)) return { ms: Date.UTC(Number(year[0]), 1, 1), kind: 'estimated' };
  if (/\blate\b/i.test(site.date)) return { ms: Date.UTC(Number(year[0]), 10, 1), kind: 'estimated' };
  if (/no earlier than|at least/i.test(site.date)) return { ms: Math.max(utcDay, earliest), kind: 'estimated' };
  return { ms: Math.min(Math.max(utcDay, earliest), Date.UTC(Number(year[0]), 11, 31)), kind: 'estimated' };
}

/** One line for lists: "Apollo 11 — Tranquility Base · 1969". */
export const landmarkLabel = (site: LandingSite): string => `${site.name} · ${landmarkYear(site)}`;

/** Honest wording for what the coordinates mean: a feature centre is not a landing target. */
export const landmarkBasis = (site: LandingSite): string =>
  site.coord_basis === 'region/feature centre' ? 'Feature centre (not a landing target)' : site.coord_basis[0].toUpperCase() + site.coord_basis.slice(1);
