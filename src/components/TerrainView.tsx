import { useMemo } from 'react';
import { MoonView } from './MoonView';
import type { InstantState, SiteDoc } from '../science';

/** Inspect the continuous NASA Moon model with navigation anchored to this site. */
export function TerrainView({ site, inst }: { site: SiteDoc; inst: InstantState | null }) {
  const sites = useMemo(() => [site], [site]);
  return <MoonView sites={sites} primaryId={site.id} onSelect={() => {}} local inst={inst} />;
}
